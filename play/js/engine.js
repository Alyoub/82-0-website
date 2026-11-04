/**
 * 82-0 Web — Game engine.
 *
 * A faithful port of the iOS engine (82v3/Game/*.swift and Core/Models/*.swift):
 * position fit, chemistry, sixth-man bench impact, team power, report
 * generation, the 82-game season RNG, coaching effects, and season tiers.
 *
 * Pure logic only: no DOM and no storage, so it can be unit tested in Node.
 */

// ---------------------------------------------------------------------------
// Randomness (swappable for deterministic tests)
// ---------------------------------------------------------------------------

let rand = Math.random;
export function setRandom(fn) { rand = fn || Math.random; }

/** Inclusive integer in [lo, hi], like Swift `Int.random(in: lo...hi)`. */
export function randInt(lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); }
function randDouble(lo, hi) { return lo + rand() * (hi - lo); }
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const average = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.floor(rand() * 1e9).toString(36);
}

// ---------------------------------------------------------------------------
// Positions & fit (PositionCompatibilityEngine.swift)
// ---------------------------------------------------------------------------

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
export const POSITION_NAMES = {
  PG: 'Point Guard', SG: 'Shooting Guard', SF: 'Small Forward', PF: 'Power Forward', C: 'Center',
};

const ADJACENT = {
  PG: { PG: 1.0, SG: 0.95 },
  SG: { PG: 0.95, SG: 1.0, SF: 0.95 },
  SF: { SG: 0.95, SF: 1.0, PF: 0.95 },
  PF: { SF: 0.95, PF: 1.0, C: 0.95 },
  C: { PF: 0.95, C: 1.0 },
};

export function effectiveness(player, slot) {
  if (player.primaryPosition === slot) return 1.0;
  if (player.secondaryPositions.includes(slot)) return 0.95;
  const adj = ADJACENT[player.primaryPosition]?.[slot];
  if (adj != null) return adj;
  return 0.85;
}

// ---------------------------------------------------------------------------
// Chemistry (ChemistryEngine.swift)
// ---------------------------------------------------------------------------

export function calculateChemistry(roster, eff) {
  const players = Object.values(roster);
  if (!players.length) return { score: 50, bonuses: [], penalties: [] };

  let score = 70;
  const bonuses = [];
  const penalties = [];
  const add = (reason, value) => { score += value; bonuses.push({ reason, value }); };
  const sub = (reason, value) => { score += value; penalties.push({ reason, value }); };

  if (players.some((p) => p.playmaking >= 88)) add('Elite Playmaker', 5);
  if (players.some((p) => p.shooting >= 90)) add('Elite Perimeter Threat', 4);

  if (roster.C && roster.C.defense >= 88) add('Lockdown Anchor at Center', 4);
  else if (roster.PF && roster.PF.defense >= 88) add('Interior Defensive Anchor', 3);

  const avgOff = average(players.map((p) => p.offense));
  const avgDef = average(players.map((p) => p.defense));
  const avgReb = average(players.map((p) => p.rebounding));
  const avgShot = average(players.map((p) => p.shooting));
  if ([avgOff, avgDef, avgReb, avgShot].every((v) => v >= 75)) add('Balanced Roster Skillsets', 5);

  if (new Set(players.map((p) => p.archetype)).size >= 4) add('Complementary Archetypes', 3);

  for (const pos of Object.keys(eff)) {
    const e = eff[pos];
    if (e <= 0.85) sub(`Severe mismatch at ${pos}`, -3);
    else if (e < 1.0) sub(`Slight position stretch at ${pos}`, -1);
  }

  if (players.every((p) => p.defense < 80)) sub('Defensive liability (no player ≥ 80 DEF)', -4);

  if (players.filter((p) => p.shooting >= 80).length < 2) sub('Clogged lanes (< 2 shooters ≥ 80 SHT)', -3);

  const groups = {};
  for (const p of players) groups[p.archetype] = (groups[p.archetype] || 0) + 1;
  for (const [archetype, count] of Object.entries(groups)) {
    if (count >= 3) sub(`Role overlap (${count}x ${archetype})`, -2);
  }

  return { score: Math.round(clamp(score, 40, 99)), bonuses, penalties };
}

// ---------------------------------------------------------------------------
// Team metrics & bench impact (SeasonSimulationEngine.swift, TeamMetrics.swift)
// ---------------------------------------------------------------------------

export function positionsCovered(player) {
  return new Set([player.primaryPosition, ...player.secondaryPositions]).size;
}

export function calculateBenchImpact(player) {
  const scoring = Math.trunc(player.offense * 0.45 + player.shooting * 0.35 + player.overall * 0.2);
  const covered = positionsCovered(player);
  const positionalCoverage = Math.min(99, 38 + covered * 18 + Math.floor(player.playmaking / 10));
  const fatigueRelief = Math.min(99, Math.trunc(player.overall * 0.55 + player.athleticism * 0.3) + covered * 4);

  const scoringBonus = Math.max(0, scoring - 60) * 0.055;
  const coverageBonus = Math.max(0, positionalCoverage - 35) * 0.022;
  const fatigueBonus = Math.max(0, fatigueRelief - 45) * 0.025;
  const powerBonus = clamp(scoringBonus + coverageBonus + fatigueBonus, 0.75, 5.0);

  return { scoring, positionalCoverage, fatigueRelief, powerBonus };
}

export function calculateTeamMetrics(roster, eff, sixthMan = null) {
  const players = Object.values(roster);
  if (!players.length) {
    return {
      overall: 70, offense: 70, defense: 70, shooting: 70, rebounding: 70, playmaking: 70,
      chemistry: { score: 50, bonuses: [], penalties: [] }, benchImpact: null,
    };
  }
  const chemistry = calculateChemistry(roster, eff);
  const adjusted = Object.entries(roster).map(([pos, p]) => p.overall * (eff[pos] ?? 1.0));
  const avgOf = (key) => Math.trunc(average(players.map((p) => p[key])));
  return {
    overall: Math.trunc(average(adjusted)),
    offense: avgOf('offense'),
    defense: avgOf('defense'),
    shooting: avgOf('shooting'),
    rebounding: avgOf('rebounding'),
    playmaking: avgOf('playmaking'),
    chemistry,
    benchImpact: sixthMan ? calculateBenchImpact(sixthMan) : null,
  };
}

export function teamPower(m) {
  const base = m.offense * 0.25 + m.defense * 0.2 + m.shooting * 0.15
    + m.rebounding * 0.1 + m.playmaking * 0.1 + m.overall * 0.2;
  return base + (m.chemistry.score / 100) * 8 + (m.benchImpact?.powerBonus ?? 0);
}

// ---------------------------------------------------------------------------
// Season simulation (SeasonSimulationEngine.swift)
// ---------------------------------------------------------------------------

export const OPP_MEAN = 78;
export const OPP_SD = 7.5;

function sampleGaussian(mean, sd) {
  const u1 = Math.max(1e-10, rand());
  const u2 = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function winProbability(power, opponentPower, volatility = 1) {
  const base = 1 / (1 + Math.exp(-0.11 * (power - opponentPower)));
  return clamp(0.5 + (base - 0.5) / clamp(volatility, 0.58, 1.6), 0.03, 0.97);
}

/**
 * Simulates games [from...to]. `opponents` is an optional list of team ids used
 * only for cosmetic matchup labels; it never changes a result.
 */
export function simulateGames(metrics, from, to, { powerModifier = 0, volatility = 1, opponents = [] } = {}) {
  const power = teamPower(metrics) + powerModifier;
  const marginVol = clamp(volatility, 0.7, 1.35);
  const games = [];
  for (let n = from; n <= to; n++) {
    const opponentPower = clamp(sampleGaussian(OPP_MEAN, OPP_SD), 62, 97);
    const won = rand() < winProbability(power, opponentPower, volatility);
    const basePace = Math.trunc(randDouble(98, 112));
    let userScore, opponentScore;
    if (won) {
      const ceiling = Math.max(5, Math.trunc(26 * marginVol));
      userScore = basePace + randInt(4, 16);
      opponentScore = userScore - randInt(1, ceiling);
    } else {
      const ceiling = Math.max(4, Math.trunc(20 * marginVol));
      opponentScore = basePace + randInt(4, 16);
      userScore = opponentScore - randInt(1, ceiling);
    }
    const game = { n, us: userScore, them: opponentScore, won, opp: Math.round(opponentPower) };
    if (opponents.length) game.team = opponents[Math.floor(rand() * opponents.length)];
    games.push(game);
  }
  return games;
}

export function makeSeasonResult(games) {
  const wins = games.filter((g) => g.won).length;
  return { wins, losses: games.length - wins, games };
}

export function simulateSeason(metrics, opponents = []) {
  return makeSeasonResult(simulateGames(metrics, 1, 82, { opponents }));
}

export function applyCoachingEffect(effect, startGame, endGame, result, metrics, opponents = []) {
  if (startGame > endGame || startGame < 1 || endGame > 82 || result.games.length !== 82) return result;
  const replacement = simulateGames(metrics, startGame, endGame, {
    powerModifier: effect.powerModifier, volatility: effect.volatility, opponents,
  });
  const games = result.games.slice();
  games.splice(startGame - 1, endGame - startGame + 1, ...replacement);
  return makeSeasonResult(games);
}

/**
 * Expected per-game win probability against the league's opponent distribution
 * (numerical integration over the clamped Gaussian). Used for the draft-room
 * outlook only; the season itself is always rolled game by game.
 */
export function expectedWinRate(power, volatility = 1) {
  let total = 0;
  let weight = 0;
  for (let z = -6; z <= 6; z += 0.02) {
    const w = Math.exp(-0.5 * z * z);
    total += w * winProbability(power, clamp(OPP_MEAN + OPP_SD * z, 62, 97), volatility);
    weight += w;
  }
  return total / weight;
}

// ---------------------------------------------------------------------------
// Season summaries & tiers (SeasonResult.swift)
// ---------------------------------------------------------------------------

export const margin = (g) => g.us - g.them;

export const TIERS = {
  perfect: { key: 'perfect', label: 'PERFECT SEASON', color: '#F5A623' },
  legendary: { key: 'legendary', label: 'LEGENDARY', color: '#8B5CF6' },
  elite: { key: 'elite', label: 'ELITE', color: '#3B82F6' },
  contender: { key: 'contender', label: 'CONTENDER', color: '#10B981' },
  average: { key: 'average', label: 'AVERAGE', color: '#8B95B0' },
  below: { key: 'below', label: 'REBUILDING', color: '#64708F' },
};

export function tierFor(wins) {
  if (wins >= 82) return TIERS.perfect;
  if (wins >= 75) return TIERS.legendary;
  if (wins >= 65) return TIERS.elite;
  if (wins >= 55) return TIERS.contender;
  if (wins >= 45) return TIERS.average;
  return TIERS.below;
}

export function seasonSummary(games) {
  let longest = 0;
  let current = 0;
  let total = 0;
  let bestWin = null;
  let worstLoss = null;
  for (const g of games) {
    if (g.won) { current += 1; longest = Math.max(longest, current); } else current = 0;
    total += margin(g);
    if (g.won && (!bestWin || margin(g) > margin(bestWin))) bestWin = g;
    if (!g.won && (!worstLoss || margin(g) < margin(worstLoss))) worstLoss = g;
  }
  const wins = games.filter((g) => g.won).length;
  return {
    wins,
    losses: games.length - wins,
    longestWinStreak: longest,
    averageMargin: games.length ? total / games.length : 0,
    bestWin,
    worstLoss,
  };
}

/** Active streak at the end of the revealed games: positive = wins, negative = losses. */
export function activeStreak(games) {
  if (!games.length) return 0;
  const last = games[games.length - 1].won;
  let n = 0;
  for (let i = games.length - 1; i >= 0 && games[i].won === last; i--) n++;
  return last ? n : -n;
}

// ---------------------------------------------------------------------------
// Coaching moments (SeasonResult.swift)
// ---------------------------------------------------------------------------

export const COACHING_MOMENTS = [
  {
    id: 'rotationAudit', checkpoint: 20, endGame: 41,
    chapter: 'QUARTER-SEASON CHECKPOINT', title: 'Set the rotation',
    prompt: 'The first 20 games are on film. Decide how the minutes should work before the schedule tightens.',
    options: [
      { id: 'ride-starters', title: 'Ride the starters', detail: 'Lean on top-end talent and accept more night-to-night volatility.', impact: 'HIGH CEILING', icon: 'star', focus: 'starPower' },
      { id: 'bench-surge', title: 'Unleash the sixth', detail: "Create a second unit around your sixth man's scoring and coverage.", impact: 'BENCH FIT', icon: 'users', focus: 'benchSurge' },
      { id: 'balanced-minutes', title: 'Balance the minutes', detail: 'Keep every role stable and reduce the risk of a sudden slide.', impact: 'LOW RISK', icon: 'scale', focus: 'balancedRotation' },
    ],
  },
  {
    id: 'identityCall', checkpoint: 41, endGame: 61,
    chapter: 'MIDSEASON CHECKPOINT', title: 'Choose your identity',
    prompt: 'The league has adjusted to your lineup. Commit to the style that will carry the second half.',
    options: [
      { id: 'push-pace', title: 'Push the pace', detail: 'Turn shooting and offense into more possessions and bigger swings.', impact: 'OFFENSE', icon: 'bolt', focus: 'pushPace' },
      { id: 'lock-down', title: 'Lock down', detail: 'Win with defense, rebounding, and controlled late-game execution.', impact: 'DEFENSE', icon: 'shield', focus: 'lockdown' },
      { id: 'creator-hub', title: 'Play through creators', detail: 'Use playmaking and chemistry to generate the cleanest matchup.', impact: 'CHEMISTRY', icon: 'nodes', focus: 'creatorHub' },
    ],
  },
  {
    id: 'finalPush', checkpoint: 61, endGame: 82,
    chapter: 'FINAL-STRETCH CHECKPOINT', title: 'Make the final push',
    prompt: 'Twenty-one games remain. Choose how aggressively the team should chase the perfect finish.',
    options: [
      { id: 'chase-record', title: 'Chase the record', detail: 'Go all-in for 82-0. Maximum upside, with the most exposure to an upset.', impact: 'ALL IN', icon: 'flame', focus: 'chaseRecord' },
      { id: 'protect-legs', title: 'Protect their legs', detail: 'Prioritize consistency and fresh execution over explosive peaks.', impact: 'CONTROL', icon: 'heart', focus: 'protectLegs' },
      { id: 'trust-chemistry', title: 'Trust the group', detail: 'Let established roles and team chemistry decide the closing stretch.', impact: 'TEAM FIT', icon: 'users', focus: 'trustChemistry' },
    ],
  },
];

export const momentById = (id) => COACHING_MOMENTS.find((m) => m.id === id);

export function coachingEffect(focus, m) {
  switch (focus) {
    case 'starPower':
      return { powerModifier: 2.4 + Math.max(0, m.overall - 76) * 0.08, volatility: 1.28, summary: 'Star unit empowered' };
    case 'benchSurge':
      return { powerModifier: 1.0 + (m.benchImpact?.powerBonus ?? 0.75) * 0.58, volatility: 0.9, summary: 'Second unit activated' };
    case 'balancedRotation':
      return { powerModifier: 1.65, volatility: 0.68, summary: 'Rotation stabilized' };
    case 'pushPace':
      return { powerModifier: 1.25 + Math.max(0, Math.max(m.offense, m.shooting) - 74) * 0.09, volatility: 1.25, summary: 'Tempo increased' };
    case 'lockdown':
      return { powerModifier: 1.25 + Math.max(0, Math.floor((m.defense + m.rebounding) / 2) - 74) * 0.09, volatility: 0.72, summary: 'Defense tightened' };
    case 'creatorHub':
      return { powerModifier: 1.1 + Math.max(0, m.playmaking - 72) * 0.08 + m.chemistry.score / 110, volatility: 0.92, summary: 'Creators put in control' };
    case 'chaseRecord':
      return { powerModifier: 3.5, volatility: 1.5, summary: 'Record chase engaged' };
    case 'protectLegs':
      return { powerModifier: 1.45, volatility: 0.64, summary: 'Workload managed' };
    case 'trustChemistry':
      return { powerModifier: 0.85 + m.chemistry.score / 24, volatility: 0.84, summary: 'Chemistry trusted' };
    default:
      return { powerModifier: 0, volatility: 1, summary: '' };
  }
}

// ---------------------------------------------------------------------------
// Report generation (DraftEngine.swift, PlayerPoolService.swift)
// ---------------------------------------------------------------------------

function playedFor(player, teamId, era) {
  return player.teamHistory.some((t) => t.teamID === teamId && t.years.some((y) => y >= era.startYear && y <= era.endYear));
}

function byRating(a, b) {
  if (a.overall === b.overall) return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  return b.overall - a.overall;
}

export function eligiblePlayers(db, team, era, position, excluding = new Set()) {
  return db.players
    .filter((p) => !excluding.has(p.id)
      && (p.primaryPosition === position || p.secondaryPositions.includes(position))
      && playedFor(p, team.id, era))
    .sort(byRating);
}

export function eligibleSixthMen(db, team, era, excluding = new Set()) {
  return db.players.filter((p) => !excluding.has(p.id) && playedFor(p, team.id, era)).sort(byRating);
}

export function scoutingReports(db, { count = 3, position, excluding = new Set(), recentTeamIds = [], isSixthMan = false }) {
  let candidates = [];
  for (const team of db.teams) {
    for (const era of db.eras) {
      const players = isSixthMan
        ? eligibleSixthMen(db, team, era, excluding)
        : eligiblePlayers(db, team, era, position, excluding);
      if (players.length) {
        candidates.push({ id: uuid(), team, era, position, eligiblePlayers: players, isSixthMan });
      }
    }
  }

  for (const minimum of [4, 3]) {
    const richer = candidates.filter((c) => c.eligiblePlayers.length >= minimum);
    if (new Set(richer.map((c) => c.team.id)).size >= count) { candidates = richer; break; }
  }

  const preferred = shuffled(candidates.filter((c) => !recentTeamIds.includes(c.team.id)));
  const repeated = shuffled(candidates.filter((c) => recentTeamIds.includes(c.team.id)));
  const ordered = [...preferred, ...repeated];
  const selected = [];
  const usedTeams = new Set();
  for (const report of ordered) {
    if (selected.length >= count) break;
    if (usedTeams.has(report.team.id)) continue;
    usedTeams.add(report.team.id);
    selected.push(report);
  }
  if (selected.length < count) {
    const ids = new Set(selected.map((r) => r.id));
    selected.push(...ordered.filter((r) => !ids.has(r.id)).slice(0, count - selected.length));
  }
  return selected.slice(0, count);
}

// ---------------------------------------------------------------------------
// Identity display (IdentityDisplayService.swift)
// ---------------------------------------------------------------------------

const FIRST_NAMES = ['Adrian', 'Andre', 'Caleb', 'Cameron', 'Darius', 'Devin', 'Elias', 'Evan',
  'Isaiah', 'Jalen', 'Jamal', 'Jordan', 'Julian', 'Kai', 'Malik', 'Marcus',
  'Micah', 'Miles', 'Noah', 'Owen', 'Quentin', 'Roman', 'Terrence', 'Xavier'];
const LAST_NAMES = ['Banks', 'Bennett', 'Brooks', 'Carter', 'Coleman', 'Cross', 'Daniels', 'Ellis',
  'Foster', 'Griffin', 'Hayes', 'Holland', 'Jefferson', 'Lawson', 'Mercer', 'Mitchell',
  'Monroe', 'Parker', 'Reed', 'Rhodes', 'Simmons', 'Stone', 'Vaughn', 'Warren'];

const FICTIONAL_TEAMS = {
  ATL: ['Peachtree Firebirds', 'Peachtree', 'PTF'], BOS: ['Harbor Sentinels', 'Harbor City', 'HBS'],
  BKN: ['Kings County Phantoms', 'Kings County', 'KCP'], CHA: ['Queen City Flight', 'Queen City', 'QCF'],
  CHI: ['Lakefront Forge', 'Lakefront', 'LFF'], CLE: ['Cuyahoga Comets', 'Cuyahoga', 'CYC'],
  DAL: ['Lone Star Outlaws', 'Lone Star', 'LSO'], DEN: ['Summit Yetis', 'Summit', 'SMY'],
  DET: ['Motor City Motors', 'Motor City', 'MCM'], GSW: ['Bay City Gold', 'Bay City', 'BCG'],
  HOU: ['Space City Apollos', 'Space City', 'SCA'], IND: ['Crossroads Racers', 'Crossroads', 'CRR'],
  LAC: ['Pacific Waves', 'Pacific', 'PCW'], LAL: ['Hollywood Royals', 'Hollywood', 'HWR'],
  MEM: ['Bluff City Blues', 'Bluff City', 'BCB'], MIA: ['South Beach Vice', 'South Beach', 'SBV'],
  MIL: ['Cream City Stags', 'Cream City', 'CCS'], MIN: ['North Star Aurora', 'North Star', 'NSA'],
  NOP: ['Crescent City Brass', 'Crescent City', 'CCB'], NYK: ['Empire Skyliners', 'Empire City', 'ESK'],
  OKC: ['Prairie Storm', 'Prairie City', 'PRS'], ORL: ['Sunshine Orbits', 'Sunshine City', 'SSO'],
  PHI: ['Liberty Foundry', 'Liberty City', 'LBF'], PHX: ['Valley Scorch', 'The Valley', 'VSC'],
  POR: ['Rose City Pines', 'Rose City', 'RCP'], SAC: ['Capital Crowns', 'Capital City', 'CPC'],
  SAS: ['Alamo Defenders', 'Alamo City', 'ALD'], TOR: ['Northside Huskies', 'Northside', 'NSH'],
  UTA: ['Wasatch Peaks', 'Wasatch', 'WSP'], WAS: ['District Eagles', 'The District', 'DCE'],
  SEA: ['Emerald Orcas', 'Emerald City', 'EMO'], NJN: ['Garden State Knights', 'Garden State', 'GSK'],
};

const MASK64 = (1n << 64n) - 1n;
const encoder = new TextEncoder();

/** FNV-1a 64-bit with salt, identical to the Swift `stableIndex`. */
export function stableIndex(value, salt, count) {
  let hash = 1469598103934665603n ^ BigInt(salt);
  for (const byte of encoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 1099511628211n) & MASK64;
  }
  return Number(hash % BigInt(count));
}

const fictionalCache = new Map();

export function playerName(player, realNames) {
  if (realNames) return player.name;
  if (player.fictionalName) return player.fictionalName;
  let name = fictionalCache.get(player.id);
  if (!name) {
    name = `${FIRST_NAMES[stableIndex(player.id, 17, FIRST_NAMES.length)]} ${LAST_NAMES[stableIndex(player.id, 83, LAST_NAMES.length)]}`;
    fictionalCache.set(player.id, name);
  }
  return name;
}

export function teamIdentity(team, realNames) {
  if (realNames) return { name: team.name, city: team.city, abbreviation: team.abbreviation };
  const f = FICTIONAL_TEAMS[team.id];
  return f ? { name: f[0], city: f[1], abbreviation: f[2] } : { name: 'Metro Club', city: 'Metro City', abbreviation: 'MTC' };
}
