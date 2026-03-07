import re

import requests
from flask import Flask, jsonify, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")

PORT = 3000


def build_pokemon_data(pokemon, species_data):
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

        return jsonify(build_pokemon_data(pokemon, species_data))
    except requests.RequestException as e:
        print(f"Request error: {e}")
        return jsonify({"error": "Failed to fetch Pokémon"}), 500


if __name__ == "__main__":
    app.run(port=PORT, debug=True)
