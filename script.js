let currentId = null;
let speechVolume = 1;
let selectedVoice = null;

function populateVoices() {
  const voices = window.speechSynthesis.getVoices();
  const select = document.getElementById("voiceSelect");
  select.innerHTML = "";
  voices.forEach((voice, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${voice.name} (${voice.lang})`;
    select.appendChild(option);
  });
  selectedVoice = voices[0] ?? null;
}

populateVoices();
window.speechSynthesis.addEventListener("voiceschanged", populateVoices);

document.getElementById("voiceSelect").addEventListener("change", (e) => {
  selectedVoice = window.speechSynthesis.getVoices()[e.target.value];
});
let volumeBarTimeout = null;

function showVolumeBar() {
  const bar = document.getElementById("volumeBar");
  const fill = document.getElementById("volumeBarFill");
  const icon = document.getElementById("volumeIcon");
  fill.style.width = (speechVolume * 100) + "%";
  icon.textContent = speechVolume === 0 ? "🔇" : "🔊";
  bar.classList.add("visible");
  clearTimeout(volumeBarTimeout);
  volumeBarTimeout = setTimeout(() => bar.classList.remove("visible"), 1500);
}

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
  document.getElementById("pokemonDescription").textContent = pokemon.description;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(pokemon.description);
  utterance.volume = speechVolume;
  if (selectedVoice) utterance.voice = selectedVoice;
  window.speechSynthesis.speak(utterance);
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

document.getElementById("volDownBtn").addEventListener("click", () => {
  speechVolume = Math.max(0, parseFloat((speechVolume - 0.2).toFixed(1)));
  showVolumeBar();
});

document.getElementById("volUpBtn").addEventListener("click", () => {
  speechVolume = Math.min(1, parseFloat((speechVolume + 0.2).toFixed(1)));
  showVolumeBar();
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
