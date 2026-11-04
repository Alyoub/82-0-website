/**
 * 17-0 — self-contained American football draft and season game.
 * Uses fictional clubs and players, persists locally, and shares the 0 Studio shell.
 */

const SESSION_KEY = '170.web.session.v1';
const HISTORY_KEY = '170.web.history.v1';

const TEAMS = [
  ['arizona', 'Arizona Scorpions', 'ARI', '#c2415d'],
  ['atlanta', 'Atlanta Flight', 'ATL', '#ef4444'],
  ['baltimore', 'Baltimore Admirals', 'BAL', '#7c3aed'],
  ['boston', 'Boston Rebels', 'BOS', '#2563eb'],
  ['carolina', 'Carolina Cyclones', 'CAR', '#06b6d4'],
  ['chicago', 'Chicago Foundry', 'CHI', '#f97316'],
  ['dallas', 'Dallas Outlaws', 'DAL', '#60a5fa'],
  ['denver', 'Denver Peaks', 'DEN', '#fb923c'],
  ['detroit', 'Detroit Motors', 'DET', '#38bdf8'],
  ['green-bay', 'Green Bay Guardians', 'GB', '#22c55e'],
  ['houston', 'Houston Comets', 'HOU', '#ef4444'],
  ['las-vegas', 'Las Vegas Aces', 'LV', '#a3a3a3'],
  ['los-angeles', 'Los Angeles Waves', 'LA', '#eab308'],
  ['miami', 'Miami Sharks', 'MIA', '#14b8a6'],
  ['new-york', 'New York Empire', 'NY', '#3b82f6'],
  ['philadelphia', 'Philadelphia Liberty', 'PHI', '#10b981'],
  ['san-francisco', 'San Francisco Gold', 'SF', '#dc2626'],
  ['seattle', 'Seattle Storm', 'SEA', '#84cc16'],
].map(([id, name, abbr, color]) => ({ id, name, abbr, color }));

const ERAS = [
  { id: '1970s', label: '1970s', years: '1970–1979', style: 'Power football' },
  { id: '1980s', label: '1980s', years: '1980–1989', style: 'West Coast rise' },
  { id: '1990s', label: '1990s', years: '1990–1999', style: 'Balanced attack' },
  { id: '2000s', label: '2000s', years: '2000–2009', style: 'Defense and detail' },
  { id: '2010s', label: '2010s', years: '2010–2019', style: 'Spread revolution' },
  { id: '2020s', label: '2020s', years: '2020–2029', style: 'Positionless speed' },
];

const ROLES = [
  { id: 'QB', name: 'Quarterback', short: 'QB', side: 'OFF', color: '#34d399', archetypes: ['Field General', 'Dual Threat', 'Deep Ball Artist'] },
  { id: 'RB', name: 'Running Back', short: 'RB', side: 'OFF', color: '#f59e0b', archetypes: ['Workhorse', 'Home Run Back', 'Receiving Back'] },
  { id: 'WR', name: 'Wide Receiver', short: 'WR', side: 'OFF', color: '#38bdf8', archetypes: ['Route Technician', 'Vertical Threat', 'Contested Catcher'] },
  { id: 'TE', name: 'Tight End', short: 'TE', side: 'OFF', color: '#a78bfa', archetypes: ['Matchup Weapon', 'Complete Tight End', 'Red Zone Target'] },
  { id: 'EDGE', name: 'Edge Rusher', short: 'EDGE', side: 'DEF', color: '#f87171', archetypes: ['Speed Rusher', 'Power End', 'Run Eraser'] },
  { id: 'DB', name: 'Defensive Back', short: 'DB', side: 'DEF', color: '#22d3ee', archetypes: ['Shutdown Corner', 'Ball Hawk', 'Enforcer Safety'] },
];

const FIRST_NAMES = ['Ace', 'Andre', 'Bryce', 'Caleb', 'Cameron', 'Darius', 'Devin', 'Eli', 'Isaiah', 'Jalen', 'Jordan', 'Kai', 'Malik', 'Marcus', 'Mason', 'Micah', 'Noah', 'Quentin', 'Roman', 'Trey', 'Tyson', 'Xavier', 'Zion'];
const LAST_NAMES = ['Banks', 'Bennett', 'Brooks', 'Carter', 'Coleman', 'Cross', 'Daniels', 'Ellis', 'Fields', 'Grant', 'Hayes', 'Holloway', 'Jefferson', 'Knox', 'Lawson', 'Marshall', 'Monroe', 'Pierce', 'Reed', 'Rivers', 'Stone', 'Walker', 'Ward', 'Williams'];

const CALLS = {
  5: {
    title: 'Identity Check',
    prompt: 'Five games in, the league has your tendencies on film. Choose the identity for the next stretch.',
    options: [
      { id: 'air-raid', title: 'Open the Playbook', detail: 'Attack vertically and trust the quarterback.', off: 3, def: 0, morale: 1 },
      { id: 'ground', title: 'Own the Trenches', detail: 'Control possession and keep the defense fresh.', off: 2, def: 1, morale: 1 },
      { id: 'pressure', title: 'Send Pressure', detail: 'Create negative plays and shorten the field.', off: 0, def: 3, morale: 1 },
    ],
  },
  9: {
    title: 'Midseason Test',
    prompt: 'Injuries and fatigue are rising. Decide how your staff protects the season.',
    options: [
      { id: 'tempo', title: 'Push the Tempo', detail: 'More possessions, more explosive chances.', off: 3, def: -1, morale: 2 },
      { id: 'protect', title: 'Protect the QB', detail: 'Lean on timing, protection and efficient drives.', off: 2, def: 1, morale: 1 },
      { id: 'takeaways', title: 'Hunt Takeaways', detail: 'Turn coverage aggression into short fields.', off: 1, def: 3, morale: 0 },
    ],
  },
  13: {
    title: 'The Final Push',
    prompt: 'Four games remain. Set the tone for the run at perfection.',
    options: [
      { id: 'stars', title: 'Put It on the Stars', detail: 'Feature your highest-rated players every snap.', off: 3, def: 1, morale: 2 },
      { id: 'fresh', title: 'Fresh Legs', detail: 'Rotate aggressively and win the fourth quarter.', off: 1, def: 2, morale: 3 },
      { id: 'no-fly', title: 'No-Fly Zone', detail: 'Protect every lead with disciplined coverage.', off: 0, def: 4, morale: 1 },
    ],
  },
};

const SCORE_VALUES = [0, 3, 6, 7, 9, 10, 12, 13, 14, 16, 17, 19, 20, 21, 23, 24, 26, 27, 28, 30, 31, 33, 34, 35, 37, 38, 40, 41, 42, 44, 45, 47, 48, 49, 51, 52, 54, 55, 56, 58, 59, 60];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const read = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const write = (storage, key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } };
const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function freshState() {
  return {
    phase: 'idle',
    round: 0,
    roster: {},
    offer: null,
    recentTeam: null,
    games: [],
    decisions: [],
    modifiers: { off: 0, def: 0, morale: 0 },
    pendingCall: null,
    runId: null,
    recorded: false,
  };
}

function nearestScore(raw) {
  const value = clamp(Math.round(raw), 0, 60);
  return SCORE_VALUES.reduce((best, n) => Math.abs(n - value) < Math.abs(best - value) ? n : best, 0);
}

function nextWinningScore(score, bump = 3) {
  return SCORE_VALUES.find((n) => n >= score + bump) ?? score + 7;
}

function playerName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function createCandidate(role, team, era, index) {
  const eraBoost = ERAS.findIndex((e) => e.id === era.id) * 0.55;
  const overall = clamp(Math.round(76 + Math.random() * 20 + eraBoost), 75, 98);
  const offenseRole = role.side === 'OFF';
  const speed = clamp(Math.round(overall + (Math.random() * 12 - 6) + (['WR', 'DB', 'RB'].includes(role.id) ? 3 : -1)), 68, 99);
  const power = clamp(Math.round(overall + (Math.random() * 12 - 6) + (['TE', 'EDGE', 'RB'].includes(role.id) ? 3 : -1)), 68, 99);
  const iq = clamp(Math.round(overall + (Math.random() * 10 - 5) + (role.id === 'QB' ? 3 : 0)), 70, 99);
  const attack = clamp(Math.round(overall + (offenseRole ? 2 : -9) + (Math.random() * 8 - 4)), 64, 99);
  const defense = clamp(Math.round(overall + (offenseRole ? -10 : 3) + (Math.random() * 8 - 4)), 62, 99);
  return {
    id: `${team.id}-${era.id}-${role.id}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    name: playerName(),
    role: role.id,
    overall,
    speed,
    power,
    iq,
    attack,
    defense,
    archetype: role.archetypes[index % role.archetypes.length],
    team: { id: team.id, name: team.name, abbr: team.abbr, color: team.color },
    era: era.label,
  };
}

function metrics(roster) {
  const players = Object.values(roster);
  if (!players.length) return { overall: 0, offense: 0, defense: 0, chemistry: 0, speed: 0, iq: 0, power: 0 };
  const avg = (items, key) => Math.round(items.reduce((sum, p) => sum + p[key], 0) / Math.max(1, items.length));
  const offensePlayers = players.filter((p) => ROLES.find((r) => r.id === p.role)?.side === 'OFF');
  const defensePlayers = players.filter((p) => ROLES.find((r) => r.id === p.role)?.side === 'DEF');
  const uniqueTeams = new Set(players.map((p) => p.team.id)).size;
  const eraCounts = players.reduce((map, p) => map.set(p.era, (map.get(p.era) || 0) + 1), new Map());
  const eraCore = Math.max(...eraCounts.values());
  const chemistry = clamp(48 + players.length * 4 + uniqueTeams * 2 + eraCore * 3, 0, 99);
  const overall = avg(players, 'overall');
  const offense = offensePlayers.length ? Math.round(avg(offensePlayers, 'attack') * 0.75 + avg(offensePlayers, 'iq') * 0.25) : 0;
  const defense = defensePlayers.length ? Math.round(avg(defensePlayers, 'defense') * 0.72 + avg(defensePlayers, 'speed') * 0.28) : 0;
  const speed = avg(players, 'speed');
  const iq = avg(players, 'iq');
  const power = Math.round((overall * 0.58 + offense * 0.16 + defense * 0.14 + chemistry * 0.08 + iq * 0.04) * 10) / 10;
  return { overall, offense, defense, chemistry, speed, iq, power };
}

function roleById(id) { return ROLES.find((role) => role.id === id); }

function recordOf(games) {
  const wins = games.filter((g) => g.won).length;
  return { wins, losses: games.length - wins };
}

export class FootballGame {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.state = { ...freshState(), ...read(storage, SESSION_KEY, {}) };
    this.state.roster ||= {};
    this.state.games ||= [];
    this.state.decisions ||= [];
    this.state.modifiers ||= { off: 0, def: 0, morale: 0 };
    this.history = read(storage, HISTORY_KEY, []);
    if (!Array.isArray(this.history)) this.history = [];
  }

  save() { write(this.storage, SESSION_KEY, this.state); }
  saveHistory() { write(this.storage, HISTORY_KEY, this.history); }

  resolveRoute(route) {
    const phase = this.state.phase;
    if (route === 'draft') {
      if (['season', 'completed'].includes(phase)) return 'season';
      if (phase === 'idle') return 'home';
    }
    if (route === 'season' && !['season', 'completed'].includes(phase)) return phase === 'idle' ? 'home' : 'draft';
    return route;
  }

  isFlowRoute(route) { return route === 'draft' || route === 'season'; }

  title(route) {
    return ({ home: 'Play 17-0 · Football Draft Challenge', draft: 'War Room · 17-0', season: '17-Game Season · 17-0', history: 'Franchise History · 17-0', trophies: 'Football Challenges · 17-0', settings: 'Settings · 17-0' })[route] || '17-0';
  }

  startDraft() {
    this.state = { ...freshState(), phase: 'draft', round: 0, runId: uid() };
    this.save();
  }

  spin() {
    if (this.state.phase !== 'draft' || this.state.round >= ROLES.length) return;
    const role = ROLES[this.state.round];
    let team = pick(TEAMS);
    if (TEAMS.length > 1 && team.id === this.state.recentTeam) team = TEAMS[(TEAMS.indexOf(team) + 1) % TEAMS.length];
    const era = pick(ERAS);
    this.state.offer = { role: role.id, team, era, candidates: [0, 1, 2].map((i) => createCandidate(role, team, era, i)) };
    this.state.recentTeam = team.id;
    this.save();
  }

  draft(index) {
    const offer = this.state.offer;
    const candidate = offer?.candidates?.[index];
    if (!candidate || this.state.phase !== 'draft') return;
    this.state.roster[offer.role] = candidate;
    this.state.round += 1;
    this.state.offer = null;
    if (this.state.round >= ROLES.length) this.state.phase = 'lineup';
    this.save();
  }

  startSeason() {
    if (Object.keys(this.state.roster).length !== ROLES.length) return false;
    this.state.phase = 'season';
    this.state.games = [];
    this.state.decisions = [];
    this.state.modifiers = { off: 0, def: 0, morale: 0 };
    this.state.pendingCall = null;
    this.state.recorded = false;
    this.save();
    return true;
  }

  simulateOne() {
    if (this.state.phase !== 'season' || this.state.pendingCall || this.state.games.length >= 17) return null;
    const m = metrics(this.state.roster);
    const modifiers = this.state.modifiers;
    const opponent = pick(TEAMS);
    const opponentRating = Math.round(75 + Math.random() * 19);
    const effectivePower = m.power + modifiers.off * 0.55 + modifiers.def * 0.5 + modifiers.morale * 0.3;
    const probability = clamp(0.5 + (effectivePower - opponentRating) * 0.026, 0.12, 0.94);
    const won = Math.random() < probability;
    let us = nearestScore(20 + (m.offense - 80) * 0.55 + modifiers.off * 0.9 + modifiers.morale * 0.35 + (Math.random() * 13 - 6));
    let them = nearestScore(20 + (opponentRating - 80) * 0.48 - modifiers.def * 0.85 + (Math.random() * 13 - 6));
    if (won && us <= them) us = nextWinningScore(them, Math.random() < 0.45 ? 3 : 7);
    if (!won && them <= us) them = nextWinningScore(us, Math.random() < 0.45 ? 3 : 7);
    const game = { n: this.state.games.length + 1, opponent: opponent.name, abbr: opponent.abbr, color: opponent.color, us, them, won, probability: Math.round(probability * 100) };
    this.state.games.push(game);
    if (CALLS[this.state.games.length] && !this.state.decisions.some((d) => d.checkpoint === this.state.games.length)) this.state.pendingCall = this.state.games.length;
    if (this.state.games.length === 17) {
      this.state.phase = 'completed';
      this.recordRun();
    }
    this.save();
    return game;
  }

  simulateStretch() {
    let last = null;
    while (this.state.phase === 'season' && !this.state.pendingCall && this.state.games.length < 17) last = this.simulateOne();
    return last;
  }

  applyCall(optionId) {
    const checkpoint = this.state.pendingCall;
    const call = CALLS[checkpoint];
    const option = call?.options.find((item) => item.id === optionId);
    if (!option) return null;
    this.state.modifiers.off += option.off;
    this.state.modifiers.def += option.def;
    this.state.modifiers.morale += option.morale;
    this.state.decisions.push({ checkpoint, title: option.title, detail: option.detail });
    this.state.pendingCall = null;
    this.save();
    return option;
  }

  recordRun() {
    if (this.state.recorded) return;
    const rec = recordOf(this.state.games);
    const m = metrics(this.state.roster);
    const top = Object.values(this.state.roster).sort((a, b) => b.overall - a.overall)[0];
    this.history.unshift({ id: this.state.runId || uid(), date: new Date().toISOString(), ...rec, overall: m.overall, chemistry: m.chemistry, offense: m.offense, defense: m.defense, topPlayer: top?.name || 'Your franchise', perfect: rec.wins === 17, games: this.state.games.map((g) => ({ ...g })) });
    this.history = this.history.slice(0, 100);
    this.state.recorded = true;
    this.saveHistory();
  }

  resetCurrent() { this.state = freshState(); this.save(); }
  clearHistory() { this.history = []; this.saveHistory(); }

  stats() {
    const best = this.history.reduce((winner, run) => !winner || run.wins > winner.wins ? run : winner, null);
    return { total: this.history.length, perfect: this.history.filter((run) => run.perfect).length, best: best ? `${best.wins}-${best.losses}` : '—', bestWins: best?.wins || 0 };
  }

  render(route) {
    return ({ home: () => this.viewHome(), draft: () => this.viewDraft(), season: () => this.viewSeason(), history: () => this.viewHistory(), trophies: () => this.viewTrophies(), settings: () => this.viewSettings() })[route]?.() || this.viewHome();
  }

  viewHome() {
    const stats = this.stats();
    const phase = this.state.phase;
    let cta = '<button class="btn fb-btn-primary btn-xl btn-block" data-act="fb-start">START YOUR FRANCHISE <span>→</span></button>';
    if (['draft', 'lineup'].includes(phase)) cta = '<button class="btn fb-btn-primary btn-xl btn-block" data-act="fb-resume-draft">RESUME WAR ROOM <span>→</span></button>';
    if (phase === 'season') cta = '<button class="btn fb-btn-primary btn-xl btn-block" data-act="fb-resume-season">RESUME SEASON <span>→</span></button>';
    if (phase === 'completed') cta = '<button class="btn fb-btn-primary btn-xl btn-block" data-act="fb-new">START A NEW RUN <span>→</span></button><button class="btn btn-secondary btn-block" data-act="fb-resume-season">VIEW FINAL SEASON</button>';
    return `
      <section class="fb-home" aria-labelledby="fb-home-title">
        <div class="fb-field-hero">
          <div class="fb-yard-lines" aria-hidden="true"></div>
          <span class="fb-live-chip">FOOTBALL DRAFT CHALLENGE</span>
          <h1 id="fb-home-title">17<span>-</span>0</h1>
          <p>Build six franchise pillars. Coach every turning point. Finish perfect.</p>
          <div class="fb-ball" aria-hidden="true"><i></i></div>
          <div class="fb-home-cta">${cta}</div>
        </div>
        <div class="fb-stat-row">
          <div><b>${stats.best}</b><span>BEST RECORD</span></div>
          <div><b>${stats.perfect}</b><span>PERFECT SEASONS</span></div>
          <div><b>${stats.total}</b><span>TOTAL RUNS</span></div>
        </div>
        <div class="fb-home-grid">
          <section class="card"><div class="card-head"><h2 class="card-title">The road to 17-0</h2><span class="chip fb-chip">6 picks · 17 games</span></div>
            <div class="fb-loop"><div><i>1</i><b>SPIN</b><span>Team + era</span></div><div><i>2</i><b>DRAFT</b><span>Six pillars</span></div><div><i>3</i><b>COACH</b><span>Three calls</span></div><div><i>4</i><b>WIN</b><span>Go unbeaten</span></div></div>
          </section>
          <section class="card"><div class="card-head"><h2 class="card-title">Football formula</h2><span class="chip">TEAM BUILDING</span></div>
            <div class="fb-formula"><span><b>OFF</b>QB · RB · WR · TE</span><span><b>DEF</b>EDGE · DB</span><span><b>CHEM</b>Era fit + balance</span></div>
          </section>
        </div>
      </section>`;
  }

  rosterStrip() {
    return `<div class="fb-roster-strip">${ROLES.map((role, index) => {
      const player = this.state.roster[role.id];
      const current = this.state.phase === 'draft' && index === this.state.round;
      return `<div class="fb-slot${current ? ' current' : ''}${player ? ' filled' : ''}" style="--role:${role.color}">${player ? `<span>${esc(initials(player.name))}</span><b>${role.short}</b><small>${player.overall}</small>` : `<span>+</span><b>${role.short}</b><small>${current ? 'NOW' : 'OPEN'}</small>`}</div>`;
    }).join('')}</div>`;
  }

  drawMachine(offer) {
    const role = ROLES[this.state.round] || ROLES.at(-1);
    const team = offer?.team;
    const era = offer?.era;
    return `<div class="fb-machine">
      <div class="fb-reel team" style="--club:${team?.color || '#34d399'}"><small>FRANCHISE</small><div class="fb-reel-window">${team ? `<span class="fb-club-badge">${team.abbr}</span><b>${esc(team.name)}</b>` : '<b class="question">?</b>'}</div></div>
      <div class="fb-reel era"><small>ERA</small><div class="fb-reel-window">${era ? `<b>${era.label}</b><span>${era.style}</span>` : '<b class="question">?</b>'}</div></div>
      <div class="fb-machine-role"><span>NEXT NEED</span><b>${role.name}</b></div>
    </div>`;
  }

  viewDraft() {
    if (this.state.phase === 'lineup') return this.viewLineup();
    const role = ROLES[this.state.round] || ROLES.at(-1);
    const offer = this.state.offer;
    return `<section class="fb-draft" aria-labelledby="fb-draft-title">
      <div class="fb-flow-head"><button class="icon-btn" data-act="fb-home" aria-label="Leave football draft">×</button><div><span>PICK ${this.state.round + 1} OF 6</span><h1 id="fb-draft-title">${role.name}</h1></div><div class="fb-pick-progress"><i style="--v:${(this.state.round / 6) * 100}%"></i></div></div>
      ${this.rosterStrip()}
      <div class="fb-draft-layout">
        <div class="fb-draft-main">
          <div class="fb-phase-copy"><span>SCOUTING DRAW</span><h2>${offer ? `${esc(offer.team.name)} · ${offer.era.label}` : `Spin for your ${role.name.toLowerCase()}`}</h2><p>${offer ? `Three ${role.short} prospects match this franchise and era.` : 'A random franchise and football era will define your player pool.'}</p></div>
          ${this.drawMachine(offer)}
          ${offer ? this.candidateGrid(offer) : '<button class="btn fb-btn-primary fb-spin-btn" data-act="fb-spin">SPIN TEAM + ERA</button>'}
        </div>
        <aside class="fb-draft-summary">${this.metricsCard()}</aside>
      </div>
    </section>`;
  }

  candidateGrid(offer) {
    return `<div class="fb-candidate-area"><div class="fb-candidate-head"><b>Choose your ${esc(roleById(offer.role).name)}</b><button data-act="fb-spin">Spin again</button></div><div class="fb-candidates">${offer.candidates.map((player, index) => `
      <button class="fb-player-card" data-act="fb-pick" data-index="${index}" style="--club:${offer.team.color}">
        <div class="fb-player-top"><span class="fb-player-avatar">${initials(player.name)}</span><span class="fb-rating"><b>${player.overall}</b><small>OVR</small></span></div>
        <h3>${esc(player.name)}</h3><p>${player.archetype}</p>
        <div class="fb-player-meta"><span>${offer.team.abbr}</span><span>${offer.era.label}</span><span>${offer.role}</span></div>
        <div class="fb-player-bars"><span>SPD <i style="--v:${player.speed}%"></i><b>${player.speed}</b></span><span>PWR <i style="--v:${player.power}%"></i><b>${player.power}</b></span><span>IQ <i style="--v:${player.iq}%"></i><b>${player.iq}</b></span></div>
        <strong>DRAFT PLAYER</strong>
      </button>`).join('')}</div></div>`;
  }

  metricsCard() {
    const m = metrics(this.state.roster);
    if (!Object.keys(this.state.roster).length) return '<div class="card fb-metrics-card"><span class="fb-empty-rating">—</span><h3>Team identity</h3><p>Draft your first player to unlock offense, defense and chemistry.</p></div>';
    return `<div class="card fb-metrics-card"><div class="fb-metric-main"><span><b>${m.overall}</b><small>TEAM OVR</small></span><div><small>CHEMISTRY</small><b>${m.chemistry}%</b><i style="--v:${m.chemistry}%"></i></div></div><div class="fb-metric-grid"><span><b>${m.offense}</b>OFFENSE</span><span><b>${m.defense || '—'}</b>DEFENSE</span><span><b>${m.speed}</b>SPEED</span><span><b>${m.iq}</b>IQ</span></div></div>`;
  }

  viewLineup() {
    const m = metrics(this.state.roster);
    return `<section class="fb-lineup"><div class="fb-lineup-hero"><span>ROSTER COMPLETE</span><h1>Your franchise pillars are set.</h1><p>${m.overall} overall · ${m.chemistry}% chemistry · ${m.power.toFixed(1)} team power</p></div>
      <div class="fb-lineup-grid"><div class="fb-roster-cards">${ROLES.map((role) => {
        const p = this.state.roster[role.id];
        return `<article style="--role:${role.color}"><span>${initials(p.name)}</span><div><small>${role.name}</small><b>${esc(p.name)}</b><p>${p.team.abbr} · ${p.era} · ${p.archetype}</p></div><strong>${p.overall}</strong></article>`;
      }).join('')}</div><div>${this.metricsCard()}<button class="btn fb-btn-primary btn-xl btn-block fb-kickoff" data-act="fb-start-season">START 17-GAME SEASON</button></div></div>
    </section>`;
  }

  viewSeason() {
    const rec = recordOf(this.state.games);
    const m = metrics(this.state.roster);
    const last = this.state.games.at(-1);
    if (this.state.pendingCall) return this.viewCoachingCall(rec, m);
    return `<section class="fb-season"><div class="fb-season-head"><div><span>17-0 REGULAR SEASON</span><h1>${this.state.phase === 'completed' ? 'Final Record' : `Game ${Math.min(17, this.state.games.length + 1)} of 17`}</h1></div><div class="fb-record"><b>${rec.wins}</b><i>-</i><b>${rec.losses}</b></div></div>
      <div class="fb-season-grid"><div>
        ${last ? `<div class="fb-scoreboard"><div><span>17-0</span><b>${last.us}</b></div><i>${last.won ? 'W' : 'L'}</i><div><span>${last.abbr}</span><b>${last.them}</b></div><small>GAME ${last.n} · ${last.probability}% PRE-GAME WIN CHANCE</small></div>` : '<div class="fb-scoreboard empty-board"><b>OPENING KICKOFF</b><small>Your pursuit of 17-0 starts now.</small></div>'}
        <div class="fb-schedule">${Array.from({ length: 17 }, (_, i) => { const game = this.state.games[i]; return `<span class="${game ? (game.won ? 'win' : 'loss') : ''}"><small>${i + 1}</small><b>${game ? (game.won ? 'W' : 'L') : '—'}</b>${game ? `<i>${game.us}-${game.them}</i>` : '<i>UP</i>'}</span>`; }).join('')}</div>
        ${this.state.phase === 'completed' ? this.finalPanel(rec, m) : `<div class="fb-season-actions"><button class="btn fb-btn-primary" data-act="fb-next-game">PLAY NEXT GAME</button><button class="btn btn-secondary" data-act="fb-sim-stretch">SIM TO NEXT COACHING CALL</button></div>`}
      </div><aside>${this.metricsCard()}<div class="card fb-calls-summary"><div class="card-head"><h2 class="card-title">Coaching calls</h2><span class="chip fb-chip">${this.state.decisions.length}/3</span></div>${this.state.decisions.length ? this.state.decisions.map((d) => `<div><b>G${d.checkpoint} · ${esc(d.title)}</b><span>${esc(d.detail)}</span></div>`).join('') : '<p>Your first challenge arrives after Game 5.</p>'}</div></aside></div>
    </section>`;
  }

  viewCoachingCall(rec, m) {
    const checkpoint = this.state.pendingCall;
    const call = CALLS[checkpoint];
    return `<section class="fb-coach"><div class="fb-coach-score"><span>AFTER GAME ${checkpoint}</span><b>${rec.wins}-${rec.losses}</b><small>${m.overall} OVR · ${m.chemistry}% CHEMISTRY</small></div><div class="fb-coach-panel"><span class="fb-live-chip">COACHING CHALLENGE</span><h1>${call.title}</h1><p>${call.prompt}</p><div class="fb-call-options">${call.options.map((option) => `<button data-act="fb-call" data-option="${option.id}"><i>${option.off > option.def ? 'OFF' : option.def > option.off ? 'DEF' : 'BAL'}</i><b>${option.title}</b><span>${option.detail}</span><small>OFF ${option.off >= 0 ? '+' : ''}${option.off} · DEF ${option.def >= 0 ? '+' : ''}${option.def} · MORALE +${option.morale}</small></button>`).join('')}</div></div></section>`;
  }

  finalPanel(rec, m) {
    const perfect = rec.wins === 17;
    const label = perfect ? 'IMMORTAL' : rec.wins >= 14 ? 'CHAMPIONSHIP LEVEL' : rec.wins >= 11 ? 'PLAYOFF TEAM' : rec.wins >= 9 ? 'WINNING SEASON' : 'REBUILD';
    return `<div class="fb-final ${perfect ? 'perfect' : ''}"><span>${perfect ? 'PERFECT SEASON' : 'SEASON COMPLETE'}</span><h2>${rec.wins}-${rec.losses}</h2><b>${label}</b><p>${perfect ? 'Seventeen games. Seventeen wins. Football perfection.' : `Your ${m.overall}-overall roster finished with ${rec.wins} wins.`}</p><div><button class="btn fb-btn-primary" data-act="fb-new">NEW FRANCHISE</button><button class="btn btn-secondary" data-act="nav" data-to="history">VIEW HISTORY</button></div></div>`;
  }

  viewHistory() {
    return `<section class="fb-page"><div class="page-head"><div><span class="kicker fb-kicker">Franchise archive</span><h1>17-0 History</h1><p>Every completed football season saved on this device.</p></div></div>${this.history.length ? `<div class="fb-history">${this.history.map((run) => `<article><div class="fb-history-record"><b>${run.wins}-${run.losses}</b><span>${run.perfect ? 'PERFECT' : run.wins >= 11 ? 'PLAYOFF LEVEL' : 'SEASON'}</span></div><div><h2>${esc(run.topPlayer)} &amp; company</h2><p>${new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${run.overall} OVR · ${run.chemistry}% CHEM</p></div><div class="fb-mini-season">${run.games.map((g) => `<i class="${g.won ? 'w' : 'l'}"></i>`).join('')}</div></article>`).join('')}</div>` : '<div class="card empty"><b>No football seasons yet</b>Complete your first 17-game run to build franchise history.</div>'}</section>`;
  }

  achievements() {
    const stats = this.stats();
    const bestRun = this.history.reduce((best, run) => !best || run.wins > best.wins ? run : best, null);
    return [
      ['kickoff', 'Opening Kickoff', 'Complete your first season', stats.total, 1],
      ['winning', 'Winning Culture', 'Win 9 games in one season', stats.bestWins, 9],
      ['playoffs', 'Playoff Bound', 'Win 11 games in one season', stats.bestWins, 11],
      ['elite', 'League Elite', 'Win 14 games in one season', stats.bestWins, 14],
      ['perfect', '17-0', 'Complete a perfect season', stats.perfect, 1],
      ['offense', 'Scoreboard Pressure', 'Build a 90-rated offense', bestRun?.offense || 0, 90],
      ['defense', 'No-Fly Zone', 'Build a 90-rated defense', bestRun?.defense || 0, 90],
      ['dynasty', 'Dynasty Builder', 'Complete five seasons', stats.total, 5],
    ];
  }

  viewTrophies() {
    const list = this.achievements();
    const unlocked = list.filter((a) => a[3] >= a[4]).length;
    return `<section class="fb-page"><div class="page-head"><div><span class="kicker fb-kicker">Football challenges</span><h1>Trophy Room</h1><p>Build great rosters, win games and chase the perfect season.</p></div></div><div class="fb-trophy-summary"><b>${unlocked}/${list.length}</b><span>challenges complete</span><i><em style="--v:${(unlocked / list.length) * 100}%"></em></i></div><div class="fb-trophies">${list.map(([id, title, desc, value, target]) => { const on = value >= target; return `<article class="${on ? 'on' : ''}"><span>${on ? '✓' : id === 'perfect' ? '17' : '0'}</span><div><h2>${title}</h2><p>${desc}</p><i><em style="--v:${Math.min(100, value / target * 100)}%"></em></i><small>${Math.min(value, target)} / ${target}</small></div></article>`; }).join('')}</div></section>`;
  }

  viewSettings() {
    const active = this.state.phase !== 'idle';
    return `<section class="fb-page"><div class="page-head"><div><span class="kicker fb-kicker">17-0 preferences</span><h1>Football Settings</h1><p>Your franchise data stays in this browser.</p></div></div><div class="settings"><section class="set-group"><h2>GAME DATA</h2><div class="set-row"><div><b>Current franchise</b><span>${active ? `${this.state.phase} · ${Object.keys(this.state.roster).length}/6 players · ${this.state.games.length}/17 games` : 'No run in progress'}</span></div>${active ? '<button class="btn btn-secondary danger" data-act="fb-reset">Reset</button>' : ''}</div><div class="set-row"><div><b>Season history</b><span>${this.history.length} completed season${this.history.length === 1 ? '' : 's'}</span></div><button class="btn btn-secondary danger" data-act="fb-clear-history" ${this.history.length ? '' : 'disabled'}>Delete</button></div></section><section class="set-group"><h2>ABOUT 17-0</h2><div class="set-row"><div><b>Fictional football universe</b><span>All clubs and athletes in 17-0 are original game identities.</span></div></div><div class="set-row"><div><b>Season format</b><span>Six-player core draft · 17 games · three coaching calls</span></div></div></section></div></section>`;
  }

  async handleAction(name, el) {
    switch (name) {
      case 'fb-start': this.startDraft(); return { route: 'draft' };
      case 'fb-resume-draft': return { route: 'draft' };
      case 'fb-resume-season': return { route: 'season' };
      case 'fb-home': return { route: 'home' };
      case 'fb-spin': this.spin(); return { render: true };
      case 'fb-pick': this.draft(Number(el.dataset.index)); return { render: true, message: 'Player added to your franchise' };
      case 'fb-start-season': return this.startSeason() ? { route: 'season', message: 'Opening kickoff' } : { render: true };
      case 'fb-next-game': {
        const game = this.simulateOne();
        return { render: true, message: game ? `${game.won ? 'Win' : 'Loss'} · ${game.us}-${game.them}` : '' };
      }
      case 'fb-sim-stretch': this.simulateStretch(); return { render: true };
      case 'fb-call': {
        const option = this.applyCall(el.dataset.option);
        return { render: true, message: option ? `${option.title} locked in` : '' };
      }
      case 'fb-new': this.startDraft(); return { route: 'draft' };
      case 'fb-reset':
        if (globalThis.confirm?.('Reset the current 17-0 franchise?')) { this.resetCurrent(); return { route: 'home', message: 'Football run reset' }; }
        return { render: false };
      case 'fb-clear-history':
        if (globalThis.confirm?.('Delete all saved 17-0 seasons?')) { this.clearHistory(); return { render: true, message: 'Football history deleted' }; }
        return { render: false };
      default: return null;
    }
  }
}
