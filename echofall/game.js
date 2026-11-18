import * as THREE from './vendor/three.module.min.js';

/*
 * Echofall — a short 3D survey expedition through the Veyra system.
 *
 * Orbit scale: 1 unit ≈ 1,000 km and time is compressed, so the worlds visibly
 * follow their orbits (inner worlds move faster, as Kepler's third law says).
 * Surface scale: 1 unit = 1 metre, with each world's own gravity.
 */

// ---------------------------------------------------------------- helpers
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const dampAngle = (a, b, rate, dt) => {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-rate * dt));
};
const TAU = Math.PI * 2;

const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
};

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simplex noise (after Stefan Gustavson's public-domain reference implementation).
function makeNoise(seed) {
  const rand = seeded(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
  const F2 = 0.5 * (Math.sqrt(3) - 1); const G2 = (3 - Math.sqrt(3)) / 6;
  const F3 = 1 / 3; const G3 = 1 / 6;
  function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s); const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t); const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0; const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2; const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2; const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255; const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = (perm[ii + perm[jj]] % 12) * 3; t0 *= t0; n += t0 * t0 * (G[g] * x0 + G[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = (perm[ii + i1 + perm[jj + j1]] % 12) * 3; t1 *= t1; n += t1 * t1 * (G[g] * x1 + G[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = (perm[ii + 1 + perm[jj + 1]] % 12) * 3; t2 *= t2; n += t2 * t2 * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * n;
  }
  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s); const j = Math.floor(yin + s); const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t); const y0 = yin - (j - t); const z0 = zin - (k - t);
    let i1; let j1; let k1; let i2; let j2; let k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    const x1 = x0 - i1 + G3; const y1 = y0 - j1 + G3; const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3; const y2 = y0 - j2 + 2 * G3; const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3; const y3 = y0 - 1 + 3 * G3; const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255; const jj = j & 255; const kk = k & 255;
    const corner = (tt, gi, x, y, z) => {
      if (tt <= 0) return 0;
      const g = gi * 3; tt *= tt;
      return tt * tt * (G[g] * x + G[g + 1] * y + G[g + 2] * z);
    };
    return 32 * (
      corner(0.6 - x0 * x0 - y0 * y0 - z0 * z0, perm[ii + perm[jj + perm[kk]]] % 12, x0, y0, z0)
      + corner(0.6 - x1 * x1 - y1 * y1 - z1 * z1, perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12, x1, y1, z1)
      + corner(0.6 - x2 * x2 - y2 * y2 - z2 * z2, perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12, x2, y2, z2)
      + corner(0.6 - x3 * x3 - y3 * y3 - z3 * z3, perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12, x3, y3, z3));
  }
  return { noise2, noise3 };
}

const NOISE = makeNoise(1729);
function fbm2(x, z, octaves = 4) {
  let amp = 0.5; let freq = 1; let sum = 0; let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * NOISE.noise2(x * freq + i * 17.3, z * freq - i * 9.1);
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- game data
const STORAGE_KEY = 'echofall.save.v2';
const SAVE_VERSION = 2;
const UPGRADE_COST = 6;
const SAMPLE_VALUE = 2;
const SAMPLES_PER_WORLD = 5;
const SCAN_TIME = 2.6;
const LAND_SPEED = 4;
const O2_SECONDS = 300;
const SHIP_AIR_RADIUS = 9;
const CACHE_PLANET_ID = 'nacre-7';
const SYSTEM_RADIUS = 96;
const ORBIT_SHIP_SCALE = 0.42;
const SURFACE_SHIP_SCALE = 2.6;
const LEG_DROP = 1.65;
const TERRAIN_SIZE = 400;
const BELT = { inner: 39.5, outer: 45.5, count: 230 };
const touchUI = matchMedia('(pointer: coarse)').matches;
const coarse = touchUI || Math.min(screen.width, screen.height) < 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const kepler = (orbit) => 3.1 * orbit ** 1.5;

const PLANETS = [
  {
    id: 'ruhn',
    name: 'Ruhn',
    kind: 'desert',
    type: 'Iron-oxide desert world',
    signal: 'Ferrite dunes · weak magnetosphere',
    resource: 'Ferrite nodule',
    orbit: 21, phase: 2.35, radius: 2.7, tilt: 0.44, day: 70, seed: 3.1,
    gravity: 0.38,
    facts: { gravity: '0.38 g', temperature: '−24 °C mean', atmosphere: 'Thin CO₂ · 0.02 bar', day: '26 h 40 m' },
    bake: { kind: 0, colors: [0x2b1d18, 0x6b311d, 0xa65a33, 0xcb915d, 0xe4c093] },
    spec: 0,
    atmosphere: { color: 0xe0a77c, strength: 0.5, scale: 1.045 },
    lumen: 0x6fe2ff,
    surface: {
      terrain: 'desert',
      sky: { horizon: 0xd8b08b, zenith: 0x86604c, ground: 0x6e4a33, sunColor: 0xfff0dc, sunSize: 0.03, glow: 1.0, stars: 0, ring: 0 },
      fog: { color: 0xcca480, near: 45, far: 230 },
      sunDir: [-0.55, 0.6, 0.58], sunIntensity: 3.1, envIntensity: 0.62, hemi: 0.4, bounce: 0xa8724c,
      palette: { sand: 0xc48955, dust: 0xddb07f, rockA: 0x7d4129, rockB: 0xae6a43, dark: 0x5a3324 },
      dust: { color: 0xd9b088, count: 650, drift: [1.8, 0.05, 0.7], size: 0.06, opacity: 0.45 },
      rockColor: 0x8c5236,
      wind: 0.6,
    },
  },
  {
    id: 'nacre-7',
    name: 'Nacre-7',
    kind: 'tidal',
    type: 'Tidal glass world',
    signal: 'Silicate tides · dormant harmonic',
    resource: 'Luma shard',
    orbit: 34, phase: 0.55, radius: 3.8, tilt: 0.3, day: 50, seed: 7.7,
    gravity: 0.71,
    facts: { gravity: '0.71 g', temperature: '+9 °C mean', atmosphere: 'N₂ · trace O₂ · 0.8 bar', day: '19 h 12 m' },
    bake: { kind: 1, colors: [0x082a3d, 0x1f7d8c, 0xc9c0a8, 0x7fb3ae, 0x4a5452] },
    clouds: true,
    spec: 1,
    atmosphere: { color: 0x7fb8ff, strength: 1, scale: 1.085 },
    lumen: 0x5fe6ff,
    surface: {
      terrain: 'tidal',
      sky: { horizon: 0xcde5e8, zenith: 0x3b79ad, ground: 0x587472, sunColor: 0xfff6ea, sunSize: 0.022, glow: 1.0, stars: 0, ring: 0 },
      fog: { color: 0xb9d6db, near: 55, far: 250 },
      sunDir: [0.58, 0.55, 0.6], sunIntensity: 2.8, envIntensity: 0.7, hemi: 0.4, bounce: 0x8f8f80,
      palette: { silt: 0x3f5654, wet: 0x7d7f74, flats: 0xbdb5a0, glass: 0x74aaa5, rock: 0x5a605c },
      water: { color: 0x1d5e6c, opacity: 0.8 },
      dust: { color: 0xf2fbfb, count: 300, drift: [0.8, 0.12, -0.5], size: 0.045, opacity: 0.3 },
      rockColor: 0x4f5755,
      wind: 0.45,
    },
  },
  {
    id: 'hollowmere',
    name: 'Hollowmere',
    kind: 'ice',
    type: 'Ringed ice world',
    signal: 'Nitrogen glaciers · ring shepherd echoes',
    resource: 'Rime crystal',
    orbit: 56, phase: 4.1, radius: 3.2, tilt: 0.47, day: 34, seed: 12.4,
    gravity: 0.27,
    facts: { gravity: '0.27 g', temperature: '−188 °C mean', atmosphere: 'Thin N₂ haze · 0.01 bar', day: '11 h 05 m' },
    bake: { kind: 2, colors: [0xe8eef2, 0x8fb2cf, 0xffffff, 0x8a6a5a, 0x4c4a52] },
    rings: { inner: 1.45, outer: 2.3, colA: 0xcfc4b2, colB: 0x8f8579 },
    spec: 0.35,
    atmosphere: { color: 0xa9c6ff, strength: 0.35, scale: 1.035 },
    lumen: 0xa996ff,
    surface: {
      terrain: 'ice',
      sky: { horizon: 0x3f4f78, zenith: 0x03050c, ground: 0x2c3446, sunColor: 0xfff3e4, sunSize: 0.011, glow: 0.45, stars: 1, ring: 1 },
      fog: { color: 0x3a4870, near: 80, far: 330 },
      sunDir: [-0.66, 0.3, 0.69], sunIntensity: 3.2, envIntensity: 0.8, hemi: 0.55, bounce: 0xc4d2e2,
      palette: { snow: 0xf1f5f9, ice: 0xa9c6e0, tholin: 0x9a7a68, rock: 0x4c4b52 },
      dust: { color: 0xffffff, count: 520, drift: [0.35, -0.25, 0.2], size: 0.035, opacity: 0.55 },
      rockColor: 0x55545c,
      wind: 0.1,
    },
  },
];
PLANETS.forEach((planet) => { planet.period = kepler(planet.orbit); });
const planetById = (id) => PLANETS.find((planet) => planet.id === id) || null;

function planetPosition(planet, time, target = new THREE.Vector3()) {
  const angle = planet.phase + TAU * time / planet.period;
  return target.set(Math.cos(angle) * planet.orbit, 0, Math.sin(angle) * planet.orbit);
}
const headingTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// ---------------------------------------------------------------- state
function startShip() {
  const pos = new THREE.Vector3(7, 0, 31);
  const nearest = PLANETS.map((planet) => planetPosition(planet, 0)).sort((a, b) => a.distanceTo(pos) - b.distanceTo(pos))[0];
  return { pos: pos.toArray(), vel: [0, 0, 0], heading: headingTo(pos, nearest) };
}

const freshState = () => ({
  version: SAVE_VERSION,
  mode: 'orbit',
  time: 0,
  scans: [],
  currentPlanet: null,
  ship: startShip(),
  walker: null,
  o2: 100,
  inventory: 0,
  totalCollected: 0,
  collected: [],
  upgrade: false,
  cacheReady: false,
  cacheCollected: false,
  complete: false,
  visits: {},
  muted: false,
  quality: 'auto',
  waypoints: true,
});

function loadState() {
  store.remove('echofall.save.v1');
  const raw = store.get(STORAGE_KEY);
  if (!raw) return freshState();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SAVE_VERSION) return freshState();
    const next = { ...freshState(), ...parsed };
    next.scans = Array.isArray(next.scans) ? next.scans.filter((id) => planetById(id)) : [];
    next.collected = Array.isArray(next.collected) ? next.collected.filter((key) => typeof key === 'string') : [];
    if (!planetById(next.currentPlanet)) { next.currentPlanet = null; next.mode = 'orbit'; }
    if (!next.ship || !Array.isArray(next.ship.pos)) next.ship = startShip();
    next.o2 = clamp(Number(next.o2) || 0, 0, 100);
    next.quality = next.quality === 'performance' ? 'performance' : 'auto';
    next.waypoints = next.waypoints !== false;
    return next;
  } catch {
    return freshState();
  }
}

let state = loadState();
const hadSave = store.get(STORAGE_KEY) !== null;
let saveTimer = 0;

function saveState() {
  if (!store.set(STORAGE_KEY, JSON.stringify(state))) return;
  ui.save.classList.add('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => ui.save.classList.remove('saving'), 450);
}

// ---------------------------------------------------------------- UI references
const ui = {
  briefing: $('#briefing'),
  begin: $('#begin-button'),
  resume: $('#resume-note'),
  mission: $('#mission-list'),
  scanProgress: $('#scan-progress'),
  collectProgress: $('#collect-progress'),
  mode: $('#mode-label'),
  speedLabel: $('#speed-label'),
  speed: $('#speed-value'),
  resource: $('#resource-value'),
  scanner: $('#scanner-value'),
  vitalTile: $('#vital-tile'),
  vitalLabel: $('#vital-label'),
  vital: $('#vital-value'),
  targetKicker: $('#target-kicker'),
  target: $('#target-name'),
  distance: $('#target-distance'),
  targetType: $('#target-type'),
  facts: $('#target-facts'),
  proximity: $('#proximity-light'),
  prompt: $('#action-prompt'),
  primary: $('#primary-action'),
  primaryLabel: $('#primary-action b'),
  secondary: $('#land-action'),
  secondaryKey: $('#land-action span'),
  secondaryLabel: $('#land-action b'),
  touchSecondary: $('[data-tap="secondary"]'),
  toast: $('#toast'),
  save: $('#save-status'),
  sound: $('#sound-button'),
  settingsButton: $('#settings-button'),
  settings: $('#settings-dialog'),
  settingsSound: $('#settings-sound'),
  settingsWaypoints: $('#settings-waypoints'),
  settingsQuality: $('#settings-quality'),
  settingsReset: $('#settings-reset'),
  dialog: $('#ship-dialog'),
  dialogTitle: $('#dialog-title'),
  dialogCopy: $('#dialog-copy'),
  upgradeSpec: $('#upgrade-spec'),
  upgrade: $('#upgrade-button'),
  launch: $('#launch-button'),
  closeDialog: $('#dialog-close'),
  completion: $('#completion'),
  waypoint: $('#waypoint'),
  waypointLabel: $('#waypoint-label'),
  waypointDistance: $('#waypoint-distance'),
  waypointProgress: $('#waypoint-progress'),
  waypointArrow: $('#waypoint-arrow'),
  transition: $('#transition'),
  transitionLabel: $('#transition-label'),
};

ui.resume.textContent = hadSave ? 'A local expedition save was found. Continue where you left off.' : 'Progress saves automatically in this browser.';
if (hadSave) ui.begin.firstChild.textContent = 'Continue survey ';

const textCache = new WeakMap();
const TOUCH_WORDING = [
  [/press E to /g, 'tap USE to '], [/Press E to /g, 'Tap USE to '], [/press L (to|for) /g, 'tap LAND $1 '],
  [/ · W thrust, A\/D turn, Shift boost\./g, '.'], [/ · W walk, A\/D turn, Space jump\./g, '.'], [/ \(S brakes\)/g, ' (▼ brakes)'],
];
const forDevice = (text) => (touchUI ? TOUCH_WORDING.reduce((t, [re, to]) => t.replace(re, to), text) : text);

function setText(el, text) {
  if (el === ui.prompt) text = forDevice(text);
  if (!el || textCache.get(el) === text) return;
  textCache.set(el, text);
  el.textContent = text;
}

function showToast(message, duration = 2600) {
  ui.toast.textContent = forDevice(message);
  ui.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => ui.toast.classList.remove('show'), duration);
}

// ---------------------------------------------------------------- audio
class SoundKit {
  constructor() { this.ctx = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = state.muted ? 0 : 0.2;
      this.master.connect(this.ctx.destination);
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) { brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = brown * 3.5; }
      const loop = (filterType, frequency) => {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer; src.loop = true;
        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType; filter.frequency.value = frequency;
        const gain = this.ctx.createGain(); gain.gain.value = 0;
        src.connect(filter).connect(gain).connect(this.master);
        src.start();
        return { filter, gain };
      };
      this.engineBus = loop('lowpass', 220);
      this.windBus = loop('bandpass', 520);
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }
  setMuted(muted) {
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.2, this.ctx.currentTime, 0.05);
  }
  engine(level) {
    if (!this.engineBus) return;
    const now = this.ctx.currentTime;
    this.engineBus.gain.gain.setTargetAtTime(level * 0.55, now, 0.12);
    this.engineBus.filter.frequency.setTargetAtTime(160 + level * 520, now, 0.15);
  }
  wind(level) {
    if (!this.windBus) return;
    this.windBus.gain.gain.setTargetAtTime(level * 0.22, this.ctx.currentTime, 0.4);
  }
  tone(freq, duration = 0.15, type = 'sine', volume = 0.3, delay = 0) {
    if (!this.ctx || state.muted) return;
    const at = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }
  scanTick(progress) { this.tone(420 + progress * 520, 0.07, 'sine', 0.12); }
  scan() { [392, 523, 784].forEach((f, i) => this.tone(f, 0.34, 'sine', 0.26, i * 0.1)); }
  land() { this.tone(110, 0.5, 'triangle', 0.22); this.tone(70, 0.7, 'sine', 0.2, 0.1); }
  thud() { this.tone(58, 0.25, 'sine', 0.35); }
  impact() { this.tone(48, 0.35, 'square', 0.12); this.tone(90, 0.2, 'triangle', 0.2); }
  collect() { [523, 698, 932].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.24, i * 0.055)); }
  upgrade() { [220, 330, 440, 660].forEach((f, i) => this.tone(f, 0.55, 'sine', 0.26, i * 0.11)); }
  cache() { this.tone(180, 0.6, 'sawtooth', 0.12); this.tone(860, 0.9, 'sine', 0.28, 0.08); }
  warn() { this.tone(880, 0.12, 'square', 0.08); this.tone(660, 0.12, 'square', 0.08, 0.16); }
}
const sounds = new SoundKit();

// ---------------------------------------------------------------- renderer
const canvas = $('#game-canvas');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  const note = document.createElement('div');
  note.className = 'noscript';
  note.textContent = 'Echofall needs WebGL. Turn on hardware acceleration in your browser settings, or try another browser.';
  document.body.append(note);
  throw error;
}
function applyGraphicsQuality() {
  const cap = state.quality === 'performance' ? 1 : (coarse ? 1.5 : 1.75);
  renderer.setPixelRatio(Math.min(devicePixelRatio, cap));
}
applyGraphicsQuality();
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const maxAniso = renderer.capabilities.getMaxAnisotropy();
const pmrem = new THREE.PMREMGenerator(renderer);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);
const timer = new THREE.Timer();
timer.connect(document);
const keys = new Set();

// ---------------------------------------------------------------- GLSL
const NOISE_GLSL = /* glsl */`
// webgl-noise simplex 3D — Ashima Arts & Stefan Gustavson, MIT licence.
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int oct){float a=0.5,s=0.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;s+=a*snoise(p);n+=a;p=p*2.03+vec3(13.1,7.7,3.3);a*=0.5;}return s/n;}
float ridged(vec3 p,int oct){float a=0.5,s=0.0,n=0.0;for(int i=0;i<8;i++){if(i>=oct)break;float r=1.0-abs(snoise(p));s+=a*r*r;n+=a;p=p*2.03+vec3(5.3,1.9,8.1);a*=0.5;}return s/n;}
vec3 sphereDir(vec2 uv){float phi=uv.x*6.28318530718;float theta=(1.0-uv.y)*3.14159265359;return vec3(-cos(phi)*sin(theta),cos(theta),sin(phi)*sin(theta));}
`;

const BAKE_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PLANET_BAKE_FS = /* glsl */`
uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;
uniform float seed; uniform int kind;
varying vec2 vUv;
void main(){
  vec3 d = sphereDir(vUv);
  vec3 p = d + vec3(seed, seed * 0.7, seed * 1.3);
  vec3 col; float spec = 0.0;
  if (kind == 0) {
    float e = fbm(p * 1.7, 6);
    float m = fbm(p * 5.0 + 3.1, 4);
    float h = e * 0.75 + m * 0.25;
    col = mix(c0, c1, smoothstep(-0.5, -0.14, h));
    col = mix(col, c2, smoothstep(-0.14, 0.1, h));
    col = mix(col, c3, smoothstep(0.08, 0.3, h));
    col = mix(col, c4, smoothstep(0.26, 0.5, h + m * 0.2));
    float streak = snoise(vec3(d.x * 3.0, d.y * 34.0, d.z * 3.0) + seed * 2.0);
    col *= 0.9 + 0.12 * streak;
    float basin = ridged(p * 3.2 + 9.0, 3);
    col *= mix(1.0, 0.8, smoothstep(0.74, 0.92, basin));
  } else if (kind == 1) {
    float e = fbm(p * 1.5, 6) + 0.16 * ridged(p * 4.0, 3) - 0.13;
    if (e < 0.0) {
      float depth = clamp(-e / 0.32, 0.0, 1.0);
      col = mix(c1, c0, smoothstep(0.0, 1.0, depth));
      spec = 1.0;
    } else {
      float land = clamp(e / 0.4, 0.0, 1.0);
      col = mix(c2, c3, smoothstep(0.04, 0.55, land));
      col = mix(col, c4, smoothstep(0.55, 0.95, land) * 0.7);
      col *= 0.92 + 0.1 * snoise(p * 18.0);
      spec = 0.22;
    }
    float ice = smoothstep(0.8, 0.88, abs(d.y) + 0.05 * snoise(p * 6.0));
    col = mix(col, vec3(0.82, 0.87, 0.9), ice);
    spec = mix(spec, 0.4, ice);
  } else {
    float e = fbm(p * 1.6, 6);
    float r = ridged(p * 3.5, 4);
    col = mix(c1, c0, smoothstep(-0.25, 0.22, e));
    col = mix(col, c2, smoothstep(0.62, 0.86, r) * 0.55);
    float tholin = fbm(vec3(d.x * 1.2, d.y * 5.0, d.z * 1.2) + seed + 4.0, 4);
    col = mix(col, c3, smoothstep(0.05, 0.42, tholin) * 0.55);
    float crater = ridged(p * 2.6 + 2.0, 3);
    col = mix(col, c4, smoothstep(0.8, 0.95, crater) * 0.45);
    spec = 0.35;
  }
  gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), spec);
}`;

const CLOUD_BAKE_FS = /* glsl */`
uniform float seed; varying vec2 vUv;
void main(){
  vec3 d = sphereDir(vUv);
  vec3 q = d * 2.2 + seed;
  vec3 w = vec3(fbm(q, 4), fbm(q + 5.2, 4), fbm(q + 9.7, 4));
  float n = fbm(q * vec3(1.0, 1.9, 1.0) + w * 1.6, 6);
  float a = smoothstep(0.02, 0.48, n);
  a *= 0.7 + 0.3 * sin(d.y * 9.0);
  a *= 1.0 - smoothstep(0.86, 0.97, abs(d.y)) * 0.6;
  gl_FragColor = vec4(a, a, a, 1.0);
}`;

const NEBULA_BAKE_FS = /* glsl */`
uniform vec3 bandN; varying vec2 vUv;
void main(){
  vec3 d = sphereDir(vUv);
  float b = dot(d, bandN);
  float band = exp(-b * b / 0.035);
  float core = exp(-b * b / 0.006);
  float n = fbm(d * 3.0 + 1.0, 6) * 0.5 + 0.5;
  float dust = smoothstep(0.48, 0.74, fbm(d * 7.0 + 4.0, 5) * 0.5 + 0.5);
  vec3 col = vec3(0.0009, 0.001, 0.0018);
  col += vec3(0.05, 0.045, 0.04) * band * (0.3 + 0.9 * n) * (1.0 - 0.8 * dust * core);
  col += vec3(0.07, 0.06, 0.048) * core * n * (1.0 - dust);
  float neb = smoothstep(0.56, 0.86, fbm(d * 1.6 + 7.0, 5) * 0.5 + 0.5);
  col += vec3(0.04, 0.008, 0.014) * neb * (0.35 + band);
  float neb2 = smoothstep(0.6, 0.9, fbm(d * 2.1 + 17.0, 5) * 0.5 + 0.5);
  col += vec3(0.006, 0.016, 0.04) * neb2;
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}`;

const WORLD_VS = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

const PLANET_FS = /* glsl */`
uniform sampler2D map; uniform vec3 sunPos; uniform vec3 sunColor; uniform vec3 atmo;
uniform float atmoStrength; uniform float specStrength; uniform float night;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  vec4 t = texture2D(map, vUv);
  vec3 albedo = pow(t.rgb, vec3(2.2));
  vec3 N = normalize(vN); vec3 L = normalize(sunPos - vP); vec3 V = normalize(cameraPosition - vP);
  float ndl = dot(N, L);
  float diff = clamp(ndl * 1.04 + 0.02, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float lit = smoothstep(0.0, 0.12, ndl);
  float spec = (pow(nh, 160.0) * 0.9 + pow(nh, 24.0) * 0.035) * t.a * specStrength * lit;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.6);
  float day = smoothstep(-0.18, 0.4, ndl);
  vec3 col = albedo * sunColor * diff + albedo * night;
  col += sunColor * spec;
  col = mix(col, atmo * day * 1.15, clamp(fres * atmoStrength * 0.7, 0.0, 1.0));
  float dusk = smoothstep(-0.22, 0.04, ndl) * (1.0 - smoothstep(0.04, 0.32, ndl));
  col += vec3(1.0, 0.42, 0.18) * dusk * atmoStrength * 0.05 * (0.4 + fres);
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}`;

const CLOUD_FS = /* glsl */`
uniform sampler2D map; uniform vec3 sunPos; uniform vec3 sunColor;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main(){
  float a = texture2D(map, vUv).r;
  vec3 N = normalize(vN); vec3 L = normalize(sunPos - vP);
  float ndl = dot(N, L);
  float diff = clamp(ndl * 1.1 + 0.06, 0.0, 1.0);
  vec3 col = vec3(0.92, 0.94, 0.96) * sunColor * diff + vec3(0.003);
  col = mix(col, col * vec3(1.0, 0.62, 0.42), smoothstep(0.35, 0.0, ndl) * smoothstep(-0.1, 0.05, ndl));
  gl_FragColor = vec4(col, a * 0.9);
  ${TAIL}
}`;

const ATMO_VS = /* glsl */`varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ATMO_FS = /* glsl */`
uniform vec3 center; uniform float radius; uniform float outer; uniform vec3 color; uniform vec3 sunPos; uniform float strength;
varying vec3 vP;
void main(){
  vec3 rd = normalize(vP - cameraPosition);
  vec3 oc = center - cameraPosition;
  float t = dot(oc, rd);
  vec3 cp = cameraPosition + rd * max(t, 0.0);
  float h = length(cp - center);
  float k = clamp((outer - h) / (outer - radius), 0.0, 1.0);
  float density = pow(k, 2.4);
  vec3 up = normalize(cp - center);
  vec3 sunDir = normalize(sunPos - center);
  float mu = dot(up, sunDir);
  float lit = smoothstep(-0.35, 0.5, mu);
  float terminator = 1.0 - abs(mu);
  vec3 col = mix(color, vec3(1.0, 0.55, 0.3), terminator * terminator * 0.4) * density * lit * strength;
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}`;

const RING_VS = /* glsl */`
varying vec3 vLocal; varying vec3 vP; varying vec3 vNw;
void main(){
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const RING_FS = /* glsl */`
uniform float inner; uniform float outer; uniform float planetR; uniform vec3 planetCenter;
uniform vec3 sunPos; uniform vec3 sunColor; uniform vec3 colA; uniform vec3 colB;
varying vec3 vLocal; varying vec3 vP; varying vec3 vNw;
float h1(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
float n1(float x){ float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main(){
  float r = length(vLocal.xy);
  float x = (r - inner) / (outer - inner);
  float b = n1(x * 24.0) * 0.45 + n1(x * 90.0) * 0.35 + n1(x * 260.0) * 0.2;
  float a = smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.9, 1.0, x));
  a *= mix(0.2, 1.0, b);
  a *= 1.0 - 0.88 * smoothstep(0.55, 0.57, x) * (1.0 - smoothstep(0.62, 0.64, x));
  a *= mix(0.4, 1.0, smoothstep(0.18, 0.32, x));
  vec3 col = mix(colA, colB, n1(x * 12.0 + 4.0));
  vec3 L = normalize(sunPos - vP);
  vec3 oc = planetCenter - vP;
  float tc = dot(oc, L);
  float d = sqrt(max(dot(oc, oc) - tc * tc, 0.0));
  float shadow = tc > 0.0 ? mix(0.04, 1.0, smoothstep(planetR * 0.97, planetR * 1.04, d)) : 1.0;
  float lit = 0.5 + 0.5 * abs(dot(normalize(vNw), L));
  gl_FragColor = vec4(col * sunColor * lit * shadow, a * 0.88);
  ${TAIL}
}`;

const STAR_VS = /* glsl */`
varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){
  vObj = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const STAR_FS = /* glsl */`
uniform float time; uniform vec3 core; uniform vec3 limb;
varying vec3 vN; varying vec3 vP; varying vec3 vObj;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vP);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float darkening = 1.0 - 0.56 * (1.0 - mu) - 0.2 * (1.0 - mu) * (1.0 - mu);
  float g = fbm(vObj * 7.0 + vec3(0.0, time * 0.04, 0.0), 3) * 0.5 + 0.5;
  float g2 = snoise(vObj * 28.0 + time * 0.15) * 0.5 + 0.5;
  vec3 col = mix(limb, core, pow(mu, 0.55)) * darkening * (0.8 + 0.28 * g + 0.12 * g2);
  gl_FragColor = vec4(col * 2.7, 1.0);
  ${TAIL}
}`;

const SKYMAP_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKYMAP_FS = /* glsl */`
uniform sampler2D map; uniform float gain; varying vec2 vUv;
void main(){ gl_FragColor = vec4(pow(texture2D(map, vUv).rgb, vec3(2.2)) * gain, 1.0); ${TAIL} }`;

const POINTS_VS = /* glsl */`
attribute float starSize; attribute vec3 tint;
uniform float pixelRatio; varying vec3 vTint;
void main(){
  vTint = tint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = starSize * pixelRatio;
}`;
const POINTS_FS = /* glsl */`
varying vec3 vTint;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vTint * a * a, 1.0);
  ${TAIL}
}`;

const MOTES_VS = /* glsl */`
uniform vec3 focus; uniform float box; uniform float size; uniform float pixelRatio; uniform vec3 drift; uniform float time;
attribute float phase;
varying float vAlpha;
void main(){
  vec3 p = position + drift * time;
  p.y += sin(time * 0.7 + phase) * 0.3;
  p = mod(p - focus + box * 0.5, box) - box * 0.5 + focus;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  gl_PointSize = size * pixelRatio * 300.0 / max(dist, 0.5);
  vAlpha = smoothstep(box * 0.5, box * 0.25, length(p - focus)) * smoothstep(0.4, 2.0, dist) * (0.6 + 0.4 * sin(time * 2.0 + phase * 3.0));
}`;
const MOTES_FS = /* glsl */`
uniform vec3 color; uniform float opacity; varying float vAlpha;
void main(){
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, r) * vAlpha * opacity;
  gl_FragColor = vec4(color, a);
  ${TAIL}
}`;

const PLUME_VS = /* glsl */`
uniform float len; varying float vT; varying vec3 vNv; varying vec3 vVp;
void main(){
  vT = clamp(position.z / len, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVp = -mv.xyz;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const PLUME_FS = /* glsl */`
uniform float throttle; uniform float time; uniform vec3 core; uniform vec3 edge;
varying float vT; varying vec3 vNv; varying vec3 vVp;
void main(){
  float facing = abs(dot(normalize(vNv), normalize(vVp)));
  float flicker = 0.88 + 0.12 * sin(time * 40.0 + vT * 18.0);
  float a = pow(1.0 - vT, 1.6) * pow(facing, 1.4) * throttle * flicker;
  vec3 col = mix(core, edge, smoothstep(0.0, 0.7, vT));
  gl_FragColor = vec4(col * a * 2.2, 1.0);
  ${TAIL}
}`;

const BEAM_VS = /* glsl */`
varying float vY; varying vec3 vNv; varying vec3 vVp;
void main(){
  vY = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVp = -mv.xyz;
  vNv = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FS = /* glsl */`
uniform vec3 color; uniform float time; uniform float strength;
varying float vY; varying vec3 vNv; varying vec3 vVp;
void main(){
  float facing = abs(dot(normalize(vNv), normalize(vVp)));
  float pulse = 0.7 + 0.3 * sin(time * 2.4 - vY * 6.0);
  float a = pow(1.0 - vY, 2.2) * pow(facing, 2.0) * pulse * strength * smoothstep(3.0, 16.0, length(vVp));
  gl_FragColor = vec4(color * a, 1.0);
  ${TAIL}
}`;

const SKY_VS = /* glsl */`varying vec3 vDir; void main(){ vDir = position; vec4 wp = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const SKY_FS = /* glsl */`
uniform vec3 horizon; uniform vec3 zenith; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor;
uniform float sunSize; uniform float glow; uniform float stars; uniform float ring; uniform float discGain; uniform float time;
varying vec3 vDir;
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ringBand(float x){
  float s = 0.0;
  s += 0.45 * (0.5 + 0.5 * sin(x * 40.0 + sin(x * 13.0) * 2.0));
  s += 0.35 * (0.5 + 0.5 * sin(x * 131.0 + 1.7));
  s += 0.2 * (0.5 + 0.5 * sin(x * 377.0 + 0.3));
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 col = mix(horizon, zenith, pow(clamp(up, 0.0, 1.0), 0.42));
  col = mix(col, ground, smoothstep(0.0, -0.12, up));
  float sd = dot(d, normalize(sunDir));
  float disc = smoothstep(cos(sunSize * 1.15), cos(sunSize), sd);
  float halo = pow(max(sd, 0.0), 6.0) * 0.32 + pow(max(sd, 0.0), 80.0) * 0.9;
  col += sunColor * (disc * discGain + halo * glow);
  if (stars > 0.0 && up > -0.02) {
    vec3 cell = floor(d * 240.0);
    float h = hash3(cell);
    if (h > 0.9965) {
      vec3 f = fract(d * 240.0) - 0.5;
      float s = smoothstep(0.32, 0.0, length(f));
      float twinkle = 0.75 + 0.25 * sin(time * 3.0 + h * 400.0);
      col += vec3(0.9, 0.93, 1.0) * s * (h - 0.9965) * 900.0 * stars * twinkle * smoothstep(-0.02, 0.25, up);
    }
  }
  if (ring > 0.0) {
    vec3 n = normalize(vec3(0.32, 0.58, -0.75));
    vec3 c = vec3(0.0, -1.0, 0.0);
    float denom = dot(d, n);
    if (abs(denom) > 1e-4) {
      float t = dot(c, n) / denom;
      if (t > 0.0) {
        float r = length(d * t - c);
        float x = (r - 1.45) / 0.85;
        if (x > 0.0 && x < 1.0) {
          float a = ringBand(x) * smoothstep(0.0, 0.06, x) * (1.0 - smoothstep(0.9, 1.0, x));
          a *= 1.0 - 0.85 * smoothstep(0.55, 0.57, x) * (1.0 - smoothstep(0.62, 0.64, x));
          col += vec3(0.62, 0.58, 0.52) * a * 0.22 * ring * smoothstep(-0.02, 0.1, up);
        }
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}`;

// ---------------------------------------------------------------- baked textures
const BAKE_W = coarse ? 1024 : 2048;
const bakeScene = new THREE.Scene();
const bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
bakeQuad.frustumCulled = false;
bakeScene.add(bakeQuad);

function bake(fragmentShader, uniforms, width = BAKE_W, height = BAKE_W / 2) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    anisotropy: maxAniso,
  });
  const materialForBake = new THREE.ShaderMaterial({ vertexShader: BAKE_VS, fragmentShader: NOISE_GLSL + fragmentShader, uniforms, depthTest: false, depthWrite: false });
  bakeQuad.material = materialForBake;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(bakeScene, bakeCamera);
  renderer.setRenderTarget(previous);
  materialForBake.dispose();
  return target.texture;
}

const TEXTURES = {};
function bakeAll() {
  for (const planet of PLANETS) {
    const [c0, c1, c2, c3, c4] = planet.bake.colors.map((hex) => ({ value: new THREE.Color(hex) }));
    TEXTURES[planet.id] = bake(PLANET_BAKE_FS, { c0, c1, c2, c3, c4, seed: { value: planet.seed }, kind: { value: planet.bake.kind } });
    if (planet.clouds) TEXTURES[`${planet.id}:clouds`] = bake(CLOUD_BAKE_FS, { seed: { value: planet.seed + 3 } });
  }
  TEXTURES.nebula = bake(NEBULA_BAKE_FS, { bandN: { value: new THREE.Vector3(0.25, 0.9, 0.36).normalize() } });
}

function canvasTexture(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = size[0]; c.height = size[1];
  draw(c.getContext('2d'), c.width, c.height);
  const texture = new THREE.CanvasTexture(c);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso;
  return texture;
}

TEXTURES.glow = canvasTexture([256, 256], (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.1, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
});

TEXTURES.panels = canvasTexture([512, 256], (ctx, w, h) => {
  const rand = seeded(12);
  ctx.fillStyle = '#e6e8ea'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const shade = 200 + Math.floor(rand() * 40);
    ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 6},0.35)`;
    ctx.fillRect(Math.floor(rand() * 16) * 32, Math.floor(rand() * 8) * 32, 32 * (1 + Math.floor(rand() * 3)), 32);
  }
  ctx.fillStyle = '#3a4048'; ctx.fillRect(w * 0.4, 0, w * 0.2, h);
  ctx.strokeStyle = 'rgba(38,44,52,0.42)'; ctx.lineWidth = 1.4;
  for (let y = 0; y <= h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let row = 0; row < h / 32; row++) {
    for (let x = (row % 2) * 24; x < w; x += 48 + Math.floor(rand() * 24)) { ctx.beginPath(); ctx.moveTo(x, row * 32); ctx.lineTo(x, row * 32 + 32); ctx.stroke(); }
  }
  ctx.fillStyle = '#d7832f';
  ctx.fillRect(w * 0.25 - 4, h * 0.2, 8, h * 0.55);
  ctx.fillRect(w * 0.75 - 4, h * 0.2, 8, h * 0.55);
});

TEXTURES.detail = canvasTexture([256, 256], (ctx, w) => {
  const rand = seeded(91);
  const layers = [8, 16, 32, 64].map((size) => ({ size, grid: Float32Array.from({ length: size * size }, rand) }));
  const img = ctx.createImageData(w, w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let value = 0; let weight = 0; let amp = 1;
      for (const { size, grid } of layers) {
        const fx = x / w * size; const fy = y / w * size;
        const ix = Math.floor(fx); const iy = Math.floor(fy);
        let tx = fx - ix; let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const at = (gx, gy) => grid[(gy % size) * size + (gx % size)];
        value += amp * lerp(lerp(at(ix, iy), at(ix + 1, iy), tx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
        weight += amp; amp *= 0.55;
      }
      const v = clamp(Math.round((value / weight) * 255), 0, 255);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}, false);
TEXTURES.detail.wrapS = TEXTURES.detail.wrapT = THREE.RepeatWrapping;
TEXTURES.detail.repeat.set(100, 100);
TEXTURES.detailProp = TEXTURES.detail.clone();
TEXTURES.detailProp.repeat.set(3, 2);
TEXTURES.detailProp.needsUpdate = true;

let orbitEnvTarget = null;
function orbitEnvironment() {
  if (orbitEnvTarget) return orbitEnvTarget.texture;
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), new THREE.ShaderMaterial({
    vertexShader: SKYMAP_VS, fragmentShader: SKYMAP_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: TEXTURES.nebula }, gain: { value: 6 } },
  }));
  envScene.add(sky);
  orbitEnvTarget = pmrem.fromScene(envScene, 0.04);
  sky.geometry.dispose(); sky.material.dispose();
  return orbitEnvTarget.texture;
}

// ---------------------------------------------------------------- geometry helpers
function mergeVertices(geometry) {
  const pos = geometry.attributes.position;
  const lookup = new Map(); const verts = []; const index = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    const key = `${Math.round(x * 1e4)}|${Math.round(y * 1e4)}|${Math.round(z * 1e4)}`;
    let id = lookup.get(key);
    if (id === undefined) { id = verts.length / 3; verts.push(x, y, z); lookup.set(key, id); }
    index.push(id);
  }
  geometry.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  return out;
}

function rockGeometry(seed, detail = 3, rough = 0.3, squash = 0.75) {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, detail));
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = NOISE.noise3(v.x * 1.3 + seed, v.y * 1.3 - seed, v.z * 1.3) * rough
      + NOISE.noise3(v.x * 3.4 - seed, v.y * 3.4, v.z * 3.4 + seed) * rough * 0.35
      + NOISE.noise3(v.x * 9 + seed, v.y * 9, v.z * 9) * rough * 0.08;
    v.multiplyScalar(1 + n);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3;
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uvs[i * 2] = Math.atan2(v.z, v.x) / TAU + 0.5;
    uvs[i * 2 + 1] = v.y * 0.5 + 0.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...options });

// ---------------------------------------------------------------- the Morrowfin
function makeShip() {
  const ship = new THREE.Group();
  ship.name = 'Morrowfin survey skiff';
  ship.rotation.order = 'YXZ';
  const hullMat = material(0xffffff, { map: TEXTURES.panels, roughness: 0.48, metalness: 0.3 });
  const darkMat = material(0x2f353d, { roughness: 0.62, metalness: 0.4 });
  const wingMat = material(0xc9ced3, { roughness: 0.5, metalness: 0.35 });
  const metalMat = material(0x9ba3ab, { roughness: 0.28, metalness: 0.9 });
  const glassMat = material(0x0d1820, { roughness: 0.05, metalness: 0.9, envMapIntensity: 1.8 });
  const amberMat = material(0xd7832f, { roughness: 0.45, metalness: 0.2 });

  const profile = [[0, 2.55], [0.18, 2.42], [0.38, 2.12], [0.56, 1.62], [0.7, 0.95], [0.78, 0.2], [0.8, -0.6], [0.76, -1.3], [0.64, -1.85], [0.5, -2.1], [0.001, -2.12]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fuselageGeo = new THREE.LatheGeometry(profile, 32);
  fuselageGeo.rotateX(-Math.PI / 2);
  fuselageGeo.scale(1.18, 0.78, 1);
  ship.add(new THREE.Mesh(fuselageGeo, hullMat));

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, TAU, 0, Math.PI / 2), glassMat);
  canopy.scale.set(0.88, 0.62, 1.7);
  canopy.position.set(0, 0.36, -1.0);
  ship.add(canopy);
  const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 40, Math.PI), metalMat);
  canopyFrame.scale.set(0.88, 0.62, 1);
  canopyFrame.position.set(0, 0.36, -1.0);
  ship.add(canopyFrame);

  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(side * 0.6, 0.9);
    shape.lineTo(side * 2.75, -0.82);
    shape.lineTo(side * 2.92, -1.58);
    shape.lineTo(side * 0.6, -1.78);
    shape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
    wingGeo.rotateX(-Math.PI / 2);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.y = -0.12;
    wing.rotation.z = side * 0.07;
    ship.add(wing);
    const tipPod = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 4, 10), darkMat);
    tipPod.rotation.x = Math.PI / 2;
    tipPod.position.set(side * 2.86, 0.08, 1.15);
    ship.add(tipPod);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 1.9, 24), hullMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 0.98, -0.04, 1.05);
    ship.add(nacelle);
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.05, 8, 24), darkMat);
    intake.position.set(side * 0.98, -0.04, 0.1);
    ship.add(intake);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.37, 0.34, 24, 1, true), metalMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.98, -0.04, 2.15);
    ship.add(nozzle);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6f9fe8).multiplyScalar(0.75) }));
    core.position.set(side * 0.98, -0.04, 2.08);
    ship.add(core);

    const finShape = new THREE.Shape();
    finShape.moveTo(-0.95, 0); finShape.lineTo(-2.1, 0); finShape.lineTo(-2.18, 0.95); finShape.lineTo(-1.8, 0.98); finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
    finGeo.rotateY(Math.PI / 2);
    const fin = new THREE.Mesh(finGeo, wingMat);
    fin.position.set(side * 0.42, 0.3, 0);
    fin.rotation.z = -side * 0.38;
    ship.add(fin);
    const finCap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.42), amberMat);
    finCap.position.set(side * (0.42 + 0.98 * Math.sin(0.38)), 0.3 + 0.98 * Math.cos(0.38), 2.0);
    finCap.rotation.z = -side * 0.38;
    ship.add(finCap);

    const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.18), darkMat);
    rcs.position.set(side * 0.62, 0.05, -1.45);
    ship.add(rcs);
  }

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material(0x474d55, { roughness: 0.85, metalness: 0.1 }));
  belly.scale.set(0.76, 0.17, 1.85);
  belly.position.set(0, -0.4, 0.05);
  ship.add(belly);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.32, 10), metalMat);
  mast.position.set(0, 0.7, 0.42);
  ship.add(mast);
  const dish = new THREE.Group();
  dish.position.set(0, 0.88, 0.42);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 10, 0, TAU, 0, 1.0), material(0xe8eaec, { roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
  bowl.rotation.x = Math.PI - 0.5;
  dish.add(bowl);
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), metalMat);
  feed.rotation.x = -0.5;
  feed.position.set(0, 0.1, -0.08);
  dish.add(feed);
  ship.add(dish);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.7, 6), metalMat);
  antenna.position.set(0.2, 0.62, -0.1);
  antenna.rotation.x = 0.4;
  ship.add(antenna);

  const plumeMats = [];
  const plumeLength = 3.2;
  for (const side of [-1, 1]) {
    const geo = new THREE.ConeGeometry(0.27, plumeLength, 20, 1, true);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0, plumeLength / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLUME_VS, fragmentShader: PLUME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { len: { value: plumeLength }, throttle: { value: 0 }, time: { value: 0 }, core: { value: new THREE.Color(0xe8f6ff) }, edge: { value: new THREE.Color(0x5b8dff) } },
    });
    const plume = new THREE.Mesh(geo, mat);
    plume.position.set(side * 0.98, -0.04, 2.12);
    plume.frustumCulled = false;
    ship.add(plume);
    plumeMats.push(mat);
  }

  const navLights = [];
  const navLight = (color, x, y, z, blink) => {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
    bulb.position.set(x, y, z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEXTURES.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    halo.scale.setScalar(0.55);
    bulb.add(halo);
    ship.add(bulb);
    navLights.push({ bulb, halo, blink });
  };
  navLight(0xff3b30, -2.93, 0.1, 1.1, false);
  navLight(0x33ff7a, 2.93, 0.1, 1.1, false);
  navLight(0xffffff, 0, 0.12, 2.16, true);

  const legs = [];
  for (const [x, z, attachY] of [[0, -1.5, -0.42], [-1.0, 1.15, -0.4], [1.0, 1.15, -0.4]]) {
    const leg = new THREE.Group();
    leg.position.set(x, attachY, z);
    const len = LEG_DROP + attachY - 0.06;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, len, 10), metalMat);
    strut.position.y = -len / 2;
    leg.add(strut);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len * 0.8, 8), darkMat);
    brace.position.set(x === 0 ? 0 : -Math.sign(x) * 0.12, -len * 0.45, x === 0 ? 0.18 : 0);
    brace.rotation.set(x === 0 ? -0.35 : 0, 0, x === 0 ? 0 : Math.sign(x) * 0.3);
    leg.add(brace);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.06, 16), darkMat);
    pad.position.y = -len - 0.03;
    leg.add(pad);
    leg.scale.y = 0.02;
    leg.visible = false;
    ship.add(leg);
    legs.push(leg);
  }

  // port-side airlock with a hatch and a telescoping boarding ramp
  const hinge = new THREE.Vector3(-0.845, -0.33, -1.25);
  const rampLength = 2.15;
  const rampAngle = Math.asin(Math.min(0.95, (LEG_DROP + hinge.y) / rampLength));
  const airlock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.86, 0.52), hullMat);
  airlock.position.set(-0.7, 0.05, hinge.z);
  ship.add(airlock);
  const hatchDoor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.74, 0.36), material(0xb9bfc5, { roughness: 0.5, metalness: 0.4 }));
  hatchDoor.position.set(-0.85, 0.05, hinge.z);
  ship.add(hatchDoor);
  const doorway = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.74), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd9a6).multiplyScalar(0.75) }));
  doorway.position.set(-0.852, 0.05, hinge.z);
  doorway.rotation.y = -Math.PI / 2;
  doorway.visible = false;
  ship.add(doorway);
  const ramp = new THREE.Group();
  ramp.position.copy(hinge);
  ramp.rotation.z = rampAngle;
  ramp.visible = false;
  ship.add(ramp);
  const rampBody = new THREE.Group();
  ramp.add(rampBody);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(rampLength, 0.035, 0.42), material(0x6a7078, { roughness: 0.62, metalness: 0.45 }));
  deck.position.x = -rampLength / 2;
  rampBody.add(deck);
  for (const z of [-0.2, 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rampLength, 0.07, 0.025), darkMat);
    rail.position.set(-rampLength / 2, 0.035, z);
    rampBody.add(rail);
  }
  for (let i = 1; i < 10; i++) {
    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.014, 0.38), darkMat);
    tread.position.set(-i * rampLength / 10, 0.024, 0);
    rampBody.add(tread);
  }

  ship.traverse((obj) => { if (obj.isMesh && obj.material.isMeshStandardMaterial) { obj.castShadow = true; obj.receiveShadow = true; } });

  ship.userData = {
    plumeMats, navLights, legs, dish,
    rampTop: new THREE.Vector3(hinge.x + 0.12, hinge.y + 0.02, hinge.z),
    rampFoot: new THREE.Vector3(hinge.x - rampLength * Math.cos(rampAngle), hinge.y - rampLength * Math.sin(rampAngle) + 0.02, hinge.z),
    setRamp(t) {
      const open = t > 0.01;
      ramp.visible = open;
      doorway.visible = open;
      hatchDoor.visible = !open;
      rampBody.scale.x = Math.max(0.01, t);
    },
    setGear(t) {
      for (const leg of legs) { leg.visible = t > 0.02; leg.scale.y = Math.max(0.02, t); }
    },
    setThrottle(value, time) {
      for (const mat of plumeMats) { mat.uniforms.throttle.value = value; mat.uniforms.time.value = time; }
    },
  };
  return ship;
}

function updateShipDetails(ship, time, scanning, dt) {
  const d = ship.userData;
  d.dish.rotation.y += (scanning ? 4.5 : 0.6) * dt;
  for (const light of d.navLights) {
    const on = light.blink ? (time % 1.4) < 0.09 : true;
    light.bulb.visible = on;
  }
}

// ---------------------------------------------------------------- the surveyor
// A pressure suit built the way real EVA suits are: a hard upper torso, metal bearing rings at the
// waist, shoulders, wrists, thighs and ankles, ribbed convolute joints at the elbows and knees,
// a helmet under a visor assembly with lamps, a life-support backpack with umbilical hoses,
// gloves with fingers and lugged boots.
function fabricCanvas(colour) {
  const tex = canvasTexture([512, 512], (ctx, w) => {
    const img = ctx.createImageData(w, w);
    const rand = seeded(404);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const weave = ((x >> 1) + (y >> 1)) % 2 ? 1 : -1;
        const ripstop = x % 32 === 0 || y % 32 === 0 ? 1 : 0;
        const n = rand() - 0.5;
        const i = (y * w + x) * 4;
        if (colour) {
          const v = 233 + weave * 3 - ripstop * 10 + n * 8;
          img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 8;
        } else {
          const v = 140 + weave * 22 - ripstop * 60 + n * 16;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = colour ? 'rgba(112,104,92,0.5)' : 'rgba(10,10,10,0.9)';
    ctx.lineWidth = colour ? 2 : 4;
    for (const y of [90, 250, 410]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    for (const y of [82, 98, 242, 258, 402, 418]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }, colour);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}
TEXTURES.fabric = fabricCanvas(true);
TEXTURES.fabricBump = fabricCanvas(false);

TEXTURES.patch = canvasTexture([128, 128], (ctx) => {
  ctx.fillStyle = '#16202e'; ctx.beginPath(); ctx.arc(64, 64, 62, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#d7832f'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(64, 64, 56, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#c9d6e2'; ctx.beginPath(); ctx.arc(64, 66, 20, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e8d9bf'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(64, 66, 36, 9, -0.3, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#fff4e0'; ctx.beginPath(); ctx.arc(93, 34, 5, 0, TAU); ctx.fill();
});

TEXTURES.footprint = canvasTexture([128, 256], (ctx, w, h) => {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const sole = new Path2D();
  sole.ellipse(64, 78, 44, 62, 0, 0, TAU);
  sole.ellipse(64, 196, 36, 50, 0, 0, TAU);
  sole.rect(30, 90, 68, 106);
  ctx.save();
  ctx.clip(sole);
  ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  for (let y = 20; y < 246; y += 17) ctx.fillRect(18, y, 92, 8);
  ctx.restore();
}, false);

function roundedBox(width, height, depth, radius) {
  const s = new THREE.Shape();
  const hw = width / 2 - radius; const hh = height / 2 - radius;
  s.moveTo(-hw, -height / 2);
  s.lineTo(hw, -height / 2); s.absarc(hw, -hh, radius, -Math.PI / 2, 0, false);
  s.lineTo(width / 2, hh); s.absarc(hw, hh, radius, 0, Math.PI / 2, false);
  s.lineTo(-hw, height / 2); s.absarc(-hw, hh, radius, Math.PI / 2, Math.PI, false);
  s.lineTo(-width / 2, -hh); s.absarc(-hw, -hh, radius, Math.PI, Math.PI * 1.5, false);
  const bevel = Math.min(radius * 0.8, depth * 0.25);
  const geometry = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: 3, curveSegments: 8 });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  return geometry;
}

const HIP_HEIGHT = 1.0;

function makeAstronaut() {
  const root = new THREE.Group();
  root.name = 'Surveyor';
  const fabric = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map: TEXTURES.fabric, bumpMap: TEXTURES.fabricBump, bumpScale: 0.9,
    roughness: 0.9, metalness: 0, sheen: 0.55, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xfff4e4),
  });
  const fabricGrey = fabric.clone();
  fabricGrey.color = new THREE.Color(0xd3d3cd);
  const bootMat = fabricGrey.clone();
  bootMat.color = new THREE.Color(0xd3d3cd);
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xf1f0eb, roughness: 0.36, metalness: 0.02, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const shellDouble = shell.clone();
  shellDouble.side = THREE.DoubleSide;
  const metal = material(0xb3b9c0, { roughness: 0.26, metalness: 0.92 });
  const rubber = material(0x26282c, { roughness: 0.88 });
  const panel = material(0x343a42, { roughness: 0.55, metalness: 0.35 });
  const amber = material(0xd27c2c, { roughness: 0.7 });
  const hoseMat = material(0x5a6470, { roughness: 0.5, metalness: 0.25 });
  const visorMat = new THREE.MeshPhysicalMaterial({ color: 0xd6a03e, metalness: 1, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.4, side: THREE.DoubleSide });
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.8, depthWrite: false });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(1.4) });
  const displayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fe0c8).multiplyScalar(0.85) });

  const add = (geometry, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const ring = (radius, tube, parent, y, axis = 'y', mat = metal) => {
    const m = add(new THREE.TorusGeometry(radius, tube, 10, 44), mat, parent, 0, y, 0);
    if (axis === 'y') m.rotation.x = Math.PI / 2;
    else m.rotation.y = Math.PI / 2;
    return m;
  };
  const bellows = (radius, tube, count, parent, top, step) => {
    for (let i = 0; i < count; i++) ring(radius * (1 - Math.abs(i - (count - 1) / 2) * 0.035), tube, parent, top - i * step, 'y', fabricGrey);
  };
  const limb = (r1, r2, length, mat, parent, top) => add(new THREE.CylinderGeometry(r1, r2, length, 26, 3), mat, parent, 0, top - length / 2, 0);
  const lathe = (points, mat, parent, segments = 36) => add(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments), mat, parent);

  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);
  lathe([[0.001, -0.2], [0.09, -0.195], [0.15, -0.16], [0.178, -0.09], [0.186, -0.02], [0.182, 0.05]], fabric, hips).scale.z = 0.84;
  ring(0.181, 0.02, hips, 0.05).scale.set(1, 0.84, 1);

  const torso = new THREE.Group();
  torso.position.y = 0.06;
  hips.add(torso);
  lathe([[0.178, -0.02], [0.2, 0.08], [0.226, 0.18], [0.24, 0.25]], fabric, torso).scale.z = 0.82;
  lathe([[0.232, 0.17], [0.262, 0.24], [0.282, 0.33], [0.288, 0.42], [0.272, 0.5], [0.226, 0.555], [0.165, 0.585], [0.14, 0.592]], shell, torso, 44).scale.set(1.05, 1, 0.8);
  ring(0.135, 0.024, torso, 0.6).scale.set(1, 0.92, 1);

  // display and control module on the chest
  const dcm = new THREE.Group();
  dcm.position.set(0, 0.35, -0.255);
  dcm.rotation.x = -0.3;
  torso.add(dcm);
  add(roundedBox(0.25, 0.12, 0.08, 0.022), shell, dcm);
  add(new THREE.BoxGeometry(0.1, 0.042, 0.004), displayMat, dcm, 0.05, 0.022, -0.043);
  for (const [x, color] of [[-0.08, 0x2d3238], [-0.035, 0xd27c2c], [0.095, 0x2d3238]]) {
    const knob = add(new THREE.CylinderGeometry(0.014, 0.016, 0.024, 16), material(color, { roughness: 0.5, metalness: 0.3 }), dcm, x, -0.028, -0.046);
    knob.rotation.x = Math.PI / 2;
  }

  // portable life-support backpack and secondary oxygen pack
  const pack = new THREE.Group();
  pack.position.set(0, 0.31, 0.3);
  torso.add(pack);
  add(roundedBox(0.5, 0.68, 0.22, 0.055), shell, pack);
  add(roundedBox(0.44, 0.15, 0.2, 0.04), shell, pack, 0, -0.44, -0.005);
  add(new THREE.BoxGeometry(0.505, 0.04, 0.226), amber, pack, 0, 0.2, 0);
  add(new THREE.BoxGeometry(0.3, 0.014, 0.1), panel, pack, 0, 0.343, 0);
  add(roundedBox(0.38, 0.4, 0.012, 0.03), material(0xdedcd5, { roughness: 0.55 }), pack, 0, -0.06, 0.112);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.2, 0.012, 0.006), panel, pack, 0, -0.05 - i * 0.045, 0.12);
  for (const side of [-1, 1]) {
    const handle = add(new THREE.TorusGeometry(0.045, 0.008, 8, 20, Math.PI), metal, pack, side * 0.255, 0.05, 0);
    handle.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }
  const antenna = add(new THREE.CylinderGeometry(0.006, 0.01, 0.32, 8), metal, pack, -0.19, 0.48, 0.04);
  add(new THREE.SphereGeometry(0.014, 10, 8), amber, antenna, 0, 0.16, 0);
  const packLamp = add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 16), panel, pack, 0.17, 0.37, -0.03);
  packLamp.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.12, 0.33, -0.275), new THREE.Vector3(side * 0.235, 0.28, -0.2),
      new THREE.Vector3(side * 0.285, 0.2, -0.02), new THREE.Vector3(side * 0.235, 0.17, 0.2),
    ]);
    add(new THREE.TubeGeometry(curve, 32, 0.017, 10), hoseMat, torso);
  }

  // helmet: clear pressure bubble, hard visor assembly over top and back, gold sun visor, lamps
  const helmet = new THREE.Group();
  helmet.position.set(0, 0.74, -0.01);
  torso.add(helmet);
  const front = Math.PI * 1.5;
  add(new THREE.SphereGeometry(0.17, 36, 24), bubbleMat, helmet).scale.set(1, 1.04, 1.06);
  add(new THREE.SphereGeometry(0.188, 44, 26, front + 1.25, TAU - 2.5, 0, 2.05), shellDouble, helmet).scale.set(1, 1.04, 1.06);
  add(new THREE.SphereGeometry(0.189, 44, 10, 0, TAU, 0, 0.6), shell, helmet).scale.set(1, 1.04, 1.06);
  add(new THREE.SphereGeometry(0.183, 44, 22, front - 1.28, 2.56, 0.52, 1.12), visorMat, helmet).scale.set(1, 1.04, 1.06);
  for (const side of [-1, 1]) {
    const pod = add(new THREE.CylinderGeometry(0.02, 0.023, 0.075, 18), shell, helmet, side * 0.15, 0.14, -0.07);
    pod.rotation.x = Math.PI / 2;
    const lens = add(new THREE.CircleGeometry(0.016, 20), lampMat, helmet, side * 0.15, 0.14, -0.108);
    lens.rotation.y = Math.PI;
  }
  add(new THREE.BoxGeometry(0.03, 0.026, 0.045), panel, helmet, -0.15, 0.175, -0.05);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 0.47, 0.01);
    torso.add(shoulder);
    ring(0.098, 0.02, shoulder, 0, 'x').position.x = side * 0.02;
    add(new THREE.SphereGeometry(0.1, 26, 18), fabric, shoulder, side * 0.035, -0.01, 0);
    const arm = new THREE.Group();
    arm.position.x = side * 0.06;
    shoulder.add(arm);
    limb(0.088, 0.078, 0.27, fabric, arm, -0.03);
    limb(0.0905, 0.0905, 0.035, amber, arm, -0.055);
    if (side < 0) {
      const patch = add(new THREE.CircleGeometry(0.042, 28), material(0xffffff, { map: TEXTURES.patch, roughness: 0.8 }), arm, -0.0895, -0.15, 0);
      patch.rotation.y = -Math.PI / 2;
    }
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    arm.add(elbow);
    bellows(0.078, 0.016, 4, elbow, 0.03, 0.026);
    limb(0.075, 0.062, 0.21, fabric, elbow, -0.05);
    ring(0.061, 0.014, elbow, -0.265);
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);
    limb(0.06, 0.068, 0.06, fabricGrey, hand, 0);
    add(new THREE.SphereGeometry(0.053, 22, 16), fabricGrey, hand, 0, -0.09, 0).scale.set(0.7, 1.15, 1.05);
    add(new THREE.SphereGeometry(0.045, 18, 12), rubber, hand, -side * 0.013, -0.095, 0).scale.set(0.5, 1, 0.85);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Group();
      finger.position.set(0, -0.14, -0.03 + f * 0.02);
      finger.rotation.z = -side * 0.35;
      hand.add(finger);
      add(new THREE.CapsuleGeometry(0.014, f === 1 || f === 2 ? 0.046 : 0.038, 4, 10), fabricGrey, finger, 0, -0.025, 0);
    }
    const thumb = new THREE.Group();
    thumb.position.set(-side * 0.01, -0.08, -0.045);
    thumb.rotation.set(0.7, 0, -side * 0.4);
    hand.add(thumb);
    add(new THREE.CapsuleGeometry(0.0155, 0.035, 4, 10), fabricGrey, thumb, 0, -0.025, 0);
    arms.push({ shoulder, arm, elbow, hand, side });
  }

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.1, 0);
    hips.add(hip);
    ring(0.103, 0.017, hip, -0.06);
    limb(0.112, 0.092, 0.33, fabric, hip, -0.02);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    bellows(0.088, 0.017, 5, knee, 0.06, 0.028);
    limb(0.084, 0.072, 0.27, fabric, knee, -0.07);
    const ankle = new THREE.Group();
    ankle.position.y = -0.36;
    knee.add(ankle);
    ring(0.074, 0.014, ankle, 0.02);
    limb(0.079, 0.086, 0.1, bootMat, ankle, 0);
    const foot = add(new THREE.CapsuleGeometry(0.062, 0.15, 6, 16), bootMat, ankle, 0, -0.058, -0.05);
    foot.rotation.x = Math.PI / 2;
    foot.scale.set(1.12, 1, 0.72);
    add(new THREE.BoxGeometry(0.14, 0.028, 0.3), rubber, ankle, 0, -0.098, -0.05);
    for (let t = 0; t < 5; t++) add(new THREE.BoxGeometry(0.142, 0.01, 0.02), rubber, ankle, 0, -0.114, -0.17 + t * 0.06);
    legs.push({ hip, knee, ankle, side });
  }

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const glow = obj.material === lampMat || obj.material === displayMat || obj.material === bubbleMat;
    obj.castShadow = !glow;
    obj.receiveShadow = !glow;
  });
  root.userData = {
    hips, torso, helmet, arms, legs, pose: {},
    setDust(hex) { bootMat.color.setHex(0xd3d3cd).lerp(new THREE.Color(hex), 0.38); },
  };
  return root;
}

// Pose targets for walking, the low-gravity lope, jumping, crouching to collect and standing idle,
// blended smoothly so the surveyor never snaps between movements.
function animateAstronaut(model, w, dt, lowGravity, time) {
  const r = model.userData;
  const speed = Math.abs(w.speed);
  const amp = clamp(speed / 3.4, 0, 1.35);
  const s = Math.sin(w.phase);
  const c = Math.cos(w.phase);
  const t = {
    hipY: HIP_HEIGHT, hipX: 0, hipYaw: 0, torsoYaw: 0, torsoPitch: 0.03, head: 0,
    thigh: [0.02, 0], knee: [-0.07, -0.05], ankle: [0.05, 0.05], arm: [0, 0], out: [0.16, 0.16], elbow: [0.32, 0.32],
  };
  if (w.action && w.action.type === 'reach') {
    const k = Math.sin(Math.PI * clamp(w.action.t / w.action.duration, 0, 1));
    t.hipY = HIP_HEIGHT - 0.3 * k;
    t.thigh = [0.95 * k, 0.5 * k]; t.knee = [-1.45 * k, -1.0 * k]; t.ankle = [0.5 * k, 0.5 * k];
    t.torsoPitch = 0.42 * k; t.head = 0.3 * k;
    t.arm = [0.2 * k, 1.1 * k]; t.out = [0.2, 0.08]; t.elbow = [0.5, 0.2];
  } else if (!w.onGround) {
    t.thigh = [0.55, -0.05]; t.knee = [-0.95, -0.45]; t.ankle = [0.35, 0.25];
    t.arm = [-0.2, 0.35]; t.out = [0.5, 0.5]; t.elbow = [0.55, 0.55]; t.torsoPitch = 0.08;
  } else if (lowGravity && speed > 1.3) {
    const hop = Math.max(0, s);
    t.hipY = HIP_HEIGHT + hop * 0.16 * amp - 0.05 * amp;
    t.thigh = [0.42 * Math.sin(w.phase + 0.4) * amp, 0.42 * Math.sin(w.phase - 0.4) * amp];
    t.knee = [-(0.3 + 0.55 * Math.max(0, -s)) * amp, -(0.3 + 0.55 * Math.max(0, -Math.sin(w.phase - 0.3))) * amp];
    t.ankle = [-(t.thigh[0] + t.knee[0]) * 0.6, -(t.thigh[1] + t.knee[1]) * 0.6];
    t.arm = [0.15 + 0.2 * s, 0.15 + 0.2 * s]; t.out = [0.4, 0.4]; t.elbow = [0.6, 0.6];
    t.torsoPitch = 0.14 * amp; t.head = -0.06 * amp;
  } else if (speed > 0.05 || w.turning) {
    const a = Math.max(amp, w.turning ? 0.25 : 0);
    t.thigh = [0.5 * a * s, -0.5 * a * s];
    t.knee = [-(0.08 + Math.max(0, c) ** 1.5) * a, -(0.08 + Math.max(0, -c) ** 1.5) * a];
    t.ankle = [-(t.thigh[0] + t.knee[0]) * 0.7, -(t.thigh[1] + t.knee[1]) * 0.7];
    t.hipY = HIP_HEIGHT - 0.03 * a + 0.03 * a * Math.abs(c);
    t.hipX = 0.02 * a * c;
    t.hipYaw = -0.09 * a * s; t.torsoYaw = 0.15 * a * s;
    t.arm = [-0.34 * a * s, 0.34 * a * s];
    t.elbow = [0.26 + 0.24 * a * Math.max(0, -s), 0.26 + 0.24 * a * Math.max(0, s)];
    t.torsoPitch = 0.03 + 0.07 * a;
  } else {
    t.hipX = 0.012 * Math.sin(time * 0.6);
    t.arm = [0.04 * Math.sin(time * 0.8), -0.04 * Math.sin(time * 0.8 + 0.5)];
  }

  const p = r.pose;
  const blend = (key, target) => { p[key] = p[key] === undefined ? target : damp(p[key], target, 16, dt); return p[key]; };
  r.hips.position.y = blend('hipY', t.hipY);
  r.hips.position.x = blend('hipX', t.hipX);
  r.hips.rotation.y = blend('hipYaw', t.hipYaw);
  r.torso.rotation.y = blend('torsoYaw', t.torsoYaw);
  r.torso.rotation.x = -blend('torsoPitch', t.torsoPitch);
  r.helmet.rotation.x = -blend('head', t.head);
  const breath = Math.sin(time * 1.8);
  r.torso.scale.set(1 + 0.006 * breath, 1 + 0.004 * breath, 1 + 0.008 * breath);
  r.legs.forEach((leg, i) => {
    leg.hip.rotation.x = blend(`thigh${i}`, t.thigh[i]);
    leg.knee.rotation.x = blend(`knee${i}`, t.knee[i]);
    leg.ankle.rotation.x = blend(`ankle${i}`, t.ankle[i]);
  });
  r.arms.forEach((arm, i) => {
    arm.arm.rotation.x = blend(`arm${i}`, t.arm[i]);
    arm.shoulder.rotation.z = arm.side * blend(`out${i}`, t.out[i]);
    arm.elbow.rotation.x = blend(`elbow${i}`, t.elbow[i]);
  });
}

function makeFootprints(planet) {
  const colors = { desert: 0x6a3a22, tidal: 0x56584f, ice: 0x8ca5c4 };
  const geometry = new THREE.PlaneGeometry(0.17, 0.33);
  geometry.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: colors[planet.kind], alphaMap: TEXTURES.footprint, transparent: true, opacity: 0.62, roughness: 1,
    depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geometry, mat, 140);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return { mesh, next: 0 };
}

const printPos = new THREE.Vector3();
const printNormal = new THREE.Vector3();
const printQuat = new THREE.Quaternion();
const printYaw = new THREE.Quaternion();
const printMatrix = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const MIRROR = new THREE.Vector3(-1, 1, 1);
function plantFootprint(legIndex) {
  const prints = world.footprints;
  if (!prints) return;
  world.astronaut.updateMatrixWorld(true);
  world.astronaut.userData.legs[legIndex].ankle.getWorldPosition(printPos);
  const terrain = world.terrain;
  const ground = terrain.heightAt(printPos.x, printPos.z);
  if (world.water && ground < 0.08) return;
  printNormal.set(terrain.heightAt(printPos.x - 0.3, printPos.z) - terrain.heightAt(printPos.x + 0.3, printPos.z), 0.6,
    terrain.heightAt(printPos.x, printPos.z - 0.3) - terrain.heightAt(printPos.x, printPos.z + 0.3)).normalize();
  printQuat.setFromUnitVectors(UP, printNormal).multiply(printYaw.setFromAxisAngle(UP, world.walker.heading));
  printPos.y = ground + 0.012;
  printMatrix.compose(printPos, printQuat, legIndex === 0 ? MIRROR : ONE);
  const slot = prints.next % prints.mesh.instanceMatrix.count;
  prints.mesh.setMatrixAt(slot, printMatrix);
  prints.mesh.instanceMatrix.needsUpdate = true;
  prints.next++;
  prints.mesh.count = Math.min(prints.next, prints.mesh.instanceMatrix.count);
}

// Advances the walk cycle, poses the suit and leaves boot prints at each footfall.
function stepAstronaut(dt, leavePrints = true) {
  const w = world.walker;
  const lowGravity = world.planet.gravity < 0.5;
  const speed = Math.abs(w.speed);
  const loping = lowGravity && speed > 1.3;
  const previous = w.phase;
  if (w.turning && speed < 0.4) w.phase += dt * 5.5;
  else w.phase += speed * dt * (loping ? 2.0 : 2.7);
  world.astronaut.position.copy(w.pos);
  world.astronaut.rotation.y = w.heading;
  animateAstronaut(world.astronaut, w, dt, lowGravity, visualTime);
  if (!leavePrints || !w.onGround || speed < 0.3) return;
  if (loping) {
    if (Math.floor((w.phase - Math.PI) / TAU) !== Math.floor((previous - Math.PI) / TAU)) { plantFootprint(0); plantFootprint(1); }
  } else {
    const now = Math.floor((w.phase - Math.PI / 2) / Math.PI);
    if (now !== Math.floor((previous - Math.PI / 2) / Math.PI)) plantFootprint(((now % 2) + 2) % 2 === 0 ? 0 : 1);
  }
}

// Walks a polyline at a fixed pace; returns true once the end is reached.
function followPath(points, distance, out, dir) {
  let remaining = distance;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    const len = a.distanceTo(b);
    const last = i === points.length - 2;
    if (remaining <= len || last) {
      const k = len > 0 ? clamp(remaining / len, 0, 1) : 1;
      out.lerpVectors(a, b, k);
      dir.subVectors(b, a).setY(0);
      if (dir.lengthSq() > 1e-6) dir.normalize();
      return last && k >= 1;
    }
    remaining -= len;
  }
  return true;
}
const pathLength = (points) => points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);

function cinematicCamera(dt, focus) {
  const desired = tmpV2.copy(world.rampFoot).addScaledVector(world.rampOut, 6).addScaledVector(world.shipForward, 4.2);
  desired.y = world.rampFoot.y + 2.3;
  camera.position.lerp(desired, 1 - Math.exp(-2.5 * dt));
  camera.lookAt(focus.x, focus.y + 1.15, focus.z);
}

// ---------------------------------------------------------------- scene management
let scene = new THREE.Scene();
const world = { mode: 'orbit' };
let gameStarted = false;
let busy = false;
let visualTime = 0;
let scanning = null;
let shake = 0;
const toastGate = new Map();

function gatedToast(key, message, seconds = 6, duration) {
  const now = performance.now() / 1000;
  if ((toastGate.get(key) || -1e9) + seconds > now) return false;
  toastGate.set(key, now);
  showToast(message, duration);
  return true;
}

function resetScene() {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    mats.forEach((m) => m.dispose());
  });
  if (world.envTarget) { world.envTarget.dispose(); world.envTarget = null; }
  scene = new THREE.Scene();
  for (const key of Object.keys(world)) if (key !== 'mode') delete world[key];
}

// ---------------------------------------------------------------- orbit scene
function makeStarfield() {
  const rand = seeded(82);
  const count = coarse ? 2600 : 4200;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const band = new THREE.Vector3(0.25, 0.9, 0.36).normalize();
  const classes = [[0x9bb0ff, 0.03], [0xaabfff, 0.07], [0xcad7ff, 0.12], [0xf8f7ff, 0.2], [0xfff4ea, 0.24], [0xffd2a1, 0.22], [0xffcc6f, 0.12]];
  const color = new THREE.Color();
  const dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    for (;;) {
      dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
      const len = dir.length();
      if (len > 1 || len < 0.01) continue;
      dir.divideScalar(len);
      if (rand() < 0.45 && Math.abs(dir.dot(band)) > 0.18 + rand() * 0.2) continue;
      break;
    }
    positions.set([dir.x * 1400, dir.y * 1400, dir.z * 1400], i * 3);
    let pick = rand();
    let hex = classes[classes.length - 1][0];
    for (const [h, weight] of classes) { if (pick < weight) { hex = h; break; } pick -= weight; }
    const magnitude = Math.pow(rand(), 5.5);
    color.setHex(hex).multiplyScalar(0.18 + magnitude * 2.4);
    tints.set([color.r, color.g, color.b], i * 3);
    sizes[i] = 1.4 + magnitude * 3.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: POINTS_VS, fragmentShader: POINTS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
  }));
  points.frustumCulled = false;
  points.renderOrder = -9;
  return points;
}

function makeMotes({ color, count, box, size, opacity, drift = [0, 0, 0], blending = THREE.AdditiveBlending, seed = 4 }) {
  const rand = seeded(seed);
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([rand() * box, rand() * box, rand() * box], i * 3);
    phases[i] = rand() * TAU;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const motes = new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader: MOTES_VS, fragmentShader: MOTES_FS, transparent: true, depthWrite: false, blending,
    uniforms: {
      focus: { value: new THREE.Vector3() }, box: { value: box }, size: { value: size }, pixelRatio: { value: renderer.getPixelRatio() },
      drift: { value: new THREE.Vector3(...drift) }, time: { value: 0 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity },
    },
  }));
  motes.frustumCulled = false;
  return motes;
}

function makePlanet(planet) {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = planet.tilt;
  group.add(tilt);
  const spin = new THREE.Group();
  tilt.add(spin);
  const sunColor = new THREE.Color(0xfff2e2).multiplyScalar(1.05);
  const surfaceMat = new THREE.ShaderMaterial({
    vertexShader: WORLD_VS, fragmentShader: PLANET_FS,
    uniforms: {
      map: { value: TEXTURES[planet.id] }, sunPos: { value: new THREE.Vector3() }, sunColor: { value: sunColor },
      atmo: { value: new THREE.Color(planet.atmosphere.color) }, atmoStrength: { value: planet.atmosphere.strength },
      specStrength: { value: planet.spec }, night: { value: 0.004 },
    },
  });
  spin.add(new THREE.Mesh(new THREE.SphereGeometry(planet.radius, 128, 64), surfaceMat));

  let cloudSpin = null;
  if (planet.clouds) {
    cloudSpin = new THREE.Group();
    tilt.add(cloudSpin);
    cloudSpin.add(new THREE.Mesh(new THREE.SphereGeometry(planet.radius * 1.012, 96, 48), new THREE.ShaderMaterial({
      vertexShader: WORLD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false,
      uniforms: { map: { value: TEXTURES[`${planet.id}:clouds`] }, sunPos: { value: new THREE.Vector3() }, sunColor: { value: sunColor } },
    })));
  }

  const outer = planet.radius * planet.atmosphere.scale;
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(outer, 64, 32), new THREE.ShaderMaterial({
    vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      center: { value: group.position }, radius: { value: planet.radius }, outer: { value: outer },
      color: { value: new THREE.Color(planet.atmosphere.color) }, sunPos: { value: new THREE.Vector3() }, strength: { value: planet.atmosphere.strength * 1.3 },
    },
  }));
  group.add(atmosphere);

  if (planet.rings) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(planet.radius * planet.rings.inner, planet.radius * planet.rings.outer, 192, 1),
      new THREE.ShaderMaterial({
        vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          inner: { value: planet.radius * planet.rings.inner }, outer: { value: planet.radius * planet.rings.outer },
          planetR: { value: planet.radius }, planetCenter: { value: group.position }, sunPos: { value: new THREE.Vector3() },
          sunColor: { value: sunColor }, colA: { value: new THREE.Color(planet.rings.colA) }, colB: { value: new THREE.Color(planet.rings.colB) },
        },
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }
  return { planet, group, spin, cloudSpin };
}

function makeStar() {
  const group = new THREE.Group();
  const star = new THREE.Mesh(new THREE.SphereGeometry(6, 96, 48), new THREE.ShaderMaterial({
    vertexShader: STAR_VS, fragmentShader: NOISE_GLSL + STAR_FS,
    uniforms: { time: { value: 0 }, core: { value: new THREE.Color(0xfff6ea) }, limb: { value: new THREE.Color(0xff9b45) } },
  }));
  group.add(star);
  const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEXTURES.glow, color: 0xffd9a8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
  inner.scale.setScalar(30);
  const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEXTURES.glow, color: 0xff9a52, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.28 }));
  outer.scale.setScalar(96);
  group.add(inner, outer);
  group.userData.material = star.material;
  return group;
}

function makeBelt() {
  const rand = seeded(441);
  const group = new THREE.Group();
  const variants = [rockGeometry(1.7, 2, 0.38, 0.8), rockGeometry(5.2, 2, 0.32, 0.65), rockGeometry(9.9, 2, 0.45, 0.9)];
  const rocks = [];
  const buckets = variants.map(() => []);
  for (let i = 0; i < BELT.count; i++) {
    const angle = rand() * TAU;
    const radius = lerp(BELT.inner, BELT.outer, (rand() + rand()) / 2);
    const size = 0.14 + Math.pow(rand(), 3) * 1.15;
    const rock = { x: Math.cos(angle) * radius, y: (rand() + rand() + rand() - 1.5) * 1.3, z: Math.sin(angle) * radius, r: size };
    rocks.push(rock);
    buckets[i % variants.length].push({ ...rock, rot: [rand() * TAU, rand() * TAU, rand() * TAU], scale: [size, size * (0.7 + rand() * 0.4), size * (0.8 + rand() * 0.5)], shade: 0.75 + rand() * 0.35 });
  }
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const s = new THREE.Vector3(); const p = new THREE.Vector3();
  const tint = new THREE.Color();
  variants.forEach((geometry, v) => {
    const list = buckets[v];
    const mesh = new THREE.InstancedMesh(geometry, material(0xffffff, { roughness: 0.95, metalness: 0.04 }), list.length);
    list.forEach((rock, i) => {
      q.setFromEuler(e.set(...rock.rot));
      m.compose(p.set(rock.x, rock.y, rock.z), q, s.set(...rock.scale));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.setHex(i % 4 === 0 ? 0x7a6a5d : 0x6b6560).multiplyScalar(rock.shade));
    });
    group.add(mesh);
  });
  group.userData.rocks = rocks;
  return group;
}

function orbitLine(radius) {
  const points = [];
  for (let i = 0; i <= 256; i++) { const a = (i / 256) * TAU; points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x8aa6bf, transparent: true, opacity: 0.11, depthWrite: false }));
}

function buildOrbit() {
  resetScene();
  world.mode = 'orbit';
  state.mode = 'orbit';
  scanning = null;
  scene.background = new THREE.Color(0x000000);
  scene.environment = orbitEnvironment();
  scene.environmentIntensity = 1.2;
  renderer.toneMappingExposure = 1.0;

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 32), new THREE.ShaderMaterial({
    vertexShader: SKYMAP_VS, fragmentShader: SKYMAP_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: { map: { value: TEXTURES.nebula }, gain: { value: 1 } },
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  const stars = makeStarfield();
  scene.add(stars);
  world.backdrop = [sky, stars];

  world.star = makeStar();
  scene.add(world.star);
  scene.add(new THREE.PointLight(0xfff0dc, 2.6, 0, 0));
  scene.add(new THREE.HemisphereLight(0xa9bad4, 0x15171c, 0.32));

  world.planets = PLANETS.map((planet) => {
    scene.add(orbitLine(planet.orbit));
    const entry = makePlanet(planet);
    scene.add(entry.group);
    return entry;
  });
  world.belt = makeBelt();
  scene.add(world.belt);

  world.ship = makeShip();
  world.ship.scale.setScalar(ORBIT_SHIP_SCALE);
  world.ship.position.fromArray(state.ship.pos);
  world.ship.position.y = 0;
  world.shipVel = new THREE.Vector3().fromArray(state.ship.vel || [0, 0, 0]);
  world.heading = state.ship.heading || 0;
  world.yawRate = 0;
  world.throttle = 0;
  world.bank = 0;
  world.ship.rotation.y = world.heading;
  scene.add(world.ship);

  world.motes = makeMotes({ color: 0xbcd2ff, count: 420, box: 30, size: 0.05, opacity: 0.55, seed: 9 });
  scene.add(world.motes);

  ui.mode.textContent = 'ORBITAL FLIGHT';
  placePlanets(state.time);
  const forward = shipForward(world.heading);
  camera.position.copy(world.ship.position).addScaledVector(forward, -7).add(new THREE.Vector3(0, 2.6, 0));
  camera.lookAt(world.ship.position);
  camera.fov = 58;
  camera.updateProjectionMatrix();
  updateHUD();
}

function placePlanets(time) {
  for (const entry of world.planets) {
    planetPosition(entry.planet, time, entry.group.position);
    entry.spin.rotation.y = TAU * visualTime / entry.planet.day;
    if (entry.cloudSpin) entry.cloudSpin.rotation.y = TAU * visualTime / (entry.planet.day * 0.82);
  }
  world.belt.rotation.y = TAU * time / kepler(42);
}

const shipForward = (heading, target = new THREE.Vector3()) => target.set(-Math.sin(heading), 0, -Math.cos(heading));

function nearestPlanetInfo() {
  let best = null;
  for (const entry of world.planets) {
    const distance = world.ship.position.distanceTo(entry.group.position) - entry.planet.radius;
    if (!best || distance < best.altitude) best = { entry, planet: entry.planet, altitude: distance };
  }
  return best;
}
const scanRange = (planet) => planet.radius * 0.5 + 8;

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const forwardV = new THREE.Vector3();

function updateOrbit(dt, playing) {
  if (playing && !busy) state.time += dt;
  placePlanets(state.time);
  world.star.userData.material.uniforms.time.value = visualTime;
  world.star.rotation.y = visualTime * 0.01;
  for (const node of world.backdrop) node.position.copy(camera.position);

  const ship = world.ship;
  const boosting = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const turnInput = playing && !busy ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) : 0;
  const thrustInput = playing && !busy ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 0.7 : 0) : 0;

  world.yawRate = damp(world.yawRate, turnInput * 1.55, 5, dt);
  world.heading += world.yawRate * dt;
  const forward = shipForward(world.heading, forwardV);
  const vel = world.shipVel;
  vel.addScaledVector(forward, thrustInput * (boosting && thrustInput > 0 ? 15 : 8) * dt);

  let along = vel.dot(forward);
  const lateral = tmpV.copy(vel).addScaledVector(forward, -along);
  lateral.multiplyScalar(Math.exp(-2.4 * dt));
  if (thrustInput === 0) along *= Math.exp(-0.32 * dt);
  const maxSpeed = boosting ? 16 : 9.5;
  if (along > maxSpeed) along = damp(along, maxSpeed, 3, dt);
  if (along < -3.5) along = damp(along, -3.5, 3, dt);
  vel.copy(forward).multiplyScalar(along).add(lateral);
  vel.y = 0;
  ship.position.addScaledVector(vel, dt);

  // world bounds
  const radial = Math.hypot(ship.position.x, ship.position.z);
  if (radial > SYSTEM_RADIUS) {
    tmpV.set(ship.position.x, 0, ship.position.z).normalize();
    vel.addScaledVector(tmpV, -(radial - SYSTEM_RADIUS) * 8 * dt);
    gatedToast('edge', 'Survey boundary · turn back toward Veyra.', 8);
  }

  // star heat and exclusion zone
  const starDistance = ship.position.length();
  const heat = smoothstep(16, 9, starDistance);
  world.heat = heat;
  if (starDistance < 9) {
    tmpV.copy(ship.position).normalize();
    ship.position.copy(tmpV.multiplyScalar(9));
    const inward = vel.dot(tmpV.normalize());
    if (inward < 0) vel.addScaledVector(tmpV, -inward * 1.4);
    if (gatedToast('heat', 'Hull temperature critical · heat shield forced a burn away from Veyra.', 6, 3200)) sounds.warn();
  } else if (heat > 0.5) {
    gatedToast('heat-warn', 'Hull temperature rising · turn away from the star.', 10);
  }

  // planets are solid
  for (const entry of world.planets) {
    const minDistance = entry.planet.radius * entry.planet.atmosphere.scale + 0.9;
    tmpV.subVectors(ship.position, entry.group.position);
    const d = tmpV.length();
    if (d < minDistance) {
      tmpV.normalize();
      ship.position.copy(entry.group.position).addScaledVector(tmpV, minDistance);
      const inward = vel.dot(tmpV);
      if (inward < 0) vel.addScaledVector(tmpV, -inward * 1.2);
      gatedToast(`close-${entry.planet.id}`, `Too low over ${entry.planet.name} · press L for a controlled descent.`, 7);
    }
  }

  // asteroid belt collisions (rocks live in the belt's rotating frame)
  if (radial > BELT.inner - 2 && radial < BELT.outer + 2) {
    const angle = -world.belt.rotation.y;
    const cos = Math.cos(angle); const sin = Math.sin(angle);
    const lx = ship.position.x * cos + ship.position.z * sin;
    const lz = -ship.position.x * sin + ship.position.z * cos;
    for (const rock of world.belt.userData.rocks) {
      const dx = lx - rock.x; const dy = -rock.y; const dz = lz - rock.z;
      const reach = rock.r + 0.75;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < reach * reach && Math.abs(dy) < reach) {
        const d = Math.sqrt(dx * dx + dz * dz) || 0.001;
        const nx = dx / d; const nz = dz / d;
        const wx = nx * Math.cos(angle) - nz * Math.sin(angle);
        const wz = nx * Math.sin(angle) + nz * Math.cos(angle);
        tmpV.set(wx, 0, wz);
        ship.position.addScaledVector(tmpV, reach - d + 0.05);
        const inward = vel.dot(tmpV);
        if (inward < 0) { vel.addScaledVector(tmpV, -inward * 1.5); vel.multiplyScalar(0.6); }
        if (!reducedMotion) shake = Math.min(1, shake + 0.6);
        if (Math.abs(inward) > 1.5) { sounds.impact(); gatedToast('debris', 'Debris strike · shields holding. Thread the belt slowly.', 5); }
      }
    }
  }

  ship.position.y = Math.sin(visualTime * 1.3) * 0.04;
  world.throttle = damp(world.throttle, Math.max(0, thrustInput) * (boosting ? 1.35 : 1), 6, dt);
  world.bank = damp(world.bank, world.yawRate * 0.32, 4, dt);
  ship.rotation.y = world.heading;
  ship.rotation.z = world.bank;
  ship.rotation.x = damp(ship.rotation.x, -thrustInput * 0.04, 3, dt);
  ship.userData.setThrottle(0.15 + world.throttle * 0.95, visualTime);
  updateShipDetails(ship, visualTime, !!scanning, dt);
  sounds.engine(playing ? 0.08 + world.throttle * 0.7 : 0);
  sounds.wind(0);

  state.ship.pos = ship.position.toArray();
  state.ship.vel = vel.toArray();
  state.ship.heading = world.heading;

  // chase camera
  const speed = vel.length();
  const back = (6.2 + speed * 0.12) * (camera.aspect < 0.9 ? 1.45 : 1);
  const desired = tmpV2.copy(ship.position).addScaledVector(forward, -back).add(tmpV.set(0, 2.3 + speed * 0.03, 0));
  camera.position.lerp(desired, 1 - Math.exp(-4.5 * dt));
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * shake * 0.3;
    shake = Math.max(0, shake - dt * 2.5);
  }
  camera.lookAt(tmpV.copy(ship.position).addScaledVector(forward, 5).add(tmpV2.set(0, 0.6, 0)));
  const fov = damp(camera.fov, boosting && thrustInput > 0 ? 66 : 58, 3, dt);
  if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  world.motes.material.uniforms.focus.value.copy(camera.position);
  world.motes.material.uniforms.time.value = visualTime;

  // scanning
  const near = nearestPlanetInfo();
  world.near = near;
  if (scanning) {
    const entry = world.planets.find((item) => item.planet.id === scanning.id);
    const distance = ship.position.distanceTo(entry.group.position) - entry.planet.radius;
    if (distance > scanRange(entry.planet)) {
      scanning = null;
      showToast('Signal lost · stay within range until the scan completes.');
    } else if (playing) {
      scanning.progress += dt / SCAN_TIME;
      scanning.tick -= dt;
      if (scanning.tick <= 0) { sounds.scanTick(scanning.progress); scanning.tick = 0.32; }
      if (scanning.progress >= 1) completeScan(entry.planet);
    }
  }
  updateOrbitHUD(near, speed);
}

function updateOrbitHUD(near, speed) {
  const planet = near?.planet;
  const inScanRange = planet && near.altitude <= scanRange(planet);
  const scanned = planet && state.scans.includes(planet.id);
  const allScanned = state.scans.length === PLANETS.length;
  const heat = world.heat || 0;

  setText(ui.speedLabel, 'VELOCITY');
  setText(ui.speed, `${speed.toFixed(1)} KM/S`);
  setText(ui.vitalLabel, 'HULL TEMP');
  setText(ui.vital, `${Math.round(20 + heat * 1180)} °C`);
  ui.vitalTile.classList.toggle('warn', heat > 0.35);
  ui.vitalTile.classList.toggle('alert', heat > 0.75);

  setText(ui.targetKicker, 'NEAREST WORLD');
  setText(ui.target, planet ? planet.name.toUpperCase() : 'NO TARGET');
  setText(ui.distance, planet ? `${Math.max(0, Math.round(near.altitude * 1000)).toLocaleString('en-US')} KM` : '—');
  setText(ui.targetType, scanned ? `${planet.type} · ${planet.signal}` : 'Unresolved body · scan to chart it');
  renderFacts(scanned ? planet : null);
  ui.proximity.classList.toggle('near', !!inScanRange);

  const isScanningThis = scanning && planet && scanning.id === planet.id;
  ui.primary.disabled = !inScanRange || scanned || !!scanning;
  setText(ui.primaryLabel, isScanningThis ? `${Math.floor(scanning.progress * 100)}%` : scanned ? 'CHARTED' : 'SCAN');
  setText(ui.secondaryKey, 'L');
  setText(ui.secondaryLabel, 'LAND');
  ui.secondary.disabled = !inScanRange || !allScanned || !scanned;
  if (ui.touchSecondary) setText(ui.touchSecondary, 'LAND');

  let prompt;
  if (scanning) prompt = `Scanning ${planetById(scanning.id).name} · hold your position inside the scan range.`;
  else if (heat > 0.5) prompt = 'Hull temperature rising · turn away from Veyra.';
  else if (inScanRange && !scanned) prompt = `Signal in range · press E to scan ${planet.name}.`;
  else if (inScanRange && !allScanned) prompt = `${planet.name} charted · ${PLANETS.length - state.scans.length} world${PLANETS.length - state.scans.length === 1 ? '' : 's'} left to chart.`;
  else if (inScanRange && speed > LAND_SPEED) prompt = `Slow below ${LAND_SPEED} km/s to begin a descent to ${planet.name} (S brakes).`;
  else if (inScanRange) prompt = `${planet.name} cleared for landing · press L to descend.`;
  else if (state.cacheReady && !state.cacheCollected) prompt = 'Echo fixed on Nacre-7 · follow the marker and land there.';
  else if (!allScanned) prompt = 'Follow the marker to the next world · W thrust, A/D turn, Shift boost.';
  else if (!state.upgrade && state.inventory >= UPGRADE_COST) prompt = 'Cargo ready · land on any world and refit the scanner at the ship.';
  else prompt = 'All worlds charted · land on any world to gather lumen samples.';
  setText(ui.prompt, prompt);
}

function renderFacts(planet) {
  const key = planet ? planet.id : '';
  if (ui.facts.dataset.planet === key) return;
  ui.facts.dataset.planet = key;
  ui.facts.hidden = !planet;
  if (!planet) return;
  ui.facts.replaceChildren(...Object.entries({ GRAVITY: planet.facts.gravity, SURFACE: planet.facts.temperature, ATMOSPHERE: planet.facts.atmosphere, DAY: planet.facts.day })
    .map(([label, value]) => {
      const row = document.createElement('div');
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      row.append(dt, dd);
      return row;
    }));
}

function startScan() {
  const near = world.near;
  if (!near || near.altitude > scanRange(near.planet) || scanning) return;
  if (state.scans.includes(near.planet.id)) { gatedToast('charted', `${near.planet.name} is already charted.`, 3); return; }
  scanning = { id: near.planet.id, progress: 0, tick: 0 };
}

function completeScan(planet) {
  scanning = null;
  if (!state.scans.includes(planet.id)) state.scans.push(planet.id);
  sounds.scan();
  saveState();
  updateHUD();
  const left = PLANETS.length - state.scans.length;
  showToast(left ? `${planet.name} charted · ${planet.signal}` : `${planet.name} charted · the system map is complete. Choose a landing site.`, 3600);
}

function landOnNearest() {
  if (world.mode !== 'orbit' || busy || !gameStarted) return;
  const near = world.near;
  if (!near || near.altitude > scanRange(near.planet)) return showToast('Move closer to a world before beginning a descent.');
  if (state.scans.length < PLANETS.length) return showToast('Chart every world before choosing a landing site.');
  if (!state.scans.includes(near.planet.id)) return showToast('Scan this world before landing.');
  if (world.shipVel.length() > LAND_SPEED) return showToast(`Too fast for entry · slow below ${LAND_SPEED} km/s first.`);
  const planet = near.planet;
  sounds.land();
  transition(`DESCENT · ${planet.name.toUpperCase()}`, () => {
    state.currentPlanet = planet.id;
    state.walker = null;
    state.o2 = 100;
    buildSurface(planet.id, { descend: true });
    saveState();
  });
}

// ---------------------------------------------------------------- surface scene
const CRATERS = [[52, -38, 16, 4], [-70, 25, 22, 5], [18, 78, 11, 2.5], [-42, -82, 26, 6], [96, 44, 14, 3]];
const TERRAIN = {
  desert(x, z) {
    const r = Math.hypot(x, z);
    const base = fbm2(x * 0.0075 + 31, z * 0.0075 - 12, 4);
    let mesa = (base * 0.5 + 0.5) * 18;
    const stepH = 4.5; const k = mesa / stepH; const fl = Math.floor(k);
    mesa = (fl + smoothstep(0.72, 0.97, k - fl)) * stepH;
    const mask = smoothstep(0.1, 0.4, fbm2(x * 0.005 + 70, z * 0.005 + 9, 3)) * smoothstep(30, 62, r);
    let h = lerp(base * 4, mesa - 7, mask);
    const u = x * 0.87 + z * 0.49; const v = z * 0.87 - x * 0.49;
    const dune = Math.pow(1 - Math.abs(NOISE.noise2(u * 0.04 + fbm2(x * 0.01, z * 0.01, 2) * 1.5, v * 0.011)), 2.4);
    h += dune * 1.7 * (1 - mask);
    h += fbm2(x * 0.09, z * 0.09, 3) * 0.28;
    return h;
  },
  tidal(x, z) {
    const base = fbm2(x * 0.011 + 5, z * 0.011 + 17, 5);
    let h = base * 4.5 + 0.8;
    const channel = 1 - Math.abs(NOISE.noise2(x * 0.018 + 40, z * 0.018 - 8));
    h -= Math.pow(channel, 7) * 2.6;
    h += Math.pow(1 - Math.abs(NOISE.noise2(x * 0.028 - 11, z * 0.028 + 5)), 9) * 2.2 * smoothstep(0, 0.35, base);
    h += fbm2(x * 0.12, z * 0.12, 2) * 0.12;
    return h;
  },
  ice(x, z) {
    let h = fbm2(x * 0.009 - 21, z * 0.009 + 44, 5) * 6;
    h += Math.pow(1 - Math.abs(NOISE.noise2(x * 0.022 + 3, z * 0.022 - 30)), 3) * 2.6;
    for (const [cx, cz, cr, depth] of CRATERS) {
      const d = Math.hypot(x - cx, z - cz) / cr;
      if (d < 1.8) h += -depth * Math.max(0, 1 - d * d) + depth * 0.45 * Math.exp(-(((d - 1) / 0.2) ** 2));
    }
    h += fbm2(x * 0.1, z * 0.1, 3) * 0.2;
    return h;
  },
};

function makeHeightField(planet) {
  const raw = TERRAIN[planet.surface.terrain];
  const padHeight = planet.kind === 'tidal' ? Math.max(raw(0, 0), 1.3) : raw(0, 0);
  const fn = (x, z) => {
    const r = Math.hypot(x, z);
    let h = lerp(padHeight, raw(x, z), smoothstep(10, 24, r));
    h += smoothstep(118, 196, r) * (22 + 14 * fbm2(x * 0.01 + 3, z * 0.01, 3));
    return h;
  };
  return { fn, padHeight };
}

class Terrain {
  constructor(planet) {
    const segments = coarse ? 170 : 230;
    const { fn, padHeight } = makeHeightField(planet);
    this.size = TERRAIN_SIZE; this.segments = segments; this.step = TERRAIN_SIZE / segments; this.padHeight = padHeight;
    const n = segments + 1;
    this.heights = new Float32Array(n * n);
    const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const h = fn(pos.getX(i), pos.getZ(i));
        this.heights[i] = h;
        pos.setY(i, h);
      }
    }
    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const pal = Object.fromEntries(Object.entries(planet.surface.palette).map(([k, v]) => [k, new THREE.Color(v)]));
    for (let i = 0; i < pos.count; i++) {
      colorAt(planet.kind, pos.getX(i), pos.getZ(i), pos.getY(i), 1 - normals.getY(i), pal, c);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: planet.kind === 'ice' ? 0.62 : 0.93, metalness: 0,
      bumpMap: TEXTURES.detail, bumpScale: planet.kind === 'ice' ? 0.6 : 1.4,
    }));
    this.mesh.receiveShadow = true;
  }
  heightAt(x, z) {
    const half = this.size / 2; const n = this.segments + 1;
    const fx = clamp((x + half) / this.step, 0, this.segments - 1e-4);
    const fz = clamp((z + half) / this.step, 0, this.segments - 1e-4);
    const ix = Math.floor(fx); const iz = Math.floor(fz);
    const tx = fx - ix; const tz = fz - iz;
    const h = this.heights;
    const a = h[iz * n + ix]; const b = h[(iz + 1) * n + ix]; const cc = h[(iz + 1) * n + ix + 1]; const d = h[iz * n + ix + 1];
    if (tx + tz <= 1) return a + (d - a) * tx + (b - a) * tz;
    return cc + (b - cc) * (1 - tx) + (d - cc) * (1 - tz);
  }
  slopeAt(x, z) {
    const hx = this.heightAt(x + 0.8, z) - this.heightAt(x - 0.8, z);
    const hz = this.heightAt(x, z + 0.8) - this.heightAt(x, z - 0.8);
    return Math.hypot(hx, hz) / 1.6;
  }
}

function colorAt(kind, x, z, h, slope, pal, out) {
  const n1 = fbm2(x * 0.03 + 9, z * 0.03 - 4, 3);
  const n2 = NOISE.noise2(x * 0.25, z * 0.25);
  if (kind === 'desert') {
    out.copy(pal.sand).lerp(pal.dust, smoothstep(-0.25, 0.55, n1));
    out.lerp(pal.dark, smoothstep(0.2, 0.6, -n1) * 0.35);
    const strata = 0.5 + 0.5 * Math.sin(h * 1.6 + n1 * 2.2);
    const rock = pal.rockA.clone().lerp(pal.rockB, strata);
    out.lerp(rock, smoothstep(0.28, 0.55, slope));
  } else if (kind === 'tidal') {
    const ridge = Math.pow(1 - Math.abs(NOISE.noise2(x * 0.028 - 11, z * 0.028 + 5)), 9);
    if (h < 0.05) out.copy(pal.silt).lerp(pal.wet, smoothstep(-1.2, 0.05, h));
    else out.copy(pal.wet).lerp(pal.flats, smoothstep(0.05, 0.6, h));
    out.lerp(pal.glass, smoothstep(0.22, 0.6, ridge) * 0.72);
    out.lerp(pal.rock, smoothstep(0.32, 0.6, slope) * 0.7);
    out.lerp(pal.glass, smoothstep(0.45, 0.8, n1) * 0.16 * smoothstep(0.4, 1.0, h));
  } else {
    out.copy(pal.snow).lerp(pal.ice, smoothstep(0.1, -0.5, n1) * 0.75);
    const streak = fbm2(x * 0.012 + 50, z * 0.05 - 7, 3);
    out.lerp(pal.tholin, smoothstep(0.18, 0.5, streak) * 0.45);
    out.lerp(pal.ice, smoothstep(0.18, 0.35, slope) * 0.6);
    out.lerp(pal.rock, smoothstep(0.38, 0.62, slope));
  }
  out.multiplyScalar(0.94 + n2 * 0.06);
  return out;
}

function makeSkyMaterial(cfg, sunDir, discGain) {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      horizon: { value: new THREE.Color(cfg.horizon) }, zenith: { value: new THREE.Color(cfg.zenith) }, ground: { value: new THREE.Color(cfg.ground) },
      sunDir: { value: sunDir.clone() }, sunColor: { value: new THREE.Color(cfg.sunColor) }, sunSize: { value: cfg.sunSize },
      glow: { value: cfg.glow }, stars: { value: cfg.stars }, ring: { value: cfg.ring }, discGain: { value: discGain }, time: { value: 0 },
    },
  });
}

function makeSample(color, cache = false, seed = 1) {
  const group = new THREE.Group();
  const tint = new THREE.Color(color);
  if (cache) {
    const stone = new THREE.Mesh(rockGeometry(4.4, 3, 0.18, 1.1), material(0x2a2622, { roughness: 0.55, metalness: 0.3 }));
    stone.scale.set(1.1, 1.5, 0.9);
    stone.position.y = 0.6;
    group.add(stone);
    const vein = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: tint.clone().multiplyScalar(3) }));
    vein.rotation.set(Math.PI / 2 - 0.3, 0.4, 0);
    vein.position.y = 0.7;
    group.add(vein);
    const light = new THREE.PointLight(color, 6, 14, 2);
    light.position.y = 1.8;
    group.add(light);
    group.userData.spinner = vein;
  } else {
    const crystalMat = material(tint.clone().multiplyScalar(0.55), { emissive: tint, emissiveIntensity: 0.9, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92 });
    const base = new THREE.Mesh(rockGeometry(2.2, 2, 0.3, 0.6), material(0x3b3a3c, { roughness: 0.9 }));
    base.scale.set(0.75, 0.45, 0.7);
    base.position.y = 0.1;
    group.add(base);
    const rand = seeded(seed * 7919);
    const blades = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const height = 0.55 + rand() * 0.75;
      const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.11, height, 6), crystalMat);
      blade.geometry.translate(0, height / 2, 0);
      blade.position.set((rand() - 0.5) * 0.4, 0.15, (rand() - 0.5) * 0.4);
      blade.rotation.set((rand() - 0.5) * 0.9, rand() * TAU, (rand() - 0.5) * 0.9);
      blades.add(blade);
    }
    group.add(blades);
    group.userData.spinner = blades;
  }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(cache ? 6 : 3.4, cache ? 6 : 3.4), new THREE.MeshBasicMaterial({
    map: TEXTURES.glow, color: tint, transparent: true, opacity: cache ? 0.55 : 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  group.add(glow);
  const beamHeight = cache ? 34 : 16;
  const beamGeo = new THREE.CylinderGeometry(0.04, cache ? 0.45 : 0.22, beamHeight, 16, 1, true);
  beamGeo.translate(0, beamHeight / 2, 0);
  const beam = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { color: { value: tint.clone() }, time: { value: 0 }, strength: { value: cache ? 0.55 : 0.2 } },
  }));
  beam.frustumCulled = false;
  group.add(beam);
  group.traverse((obj) => { if (obj.isMesh && obj.material.isMeshStandardMaterial) obj.castShadow = true; });
  group.userData.beam = beam;
  return group;
}

function siteSearch(planet, terrain, rand, { minR, maxR, avoid, minHeight = -Infinity, maxSlope = 0.55, spacing = 0 }) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const a = rand() * TAU; const r = lerp(minR, maxR, rand());
    const x = Math.cos(a) * r; const z = Math.sin(a) * r;
    const h = terrain.heightAt(x, z);
    if (h < minHeight || terrain.slopeAt(x, z) > maxSlope) continue;
    if (avoid.some((s) => Math.hypot(s.x - x, s.z - z) < (s.r || 0) + spacing)) continue;
    return { x, z };
  }
  return null;
}

function buildSurface(planetId, { descend = false } = {}) {
  const planet = planetById(planetId) || PLANETS[0];
  const cfg = planet.surface;
  resetScene();
  world.mode = 'surface';
  state.mode = 'surface';
  state.currentPlanet = planet.id;
  world.planet = planet;
  scanning = null;
  renderer.toneMappingExposure = 0.95;

  const sunDir = new THREE.Vector3(...cfg.sunDir).normalize();
  world.sunDir = sunDir;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), makeSkyMaterial(cfg.sky, sunDir, 60));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  world.sky = sky;

  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), makeSkyMaterial({ ...cfg.sky, stars: 0 }, sunDir, 4)));
  world.envTarget = pmrem.fromScene(envScene, 0.03);
  envScene.traverse((obj) => { obj.geometry?.dispose(); obj.material?.dispose(); });
  scene.environment = world.envTarget.texture;
  scene.environmentIntensity = cfg.envIntensity;
  scene.fog = new THREE.Fog(cfg.fog.color, cfg.fog.near, cfg.fog.far);

  const terrain = new Terrain(planet);
  world.terrain = terrain;
  scene.add(terrain.mesh);

  if (cfg.water) {
    if (!TEXTURES.ripples) {
      TEXTURES.ripples = TEXTURES.detail.clone();
      TEXTURES.ripples.repeat.set(36, 36);
      TEXTURES.ripples.needsUpdate = true;
    }
    const water = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE), new THREE.MeshStandardMaterial({
      color: cfg.water.color, roughness: 0.06, metalness: 0.05, transparent: true, opacity: cfg.water.opacity,
      bumpMap: TEXTURES.ripples, bumpScale: 0.25, envMapIntensity: 1.4,
    }));
    water.rotation.x = -Math.PI / 2;
    water.receiveShadow = true;
    scene.add(water);
    world.water = water;
  }

  const sun = new THREE.DirectionalLight(cfg.sky.sunColor, cfg.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  world.sun = sun;
  scene.add(new THREE.HemisphereLight(planet.kind === 'ice' ? 0x8da2c8 : cfg.sky.horizon, cfg.bounce, cfg.hemi));

  // samples, cache and props
  const colliders = [];
  world.colliders = colliders;
  const avoid = [{ x: 0, z: 0, r: 16 }];
  const rand = seeded(Math.floor(planet.seed * 1000));
  const minHeight = planet.kind === 'tidal' ? 0.35 : -Infinity;
  world.samples = [];
  for (let i = 0; i < SAMPLES_PER_WORLD; i++) {
    const site = siteSearch(planet, terrain, rand, { minR: 24, maxR: 82, avoid, minHeight, maxSlope: 0.4, spacing: 16 });
    if (!site) continue;
    avoid.push({ ...site, r: 4 });
    const key = `${planet.id}:sample-${i}`;
    if (state.collected.includes(key)) continue;
    const sample = makeSample(planet.lumen, false, Math.floor(planet.seed * 100) + i);
    sample.position.set(site.x, terrain.heightAt(site.x, site.z), site.z);
    sample.userData = { ...sample.userData, key, value: SAMPLE_VALUE, label: planet.resource, kind: 'sample' };
    scene.add(sample);
    world.samples.push(sample);
  }
  world.cacheSite = null;
  if (planet.id === CACHE_PLANET_ID) {
    let site = null;
    for (let r = 74; r < 110 && !site; r += 3) {
      const x = Math.cos(0.72) * r; const z = -Math.sin(0.72) * r;
      if (terrain.heightAt(x, z) > 0.5 && terrain.slopeAt(x, z) < 0.35) site = { x, z };
    }
    world.cacheSite = site || { x: 55, z: -48 };
    avoid.push({ ...world.cacheSite, r: 6 });
    spawnCacheIfReady();
  }

  addProps(planet, terrain, rand, avoid, colliders);

  // the Morrowfin on its landing pad
  const ship = makeShip();
  ship.scale.setScalar(SURFACE_SHIP_SCALE);
  world.padY = terrain.padHeight + LEG_DROP * SURFACE_SHIP_SCALE;
  ship.position.set(0, world.padY, 0);
  ship.rotation.y = 0.35;
  ship.userData.setGear(1);
  ship.userData.setThrottle(0, 0);
  scene.add(ship);
  ship.updateMatrixWorld(true);
  world.ship = ship;
  colliders.push({ x: 0, z: 0, r: 2.4 });
  for (const leg of ship.userData.legs) {
    const p = leg.getWorldPosition(new THREE.Vector3());
    colliders.push({ x: p.x, z: p.z, r: 0.7 });
  }
  ship.userData.setRamp(descend ? 0 : 1);
  world.rampTop = ship.localToWorld(ship.userData.rampTop.clone());
  world.rampFoot = ship.localToWorld(ship.userData.rampFoot.clone());
  world.rampOut = world.rampFoot.clone().sub(world.rampTop).setY(0).normalize();
  world.shipForward = new THREE.Vector3(-Math.sin(ship.rotation.y), 0, -Math.cos(ship.rotation.y));
  const hatchX = world.rampFoot.x + world.rampOut.x * 0.9;
  const hatchZ = world.rampFoot.z + world.rampOut.z * 0.9;
  world.hatch = new THREE.Vector3(hatchX, terrain.heightAt(hatchX, hatchZ), hatchZ);
  const hatchRing = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2b066).multiplyScalar(1.5), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  hatchRing.rotation.x = -Math.PI / 2;
  hatchRing.position.copy(world.hatch).add(new THREE.Vector3(0, 0.05, 0));
  scene.add(hatchRing);
  world.hatchRing = hatchRing;

  // the surveyor
  const astronaut = makeAstronaut();
  scene.add(astronaut);
  world.astronaut = astronaut;
  const saved = state.walker;
  const spawnX = world.hatch.x + world.rampOut.x * 1.3;
  const spawnZ = world.hatch.z + world.rampOut.z * 1.3;
  world.spawn = new THREE.Vector3(spawnX, terrain.heightAt(spawnX, spawnZ), spawnZ);
  const outwardHeading = Math.atan2(-world.rampOut.x, -world.rampOut.z);
  const startPos = saved ? new THREE.Vector3(saved.x, terrain.heightAt(saved.x, saved.z), saved.z) : world.spawn.clone();
  world.walker = {
    pos: startPos,
    heading: saved ? saved.heading : outwardHeading,
    speed: 0, vy: 0, onGround: true, phase: 0, jump: false, turning: false, action: null,
  };
  astronaut.position.copy(world.walker.pos);
  astronaut.rotation.y = world.walker.heading;
  world.camYaw = world.walker.heading;
  astronaut.userData.setDust(planet.surface.dust.color === 0xffffff ? 0xc4d2e2 : planet.surface.rockColor);
  world.footprints = makeFootprints(planet);
  scene.add(world.footprints.mesh);
  animateAstronaut(astronaut, world.walker, 1, planet.gravity < 0.5, 0);

  world.dust = makeMotes({ ...cfg.dust, box: 46, blending: planet.kind === 'ice' ? THREE.AdditiveBlending : THREE.NormalBlending, seed: 21 });
  scene.add(world.dust);
  world.burst = null;

  ui.mode.textContent = `${planet.name.toUpperCase()} // SURFACE`;
  state.visits[planet.id] = (state.visits[planet.id] || 0) + 1;

  if (descend) {
    world.descent = { t: 0, duration: reducedMotion ? 1.2 : 4.2 };
    astronaut.visible = false;
    ship.position.y = world.padY + 34;
    ship.userData.setGear(0);
    camera.position.set(world.hatch.x - 16, world.padY + 4, world.hatch.z - 18);
  } else {
    placeSurfaceCamera(true);
  }
  camera.fov = 55;
  camera.updateProjectionMatrix();
  updateHUD();
}

function addProps(planet, terrain, rand, avoid, colliders) {
  const cfg = planet.surface;
  const free = (x, z, r) => Math.hypot(x, z) > 15 + r && avoid.every((s) => Math.hypot(s.x - x, s.z - z) > (s.r || 0) + r + 1.5);
  const variants = [rockGeometry(planet.seed, 3, 0.32, 0.7), rockGeometry(planet.seed + 4, 3, 0.26, 0.55), rockGeometry(planet.seed + 9, 2, 0.4, 0.9)];
  const rockMat = material(0xffffff, { roughness: planet.kind === 'ice' ? 0.75 : 0.92, metalness: 0.02, bumpMap: TEXTURES.detailProp, bumpScale: 2 });
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const s = new THREE.Vector3(); const p = new THREE.Vector3();
  const tint = new THREE.Color();

  const placeInstanced = (geometry, mat, items, shadows = true) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
    items.forEach((it, i) => {
      q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0));
      matrix.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, matrix);
      if (it.color !== undefined) mesh.setColorAt(i, tint.setHex(it.color).multiplyScalar(it.shade || 1));
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  const big = [[], [], []];
  const bigCount = planet.kind === 'desert' ? 95 : 60;
  for (let i = 0; i < bigCount; i++) {
    const x = (rand() - 0.5) * 300; const z = (rand() - 0.5) * 300;
    const size = 0.5 + Math.pow(rand(), 2.2) * (planet.kind === 'desert' ? 3.2 : 2.4);
    if (!free(x, z, size)) continue;
    const sy = size * (0.6 + rand() * 0.7);
    big[i % 3].push({ x, y: terrain.heightAt(x, z) - sy * 0.18, z, sx: size, sy, sz: size * (0.7 + rand() * 0.5), ry: rand() * TAU, rx: (rand() - 0.5) * 0.3, color: cfg.rockColor, shade: 0.75 + rand() * 0.4 });
    if (size > 0.8) colliders.push({ x, z, r: size * 0.85 });
  }
  big.forEach((items, v) => placeInstanced(variants[v], rockMat, items));

  const pebbles = [];
  for (let i = 0; i < (coarse ? 260 : 460); i++) {
    const x = (rand() - 0.5) * 220; const z = (rand() - 0.5) * 220;
    if (Math.hypot(x, z) < 8) continue;
    const size = 0.06 + rand() * 0.22;
    pebbles.push({ x, y: terrain.heightAt(x, z), z, sx: size, sy: size * 0.7, sz: size, ry: rand() * TAU, color: cfg.rockColor, shade: 0.6 + rand() * 0.6 });
  }
  placeInstanced(variants[2], rockMat, pebbles, false);

  if (planet.kind === 'desert') {
    const spires = [];
    for (let i = 0; i < 24; i++) {
      const x = (rand() - 0.5) * 280; const z = (rand() - 0.5) * 280;
      const width = 1 + rand() * 1.6;
      if (!free(x, z, width + 1)) continue;
      const height = 4 + rand() * 7;
      spires.push({ x, y: terrain.heightAt(x, z) - 0.6, z, sx: width, sy: height, sz: width * (0.7 + rand() * 0.5), ry: rand() * TAU, color: 0x9a5a3a, shade: 0.75 + rand() * 0.3 });
      colliders.push({ x, z, r: width * 0.9 });
    }
    const spireGeo = rockGeometry(planet.seed + 2, 3, 0.22, 1);
    spireGeo.translate(0, 0.35, 0);
    placeInstanced(spireGeo, rockMat, spires);
  }

  if (planet.kind === 'tidal' || planet.kind === 'ice') {
    const tidal = planet.kind === 'tidal';
    const bladeGeo = new THREE.CylinderGeometry(tidal ? 0.04 : 0.02, tidal ? 0.26 : 0.3, 1, tidal ? 6 : 5);
    bladeGeo.translate(0, 0.5, 0);
    const bladeMat = tidal
      ? material(0x9fe0dc, { roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.86, emissive: 0x0d3533, emissiveIntensity: 0.6, envMapIntensity: 1.6 })
      : material(0xf2f7fb, { roughness: 0.35, metalness: 0, emissive: 0x16283a, emissiveIntensity: 0.5, bumpMap: TEXTURES.detailProp, bumpScale: 1 });
    const blades = [];
    for (let c = 0; c < (tidal ? 34 : 40); c++) {
      const cx = (rand() - 0.5) * 280; const cz = (rand() - 0.5) * 280;
      const clusterR = tidal ? 1.4 + rand() * 2 : 2.2 + rand() * 3.5;
      if (!free(cx, cz, clusterR)) continue;
      if (tidal && terrain.heightAt(cx, cz) < -0.6) continue;
      const count = tidal ? 4 + Math.floor(rand() * 6) : 9 + Math.floor(rand() * 12);
      for (let i = 0; i < count; i++) {
        const a = rand() * TAU; const r = Math.sqrt(rand()) * clusterR;
        const x = cx + Math.cos(a) * r; const z = cz + Math.sin(a) * r;
        const height = tidal ? 1.2 + rand() * 3.8 : 0.8 + rand() * 2.4;
        const width = tidal ? 0.7 + rand() * 0.8 : 0.6 + rand() * 0.6;
        blades.push({ x, y: terrain.heightAt(x, z) - 0.15, z, sx: width, sy: height, sz: width, rx: (rand() - 0.5) * (tidal ? 0.5 : 0.15), rz: (rand() - 0.5) * (tidal ? 0.5 : 0.15), ry: rand() * TAU });
      }
      colliders.push({ x: cx, z: cz, r: clusterR * 0.8 });
    }
    placeInstanced(bladeGeo, bladeMat, blades);
  }
}

function spawnCacheIfReady() {
  if (world.mode !== 'surface' || !world.cacheSite || world.cache) return;
  if (!state.cacheReady || state.cacheCollected) return;
  const cache = makeSample(0xf2a24a, true);
  const { x, z } = world.cacheSite;
  cache.position.set(x, world.terrain.heightAt(x, z) - 0.2, z);
  cache.userData = { ...cache.userData, key: `${CACHE_PLANET_ID}:cache`, value: 8, label: 'Veilstone cache', kind: 'cache' };
  scene.add(cache);
  world.cache = cache;
  world.colliders?.push({ x, z, r: 1.1 });
}

const cameraRay = new THREE.Raycaster();
const camHead = new THREE.Vector3();
const camDir = new THREE.Vector3();
function placeSurfaceCamera(snap = false, dt = 1 / 60) {
  const w = world.walker;
  const behind = tmpV.set(Math.sin(world.camYaw), 0, Math.cos(world.camYaw));
  const portrait = camera.aspect < 0.9 ? 1.3 : 1;
  const desired = tmpV2.copy(w.pos).addScaledVector(behind, 6.3 * portrait).add(camDir.set(0, 2.55 * portrait, 0));
  const groundAtCam = world.terrain.heightAt(desired.x, desired.z) + 1.3;
  if (desired.y < groundAtCam) desired.y = groundAtCam;
  if (Math.hypot(w.pos.x, w.pos.z) < 26) {
    camHead.copy(w.pos).y += 1.6;
    camDir.subVectors(desired, camHead);
    const far = camDir.length();
    cameraRay.set(camHead, camDir.normalize());
    cameraRay.far = far;
    cameraRay.camera = camera;
    const hit = cameraRay.intersectObject(world.ship, true).find((h) => h.object.material?.isMeshStandardMaterial);
    if (hit) desired.copy(camHead).addScaledVector(camDir, Math.max(1.2, hit.distance - 0.5));
  }
  if (snap) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.exp(-5 * dt));
  camera.lookAt(w.pos.x - behind.x * 2, w.pos.y + 1.45, w.pos.z - behind.z * 2);
}

const tmpDir = new THREE.Vector3();
const inCinematic = () => !!(world.descent || world.liftoff || world.egress);

function nearestSurfaceTarget() {
  const w = world.walker;
  let best = null;
  const consider = (obj, kind, reach) => {
    const d = Math.hypot(obj.position.x - w.pos.x, obj.position.z - w.pos.z);
    if (d < reach && (!best || d < best.distance)) best = { object: obj, kind, distance: d };
  };
  for (const sample of world.samples) if (sample.visible && !sample.userData.collecting) consider(sample, 'sample', 2.6);
  if (world.cache && world.cache.visible && !world.cache.userData.collecting) consider(world.cache, 'cache', 3.2);
  const hatchDistance = Math.hypot(world.hatch.x - w.pos.x, world.hatch.z - w.pos.z);
  if (hatchDistance < 3.2 && (!best || hatchDistance < best.distance)) best = { object: world.ship, kind: 'ship', distance: hatchDistance };
  return best;
}

function updateSurface(dt, playing) {
  const planet = world.planet;
  const terrain = world.terrain;
  const w = world.walker;
  const astronaut = world.astronaut;
  const ship = world.ship;
  world.sky.position.copy(camera.position);
  world.sky.material.uniforms.time.value = visualTime;
  if (world.water) TEXTURES.ripples.offset.set((visualTime * 0.004) % 1, (visualTime * 0.0025) % 1);

  // descent and liftoff animations
  if (world.descent) {
    const d = world.descent;
    d.t += dt;
    const k = clamp(d.t / d.duration, 0, 1);
    const ease = 1 - (1 - k) ** 3;
    ship.position.y = world.padY + 34 * (1 - ease);
    ship.userData.setGear(smoothstep(0.55, 0.9, k));
    ship.userData.setThrottle(0.4 + (1 - k) * 0.6, visualTime);
    sounds.engine(0.5 * (1 - k) + 0.15);
    camera.lookAt(ship.position.x, ship.position.y - 2, ship.position.z);
    if (k >= 1) {
      world.descent = null;
      ship.userData.setThrottle(0, visualTime);
      sounds.thud();
      dustBurst(new THREE.Vector3(0, terrain.padHeight, 0), planet.surface.dust.color);
      showToast(`Touchdown on ${planet.name} · ${planet.facts.gravity} gravity, ${planet.facts.temperature}.`, 3600);
      const deck = world.rampFoot.clone().add(new THREE.Vector3(0, 0.045, 0));
      const points = [world.rampTop.clone().add(new THREE.Vector3(0, 0.045, 0)), deck, world.spawn.clone()];
      world.egress = { t: 0, points, rampLength: points[0].distanceTo(points[1]), speed: reducedMotion ? 4 : 1.9 };
      w.pos.copy(points[0]);
      saveState();
    }
  } else if (world.egress) {
    const e = world.egress;
    e.t += dt;
    const deployTime = reducedMotion ? 0.3 : 1.2;
    ship.userData.setRamp(smoothstep(0.1, deployTime, e.t));
    if (e.t > deployTime) {
      astronaut.visible = true;
      const along = (e.t - deployTime) * e.speed;
      const done = followPath(e.points, along, w.pos, tmpDir);
      if (tmpDir.lengthSq() > 0) w.heading = Math.atan2(-tmpDir.x, -tmpDir.z);
      w.speed = done ? 0 : e.speed;
      w.onGround = true;
      stepAstronaut(dt, along > e.rampLength);
      if (done) {
        world.egress = null;
        w.pos.y = terrain.heightAt(w.pos.x, w.pos.z);
        world.camYaw = w.heading;
        state.walker = { x: w.pos.x, z: w.pos.z, heading: w.heading };
        saveState();
      }
    }
    cinematicCamera(dt, astronaut.visible ? w.pos : world.rampTop);
  } else if (world.liftoff) {
    const l = world.liftoff;
    l.t += dt;
    if (l.t < l.boardTime) {
      const along = l.t * l.speed;
      followPath(l.points, along, w.pos, tmpDir);
      if (tmpDir.lengthSq() > 0) w.heading = Math.atan2(-tmpDir.x, -tmpDir.z);
      w.speed = l.speed;
      w.onGround = true;
      stepAstronaut(dt, along < l.groundLength);
      cinematicCamera(dt, w.pos);
    } else {
      astronaut.visible = false;
      const tr = l.t - l.boardTime;
      ship.userData.setRamp(1 - smoothstep(0, 0.6, tr));
      const k = clamp((tr - 0.7) / l.duration, 0, 1);
      if (tr > 0.7 && !l.dusted) { l.dusted = true; dustBurst(new THREE.Vector3(0, terrain.padHeight, 0), planet.surface.dust.color); }
      ship.position.y = world.padY + 40 * k * k;
      ship.userData.setGear(1 - smoothstep(0.1, 0.4, k));
      ship.userData.setThrottle(tr > 0.5 ? 1 : 0.15, visualTime);
      sounds.engine(tr > 0.5 ? 0.8 : 0.2);
      camera.lookAt(ship.position);
      if (k >= 1 && !l.done) { l.done = true; l.onDone(); }
    }
  } else {
    updateWalker(dt, playing && !busy);
    if (world.photo) {
      const f = world.photo; const w0 = world.walker; const a = w0.heading + f.yaw;
      camera.position.set(w0.pos.x - Math.sin(a) * f.dist, w0.pos.y + f.height, w0.pos.z - Math.cos(a) * f.dist);
      camera.lookAt(w0.pos.x, w0.pos.y + f.look, w0.pos.z);
    } else placeSurfaceCamera(false, dt);
  }
  updateShipDetails(ship, visualTime, false, dt);

  // sample animation
  for (const sample of [...world.samples, world.cache].filter(Boolean)) {
    if (!sample.visible) continue;
    sample.userData.spinner.rotation.y += dt * (sample.userData.kind === 'cache' ? 0.8 : 0.35);
    sample.userData.beam.material.uniforms.time.value = visualTime;
    if (sample.userData.collecting) {
      sample.userData.collectT += dt;
      if (sample.userData.collectT < 0) continue;
      const k = sample.userData.collectT / 0.45;
      sample.scale.setScalar(Math.max(0.001, 1 - k));
      sample.position.y += dt * 1.5;
      if (k >= 1) sample.visible = false;
    }
  }
  if (world.burst) updateBurst(dt);
  world.hatchRing.material.opacity = 0.35 + 0.25 * Math.sin(visualTime * 3);

  // shadows follow the surveyor
  const focus = world.descent || world.liftoff ? ship.position : w.pos;
  world.sun.target.position.set(focus.x, terrain.padHeight, focus.z);
  world.sun.position.copy(world.sun.target.position).addScaledVector(world.sunDir, 90);
  world.dust.material.uniforms.focus.value.copy(camera.position);
  world.dust.material.uniforms.time.value = visualTime;
  sounds.wind(planet.surface.wind);
  if (!world.descent && !world.liftoff) sounds.engine(0);

  // suit oxygen
  const shipDistance = Math.hypot(w.pos.x - ship.position.x, w.pos.z - ship.position.z);
  if (playing && !busy && !inCinematic()) {
    if (shipDistance > SHIP_AIR_RADIUS) state.o2 = Math.max(0, state.o2 - (100 / O2_SECONDS) * dt);
    else state.o2 = Math.min(100, state.o2 + 14 * dt);
    if (state.o2 < 25) gatedToast('o2', 'Suit O₂ low · head back to the Morrowfin to refill.', 20, 3400);
    if (state.o2 < 12 && shipDistance > SHIP_AIR_RADIUS) {
      world.o2Beep = (world.o2Beep || 0) - dt;
      if (world.o2Beep <= 0) { sounds.warn(); world.o2Beep = 1.6; }
    }
    if (state.o2 <= 0 && !world.recalling) {
      world.recalling = true;
      transition('SUIT RESERVE · AUTO RECALL', () => {
        world.recalling = false;
        state.o2 = 100;
        w.pos.copy(world.spawn);
        w.heading = Math.atan2(-world.rampOut.x, -world.rampOut.z);
        w.action = null;
        w.speed = 0; w.vy = 0;
        world.camYaw = w.heading;
        placeSurfaceCamera(true);
      });
      showToast('Oxygen reserve reached · the suit walked you back to the ship. Your samples are safe.', 4200);
    }
  }

  world.target = inCinematic() ? null : nearestSurfaceTarget();
  updateSurfaceHUD(shipDistance);
}

function updateWalker(dt, active) {
  const planet = world.planet;
  const terrain = world.terrain;
  const w = world.walker;
  const g = planet.gravity * 9.81;
  const run = active && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  if (w.action) {
    w.action.t += dt;
    if (w.action.t >= w.action.duration) w.action = null;
  }
  const control = active && !w.action;
  const turn = control ? (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) : 0;
  const forwardInput = control ? (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) : 0;
  w.turning = turn !== 0 && forwardInput === 0;
  w.heading += turn * 2.3 * dt;
  const maxSpeed = (run ? 6.2 : 3.4) * (forwardInput < 0 ? 0.5 : 1);
  const traction = w.onGround ? 3 + 7 * planet.gravity : 0.4;
  w.speed = damp(w.speed, forwardInput * maxSpeed, traction, dt);

  const ground = terrain.heightAt(w.pos.x, w.pos.z);
  if (world.water && ground < -0.25) w.speed *= Math.exp(-2.2 * dt);
  const dirX = -Math.sin(w.heading); const dirZ = -Math.cos(w.heading);
  let nx = w.pos.x + dirX * w.speed * dt;
  let nz = w.pos.z + dirZ * w.speed * dt;
  const rise = terrain.heightAt(nx, nz) - ground;
  const grade = rise / Math.max(Math.abs(w.speed * dt), 1e-4);
  if (w.onGround && grade > 0.85) { nx = lerp(w.pos.x, nx, 0.35); nz = lerp(w.pos.z, nz, 0.35); }

  for (const c of world.colliders) {
    const dx = nx - c.x; const dz = nz - c.z;
    const min = c.r + 0.38;
    const dSq = dx * dx + dz * dz;
    if (dSq < min * min) { const d = Math.sqrt(dSq) || 0.001; nx = c.x + dx / d * min; nz = c.z + dz / d * min; }
  }
  const fromShip = Math.hypot(nx, nz);
  if (fromShip > 104) { nx *= 104 / fromShip; nz *= 104 / fromShip; gatedToast('edge', 'Survey range limit · the Morrowfin can’t track you further out.', 8); }
  w.pos.x = nx; w.pos.z = nz;

  if (w.jump && w.onGround) { w.vy = 3.3; w.onGround = false; }
  w.jump = false;
  const floor = terrain.heightAt(w.pos.x, w.pos.z);
  if (w.onGround) {
    if (w.pos.y - floor > 0.35) w.onGround = false;
    else w.pos.y = floor;
  }
  if (!w.onGround) {
    w.vy -= g * dt;
    w.pos.y += w.vy * dt;
    if (w.pos.y <= floor) {
      if (w.vy < -2.4) { sounds.thud(); if (planet.kind !== 'tidal' || floor > 0) dustBurst(w.pos.clone(), planet.surface.dust.color, 40, 0.6); }
      w.pos.y = floor; w.vy = 0; w.onGround = true;
    }
  }
  stepAstronaut(dt, true);
  world.camYaw = dampAngle(world.camYaw, w.heading, 2.6, dt);
  state.walker = { x: w.pos.x, z: w.pos.z, heading: w.heading };
}

function updateSurfaceHUD(shipDistance) {
  const planet = world.planet;
  const w = world.walker;
  const target = world.target;
  setText(ui.speedLabel, 'GROUND SPEED');
  setText(ui.speed, `${Math.abs(w.speed).toFixed(1)} M/S`);
  setText(ui.vitalLabel, 'SUIT O₂');
  setText(ui.vital, `${Math.ceil(state.o2)}%`);
  ui.vitalTile.classList.toggle('warn', state.o2 < 40);
  ui.vitalTile.classList.toggle('alert', state.o2 < 20);

  const label = target ? (target.kind === 'ship' ? 'MORROWFIN' : target.object.userData.label.toUpperCase()) : planet.name.toUpperCase();
  setText(ui.targetKicker, target ? 'IN REACH' : 'SURFACE');
  setText(ui.target, label);
  setText(ui.distance, target ? `${target.distance.toFixed(1)} M` : `${Math.round(shipDistance)} M FROM SHIP`);
  setText(ui.targetType, `${planet.type} · ${planet.facts.gravity} · ${planet.facts.temperature}`);
  renderFacts(null);
  ui.proximity.classList.toggle('near', !!target);

  ui.primary.disabled = !target || inCinematic() || !!w.action;
  setText(ui.primaryLabel, target?.kind === 'ship' ? 'BOARD' : 'COLLECT');
  setText(ui.secondaryKey, '␣');
  setText(ui.secondaryLabel, 'JUMP');
  ui.secondary.disabled = !w.onGround || inCinematic();
  if (ui.touchSecondary) setText(ui.touchSecondary, 'JUMP');

  let prompt;
  if (world.descent) prompt = `Descent to ${planet.name} in progress…`;
  else if (world.egress) prompt = `Hatch open · stepping out onto ${planet.name}…`;
  else if (world.liftoff) prompt = 'Boarding the Morrowfin · ascent burn to orbit…';
  else if (target?.kind === 'ship') prompt = state.cacheCollected ? 'Press E to board and seal the survey.' : 'Press E to board the Morrowfin.';
  else if (target) prompt = `${target.object.userData.label} in reach · press E to collect.`;
  else if (state.o2 < 25) prompt = 'Suit O₂ low · return to the Morrowfin to refill.';
  else if (world.cache && world.cache.visible) prompt = 'Echo Scanner active · follow the amber beacon.';
  else if (state.cacheCollected) prompt = 'Veilstone cache secured · return to the Morrowfin.';
  else if (!state.upgrade && state.inventory >= UPGRADE_COST) prompt = `${state.inventory} lumen in cargo · board the Morrowfin to refit the scanner.`;
  else if (!state.upgrade && world.samples.some((s) => s.visible)) prompt = 'Follow the marker to the nearest glowing sample · W walk, A/D turn, Space jump.';
  else if (!state.upgrade) prompt = `This site is cleared · launch and try another world (${state.inventory}/${UPGRADE_COST} lumen).`;
  else if (state.cacheReady && planet.id !== CACHE_PLANET_ID) prompt = 'Echo fixed on Nacre-7 · board the Morrowfin and launch.';
  else prompt = 'Explore, or board the Morrowfin to launch.';
  setText(ui.prompt, prompt);
}

function dustBurst(origin, color, count = 160, scale = 1) {
  if (world.burst) { scene.remove(world.burst.points); world.burst.points.geometry.dispose(); world.burst.points.material.dispose(); }
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const rand = seeded(Math.floor(visualTime * 1000));
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU; const speed = (2 + rand() * 7) * scale;
    positions.set([origin.x, origin.y + 0.2, origin.z], i * 3);
    velocities.set([Math.cos(a) * speed, (0.4 + rand() * 1.6) * scale, Math.sin(a) * speed], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.35 * scale + 0.1, transparent: true, opacity: 0.6, depthWrite: false, map: TEXTURES.glow }));
  points.frustumCulled = false;
  scene.add(points);
  world.burst = { points, velocities, t: 0 };
}

function updateBurst(dt) {
  const b = world.burst;
  b.t += dt;
  const pos = b.points.geometry.attributes.position;
  const drag = Math.exp(-1.6 * dt);
  for (let i = 0; i < pos.count; i++) {
    b.velocities[i * 3] *= drag; b.velocities[i * 3 + 2] *= drag;
    b.velocities[i * 3 + 1] -= world.planet.gravity * 9.81 * 0.15 * dt;
    pos.setXYZ(i, pos.getX(i) + b.velocities[i * 3] * dt, pos.getY(i) + b.velocities[i * 3 + 1] * dt, pos.getZ(i) + b.velocities[i * 3 + 2] * dt);
  }
  pos.needsUpdate = true;
  b.points.material.opacity = 0.6 * Math.max(0, 1 - b.t / 2.4);
  if (b.t > 2.4) { scene.remove(b.points); b.points.geometry.dispose(); b.points.material.dispose(); world.burst = null; }
}

function collect(target) {
  const obj = target.object;
  const { key, value, kind } = obj.userData;
  if (state.collected.includes(key)) return;
  state.collected.push(key);
  state.inventory += value;
  state.totalCollected += value;
  obj.userData.collecting = true;
  obj.userData.collectT = reducedMotion ? 0 : -0.4;
  const w = world.walker;
  w.heading = headingTo(w.pos, obj.position);
  w.speed = 0;
  w.action = { type: 'reach', t: 0, duration: reducedMotion ? 0.4 : 1.05 };
  if (kind === 'cache') {
    state.cacheCollected = true;
    sounds.cache();
    showToast('Veilstone cache recovered · bring it back to the Morrowfin.', 3800);
  } else {
    sounds.collect();
    const remaining = Math.max(0, UPGRADE_COST - state.inventory);
    showToast(state.upgrade || !remaining ? `${obj.userData.label} recovered · +${value} lumen` : `${obj.userData.label} recovered · +${value} lumen (${remaining} more for the refit)`);
  }
  saveState();
  updateHUD();
}

function launchToOrbit() {
  if (world.mode !== 'surface' || inCinematic()) return;
  const planet = world.planet;
  if (ui.dialog.open) ui.dialog.close();
  busy = true;
  const w = world.walker;
  w.action = null;
  const points = [w.pos.clone(), world.rampFoot.clone().add(new THREE.Vector3(0, 0.045, 0)), world.rampTop.clone().add(new THREE.Vector3(0, 0.045, 0))];
  const pace = reducedMotion ? 6 : 2.1;
  world.liftoff = {
    t: 0,
    points,
    speed: pace,
    groundLength: points[0].distanceTo(points[1]),
    boardTime: pathLength(points) / pace,
    duration: reducedMotion ? 0.8 : 2.4,
    onDone: () => {
      transition('ASCENT · ORBIT', () => {
        const center = planetPosition(planet, state.time);
        const outward = tmpV.copy(center).normalize();
        if (outward.lengthSq() < 0.5) outward.set(1, 0, 0);
        const pos = center.clone().addScaledVector(outward, planet.radius * planet.atmosphere.scale + 3.4);
        const tangent = new THREE.Vector3(-outward.z, 0, outward.x);
        state.ship = { pos: pos.toArray(), vel: [0, 0, 0], heading: headingTo(pos, pos.clone().add(tangent)) };
        state.walker = null;
        buildOrbit();
        saveState();
      }, () => {
        showToast(state.cacheReady && !state.cacheCollected ? 'Back in orbit · the echo marker points to Nacre-7.' : 'Back in orbit above ' + planet.name + '.', 3000);
      });
    },
  };
}

// ---------------------------------------------------------------- ship dialog & mission flow
function renderShipDialog() {
  ui.upgradeSpec.hidden = false;
  ui.upgrade.hidden = false;
  ui.launch.hidden = false;
  ui.closeDialog.hidden = false;

  if (state.cacheCollected) {
    ui.dialogTitle.textContent = 'The echo is aboard';
    ui.dialogCopy.textContent = 'The Veilstone cache is secured in the field bay. Seal the survey to transmit Veyra’s recovered map.';
    ui.upgradeSpec.hidden = true;
    ui.upgrade.textContent = 'Seal the survey';
    ui.upgrade.disabled = false;
    ui.launch.hidden = true;
    return;
  }
  if (!state.upgrade) {
    const short = UPGRADE_COST - state.inventory;
    ui.dialogTitle.textContent = 'Refit the field scanner';
    ui.dialogCopy.textContent = short > 0
      ? `The echo array needs ${UPGRADE_COST} lumen and the cargo bay holds ${state.inventory}. Collect ${short} more from the glowing samples on any world.`
      : `Cargo holds ${state.inventory} lumen. The refit lets the scanner hear harmonics the standard array misses.`;
    ui.upgradeSpec.innerHTML = '<span><small>CURRENT</small><b>SCANNER MK I</b></span><i>→</i><span><small>REFIT</small><b>ECHO SCANNER</b></span>';
    ui.upgrade.textContent = `Install upgrade · ${UPGRADE_COST} lumen`;
    ui.upgrade.disabled = short > 0;
    ui.launch.textContent = 'Launch to orbit';
    return;
  }
  const here = world.planet?.id === CACHE_PLANET_ID;
  ui.dialogTitle.textContent = 'Echo scanner online';
  ui.dialogCopy.textContent = here
    ? 'The echo source is on this world. Follow the amber beacon, recover the cache and bring it back here.'
    : 'The echo source is fixed on Nacre-7. Launch, follow the marker and land there.';
  ui.upgradeSpec.innerHTML = '<span><small>INSTALLED</small><b>ECHO SCANNER</b></span><i>✓</i><span><small>SIGNAL</small><b>NACRE-7</b></span>';
  ui.upgrade.hidden = true;
  ui.launch.textContent = here ? 'Launch to orbit' : 'Launch and follow the echo';
}

function openShipDialog() {
  renderShipDialog();
  if (!ui.dialog.open) ui.dialog.showModal();
}

function installUpgrade() {
  if (state.cacheCollected) { finishExpedition(); return; }
  if (state.upgrade || state.inventory < UPGRADE_COST) return;
  state.inventory -= UPGRADE_COST;
  state.upgrade = true;
  state.cacheReady = true;
  sounds.upgrade();
  spawnCacheIfReady();
  saveState();
  updateHUD();
  renderShipDialog();
  showToast(world.planet?.id === CACHE_PLANET_ID ? 'Echo Scanner MK II online · the echo is coming from this world.' : 'Echo Scanner MK II online · echo fixed on Nacre-7.', 3400);
}

function finishExpedition() {
  state.complete = true;
  saveState();
  if (ui.dialog.open) ui.dialog.close();
  $('#final-scans').textContent = String(state.scans.length);
  $('#final-lumen').textContent = String(state.totalCollected);
  ui.completion.classList.add('open');
}

function missionStep() {
  if (state.complete || state.cacheCollected) return 'return';
  if (state.upgrade) return 'cache';
  if (state.inventory >= UPGRADE_COST) return 'upgrade';
  if (state.scans.length === PLANETS.length) return 'collect';
  return 'scan';
}

function updateHUD() {
  ui.scanProgress.textContent = `Scan ${state.scans.length} of ${PLANETS.length} worlds`;
  ui.collectProgress.textContent = `Collect ${Math.min(state.upgrade ? UPGRADE_COST : state.inventory, UPGRADE_COST)} of ${UPGRADE_COST} lumen`;
  ui.resource.textContent = `${state.inventory} LUMEN`;
  ui.scanner.textContent = state.upgrade ? 'MK II ECHO' : 'MK I';
  const active = missionStep();
  const order = ['scan', 'collect', 'upgrade', 'cache', 'return'];
  const activeIndex = order.indexOf(active);
  for (const item of $$('li[data-step]', ui.mission)) {
    const index = order.indexOf(item.dataset.step);
    const done = state.complete || index < activeIndex;
    item.classList.toggle('active', index === activeIndex && !state.complete);
    item.classList.toggle('done', done);
    item.firstElementChild.textContent = done ? '✓' : String(index + 1).padStart(2, '0');
  }
  setText($('[data-step="cache"] small', ui.mission), state.upgrade ? 'Echo fixed on Nacre-7' : 'Hidden signal locked');
  setText($('[data-step="return"] small', ui.mission), state.cacheCollected ? 'Board the Morrowfin' : 'Bring the cache home');
}

function handleInteract() {
  sounds.ensure();
  if (!gameStarted || busy) return;
  if (world.mode === 'orbit') { startScan(); return; }
  if (inCinematic() || world.walker?.action) return;
  const target = world.target;
  if (!target) return;
  if (target.kind === 'ship') openShipDialog();
  else collect(target);
}

function handleSecondary() {
  sounds.ensure();
  if (world.mode === 'orbit') landOnNearest();
  else if (world.walker && gameStarted && !busy && !inCinematic() && !world.walker.action) world.walker.jump = true;
}

// ---------------------------------------------------------------- waypoint
const projected = new THREE.Vector3();
function objective() {
  if (!gameStarted || busy || state.complete) return null;
  if (world.mode === 'orbit') {
    const ship = world.ship.position;
    const byDistance = (list) => list
      .map((entry) => ({ entry, d: ship.distanceTo(entry.group.position) - entry.planet.radius }))
      .sort((a, b) => a.d - b.d)[0];
    const unscanned = world.planets.filter((entry) => !state.scans.includes(entry.planet.id));
    let pick; let verb;
    if (unscanned.length) { pick = byDistance(unscanned); verb = 'SCAN'; }
    else if (state.cacheReady && !state.cacheCollected) { pick = byDistance(world.planets.filter((e) => e.planet.id === CACHE_PLANET_ID)); verb = 'ECHO'; }
    else if (!state.upgrade && state.inventory >= UPGRADE_COST) { pick = byDistance(world.planets); verb = 'LAND · REFIT'; }
    else if (!state.upgrade) {
      const withSamples = world.planets.filter((entry) => {
        const taken = state.collected.filter((key) => key.startsWith(`${entry.planet.id}:sample`)).length;
        return taken < SAMPLES_PER_WORLD;
      });
      pick = byDistance(withSamples.length ? withSamples : world.planets); verb = 'LAND';
    }
    if (!pick) return null;
    return {
      position: pick.entry.group.position, label: `${verb} · ${pick.entry.planet.name.toUpperCase()}`,
      distance: `${Math.max(0, Math.round(pick.d * 1000)).toLocaleString('en-US')} KM`,
      progress: scanning && scanning.id === pick.entry.planet.id ? scanning.progress : 0,
    };
  }
  if (inCinematic()) return null;
  const w = world.walker.pos;
  const dist = (obj) => Math.hypot(obj.position.x - w.x, obj.position.z - w.z);
  let pick = null; let label = '';
  if (world.cache && world.cache.visible) { pick = world.cache; label = 'ECHO SOURCE'; }
  else if (!state.upgrade && state.inventory < UPGRADE_COST) {
    const open = world.samples.filter((s) => s.visible && !s.userData.collecting).sort((a, b) => dist(a) - dist(b));
    if (open.length) { pick = open[0]; label = 'SAMPLE'; }
  }
  if (!pick) { pick = { position: world.hatch }; label = 'MORROWFIN'; }
  const d = dist(pick);
  if (d < 3) return null;
  return { position: tmpV.copy(pick.position).add(tmpV2.set(0, 1.4, 0)), label, distance: `${Math.round(d)} M`, progress: 0 };
}

const wpState = { label: '', distance: '', progress: -1, rects: [], rectsAge: 0 };
function panelRects() {
  if (wpState.rectsAge-- > 0) return wpState.rects;
  wpState.rectsAge = 30;
  wpState.rects = $$('.mission-card, .telemetry').map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
  return wpState.rects;
}
function updateWaypoint() {
  if (!state.waypoints) { ui.waypoint.hidden = true; return; }
  const target = objective();
  if (!target) { ui.waypoint.hidden = true; return; }
  ui.waypoint.hidden = false;
  projected.copy(target.position).project(camera);
  const W = innerWidth; const H = innerHeight;
  const behind = projected.z > 1;
  let x = (projected.x * 0.5 + 0.5) * W;
  let y = (-projected.y * 0.5 + 0.5) * H;
  const small = W < 680 || touchUI;
  const top = small ? 210 : 110; const bottom = H - (small ? 170 : 140); const left = 66; const right = W - 66;
  const off = behind || x < left || x > right || y < top || y > bottom;
  let angle = 0;
  if (off) {
    let dx = x - W / 2; let dy = y - (top + bottom) / 2;
    if (behind) { dx = -dx; dy = -dy; if (Math.abs(dy) < 1) dy = 1; }
    const cx = W / 2; const cy = (top + bottom) / 2;
    const sx = (dx > 0 ? right - cx : cx - left) / Math.max(Math.abs(dx), 1e-3);
    const sy = (dy > 0 ? bottom - cy : cy - top) / Math.max(Math.abs(dy), 1e-3);
    const s = Math.min(sx, sy);
    x = cx + dx * s; y = cy + dy * s;
    angle = Math.atan2(dy, dx);
  }
  for (const r of panelRects()) {
    if (x > r.left - 70 && x < r.right + 10 && y > r.top - 10 && y < r.bottom + 14) y = r.bottom + 26;
  }
  ui.waypoint.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  ui.waypoint.classList.toggle('offscreen', off);
  ui.waypointArrow.style.transform = `rotate(${angle}rad)`;
  if (wpState.label !== target.label) { wpState.label = target.label; ui.waypointLabel.textContent = target.label; }
  if (wpState.distance !== target.distance) { wpState.distance = target.distance; ui.waypointDistance.textContent = target.distance; }
  const progress = Math.round(target.progress * 100) / 100;
  if (wpState.progress !== progress) { wpState.progress = progress; ui.waypointProgress.style.strokeDashoffset = String(119.4 * (1 - progress)); ui.waypoint.classList.toggle('scanning', progress > 0); }
}

// ---------------------------------------------------------------- transitions, restart, input
function transition(label, mid, after) {
  busy = true;
  ui.transitionLabel.textContent = label;
  ui.transition.classList.add('show');
  setTimeout(() => {
    mid();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ui.transition.classList.remove('show');
      setTimeout(() => { busy = false; after?.(); }, reducedMotion ? 50 : 450);
    }));
  }, reducedMotion ? 80 : 650);
}

function restart() {
  store.remove(STORAGE_KEY);
  const preferences = { muted: state.muted, quality: state.quality, waypoints: state.waypoints };
  state = freshState();
  Object.assign(state, preferences);
  if (ui.dialog.open) ui.dialog.close();
  if (ui.settings.open) ui.settings.close();
  ui.completion.classList.remove('open');
  ui.briefing.classList.add('open');
  ui.resume.textContent = 'Progress saves automatically in this browser.';
  ui.begin.firstChild.textContent = 'Begin survey ';
  gameStarted = false;
  busy = false;
  scanning = null;
  buildOrbit();
  updateSoundButton();
}

function updateSoundButton() {
  ui.sound.textContent = state.muted ? '×' : '◖';
  ui.sound.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
  ui.sound.title = state.muted ? 'Turn sound on' : 'Mute sound';
}

function renderSettings() {
  ui.settingsSound.checked = !state.muted;
  ui.settingsWaypoints.checked = state.waypoints;
  ui.settingsQuality.value = state.quality;
}

function openSettings() {
  keys.clear();
  renderSettings();
  if (!ui.settings.open) ui.settings.showModal();
}

function toggleLibrary(open) {
  const next = open ?? !document.body.classList.contains('library-open');
  document.body.classList.toggle('library-open', next);
  $('#library-button').setAttribute('aria-expanded', String(next));
  $('#game-library').setAttribute('aria-hidden', String(!next));
}

ui.begin.addEventListener('click', () => {
  sounds.ensure();
  ui.briefing.classList.remove('open');
  gameStarted = true;
  ui.begin.blur();
  if (state.complete) finishExpedition();
});
ui.primary.addEventListener('click', () => { handleInteract(); ui.primary.blur(); });
ui.secondary.addEventListener('click', () => { handleSecondary(); ui.secondary.blur(); });
ui.upgrade.addEventListener('click', installUpgrade);
ui.launch.addEventListener('click', launchToOrbit);
ui.closeDialog.addEventListener('click', () => ui.dialog.close());
$('#again-button').addEventListener('click', restart);
$('#restart-button').addEventListener('click', () => {
  if (confirm('Restart the Echofall expedition? This clears the local save.')) restart();
});
ui.sound.addEventListener('click', () => {
  state.muted = !state.muted;
  updateSoundButton();
  sounds.ensure();
  sounds.setMuted(state.muted);
  saveState();
});
ui.settingsButton.addEventListener('click', openSettings);
ui.settingsSound.addEventListener('change', () => {
  state.muted = !ui.settingsSound.checked;
  updateSoundButton();
  sounds.ensure();
  sounds.setMuted(state.muted);
  saveState();
});
ui.settingsWaypoints.addEventListener('change', () => {
  state.waypoints = ui.settingsWaypoints.checked;
  updateWaypoint();
  saveState();
});
ui.settingsQuality.addEventListener('change', () => {
  state.quality = ui.settingsQuality.value === 'performance' ? 'performance' : 'auto';
  applyGraphicsQuality();
  renderer.setSize(innerWidth, innerHeight);
  saveState();
});
ui.settingsReset.addEventListener('click', () => {
  if (confirm('Delete the local Echofall save and restart the expedition?')) restart();
});
$('#library-button').addEventListener('click', () => toggleLibrary());
$('#library-close').addEventListener('click', () => toggleLibrary(false));
$('#drawer-backdrop').addEventListener('click', () => toggleLibrary(false));

addEventListener('keydown', (event) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && !ui.dialog.open && !ui.settings.open) event.preventDefault();
  if (event.code === 'Escape') {
    toggleLibrary(false);
    if (ui.dialog.open) ui.dialog.close();
    if (ui.settings.open) ui.settings.close();
    return;
  }
  if (ui.dialog.open || ui.settings.open || event.metaKey || event.ctrlKey) return;
  sounds.ensure();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyE') handleInteract();
  if (event.code === 'KeyL' && world.mode === 'orbit') landOnNearest();
  if (event.code === 'Space' && world.mode === 'surface') handleSecondary();
});
addEventListener('keyup', (event) => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
ui.dialog.addEventListener('close', () => keys.clear());
ui.settings.addEventListener('close', () => keys.clear());

for (const button of $$('[data-hold]')) {
  const down = (event) => { event.preventDefault(); sounds.ensure(); keys.add(button.dataset.hold); button.setPointerCapture?.(event.pointerId); };
  const up = (event) => { event.preventDefault(); keys.delete(button.dataset.hold); };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('lostpointercapture', up);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}
for (const button of $$('[data-tap]')) button.addEventListener('click', () => (button.dataset.tap === 'secondary' ? handleSecondary() : handleInteract()));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyGraphicsQuality();
  renderer.setSize(innerWidth, innerHeight);
});

setInterval(() => { if (gameStarted && !busy) saveState(); }, 3000);
addEventListener('pagehide', () => { if (gameStarted) saveState(); });

// ---------------------------------------------------------------- loop
function frame(timestamp) {
  requestAnimationFrame(frame);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  visualTime += dt;
  const playing = gameStarted && !ui.dialog.open && !ui.settings.open && !ui.completion.classList.contains('open') && !document.body.classList.contains('library-open');
  if (world.mode === 'orbit') updateOrbit(dt, playing);
  else updateSurface(dt, playing);
  updateWaypoint();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- QA hooks (only with ?qa in the URL)
function installQaHooks() {
  if (!new URLSearchParams(location.search).has('qa')) return;
  window.__ECHOFALL_QA__ = {
    snapshot: () => JSON.parse(JSON.stringify({ ...state, worldMode: world.mode, busy, scanning, cinematic: world.mode === 'surface' && inCinematic(), acting: !!world.walker?.action })),
    start: () => { gameStarted = true; ui.briefing.classList.remove('open'); },
    moveShipNear(planetId = PLANETS[0].id, distance = 4) {
      if (world.mode !== 'orbit') return false;
      const entry = world.planets.find((item) => item.planet.id === planetId);
      if (!entry) return false;
      const center = entry.group.position;
      const outward = tmpV.copy(center).normalize();
      const side = new THREE.Vector3(-outward.z, 0, outward.x);
      world.ship.position.copy(center).addScaledVector(side, entry.planet.radius + distance);
      world.shipVel.set(0, 0, 0);
      world.heading = headingTo(world.ship.position, center) + 0.55;
      return true;
    },
    aimAt(planetId) {
      const entry = world.planets.find((item) => item.planet.id === planetId);
      world.heading = headingTo(world.ship.position, entry ? entry.group.position : new THREE.Vector3());
      return true;
    },
    interact: handleInteract,
    land: landOnNearest,
    jump: handleSecondary,
    moveToResource(kind = 'sample') {
      if (world.mode !== 'surface') return false;
      const target = kind === 'cache' ? world.cache : world.samples.find((item) => item.visible && !item.userData.collecting);
      if (!target) return false;
      world.walker.pos.set(target.position.x + 1.2, world.terrain.heightAt(target.position.x + 1.2, target.position.z), target.position.z);
      world.walker.heading = headingTo(world.walker.pos, target.position);
      world.camYaw = world.walker.heading;
      return true;
    },
    moveToShip() {
      if (world.mode !== 'surface') return false;
      world.walker.pos.copy(world.spawn);
      return true;
    },
    photo(yaw, dist = 3, height = 1.4, look = 1.1) { world.photo = yaw === null ? null : { yaw, dist, height, look }; return true; },
    walk(seconds = 2, run = false) {
      keys.add('KeyW'); if (run) keys.add('ShiftLeft');
      setTimeout(() => { keys.delete('KeyW'); keys.delete('ShiftLeft'); }, seconds * 1000);
      return true;
    },
    installUpgrade,
    launch: launchToOrbit,
    restart,
    setO2(value) { state.o2 = value; },
    surface(id) { state.scans = PLANETS.map((p) => p.id); state.walker = null; buildSurface(id); return true; },
    faceShip() {
      if (world.mode !== 'surface') return false;
      world.walker.heading = headingTo(world.walker.pos, world.ship.position);
      world.camYaw = world.walker.heading;
      placeSurfaceCamera(true);
      return true;
    },
    orbit() { buildOrbit(); return true; },
  };
}

// ---------------------------------------------------------------- boot
bakeAll();
if (state.mode === 'surface' && state.currentPlanet) buildSurface(state.currentPlanet);
else buildOrbit();
updateSoundButton();
installQaHooks();
requestAnimationFrame(frame);
