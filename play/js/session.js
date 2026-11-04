/**
 * 82-0 Web — Draft session state machine.
 *
 * Port of 82v3/Game/DraftSession.swift. Every important action persists a JSON
 * snapshot, so a reload resumes the same reports, roster, season and reveal
 * position instead of rerolling them.
 *
 * Web differences: there are no ads. The optional rewarded actions from the app
 * (Scout Again, Second Chance, Run It Back) are free one-use perks instead.
 */

import {
  POSITIONS, POSITION_NAMES, effectiveness, calculateTeamMetrics, simulateSeason,
  applyCoachingEffect, coachingEffect, scoutingReports, COACHING_MOMENTS, momentById, uuid,
} from './engine.js';

export const SAVE_KEY = 'scoutingDesk.draft.v1';
export const SCOUT_AGAIN_PER_DRAFT = 1;

export const PHASES = {
  idle: 'idle',
  choosingReport: 'choosingReport',
  reportRevealed: 'reportRevealed',
  comparingPlayers: 'comparingPlayers',
  rosterComplete: 'rosterComplete',
  simulating: 'simulating',
  completed: 'completed',
};

function freshState() {
  return {
    phase: PHASES.idle,
    currentRound: 1,
    currentPosition: 'PG',
    reports: [],
    selectedReportIndex: 0,
    committedReport: null,
    selectedPlayer: null,
    roster: {},
    sixthMan: null,
    positionEffectiveness: {},
    simulationResult: null,
    coachingDecisions: [],
    revealedGameCount: 0,
    recentTeamIds: [],
    hasRecordedCompletedRun: false,
    hasUsedRunItBack: false,
    hasUsedSecondChance: false,
    scoutAgainUsed: 0,
    coachingBaseline: null,
    coachingBaselineMoment: null,
    runId: null,
  };
}

export class DraftSession {
  constructor(db, storage = globalThis.localStorage) {
    this.db = db;
    this.storage = storage;
    this.listeners = new Set();
    this.s = freshState();
    this.teamMetrics = null;
    this.restore();
  }

  // -- observation ---------------------------------------------------------
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(this); }
  commit() { this.persist(); this.emit(); }

  // -- derived -------------------------------------------------------------
  get phase() { return this.s.phase; }
  get hasCompleteStartingFive() { return Object.keys(this.s.roster).length >= POSITIONS.length; }
  get isRosterFull() { return this.hasCompleteStartingFive && !!this.s.sixthMan; }
  get draftedIds() {
    const ids = new Set(Object.values(this.s.roster).map((p) => p.id));
    if (this.s.sixthMan) ids.add(this.s.sixthMan.id);
    return ids;
  }
  get completedPickCount() { return Object.keys(this.s.roster).length + (this.s.sixthMan ? 1 : 0); }
  get isDraftingSixthMan() { return this.s.currentRound === 6; }
  get currentRoleName() { return this.isDraftingSixthMan ? 'Sixth Man' : POSITION_NAMES[this.s.currentPosition]; }
  get isDraftInProgress() { return this.s.phase !== PHASES.idle && this.s.phase !== PHASES.completed; }
  get isSeasonActive() { return this.s.phase === PHASES.simulating; }
  get scoutAgainRemaining() { return Math.max(0, SCOUT_AGAIN_PER_DRAFT - this.s.scoutAgainUsed); }
  get revealedGames() { return this.s.simulationResult ? this.s.simulationResult.games.slice(0, this.s.revealedGameCount) : []; }

  // -- draft ---------------------------------------------------------------
  startDraft() {
    this.s = freshState();
    this.teamMetrics = null;
    this.preparePick('PG');
  }

  /** Clears the finished run without preparing a pick (used by "Back to Home"). */
  resetToIdle() {
    this.s = freshState();
    this.teamMetrics = null;
    this.commit();
  }

  resumeOrPrepareDraft() {
    if (this.s.phase !== PHASES.idle) { this.validateRestoredState(); return; }
    this.startDraft();
  }

  choosePosition(pos) {
    const s = this.s;
    if (s.phase !== PHASES.choosingReport || this.isDraftingSixthMan || s.roster[pos]) return;
    if (pos === s.currentPosition) return;
    this.preparePick(pos);
  }

  selectReport(index) {
    if (this.s.phase !== PHASES.choosingReport || !this.s.reports[index]) return;
    this.s.selectedReportIndex = index;
    this.commit();
  }

  openSelectedReport() {
    const s = this.s;
    if (s.phase !== PHASES.choosingReport || !s.reports[s.selectedReportIndex]) return;
    s.committedReport = s.reports[s.selectedReportIndex];
    s.recentTeamIds.push(s.committedReport.team.id);
    s.selectedPlayer = null;
    s.phase = PHASES.reportRevealed;
    this.commit();
  }

  /**
   * Respin: replaces the pending team + era with a fresh one (avoiding teams
   * already shown) and returns to the spin step. Usable before or after the
   * reveal, once per draft.
   */
  scoutAgain() {
    const s = this.s;
    const allowed = [PHASES.choosingReport, PHASES.reportRevealed, PHASES.comparingPlayers];
    if (!allowed.includes(s.phase) || this.scoutAgainRemaining <= 0) return false;
    const avoid = [...s.recentTeamIds, ...s.reports.map((r) => r.team.id)];
    if (s.committedReport) avoid.push(s.committedReport.team.id);
    s.reports = this.makeThreeReports(s.currentPosition, this.isDraftingSixthMan, avoid);
    s.selectedReportIndex = 0;
    s.committedReport = null;
    s.selectedPlayer = null;
    s.phase = PHASES.choosingReport;
    s.scoutAgainUsed += 1;
    this.commit();
    return true;
  }

  scoutPlayers() {
    const s = this.s;
    if (s.phase !== PHASES.reportRevealed || !s.committedReport?.eligiblePlayers.length) return;
    s.phase = PHASES.comparingPlayers;
    s.selectedPlayer = s.committedReport.eligiblePlayers[0];
    this.commit();
  }

  selectPlayer(player) {
    const s = this.s;
    if (s.phase !== PHASES.comparingPlayers) return;
    if (!s.committedReport?.eligiblePlayers.some((p) => p.id === player.id)) return;
    if (this.draftedIds.has(player.id)) return;
    s.selectedPlayer = player;
    this.commit();
  }

  draftSelectedPlayer() {
    const s = this.s;
    const player = s.selectedPlayer;
    if (s.phase !== PHASES.comparingPlayers || !player || this.draftedIds.has(player.id)) return;
    if (!s.committedReport?.eligiblePlayers.some((p) => p.id === player.id)) return;

    if (this.isDraftingSixthMan) {
      s.sixthMan = player;
      this.recalc();
      s.reports = [];
      s.committedReport = null;
      s.selectedPlayer = null;
      s.phase = PHASES.rosterComplete;
      this.commit();
      return;
    }

    if (s.roster[s.currentPosition]) return;
    s.roster[s.currentPosition] = player;
    s.positionEffectiveness[s.currentPosition] = effectiveness(player, s.currentPosition);
    this.recalc();

    if (this.hasCompleteStartingFive) {
      s.currentRound = 6;
      this.prepareSixthManPick();
    } else {
      s.currentRound = Object.keys(s.roster).length + 1;
      this.preparePick(POSITIONS.find((p) => !s.roster[p]) || 'PG');
    }
  }

  projectedMetrics(player) {
    const s = this.s;
    if (this.isDraftingSixthMan) return calculateTeamMetrics(s.roster, s.positionEffectiveness, player);
    const roster = { ...s.roster, [s.currentPosition]: player };
    const eff = { ...s.positionEffectiveness, [s.currentPosition]: effectiveness(player, s.currentPosition) };
    return calculateTeamMetrics(roster, eff, s.sixthMan);
  }

  // -- season --------------------------------------------------------------
  beginSimulation() {
    const s = this.s;
    if ((s.phase === PHASES.simulating || s.phase === PHASES.completed) && s.simulationResult) return s.simulationResult;
    if (s.phase !== PHASES.rosterComplete || !this.hasCompleteStartingFive) return null;
    this.recalc();
    s.simulationResult = simulateSeason(this.teamMetrics, this.opponentIds());
    s.coachingDecisions = [];
    s.coachingBaseline = null;
    s.coachingBaselineMoment = null;
    s.revealedGameCount = 0;
    s.runId = uuid();
    s.phase = PHASES.simulating;
    this.commit();
    return s.simulationResult;
  }

  completeSimulation() {
    if (this.s.phase !== PHASES.simulating || !this.s.simulationResult) return;
    this.s.phase = PHASES.completed;
    this.commit();
  }

  nextCoachingMoment(afterGames = this.s.revealedGameCount) {
    return COACHING_MOMENTS.find((m) => m.checkpoint === afterGames
      && !this.s.coachingDecisions.some((d) => d.moment === m.id)) || null;
  }

  /** A decision whose second-chance window is still open (not yet finalized). */
  get pendingLockedMoment() {
    const id = this.s.coachingBaselineMoment;
    const m = id && momentById(id);
    return m && this.s.revealedGameCount === m.checkpoint ? m : null;
  }

  applyCoachingOption(option, moment) {
    const s = this.s;
    if (s.phase !== PHASES.simulating || s.revealedGameCount !== moment.checkpoint) return null;
    if (s.coachingDecisions.some((d) => d.moment === moment.id)) return null;
    if (!moment.options.some((o) => o.id === option.id) || !s.simulationResult) return null;

    this.recalc();
    const effect = coachingEffect(option.focus, this.teamMetrics);
    s.coachingBaseline = s.simulationResult;
    s.coachingBaselineMoment = moment.id;
    s.simulationResult = applyCoachingEffect(effect, moment.checkpoint + 1, moment.endGame, s.simulationResult, this.teamMetrics, this.opponentIds());
    const decision = { moment: moment.id, optionId: option.id, title: option.title, summary: effect.summary, checkpoint: moment.checkpoint };
    s.coachingDecisions.push(decision);
    this.commit();
    return decision;
  }

  useSecondChance(moment) {
    const s = this.s;
    if (s.phase !== PHASES.simulating || s.hasUsedSecondChance) return false;
    if (s.coachingBaselineMoment !== moment.id || !s.coachingBaseline) return false;
    if (s.coachingDecisions[s.coachingDecisions.length - 1]?.moment !== moment.id) return false;
    s.simulationResult = s.coachingBaseline;
    s.coachingDecisions.pop();
    s.coachingBaseline = null;
    s.coachingBaselineMoment = null;
    s.hasUsedSecondChance = true;
    this.commit();
    return true;
  }

  finalizeCoachingDecision(moment) {
    if (this.s.coachingBaselineMoment !== moment.id) return;
    this.s.coachingBaseline = null;
    this.s.coachingBaselineMoment = null;
    this.commit();
  }

  markGameRevealed(n) {
    const s = this.s;
    if (s.phase !== PHASES.simulating || n !== s.revealedGameCount + 1 || n > 82) return;
    s.revealedGameCount = n;
    this.persist();
  }

  markCompletedRunRecorded() {
    if (this.s.phase !== PHASES.completed || !this.s.simulationResult) return;
    this.s.hasRecordedCompletedRun = true;
    this.commit();
  }

  runItBack() {
    const s = this.s;
    if (s.phase !== PHASES.completed || !this.hasCompleteStartingFive || s.hasUsedRunItBack) return false;
    s.simulationResult = null;
    s.coachingDecisions = [];
    s.coachingBaseline = null;
    s.coachingBaselineMoment = null;
    s.revealedGameCount = 0;
    s.hasRecordedCompletedRun = false;
    s.hasUsedRunItBack = true;
    s.hasUsedSecondChance = false;
    s.phase = PHASES.rosterComplete;
    this.commit();
    return true;
  }

  // -- internals -----------------------------------------------------------
  recalc() {
    this.teamMetrics = calculateTeamMetrics(this.s.roster, this.s.positionEffectiveness, this.s.sixthMan);
  }

  opponentIds() { return this.db.teams.map((t) => t.id); }

  preparePick(pos) {
    const s = this.s;
    s.currentPosition = pos;
    s.committedReport = null;
    s.selectedPlayer = null;
    s.selectedReportIndex = 0;
    s.reports = this.makeThreeReports(pos, false);
    s.phase = PHASES.choosingReport;
    this.commit();
  }

  prepareSixthManPick() {
    const s = this.s;
    s.committedReport = null;
    s.selectedPlayer = null;
    s.selectedReportIndex = 0;
    s.reports = this.makeThreeReports(s.currentPosition, true);
    s.phase = PHASES.choosingReport;
    this.commit();
  }

  makeThreeReports(position, isSixthMan, avoid) {
    const generated = scoutingReports(this.db, {
      position, isSixthMan, excluding: this.draftedIds, recentTeamIds: avoid ?? this.s.recentTeamIds,
    });
    while (generated.length && generated.length < 3) {
      const src = generated[Math.floor(Math.random() * generated.length)];
      generated.push({ ...src, id: uuid() });
    }
    return generated.slice(0, 3);
  }

  validateRestoredState() {
    const s = this.s;
    if (s.phase === PHASES.choosingReport && s.reports.length !== 3) {
      this.isDraftingSixthMan ? this.prepareSixthManPick() : this.preparePick(s.currentPosition);
    } else if ((s.phase === PHASES.reportRevealed || s.phase === PHASES.comparingPlayers)
      && !s.committedReport?.eligiblePlayers?.length) {
      this.isDraftingSixthMan ? this.prepareSixthManPick() : this.preparePick(s.currentPosition);
    } else if ((s.phase === PHASES.simulating || s.phase === PHASES.completed) && !s.simulationResult) {
      s.phase = this.hasCompleteStartingFive ? PHASES.rosterComplete : PHASES.idle;
    }
  }

  persist() {
    try { this.storage?.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage full or blocked */ }
  }

  restore() {
    let saved = null;
    try { saved = JSON.parse(this.storage?.getItem(SAVE_KEY) || 'null'); } catch { saved = null; }
    if (!saved || typeof saved !== 'object' || !saved.phase) return;
    this.s = { ...freshState(), ...saved };
    if (this.s.phase === PHASES.completed && !saved.revealedGameCount) this.s.revealedGameCount = 82;
    this.recalc();
    this.validateRestoredState();
  }
}
