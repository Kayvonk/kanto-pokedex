let currentId = null;
let speechVolume = parseFloat(localStorage.getItem("speechVolume") ?? "0.3");
let selectedVoice = null;
let currentCryUrl = null;
let currentLang = "en";
let isShiny = false;
let currentSprites = null;

// Maps TTS BCP-47 prefix → PokeAPI language name
const ttsToPokeApiLang = {
  en: "en", fr: "fr", de: "de", es: "es", it: "it",
  ja: "ja", ko: "ko", zh: "zh-Hans"
};

const LANG_CONFIG = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "es-MX", label: "Spanish", fallback: v => v.lang.startsWith("es-") && v.lang !== "es-ES" },
  { code: "es-ES", label: "European Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "it-IT", label: "Italian" },
];

function populateVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const voiceSelect = document.getElementById("voiceSelect");
  const prevValue = voiceSelect.value;
  voiceSelect.innerHTML = "";

  LANG_CONFIG.forEach(({ code, label, fallback }) => {
    let matching = voices.filter(v => v.lang === code);
    if (!matching.length && fallback) matching = voices.filter(fallback);
    matching.forEach(voice => {
      const option = document.createElement("option");
      option.value = voices.indexOf(voice);
      option.textContent = matching.length > 1 ? `${label} - ${voice.name}` : label;
      voiceSelect.appendChild(option);
    });
  });

  if (prevValue && voiceSelect.querySelector(`option[value="${prevValue}"]`)) {
    voiceSelect.value = prevValue;
  } else {
    const savedName = localStorage.getItem("voiceName");
    const savedOption = savedName && Array.from(voiceSelect.options).find(opt => voices[opt.value]?.name === savedName);
    if (savedOption) {
      voiceSelect.value = savedOption.value;
    } else {
      const enGBOption = Array.from(voiceSelect.options).find(opt => voices[opt.value]?.lang === "en-GB");
      if (enGBOption) voiceSelect.value = enGBOption.value;
    }
  }
  selectedVoice = voices[voiceSelect.value] ?? voices[voiceSelect.options[0]?.value] ?? null;
  if (selectedVoice) {
    const prefix = selectedVoice.lang.split("-")[0];
    currentLang = ttsToPokeApiLang[prefix] || prefix;
  }
}

populateVoices();
window.speechSynthesis.addEventListener("voiceschanged", populateVoices);

document.getElementById("voiceSelect").addEventListener("change", (e) => {
  const voices = window.speechSynthesis.getVoices();
  selectedVoice = voices[e.target.value];
  if (selectedVoice) {
    localStorage.setItem("voiceName", selectedVoice.name);
    const prefix = selectedVoice.lang.split("-")[0];
    currentLang = ttsToPokeApiLang[prefix] || prefix;
    if (currentId) fetchPokemon(currentId);
  }
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
    const res = await fetch(`/pokemon/${identifier}?lang=${currentLang}`);
    if (!res.ok) throw new Error("Pokémon not found");
    const data = await res.json();
    displayPokemon(data);
  } catch (err) {
    alert(err.message);
  }
}

function displayPokemon(pokemon) {
  currentId = pokemon.id;
  isShiny = false;
  currentSprites = pokemon.sprites;
  document.getElementById("shinyBtn").querySelector("circle").setAttribute("fill", "#b71c1c");
  document.getElementById("screenText").style.display = "none";
  const img = document.getElementById("pokemonImage");
  img.src = pokemon.sprites?.official?.default || pokemon.sprites?.front_default || "";
  img.alt = pokemon.name;
  img.style.display = "block";
  document.getElementById("pokemonName").textContent = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);
  document.getElementById("pokemonDescription").textContent = pokemon.description;
  const camera = document.querySelector(".camera");
  camera.classList.remove("flash");
  window.speechSynthesis.cancel();

  let flashInterval = null;

  const doFlash = () => {
    camera.classList.remove("flash");
    camera.classList.add("flash");
    setTimeout(() => camera.classList.remove("flash"), 140);
  };

  const startFallbackInterval = () => {
    if (flashInterval) clearInterval(flashInterval);
    flashInterval = setInterval(doFlash, 350);
  };

  const stopFlash = () => {
    if (flashInterval) {
      clearInterval(flashInterval);
      flashInterval = null;
    }
    camera.classList.remove("flash");
  };

  const attachFlash = (utterance) => {
    utterance.onstart = startFallbackInterval;
    utterance.addEventListener("boundary", (event) => {
      if (event.name !== "word") return;
      doFlash();
      startFallbackInterval(); // reset interval so it stays in step with words
    });
  };

  const makeUtterance = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    u.volume = speechVolume;
    if (selectedVoice) u.voice = selectedVoice;
    return u;
  };

  const nameUtterance = makeUtterance(pokemon.name);
  attachFlash(nameUtterance);
  nameUtterance.onerror = stopFlash;
  nameUtterance.onend = () => {
    const descUtterance = makeUtterance(pokemon.description);
    attachFlash(descUtterance);
    descUtterance.onend = stopFlash;
    descUtterance.onerror = stopFlash;
    window.speechSynthesis.speak(descUtterance);
  };

  window.speechSynthesis.speak(nameUtterance);
  document.getElementById("pokemonId").textContent = `#${pokemon.id}`;
  document.getElementById("pokemonType").textContent = pokemon.types.join(", ");
  document.getElementById("pokemonHeight").textContent = `Height: ${(pokemon.height / 10).toFixed(1)} m`;
  document.getElementById("pokemonWeight").textContent = `Weight: ${(pokemon.weight / 10).toFixed(1)} kg`;
  currentCryUrl = pokemon.cry ?? null;
  document.getElementById("cryBtn").disabled = !currentCryUrl;
}

document.getElementById("shinyBtn").addEventListener("click", () => {
  if (!currentSprites) return;
  isShiny = !isShiny;
  const img = document.getElementById("pokemonImage");
  const btn = document.getElementById("shinyBtn").querySelector("circle");
  if (isShiny) {
    img.src = currentSprites.official?.shiny || currentSprites.front_default || "";
    btn.setAttribute("fill", "#f4c430");
  } else {
    img.src = currentSprites.official?.default || currentSprites.front_default || "";
    btn.setAttribute("fill", "#b71c1c");
  }
});

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

document.getElementById("cryBtn").addEventListener("click", () => {
  if (currentCryUrl) {
    const cry = new Audio(currentCryUrl);
    cry.volume = speechVolume * 0.5;
    cry.play();
  }
});

document.getElementById("volDownBtn").addEventListener("click", () => {
  speechVolume = Math.max(0, parseFloat((speechVolume - 0.05).toFixed(2)));
  localStorage.setItem("speechVolume", speechVolume);
  showVolumeBar();
});

document.getElementById("volUpBtn").addEventListener("click", () => {
  speechVolume = Math.min(1, parseFloat((speechVolume + 0.05).toFixed(2)));
  localStorage.setItem("speechVolume", speechVolume);
  showVolumeBar();
});

// prevBtn and nextBtn reserved for storage box navigation

document.getElementById("dpadLeft").addEventListener("click", () => {
  if (currentId && currentId > 1) fetchPokemon(currentId - 1);
});

document.getElementById("dpadRight").addEventListener("click", () => {
  if (currentId) fetchPokemon(currentId + 1);
  else fetchPokemon(1);
});

document.getElementById("dpadUp").addEventListener("click", () => {
  if (currentId && currentId > 10) fetchPokemon(currentId - 10);
  else if (currentId) fetchPokemon(1);
});

document.getElementById("dpadDown").addEventListener("click", () => {
  if (currentId) fetchPokemon(currentId + 10);
  else fetchPokemon(10);
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
