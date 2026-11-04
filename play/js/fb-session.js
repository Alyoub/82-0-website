/**
 * 17-0 Web — Draft/season state machine, saved seasons and trophies.
 * Everything is persisted so a refresh resumes exactly where the player left off
 * (mid-spin lands on the same franchise and era; mid-season keeps every result).
 */

import * as F from './fb-engine.js';

const DRAFT_KEY = '170.web.draft.v2';
const HISTORY_KEY = '170.web.history.v2';
const MAX_RUNS = 300;

export const FB = {
  idle: 'idle', spin: 'spin', revealed: 'revealed', compare: 'compare',
  complete: 'complete', season: 'season', final: 'final',
};

function readJSON(storage, key, fallback) {
  try { const v = JSON.parse(storage?.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}
function writeJSON(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function freshState() {
  return {
    v: 2, phase: FB.idle, mode: 'classic', runId: null,
    round: 1, picks: [], context: null, shown: [], respins: 1, selectedId: null,
    schedule: [], games: [], revealed: 0, calls: [], pendingCall: null,
    secondChanceUsed: false, runItBackUsed: false, recorded: false,
  };
}

const ctxKey = (c) => (c ? `${c.team}|${c.era}` : '');

export class FootballSession {
  constructor(db, storage = globalThis.localStorage) {
    this.db = db;
    this.storage = storage;
    const saved = readJSON(storage, DRAFT_KEY, null);
    this.s = saved && saved.v === 2 && Object.values(FB).includes(saved.phase) ? { ...freshState(), ...saved } : freshState();
    if (!this.valid()) this.s = freshState();
  }

  /** Guards against saved drafts that reference players no longer in the database. */
  valid() {
    const s = this.s;
    if (s.picks.some((id) => !this.db.byId.has(id))) return false;
    if ([FB.complete, FB.season, FB.final].includes(s.phase) && s.picks.length !== F.ROUNDS.length) return false;
    if ([FB.spin, FB.revealed, FB.compare].includes(s.phase) && !s.context) return false;
    if ([FB.season, FB.final].includes(s.phase) && s.schedule.length !== F.SEASON_GAMES) return false;
    return true;
  }

  persist() { writeJSON(this.storage, DRAFT_KEY, this.s); }

  get phase() { return this.s.phase; }
  get mode() { return F.modeOf(this.s.mode); }
  get rule() { return F.ROUNDS[Math.min(this.s.round, F.ROUNDS.length) - 1]; }
  get roster() { return this.s.picks.map((id) => this.db.byId.get(id)).filter(Boolean); }
  get metrics() { return F.teamMetrics(this.roster); }
  get selected() { return this.s.selectedId ? this.db.byId.get(this.s.selectedId) || null : null; }
  get inDraft() { return [FB.spin, FB.revealed, FB.compare].includes(this.s.phase); }
  get pool() {
    const c = this.s.context;
    if (!c) return [];
    return F.generatePool(this.db.players, this.s.round, { team: c.team, era: c.era, selected: this.roster, mode: this.s.mode });
  }

  projected(player) { return F.teamMetrics([...this.roster, player]); }

  // ----- Draft -------------------------------------------------------------

  startDraft(mode = this.s.mode) {
    this.s = { ...freshState(), mode: F.MODES[mode] ? mode : 'classic', phase: FB.spin, runId: F.uuid() };
    this.s.context = this.drawContext([]);
    this.persist();
  }

  /** Picks the hidden outcome of the next spin. */
  drawContext(avoid) {
    const all = F.eligibleContexts(this.db.players, this.s.round, this.roster, this.s.mode);
    const fresh = all.filter((c) => !avoid.includes(ctxKey(c)));
    const c = F.pick(fresh.length ? fresh : all);
    return c ? { team: c.team, era: c.era } : null;
  }

  openContext() {
    if (this.s.phase !== FB.spin || !this.s.context) return false;
    this.s.shown = [...new Set([...this.s.shown, ctxKey(this.s.context)])];
    this.s.phase = FB.revealed;
    this.persist();
    return true;
  }

  scout() {
    if (this.s.phase !== FB.revealed) return false;
    this.s.phase = FB.compare;
    this.s.selectedId = this.pool[0]?.id || null;
    this.persist();
    return true;
  }

  select(id) {
    if (this.s.phase !== FB.compare || !this.pool.some((p) => p.id === id)) return false;
    this.s.selectedId = id;
    this.persist();
    return true;
  }

  get canRespin() { return this.s.respins > 0 && [FB.revealed, FB.compare].includes(this.s.phase); }

  respin() {
    if (!this.canRespin) return false;
    const next = this.drawContext([...this.s.shown, ctxKey(this.s.context)]);
    if (!next) return false;
    this.s.context = next;
    this.s.respins -= 1;
    this.s.selectedId = null;
    this.s.phase = FB.spin;
    this.persist();
    return true;
  }

  draftSelected() {
    const p = this.selected;
    if (this.s.phase !== FB.compare || !p) return null;
    this.s.picks.push(p.id);
    this.s.selectedId = null;
    this.s.shown = [];
    if (this.s.picks.length >= F.ROUNDS.length) {
      this.s.phase = FB.complete;
      this.s.context = null;
    } else {
      this.s.round += 1;
      this.s.phase = FB.spin;
      this.s.context = this.drawContext([]);
    }
    this.persist();
    return p;
  }

  // ----- Season ------------------------------------------------------------

  kickoff() {
    if (this.s.phase !== FB.complete || this.roster.length !== F.ROUNDS.length) return false;
    const s = this.s;
    s.schedule = F.makeSchedule();
    s.games = [];
    s.calls = [];
    s.revealed = 0;
    s.pendingCall = null;
    s.recorded = false;
    s.phase = FB.season;
    this.simulateStretch(0);
    this.persist();
    return true;
  }

  /** Simulates (or re-simulates) one stretch of the schedule under the call that governs it. */
  simulateStretch(index) {
    const [a, z] = F.STRETCHES[index];
    const call = F.COACHING_CALLS[index - 1];
    const decision = call && this.s.calls.find((c) => c.id === call.id);
    const m = this.metrics;
    const fx = decision ? F.callEffect(decision.option, m) : {};
    const games = this.s.games.filter((g) => g.n < a || g.n > z);
    for (let n = a; n <= z; n++) games.push(F.simulateGame(m, this.s.schedule[n - 1], fx));
    this.s.games = games.sort((x, y) => x.n - y.n);
  }

  get revealedGames() { return this.s.games.slice(0, this.s.revealed); }
  get record() { return F.recordOf(this.revealedGames); }

  /** The call due at this point of the season, if it has not been made yet. */
  get dueCall() {
    if (this.s.phase !== FB.season) return null;
    return F.COACHING_CALLS.find((c) => this.s.revealed >= c.checkpoint && !this.s.calls.some((d) => d.id === c.id)) || null;
  }

  get lockedCall() { return this.s.pendingCall ? F.callById(this.s.pendingCall) : null; }

  applyCall(callId, optionId) {
    const call = F.callById(callId);
    const option = call?.options.find((o) => o.id === optionId);
    if (this.s.phase !== FB.season || !option || this.dueCall?.id !== callId) return false;
    const fx = F.callEffect(optionId, this.metrics);
    this.s.calls.push({ id: callId, option: optionId, title: option.title, summary: fx.summary });
    this.s.pendingCall = callId;
    this.simulateStretch(F.COACHING_CALLS.indexOf(call) + 1);
    this.persist();
    return true;
  }

  secondChance(callId) {
    const s = this.s;
    if (s.phase !== FB.season || s.secondChanceUsed || s.pendingCall !== callId) return false;
    const idx = F.COACHING_CALLS.findIndex((c) => c.id === callId);
    const [a, z] = F.STRETCHES[idx + 1];
    s.calls = s.calls.filter((c) => c.id !== callId);
    s.games = s.games.filter((g) => g.n < a || g.n > z);
    s.pendingCall = null;
    s.secondChanceUsed = true;
    this.persist();
    return true;
  }

  finalizeCall(callId) {
    if (this.s.pendingCall !== callId) return false;
    this.s.pendingCall = null;
    this.persist();
    return true;
  }

  /** Reveals the next game. Returns it, or null when the season is paused or over. */
  revealNext() {
    const s = this.s;
    if (s.phase !== FB.season || s.pendingCall || this.dueCall) return null;
    const game = s.games[s.revealed];
    if (!game) return null;
    s.revealed += 1;
    if (s.revealed >= F.SEASON_GAMES) s.phase = FB.final;
    this.persist();
    return game;
  }

  /** Skips straight to the next coaching call (or the end of the season). */
  revealStretch() {
    const out = [];
    let g;
    while ((g = this.revealNext())) out.push(g);
    return out;
  }

  markRecorded() { this.s.recorded = true; this.persist(); }

  get canRunItBack() { return this.s.phase === FB.final && !this.s.runItBackUsed; }

  runItBack() {
    if (!this.canRunItBack) return false;
    Object.assign(this.s, {
      phase: FB.complete, runId: F.uuid(), schedule: [], games: [], revealed: 0, calls: [], pendingCall: null,
      secondChanceUsed: false, runItBackUsed: true, recorded: false,
    });
    return this.kickoff();
  }

  resetToIdle() {
    const mode = this.s.mode;
    this.s = { ...freshState(), mode };
    this.persist();
  }

  setMode(mode) {
    if (!F.MODES[mode] || this.s.phase !== FB.idle) return false;
    this.s.mode = mode;
    this.persist();
    return true;
  }
}

// ---------------------------------------------------------------------------
// Saved seasons
// ---------------------------------------------------------------------------

const snapshot = (p) => (p ? { id: p.id, person: p.person, name: p.name, pos: p.pos, team: p.team, era: p.era, ovr: p.ovr, arch: p.arch, seasons: p.seasons } : null);
const r1 = (v) => Math.round(v * 10) / 10;

export class FootballHistory {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    const runs = readJSON(storage, HISTORY_KEY, []);
    this.runs = Array.isArray(runs) ? runs.filter((r) => r && typeof r.wins === 'number' && Array.isArray(r.roster)) : [];
  }

  save() {
    while (this.runs.length > MAX_RUNS) {
      const idx = this.runs.map((r, i) => [r, i]).reverse().find(([r]) => !r.perfect)?.[1];
      if (idx == null) break;
      this.runs.splice(idx, 1);
    }
    writeJSON(this.storage, HISTORY_KEY, this.runs);
  }

  record(session) {
    const s = session.s;
    if (s.phase !== FB.final || s.games.length !== F.SEASON_GAMES) return null;
    const existing = this.runs.find((r) => r.id === s.runId);
    if (existing) return existing;
    const m = session.metrics;
    const sum = F.seasonSummary(s.games);
    const roster = session.roster;
    const run = {
      id: s.runId || F.uuid(),
      date: new Date().toISOString(),
      mode: s.mode,
      wins: sum.wins, losses: sum.losses, ties: sum.ties, perfect: sum.perfect,
      teamRating: r1(m.teamRating), passing: r1(m.passing), rushing: r1(m.rushing), defense: r1(m.defense), chemistry: r1(m.chemistry),
      ppg: r1(sum.ppg), oppPpg: r1(sum.oppPpg), diff: sum.diff, longest: sum.longestWinStreak,
      grid: s.games.map((g) => g.result).join(''),
      games: s.games.map(({ n, opp, home, us, them, result }) => ({ n, opp, home, us, them, result })),
      roster: roster.map(snapshot),
      top: snapshot(roster.reduce((b, p) => (!b || p.ovr > b.ovr ? p : b), null)),
      calls: s.calls.map(({ id, title, summary }) => ({ id, title, summary })),
    };
    this.runs.unshift(run);
    this.save();
    return run;
  }

  clear() { this.runs = []; writeJSON(this.storage, HISTORY_KEY, []); }

  get stats() {
    const runs = this.runs;
    const best = runs.reduce((b, r) => (!b || r.wins > b.wins || (r.wins === b.wins && r.ties > b.ties) ? r : b), null);
    const maxBy = (fn, filter = () => true) => runs.filter(filter).reduce((mx, r) => Math.max(mx, fn(r)), 0);
    return {
      total: runs.length,
      perfect: runs.filter((r) => r.perfect).length,
      best,
      bestRecord: best ? F.recordText(best) : '—',
      bestWins: best ? best.wins : 0,
      bestIqWins: maxBy((r) => r.wins, (r) => r.mode === 'iq'),
      bestChallengeWins: maxBy((r) => r.wins, (r) => r.mode === 'challenge'),
      bestPpg: maxBy((r) => r.ppg),
      bestDefense: runs.length ? Math.min(...runs.map((r) => r.oppPpg)) : null,
      maxChemistry: maxBy((r) => r.chemistry),
    };
  }
}

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

export function footballAchievements(history) {
  const st = history.stats;
  const a = (id, title, description, icon, value, target, label) => ({
    id, title, description, icon, unlocked: value >= target, progress: Math.max(0, Math.min(1, value / target)),
    progressLabel: label || `${Math.min(value, target)} / ${target}`,
  });
  const defenseValue = st.bestDefense == null ? 0 : st.bestDefense <= 20 ? 1 : 0;
  return [
    a('kickoff', 'Opening Kickoff', 'Complete your first 17-game season', 'ball', st.total, 1),
    a('winning', 'Winning Record', 'Win 10 or more games in a season', 'shield', st.bestWins, 10),
    a('elite', 'Elite Franchise', 'Win 12 or more games in a season', 'flame', st.bestWins, 12),
    a('legendary', 'Legendary Season', 'Win 15 or more games in a season', 'sparkles', st.bestWins, 15),
    a('perfect', 'The Perfect 17-0', 'Finish a regular season 17-0 with no ties', 'crown', st.perfect, 1),
    a('iq', 'Gridiron Genius', 'Win 12+ games in Gridiron IQ mode, ratings hidden', 'scope', st.bestIqWins, 12),
    a('challenge', 'No Superstars Needed', 'Win 12+ games in Challenge mode', 'star', st.bestChallengeWins, 12),
    a('offense', 'Points Machine', 'Average 30+ points per game over a season', 'bolt', Math.floor(st.bestPpg), 30, st.bestPpg ? `${st.bestPpg.toFixed(1)} / 30 PPG` : '0 / 30 PPG'),
    a('defense', 'Brick Wall', 'Allow 20 or fewer points per game over a season', 'shield', defenseValue, 1, st.bestDefense == null ? 'No seasons yet' : `Best: ${st.bestDefense.toFixed(1)} PPG allowed`),
    a('architect', 'Franchise Architect', 'Complete 10 seasons', 'repeat', st.total, 10),
  ];
}
