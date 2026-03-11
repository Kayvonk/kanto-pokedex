import json
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory, request
from google import genai
from google.genai import types

load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")

PORT = 3000

# Load pokemon.json at startup for appearance data and API fallback
_POKEMON_FILE = os.path.join(os.path.dirname(__file__), "pokemon.json")
try:
    with open(_POKEMON_FILE, encoding="utf-8") as _f:
        _pokemon_list = json.load(_f)
    _POKEMON_BY_NAME = {p["name"]: p for p in _pokemon_list}
    _POKEMON_BY_ID = {p["id"]: p for p in _pokemon_list}
except Exception:
    _POKEMON_BY_NAME = {}
    _POKEMON_BY_ID = {}


def _json_lookup(identifier):
    """Return a Pokemon entry from the local JSON by name, numeric ID, or word-based match."""
    try:
        return _POKEMON_BY_ID.get(int(identifier))
    except (ValueError, TypeError):
        pass
    exact = _POKEMON_BY_NAME.get(str(identifier))
    if exact:
        return exact
    # Word-based fallback: all words must appear as hyphen-separated parts of the name
    words = identifier.lower().split()
    if words:
        matches = [p for p in _pokemon_list if all(w in p["name"].split("-") for w in words)]
        if len(matches) == 1:
            return matches[0]
    # Display name fallback: case-insensitive match against display_name (e.g. "Galarian Ponyta")
    identifier_lower = identifier.lower()
    display_matches = [p for p in _pokemon_list if p.get("display_name", "").lower() == identifier_lower]
    if len(display_matches) == 1:
        return display_matches[0]
    return None


def build_pokemon_data(pokemon, species_data, lang="en"):
    flavor_entry = next(
        (e for e in species_data["flavor_text_entries"] if e["language"]["name"] == lang),
        None,
    )
    if not flavor_entry and lang != "en":
        # Check pre-translated descriptions in the local JSON cache
        cached = _POKEMON_BY_NAME.get(pokemon["name"], {})
        pre_translated = cached.get("descriptions", {}).get(lang)
        if pre_translated:
            description = pre_translated
        else:
            flavor_entry = next(
                (e for e in species_data["flavor_text_entries"] if e["language"]["name"] == "en"),
                None,
            )
            description = (
                re.sub(r"[\n\f]", " ", flavor_entry["flavor_text"])
                if flavor_entry
                else "No description available"
            )
    elif not flavor_entry:
        description = "No description available"
    else:
        description = re.sub(r"[\n\f]", " ", flavor_entry["flavor_text"])
    name_entry = next(
        (e for e in species_data.get("names", []) if e["language"]["name"] == lang),
        None,
    )
    if not name_entry:
        name_entry = next(
            (e for e in species_data.get("names", []) if e["language"]["name"] == "en"),
            None,
        )
    display_name = (
        name_entry["name"] if name_entry else pokemon["name"].replace("-", " ").title()
    )
    # For alternate forms, species names give the base species (e.g. "Absol" for absol-mega-z).
    # Use the JSON cache display_name when it's more specific than the base species name.
    cached_entry = _POKEMON_BY_NAME.get(pokemon["name"], {})
    cached_display = cached_entry.get("display_name", "")
    species_en_name = next(
        (e["name"] for e in species_data.get("names", []) if e["language"]["name"] == "en"), ""
    )
    if cached_display and cached_display != species_en_name:
        localized_display = cached_entry.get("display_names", {}).get(lang)
        display_name = localized_display or cached_display
    official_artwork = ((pokemon["sprites"].get("other") or {}).get("official-artwork") or {})
    return {
        "id": pokemon["id"],
        "species_id": species_data["id"],
        "name": pokemon["name"],
        "display_name": display_name,
        "description": description,
        "sprites": {
            "front_default": pokemon["sprites"].get("front_default"),
            "official": {
                "default": official_artwork.get("front_default"),
                "shiny": official_artwork.get("front_shiny"),
            },
        },
        "stats": {
            "hp": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "hp"), None),
            "attack": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "attack"), None),
            "defense": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "defense"), None),
            "specialAttack": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "special-attack"), None),
            "specialDefense": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "special-defense"), None),
            "speed": next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == "speed"), None),
        },
        "types": [t["type"]["name"] for t in pokemon["types"]],
        "height": pokemon["height"],
        "weight": pokemon["weight"],
        "cry": pokemon.get("cries", {}).get("latest"),
    }


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.get("/pokemon-ids")
def pokemon_ids():
    base_ids = sorted(
        p["id"] for p in _pokemon_list
        if p.get("species_id", p["id"]) == p["id"] and p["id"] < 10000
    )
    return jsonify(base_ids)


@app.get("/search")
def search_pokemon():
    query = request.args.get("q", "").strip().lower()
    lang = request.args.get("lang", "en")
    if not query:
        return jsonify([])
    if query.isdigit():
        species_id = int(query)
        results = [p for p in _pokemon_list if p.get("species_id", p["id"]) == species_id]
        return jsonify([{
            "id": p["id"],
            "species_id": p.get("species_id", p["id"]),
            "name": p["name"],
            "display_name": p.get("display_names", {}).get(lang) or p.get("display_name", p["name"]),
            "sprites": p.get("sprites", {}),
            "types": p.get("types", []),
        } for p in results])
    words = query.split()
    results = []
    for p in _pokemon_list:
        name = p.get("name", "")
        display = p.get("display_name", "").lower()
        localized = p.get("display_names", {}).get(lang, "").lower()
        if (
            all(w in name.split("-") for w in words)
            or all(w in display for w in words)
            or (localized and all(w in localized for w in words))
        ):
            results.append({
                "id": p["id"],
                "species_id": p.get("species_id", p["id"]),
                "name": p["name"],
                "display_name": p.get("display_names", {}).get(lang) or p.get("display_name", p["name"]),
                "sprites": p.get("sprites", {}),
                "types": p.get("types", []),
            })
    return jsonify(results)


@app.get("/pokemon/<identifier>")
def get_pokemon(identifier):
    identifier = identifier.lower()
    try:
        response = requests.get(f"https://pokeapi.co/api/v2/pokemon/{identifier}")
        if not response.ok:
            entry = _json_lookup(identifier)
            if entry:
                return jsonify(entry)
            return jsonify({"error": "Pokémon not found"}), 404

        pokemon = response.json()

        species_res = requests.get(pokemon["species"]["url"])
        species_data = species_res.json()

        lang = request.args.get("lang", "en")
        return jsonify(build_pokemon_data(pokemon, species_data, lang))
    except requests.RequestException as e:
        print(f"Request error: {e}")
        entry = _json_lookup(identifier)
        if entry:
            print(f"Using JSON fallback for {identifier}")
            return jsonify(entry)
        return jsonify({"error": "Failed to fetch Pokémon"}), 500


def _gemini_call(client, contents, max_tokens=64):
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=contents,
        config=types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            thinking_config=types.ThinkingConfig(thinking_budget=0),
        ),
    )
    return (response.text or "").strip().lower()


def _sanitize_slug(raw):
    return re.sub(r"[^a-z0-9\-]", "", raw.replace(" ", "-").replace(".", "").replace("'", ""))


@app.post("/detect-pokemon")
def detect_pokemon():
    if "image" not in request.files:
        return jsonify({"error": "Missing image"}), 400

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return jsonify({"error": "GOOGLE_API_KEY not configured"}), 500

    image_bytes = request.files["image"].read()
    image_part = types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg")
    client = genai.Client(api_key=api_key)

    # --- Pass 1: initial identification ---
    pass1_prompt = (
        "You are a Pokemon identification expert with perfect visual acuity. "
        "Examine colors and their exact positions carefully before answering. "
        "If you can see a Pokemon in this image (card, screen, toy, drawing, or real-world depiction), "
        "respond with ONLY its PokeAPI slug (lowercase, hyphenated). "
        "Pay close attention to color orientation: a sphere with RED on top and WHITE on bottom is voltorb; "
        "a sphere with WHITE on top and RED on bottom is electrode. "
        "Other examples: pikachu, bulbasaur, mr-mime, ho-oh, porygon-z. "
        "If no Pokemon is visible, respond with exactly: none. "
        "No other text."
    )
    try:
        guess = _gemini_call(client, [image_part, pass1_prompt])
    except Exception as e:
        print(f"Gemini pass 1 error: {e}")
        msg = str(e)
        if "RESOURCE_EXHAUSTED" in msg or "quota" in msg.lower():
            return jsonify({"error": "API quota exceeded — enable billing at console.cloud.google.com"}), 502
        return jsonify({"error": f"Vision API error: {msg[:120]}"}), 502

    if not guess or guess == "none":
        return jsonify({"error": "No Pokemon detected"}), 404

    slug = _sanitize_slug(guess)

    # --- Pass 2: verify by comparing against ID-adjacent candidates ---
    guessed_entry = _POKEMON_BY_NAME.get(slug)
    if guessed_entry:
        candidates = {}
        for candidate_id in [guessed_entry["id"] - 1, guessed_entry["id"], guessed_entry["id"] + 1]:
            p = _POKEMON_BY_ID.get(candidate_id)
            if p and p.get("appearance"):
                candidates[p["name"]] = p["appearance"]

        if len(candidates) > 1:
            descriptions = "\n".join(f"- {name}: {desc}" for name, desc in candidates.items())
            verify_prompt = (
                "You are a Pokemon identification expert. "
                "Match the Pokemon in this image to exactly one of the following descriptions:\n"
                f"{descriptions}\n"
                "Reply with ONLY the slug name (lowercase, hyphenated) of the best match. No other text."
            )
            try:
                verify_ans = _gemini_call(client, [image_part, verify_prompt])
                verified = _sanitize_slug(verify_ans)
                # 1. Exact match on sanitized slug
                if verified in candidates:
                    print(f"Detection: pass1={slug}, pass2={verified}")
                    slug = verified
                else:
                    # 2. Candidate name found anywhere in raw response (handles preamble)
                    mentioned = [name for name in candidates if name in verify_ans]
                    if len(mentioned) == 1:
                        print(f"Detection: pass1={slug}, pass2={mentioned[0]} (found in response '{verify_ans[:40]}')")
                        slug = mentioned[0]
                    else:
                        # 3. Prefix match on sanitized slug (handles truncated responses)
                        prefix_matches = [name for name in candidates if name.startswith(verified) or verified.startswith(name)]
                        if len(prefix_matches) == 1:
                            print(f"Detection: pass1={slug}, pass2={prefix_matches[0]} (prefix '{verified}')")
                            slug = prefix_matches[0]
                        else:
                            print(f"Detection pass2 inconclusive ('{verify_ans[:40]}'), keeping pass1={slug}")
            except Exception as e:
                print(f"Gemini pass 2 error (using pass 1 result): {e}")

    # --- Look up numeric ID via PokeAPI, fall back to JSON ---
    try:
        poke_res = requests.get(f"https://pokeapi.co/api/v2/pokemon/{slug}", timeout=5)
        if poke_res.ok:
            return jsonify({"pokemon": poke_res.json()["id"]})
    except requests.RequestException:
        pass

    entry = _POKEMON_BY_NAME.get(slug)
    if entry:
        return jsonify({"pokemon": entry["id"]})

    return jsonify({"error": f"Could not find '{slug}' in Pokedex"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    app.run(host="0.0.0.0", port=port, debug=False)
