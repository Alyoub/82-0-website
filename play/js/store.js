/**
 * 82-0 Web — Saved seasons, trophies, settings, and remote identity config.
 * Mirrors PersistenceService/RunRecord, AchievementsView and RemoteConfigService.
 */

import { seasonSummary, tierFor, POSITIONS, uuid } from './engine.js';

const HISTORY_KEY = '820.web.history.v1';
const SETTINGS_KEY = '820.web.settings.v1';
const CONFIG_KEY = 'remote-app-config-v1';
const MAX_RUNS = 500;

/**
 * Real vs. fictional player and team names.
 *   'remote' → follow the iOS app's live config (`realnames` flag), so web and app always match.
 *   true / false → force real or fictional names on the web regardless of the app.
 */
export const WEB_REAL_NAMES = 'remote';
export const REMOTE_CONFIG_URL = 'https://alyoub.github.io/82V3-config.json';
export const APP_STORE_URL = 'https://apps.apple.com/us/app/82-0-basketball-draft/id6794307298';

function readJSON(storage, key, fallback) {
  try { const v = JSON.parse(storage?.getItem(key) || 'null'); return v ?? fallback; } catch { return fallback; }
}
function writeJSON(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = { sound: true, haptics: true, fastSim: true };

export class Settings {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.values = { ...DEFAULT_SETTINGS, ...readJSON(storage, SETTINGS_KEY, {}) };
  }
  get(key) { return this.values[key]; }
  set(key, value) { this.values[key] = value; writeJSON(this.storage, SETTINGS_KEY, this.values); }
}

// ---------------------------------------------------------------------------
// Remote identity config
// ---------------------------------------------------------------------------

export class IdentityConfig {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    const cached = readJSON(storage, CONFIG_KEY, null);
    this.realNames = WEB_REAL_NAMES === 'remote' ? !!cached?.realnames : !!WEB_REAL_NAMES;
  }

  /** Resolves to true when the name mode changed. Never throws. */
  async refresh() {
    if (WEB_REAL_NAMES !== 'remote' || typeof fetch !== 'function') return false;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(REMOTE_CONFIG_URL, { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return false;
      const config = await res.json();
      if (typeof config?.realnames !== 'boolean') return false;
      writeJSON(this.storage, CONFIG_KEY, config);
      const changed = config.realnames !== this.realNames;
      this.realNames = config.realnames;
      return changed;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Season history (RunRecord)
// ---------------------------------------------------------------------------

/** Compact player snapshot so saved seasons survive future data updates. */
function snapshotPlayer(p) {
  if (!p) return null;
  const { id, name, fictionalName, primaryPosition, secondaryPositions, overall, offense, defense,
    shooting, playmaking, rebounding, athleticism, archetype } = p;
  return { id, name, fictionalName, primaryPosition, secondaryPositions, overall, offense, defense,
    shooting, playmaking, rebounding, athleticism, archetype };
}

export class History {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.runs = readJSON(storage, HISTORY_KEY, []);
    if (!Array.isArray(this.runs)) this.runs = [];
  }

  save() {
    // Keep storage bounded; perfect seasons are never trimmed.
    while (this.runs.length > MAX_RUNS) {
      const idx = this.runs.map((r, i) => [r, i]).reverse().find(([r]) => !r.isPerfect)?.[1];
      if (idx == null) break;
      this.runs.splice(idx, 1);
    }
    writeJSON(this.storage, HISTORY_KEY, this.runs);
  }

  /** Records a completed session once. Returns the new record. */
  record(session) {
    const s = session.s;
    const m = session.teamMetrics;
    const games = s.simulationResult.games;
    const sum = seasonSummary(games);
    const roster = {};
    for (const pos of POSITIONS) roster[pos] = snapshotPlayer(s.roster[pos]);
    const starters = Object.values(s.roster);
    const top = starters.reduce((best, p) => (!best || p.overall > best.overall ? p : best), null);
    const run = {
      id: s.runId || uuid(),
      date: new Date().toISOString(),
      wins: sum.wins,
      losses: sum.losses,
      overall: m.overall,
      chemistry: m.chemistry.score,
      offense: m.offense,
      defense: m.defense,
      shooting: m.shooting,
      rebounding: m.rebounding,
      playmaking: m.playmaking,
      benchBonus: m.benchImpact?.powerBonus ?? 0,
      isPerfect: sum.wins === 82,
      longestStreak: sum.longestWinStreak,
      averageMargin: Math.round(sum.averageMargin * 10) / 10,
      bestWin: sum.bestWin ? { n: sum.bestWin.n, us: sum.bestWin.us, them: sum.bestWin.them } : null,
      worstLoss: sum.worstLoss ? { n: sum.worstLoss.n, us: sum.worstLoss.us, them: sum.worstLoss.them } : null,
      topPlayer: snapshotPlayer(top),
      roster,
      sixthMan: snapshotPlayer(s.sixthMan),
      decisions: s.coachingDecisions.map((d) => ({ moment: d.moment, title: d.title, summary: d.summary })),
      grid: games.map((g) => (g.won ? 'W' : 'L')).join(''),
    };
    if (this.runs.some((r) => r.id === run.id)) return this.runs.find((r) => r.id === run.id);
    this.runs.unshift(run);
    this.save();
    return run;
  }

  clear() { this.runs = []; writeJSON(this.storage, HISTORY_KEY, []); }

  get stats() {
    const runs = this.runs;
    const best = runs.reduce((b, r) => (!b || r.wins > b.wins ? r : b), null);
    return {
      total: runs.length,
      perfect: runs.filter((r) => r.isPerfect).length,
      bestRecord: best ? `${best.wins}-${best.losses}` : '—',
      bestWins: best ? best.wins : 0,
      maxChemistry: runs.reduce((mx, r) => Math.max(mx, r.chemistry), 0),
    };
  }
}

export function tierOfRun(run) { return tierFor(run.wins); }

// ---------------------------------------------------------------------------
// Trophy case (AchievementsView.swift)
// ---------------------------------------------------------------------------

export function achievements(history) {
  const { total, perfect, bestWins, maxChemistry } = history.stats;
  const a = (id, title, description, icon, value, target) => ({
    id, title, description, icon, unlocked: value >= target, progress: Math.min(1, value / target),
    progressLabel: `${Math.min(value, target)} / ${target}`,
  });
  return [
    a('first_season', 'Rookie Campaign', 'Complete your first full 82-game simulation', 'ball', total, 1),
    a('contender', 'Playoff Contender', 'Win 55 or more games in a single season', 'shield', bestWins, 55),
    a('elite_70', '70-Win Juggernaut', 'Win 70 or more games in a single season', 'flame', bestWins, 70),
    a('legendary_75', 'All-Time Dynasty', 'Win 75 or more games in a single season', 'sparkles', bestWins, 75),
    a('perfect_82_0', 'The Impossible 82-0', 'Achieve an undefeated 82-0 regular season', 'crown', perfect, 1),
    a('chemistry_guru', 'Synergy Specialist', 'Assemble a lineup with a 90+ chemistry rating', 'bolt', maxChemistry, 90),
    a('ten_runs', 'Franchise Architect', 'Complete 10 total draft simulations', 'repeat', total, 10),
  ];
}
