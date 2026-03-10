"""
Fetches any Pokemon from PokeAPI that are missing from pokemon.json,
adds their full data, then generates appearance descriptions via Gemini.
Run: python update_pokemon.py
"""

import json
import os
import re
import time

import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

POKEMON_FILE = "pokemon.json"
POKEAPI_LIST = "https://pokeapi.co/api/v2/pokemon?limit=10000"
BATCH_SIZE = 30


def load_data():
    with open(POKEMON_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    with open(POKEMON_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_display_name(name):
    try:
        form_res = requests.get(f"https://pokeapi.co/api/v2/pokemon-form/{name}", timeout=10)
        if form_res.ok:
            form_data = form_res.json()
            en_name = next(
                (fn["name"] for fn in form_data.get("form_names", []) if fn["language"]["name"] == "en"),
                None,
            )
            if en_name:
                return en_name
    except Exception:
        pass
    parts = name.replace("-", " ").title().split()
    if "Mega" in parts and parts[0] != "Mega":
        parts.remove("Mega")
        parts.insert(0, "Mega")
    return " ".join(parts)


def build_entry(pokemon, species_data):
    flavor_entry = next(
        (e for e in species_data["flavor_text_entries"] if e["language"]["name"] == "en"),
        None,
    )
    description = (
        re.sub(r"[\n\f]", " ", flavor_entry["flavor_text"])
        if flavor_entry
        else "No description available"
    )
    return {
        "id": pokemon["id"],
        "name": pokemon["name"],
        "display_name": get_display_name(pokemon["name"]),
        "description": description,
        "sprites": {
            "front_default": pokemon["sprites"]["front_default"],
            "official": {
                "default": pokemon["sprites"]["other"]["official-artwork"]["front_default"],
                "shiny": pokemon["sprites"]["other"]["official-artwork"]["front_shiny"],
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


def fetch_new_entries(existing_names):
    print("Fetching Pokemon list from PokeAPI...")
    res = requests.get(POKEAPI_LIST, timeout=30)
    res.raise_for_status()
    all_pokemon = res.json()["results"]

    new_entries = [p for p in all_pokemon if p["name"] not in existing_names]
    print(f"Found {len(new_entries)} new Pokemon (have {len(existing_names)} already)")

    entries = []
    for i, p in enumerate(new_entries, 1):
        print(f"  Fetching {p['name']} ({i}/{len(new_entries)})...")
        try:
            poke_res = requests.get(p["url"], timeout=10)
            poke_res.raise_for_status()
            pokemon = poke_res.json()

            species_res = requests.get(pokemon["species"]["url"], timeout=10)
            species_res.raise_for_status()
            species_data = species_res.json()

            entries.append(build_entry(pokemon, species_data))
        except Exception as e:
            print(f"    ERROR fetching {p['name']}: {e}")

    return entries


def generate_appearances(client, entries, label="new"):
    missing = [e for e in entries if not e.get("appearance")]
    if not missing:
        return
    print(f"\nGenerating appearances for {len(missing)} {label} Pokemon...")

    name_to_idx = {e["name"]: i for i, e in enumerate(entries)}
    batches = [missing[i:i + BATCH_SIZE] for i in range(0, len(missing), BATCH_SIZE)]

    for batch_num, batch in enumerate(batches, 1):
        names = [e["name"] for e in batch]
        print(f"  Batch {batch_num}/{len(batches)}: {names[0]} ... {names[-1]}")

        names_list = "\n".join(f"- {n}" for n in names)
        prompt = (
            "You are a Pokemon visual database. For each Pokemon listed below, write a single sentence "
            "describing its VISUAL APPEARANCE only — focusing on body shape, color pattern, and key markings "
            "that would help distinguish it from similar Pokemon. Be precise about colors and placement. "
            "Include presence or absence of notable facial features like mouths, horns, or markings. "
            "Do NOT mention lore, abilities, or game stats.\n\n"
            "Return ONLY a JSON object where keys are the Pokemon names (lowercase, exactly as given) "
            "and values are the appearance strings. No markdown, no extra text.\n\n"
            f"Pokemon to describe:\n{names_list}"
        )

        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[prompt],
                config=types.GenerateContentConfig(max_output_tokens=8192),
            )
            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            appearances = json.loads(raw)

            updated = 0
            for name, desc in appearances.items():
                if name in name_to_idx:
                    entries[name_to_idx[name]]["appearance"] = desc
                    updated += 1
            # Any names Gemini didn't return get a fallback so they don't block future runs
            for name in names:
                if name in name_to_idx and not entries[name_to_idx[name]].get("appearance"):
                    entries[name_to_idx[name]]["appearance"] = f"Alternate form of {name.split('-')[0]}."
            print(f"    -> {updated}/{len(names)} updated")
        except Exception as e:
            print(f"    ERROR: {e}")
            for name in names:
                if name in name_to_idx and not entries[name_to_idx[name]].get("appearance"):
                    entries[name_to_idx[name]]["appearance"] = f"Alternate form of {name.split('-')[0]}."

        if batch_num < len(batches):
            time.sleep(1)


def backfill_display_names(data):
    missing = [p for p in data if not p.get("display_name")]
    if not missing:
        return 0
    print(f"\nBackfilling display_name for {len(missing)} Pokemon...")
    for i, p in enumerate(missing, 1):
        print(f"  {i}/{len(missing)}: {p['name']}")
        p["display_name"] = get_display_name(p["name"])
    return len(missing)


def main():
    data = load_data()
    existing_names = {p["name"] for p in data}

    new_entries = fetch_new_entries(existing_names)

    missing_before = sum(1 for p in data if not p.get("appearance"))
    missing_display = sum(1 for p in data if not p.get("display_name"))

    api_key = os.environ.get("GOOGLE_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key)
        if new_entries:
            generate_appearances(client, new_entries, label="new")
        # Backfill any existing entries that are missing appearances
        generate_appearances(client, data, label="existing (backfill)")
    else:
        print("GOOGLE_API_KEY not set — skipping appearance generation.")

    backfill_display_names(data)

    if new_entries:
        data.extend(new_entries)
        data.sort(key=lambda p: p["id"])

    if not new_entries and missing_before == 0 and missing_display == 0:
        print("pokemon.json is already up to date.")
        return

    save_data(data)
    if new_entries:
        print(f"\nDone. Added {len(new_entries)} new Pokemon. Total: {len(data)}")
    else:
        print(f"\nDone. Backfilled missing appearances. Total: {len(data)}")


if __name__ == "__main__":
    main()
