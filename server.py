import json
import logging
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory, request
from google import genai
from google.genai import types

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="static", static_url_path="/static")

PORT = 3000
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_MAX_TOKENS = 64
POKEAPI_TIMEOUT = 10
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

SUPPORTED_LANGS = {"en", "fr", "de", "es", "it", "ja", "ko", "zh-hans", "zh-hant"}

# Load pokemon.json at startup for appearance data and API fallback
_POKEMON_FILE = os.path.join(os.path.dirname(__file__), "data", "pokemon.json")
try:
    with open(_POKEMON_FILE, encoding="utf-8") as _f:
        _data = json.load(_f)
    _pokemon_list = _data
    _SPECIES_WITH_MALE_VARIANT = {p["id"] for p in _pokemon_list if p["name"].endswith("-male")}
    _male_base_names = {p["name"][:-5] for p in _pokemon_list if p["name"].endswith("-male")}
    _IMPLICIT_FEMALE_NAMES = {
        p["name"] for p in _pokemon_list
        if p["name"] in _male_base_names and not p["name"].endswith("-female")
    }
    _POKEMON_BY_NAME = {p["name"]: p for p in _pokemon_list}
    # Female (non-male) entries take priority for shared IDs in JSON fallback lookups
    _POKEMON_BY_ID = {}
    for _p in _pokemon_list:
        if _p["id"] not in _POKEMON_BY_ID or not _p["name"].endswith("-male"):
            _POKEMON_BY_ID[_p["id"]] = _p
except Exception as e:
    logger.error("Failed to load pokemon.json: %s", e)
    _POKEMON_BY_NAME = {}
    _POKEMON_BY_ID = {}
    _pokemon_list = []
    _SPECIES_WITH_MALE_VARIANT = set()
    _IMPLICIT_FEMALE_NAMES = set()


def _validate_lang(lang: str) -> str:
    return lang if lang in SUPPORTED_LANGS else "en"


def _stat(pokemon, stat_name):
    return next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == stat_name), None)


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
    if pokemon["name"] in _IMPLICIT_FEMALE_NAMES:
        display_name = display_name + " Female"

    official_artwork = ((pokemon["sprites"].get("other") or {}).get("official-artwork") or {})
    front_default = pokemon["sprites"].get("front_default")
    front_female  = pokemon["sprites"].get("front_female")
    if front_female and not pokemon["name"].endswith("-male"):
        front_default = front_female
    # For species where the base form IS the female (has a -male variant):
    # use female official artwork; front_default is already the female sprite.
    official_default = official_artwork.get("front_default")
    if pokemon["name"] in _IMPLICIT_FEMALE_NAMES:
        official_default = official_artwork.get("front_female") or official_artwork.get("front_default")
    return {
        "id": pokemon["id"],
        "species_id": species_data["id"],
        "name": pokemon["name"],
        "display_name": display_name,
        "description": description,
        "sprites": {
            "front_default": front_default,
            "official": {
                "default": official_default,
                "shiny": official_artwork.get("front_shiny"),
            },
        },
        "stats": {
            "hp": _stat(pokemon, "hp"),
            "attack": _stat(pokemon, "attack"),
            "defense": _stat(pokemon, "defense"),
            "specialAttack": _stat(pokemon, "special-attack"),
            "specialDefense": _stat(pokemon, "special-defense"),
            "speed": _stat(pokemon, "speed"),
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
    base_ids = sorted(set(
        p["id"] for p in _pokemon_list
        if p.get("species_id", p["id"]) == p["id"] and p["id"] < 10000
    ))
    return jsonify(base_ids)


@app.get("/pokedex-list")
def pokedex_list():
    lang = _validate_lang(request.args.get("lang", "en"))
    entries = []
    seen_ids = set()
    for p in sorted(_pokemon_list, key=lambda x: (x["id"], x["name"])):
        if p.get("species_id", p["id"]) != p["id"] or p["id"] >= 10000:
            continue
        # Male variants are accessible via search/ID — not shown in main list
        if p["name"].endswith("-male"):
            continue
        pid = p["id"]
        if pid in seen_ids:
            continue
        seen_ids.add(pid)
        sprites = p.get("sprites", {})
        display = p.get("display_names", {}).get(lang) or p.get("display_name", p["name"])
        display = _strip_gender(display)
        entries.append({
            "id": p["id"],
            "name": p["name"],
            "display_name": display,
            "sprites": sprites,
            "types": p.get("types", []),
        })
    return jsonify(entries)


@app.get("/search")
def search_pokemon():
    query = request.args.get("q", "").strip().lower()
    lang = _validate_lang(request.args.get("lang", "en"))
    if not query:
        return jsonify([])
    if query.isdigit():
        species_id = int(query)
        results = [p for p in _pokemon_list if p.get("species_id", p["id"]) == species_id]
        def _result_sprites(p):
            sprites = p.get("sprites", {})
            if p["id"] in _SPECIES_WITH_MALE_VARIANT and not p["name"].endswith("-male"):
                sprites = {**sprites, "official": {}}
            return sprites
        def _search_display(p):
            d = p.get("display_names", {}).get(lang) or p.get("display_name", p["name"])
            return d + " Female" if p["name"] in _IMPLICIT_FEMALE_NAMES else d
        return jsonify([{
            "id": p["id"],
            "species_id": p.get("species_id", p["id"]),
            "name": p["name"],
            "display_name": _search_display(p),
            "sprites": _result_sprites(p),
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
            sprites = p.get("sprites", {})
            if p["id"] in _SPECIES_WITH_MALE_VARIANT and not p["name"].endswith("-male"):
                sprites = {**sprites, "official": {}}
            d = p.get("display_names", {}).get(lang) or p.get("display_name", p["name"])
            if p["name"] in _IMPLICIT_FEMALE_NAMES:
                d = d + " Female"
            results.append({
                "id": p["id"],
                "species_id": p.get("species_id", p["id"]),
                "name": p["name"],
                "display_name": d,
                "sprites": sprites,
                "types": p.get("types", []),
            })
    return jsonify(results)


def _strip_gender(name):
    if name.endswith((" Male", " Female")):
        return name.rsplit(" ", 1)[0]
    return name


def _apply_neutral_gender(data):
    """Navigation mode (d-pad/list): strip gender from name; use male sprite for implicit females."""
    name = data.get("name", "")
    display = data.get("display_name", "")
    if not display.endswith((" Male", " Female")) and name not in _IMPLICIT_FEMALE_NAMES:
        return data
    neutral = _strip_gender(display)
    if name in _IMPLICIT_FEMALE_NAMES:
        male_name = name + "-male"
        male_sprites = _POKEMON_BY_NAME.get(male_name, {}).get("sprites", data.get("sprites", {}))
        return {**data, "display_name": neutral, "sprites": male_sprites}
    return {**data, "display_name": neutral}


def _json_entry_response(entry):
    """Return a JSON response for a local pokemon entry, applying any runtime display patches."""
    if entry["name"] in _IMPLICIT_FEMALE_NAMES:
        sprites = entry.get("sprites", {})
        entry = {
            **entry,
            "display_name": (entry.get("display_name") or entry["name"]) + " Female",
            # Keep front_default (it IS the female sprite); clear official.default since
            # the JSON stores male official art there and we have no female official art cached.
            "sprites": {**sprites, "official": {**sprites.get("official", {}), "default": None}},
        }
    return jsonify(entry)


@app.get("/pokemon/<identifier>")
def get_pokemon(identifier):
    identifier = identifier.lower()
    lang = _validate_lang(request.args.get("lang", "en"))
    is_navigation = identifier.isdigit()
    try:
        response = requests.get(
            f"https://pokeapi.co/api/v2/pokemon/{identifier}",
            timeout=POKEAPI_TIMEOUT,
        )
        if not response.ok:
            entry = _json_lookup(identifier)
            if entry:
                if is_navigation:
                    return jsonify(_apply_neutral_gender(dict(entry)))
                return _json_entry_response(entry)
            return jsonify({"error": "Pokémon not found"}), 404

        pokemon = response.json()
        species_res = requests.get(pokemon["species"]["url"], timeout=POKEAPI_TIMEOUT)
        species_data = species_res.json()

        result = build_pokemon_data(pokemon, species_data, lang)
        if is_navigation:
            result = _apply_neutral_gender(result)
        return jsonify(result)
    except requests.RequestException as e:
        logger.warning("Request error for %s: %s", identifier, e)
        entry = _json_lookup(identifier)
        if entry:
            logger.info("Using JSON fallback for %s", identifier)
            if is_navigation:
                return jsonify(_apply_neutral_gender(dict(entry)))
            return _json_entry_response(entry)
        return jsonify({"error": "Failed to fetch Pokémon"}), 500


def _gemini_call(client, contents, max_tokens=GEMINI_MAX_TOKENS):
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            # thinking_budget=0 prevents thinking tokens from consuming the output token budget,
            # which caused truncated responses in gemini-2.5-flash
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
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return jsonify({"error": "Image too large (max 5 MB)"}), 413

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
        logger.error("Gemini pass 1 error: %s", e)
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
                    logger.info("Detection: pass1=%s, pass2=%s", slug, verified)
                    slug = verified
                else:
                    # 2. Candidate name found anywhere in raw response (handles preamble)
                    mentioned = [name for name in candidates if name in verify_ans]
                    if len(mentioned) == 1:
                        logger.info("Detection: pass1=%s, pass2=%s (found in response '%s')", slug, mentioned[0], verify_ans[:40])
                        slug = mentioned[0]
                    else:
                        # 3. Prefix match on sanitized slug (handles truncated responses)
                        prefix_matches = [name for name in candidates if name.startswith(verified) or verified.startswith(name)]
                        if len(prefix_matches) == 1:
                            logger.info("Detection: pass1=%s, pass2=%s (prefix '%s')", slug, prefix_matches[0], verified)
                            slug = prefix_matches[0]
                        else:
                            logger.info("Detection pass2 inconclusive ('%s'), keeping pass1=%s", verify_ans[:40], slug)
            except Exception as e:
                logger.warning("Gemini pass 2 error (using pass 1 result): %s", e)

    # --- Look up numeric ID via PokeAPI, fall back to JSON ---
    try:
        poke_res = requests.get(f"https://pokeapi.co/api/v2/pokemon/{slug}", timeout=POKEAPI_TIMEOUT)
        if poke_res.ok:
            pdata = poke_res.json()
            species_url = (pdata.get("species") or {}).get("url", "")
            species_id = int(species_url.rstrip("/").split("/")[-1]) if species_url else pdata["id"]
            return jsonify({"pokemon": species_id, "species_id": species_id})
    except requests.RequestException:
        pass

    entry = _POKEMON_BY_NAME.get(slug)
    if entry:
        sid = entry.get("species_id", entry["id"])
        return jsonify({"pokemon": sid, "species_id": sid})

    return jsonify({"error": f"Could not find '{slug}' in Pokedex"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    app.run(host="0.0.0.0", port=port, debug=False)
