import { readFileSync, writeFileSync } from 'fs';
import { webcrypto } from 'crypto';
const subtle = webcrypto.subtle;
const getRandomValues = (buf) => webcrypto.getRandomValues(buf);

const data = JSON.parse(readFileSync('c:/code/pokedex-sandbox/data/pokemon.json', 'utf8'));
const arr = Array.isArray(data) ? data : Object.values(data);

// Group IDs by type
const byType = {};
for (const p of arr) {
  for (const t of (p.types || [])) {
    if (!byType[t]) byType[t] = [];
    byType[t].push(p.id);
  }
}

// Print counts
for (const [t, ids] of Object.entries(byType)) {
  console.log(`${t}: ${ids.length}`);
}

// Tier thresholds per type: bronze=10%, silver=30%, gold=60%, rainbow=100%
// We want one type at each tier. Use ice (48 total) for simplicity of rainbow.
// Pick distinct types for each tier so all 4 tiers show somewhere:
//   rainbow: ice (all 48)
//   gold: fire — need ceil(82*0.6)=50 out of 82
//   silver: electric — need ceil(69*0.3)=21 out of 69
//   bronze: fairy — need ceil(64*0.1)=7 out of 64

const scannedSet = new Set();

function addN(type, n) {
  const ids = byType[type] || [];
  for (let i = 0; i < Math.min(n, ids.length); i++) scannedSet.add(ids[i]);
}

// rainbow tier — add all ice
addN('ice', byType['ice'].length);

// gold tier — fire: need ceil(82*0.6)=50
addN('fire', Math.ceil((byType['fire']?.length || 0) * 0.6));

// silver tier — electric: need ceil(69*0.3)=21
addN('electric', Math.ceil((byType['electric']?.length || 0) * 0.3));

// bronze tier — fairy: need ceil(64*0.1)=7
addN('fairy', Math.ceil((byType['fairy']?.length || 0) * 0.1));

console.log(`\nTotal scanned: ${scannedSet.size}`);

const payload = {
  version: 1,
  scanned: [...scannedSet],
  storage: [],
  voiceName: '',
  speechVolume: '0.3',
  lang: 'en',
};

// Encrypt with same key as script.js
const KEY_BYTES = new Uint8Array([
  0xa7,0xf3,0xd2,0xe1,0xb8,0xc9,0x4f,0x6e,0x2d,0x5a,0x1b,0x7c,0x3e,0x9f,0x8d,0x4a,
  0x6b,0x2c,0x5e,0x7f,0x1a,0x3d,0x8b,0x4c,0x6e,0x9f,0x2a,0x5b,0x7c,0x1d,0x4e,0x8f,
]);

const key = await subtle.importKey('raw', KEY_BYTES, { name: 'AES-GCM' }, false, ['encrypt']);
const iv = new Uint8Array(12);
getRandomValues(iv);
const encoded = new TextEncoder().encode(JSON.stringify(payload));
const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

const combined = new Uint8Array(12 + encrypted.byteLength);
combined.set(iv, 0);
combined.set(new Uint8Array(encrypted), 12);

// base64 encode same as browser btoa
const b64 = Buffer.from(combined).toString('base64');
writeFileSync('c:/code/pokedex-sandbox/demo-save.pkdx', b64, 'utf8');
console.log('Written: demo-save.pkdx');
