/**
 * 17-0 Web — Football engine (pure, no DOM).
 *
 * Port of the 17-0 Football iOS app:
 *   Roster.swift              → teamMetrics (passing / rushing / defense / chemistry / team rating)
 *   DraftPoolGenerator.swift  → ROUNDS, eligibleContexts, generatePool
 *   SeasonSimulator.swift     → footballScore, the 17-game scoring model (ties stay ties)
 *   SeasonResult.classify     → tierFor
 *   Team.swift / Player.swift → real and fictional identities (stable name hash)
 *
 * Web-only layer: three coaching calls (after weeks 5, 9 and 13) that tilt the same
 * scoring model, and an exact season outlook computed from the score distributions.
 */

let rand = Math.random;
/** Swap the random source (tests use a seeded generator). */
export function setRandom(fn) { rand = fn || Math.random; }

export const SEASON_GAMES = 17;
export const BASELINE = 78; // the undrafted 48 players of the 53-man roster
export const SPECIAL_TEAMS = 78;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampRating = (v) => clamp(v, 40, 99);

export function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (list) => list[Math.floor(rand() * list.length)];

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `fb-${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

/** Small deterministic PRNG (mulberry32) for repeatable projections and tests. */
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

// ---------------------------------------------------------------------------
// Positions, rounds, eras, franchises
// ---------------------------------------------------------------------------

export const POSITION_NAMES = {
  QB: 'Quarterback', RB: 'Running Back', WR: 'Wide Receiver', TE: 'Tight End',
  EDGE: 'Edge Rusher', DL: 'Defensive Line', LB: 'Linebacker', CB: 'Cornerback', S: 'Safety',
};
export const DEFENSIVE = ['EDGE', 'DL', 'LB', 'CB', 'S'];
const TARGETS = ['WR', 'TE'];

/** Five-round core (DraftPoolGenerator.roundRules). */
export const ROUNDS = [
  { round: 1, slot: 'QB', title: 'Quarterback', positions: ['QB'], need: 'a quarterback' },
  { round: 2, slot: 'RB', title: 'Running Back', positions: ['RB'], need: 'a running back' },
  { round: 3, slot: 'WR', title: 'Wide Receiver', positions: ['WR'], need: 'a wide receiver' },
  { round: 4, slot: 'FLEX', title: 'Receiving Flex', positions: ['WR', 'TE'], need: 'a receiver or tight end' },
  { round: 5, slot: 'DEF', title: 'Defensive Anchor', positions: DEFENSIVE, need: 'a defensive anchor' },
];
export const SLOTS = ROUNDS.map((r) => r.slot);

export const ERAS = [
  { id: "70's", label: '1970s', start: 1970, end: 1979 },
  { id: "80's", label: '1980s', start: 1980, end: 1989 },
  { id: "90's", label: '1990s', start: 1990, end: 1999 },
  { id: "00's", label: '2000s', start: 2000, end: 2009 },
  { id: "10's", label: '2010s', start: 2010, end: 2019 },
  { id: "20's", label: '2020s', start: 2020, end: 2029 },
];
export const eraById = (id) => ERAS.find((e) => e.id === id) || ERAS[0];

/**
 * Franchises (Team.swift). `real(era)` follows relocations; colors are display-only.
 * [id, real name or era→name map, fictional name, fictional abbreviation, primary, secondary]
 */
const TEAM_ROWS = [
  ['ARI', { "80's": 'St. Louis Cardinals', _: 'Arizona Cardinals' }, 'Desert Scorpions', 'DSC', '#97233f', '#ffb612'],
  ['ATL', 'Atlanta Falcons', 'Atlanta Firebirds', 'FBD', '#a71930', '#a5acaf'],
  ['BAL', 'Baltimore Ravens', 'Baltimore Nightwings', 'NTW', '#3b2a8c', '#9e7c0c'],
  ['BUF', 'Buffalo Bills', 'Buffalo Blizzard', 'BLZ', '#00338d', '#c60c30'],
  ['CHI', 'Chicago Bears', 'Chicago Grizzlies', 'GRZ', '#1f3561', '#c83803'],
  ['DAL', 'Dallas Cowboys', 'Dallas Outlaws', 'OUT', '#003594', '#869397'],
  ['DET', 'Detroit Lions', 'Detroit Pride', 'PRD', '#0076b6', '#b0b7bc'],
  ['GB', 'Green Bay Packers', 'Green Bay Guardians', 'GRD', '#2b5a40', '#ffb612'],
  ['IND', { "70's": 'Baltimore Colts', _: 'Indianapolis Colts' }, 'Indianapolis Racers', 'RCR', '#0b4a8f', '#a2aaad'],
  ['KC', 'Kansas City Chiefs', 'Kansas City Monarchs', 'MON', '#e31837', '#ffb81c'],
  ['LAC', { "00's": 'San Diego Chargers', "80's": 'San Diego Chargers', _: 'Los Angeles Chargers' }, 'Los Angeles Waves', 'WAV', '#0080c6', '#ffc20e'],
  ['LAR', { "00's": 'St. Louis Rams', _: 'Los Angeles Rams' }, 'Los Angeles Goldhorns', 'GLD', '#003594', '#ffa300'],
  ['LV', { "80's": 'Los Angeles Raiders', "90's": 'Los Angeles Raiders', "00's": 'Oakland Raiders', "10's": 'Oakland Raiders', _: 'Las Vegas Raiders' }, 'Las Vegas High Rollers', 'ROL', '#4b5563', '#d1d5db'],
  ['MIA', 'Miami Dolphins', 'Miami Sharks', 'SHK', '#008e97', '#fc4c02'],
  ['MIN', 'Minnesota Vikings', 'Minnesota Frost', 'FST', '#4f2683', '#ffc62f'],
  ['NE', 'New England Patriots', 'New England Sentinels', 'SEN', '#173a6b', '#c60c30'],
  ['NYG', 'New York Giants', 'New York Empires', 'EMP', '#1a3a8f', '#a71930'],
  ['PHI', 'Philadelphia Eagles', 'Philadelphia Freedom', 'FRE', '#004c54', '#a5acaf'],
  ['PIT', 'Pittsburgh Steelers', 'Pittsburgh Forge', 'FRG', '#2a2f36', '#ffb612'],
  ['SF', 'San Francisco 49ers', 'San Francisco Gold Rush', 'GDR', '#aa0000', '#b3995d'],
  ['TB', 'Tampa Bay Buccaneers', 'Tampa Bay Corsairs', 'COR', '#d50a0a', '#b1babf'],
  ['TEN', { "90's": 'Tennessee Oilers', _: 'Tennessee Titans' }, 'Tennessee Sound', 'SND', '#1e4f8f', '#8fc1ee'],
];

export const TEAMS = TEAM_ROWS.map(([id, real, fictional, fAbbr, c1, c2]) => ({ id, real, fictional, fAbbr, c1, c2 }));
const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
export const teamById = (id) => TEAM_BY_ID.get(id);

/** Display identity for a franchise in an era (era optional). */
export function teamIdentity(teamOrId, realNames, era) {
  const t = typeof teamOrId === 'string' ? teamById(teamOrId) : teamOrId;
  if (!t) return { name: 'League opponent', abbr: 'OPP', c1: '#3a4558', c2: '#9aa7ba' };
  if (!realNames) return { name: t.fictional, abbr: t.fAbbr, c1: t.c1, c2: t.c2 };
  const name = typeof t.real === 'string' ? t.real : (t.real[era] || t.real._);
  return { name, abbr: t.id, c1: t.c1, c2: t.c2 };
}

// ---------------------------------------------------------------------------
// Fictional player names (Player.swift FictionalPlayerNames — byte-exact port)
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Aiden', 'Andre', 'Brandon', 'Bryce', 'Caleb', 'Cameron', 'Carter', 'Darius',
  'Devin', 'Elias', 'Ethan', 'Evan', 'Isaiah', 'Jalen', 'Jayden', 'Jordan',
  'Julian', 'Kai', 'Landon', 'Malcolm', 'Marcus', 'Mason', 'Micah', 'Miles',
  'Nolan', 'Quentin', 'Roman', 'Ryan', 'Spencer', 'Tristan', 'Tyler', 'Zane',
];
const LAST_NAMES = [
  'Bennett', 'Brooks', 'Carter', 'Coleman', 'Collins', 'Cooper', 'Daniels', 'Davis',
  'Ellis', 'Foster', 'Franklin', 'Grant', 'Gray', 'Hayes', 'Hill', 'Howard',
  'Jackson', 'Jenkins', 'Lewis', 'Marshall', 'Mitchell', 'Morgan', 'Parker', 'Price',
  'Reed', 'Robinson', 'Scott', 'Stewart', 'Taylor', 'Thomas', 'Walker', 'Williams',
];

const MASK = (1n << 64n) - 1n;
const encoder = new TextEncoder();

function stableHash(value, seed) {
  let hash = BigInt(seed);
  for (const byte of encoder.encode(value)) hash = ((hash ^ BigInt(byte)) * 1099511628211n) & MASK;
  hash ^= hash >> 30n;
  hash = (hash * 0xbf58476d1ce4e5b9n) & MASK;
  hash ^= hash >> 27n;
  hash = (hash * 0x94d049bb133111ebn) & MASK;
  return hash ^ (hash >> 31n);
}

const nameCache = new Map();
export function fictionalName(personId) {
  let name = nameCache.get(personId);
  if (!name) {
    const first = FIRST_NAMES[Number(stableHash(personId, 2166136261n) % 32n)];
    const last = LAST_NAMES[Number(stableHash(personId, 1469598103934665603n) % 32n)];
    const ih = stableHash(personId, 1099511628211n);
    const i1 = String.fromCharCode(65 + Number(ih % 26n));
    const i2 = String.fromCharCode(65 + Number((ih / 26n) % 26n));
    name = `${first} ${i1}${i2}. ${last}`;
    nameCache.set(personId, name);
  }
  return name;
}

export const playerName = (p, realNames) => (realNames ? p.name : fictionalName(p.person));

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/** Defense (FootballRatings.defense uses integer division). */
export const defenseOf = (p) => Math.floor((p.r.coverage + p.r.passRush + p.r.tackling + p.r.awareness) / 4);

/** Position-specific headline ratings (Player.displayRatings). */
export function displayRatings(p) {
  const r = p.r;
  switch (p.pos) {
    case 'QB': return [['PASS', r.passing], ['AWR', r.awareness], ['MOB', r.rushing], ['ATH', r.athleticism]];
    case 'RB': return [['RUN', r.rushing], ['REC', r.receiving], ['BLK', r.blocking], ['ATH', r.athleticism]];
    case 'WR': case 'TE': return [['REC', r.receiving], ['AWR', r.awareness], ['BLK', r.blocking], ['ATH', r.athleticism]];
    default: return [['COV', r.coverage], ['RUSH', r.passRush], ['TKL', r.tackling], ['AWR', r.awareness]];
  }
}

// ---------------------------------------------------------------------------
// Draft pools (DraftPoolGenerator.swift)
// ---------------------------------------------------------------------------

export const MODES = {
  classic: { id: 'classic', title: 'Classic', difficulty: 'Standard', hidden: false, cap: 99, blurb: 'Every rating visible. Build the strongest five you can.' },
  iq: { id: 'iq', title: 'Gridiron IQ', difficulty: 'Hard', hidden: true, cap: 99, blurb: 'Ratings hidden. Draft on football knowledge, roles and scheme fit.' },
  challenge: { id: 'challenge', title: 'Challenge', difficulty: 'Expert', hidden: false, cap: 94, blurb: 'No superstars: nobody rated 95 or higher can be drafted.' },
};
export const modeOf = (id) => MODES[id] || MODES.classic;

export function generatePool(players, round, { team, era, selected = [], mode = 'classic', limit = 25 } = {}) {
  const rule = ROUNDS[round - 1];
  if (!rule) return [];
  const used = new Set(selected.map((p) => p.person));
  const cap = modeOf(mode).cap;
  return players
    .filter((p) => rule.positions.includes(p.pos) && p.ovr <= cap && !used.has(p.person)
      && (!team || p.team === team) && (!era || p.era === era))
    .sort((a, b) => b.ovr - a.ovr || (a.name < b.name ? -1 : 1))
    .slice(0, limit);
}

/** Team + era combinations with enough eligible players for this round (min 8, relaxed only if none qualify). */
export function eligibleContexts(players, round, selected = [], mode = 'classic') {
  const rule = ROUNDS[round - 1];
  if (!rule) return [];
  const pool = generatePool(players, round, { selected, mode, limit: Infinity });
  const counts = new Map();
  for (const p of pool) {
    const key = `${p.team}|${p.era}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const min of [8, 3, 1]) {
    const list = [...counts].filter(([, n]) => n >= min).map(([key, n]) => {
      const [team, era] = key.split('|');
      return { team, era, count: n };
    });
    if (list.length) return list.sort((a, b) => (a.team + a.era < b.team + b.era ? -1 : 1));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Roster ratings (Roster.swift)
// ---------------------------------------------------------------------------

/**
 * `roster` is the drafted core in round order. Identical to the app once all five are
 * drafted; mid-draft, chemistry is previewed with the same rules instead of the app's
 * flat 62 so every pick shows its effect.
 */
export function teamMetrics(roster) {
  const players = roster.filter(Boolean);
  const qb = players.find((p) => p.pos === 'QB');
  const back = players.find((p) => p.pos === 'RB');
  const targets = players.filter((p) => TARGETS.includes(p.pos));
  const anchor = players.find((p) => DEFENSIVE.includes(p.pos));

  const targetQuality = targets.length ? targets.reduce((s, p) => s + p.r.receiving, 0) / targets.length : BASELINE;
  const passing = qb ? clampRating(qb.r.passing * 0.5 + qb.r.awareness * 0.15 + targetQuality * 0.25 + BASELINE * 0.1) : BASELINE;
  const backScore = back ? back.r.rushing * 0.72 + back.r.receiving * 0.08 : BASELINE * 0.8;
  const rushing = clampRating(backScore + (qb ? qb.r.rushing : BASELINE) * 0.08 + BASELINE * 0.12);
  const anchorDefense = anchor ? defenseOf(anchor) : BASELINE;
  const defense = clampRating(anchorDefense * 0.42 + BASELINE * 0.58);
  const offense = passing * 0.58 + rushing * 0.42;

  const bonuses = [];
  if (qb && targets.length) {
    const fit = targets.reduce((s, p) => s + (qb.r.awareness + p.r.awareness) / 2, 0) / targets.length;
    bonuses.push({ key: 'timing', label: 'QB–receiver timing', value: (fit - 80) * 0.18 });
    const sameTeam = Math.min(2, targets.filter((p) => p.team === qb.team).length * 1.0);
    if (sameTeam) bonuses.push({ key: 'franchise', label: 'Same-franchise connection', value: sameTeam });
    const sameEra = Math.min(1, targets.filter((p) => p.era === qb.era).length * 0.5);
    if (sameEra) bonuses.push({ key: 'era', label: 'Same-era connection', value: sameEra });
  }
  if (back && back.r.receiving >= 82) bonuses.push({ key: 'back', label: 'Receiving back', value: 2 });
  if (players.some((p) => (p.pos === 'EDGE' || p.pos === 'DL') && p.r.passRush >= 90)) bonuses.push({ key: 'rush', label: 'Elite pass rush', value: 2 });
  if (players.some((p) => ['LB', 'CB', 'S'].includes(p.pos) && p.r.coverage >= 90)) bonuses.push({ key: 'coverage', label: 'Coverage anchor', value: 2 });
  const chemistry = clampRating(70 + bonuses.reduce((s, b) => s + b.value, 0));

  const teamRating = clampRating(passing * 0.26 + rushing * 0.19 + defense * 0.27 + chemistry * 0.13 + BASELINE * 0.15);
  const overall = players.length ? players.reduce((s, p) => s + p.ovr, 0) / players.length : BASELINE;

  return {
    count: players.length, passing, rushing, defense, offense, chemistry, teamRating, overall,
    anchorDefense, chemistryBreakdown: bonuses,
  };
}

/** Strongest and weakest units (ChemistryCalculator.evaluate). */
export function evaluate(m) {
  const units = [['Passing attack', m.passing], ['Rushing attack', m.rushing], ['Defensive core', m.defense], ['Scheme chemistry', m.chemistry]];
  const strongest = units.reduce((a, b) => (b[1] > a[1] ? b : a));
  const weakest = units.reduce((a, b) => (b[1] < a[1] ? b : a));
  return { strength: strongest[0], weakness: weakest[0] };
}

// ---------------------------------------------------------------------------
// Coaching calls (web edition)
// ---------------------------------------------------------------------------

export const STRETCHES = [[1, 5], [6, 9], [10, 13], [14, 17]];

export const COACHING_CALLS = [
  {
    id: 'identity', checkpoint: 5, endGame: 9, chapter: 'AFTER WEEK 5', title: 'Pick your identity',
    prompt: 'Five games are on film and every coordinator has your tendencies. Choose who you are for weeks 6–9.',
    options: [
      { id: 'air-it-out', title: 'Air it out', detail: 'Feature the passing game. More explosive drives, but quicker possessions give opponents extra chances too.', impact: 'EXPLOSIVE', icon: 'bolt' },
      { id: 'ground-and-pound', title: 'Ground and pound', detail: 'Run the ball, shorten the game and keep your defense rested.', impact: 'CONTROL', icon: 'clock' },
      { id: 'bend-dont-break', title: "Bend, don't break", detail: 'Keep everything in front. Opponents settle for field goals instead of touchdowns.', impact: 'DEFENSE', icon: 'shield' },
    ],
  },
  {
    id: 'grind', checkpoint: 9, endGame: 13, chapter: 'AFTER WEEK 9', title: 'Survive the grind',
    prompt: 'Halfway home. Injuries and film study are catching up with everyone. Set the plan for weeks 10–13.',
    options: [
      { id: 'go-for-it', title: 'Go for it on fourth', detail: 'Turn field-goal tries into touchdown chances. Bigger swings, both ways.', impact: 'HIGH RISK', icon: 'flame' },
      { id: 'protect-the-ball', title: 'Protect the football', detail: 'No hero throws. Fewer turnovers and fewer short fields for the opponent.', impact: 'LOW RISK', icon: 'scale' },
      { id: 'unleash-anchor', title: 'Unleash your anchor', detail: 'Build the defensive game plan around your star defender.', impact: 'STAR POWER', icon: 'star' },
    ],
  },
  {
    id: 'finish', checkpoint: 13, endGame: 17, chapter: 'AFTER WEEK 13', title: 'Close it out',
    prompt: 'Four games stand between you and history. Decide how the team finishes.',
    options: [
      { id: 'no-huddle', title: 'Go no-huddle', detail: 'More snaps, more possessions. The better team usually wins a long game — make sure that is you.', impact: 'ALL IN', icon: 'bolt' },
      { id: 'trust-chemistry', title: 'Trust the chemistry', detail: 'Let established roles and timing decide the close games.', impact: 'TEAM FIT', icon: 'users' },
      { id: 'win-the-clock', title: 'Win the clock', detail: 'Field position, ball control and zero mistakes. Fewer possessions, tighter games.', impact: 'CONTROL', icon: 'clock' },
    ],
  },
];

export const callById = (id) => COACHING_CALLS.find((c) => c.id === id);
export const callForGame = (n) => COACHING_CALLS.find((c) => n > c.checkpoint && n <= c.endGame) || null;

/**
 * Scoring-model modifiers for a call. u* tilt your drives, o* the opponent's,
 * poss changes possessions for both teams (more possessions favor the stronger side).
 */
export function callEffect(optionId, m) {
  switch (optionId) {
    case 'air-it-out': return { uEdge: 0.012 + Math.max(0, m.passing - 84) * 0.003, oEdge: 0.008, poss: 1, summary: 'Passing game unleashed' };
    case 'ground-and-pound': return { uEdge: 0.008 + Math.max(0, m.rushing - 84) * 0.003, oEdge: -0.006, poss: -1, summary: 'Run game established' };
    case 'bend-dont-break': return { oTd: -0.045, oFg: 0.04, summary: 'Red-zone defense tightened' };
    case 'go-for-it': return { uTd: 0.055, uFg: -0.085, summary: 'Fourth-down aggression on' };
    case 'protect-the-ball': return { uEdge: -0.004, oEdge: -0.022, summary: 'Ball security first' };
    case 'unleash-anchor': return { oEdge: -(0.006 + Math.max(0, m.anchorDefense - 84) * 0.0026), summary: 'Defense built around the anchor' };
    case 'no-huddle': return { uEdge: 0.007, poss: 2, summary: 'No-huddle engaged' };
    case 'trust-chemistry': return { uEdge: (m.chemistry - 73) * 0.0017, oEdge: -(m.chemistry - 73) * 0.0011, summary: 'Chemistry trusted' };
    case 'win-the-clock': return { oEdge: -0.012, poss: -2, summary: 'Clock control engaged' };
    default: return { summary: '' };
  }
}

// ---------------------------------------------------------------------------
// Scoring model (SeasonSimulator.footballScore)
// ---------------------------------------------------------------------------

function driveOdds(attack, opposingDefense, chemistry, specialTeams, bonus, edgeMod = 0, tdMod = 0, fgMod = 0) {
  const edge = (attack - opposingDefense) * 0.009 + (chemistry - 75) * 0.002 + bonus * 0.01 + edgeMod;
  const td = clamp(clamp(0.25 + edge, 0.1, 0.48) + tdMod, 0.05, 0.56);
  const fg = clamp(clamp(0.18 + edge * 0.25 + (specialTeams - 78) * 0.002, 0.1, 0.3) + fgMod, 0.02, 0.36);
  return { td, fg };
}

/** One team's possessions. Returns points per possession in order (0, 2, 3, 6 or 7). */
function drives(odds, possessions) {
  const out = [];
  for (let i = 0; i < possessions; i++) {
    const roll = rand();
    if (roll < odds.td) out.push(rand() < 0.97 ? 7 : 6);
    else if (roll < odds.td + odds.fg) out.push(3);
    else if (roll > 0.985) out.push(2);
    else out.push(0);
  }
  return out;
}

/**
 * Simulates one game. `fx` is a callEffect (or {}). Returns the final plus a quarter-by-quarter
 * line score built by interleaving both teams' possessions.
 */
export function simulateGame(m, game, fx = {}) {
  const homeBonus = game.home ? 1.4 : 0;
  const userOdds = driveOdds(m.offense, game.str, m.chemistry, SPECIAL_TEAMS, homeBonus, fx.uEdge || 0, fx.uTd || 0, fx.uFg || 0);
  const oppAttack = game.str + (rand() * 8 - 4);
  const oppOdds = driveOdds(oppAttack, m.defense, 78, 78, 0, fx.oEdge || 0, fx.oTd || 0, fx.oFg || 0);
  const base = 9 + Math.floor(rand() * 4);
  const extra = fx.poss || 0;
  const us = drives(userOdds, Math.max(6, base + extra));
  const them = drives(oppOdds, Math.max(6, 9 + Math.floor(rand() * 4) + extra));

  // Interleave possessions (coin toss decides who receives) and split into quarters.
  const seq = [];
  let a = 0;
  let b = 0;
  let turn = rand() < 0.5 ? 'u' : 't';
  while (a < us.length || b < them.length) {
    if ((turn === 'u' && a < us.length) || b >= them.length) { seq.push(['u', us[a++]]); turn = 't'; } else { seq.push(['t', them[b++]]); turn = 'u'; }
  }
  const lines = { u: [0, 0, 0, 0], t: [0, 0, 0, 0] };
  seq.forEach(([side, pts], i) => { lines[side][Math.min(3, Math.floor((i / seq.length) * 4))] += pts; });
  const usScore = us.reduce((s, x) => s + x, 0);
  const themScore = them.reduce((s, x) => s + x, 0);
  return {
    ...game, us: usScore, them: themScore,
    result: usScore > themScore ? 'W' : usScore < themScore ? 'L' : 'T',
    q: [lines.u, lines.t],
  };
}

/** 17-game schedule: shuffled franchises, opponent strength 74–95, odd weeks at home. */
export function makeSchedule() {
  const opponents = shuffled(TEAMS.map((t) => t.id));
  return Array.from({ length: SEASON_GAMES }, (_, i) => ({
    n: i + 1,
    opp: opponents[i % opponents.length],
    str: Math.round((74 + rand() * 21) * 10) / 10,
    home: i % 2 === 0,
  }));
}

// ---------------------------------------------------------------------------
// Exact odds (score distributions) for projections
// ---------------------------------------------------------------------------

const distCache = new Map();

function scoreDistribution(odds, possessionsList) {
  const key = `${odds.td.toFixed(6)}|${odds.fg.toFixed(6)}|${possessionsList.join(',')}`;
  const hit = distCache.get(key);
  if (hit) return hit;
  const out = buildDistribution(odds, possessionsList);
  if (distCache.size > 4000) distCache.clear();
  distCache.set(key, out);
  return out;
}

function buildDistribution(odds, possessionsList) {
  const per = [[0, 1 - odds.td - odds.fg - 0.015], [2, 0.015], [3, odds.fg], [6, odds.td * 0.03], [7, odds.td * 0.97]];
  const maxP = Math.max(...possessionsList);
  const out = new Float64Array(maxP * 7 + 1);
  let cur = new Float64Array(maxP * 7 + 1);
  cur[0] = 1;
  for (let k = 1; k <= maxP; k++) {
    const next = new Float64Array(maxP * 7 + 1);
    for (let s = 0; s <= (k - 1) * 7; s++) {
      if (!cur[s]) continue;
      for (const [pts, pr] of per) next[s + pts] += cur[s] * pr;
    }
    cur = next;
    if (possessionsList.includes(k)) for (let s = 0; s < out.length; s++) out[s] += cur[s] / possessionsList.length;
  }
  return out;
}

const possessionSet = (extra) => [9, 10, 11, 12].map((p) => Math.max(6, p + extra));

/** Win / tie probability against a given opponent strength (or averaged over 74–95 when str is null). */
export function gameOdds(m, { home = true, str = null, fx = {} } = {}) {
  const strengths = str == null ? Array.from({ length: 21 }, (_, i) => 74.5 + i) : [str];
  const noise = [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5];
  const poss = possessionSet(fx.poss || 0);
  let win = 0;
  let tie = 0;
  for (const s of strengths) {
    const u = scoreDistribution(driveOdds(m.offense, s, m.chemistry, SPECIAL_TEAMS, home ? 1.4 : 0, fx.uEdge || 0, fx.uTd || 0, fx.uFg || 0), poss);
    for (const e of noise) {
      const t = scoreDistribution(driveOdds(s + e, m.defense, 78, 78, 0, fx.oEdge || 0, fx.oTd || 0, fx.oFg || 0), poss);
      let below = 0;
      for (let x = 0; x < u.length; x++) {
        win += (u[x] * below) / (strengths.length * noise.length);
        tie += (u[x] * (t[x] || 0)) / (strengths.length * noise.length);
        below += t[x] || 0;
      }
    }
  }
  return { win, tie, loss: Math.max(0, 1 - win - tie) };
}

const outlookCache = new Map();
/** Expected record and the chance of a perfect 17-0-0 season before any coaching calls. */
export function seasonOutlook(m) {
  const key = [m.offense, m.defense, m.chemistry].map((v) => v.toFixed(3)).join('|');
  if (outlookCache.has(key)) return outlookCache.get(key);
  const h = gameOdds(m, { home: true });
  const a = gameOdds(m, { home: false });
  const out = {
    wins: 9 * h.win + 8 * a.win,
    ties: 9 * h.tie + 8 * a.tie,
    perfect: h.win ** 9 * a.win ** 8,
    perGame: (9 * h.win + 8 * a.win) / 17,
  };
  if (outlookCache.size > 400) outlookCache.clear();
  outlookCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// Results (SeasonResult.swift)
// ---------------------------------------------------------------------------

export const TIERS = [
  { key: 'legendary', label: 'LEGENDARY', min: 15, color: '#ffc726' },
  { key: 'elite', label: 'ELITE', min: 12, color: '#ff8a3d' },
  { key: 'contender', label: 'CONTENDER', min: 10, color: '#22d3ee' },
  { key: 'average', label: 'AVERAGE', min: 8, color: '#60a5fa' },
  { key: 'struggling', label: 'STRUGGLING', min: 5, color: '#94a3b8' },
  { key: 'rebuild', label: 'REBUILD REQUIRED', min: 0, color: '#f87171' },
];
export const tierFor = (wins) => TIERS.find((t) => wins >= t.min);

export function recordOf(games) {
  let wins = 0; let losses = 0; let ties = 0;
  for (const g of games) { if (g.result === 'W') wins++; else if (g.result === 'L') losses++; else ties++; }
  return { wins, losses, ties };
}

export const recordText = ({ wins, losses, ties }) => (ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`);

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
  const pf = games.reduce((s, g) => s + g.us, 0);
  const pa = games.reduce((s, g) => s + g.them, 0);
  const margin = (g) => g.us - g.them;
  const wins = games.filter((g) => g.result === 'W');
  const losses = games.filter((g) => g.result === 'L');
  return {
    ...rec,
    perfect: rec.wins === SEASON_GAMES,
    longestWinStreak: longest,
    pointsFor: pf,
    pointsAgainst: pa,
    ppg: games.length ? pf / games.length : 0,
    oppPpg: games.length ? pa / games.length : 0,
    diff: pf - pa,
    bestWin: wins.reduce((b, g) => (!b || margin(g) > margin(b) ? g : b), null),
    worstLoss: losses.reduce((b, g) => (!b || margin(g) < margin(b) ? g : b), null),
    closest: games.filter((g) => g.result !== 'T').reduce((b, g) => (!b || Math.abs(margin(g)) < Math.abs(margin(b)) ? g : b), null),
  };
}
