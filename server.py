import os
import re

import google.generativeai as genai
import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory, request

load_dotenv()

app = Flask(__name__, static_folder=".", static_url_path="")

PORT = 3000


def build_pokemon_data(pokemon, species_data, lang="en"):
    flavor_entry = next(
        (e for e in species_data["flavor_text_entries"] if e["language"]["name"] == lang),
        None,
    )
    if not flavor_entry:
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


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.get("/pokemon/<identifier>")
def get_pokemon(identifier):
    try:
        response = requests.get(f"https://pokeapi.co/api/v2/pokemon/{identifier.lower()}")
        if not response.ok:
            return jsonify({"error": "Pokémon not found"}), 404

        pokemon = response.json()

        species_res = requests.get(pokemon["species"]["url"])
        species_data = species_res.json()

        lang = request.args.get("lang", "en")
        return jsonify(build_pokemon_data(pokemon, species_data, lang))
    except requests.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({"error": "Failed to fetch Pokémon"}), 500


@app.post("/detect-pokemon")
def detect_pokemon():
    if "image" not in request.files:
        return jsonify({"error": "Missing image"}), 400

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return jsonify({"error": "GOOGLE_API_KEY not configured"}), 500

    image_bytes = request.files["image"].read()

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    prompt = (
        "You are a Pokemon identification expert. "
        "Examine this image carefully. "
        "If you can see a Pokemon (in any form: a physical card, a game screen, a toy, a drawing, or a real-world depiction), "
        "respond with ONLY the Pokemon's name as a single lowercase word or hyphenated slug exactly as used in the PokeAPI. "
        "Examples of valid responses: pikachu, bulbasaur, mr-mime, ho-oh, porygon-z, jangmo-o. "
        "If there is no Pokemon visible in the image, respond with exactly the word: none. "
        "Do not include any other text, punctuation, explanation, or newlines in your response."
    )

    try:
        response = model.generate_content(
            [{"mime_type": "image/jpeg", "data": image_bytes}, prompt],
            generation_config={"max_output_tokens": 32},
        )
    except Exception as e:
        print(f"Gemini API error: {e}")
        return jsonify({"error": "Vision API error"}), 502

    raw = response.text.strip().lower()
    slug = re.sub(r"[^a-z0-9\-]", "", raw)

    if not slug or slug == "none":
        return jsonify({"error": "No Pokemon detected"}), 404

    return jsonify({"pokemon": slug})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    app.run(host="0.0.0.0", port=port, debug=False)
