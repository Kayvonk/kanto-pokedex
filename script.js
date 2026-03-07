let currentId = null;

async function fetchPokemon(identifier) {
  try {
    const res = await fetch(`/pokemon/${identifier}`);
    if (!res.ok) throw new Error("Pokémon not found");
    const data = await res.json();
    displayPokemon(data);
  } catch (err) {
    alert(err.message);
  }
}

function displayPokemon(pokemon) {
  currentId = pokemon.id;
  document.getElementById("screenText").style.display = "none";
  const img = document.getElementById("pokemonImage");
  img.src = pokemon.sprites?.official?.default || pokemon.sprites?.front_default || "";
  img.alt = pokemon.name;
  img.style.display = "block";
  document.getElementById("pokemonName").textContent = pokemon.name;
  document.getElementById("pokemonId").textContent = `#${pokemon.id}`;
  document.getElementById("pokemonType").textContent = pokemon.types.join(", ");
  document.getElementById("pokemonHeight").textContent = pokemon.height;
  document.getElementById("pokemonWeight").textContent = pokemon.weight;
}

document.getElementById("searchBtn").addEventListener("click", () => {
  const val = document.getElementById("pokemonInput").value.trim().toLowerCase();
  if (val) fetchPokemon(val);
});

document.getElementById("pokemonInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const val = e.target.value.trim().toLowerCase();
    if (val) fetchPokemon(val);
  }
});

document.getElementById("prevBtn").addEventListener("click", () => {
  if (currentId && currentId > 1) fetchPokemon(currentId - 1);
});

document.getElementById("nextBtn").addEventListener("click", () => {
  if (currentId) fetchPokemon(currentId + 1);
});

// Mobile panel navigation
const pokedex = document.querySelector(".pokedex");

function isMobile() {
  return window.innerWidth <= 768;
}

document.querySelector(".nav-arrow-right").addEventListener("click", () => {
  if (isMobile()) pokedex.style.transform = "translateX(-50%)";
});

document.querySelector(".nav-arrow-left").addEventListener("click", () => {
  if (isMobile()) pokedex.style.transform = "translateX(0)";
});

window.addEventListener("resize", () => {
  if (!isMobile()) pokedex.style.transform = "";
});
