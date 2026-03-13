// Consolidated mutable display/preference state
const state = {
  currentId: null,
  currentSpeciesId: null,
  speechVolume: parseFloat(localStorage.getItem("speechVolume") ?? "0.3"),
  currentVoice: null,
  currentCryUrl: null,
  currentLang: "en",
  isShiny: false,
  currentSprites: null,
};

let _pokemonIds = [];
fetch("/pokemon-ids").then(r => r.json()).then(ids => { _pokemonIds = ids; });

// Scan tracking
const SCANNED_KEY = "pokedex_scanned_v1";
function getScannedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(SCANNED_KEY) || "[]")); }
  catch { return new Set(); }
}
function markScanned(speciesId) {
  if (!speciesId) return;
  const ids = getScannedIds();
  if (ids.has(speciesId)) return;
  ids.add(speciesId);
  localStorage.setItem(SCANNED_KEY, JSON.stringify([...ids]));
}

// Pokédex browser cache
let _pokedexCache = null;
let _pokedexFilter = "all"; // "all" | "scanned" | "unscanned"

// ========================= //
// ACHIEVEMENTS              //
// ========================= //

const TYPE_CONFIG = {
  normal:   { color: "#A8A878", levels: ["Casual Collector","Everyday Explorer","Normal Trainer","Normal Master"] },
  fire:     { color: "#F08030", levels: ["Spark Starter","Flame Keeper","Fire Trainer","Fire Master"] },
  water:    { color: "#6890F0", levels: ["Wave Rider","Deep Diver","Water Trainer","Water Master"] },
  electric: { color: "#F8D030", levels: ["Spark Chaser","Volt Rider","Electric Trainer","Electric Master"] },
  grass:    { color: "#78C850", levels: ["Seedling","Garden Keeper","Grass Trainer","Grass Master"] },
  ice:      { color: "#98D8D8", levels: ["Frost Seeker","Blizzard Runner","Ice Trainer","Ice Master"] },
  fighting: { color: "#C03028", levels: ["Rookie Brawler","Ring Fighter","Fighting Trainer","Fighting Master"] },
  poison:   { color: "#A040A0", levels: ["Toxin Tracker","Venom Collector","Poison Trainer","Poison Master"] },
  ground:   { color: "#E0C068", levels: ["Dirt Digger","Earth Shaker","Ground Trainer","Ground Master"] },
  flying:   { color: "#A890F0", levels: ["Sky Gazer","Wind Rider","Flying Trainer","Flying Master"] },
  psychic:  { color: "#F85888", levels: ["Mind Seeker","Thought Reader","Psychic Trainer","Psychic Master"] },
  bug:      { color: "#A8B820", levels: ["Bug Catcher","Entomologist","Bug Trainer","Bug Master"] },
  rock:     { color: "#B8A038", levels: ["Pebble Picker","Stone Mason","Rock Trainer","Rock Master"] },
  ghost:    { color: "#705898", levels: ["Specter Spotter","Ghost Whisperer","Ghost Trainer","Ghost Master"] },
  dragon:   { color: "#7038F8", levels: ["Dragon Chaser","Wyrm Tamer","Dragon Trainer","Dragon Master"] },
  dark:     { color: "#705848", levels: ["Shadow Seeker","Night Stalker","Dark Trainer","Dark Master"] },
  steel:    { color: "#B8B8D0", levels: ["Metal Detector","Iron Forger","Steel Trainer","Steel Master"] },
  fairy:    { color: "#EE99AC", levels: ["Pixie Finder","Enchanter","Fairy Trainer","Fairy Master"] },
};

const OVERALL_LEVELS = ["Novice Scanner","Devoted Explorer","Elite Trainer","Pokémon Master"];
const OVERALL_THRESHOLDS = [25, 150, 500];

function getTypeTier(scanned, total) {
  if (total === 0) return -1;
  if (scanned >= total) return 3;
  if (scanned >= Math.ceil(total * 0.6)) return 2;
  if (scanned >= Math.ceil(total * 0.3)) return 1;
  if (scanned >= Math.ceil(total * 0.1)) return 0;
  return -1;
}

function getOverallTier(scanned, total) {
  if (scanned >= total) return 3;
  if (scanned >= OVERALL_THRESHOLDS[2]) return 2;
  if (scanned >= OVERALL_THRESHOLDS[1]) return 1;
  if (scanned >= OVERALL_THRESHOLDS[0]) return 0;
  return -1;
}

const TIER_COLORS      = { "-1": "#444",    0: "#CD7F32", 1: "#B0B0B0", 2: "#FFD700" };
const TIER_COLORS_DARK = { "-1": "#1e1e1e", 0: "#8B4513", 1: "#707070", 2: "#B8860B" };
const RIBBON_COLORS    = { "-1": "#222",    0: "#9B5A1A", 1: "#7a7a7a", 2: "#C9A000" };

// {c} = bright icon color (replaced per type), {w} = white accent
const TYPE_ICONS = {
  normal:   `<circle cx="30" cy="44" r="11" fill="none" stroke="{c}" stroke-width="2.5"/><circle cx="30" cy="44" r="4" fill="{c}"/>`,
  fire:     `<path d="M30 32 C25 37 21 42 24 47 C26 52 30 55 30 55 C30 55 34 52 36 47 C39 42 35 37 30 32 Z" fill="{c}"/><path d="M30 42 C28 45 27 48 30 51 C33 48 32 45 30 42 Z" fill="rgba(255,230,80,0.9)"/>`,
  water:    `<path d="M30 33 L19 47 C19 52 24 56 30 56 C36 56 41 52 41 47 Z" fill="{c}"/>`,
  grass:    `<line x1="30" y1="34" x2="30" y2="54" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/><path d="M30 44 C30 44 21 39 20 33 C25 34 29 40 30 43" fill="{c}"/><path d="M30 44 C30 44 39 39 40 33 C35 34 31 40 30 43" fill="{c}"/>`,
  electric: `<path d="M33 33 L23 45 L30 45 L27 55 L39 42 L32 42 Z" fill="{c}"/>`,
  ice:      `<line x1="30" y1="34" x2="30" y2="54" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/><line x1="22" y1="38.5" x2="38" y2="49.5" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/><line x1="38" y1="38.5" x2="22" y2="49.5" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/><circle cx="30" cy="44" r="3.5" fill="{c}"/>`,
  fighting: `<rect x="19" y="35" width="4" height="8" rx="2" fill="{c}"/><rect x="24" y="33" width="4.5" height="10" rx="2" fill="{c}"/><rect x="29" y="33" width="4.5" height="10" rx="2" fill="{c}"/><rect x="34" y="34" width="4" height="9" rx="2" fill="{c}"/><rect x="19" y="41" width="20" height="12" rx="3" fill="{c}"/><path d="M39 43 C39 40 44 40 44 43 L44 49 C44 52 39 52 39 49 Z" fill="{c}"/><line x1="20" y1="43" x2="38" y2="43" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`,
  poison:   `<circle cx="30" cy="44" r="11" fill="{c}"/><circle cx="26" cy="42" r="2.5" fill="rgba(255,255,255,0.9)"/><circle cx="34" cy="42" r="2.5" fill="rgba(255,255,255,0.9)"/><path d="M24 49 C24 49 26 47 30 47 C34 47 36 49 36 49" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2" stroke-linecap="round"/>`,
  ground:   `<path d="M18 51 L30 34 L42 51 Z" fill="{c}"/><line x1="20" y1="51" x2="40" y2="51" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/><path d="M23 48 L30 37 L37 48" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>`,
  flying:   `<path d="M30 44 C24 40 17 38 17 38 C17 38 19 45 26 47" fill="{c}"/><path d="M30 44 C36 40 43 38 43 38 C43 38 41 45 34 47" fill="{c}"/><ellipse cx="30" cy="44" rx="5" ry="7" fill="{c}"/>`,
  psychic:  `<circle cx="30" cy="44" r="11" fill="none" stroke="{c}" stroke-width="2.5"/><path d="M30 35 C38 39 38 49 30 53" fill="none" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/><circle cx="30" cy="44" r="4" fill="{c}"/>`,
  bug:      `<ellipse cx="30" cy="46" rx="7" ry="8" fill="{c}"/><ellipse cx="30" cy="37" rx="4" ry="5" fill="{c}"/><line x1="25" y1="40" x2="18" y2="36" stroke="{c}" stroke-width="2" stroke-linecap="round"/><line x1="35" y1="40" x2="42" y2="36" stroke="{c}" stroke-width="2" stroke-linecap="round"/><line x1="23" y1="46" x2="16" y2="44" stroke="{c}" stroke-width="2" stroke-linecap="round"/><line x1="37" y1="46" x2="44" y2="44" stroke="{c}" stroke-width="2" stroke-linecap="round"/>`,
  rock:     `<polygon points="30,33 41,38 41,50 30,55 19,50 19,38" fill="{c}"/><polygon points="30,37 38,41 38,49 30,52 22,49 22,41" fill="rgba(0,0,0,0.2)"/>`,
  ghost:    `<path d="M19 55 L19 40 C19 33 24 30 30 30 C36 30 41 33 41 40 L41 55 L36 51 L30 55 L24 51 Z" fill="{c}"/><circle cx="25" cy="42" r="3" fill="rgba(255,255,255,0.9)"/><circle cx="35" cy="42" r="3" fill="rgba(255,255,255,0.9)"/>`,
  dragon:   `<path d="M30 33 L37 39 L35 43 L42 47 L36 50 L30 55 L24 50 L18 47 L25 43 L23 39 Z" fill="{c}"/><circle cx="30" cy="44" r="4" fill="rgba(255,255,255,0.3)"/>`,
  dark:     `<path d="M22 34 C16 38 14 45 17 51 C20 56 27 57.5 33 54 C26 53 21 49 20 44 C19 39 22 34 22 34 Z" fill="{c}"/><path d="M38 34 C44 38 46 45 43 51 C40 56 33 57.5 27 54 C34 53 39 49 40 44 C41 39 38 34 38 34 Z" fill="{c}" opacity="0.55"/>`,
  steel:    `<polygon points="30,33 41,38 41,51 30,55 19,51 19,38" fill="none" stroke="{c}" stroke-width="2.5"/><polygon points="30,38 37,41 37,50 30,53 23,50 23,41" fill="{c}" opacity="0.4"/>`,
  fairy:    `<path d="M30 33 L31.8 39.5 L39 37 L34 43 L39.5 49 L32 47 L30 53.5 L28 47 L20.5 49 L26 43 L21 37 L28.2 39.5 Z" fill="{c}"/>`,
  overall:  `<path d="M18 44 C18 37 23 32 30 32 C37 32 42 37 42 44" fill="#EE1111"/><path d="M18 44 C18 51 23 56 30 56 C37 56 42 51 42 44" fill="#FFFFFF"/><line x1="18" y1="44" x2="42" y2="44" stroke="rgba(0,0,0,0.4)" stroke-width="2"/><circle cx="30" cy="44" r="5" fill="#FFFFFF" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>`,
};

// Vivid type colors for icons — shown on a dark tier-tinted face for maximum contrast.
const TYPE_ICON_COLORS = {
  normal:   "#C8C8A8",   // warm gray-tan
  fire:     "#EE2200",   // vivid red (inner yellow flame is hardcoded in the SVG)
  water:    "#2288FF",   // vivid blue
  electric: "#FFCC00",   // vivid yellow
  grass:    "#22CC22",   // vivid green
  ice:      "#44DDEE",   // vivid cyan
  fighting: "#8B1A2A",   // burgundy
  poison:   "#BB22EE",   // vivid purple
  ground:   "#DDAA00",   // vivid amber
  flying:   "#88CCFF",   // light blue
  psychic:  "#EE00CC",   // magenta
  bug:      "#77CC00",   // vivid lime
  rock:     "#909090",   // muted gray
  ghost:    "#5533BB",   // vivid indigo
  dragon:   "#C8B99A",   // beige
  dark:     "#3A3A6A",   // dark slate blue
  steel:    "#A0A0B8",   // steel gray
  fairy:    "#FF88CC",   // pink
  overall:  "#FF4422",   // vivid coral-red
};

// Dark tier-tinted face colors — icon type color pops clearly against these.
const FACE_COLORS = {
  "-1": "#2a2a2a",   // locked: dark gray
   0:   "#3A1800",   // bronze: very dark brown
   1:   "#1E1E28",   // silver: very dark blue-gray
   2:   "#2A1E00",   // gold: very dark amber
   3:   "#180028",   // rainbow: very dark purple
};

function buildMedalSVG(typeKey, tier, _typeColor, svgSize = 54) {
  const svgHeight = Math.round(svgSize * 84 / 60);
  const isRainbow = tier === 3;
  const uid = `${typeKey}_${tier}_${svgSize}`;
  const ring      = isRainbow ? `url(#rbw_${uid})` : (TIER_COLORS[tier]      ?? TIER_COLORS["-1"]);
  const ringDark  = isRainbow ? `url(#rbw_${uid})` : (TIER_COLORS_DARK[tier] ?? TIER_COLORS_DARK["-1"]);
  const ribbon    = isRainbow ? `url(#rbw_${uid})` : (RIBBON_COLORS[tier]    ?? RIBBON_COLORS["-1"]);
  const faceColor = FACE_COLORS[tier] ?? FACE_COLORS["-1"];

  const iconColor = TYPE_ICON_COLORS[typeKey] || "rgba(255,255,255,0.9)";
  const icon = (TYPE_ICONS[typeKey] || TYPE_ICONS.normal).replace(/\{c\}/g, iconColor);
  const shine = tier > 0
    ? `<ellipse cx="23" cy="47" rx="6" ry="3.5" fill="rgba(255,255,255,0.2)" transform="rotate(-20 23 47)"/>`
    : "";
  // Ribbons: left strap goes upper-left→lower-right, right strap goes upper-right→lower-left.
  // They cross at y≈22. Drawing order creates proper depth: right-bottom behind, left full, right-top in front.
  // Clasp at y=28-37 overlaps medal top (cy=56, r=23 → top at y=33): visually connected.
  return `<svg viewBox="0 0 60 84" width="${svgSize}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="rbw_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#ff4444"/>
        <stop offset="20%"  stop-color="#ffaa00"/>
        <stop offset="40%"  stop-color="#ffee00"/>
        <stop offset="60%"  stop-color="#44cc44"/>
        <stop offset="80%"  stop-color="#4488ff"/>
        <stop offset="100%" stop-color="#cc44ff"/>
      </linearGradient>
    </defs>
    <!-- Right strap BOTTOM half (behind left strap, below crossing y=22) -->
    <polygon points="25,22 34,22 30,28 22,28" fill="${ribbon}"/>
    <polygon points="30,22 34,22 30,28 26,28" fill="rgba(0,0,0,0.22)"/>
    <!-- Left strap FULL (upper-left → lower-right, sits in front at crossing) -->
    <polygon points="10,0 22,0 38,28 30,28" fill="${ribbon}"/>
    <polygon points="17,0 22,0 38,28 33,28" fill="rgba(0,0,0,0.22)"/>
    <polygon points="10,0 15,0 31,28 26,28" fill="rgba(255,255,255,0.15)"/>
    <!-- Right strap TOP half (upper-right → crossing y=22, in front above crossing) -->
    <polygon points="38,0 50,0 34,22 25,22" fill="${ribbon}"/>
    <polygon points="44,0 50,0 34,22 28,22" fill="rgba(0,0,0,0.22)"/>
    <polygon points="38,0 43,0 27,22 25,22" fill="rgba(255,255,255,0.15)"/>
    <!-- Clasp (bottom touches medal top at y=33, creating connection) -->
    <rect x="21" y="28" width="18" height="9"   rx="2.5" fill="${ringDark}"/>
    <rect x="22" y="29" width="16" height="7"   rx="2"   fill="${ring}"/>
    <rect x="23" y="29.5" width="14" height="2.5" rx="1" fill="rgba(255,255,255,0.25)"/>
    <!-- Drop shadow -->
    <circle cx="31" cy="57.5" r="23" fill="rgba(0,0,0,0.18)"/>
    <!-- Outer dark ring -->
    <circle cx="30" cy="56" r="23" fill="${ringDark}"/>
    <!-- Main ring -->
    <circle cx="30" cy="56" r="21" fill="${ring}"/>
    <!-- Inner border inset shadow -->
    <circle cx="30" cy="56" r="18" fill="rgba(0,0,0,0.28)"/>
    <!-- Inner border ring highlight -->
    <circle cx="30" cy="56" r="18" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="1"/>
    <!-- Face (dark tier-tinted, so vivid type icon pops clearly) -->
    <circle cx="30" cy="56" r="17" fill="${faceColor}"/>
    <!-- Subtle top highlight for dimension -->
    <ellipse cx="25" cy="49" rx="7" ry="4" fill="rgba(255,255,255,0.10)" transform="rotate(-20 25 49)"/>
    <!-- Outer ring rim highlight -->
    <circle cx="30" cy="56" r="21" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="0.8"/>
    <!-- Type icon (shift +12: icons centered at y=44 → new face center y=56) -->
    <g transform="translate(0,12)">${icon}</g>
    ${shine}
  </svg>`;
}

function buildMedalCard(typeKey, tier, typeColor, levels, scannedCount, total) {
  const card = document.createElement("div");
  card.className = "medal-card" + (tier === -1 ? " medal-locked" : "");
  const label = tier >= 0 ? levels[tier] : "???";
  card.innerHTML = `
    <div class="medal-svg">${buildMedalSVG(typeKey, tier, typeColor)}</div>
    <div class="medal-name">${label}</div>
    <div class="medal-progress">${scannedCount}/${total}</div>`;
  card.addEventListener("click", () => showMedalDetailView(typeKey, tier, typeColor, levels, scannedCount, total));
  return card;
}

function getMedalCriteria(typeKey, tier, scannedCount, total) {
  const typeName = typeKey === "overall"
    ? "Pokémon"
    : typeKey.charAt(0).toUpperCase() + typeKey.slice(1) + "-type";
  if (tier === -1) {
    const firstThreshold = typeKey === "overall"
      ? OVERALL_THRESHOLDS[0]
      : Math.ceil(total * 0.1);
    const needed = firstThreshold - scannedCount;
    const firstName = typeKey === "overall"
      ? OVERALL_LEVELS[0]
      : (TYPE_CONFIG[typeKey]?.levels[0] ?? "???");
    return `Scan ${needed} more ${typeName}<br>to unlock Bronze:<br>"${firstName}"`;
  }
  if (tier === 3) {
    return typeKey === "overall"
      ? "Every Pokémon scanned!<br>True Pokémon Master!"
      : `Every ${typeName} Pokémon scanned!<br>True Master!`;
  }
  const thresholds = typeKey === "overall"
    ? [...OVERALL_THRESHOLDS, total]
    : [Math.ceil(total * 0.1), Math.ceil(total * 0.3), Math.ceil(total * 0.6), total];
  const nextThreshold = thresholds[tier + 1];
  const needed = nextThreshold - scannedCount;
  const tierLabels = ["Bronze", "Silver", "Gold", "Rainbow"];
  const nextName = typeKey === "overall"
    ? OVERALL_LEVELS[tier + 1]
    : (TYPE_CONFIG[typeKey]?.levels[tier + 1] ?? "???");
  return `Scan ${needed} more ${typeName}<br>to earn ${tierLabels[tier + 1]}:<br>"${nextName}"`;
}

function showMedalDetailView(typeKey, tier, typeColor, levels, scannedCount, total) {
  const typeName = typeKey === "overall"
    ? "Overall"
    : typeKey.charAt(0).toUpperCase() + typeKey.slice(1);
  const title = tier >= 0 ? levels[tier] : "Locked";
  const pct = total > 0 ? Math.round(scannedCount / total * 100) : 0;
  const barColor = tier === -1 ? "#555" : tier === 3 ? "#cc44ff" : (TIER_COLORS[tier] ?? "#555");

  document.getElementById("medalDetailView").style.display = "flex";
  document.getElementById("menuView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "flex";
  document.getElementById("pokedexFilterBtn").style.display = "none";

  document.getElementById("medalDetailSvg").innerHTML = buildMedalSVG(typeKey, tier, typeColor, 88);
  document.getElementById("medalDetailType").textContent = typeName;
  document.getElementById("medalDetailTitle").textContent = title;
  document.getElementById("medalDetailProgress").textContent = `${scannedCount} / ${total} scanned`;
  document.getElementById("medalDetailBarFill").style.width = `${pct}%`;
  document.getElementById("medalDetailBarFill").style.background = barColor;
  document.getElementById("medalDetailCriteria").innerHTML = getMedalCriteria(typeKey, tier, scannedCount, total);
}

async function showAchievementsView() {
  if (!_pokedexCache) {
    const res = await fetch(`/pokedex-list?lang=${state.currentLang}`);
    _pokedexCache = await res.json();
  }
  const typeTotals = {}, typeScannedCounts = {};
  for (const p of _pokedexCache) {
    for (const t of (p.types || [])) typeTotals[t] = (typeTotals[t] || 0) + 1;
  }
  const scanned = getScannedIds();
  for (const p of _pokedexCache) {
    if (scanned.has(p.id)) {
      for (const t of (p.types || [])) typeScannedCounts[t] = (typeScannedCounts[t] || 0) + 1;
    }
  }

  document.getElementById("menuView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("achievementsView").style.display = "flex";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "flex";
  document.getElementById("pokedexFilterBtn").style.display = "none";

  const grid = document.getElementById("achievementsGrid");
  grid.innerHTML = "";

  const totalScanned = scanned.size;
  const overallTier = getOverallTier(totalScanned, _pokedexCache.length);
  grid.appendChild(buildMedalCard("overall", overallTier, "#4a4a4a", OVERALL_LEVELS, totalScanned, _pokedexCache.length));

  for (const [type, cfg] of Object.entries(TYPE_CONFIG)) {
    const total = typeTotals[type] || 0;
    const got = typeScannedCounts[type] || 0;
    grid.appendChild(buildMedalCard(type, getTypeTier(got, total), cfg.color, cfg.levels, got, total));
  }
}

function showMenuView() {
  const mv = document.getElementById("menuView");
  mv.style.opacity = "0";
  mv.style.display = "flex";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("saveLoadView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "none";
  document.getElementById("pokedexFilterBtn").style.display = "none";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    mv.style.transition = "opacity 0.5s";
    mv.style.opacity = "1";
  }));
}

function showSaveLoadView() {
  document.getElementById("menuView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("saveLoadView").style.display = "flex";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexFilterBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "flex";
  document.getElementById("saveLoadStatus").textContent = "";
}

// AES-GCM key for save file encryption. Prevents casual tampering — the file
// is an opaque encrypted blob that cannot be edited without this key.
const _SAVE_KEY_RAW = new Uint8Array([
  0xa7,0xf3,0xd2,0xe1,0xb8,0xc9,0x4f,0x6e,0x2d,0x5a,0x1b,0x7c,0x3e,0x9f,0x8d,0x4a,
  0x6b,0x2c,0x5e,0x7f,0x1a,0x3d,0x8b,0x4c,0x6e,0x9f,0x2a,0x5b,0x7c,0x1d,0x4e,0x8f,
]);
async function _getSaveKey() {
  return crypto.subtle.importKey("raw", _SAVE_KEY_RAW, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function saveData() {
  const statusEl = document.getElementById("saveLoadStatus");
  try {
    const payload = {
      version: 1,
      scanned:      JSON.parse(localStorage.getItem("pokedex_scanned_v1") || "[]"),
      storage:      JSON.parse(localStorage.getItem("pokestorage_v2")     || "[]"),
      voiceName:    localStorage.getItem("voiceName")          || "",
      speechVolume: localStorage.getItem("state.speechVolume") || localStorage.getItem("speechVolume") || "0.3",
      lang:         localStorage.getItem("state.currentLang")  || "en",
    };
    const key       = await _getSaveKey();
    const iv        = crypto.getRandomValues(new Uint8Array(12));
    const encoded   = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined  = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), 12);
    // base64-encode so the file is plain text and transferable
    const b64  = btoa(String.fromCharCode(...combined));
    const blob = new Blob([b64], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "pokedex-save.pkdx";
    a.click();
    URL.revokeObjectURL(url);
    statusEl.textContent = "Saved!";
  } catch {
    statusEl.textContent = "Save failed.";
  }
}

function loadData() {
  const input    = document.getElementById("saveLoadFileInput");
  const statusEl = document.getElementById("saveLoadStatus");
  input.onchange = async () => {
    try {
      const b64      = await input.files[0].text();
      const combined = Uint8Array.from(atob(b64.trim()), c => c.charCodeAt(0));
      const iv        = combined.slice(0, 12);
      const encrypted = combined.slice(12);
      const key  = await _getSaveKey();
      const dec  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
      const data = JSON.parse(new TextDecoder().decode(dec));
      if (!data.version) throw new Error("Invalid save file");
      if (Array.isArray(data.scanned))  localStorage.setItem("pokedex_scanned_v1", JSON.stringify(data.scanned));
      if (Array.isArray(data.storage))  localStorage.setItem("pokestorage_v2",     JSON.stringify(data.storage));
      if (data.voiceName)               localStorage.setItem("voiceName",           data.voiceName);
      if (data.speechVolume != null) {  localStorage.setItem("speechVolume",        data.speechVolume);
                                        localStorage.setItem("state.speechVolume",  data.speechVolume); }
      if (data.lang)                    localStorage.setItem("state.currentLang",   data.lang);
      statusEl.textContent = "Loaded! Reloading...";
      setTimeout(() => location.reload(), 800);
    } catch {
      statusEl.textContent = "Error: invalid or corrupted save file.";
    }
    input.value = "";
  };
  input.click();
}

/** Returns the best sprite URL for a given sprites object. */
function getSpriteSrc(sprites, shiny = false) {
  if (!sprites) return "";
  return shiny
    ? sprites.official?.shiny || sprites.front_default || ""
    : sprites.official?.default || sprites.front_default || "";
}

/** Creates an <img> or a blank placeholder <div> for use in list entries. */
function buildImgOrPlaceholder(sprites, altText) {
  const src = getSpriteSrc(sprites);
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = altText || "";
    return img;
  }
  const div = document.createElement("div");
  div.className = "box-entry-img-placeholder";
  return div;
}

async function showPokedexView() {
  document.getElementById("menuView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("pokedexView").style.display = "flex";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "flex";
  document.getElementById("pokedexFilterBtn").style.display = "flex";
  document.getElementById("pokedexFilterDropdown").style.display = "none";

  if (!_pokedexCache) {
    const res = await fetch(`/pokedex-list?lang=${state.currentLang}`);
    _pokedexCache = await res.json();
  }

  const scanned = getScannedIds();
  const filtered = _pokedexFilter === "scanned"
    ? _pokedexCache.filter(p => scanned.has(p.id))
    : _pokedexFilter === "unscanned"
      ? _pokedexCache.filter(p => !scanned.has(p.id))
      : _pokedexCache;

  document.getElementById("pokedexViewCount").textContent = `${scanned.size} / ${_pokedexCache.length}`;
  const list = document.getElementById("pokedexViewList");
  list.innerHTML = "";

  for (const p of filtered) {
    const entry = document.createElement("div");
    entry.className = "box-entry" + (scanned.has(p.id) ? " scanned" : " unscanned");

    const numSpan = document.createElement("span");
    numSpan.className = "box-entry-num";
    numSpan.textContent = `#${p.id}`;

    const imgEl = buildImgOrPlaceholder(p.sprites, p.display_name);

    const nameSpan = document.createElement("span");
    nameSpan.className = "box-entry-name";
    nameSpan.textContent = p.display_name;

    const indicator = document.createElement("span");
    indicator.className = "scan-indicator";
    indicator.title = scanned.has(p.id) ? "Scanned" : "Not scanned";

    entry.append(numSpan, imgEl, nameSpan, indicator);
    entry.addEventListener("click", () => openFromPokedex(p.id));
    list.appendChild(entry);
  }
}

async function openFromPokedex(id) {
  await fetchPokemonDirect(id);
}

function navigateById(delta) {
  const refId = state.currentSpeciesId || state.currentId;
  if (!refId) { fetchPokemonDirect(1); return; }
  const idx = _pokemonIds.indexOf(refId);
  if (idx === -1) { fetchPokemonDirect(refId + delta); return; }
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= _pokemonIds.length) return;
  const next = _pokemonIds[nextIdx];
  if (next !== undefined) fetchPokemonDirect(next);
}

const isAndroid = /android/i.test(navigator.userAgent);

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
  return state.currentId != null && storage[selectedBox].some(p => p.id === state.currentId);
}

function updateFavoriteBtn() {
  const btn = document.getElementById("favoriteBtn");
  btn.classList.toggle("favorited", isInSelectedBox());
}

function showBoxView(boxIndex) {
  document.getElementById("menuView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "block";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "none";
  document.getElementById("pokedexFilterBtn").style.display = "none";

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

    const imgEl = buildImgOrPlaceholder(pokemon.sprites, pokemon.name);

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
  document.getElementById("menuView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("pokemonView").style.display = "block";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "none";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "flex";
  document.getElementById("pokedexBackArrowBtn").style.display = "none";
  document.getElementById("pokedexFilterBtn").style.display = "none";
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
  const saved = localStorage.getItem("state.currentLang");
  if (saved && sel.querySelector(`option[value="${saved}"]`)) sel.value = saved;
  state.currentLang = sel.value;
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
  state.currentVoice = voices[voiceSelect.value] ?? voices[voiceSelect.options[0]?.value] ?? null;
  if (state.currentVoice) {
    const prefix = state.currentVoice.lang.split("-")[0];
    state.currentLang = ttsToPokeApiLang[prefix] || prefix;
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
  state.currentVoice = voices[e.target.value];
  if (state.currentVoice) {
    localStorage.setItem("voiceName", state.currentVoice.name);
    const prefix = state.currentVoice.lang.split("-")[0];
    state.currentLang = ttsToPokeApiLang[prefix] || prefix;
    _pokedexCache = null;
    if (state.currentId) fetchPokemonDirect(state.currentId);
    else showMenuView();
  }
});

document.getElementById("langSelect").addEventListener("change", (e) => {
  state.currentLang = e.target.value;
  localStorage.setItem("state.currentLang", state.currentLang);
  _pokedexCache = null;
  if (state.currentId) fetchPokemonDirect(state.currentId);
  else showMenuView();
});
let volumeBarTimeout = null;

function showVolumeBar() {
  const bar = document.getElementById("volumeBar");
  const fill = document.getElementById("volumeBarFill");
  const icon = document.getElementById("volumeIcon");
  fill.style.width = (state.speechVolume * 100) + "%";
  icon.textContent = state.speechVolume === 0 ? "🔇" : "🔊";
  bar.classList.add("visible");
  clearTimeout(volumeBarTimeout);
  volumeBarTimeout = setTimeout(() => bar.classList.remove("visible"), 1500);
}

async function fetchPokemon(identifier) {
  await searchAndDisplay(String(identifier));
}

async function fetchPokemonDirect(identifier) {
  try {
    const res = await fetch(`/pokemon/${identifier}?lang=${state.currentLang}`);
    if (!res.ok) throw new Error("Pokémon not found");
    const data = await res.json();
    displayPokemon(data);
  } catch (err) {
    alert(err.message);
  }
}

async function searchAndDisplay(query) {
  try {
    const res = await fetch(`/search?q=${encodeURIComponent(query)}&lang=${state.currentLang}`);
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
  document.getElementById("menuView").style.display = "none";
  document.getElementById("achievementsView").style.display = "none";
  document.getElementById("medalDetailView").style.display = "none";
  document.getElementById("pokemonView").style.display = "none";
  document.getElementById("boxView").style.display = "none";
  document.getElementById("searchView").style.display = "block";
  document.getElementById("pokedexView").style.display = "none";
  document.getElementById("pokedexBackBtn").style.display = "none";
  document.getElementById("pokedexBackArrowBtn").style.display = "none";
  document.getElementById("pokedexFilterBtn").style.display = "none";
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

    const imgEl = buildImgOrPlaceholder(pokemon.sprites, pokemon.name);

    const nameSpan = document.createElement("span");
    nameSpan.className = "box-entry-name";
    nameSpan.textContent = pokemon.display_name;

    entry.append(idSpan, imgEl, nameSpan);
    entry.addEventListener("click", () => fetchPokemonDirect(pokemon.name));
    list.appendChild(entry);
  });
}

function displayPokemon(pokemon) {
  state.currentId = pokemon.id;
  state.currentSpeciesId = pokemon.species_id || pokemon.id;
  state.isShiny = false;
  state.currentSprites = pokemon.sprites;
  document.getElementById("shinyBtn").querySelector("circle").setAttribute("fill", "#b71c1c");
  hiddenBoxView();
  updateFavoriteBtn();
  document.getElementById("screenText").style.display = "none";
  const img = document.getElementById("pokemonImage");
  const mainSrc = getSpriteSrc(pokemon.sprites);
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
    u.volume = state.speechVolume;
    u.lang = state.currentLang;
    if (!isAndroid && state.currentVoice) u.voice = state.currentVoice;
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
  state.currentCryUrl = pokemon.cry ?? null;
  document.getElementById("cryBtn").disabled = !state.currentCryUrl;
}

document.getElementById("shinyBtn").addEventListener("click", () => {
  if (!state.currentSprites) return;
  state.isShiny = !state.isShiny;
  const img = document.getElementById("pokemonImage");
  const btn = document.getElementById("shinyBtn").querySelector("circle");
  const shinySrc = getSpriteSrc(state.currentSprites, state.isShiny);
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
  btn.setAttribute("fill", state.isShiny ? "#f4c430" : "#b71c1c");
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
  if (state.currentCryUrl) {
    const cry = new Audio(state.currentCryUrl);
    cry.volume = state.speechVolume * 0.5;
    cry.play();
  }
});

document.getElementById("volDownBtn").addEventListener("click", () => {
  state.speechVolume = Math.max(0, parseFloat((state.speechVolume - 0.05).toFixed(2)));
  localStorage.setItem("state.speechVolume", state.speechVolume);
  showVolumeBar();
});

document.getElementById("volUpBtn").addEventListener("click", () => {
  state.speechVolume = Math.min(1, parseFloat((state.speechVolume + 0.05).toFixed(2)));
  localStorage.setItem("state.speechVolume", state.speechVolume);
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
  if (!state.currentId || !state.currentSprites) return;
  if (isInSelectedBox()) {
    storage[selectedBox] = storage[selectedBox].filter(p => p.id !== state.currentId);
    boxCursor = Math.max(0, Math.min(boxCursor, storage[selectedBox].length - 1));
  } else {
    storage[selectedBox].push({
      id: state.currentId,
      name: document.getElementById("pokemonName").textContent,
      sprites: state.currentSprites,
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

// Pokédex icon button on pokemon detail — return to Pokédex list
document.getElementById("pokedexBackBtn").addEventListener("click", () => showPokedexView());

// Back arrow button on Pokédex list — return to main menu
// Back arrow — context-aware: from medal detail → achievements; otherwise → menu
document.getElementById("pokedexBackArrowBtn").addEventListener("click", () => {
  if (document.getElementById("medalDetailView").style.display !== "none") {
    showAchievementsView();
  } else {
    showMenuView();
  }
});

// Menu buttons
document.getElementById("menuPokedexBtn").addEventListener("click", () => showPokedexView());
document.getElementById("menuAchievementsBtn").addEventListener("click", () => showAchievementsView());
document.getElementById("menuSaveLoadBtn").addEventListener("click", () => showSaveLoadView());
document.getElementById("saveDataBtn").addEventListener("click", saveData);
document.getElementById("loadDataBtn").addEventListener("click", loadData);

// Filter button — toggle dropdown
document.getElementById("pokedexFilterBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const dd = document.getElementById("pokedexFilterDropdown");
  dd.style.display = dd.style.display === "none" ? "flex" : "none";
});

document.querySelectorAll('input[name="dexFilter"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    _pokedexFilter = e.target.value;
    document.getElementById("pokedexFilterDropdown").style.display = "none";
    showPokedexView();
  });
});

document.addEventListener("click", () => {
  const dd = document.getElementById("pokedexFilterDropdown");
  if (dd) dd.style.display = "none";
});

// Show main menu after opening animations complete (matches screenOn end at 2.6s)
setTimeout(showMenuView, 2600);

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
        const speciesId = data.species_id || data.pokemon;
        await fetchPokemonDirect(speciesId);
        markScanned(speciesId);
        if (_pokedexCache) {
          const scanned = getScannedIds();
          document.getElementById("pokedexViewCount").textContent = `${scanned.size} / ${_pokedexCache.length}`;
        }
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
