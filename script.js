let currentId = null;
let currentSpeciesId = null;
let _pokemonIds = [];
fetch("/pokemon-ids").then(r => r.json()).then(ids => { _pokemonIds = ids; });

function navigateById(delta) {
  const refId = currentSpeciesId || currentId;
  if (!refId) { fetchPokemonDirect(1); return; }
  const idx = _pokemonIds.indexOf(refId);
  if (idx === -1) { fetchPokemonDirect(refId + delta); return; }
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= _pokemonIds.length) return;
  const next = _pokemonIds[nextIdx];
  if (next !== undefined) fetchPokemonDirect(next);
}
let speechVolume = parseFloat(localStorage.getItem("speechVolume") ?? "0.3");
let currentVoice = null;
const isAndroid = /android/i.test(navigator.userAgent);
let currentCryUrl = null;
let currentLang = "en";
let isShiny = false;
let currentSprites = null;

// Storage / favourites
// Each of the 10 boxes holds an array of pokemon objects
const STORAGE_SIZE = 10;
let storage = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem("pokestorage_v2"));
    if (Array.isArray(saved) && saved.length === STORAGE_SIZE) return saved;
  } catch {}
  return Array.from({ length: STORAGE_SIZE }, () => []);
})();
let selectedBox = 0;      // which box is selected (0-9)
let boxCursor = 0;        // position within selectedBox's pokemon list
let boxEverSelected = false; // don't highlight until user has clicked a box

function saveStorage() {
  localStorage.setItem("pokestorage_v2", JSON.stringify(storage));
}

function updateStorageUI() {
  document.querySelectorAll(".storage-box").forEach((box, i) => {
    box.classList.toggle("occupied", storage[i].length > 0);
    box.classList.toggle("selected", boxEverSelected && i === selectedBox);
  });
}

function isInSelectedBox() {
  return currentId != null && storage[selectedBox].some(p => p.id === currentId);
}

function updateFavoriteBtn() {
  const btn = document.getElementById("favoriteBtn");
  btn.classList.toggle("favorited", isInSelectedBox());
}

function showBoxView(boxIndex) {
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "block";

  const box = storage[boxIndex];
  document.getElementById("boxViewTitle").textContent = `Box ${boxIndex + 1}`;
  document.getElementById("boxViewCount").textContent =
    box.length === 0 ? "empty" : `${box.length} Pokémon`;

  const list = document.getElementById("boxViewList");
  list.innerHTML = "";

  if (box.length === 0) {
    const empty = document.createElement("div");
    empty.className = "box-empty";
    empty.textContent = "No Pokémon stored here yet.";
    list.appendChild(empty);
    return;
  }

  box.forEach((pokemon, i) => {
    const entry = document.createElement("div");
    entry.className = "box-entry";

    const num = document.createElement("span");
    num.className = "box-entry-num";
    num.textContent = i + 1;

    const boxSrc = pokemon.sprites?.front_default || pokemon.sprites?.official?.default || "";
    let imgEl;
    if (boxSrc) {
      imgEl = document.createElement("img");
      imgEl.src = boxSrc;
      imgEl.alt = pokemon.name;
    } else {
      imgEl = document.createElement("div");
      imgEl.textContent = "N/A";
      imgEl.className = "image-placeholder image-placeholder--small";
    }

    const name = document.createElement("span");
    name.className = "box-entry-name";
    name.textContent = pokemon.display_name || pokemon.name;

    entry.append(num, imgEl, name);
    entry.addEventListener("click", () => {
      boxCursor = i;
      fetchPokemonDirect(pokemon.id);
    });
    list.appendChild(entry);
  });
}

function hiddenBoxView() {
  document.getElementById("pokemonView").style.display = "block";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
}

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

// Language-only dropdown used on Android (voice switching is unreliable there)
const LANG_DROPDOWN = [
  { label: "English",  bcp47: "en-US", pokeApi: "en" },
  { label: "French",   bcp47: "fr-FR", pokeApi: "fr" },
  { label: "German",   bcp47: "de-DE", pokeApi: "de" },
  { label: "Spanish",  bcp47: "es-ES", pokeApi: "es" },
  { label: "Italian",  bcp47: "it-IT", pokeApi: "it" },
  { label: "Japanese", bcp47: "ja-JP", pokeApi: "ja" },
  { label: "Korean",   bcp47: "ko-KR", pokeApi: "ko" },
];

function populateLangSelect() {
  const sel = document.getElementById("langSelect");
  LANG_DROPDOWN.forEach(({ label, bcp47, pokeApi }) => {
    const opt = document.createElement("option");
    opt.value = pokeApi;
    opt.dataset.bcp47 = bcp47;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  const saved = localStorage.getItem("currentLang");
  if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;
  currentLang = sel.value;
}

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
  currentVoice = voices[voiceSelect.value] ?? voices[voiceSelect.options[0]?.value] ?? null;
  if (currentVoice) {
    const prefix = currentVoice.lang.split("-")[0];
    currentLang = ttsToPokeApiLang[prefix] || prefix;
  }
}

// On Android voice switching is unreliable — show a language dropdown instead.
// On all other platforms, populate the voice dropdown and wire up async loading.
if (isAndroid) {
  document.getElementById("voiceSelect").style.display = "none";
  document.getElementById("langSelect").style.display = "";
  populateLangSelect();
} else {
  document.getElementById("langSelect").style.display = "none";
  populateVoices();
  window.speechSynthesis.addEventListener("voiceschanged", populateVoices);

  // Polling fallback: Android Chrome and iOS Safari often don't fire voiceschanged
  // reliably, or return empty from getVoices() until async loading completes.
  const _voicePoll = setInterval(() => {
    if (window.speechSynthesis.getVoices().length) {
      populateVoices();
      clearInterval(_voicePoll);
    }
  }, 250);
  setTimeout(() => clearInterval(_voicePoll), 10000); // stop polling after 10s

  // iOS Safari: voices are gated behind a user gesture. On first touch, nudge
  // the API and re-attempt population after a short delay.
  document.addEventListener("touchstart", () => {
    window.speechSynthesis.getVoices(); // triggers async load on iOS
    setTimeout(populateVoices, 100);
  }, { once: true });
}

document.getElementById("voiceSelect").addEventListener("change", (e) => {
  const voices = window.speechSynthesis.getVoices();
  currentVoice = voices[e.target.value];
  if (currentVoice) {
    localStorage.setItem("voiceName", currentVoice.name);
    const prefix = currentVoice.lang.split("-")[0];
    currentLang = ttsToPokeApiLang[prefix] || prefix;
    if (currentId) fetchPokemon(currentId);
  }
});

document.getElementById("langSelect").addEventListener("change", (e) => {
  currentLang = e.target.value;
  localStorage.setItem("currentLang", currentLang);
  if (currentId) fetchPokemon(currentId);
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
  const isNumeric = /^\d+$/.test(String(identifier));
  if (isNumeric) {
    await fetchPokemonDirect(identifier);
  } else {
    await searchAndDisplay(identifier);
  }
}

async function fetchPokemonDirect(identifier) {
  try {
    const res = await fetch(`/pokemon/${identifier}?lang=${currentLang}`);
    if (!res.ok) throw new Error("Pokémon not found");
    const data = await res.json();
    displayPokemon(data);
  } catch (err) {
    alert(err.message);
  }
}

async function searchAndDisplay(query) {
  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}&lang=${currentLang}`);
    const results = await res.json();
    if (results.length === 0) {
      alert("No Pokémon found.");
      return;
    }
    if (results.length === 1) {
      await fetchPokemonDirect(results[0].name);
      return;
    }
    showSearchView(results);
  } catch (err) {
    alert("Search failed.");
  }
}

function showSearchView(results) {
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "block";
  if (isMobile()) document.querySelector(".pokedex").style.transform = "translateX(-50%)";
  document.getElementById("searchViewCount").textContent = `${results.length} results`;

  const list = document.getElementById("searchViewList");
  list.innerHTML = "";
  results.forEach(pokemon => {
    const entry = document.createElement("div");
    entry.className = "box-entry";

    const idSpan = document.createElement("span");
    idSpan.className = "box-entry-num";
    idSpan.textContent = `#${pokemon.species_id || pokemon.id}`;

    const src = pokemon.sprites?.front_default || pokemon.sprites?.official?.default || "";
    let imgEl;
    if (src) {
      imgEl = document.createElement("img");
      imgEl.src = src;
      imgEl.alt = pokemon.name;
    } else {
      imgEl = document.createElement("div");
      imgEl.className = "box-entry-img-placeholder";
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "box-entry-name";
    nameSpan.textContent = pokemon.display_name;

    entry.append(idSpan, imgEl, nameSpan);
    entry.addEventListener("click", () => fetchPokemonDirect(pokemon.name));
    list.appendChild(entry);
  });
}

function displayPokemon(pokemon) {
  currentId = pokemon.id;
  currentSpeciesId = pokemon.species_id || pokemon.id;
  isShiny = false;
  currentSprites = pokemon.sprites;
  document.getElementById("shinyBtn").querySelector("circle").setAttribute("fill", "#b71c1c");
  hiddenBoxView();
  if (isMobile()) document.querySelector(".pokedex").style.transform = "translateX(-50%)";
  updateFavoriteBtn();
  document.getElementById("screenText").style.display = "none";
  const img = document.getElementById("pokemonImage");
  const mainSrc = pokemon.sprites?.official?.default || pokemon.sprites?.front_default || "";
  if (mainSrc) {
    img.src = mainSrc;
    img.style.display = "block";
    document.getElementById("pokemonImagePlaceholder")?.remove();
  } else {
    img.style.display = "none";
    let ph = document.getElementById("pokemonImagePlaceholder");
    if (!ph) {
      ph = document.createElement("div");
      ph.id = "pokemonImagePlaceholder";
      ph.textContent = "Image not available";
      ph.className = "image-placeholder";
      img.parentNode.insertBefore(ph, img);
    }
  }
  img.alt = pokemon.name;
  document.getElementById("pokemonName").textContent = pokemon.display_name || (pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1));
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
    u.lang = currentLang;
    if (!isAndroid && currentVoice) u.voice = currentVoice;
    return u;
  };

  const nameUtterance = makeUtterance(pokemon.display_name || pokemon.name);
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
  document.getElementById("pokemonId").textContent = `#${pokemon.species_id || pokemon.id}`;
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
  const shinySrc = isShiny
    ? currentSprites.official?.shiny || currentSprites.front_default || ""
    : currentSprites.official?.default || currentSprites.front_default || "";
  if (shinySrc) {
    img.src = shinySrc;
    img.style.display = "block";
    document.getElementById("pokemonImagePlaceholder")?.remove();
  } else {
    img.style.display = "none";
    let ph = document.getElementById("pokemonImagePlaceholder");
    if (!ph) {
      ph = document.createElement("div");
      ph.id = "pokemonImagePlaceholder";
      ph.textContent = "Image not available";
      ph.className = "image-placeholder";
      img.parentNode.insertBefore(ph, img);
    }
  }
  btn.setAttribute("fill", isShiny ? "#f4c430" : "#b71c1c");
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

// Storage box click — select that box and show its contents
document.querySelectorAll(".storage-box").forEach((box) => {
  box.addEventListener("click", () => {
    selectedBox = parseInt(box.dataset.slot);
    boxCursor = 0;
    boxEverSelected = true;
    updateStorageUI();
    updateFavoriteBtn();
    showBoxView(selectedBox);
  });
});

// Favourite button — append current pokemon to the selected box
document.getElementById("favoriteBtn").addEventListener("click", () => {
  if (!currentId || !currentSprites) return;
  if (isInSelectedBox()) {
    storage[selectedBox] = storage[selectedBox].filter(p => p.id !== currentId);
    boxCursor = Math.max(0, Math.min(boxCursor, storage[selectedBox].length - 1));
  } else {
    storage[selectedBox].push({
      id: currentId,
      name: document.getElementById("pokemonName").textContent,
      sprites: currentSprites,
    });
    boxCursor = storage[selectedBox].length - 1;
  }
  saveStorage();
  updateStorageUI();
  updateFavoriteBtn();
  if (document.getElementById("boxView").style.display !== "none") {
    showBoxView(selectedBox);
  }
});

// Storage prev/next buttons — change which box is selected
document.getElementById("storagePrevBtn").addEventListener("click", () => {
  if (selectedBox > 0) { selectedBox--; boxCursor = 0; boxEverSelected = true; updateStorageUI(); updateFavoriteBtn(); showBoxView(selectedBox); }
});

document.getElementById("storageNextBtn").addEventListener("click", () => {
  if (selectedBox < STORAGE_SIZE - 1) { selectedBox++; boxCursor = 0; boxEverSelected = true; updateStorageUI(); updateFavoriteBtn(); showBoxView(selectedBox); }
});

// prevBtn/nextBtn — cycle through pokemon within the selected box
document.getElementById("prevBtn").addEventListener("click", () => {
  const box = storage[selectedBox];
  if (!box.length) return;
  boxCursor = (boxCursor - 1 + box.length) % box.length;
  fetchPokemonDirect(box[boxCursor].id);
});

document.getElementById("nextBtn").addEventListener("click", () => {
  const box = storage[selectedBox];
  if (!box.length) return;
  boxCursor = (boxCursor + 1) % box.length;
  fetchPokemonDirect(box[boxCursor].id);
});

// Init storage UI on load
updateStorageUI();

document.getElementById("dpadLeft").addEventListener("click", () => { navigateById(-1); });
document.getElementById("dpadRight").addEventListener("click", () => { navigateById(1); });
document.getElementById("dpadUp").addEventListener("click", () => { navigateById(-10); });
document.getElementById("dpadDown").addEventListener("click", () => { navigateById(10); });

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

// ========================= //
// WEBCAM POKEMON SCANNER    //
// ========================= //

(function () {
  const STABLE_INTERVAL_MS = 200;
  const STABLE_NEEDED = 8;     // 8 × 200ms = 1.6s of stillness
  const DIFF_THRESHOLD = 15;   // mean pixel diff to consider "moved"
  const SAMPLE_STEP = 8;       // sample every 8th pixel for performance

  let mediaStream = null;
  let stabilityInterval = null;
  let stableCount = 0;
  let scanPending = false;
  let prevImageData = null;
  let savedScreenState = null;

  const video      = document.getElementById("cameraFeed");
  const canvas     = document.getElementById("cameraCanvas");
  const statusEl   = document.getElementById("cameraStatus");
  const lockBar    = document.getElementById("cameraLockBar");
  const lockFill   = document.getElementById("cameraLockFill");
  const cameraBtn  = document.querySelector(".camera");
  const pokeImg    = document.getElementById("pokemonImage");
  const screenText = document.getElementById("screenText");

  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  async function getRearCameraStream() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    const rear = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
    let constraints;
    if (rear) {
      constraints = { video: { deviceId: { exact: rear.deviceId } }, audio: false };
    } else if (isMobileDevice) {
      constraints = { video: { facingMode: "environment" }, audio: false };
    } else {
      constraints = { video: true, audio: false };
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function startCamera() {
    savedScreenState = { image: pokeImg.style.display, text: screenText.style.display };
    pokeImg.style.display = "none";
    screenText.style.display = "none";
    video.style.display = "block";
    statusEl.style.display = "block";
    lockBar.style.display = "block";
    statusEl.textContent = "Initializing...";

    try {
      mediaStream = await getRearCameraStream();
      video.srcObject = mediaStream;
      await video.play();
      statusEl.textContent = "Hold still...";
      prevImageData = null;
      stableCount = 0;
      scanPending = false;
      lockFill.style.width = "0%";
      stabilityInterval = setInterval(stabilityTick, STABLE_INTERVAL_MS);
    } catch (err) {
      const denied = err.name === "NotAllowedError" || err.name === "PermissionDeniedError";
      const missing = err.name === "NotFoundError";
      statusEl.textContent = denied ? "Camera access denied" : missing ? "No camera found" : "Camera error: " + err.name;
      video.style.display = "none";
      lockBar.style.display = "none";
      pokeImg.style.display = savedScreenState.image;
      screenText.style.display = savedScreenState.text;
      savedScreenState = null;
    }
  }

  function stopCamera(restoreScreen = true) {
    clearInterval(stabilityInterval);
    stabilityInterval = null;
    stableCount = 0;
    prevImageData = null;
    scanPending = false;
    lockFill.style.width = "0%";
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    video.srcObject = null;
    video.style.display = "none";
    statusEl.style.display = "none";
    lockBar.style.display = "none";
    if (restoreScreen && savedScreenState) {
      pokeImg.style.display = savedScreenState.image;
      screenText.style.display = savedScreenState.text;
    }
    savedScreenState = null;
  }

  function toggleCamera() {
    if (mediaStream) stopCamera(); else startCamera();
  }

  function getImageBlob() {
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Frame capture failed")), "image/jpeg", 0.7)
    );
  }

  function stabilityTick() {
    if (scanPending) return;
    const ctx = canvas.getContext("2d");
    canvas.width = 320;
    canvas.height = 240;
    ctx.drawImage(video, 0, 0, 320, 240);
    const curr = ctx.getImageData(0, 0, 320, 240).data;

    if (prevImageData) {
      let diff = 0, count = 0;
      for (let i = 0; i < curr.length; i += 4 * SAMPLE_STEP) {
        diff += Math.abs(curr[i]   - prevImageData[i])
              + Math.abs(curr[i+1] - prevImageData[i+1])
              + Math.abs(curr[i+2] - prevImageData[i+2]);
        count++;
      }
      const meanDiff = diff / (count * 3);
      if (meanDiff < DIFF_THRESHOLD) {
        stableCount = Math.min(stableCount + 1, STABLE_NEEDED);
      } else {
        stableCount = 0;
        statusEl.textContent = "Hold still...";
      }
      lockFill.style.width = `${(stableCount / STABLE_NEEDED) * 100}%`;
      if (stableCount >= STABLE_NEEDED) runScan();
    }
    prevImageData = curr;
  }

  async function runScan() {
    scanPending = true;
    stableCount = 0;
    lockFill.style.width = "0%";
    statusEl.textContent = "Scanning...";
    try {
      const blob = await getImageBlob();
      const form = new FormData();
      form.append("image", blob, "frame.jpg");
      const res = await fetch("/detect-pokemon", { method: "POST", body: form });
      const data = await res.json();
      if (res.ok && data.pokemon) {
        stopCamera(false);
        fetchPokemon(data.pokemon);
      } else {
        statusEl.textContent = data.error || "No Pokemon detected — try again";
        scanPending = false;
      }
    } catch (e) {
      statusEl.textContent = "Scan error — try again";
      scanPending = false;
    }
  }

  cameraBtn.addEventListener("click", toggleCamera);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mediaStream) stopCamera();
  });
})();
