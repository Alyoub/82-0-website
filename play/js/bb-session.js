/**
 * 162-0 Web — Draft/season state machine, saved seasons and milestones.
 * Persisted after every step: a refresh mid-spin lands on the same club and era, and a
 * refresh mid-season keeps every result (the rest of the league replays from its seed).
 */

import * as B from './bb-engine.js';

const DRAFT_KEY = '1620.web.draft.v1';
const HISTORY_KEY = '1620.web.history.v1';
const MAX_RUNS = 200;

export const BB = {
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
    v: 1, phase: BB.idle, runId: null,
    roster: {}, eff: {}, context: null, usedTeams: [], shown: [], respins: 1, selectedId: null, slot: null,
    seed: null, games: [], revealed: 0, calls: [], pendingCall: null,
    secondChanceUsed: false, runItBackUsed: false, recorded: false,
  };
}

export class BaseballSession {
  constructor(db, storage = globalThis.localStorage) {
    this.db = db;
    this.storage = storage;
    const saved = readJSON(storage, DRAFT_KEY, null);
    this.s = saved && saved.v === 1 && Object.values(BB).includes(saved.phase) ? { ...freshState(), ...saved } : freshState();
    if (!this.valid()) this.s = freshState();
    this.league = null;
    this.others = null;
    this.schedule = null;
    if (this.s.seed != null) this.loadLeague();
  }

  valid() {
    const s = this.s;
    const ids = Object.values(s.roster);
    if (ids.some((id) => !this.db.byId.has(id))) return false;
    if ([BB.complete, BB.season, BB.final].includes(s.phase) && ids.length !== 9) return false;
    if ([BB.spin, BB.revealed, BB.compare].includes(s.phase) && !s.context) return false;
    if ([BB.season, BB.final].includes(s.phase) && s.seed == null) return false;
    return true;
  }

  persist() { writeJSON(this.storage, DRAFT_KEY, this.s); }

  loadLeague() {
    this.league = B.makeLeague(this.s.seed);
    this.others = B.leagueResults(this.league);
    this.schedule = B.userSchedule(this.league, this.db.teams);
  }

  get phase() { return this.s.phase; }
  get round() { return Object.keys(this.s.roster).length + 1; }
  get occupied() { return Object.keys(this.s.roster); }
  get drafted() { return Object.values(this.s.roster); }
  get roster() {
    const out = {};
    for (const [slot, id] of Object.entries(this.s.roster)) out[slot] = this.db.byId.get(id);
    return out;
  }
  get metrics() { return B.teamMetrics(this.roster, this.s.eff); }
  get previewMetrics() { return B.teamMetrics(this.roster, this.s.eff, { fill: true }); }
  get inDraft() { return [BB.spin, BB.revealed, BB.compare].includes(this.s.phase); }
  get selected() { return this.s.selectedId ? this.db.byId.get(this.s.selectedId) || null : null; }
  get pool() {
    const c = this.s.context;
    return c ? B.poolFor(this.db, c.team, c.era, { drafted: this.drafted, occupied: this.occupied }) : [];
  }

  slotsFor(player) { return B.availableSlots(player, this.occupied); }

  /** Projection if `player` were placed at `slot`. */
  projected(player, slot) {
    const roster = { ...this.roster, [slot]: player };
    const eff = { ...this.s.eff, [slot]: B.effectiveness(player, slot) };
    const filled = Object.keys(roster).length;
    return { metrics: B.teamMetrics(roster, eff), preview: filled < 9 ? B.teamMetrics(roster, eff, { fill: true }) : null };
  }

  // ----- Draft -------------------------------------------------------------

  startDraft() {
    this.s = { ...freshState(), phase: BB.spin, runId: B.uuid() };
    this.s.context = B.drawContext(this.db, {});
    this.league = null;
    this.persist();
  }

  openContext() {
    if (this.s.phase !== BB.spin || !this.s.context) return false;
    const team = this.s.context.team;
    if (!this.s.usedTeams.includes(team)) this.s.usedTeams.push(team);
    this.s.shown.push(team);
    this.s.phase = BB.revealed;
    this.persist();
    return true;
  }

  scout() {
    if (this.s.phase !== BB.revealed) return false;
    this.s.phase = BB.compare;
    const best = this.bestPick();
    this.s.selectedId = best?.player.id || null;
    this.s.slot = best?.slot || null;
    this.persist();
    return true;
  }

  /** Highest rating after the fit penalty — the default highlighted pick. */
  bestPick() {
    let best = null;
    for (const p of this.pool) {
      const top = this.slotsFor(p)[0];
      if (top && (!best || p.ovr * top.eff > best.value)) best = { player: p, slot: top.slot, value: p.ovr * top.eff };
    }
    return best;
  }

  select(id) {
    if (this.s.phase !== BB.compare) return false;
    const p = this.pool.find((x) => x.id === id);
    if (!p) return false;
    this.s.selectedId = id;
    this.s.slot = this.slotsFor(p)[0]?.slot || null;
    this.persist();
    return true;
  }

  chooseSlot(slot) {
    const p = this.selected;
    if (this.s.phase !== BB.compare || !p || !this.slotsFor(p).some((x) => x.slot === slot)) return false;
    this.s.slot = slot;
    this.persist();
    return true;
  }

  get canRespin() { return this.s.respins > 0 && [BB.revealed, BB.compare].includes(this.s.phase); }

  respin() {
    if (!this.canRespin) return false;
    const next = B.drawContext(this.db, { usedTeams: this.s.usedTeams, drafted: this.drafted, occupied: this.occupied, avoid: this.s.shown });
    if (!next) return false;
    this.s.context = next;
    this.s.respins -= 1;
    this.s.selectedId = null;
    this.s.slot = null;
    this.s.phase = BB.spin;
    this.persist();
    return true;
  }

  /** Places the selected player at the chosen slot. Returns { player, slot, eff } or null. */
  draftSelected() {
    const p = this.selected;
    const slot = this.s.slot;
    if (this.s.phase !== BB.compare || !p || !slot || this.s.roster[slot]) return null;
    const eff = B.effectiveness(p, slot);
    if (eff <= 0) return null;
    this.s.roster[slot] = p.id;
    this.s.eff[slot] = eff;
    this.s.selectedId = null;
    this.s.slot = null;
    this.s.shown = [];
    if (Object.keys(this.s.roster).length >= 9) {
      this.s.phase = BB.complete;
      this.s.context = null;
    } else {
      this.s.phase = BB.spin;
      this.s.context = B.drawContext(this.db, { usedTeams: this.s.usedTeams, drafted: this.drafted, occupied: this.occupied });
    }
    this.persist();
    return { player: p, slot, eff };
  }

  // ----- Season ------------------------------------------------------------

  kickoff() {
    if (this.s.phase !== BB.complete || this.occupied.length !== 9) return false;
    const s = this.s;
    s.seed = Math.floor(Math.random() * 2 ** 31);
    s.games = [];
    s.calls = [];
    s.revealed = 0;
    s.pendingCall = null;
    s.recorded = false;
    s.phase = BB.season;
    this.loadLeague();
    this.simulateStretch(0);
    this.persist();
    return true;
  }

  simulateStretch(index) {
    const [a, z] = B.STRETCHES[index];
    const call = B.COACHING_CALLS[index - 1];
    const decision = call && this.s.calls.find((c) => c.id === call.id);
    const m = this.metrics;
    const fx = decision ? B.callEffect(decision.option, m) : {};
    const games = this.s.games.filter((g) => g.n < a || g.n > z);
    for (let n = a; n <= z; n++) games.push(B.simulateUserGame(m, this.schedule[n - 1], this.league, fx));
    this.s.games = games.sort((x, y) => x.n - y.n);
  }

  get revealedGames() { return this.s.games.slice(0, this.s.revealed); }
  get record() { return B.recordOf(this.revealedGames); }

  standings(n = this.s.revealed) {
    if (!this.league) return [];
    return B.standings(this.league, this.others, this.s.games, n, this.db.teams);
  }

  get dueCall() {
    if (this.s.phase !== BB.season) return null;
    return B.COACHING_CALLS.find((c) => this.s.revealed >= c.checkpoint && !this.s.calls.some((d) => d.id === c.id)) || null;
  }

  get lockedCall() { return this.s.pendingCall ? B.callById(this.s.pendingCall) : null; }

  applyCall(callId, optionId) {
    const call = B.callById(callId);
    const option = call?.options.find((o) => o.id === optionId);
    if (this.s.phase !== BB.season || !option || this.dueCall?.id !== callId) return false;
    const fx = B.callEffect(optionId, this.metrics);
    this.s.calls.push({ id: callId, option: optionId, title: option.title, summary: fx.summary });
    this.s.pendingCall = callId;
    this.simulateStretch(B.COACHING_CALLS.indexOf(call) + 1);
    this.persist();
    return true;
  }

  secondChance(callId) {
    const s = this.s;
    if (s.phase !== BB.season || s.secondChanceUsed || s.pendingCall !== callId) return false;
    const idx = B.COACHING_CALLS.findIndex((c) => c.id === callId);
    const [a, z] = B.STRETCHES[idx + 1];
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

  revealNext() {
    const s = this.s;
    if (s.phase !== BB.season || s.pendingCall || this.dueCall) return null;
    const game = s.games[s.revealed];
    if (!game) return null;
    s.revealed += 1;
    if (s.revealed >= B.SEASON_GAMES) s.phase = BB.final;
    this.persist();
    return game;
  }

  revealStretch() {
    const out = [];
    let g;
    while ((g = this.revealNext())) out.push(g);
    return out;
  }

  markRecorded() { this.s.recorded = true; this.persist(); }

  get canRunItBack() { return this.s.phase === BB.final && !this.s.runItBackUsed; }

  runItBack() {
    if (!this.canRunItBack) return false;
    Object.assign(this.s, {
      phase: BB.complete, runId: B.uuid(), seed: null, games: [], revealed: 0, calls: [], pendingCall: null,
      secondChanceUsed: false, runItBackUsed: true, recorded: false,
    });
    return this.kickoff();
  }

  resetToIdle() {
    this.s = freshState();
    this.league = null;
    this.persist();
  }
}

// ---------------------------------------------------------------------------
// Saved seasons
// ---------------------------------------------------------------------------

export class BaseballHistory {
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
    if (s.phase !== BB.final || s.games.length !== B.SEASON_GAMES) return null;
    const existing = this.runs.find((r) => r.id === s.runId);
    if (existing) return existing;
    const m = session.metrics;
    const sum = B.seasonSummary(s.games);
    const table = session.standings(B.SEASON_GAMES);
    const rank = table.findIndex((r) => r.idx === 0) + 1;
    const roster = session.roster;
    const run = {
      id: s.runId || B.uuid(),
      date: new Date().toISOString(),
      wins: sum.wins, losses: sum.losses, perfect: sum.perfect,
      overall: m.overall, chemistry: m.chemistry.score, batting: m.batting, pitching: m.pitching, defense: m.defense,
      runsFor: sum.runsFor, runsAgainst: sum.runsAgainst, diff: sum.diff, shutouts: sum.shutouts,
      longest: sum.longestWinStreak, rank, gb: table[rank - 1]?.gb ?? 0,
      months: sum.months.map((x) => [x.wins, x.losses]),
      grid: s.games.map((g) => g.result).join(''),
      roster: B.POSITIONS.map((slot) => {
        const p = roster[slot];
        return { slot, id: p.id, name: p.name, pos: p.pos, team: p.team, era: p.era, ovr: p.ovr, eff: s.eff[slot] };
      }),
      calls: s.calls.map(({ id, title, summary }) => ({ id, title, summary })),
    };
    this.runs.unshift(run);
    this.save();
    return run;
  }

  clear() { this.runs = []; writeJSON(this.storage, HISTORY_KEY, []); }

  get stats() {
    const runs = this.runs;
    const best = runs.reduce((b, r) => (!b || r.wins > b.wins ? r : b), null);
    const max = (fn) => runs.reduce((mx, r) => Math.max(mx, fn(r)), 0);
    return {
      total: runs.length,
      perfect: runs.filter((r) => r.perfect).length,
      best,
      bestRecord: best ? `${best.wins}-${best.losses}` : '—',
      bestWins: best ? best.wins : 0,
      maxShutouts: max((r) => r.shutouts),
      maxChemistry: max((r) => r.chemistry),
      pennants: runs.filter((r) => r.rank === 1).length,
    };
  }
}

/** Milestones from the 162-0 app (AchievementsView.swift) plus the web pennant. */
export function baseballAchievements(history) {
  const st = history.stats;
  const a = (id, title, description, icon, value, target) => ({
    id, title, description, icon, unlocked: value >= target, progress: Math.max(0, Math.min(1, value / target)),
    progressLabel: `${Math.min(value, target)} / ${target}`,
  });
  return [
    a('first_season', 'First Campaign', 'Complete your first full 162-game simulation', 'ball', st.total, 1),
    a('contender', 'Pennant Contender', 'Win 95 games in a single season', 'shield', st.bestWins, 95),
    a('baseball_100_wins', 'Century of Wins', 'Win 100 games in a single season', 'sparkles', st.bestWins, 100),
    a('baseball_110_wins', '110-Win Club', 'Win 110 games in a single season', 'flame', st.bestWins, 110),
    a('baseball_perfect_162', 'The Impossible 162-0', 'Win all 162 games, without a loss', 'crown', st.perfect, 1),
    a('pennant', 'Best in Baseball', 'Finish first in the 30-club league', 'trophy', st.pennants, 1),
    a('baseball_clean_sheets', 'Lights Out', 'Throw 15 shutouts in one season', 'shield', st.maxShutouts, 15),
    a('chemistry_guru', 'Synergy Specialist', 'Assemble a lineup with 90+ chemistry rating', 'bolt', st.maxChemistry, 90),
    a('ten_runs', 'Club Architect', 'Complete 10 total draft simulations', 'repeat', st.total, 10),
  ];
}
