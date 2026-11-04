/**
 * 162-0 Web — Baseball engine (pure, no DOM).
 *
 * Port of the 162-0 Baseball iOS app:
 *   PositionCompatibilityEngine.swift → effectiveness, availableSlots
 *   ChemistryEngine.swift             → chemistry
 *   SeasonSimulationEngine.swift      → teamMetrics, strengths, the 30-club league
 *                                       (two round robins + 26 four-game series), Poisson runs,
 *                                       extra innings (no ties)
 *   SeasonResult.swift                → tiers, shutouts, streaks
 *   DraftEngine / PlayerPoolService   → club + era pools
 *
 * Web-only layer: inning-by-inning line scores (same win odds as the app), three coaching
 * calls, exact projections, and replacement-level fill-ins to preview an unfinished nine.
 */

let rand = Math.random;
/** Swap the random source (tests use a seeded generator). */
export function setRandom(fn) { rand = fn || Math.random; }

export const SEASON_GAMES = 162;
export const CLUBS = 30;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** mulberry32 — small deterministic PRNG for the league schedule and tests. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(list, rng = rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bb-${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

export const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const POSITION_NAMES = {
  P: 'Pitcher', C: 'Catcher', '1B': 'First Base', '2B': 'Second Base', '3B': 'Third Base',
  SS: 'Shortstop', LF: 'Left Field', CF: 'Center Field', RF: 'Right Field',
};
const OUTFIELD = new Set(['LF', 'CF', 'RF']);
const INFIELD = new Set(['1B', '2B', '3B', 'SS']);
const HITTERS = POSITIONS.filter((p) => p !== 'P');
/** Position color group used by the UI (DraftPosition.color in the app). */
export const posGroup = (pos) => (pos === 'P' ? 'p' : pos === 'C' ? 'c' : INFIELD.has(pos) ? 'if' : 'of');

/** PositionCompatibilityEngine.effectiveness — pitcher and catcher are specialist roles. */
export function effectiveness(player, slot) {
  if (player.pos === slot) return 1;
  if (player.sec.includes(slot)) return 0.95;
  if (player.pos === 'P' || slot === 'P' || slot === 'C') return 0;
  if (OUTFIELD.has(player.pos) && OUTFIELD.has(slot)) return 0.85;
  if (INFIELD.has(player.pos) && INFIELD.has(slot)) return 0.85;
  return 0.65;
}

export function availableSlots(player, occupied) {
  return POSITIONS.filter((s) => !occupied.includes(s))
    .map((slot) => ({ slot, eff: effectiveness(player, slot) }))
    .filter((x) => x.eff > 0)
    .sort((a, b) => (a.eff === b.eff ? (a.slot < b.slot ? -1 : 1) : b.eff - a.eff));
}

export const fitLabel = (eff) => `${Math.round(eff * 100)}%`;
export function fitText(eff) {
  if (eff >= 1) return 'Natural fit · full rating';
  if (eff >= 0.95) return 'Secondary position · 5% penalty';
  if (eff >= 0.85) return 'Related role · 15% penalty';
  return 'Unfamiliar role · 35% penalty';
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const KEYS = ['ovr', 'bat', 'def', 'pow', 'arm', 'con', 'spd', 'sta', 'pit'];

export function buildDb(json) {
  const teams = json.teams;
  const eras = json.eras;
  const players = json.players.map(([n, name, pos, sec, team, era, ...rest]) => {
    const p = { id: `ballplayer-${String(n).padStart(4, '0')}`, name, pos, sec: sec ? sec.split('/') : [], team: teams[team].id, era: eras[era].id };
    KEYS.forEach((k, i) => { p[k] = rest[i]; });
    [p.arch, p.str, p.weak] = json.roles[pos];
    p.years = [rest[9], rest[10]];
    return p;
  });
  const pools = new Map();
  for (const p of players) {
    const key = `${p.team}|${p.era}`;
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key).push(p);
  }
  for (const list of pools.values()) list.sort((a, b) => (a.ovr === b.ovr ? (a.id < b.id ? -1 : 1) : b.ovr - a.ovr));
  return {
    teams, eras, players, pools,
    byId: new Map(players.map((p) => [p.id, p])),
    teamById: new Map(teams.map((t) => [t.id, t])),
    eraById: new Map(eras.map((e) => [e.id, e])),
  };
}

/** Eligible players for a club and era who can still fill an open slot (DraftEngine.spin filter). */
export function poolFor(db, team, era, { drafted = [], occupied = [] } = {}) {
  return (db.pools.get(`${team}|${era}`) || [])
    .filter((p) => !drafted.includes(p.id) && availableSlots(p, occupied).length > 0);
}

/** Random club + era, preferring clubs not used yet this draft. */
export function drawContext(db, { usedTeams = [], drafted = [], occupied = [], avoid = [] } = {}) {
  const all = shuffled(db.teams.map((t) => t.id));
  const ordered = [...all.filter((t) => !usedTeams.includes(t) && !avoid.includes(t)), ...all.filter((t) => usedTeams.includes(t) && !avoid.includes(t)), ...avoid];
  for (const team of ordered) {
    for (const era of shuffled(db.eras.map((e) => e.id))) {
      if (poolFor(db, team, era, { drafted, occupied }).length) return { team, era };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Team metrics + chemistry (SeasonSimulationEngine.calculateTeamMetrics, ChemistryEngine)
// ---------------------------------------------------------------------------

/** Replacement-level stand-ins used only to preview projections for an unfinished nine. */
export const REPLACEMENT = 72;
function replacement(slot) {
  return { id: `repl-${slot}`, pos: slot, sec: [], team: null, ovr: REPLACEMENT, bat: REPLACEMENT, def: REPLACEMENT, pow: REPLACEMENT - 4, arm: REPLACEMENT, con: REPLACEMENT, spd: REPLACEMENT, sta: 76, pit: slot === 'P' ? REPLACEMENT : 12, replacement: true };
}

export function chemistry(roster, eff = {}) {
  const slots = POSITIONS.filter((s) => roster[s] && !roster[s].replacement);
  if (!slots.length) return { score: 50, bonuses: [], penalties: [] };
  let score = 65;
  const bonuses = [];
  const penalties = [];
  const bonus = (reason, value) => { score += value; bonuses.push({ reason, value }); };
  const players = slots.map((s) => roster[s]);
  const r = (s) => (roster[s] && !roster[s].replacement ? roster[s] : null);
  if (r('P')?.pos === 'P') bonus('Ace on the mound', 5);
  if (r('C') && r('C').def >= 78) bonus('Reliable battery partner', 5);
  if (players.some((p) => p.pow >= 90)) bonus('Middle-order power', 4);
  if (players.filter((p) => p.con >= 85).length >= 3) bonus('Contact throughout the order', 4);
  if (r('LF') && r('RF') && Math.min(r('LF').spd, r('RF').spd) >= 80) bonus('Outfield range', 4);
  if (r('2B') && r('SS') && Math.min(r('2B').def, r('SS').def) >= 82) bonus('Double-play partnership', 4);
  const clubs = new Map();
  for (const p of players) clubs.set(p.team, (clubs.get(p.team) || 0) + 1);
  if ([...clubs.values()].some((n) => n >= 2)) bonus('Familiar club connections', 3);
  if (players.reduce((s, p) => s + p.sta, 0) / players.length >= 80) bonus('Built for the long season', 3);
  for (const s of slots) {
    const fit = eff[s] ?? effectiveness(roster[s], s);
    if (fit < 0.95) {
      const value = fit < 0.85 ? -5 : -2;
      score += value;
      penalties.push({ reason: `Role mismatch at ${s}`, value });
    }
  }
  return { score: clamp(score, 0, 99), bonuses, penalties };
}

/**
 * `roster` maps slot → player. With `fill`, open slots get replacement-level stand-ins so an
 * unfinished nine can be projected (the drafted players' numbers are unchanged).
 */
export function teamMetrics(roster, eff = {}, { fill = false } = {}) {
  const full = { ...roster };
  if (fill) for (const s of POSITIONS) if (!full[s]) full[s] = replacement(s);
  const fitOf = (s) => (full[s].replacement ? 1 : eff[s] ?? effectiveness(full[s], s));
  const rating = (key, slots) => {
    const values = slots.filter((s) => full[s]).map((s) => full[s][key] * fitOf(s));
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  };
  const count = POSITIONS.filter((s) => roster[s]).length;
  return {
    count,
    overall: rating('ovr', POSITIONS),
    batting: rating('bat', HITTERS),
    defense: rating('def', HITTERS),
    power: rating('pow', HITTERS),
    contact: rating('con', HITTERS),
    arm: rating('arm', ['C', 'SS', '3B', 'RF']),
    pitching: rating('pit', ['P']),
    stamina: rating('sta', POSITIONS),
    speed: rating('spd', HITTERS),
    chemistry: chemistry(roster, eff),
  };
}

/** Run-scoring and run-prevention strength (SeasonSimulationEngine). */
export function strengths(m) {
  const cohesion = (m.chemistry.score - 65) * 0.1;
  return {
    bat: m.batting * 0.35 + m.power * 0.3 + m.contact * 0.35 + cohesion,
    def: m.pitching * 0.65 + m.defense * 0.25 + m.arm * 0.1 + cohesion,
  };
}

export function evaluate(m) {
  const units = [['Batting', m.batting], ['Power', m.power], ['Contact', m.contact], ['Pitching', m.pitching], ['Fielding', m.defense], ['Arms', m.arm], ['Stamina', m.stamina]];
  const top = units.reduce((a, b) => (b[1] > a[1] ? b : a));
  const low = units.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { strength: top[0], weakness: low[0] };
}

// ---------------------------------------------------------------------------
// League (two round robins + 26 four-game series; every club 81 home / 81 away)
// ---------------------------------------------------------------------------

export function makeLeague(seed) {
  const rng = seeded(seed);
  const opponents = Array.from({ length: CLUBS - 1 }, () => {
    const base = 67 + rng() * 21;
    return { bat: base + (rng() * 8 - 4), def: base + (rng() * 8 - 4) };
  });
  let rotation = Array.from({ length: CLUBS }, (_, i) => i);
  const cycle = [];
  for (let round = 0; round < CLUBS - 1; round++) {
    const pairs = [];
    for (let i = 0; i < CLUBS / 2; i++) {
      const a = rotation[i];
      const b = rotation[CLUBS - 1 - i];
      pairs.push((round + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    cycle.push(pairs);
    rotation = [rotation[0], rotation[CLUBS - 1], ...rotation.slice(1, CLUBS - 1)];
  }
  const shuffledCycle = shuffled(cycle, rng);
  const swap = (pairs) => pairs.map(([h, a]) => [a, h]);
  const rounds = [...shuffledCycle, ...shuffledCycle.map(swap)];
  for (const pairs of shuffledCycle.slice(0, 26)) rounds.push(pairs, pairs, swap(pairs), swap(pairs));
  return { seed, opponents, rounds };
}

/** Your 162 games: opponent club index (1–29), home flag and opponent strength. */
export function userSchedule(league, teams) {
  return league.rounds.map((pairs, r) => {
    const [h, a] = pairs.find(([x, y]) => x === 0 || y === 0);
    const home = h === 0;
    const idx = home ? a : h;
    const o = league.opponents[idx - 1];
    return { n: r + 1, oi: idx, opp: teams[idx - 1].id, home, str: Math.round((o.bat + o.def) / 2) };
  });
}

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

function poisson(rate, rng) {
  const limit = Math.exp(-rate);
  let k = 0;
  let p = 1;
  do { k++; p *= rng(); } while (p > limit);
  return k - 1;
}

const homeRate = (homeBat, awayDef) => clamp(4.5 * Math.exp((homeBat - awayDef) / 38), 0.8, 10);
const awayRate = (awayBat, homeDef) => clamp(4.2 * Math.exp((awayBat - homeDef) / 38), 0.8, 10);

/**
 * One game, inning by inning. Nine-inning totals follow the app's Poisson model; the home
 * half of the 9th is skipped when the home side already leads and walk-offs stop the inning,
 * which never changes who wins. Ties go to extra innings exactly as in the app.
 */
export function playInnings(home, away, rng = rand) {
  const hr = homeRate(home.bat, away.def);
  const ar = awayRate(away.bat, home.def);
  const top = [];
  const bottom = [];
  let A = 0;
  let H = 0;
  for (let i = 1; i <= 9; i++) {
    const a = poisson(ar / 9, rng);
    top.push(a);
    A += a;
    if (i === 9 && H > A) { bottom.push(null); break; }
    let h = poisson(hr / 9, rng);
    if (i === 9 && H + h > A) h = A - H + 1;
    bottom.push(h);
    H += h;
  }
  while (A === H) {
    const a = poisson(ar / 9, rng);
    top.push(a);
    A += a;
    const h = Math.min(Math.max(1, A - H + 1), poisson(hr / 9, rng));
    bottom.push(h);
    H += h;
  }
  return { top, bottom, A, H };
}

/** Fatigue drag for your nine late in the season (stamina under 80). */
export const fatigueAt = (m, round, mult = 1) => Math.max(0, 80 - m.stamina) * (round / 161) * 0.12 * mult;

/** Simulates your game `slot` (from userSchedule) under coaching effect `fx`. */
export function simulateUserGame(m, slot, league, fx = {}, rng = rand) {
  const s = strengths(m);
  const tired = fatigueAt(m, slot.n - 1, fx.fatigue ?? 1);
  const you = { bat: s.bat - tired + (fx.bat || 0), def: s.def - tired + (fx.def || 0) };
  const opp = league.opponents[slot.oi - 1];
  const g = slot.home ? playInnings(you, opp, rng) : playInnings(opp, you, rng);
  const us = slot.home ? g.H : g.A;
  const them = slot.home ? g.A : g.H;
  return { n: slot.n, opp: slot.opp, oi: slot.oi, home: slot.home, str: slot.str, us, them, result: us > them ? 'W' : 'L', inn: g.top.length, top: g.top, bottom: g.bottom };
}

/** Every other league game for a season, fixed by the league seed (used for standings). */
export function leagueResults(league) {
  const rng = seeded((league.seed ^ 0x5bd1e995) >>> 0);
  return league.rounds.map((pairs) => pairs.filter(([h, a]) => h !== 0 && a !== 0).map(([h, a]) => {
    const g = playInnings(league.opponents[h - 1], league.opponents[a - 1], rng);
    return [h, a, g.H, g.A];
  }));
}

/** Standings after `n` of your games: [{ idx, w, l, rf, ra }] sorted by pct, run diff, runs. */
export function standings(league, others, games, n, teams) {
  const rows = Array.from({ length: CLUBS }, (_, idx) => ({ idx, id: idx === 0 ? 'you' : teams[idx - 1].id, w: 0, l: 0, rf: 0, ra: 0 }));
  const add = (h, a, H, A) => {
    rows[h].rf += H; rows[h].ra += A; rows[a].rf += A; rows[a].ra += H;
    if (H > A) { rows[h].w++; rows[a].l++; } else { rows[a].w++; rows[h].l++; }
  };
  for (let r = 0; r < n; r++) {
    for (const [h, a, H, A] of others[r]) add(h, a, H, A);
    const g = games[r];
    if (g) add(g.home ? 0 : g.oi, g.home ? g.oi : 0, g.home ? g.us : g.them, g.home ? g.them : g.us);
  }
  const pct = (x) => (x.w + x.l ? x.w / (x.w + x.l) : 0);
  rows.sort((a, b) => pct(b) - pct(a) || (b.rf - b.ra) - (a.rf - a.ra) || b.rf - a.rf || (a.id < b.id ? -1 : 1));
  const lead = rows[0];
  for (const x of rows) x.gb = ((lead.w - x.w) + (x.l - lead.l)) / 2;
  return rows;
}

// ---------------------------------------------------------------------------
// Exact odds for projections
// ---------------------------------------------------------------------------

function pmf(rate, max = 40) {
  const out = new Float64Array(max + 1);
  out[0] = Math.exp(-rate);
  for (let k = 1; k <= max; k++) out[k] = (out[k - 1] * rate) / k;
  return out;
}

/** P(home wins) with the app's run model, including extra innings. */
export function homeWinProb(home, away) {
  const H = pmf(homeRate(home.bat, away.def));
  const A = pmf(awayRate(away.bat, home.def));
  let win = 0;
  let tie = 0;
  let cdfA = 0;
  for (let k = 0; k < H.length; k++) {
    win += H[k] * cdfA;
    tie += H[k] * A[k];
    cdfA += A[k];
  }
  const h9 = pmf(homeRate(home.bat, away.def) / 9, 20);
  const a9 = pmf(awayRate(away.bat, home.def) / 9, 20);
  let ew = 0;
  let el = 0;
  let c = 0;
  for (let k = 0; k < h9.length; k++) { ew += h9[k] * c; c += a9[k]; }
  c = 0;
  for (let k = 0; k < a9.length; k++) { el += a9[k] * c; c += h9[k]; }
  return win + tie * (ew / (ew + el));
}

/** Your win chance in a specific game (or against an average club when `opp` is omitted). */
export function gameOdds(m, { home = true, opp = null, round = 80, fx = {} } = {}) {
  const s = strengths(m);
  const tired = fatigueAt(m, round, fx.fatigue ?? 1);
  const you = { bat: s.bat - tired + (fx.bat || 0), def: s.def - tired + (fx.def || 0) };
  if (opp) return home ? homeWinProb(you, opp) : 1 - homeWinProb(opp, you);
  let total = 0;
  let n = 0;
  for (let b = 0; b < 8; b++) {
    const base = 67 + (b + 0.5) * (21 / 8);
    for (const nb of [-3, -1, 1, 3]) {
      for (const nd of [-3, -1, 1, 3]) {
        const o = { bat: base + nb, def: base + nd };
        total += home ? homeWinProb(you, o) : 1 - homeWinProb(o, you);
        n++;
      }
    }
  }
  return total / n;
}

const outlookCache = new Map();
/** Expected record and the (tiny) chance of 162-0 before coaching calls. */
export function seasonOutlook(m) {
  const key = [m.batting, m.power, m.contact, m.pitching, m.defense, m.arm, m.stamina, m.chemistry.score].join('|');
  if (outlookCache.has(key)) return outlookCache.get(key);
  const rounds = m.stamina >= 80 ? [80] : [10, 40, 80, 120, 150];
  let wins = 0;
  let logPerfect = 0;
  for (const home of [true, false]) {
    let p = 0;
    let lp = 0;
    for (const r of rounds) { const x = gameOdds(m, { home, round: r }); p += x; lp += Math.log(x); }
    wins += 81 * (p / rounds.length);
    logPerfect += 81 * (lp / rounds.length);
  }
  const out = { wins, perGame: wins / 162, perfect: Math.exp(logPerfect) };
  if (outlookCache.size > 300) outlookCache.clear();
  outlookCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Coaching calls (web edition)
// ---------------------------------------------------------------------------

export const STRETCHES = [[1, 54], [55, 108], [109, 135], [136, 162]];
export const MONTHS = [['APRIL', 1, 27], ['MAY', 28, 54], ['JUNE', 55, 81], ['JULY', 82, 108], ['AUGUST', 109, 135], ['SEPTEMBER', 136, 162]];

export const COACHING_CALLS = [
  {
    id: 'lineup', checkpoint: 54, endGame: 108, chapter: 'END OF MAY', title: 'Set the lineup card',
    prompt: 'Fifty-four games are in the books and every scout has your tendencies. Choose how your nine attacks June and July.',
    options: [
      { id: 'heart-of-order', title: 'Stack the heart of the order', detail: 'Load the power bats in the middle. More crooked numbers, more strikeouts.', impact: 'POWER', icon: 'flame' },
      { id: 'small-ball', title: 'Play small ball', detail: 'Bunt, steal and hit-and-run. Manufacture runs with contact and speed.', impact: 'CONTACT', icon: 'bolt' },
      { id: 'pitch-to-contact', title: 'Pitch to contact', detail: 'Trust the gloves behind your pitcher and keep pitch counts down.', impact: 'DEFENSE', icon: 'shield' },
    ],
  },
  {
    id: 'deadline', checkpoint: 108, endGame: 135, chapter: 'TRADE DEADLINE', title: 'Deadline decision',
    prompt: 'Every contender is working the phones. What does your front office do for August?',
    options: [
      { id: 'bullpen-arm', title: 'Add a bullpen arm', detail: 'A reliable late-inning reliever. Shortens games and protects leads.', impact: 'LOW RISK', icon: 'shield' },
      { id: 'big-bat', title: 'Rent a big bat', detail: 'A rental slugger for the stretch run. Big upside, but a new face in the clubhouse.', impact: 'HIGH CEILING', icon: 'star' },
      { id: 'stand-pat', title: 'Stand pat', detail: 'Trust the clubhouse you built. Chemistry carries the dog days.', impact: 'TEAM FIT', icon: 'users' },
    ],
  },
  {
    id: 'september', checkpoint: 135, endGame: 162, chapter: 'SEPTEMBER STRETCH', title: 'The pennant push',
    prompt: 'Twenty-seven games left. Decide how hard to push your nine toward October.',
    options: [
      { id: 'ride-regulars', title: 'Ride the regulars', detail: 'Everyday starters, every day. Maximum talent, maximum fatigue.', impact: 'ALL IN', icon: 'flame' },
      { id: 'rest-regulars', title: 'Rest the regulars', detail: 'Planned off-days and fresh legs. Erases late-season fatigue.', impact: 'FRESH LEGS', icon: 'heart' },
      { id: 'lean-on-ace', title: 'Lean on your ace', detail: 'Short rest for your pitcher. Dominant starts if the arm holds up.', impact: 'STAR POWER', icon: 'star' },
    ],
  },
];

export const callById = (id) => COACHING_CALLS.find((c) => c.id === id);
export const callForGame = (n) => COACHING_CALLS.find((c) => n > c.checkpoint && n <= c.endGame) || null;

/** Rating-point modifiers for a call (bat/def shift run scoring and prevention; fatigue scales the late-season drag). */
export function callEffect(optionId, m) {
  const chem = m.chemistry.score;
  switch (optionId) {
    case 'heart-of-order': return { bat: 0.3 + Math.max(0, m.power - 78) * 0.16, summary: 'Heart of the order stacked' };
    case 'small-ball': return { bat: 0.3 + Math.max(0, m.contact - 78) * 0.09 + Math.max(0, m.speed - 78) * 0.07, summary: 'Small ball engaged' };
    case 'pitch-to-contact': return { def: 0.3 + Math.max(0, m.defense - 78) * 0.16, summary: 'Pitching to contact' };
    case 'bullpen-arm': return { def: 0.9 + Math.max(0, 92 - m.pitching) * 0.16, summary: 'Bullpen reinforced' };
    case 'big-bat': return { bat: 0.5 + Math.max(0, 92 - m.batting) * 0.24, def: -0.4, summary: 'Rental slugger acquired' };
    case 'stand-pat': return { bat: (chem - 70) * 0.07, def: (chem - 70) * 0.07, summary: 'Clubhouse trusted' };
    case 'ride-regulars': return { bat: 1.6, def: 0.9, fatigue: 2.2, summary: 'Regulars ride every day' };
    case 'rest-regulars': return { bat: -0.2, fatigue: 0, summary: 'Fresh legs for September' };
    case 'lean-on-ace': return { def: 0.3 + Math.max(0, m.pitching - 82) * 0.2, fatigue: 1.3, summary: 'Ace on short rest' };
    default: return { summary: '' };
  }
}

// ---------------------------------------------------------------------------
// Results (SeasonResult.swift)
// ---------------------------------------------------------------------------

export const TIERS = [
  { key: 'legendary', label: 'LEGENDARY', min: 110, color: '#a78bfa' },
  { key: 'elite', label: 'PENNANT CHASERS', min: 95, color: '#60a5fa' },
  { key: 'contender', label: 'CONTENDERS', min: 85, color: '#34d399' },
  { key: 'average', label: 'IN THE HUNT', min: 70, color: '#9aa7c0' },
  { key: 'below', label: 'REBUILDING', min: 0, color: '#8792ad' },
];
export const PERFECT_TIER = { key: 'perfect', label: 'PERFECT SEASON', min: 162, color: '#f5a623' };
export const tierFor = (wins) => (wins >= SEASON_GAMES ? PERFECT_TIER : TIERS.find((t) => wins >= t.min));

export function recordOf(games) {
  let wins = 0;
  for (const g of games) if (g.result === 'W') wins++;
  return { wins, losses: games.length - wins };
}

export const pctText = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '.000');

export function activeStreak(games) {
  let n = 0;
  for (let i = games.length - 1; i >= 0 && games[i].result === 'W'; i--) n++;
  return n;
}

export function seasonSummary(games) {
  const rec = recordOf(games);
  let longest = 0;
  let run = 0;
  for (const g of games) { run = g.result === 'W' ? run + 1 : 0; longest = Math.max(longest, run); }
  const rf = games.reduce((s, g) => s + g.us, 0);
  const ra = games.reduce((s, g) => s + g.them, 0);
  const margin = (g) => g.us - g.them;
  const wins = games.filter((g) => g.result === 'W');
  const losses = games.filter((g) => g.result === 'L');
  return {
    ...rec,
    perfect: rec.wins === SEASON_GAMES,
    longestWinStreak: longest,
    runsFor: rf,
    runsAgainst: ra,
    diff: rf - ra,
    shutouts: games.filter((g) => g.them === 0).length,
    extras: games.filter((g) => g.inn > 9).length,
    walkoffs: games.filter((g) => g.home && g.result === 'W' && g.bottom.at(-1) !== null && g.us - g.them === 1 && g.bottom.length >= 9).length,
    bestWin: wins.reduce((b, g) => (!b || margin(g) > margin(b) ? g : b), null),
    worstLoss: losses.reduce((b, g) => (!b || margin(g) < margin(b) ? g : b), null),
    months: MONTHS.map(([label, a, z]) => ({ label, ...recordOf(games.slice(a - 1, z)) })),
  };
}
