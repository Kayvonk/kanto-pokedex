"""
Fetches any Pokemon from PokeAPI that are missing from pokemon.json,
adds their full data, then generates appearance descriptions via Gemini.
Run: python scripts/update_pokemon.py  (from project root)
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

POKEMON_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "pokemon.json")
POKEAPI_LIST = "https://pokeapi.co/api/v2/pokemon?limit=10000"
MODEL_NAME = "gemini-2.5-flash"
# Batch size optimized for Gemini context limits (~8k tokens with ~3k for output)
BATCH_SIZE = 30
# Smaller batch for translations: 6 languages × ~150 chars × 10 entries fits within 32k output budget
TRANSLATE_BATCH_SIZE = 10
POKEAPI_TIMEOUT = 10
LANGS = ["fr", "de", "es", "it", "ja", "ko"]
LANG_NAMES = {"fr": "French", "de": "German", "es": "Spanish", "it": "Italian", "ja": "Japanese", "ko": "Korean"}


def _strip_markdown_fences(text: str) -> str:
    """Remove markdown code fences Gemini sometimes wraps JSON responses in."""
    text = re.sub(r"^```(?:json)?\s*", "", text.strip())
    return re.sub(r"\s*```$", "", text)


def _stat(pokemon, stat_name):
    return next((s["base_stat"] for s in pokemon["stats"] if s["stat"]["name"] == stat_name), None)


def load_data():
    with open(POKEMON_FILE, encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    with open(POKEMON_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


_REGION_SUFFIXES = {
    "galar": "Galarian", "alola": "Alolan", "hisui": "Hisuian", "paldea": "Paldean",
}
FORM_SUFFIXES = ["-galar", "-alola", "-hisui", "-paldea"]


def _fetch_base_species_name(name):
    """For regional forms, fetch the proper English species name (e.g. 'Mr. Mime' for mr-mime-galar)."""
    for suffix in FORM_SUFFIXES:
        if name.endswith(suffix):
            base_slug = name[:-len(suffix)]
            try:
                poke_res = requests.get(f"https://pokeapi.co/api/v2/pokemon/{base_slug}", timeout=POKEAPI_TIMEOUT)
                if poke_res.ok:
                    sp_res = requests.get(poke_res.json()["species"]["url"], timeout=POKEAPI_TIMEOUT)
                    if sp_res.ok:
                        return next(
                            (n["name"] for n in sp_res.json().get("names", []) if n["language"]["name"] == "en"),
                            None,
                        )
            except Exception:
                pass
    return None


def get_display_name(name, base_species_name=None):
    base_name = base_species_name or name.split("-")[0].title()
    try:
        form_res = requests.get(f"https://pokeapi.co/api/v2/pokemon-form/{name}", timeout=POKEAPI_TIMEOUT)
        if form_res.ok:
            form_data = form_res.json()
            en_name = next(
                (fn["name"] for fn in form_data.get("form_names", []) if fn["language"]["name"] == "en"),
                None,
            )
            if en_name:
                if en_name.endswith(" Form"):
                    # "Galarian Form" → "Galarian Ponyta", "Gigantamax Form" → "Gigantamax Pikachu"
                    # [:-4] strips "Form" keeping the trailing space: "Galarian " + "Ponyta"
                    if base_species_name is None:
                        base_name = _fetch_base_species_name(name) or base_name
                    return en_name[:-4] + base_name
                elif base_name.lower() not in en_name.lower():
                    # "Original Cap" → "Pikachu Original Cap"
                    return f"{base_name} {en_name}"
                return en_name
    except Exception:
        pass
    parts = name.replace("-", " ").title().split()
    # Handle regional suffix in slug fallback: "Ponyta Galar" → "Galarian Ponyta"
    for suffix, prefix in _REGION_SUFFIXES.items():
        if suffix.title() in parts:
            parts.remove(suffix.title())
            parts.insert(0, prefix)
            break
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
    descriptions = {}
    for lang_code in LANGS:
        entry = next(
            (e for e in species_data["flavor_text_entries"] if e["language"]["name"] == lang_code),
            None,
        )
        if entry:
            descriptions[lang_code] = re.sub(r"[\n\f]", " ", entry["flavor_text"])
    en_species_name = next(
        (n["name"] for n in species_data.get("names", []) if n["language"]["name"] == "en"),
        None,
    )
    official_artwork = ((pokemon["sprites"].get("other") or {}).get("official-artwork") or {})
    front_default = pokemon["sprites"].get("front_default")
    front_female  = pokemon["sprites"].get("front_female")
    if front_female and not pokemon["name"].endswith("-male"):
        front_default = front_female
    front_shiny_female = pokemon["sprites"].get("front_shiny_female")
    front_shiny = (
        front_shiny_female
        if front_shiny_female and not pokemon["name"].endswith("-male")
        else None
    )
    return {
        "id": pokemon["id"],
        "species_id": species_data["id"],
        "name": pokemon["name"],
        "display_name": get_display_name(pokemon["name"], base_species_name=en_species_name),
        "description": description,
        "descriptions": descriptions,
        "sprites": {
            "front_default": front_default,
            "front_shiny": front_shiny,
            "official": {
                "default": official_artwork.get("front_default"),
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


def fetch_new_entries(existing_names):
    print("Fetching Pokemon list from PokeAPI...")
    res = requests.get(POKEAPI_LIST, timeout=30)
    res.raise_for_status()
    all_pokemon = res.json()["results"]

    new_entries = [p for p in all_pokemon if p["name"] not in existing_names]
    print(f"Found {len(new_entries)} new Pokemon (have {len(existing_names)} already)")

    entries = []
    with requests.Session() as session:
        for i, p in enumerate(new_entries, 1):
            print(f"  Fetching {p['name']} ({i}/{len(new_entries)})...")
            try:
                poke_res = session.get(p["url"], timeout=POKEAPI_TIMEOUT)
                poke_res.raise_for_status()
                pokemon = poke_res.json()

                species_res = session.get(pokemon["species"]["url"], timeout=POKEAPI_TIMEOUT)
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
                model=MODEL_NAME,
                contents=[prompt],
                config=types.GenerateContentConfig(max_output_tokens=8192),
            )
            raw = _strip_markdown_fences(response.text)
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


def translate_missing(client, entries):
    # Find entries that are missing one or more language translations
    to_translate = [
        e for e in entries
        if any(lang not in e.get("descriptions", {}) for lang in LANGS)
        and e.get("description") and e["description"] != "No description available"
    ]
    if not to_translate:
        print("\nAll descriptions already translated.")
        return
    print(f"\nTranslating descriptions for {len(to_translate)} Pokemon...")

    name_to_idx = {e["name"]: i for i, e in enumerate(entries)}
    batches = [to_translate[i:i + TRANSLATE_BATCH_SIZE] for i in range(0, len(to_translate), TRANSLATE_BATCH_SIZE)]

    for batch_num, batch in enumerate(batches, 1):
        print(f"  Batch {batch_num}/{len(batches)}: {batch[0]['name']} ... {batch[-1]['name']}")

        # Build a list of {name, missing_langs, english_text} for this batch
        items = []
        for e in batch:
            existing = e.get("descriptions", {})
            missing_langs = [l for l in LANGS if l not in existing]
            items.append({"name": e["name"], "missing": missing_langs, "en": e["description"]})

        entries_text = "\n".join(
            f'- {it["name"]}: translate into {", ".join(LANG_NAMES[l] for l in it["missing"])}\n  English: {it["en"]}'
            for it in items
        )
        prompt = (
            "You are a Pokemon Pokedex translator. For each Pokemon below, translate its English Pokedex entry "
            "into the specified languages. Keep the same factual, concise Pokedex tone.\n\n"
            "Return ONLY a JSON object structured as:\n"
            '{"pokemon-name": {"lang_code": "translated text", ...}, ...}\n'
            "No markdown, no extra text. Lang codes: fr=French, de=German, es=Spanish, it=Italian, ja=Japanese, ko=Korean\n\n"
            f"{entries_text}"
        )

        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[prompt],
                config=types.GenerateContentConfig(max_output_tokens=32768),
            )
            raw = _strip_markdown_fences(response.text)
            translations = json.loads(raw)

            updated = 0
            for name, lang_map in translations.items():
                if name in name_to_idx:
                    entry = entries[name_to_idx[name]]
                    if "descriptions" not in entry:
                        entry["descriptions"] = {}
                    for lang_code, text in lang_map.items():
                        if lang_code in LANGS and lang_code not in entry["descriptions"]:
                            entry["descriptions"][lang_code] = text
                            updated += 1
            print(f"    -> {updated} translations added")
        except Exception as e:
            print(f"    ERROR: {e}")

        if batch_num < len(batches):
            time.sleep(1)


def translate_display_names(client, entries):
    """Translate display_name for alternate forms (name contains '-') into all LANGS."""
    to_translate = [
        e for e in entries
        if "-" in e["name"]
        and e.get("display_name")
        and any(lang not in e.get("display_names", {}) for lang in LANGS)
    ]
    if not to_translate:
        print("\nAll alternate form display_names already translated.")
        return

    print(f"\nTranslating display_names for {len(to_translate)} alternate forms...")
    name_to_idx = {e["name"]: i for i, e in enumerate(entries)}
    batches = [to_translate[i:i + TRANSLATE_BATCH_SIZE] for i in range(0, len(to_translate), TRANSLATE_BATCH_SIZE)]

    for batch_num, batch in enumerate(batches, 1):
        print(f"  Batch {batch_num}/{len(batches)}: {batch[0]['name']} ... {batch[-1]['name']}")

        items_text = "\n".join(
            f'- {e["name"]}: "{e["display_name"]}"'
            for e in batch
            if any(lang not in e.get("display_names", {}) for lang in LANGS)
        )
        prompt = (
            "You are a Pokemon translator. Translate each Pokemon form name below into French, German, Spanish, Italian, Japanese, and Korean. "
            "Keep proper nouns (Pokemon base names) phonetically accurate per each language's official localization. "
            'Return ONLY a JSON object: {"pokemon-name": {"fr": "...", "de": "...", "es": "...", "it": "...", "ja": "...", "ko": "..."}, ...}\n'
            "No markdown, no extra text.\n\n"
            f"{items_text}"
        )

        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[prompt],
                config=types.GenerateContentConfig(max_output_tokens=32768),
            )
            raw = _strip_markdown_fences(response.text)
            translations = json.loads(raw)

            updated = 0
            for name, lang_map in translations.items():
                if name in name_to_idx:
                    entry = entries[name_to_idx[name]]
                    if "display_names" not in entry:
                        entry["display_names"] = {}
                    for lang_code, text in lang_map.items():
                        if lang_code in LANGS and lang_code not in entry["display_names"]:
                            entry["display_names"][lang_code] = text
                            updated += 1
            print(f"    -> {updated} translations added")
        except Exception as e:
            print(f"    ERROR: {e}")

        if batch_num < len(batches):
            time.sleep(1)


def fix_display_names(data):
    """Re-generate display_names for all alternate form entries (any name with '-')."""
    to_fix = [p for p in data if "-" in p["name"]]
    if not to_fix:
        print("\nAll display_names look correct.")
        return 0
    print(f"\nRefreshing display_name for {len(to_fix)} alternate form entries...")
    for p in to_fix:
        p["display_name"] = get_display_name(p["name"])
    return len(to_fix)


def backfill_species_id(data):
    missing = [p for p in data if p.get("species_id") is None]
    if not missing:
        return 0
    print(f"\nBackfilling species_id for {len(missing)} Pokemon...")
    updated = 0
    with requests.Session() as session:
        for p in missing:
            if p["id"] < 10000:
                p["species_id"] = p["id"]
                updated += 1
            else:
                try:
                    res = session.get(f"https://pokeapi.co/api/v2/pokemon/{p['name']}", timeout=POKEAPI_TIMEOUT)
                    if res.ok:
                        sp_url = res.json()["species"]["url"]
                        sp_res = session.get(sp_url, timeout=POKEAPI_TIMEOUT)
                        if sp_res.ok:
                            p["species_id"] = sp_res.json()["id"]
                            updated += 1
                except Exception as e:
                    print(f"    ERROR fetching species for {p['name']}: {e}")
    print(f"  -> {updated}/{len(missing)} species_ids set")
    return updated


def backfill_display_names(data):
    missing = [p for p in data if not p.get("display_name")]
    if not missing:
        return 0
    print(f"\nBackfilling display_name for {len(missing)} Pokemon...")
    for i, p in enumerate(missing, 1):
        print(f"  {i}/{len(missing)}: {p['name']}")
        p["display_name"] = get_display_name(p["name"])
    return len(missing)


def backfill_gender_sprites(data):
    """For entries without -male suffix, replace front_default with front_female if available."""
    to_check = [p for p in data if p["id"] < 10000 and not p["name"].endswith("-male")]
    updated = 0
    with requests.Session() as session:
        for p in to_check:
            try:
                # Fetch by numeric ID — some slugs (frillish, pyroar) return 404 by name in PokeAPI
                res = session.get(f"https://pokeapi.co/api/v2/pokemon/{p['id']}", timeout=POKEAPI_TIMEOUT)
                if not res.ok:
                    continue
                front_female = res.json().get("sprites", {}).get("front_female")
                if front_female and p.get("sprites", {}).get("front_default") != front_female:
                    p.setdefault("sprites", {})["front_default"] = front_female
                    updated += 1
            except Exception:
                pass
    if updated:
        print(f"  -> {updated} gender sprites updated")
    return updated


def backfill_shiny_gender_sprites(data):
    """For female-sprite entries missing front_shiny, derive it from front_default URL.

    The PokeAPI sprite repo uses a consistent path convention: the shiny female sprite
    lives at /pokemon/shiny/female/{id}.png whenever the regular female sprite lives at
    /pokemon/female/{id}.png. This works generically for any current or future Pokémon
    with gender-different sprites — no per-species hardcoding needed.
    """
    updated = 0
    for p in data:
        sprites = p.get("sprites", {})
        if sprites.get("front_shiny"):
            continue
        fd = sprites.get("front_default") or ""
        if "/pokemon/female/" in fd:
            sprites["front_shiny"] = fd.replace("/pokemon/female/", "/pokemon/shiny/female/")
            updated += 1
    if updated:
        print(f"  -> {updated} shiny gender sprites backfilled")
    return updated


def main():
    data = load_data()
    existing_names = {p["name"] for p in data}

    new_entries = fetch_new_entries(existing_names)

    missing_before = sum(1 for p in data if not p.get("appearance"))
    missing_display = sum(1 for p in data if not p.get("display_name"))
    missing_translations = sum(
        1 for p in data
        if any(lang not in p.get("descriptions", {}) for lang in LANGS)
    )

    api_key = os.environ.get("GOOGLE_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key)
        if new_entries:
            generate_appearances(client, new_entries, label="new")
        # Backfill any existing entries that are missing appearances
        generate_appearances(client, data, label="existing (backfill)")
        # Populate translated descriptions (PokeAPI where available, Gemini for gaps)
        translate_missing(client, data)
        if new_entries:
            translate_missing(client, new_entries)
        translate_display_names(client, data)
        if new_entries:
            translate_display_names(client, new_entries)
    else:
        print("GOOGLE_API_KEY not set — skipping appearance generation and translation.")

    backfill_species_id(data)
    backfill_display_names(data)
    fixed_display = fix_display_names(data)
    print("\nChecking gender sprites...")
    fixed_gender = backfill_gender_sprites(data)
    fixed_shiny_gender = backfill_shiny_gender_sprites(data)

    if new_entries:
        data.extend(new_entries)
        data.sort(key=lambda p: p["id"])

    if not new_entries and missing_before == 0 and missing_display == 0 and missing_translations == 0 and fixed_display == 0 and fixed_gender == 0 and fixed_shiny_gender == 0:
        print("pokemon.json is already up to date.")
        return

    save_data(data)
    if new_entries:
        print(f"\nDone. Added {len(new_entries)} new Pokemon. Total: {len(data)}")
    else:
        print(f"\nDone. Backfilled missing data. Total: {len(data)}")


if __name__ == "__main__":
    main()
