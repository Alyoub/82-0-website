/**
 * 82-0 Web Edition — App controller and views.
 *
 * Screens: Home · Draft (sealed reports → reveal → compare → lineup locked) ·
 * Season (live reveal + coaching calls + final record) · History · Trophies · Settings.
 */

import * as E from './engine.js';
import { DraftSession, PHASES } from './session.js';
import { createFootball, FB_APP_STORE_URL } from './football.js';
import { createBaseball } from './baseball.js';
import { Settings, IdentityConfig, History, achievements, APP_STORE_URL } from './store.js';
import {
  esc, icon, BALL_SVG, BOARD_LINES, avatar, posBadge, hex, teamBadge, ring,
  ovrRing, miniBar, fitClass, fitLabel, signed, delta, court, strip,
} from './ui.js';
import { initFx, sound, haptic, canVibrate, confetti } from './fx.js';
import { QMARK_ITEM, BLANK_ITEM, reelCab, animateReel, neighbours } from './reels.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = { db: null, session: null, history: null, settings: null, identity: null, route: null, selectedGame: '82-0', historyFilter: 'all', fresh: null, busy: false, justLanded: false, autoSpin: false };

const GAME_CATALOG = {
  '82-0': {
    title: '82-0',
    tag: 'BASKETBALL DRAFT',
    sport: 'Basketball',
    record: '82',
    accent: '#ff6a1a',
    live: true,
    icon: new URL('../../assets/images/icon-82-0.jpg', import.meta.url).href,
    appStore: APP_STORE_URL,
  },
  '17-0': {
    title: '17-0',
    tag: 'FOOTBALL DRAFT',
    sport: 'Football',
    record: '17',
    accent: '#19c98a',
    live: true,
    icon: new URL('../../assets/images/icon-17-0.jpg', import.meta.url).href,
    appStore: FB_APP_STORE_URL,
    description: 'Draft five football legends, make three coaching calls and chase a flawless 17-0 regular season.',
  },
  '162-0': {
    title: '162-0',
    tag: 'BASEBALL DRAFT',
    sport: 'Baseball',
    record: '162',
    accent: '#e0a63f',
    live: true,
    icon: new URL('../../assets/images/icon-162-0.jpg', import.meta.url).href,
    appStore: null,
    description: 'Draft your starting nine across four eras, place them on the diamond and chase a perfect 162-0 season.',
  },
};

/** Games other than 82-0 run as self-contained modules sharing this shell. */
const host = {
  go: (r) => go(r),
  render: (changed = false) => render(changed),
  toast: (msg) => toast(msg),
  dialog: (id) => dialog(id),
  confirm: (opts) => confirmDialog(opts),
  route: () => app.route,
  get settings() { return app.settings; },
};
const MODULES = { '17-0': createFootball(host), '162-0': createBaseball(host) };
const gameModule = () => MODULES[app.selectedGame] || null;

const ROUTES = ['home', 'draft', 'season', 'history', 'trophies', 'settings'];
const TITLES = {
  home: 'Play 82-0 Online Free – The 82-0 Basketball Game',
  draft: 'Draft Room · 82-0',
  season: 'Season · 82-0',
  history: 'Season History · 82-0',
  trophies: 'Trophy Case · 82-0',
  settings: 'Settings · 82-0',
};
const RING_COLORS = { off: '#ff7a2e', def: '#00d2ff', sht: '#ffc726', ply: '#e056fd', reb: '#34d399', ath: '#8b5cf6' };
const STRETCHES = [[1, 20, null], [21, 41, 'rotationAudit'], [42, 61, 'identityCall'], [62, 82, 'finalPush']];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mountAppSwitcher() {
  const items = Object.entries(GAME_CATALOG).map(([id, game]) => `
    <button class="app-option${id === app.selectedGame ? ' active' : ''}" type="button" data-act="switch-game" data-game="${id}" aria-pressed="${String(id === app.selectedGame)}" style="--game-accent:${game.accent}">
      <span class="app-option-mark" aria-hidden="true"><img src="${game.icon}" alt="" width="46" height="46"></span>
      <span class="app-option-copy"><b>${game.title}</b><small>${game.sport}</small></span>
      <span class="app-option-status ${game.live ? 'live' : ''}">${game.live ? 'Live' : 'Soon'}</span>
    </button>`).join('');

  $('.ambient').insertAdjacentHTML('afterend', `
    <button class="sidebar-backdrop" type="button" data-act="close-sidebar" aria-label="Close game library"></button>
    <aside class="app-sidebar" id="app-sidebar" aria-label="Game library">
      <div class="app-sidebar-head">
        <div class="studio-mark" aria-hidden="true">0</div>
        <div><b>0 STUDIO</b><span>GAME LIBRARY</span></div>
        <button class="sidebar-close" type="button" data-act="close-sidebar" aria-label="Close game library">${icon('x')}</button>
      </div>
      <p class="app-sidebar-label">SELECT A GAME</p>
      <nav class="app-list" aria-label="Available games">${items}</nav>
      <div class="app-sidebar-foot"><span class="status-dot"></span><span>More games on the way</span></div>
    </aside>`);

  $('.topbar').insertAdjacentHTML('afterbegin', `
    <button class="sidebar-toggle" type="button" data-act="toggle-sidebar" aria-label="Open game library" aria-controls="app-sidebar" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>`);
}

const pname = (p) => E.playerName(p, app.identity.realNames);
const tid = (team) => E.teamIdentity(team, app.identity.realNames);
const oppName = (id) => { const t = app.db.teamById.get(id); return t ? tid(t).name : 'League opponent'; };
const fmtDate = (iso, long = false) => new Date(iso).toLocaleDateString(undefined, long
  ? { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

function outlook(m) {
  const rate = E.expectedWinRate(E.teamPower(m));
  const wins = Math.round(82 * rate);
  return { wins, tier: E.tierFor(wins) };
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function dialog(id, cls = 'sheet') {
  let d = document.getElementById(id);
  if (!d) {
    d = document.createElement('dialog');
    d.id = id;
    d.className = cls;
    $('#modal-root').appendChild(d);
  }
  return d;
}

function confirmDialog({ title, body, confirm = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const d = dialog('confirm-dialog');
    d.innerHTML = `<div class="sheet-body"><h2>${esc(title)}</h2><p>${esc(body)}</p>
      <div class="sheet-actions"><button class="btn ${danger ? 'btn-secondary danger' : 'btn-primary'}" data-v="1">${esc(confirm)}</button>
      <button class="btn btn-ghost" data-v="0">Cancel</button></div></div>`;
    const done = (v) => { d.close(); resolve(v); };
    d.onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === d) done(false);
    };
    d.oncancel = (e) => { e.preventDefault(); done(false); };
    d.showModal();
  });
}

function ensureRecorded() {
  const s = app.session;
  if (s.phase === PHASES.completed && s.s.simulationResult && !s.s.hasRecordedCompletedRun) {
    app.history.record(s);
    s.markCompletedRunRecorded();
  }
}

// ---------------------------------------------------------------------------
// Routing & render
// ---------------------------------------------------------------------------

function hashRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(h) ? h : 'home';
}

function resolveRoute(r) {
  if (gameModule()) return gameModule().resolveRoute(r);
  const p = app.session.phase;
  if (r === 'draft') {
    if (p === PHASES.simulating || p === PHASES.completed) return 'season';
    if (p === PHASES.idle) return 'home';
  }
  if (r === 'season' && p !== PHASES.simulating && p !== PHASES.completed) return p === PHASES.idle ? 'home' : 'draft';
  return r;
}

function go(r) {
  if (hashRoute() === r && app.route === r) render(false);
  else location.hash = `#/${r}`;
}

function onRoute() {
  let r = hashRoute();
  const resolved = resolveRoute(r);
  if (resolved !== r) { window.history.replaceState(null, '', `#/${resolved}`); r = resolved; }
  const changed = app.route !== r;
  app.route = r;
  render(changed);
}

function render(routeChanged = true) {
  const r = app.route;
  if (r !== 'season') runner.stop();
  if (routeChanged) for (const d of $$('dialog[open]')) d.close();

  const selected = GAME_CATALOG[app.selectedGame];
  document.body.dataset.game = app.selectedGame;
  $('.brand-name').textContent = selected.title;
  $('.brand-tag').textContent = selected.tag;
  $('.brand').setAttribute('aria-label', `${selected.title} ${selected.sport} game home`);
  const brandImg = $('.brand img');
  if (brandImg && selected.icon && brandImg.src !== selected.icon) brandImg.src = selected.icon;
  const pill = $('.app-pill');
  if (pill) {
    pill.hidden = !selected.appStore;
    if (selected.appStore) {
      pill.href = selected.appStore;
      pill.setAttribute('aria-label', `Get ${selected.title} on the App Store`);
    }
  }
  const mod = gameModule();
  for (const [id, m] of Object.entries(MODULES)) if (id !== app.selectedGame) m.stop();
  for (const item of $$('.app-option')) {
    const active = item.dataset.game === app.selectedGame;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  }

  if (!selected.live) {
    document.body.classList.remove('in-flow');
    document.body.dataset.route = 'preview';
    for (const a of $$('[data-tab]')) a.removeAttribute('aria-current');
    document.title = `${selected.title} ${selected.sport} Game · Coming Soon`;
    const view = $('#view');
    view.innerHTML = viewGamePreview(selected);
    if (routeChanged) {
      view.classList.remove('view-enter');
      void view.offsetWidth;
      view.classList.add('view-enter');
      window.scrollTo({ top: 0 });
    }
    view.focus({ preventScroll: true });
    return;
  }

  if (mod) {
    runner.stop();
    document.body.classList.toggle('in-flow', r === 'draft' || r === 'season');
    document.body.dataset.route = r;
    const tab = r === 'draft' || r === 'season' ? 'home' : r;
    for (const a of $$('[data-tab]')) {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    document.title = mod.title(r);
    const view = $('#view');
    view.innerHTML = mod.view(r);
    if (routeChanged) {
      view.classList.remove('view-enter');
      void view.offsetWidth;
      view.classList.add('view-enter');
      window.scrollTo({ top: 0 });
    }
    view.focus({ preventScroll: true });
    mod.mounted(r);
    return;
  }

  document.body.classList.toggle('in-flow', r === 'draft' || r === 'season');
  document.body.dataset.route = r;
  const tab = r === 'draft' || r === 'season' ? 'home' : r;
  for (const a of $$('[data-tab]')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  document.title = TITLES[r];

  const view = $('#view');
  const html = { home: viewHome, draft: viewDraft, season: viewSeason, history: viewHistory, trophies: viewTrophies, settings: viewSettings }[r]();
  view.innerHTML = html;
  if (routeChanged) {
    view.classList.remove('view-enter');
    void view.offsetWidth;
    view.classList.add('view-enter');
    window.scrollTo({ top: 0 });
  }
  view.focus({ preventScroll: true });
  app.fresh = null;

  if (r === 'season') mountSeason();
  if (r === 'draft' && app.autoSpin && app.session.phase === PHASES.choosingReport) {
    app.autoSpin = false;
    setTimeout(spin, 260);
  }
}

function viewGamePreview(game) {
  return `
  <section class="game-preview" style="--game-accent:${game.accent}" aria-labelledby="preview-title">
    <div class="preview-glow" aria-hidden="true"></div>
    <div class="preview-record" aria-hidden="true"><b>${game.record}</b><i>-</i><b>0</b></div>
    <span class="preview-status"><i></i> Coming soon</span>
    <h1 id="preview-title">${game.title}</h1>
    <p>${game.description}</p>
    <button class="btn btn-secondary" data-act="switch-game" data-game="82-0">Play 82-0 now</button>
  </section>`;
}

function switchGame(id) {
  if (!GAME_CATALOG[id] || id === app.selectedGame) {
    document.body.classList.remove('sidebar-open');
    $('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    return;
  }
  app.selectedGame = id;
  if (GAME_CATALOG[id].live) app.settings?.set('game', id);
  document.body.classList.remove('sidebar-open');
  $('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
  if (hashRoute() !== 'home') window.history.replaceState(null, '', '#/home');
  app.route = 'home';
  render(true);
}

// ---------------------------------------------------------------------------
// HOME
// ---------------------------------------------------------------------------

function viewHome() {
  const s = app.session;
  const st = app.history.stats;
  let cta;
  switch (s.phase) {
    case PHASES.idle:
      cta = `<button class="btn btn-primary btn-xl btn-block" data-act="play">${icon('ball')} START YOUR DYNASTY ${icon('arrow')}</button>`;
      break;
    case PHASES.simulating:
      cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="season">${icon('play')} RESUME SEASON</button>
        <div class="row"><button class="btn btn-secondary" data-act="new-draft">${icon('refresh')} New draft</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
        <p class="resume-note">Game ${s.s.revealedGameCount} of 82 · your season is saved</p>`;
      break;
    case PHASES.completed:
      cta = `<button class="btn btn-primary btn-xl btn-block" data-act="new-draft-now">${icon('ball')} NEW DRAFT ${icon('arrow')}</button>
        <div class="row"><button class="btn btn-secondary" data-act="nav" data-to="season">${icon('trophy')} Last final</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>`;
      break;
    default: {
      const label = s.phase === PHASES.rosterComplete ? 'Lineup locked · ready to tip off' : `Pick ${Math.min(s.s.currentRound, 6)} of 6 · ${s.currentRoleName}`;
      cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="draft">${icon('play')} CONTINUE DRAFT</button>
        <div class="row"><button class="btn btn-secondary" data-act="new-draft">${icon('refresh')} Start over</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
        <p class="resume-note">${esc(label)}</p>`;
    }
  }
  if (s.phase === PHASES.idle) {
    cta += `<div class="row"><a class="btn btn-secondary" href="#/history">${icon('trophy')} Records</a><a class="btn btn-secondary" href="#/trophies">${icon('star')} Trophies</a></div>`;
  }

  const recent = app.history.runs.slice(0, 5);
  return `
  <section class="home-hero" aria-label="82-0 home">
    <div id="home-title" class="wordmark">82-0</div>
    <div class="hero-kicker">BUILD THE PERFECT FIVE</div>
    <p class="hero-sub">Random team. Random era. Your decision.</p>
    <div class="ball-stage" aria-hidden="true"><div class="ball-floor"></div><div class="ball-ring"></div><div class="ball-float">${BALL_SVG}</div></div>
    <div class="hero-cta">${cta}</div>
    <div class="stat-tiles">
      <div class="stat-tile"><b class="num">${st.bestRecord}</b><span>BEST RECORD</span></div>
      <div class="stat-tile gold"><b class="num">${st.perfect}</b><span>82-0 SEASONS</span></div>
      <div class="stat-tile"><b class="num">${st.total}</b><span>TOTAL RUNS</span></div>
    </div>
  </section>

  <div class="home-grid">
    <section class="card" aria-labelledby="loop-title">
      <div class="card-head"><h2 class="card-title" id="loop-title">The core loop</h2><span class="chip">6 picks · 82 games</span></div>
      <div class="loop-steps">
        <div class="loop-step"><i>1</i><b>SPIN</b><span>Random team + era</span></div>
        <div class="loop-step"><i>2</i><b>DRAFT</b><span>Pick 5 starters</span></div>
        <div class="loop-step"><i>3</i><b>BENCH</b><span>Add a sixth man</span></div>
        <div class="loop-step"><i>4</i><b>SIM</b><span>Coach 82 games</span></div>
      </div>
      <p class="hint">${icon('info')} Chemistry, position fit and your three coaching calls all move the needle.</p>
    </section>
    <section class="card" aria-labelledby="recent-title">
      <div class="card-head"><h2 class="card-title" id="recent-title">Recent seasons</h2>${app.history.runs.length ? '<a class="chip" href="#/history">View all</a>' : ''}</div>
      ${recent.length ? `<div class="run-list">${recent.map(runRow).join('')}</div>`
        : '<div class="empty"><b>No seasons recorded yet</b>Start your first draft above to begin your journey.</div>'}
    </section>
  </div>
  `;
}

function runRow(run) {
  const tier = E.tierFor(run.wins);
  const top = run.topPlayer ? pname(run.topPlayer) : 'Your lineup';
  return `<button class="run-row" data-act="run-detail" data-id="${esc(run.id)}">
    <span class="run-rec num" style="color:${tier.color}">${run.wins}-${run.losses}</span>
    <span class="run-meta"><b>${esc(top)} &amp; co.</b><span>${fmtDate(run.date)} · ${run.overall} OVR · ${run.chemistry} CHEM</span></span>
    <span class="run-side"><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span></span>
  </button>`;
}

// ---------------------------------------------------------------------------
// DRAFT
// ---------------------------------------------------------------------------

function viewDraft() {
  const s = app.session;
  if (s.phase === PHASES.rosterComplete) return viewLocked();

  const stageIdx = { [PHASES.choosingReport]: 0, [PHASES.reportRevealed]: 1, [PHASES.comparingPlayers]: 2 }[s.phase] ?? 0;
  const stages = ['Spin', 'Reveal', 'Draft'].map((label, i) => {
    const cls = i < stageIdx ? 'done' : i === stageIdx ? 'on' : '';
    const dot = i < stageIdx ? icon('check') : i + 1;
    const line = i < 2 ? `<li class="stage-line ${i < stageIdx ? 'done' : ''}" aria-hidden="true"></li>` : '';
    return `<li class="stage ${cls}"><i>${dot}</i>${label}</li>${line}`;
  }).join('');
  const done = s.completedPickCount;
  const pips = Array.from({ length: 6 }, (_, i) => `<span class="pip${i === 5 ? ' six' : ''}${i < done ? ' done' : i === done ? ' now' : ''}"></span>`).join('');

  const pickable = s.phase === PHASES.choosingReport && !s.isDraftingSixthMan;
  const lineupOpts = { roster: s.s.roster, sixthMan: s.s.sixthMan, name: pname, currentPos: s.s.currentPosition, draftingSix: s.isDraftingSixthMan, pickable, fresh: app.fresh };

  let main = '';
  if (s.phase === PHASES.choosingReport) main = htmlChoose();
  else if (s.phase === PHASES.reportRevealed) main = htmlReveal();
  else if (s.phase === PHASES.comparingPlayers) main = htmlCompare();

  return `
  <section class="draft" aria-labelledby="draft-title">
    <div class="flow-head">
      <button class="icon-btn" data-act="nav" data-to="home" aria-label="Leave draft (progress is saved)">${icon('x')}</button>
      <div class="flow-title"><div class="kicker">Pick ${Math.min(s.s.currentRound, 6)} of 6</div><h1 id="draft-title">${esc(s.currentRoleName)}</h1></div>
      <div class="pips" aria-label="${done} of 6 picks made">${pips}</div>
    </div>
    <ol class="stages" aria-label="Pick progress">${stages}</ol>
    ${strip(lineupOpts)}
    <div class="draft-grid">
      <div class="draft-main">${main}</div>
      <aside class="draft-aside" aria-label="Your lineup">
        <div class="card"><div class="card-head"><span class="card-title">Your lineup</span><span class="chip">${done}/6</span></div>${court(lineupOpts)}</div>
        <div class="card">${metricsBlock(Object.keys(s.s.roster).length ? s.teamMetrics : null)}</div>
      </aside>
    </div>
  </section>`;
}

function metricsBlock(m) {
  if (!m) {
    return `${ovrRing(null)}<p class="chem-note" style="margin-top:10px">Draft your first starter to see team ratings, chemistry and the season outlook.</p>`;
  }
  const o = outlook(m);
  return `<div class="metrics">
    <div class="metric-top">${ovrRing(m.overall)}
      <div class="chem"><div class="chem-head"><span>TEAM CHEMISTRY</span><b>${m.chemistry.score}%</b></div>
      <div class="bar"><i style="--v:${m.chemistry.score}%"></i></div>
      <div class="chem-note">${m.chemistry.bonuses.length} boosts · ${m.chemistry.penalties.length} drags</div></div>
    </div>
    <div class="metric-row">
      <div class="metric-cell"><b class="num">${E.teamPower(m).toFixed(1)}</b><span>POWER</span></div>
      <div class="metric-cell"><b class="num">${m.offense}</b><span>OFFENSE</span></div>
      <div class="metric-cell"><b class="num">${m.defense}</b><span>DEFENSE</span></div>
    </div>
    <div class="outlook" title="Expected wins before any coaching calls"><div><small>BASELINE OUTLOOK</small><b>~${o.wins} wins</b></div><span class="tier-chip" style="--tier:${o.tier.color}">${o.tier.label}</span></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Slot machine (team + era reels)
// ---------------------------------------------------------------------------

function teamItem(team, target = false) {
  const ti = tid(team);
  return `<div class="ri${target ? ' target' : ''}">${teamBadge(team, ti)}<span class="ri-name">${esc(ti.name)}</span></div>`;
}

function eraItem(era, target = false) {
  return `<div class="ri${target ? ' target' : ''}"><span class="ri-era">${esc(era.label)}</span><span class="ri-sub">${era.startYear}–${era.endYear}</span></div>`;
}

/** Resting reels show "?"; landed reels show the committed team + era. */
function slotHtml(report, won = false) {
  if (!report) {
    return `<div class="slot" aria-hidden="true">
      ${reelCab('team', 'TEAM', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}
      ${reelCab('era', 'ERA', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}</div>`;
  }
  const [tp, tn] = neighbours(app.db.teams, report.team);
  const [ep, en] = neighbours(app.db.eras, report.era);
  return `<div class="slot" role="img" aria-label="${esc(tid(report.team).name)}, ${esc(report.era.label)}">
    ${reelCab('team', 'TEAM', [teamItem(tp), teamItem(report.team, true), teamItem(tn)], 1, won)}
    ${reelCab('era', 'ERA', [eraItem(ep), eraItem(report.era, true), eraItem(en)], 1, won)}</div>`;
}

function htmlChoose() {
  const s = app.session;
  const role = s.isDraftingSixthMan ? 'sixth man' : E.POSITION_NAMES[s.s.currentPosition].toLowerCase();
  const intro = s.isDraftingSixthMan
    ? 'One random franchise, one random decade. Any position qualifies — look for scoring, coverage and fresh legs.'
    : `One random franchise, one random decade. Everyone who played ${s.s.currentPosition} there becomes your pool.`;
  return `
    <div class="phase-head"><h2>Spin for your ${role}</h2><p>${intro}</p></div>
    ${slotHtml(null)}
    <div class="spin-actions">
      <button class="btn btn-primary spin-btn" data-act="spin" id="spin-btn">${icon('refresh')} SPIN</button>
      ${s.isDraftingSixthMan ? '' : `<p class="hint">${icon('info')} Tap an open spot in your lineup to draft a different position first.</p>`}
      <div class="kbd-hint"><span><kbd>Space</kbd> or <kbd>Enter</kbd> spin</span></div>
    </div>`;
}

function htmlReveal() {
  const s = app.session;
  const r = s.s.committedReport;
  const ti = tid(r.team);
  const n = r.eligiblePlayers.length;
  const left = s.scoutAgainRemaining;
  const won = app.justLanded;
  app.justLanded = false;
  return `
    <div class="phase-head"><h2>${esc(ti.name)} · ${esc(r.era.label)}</h2><p>The reels have spoken. Scout the pool and draft one.</p></div>
    ${slotHtml(r, won)}
    <div class="spin-result">
      <div class="sr-top">
        ${teamBadge(r.team, ti, 'lg')}
        <div class="sr-text"><div class="kicker">${r.isSixthMan ? 'Any-position sixth man pool' : `${E.POSITION_NAMES[r.position]} pool`}</div>
          <b>${esc(ti.name)}</b><span>${r.era.startYear} – ${r.era.endYear}</span></div>
        <div class="sr-count"><b class="num">${n}</b><span>${n === 1 ? 'PLAYER' : 'PLAYERS'}</span></div>
      </div>
      <div class="sr-actions">
        <button class="btn btn-primary btn-xl" data-act="scout-players">Scout the players ${icon('arrow')}</button>
        <button class="btn btn-gold" data-act="respin" ${left ? '' : 'disabled'}>${icon('refresh')} Respin <span class="badge-count">${left} left</span></button>
      </div>
      <div class="kbd-hint"><span><kbd>Enter</kbd> scout the players</span>${left ? '<span><kbd>R</kbd> respin</span>' : ''}</div>
    </div>`;
}

function htmlCompare() {
  const s = app.session;
  const r = s.s.committedReport;
  const ti = tid(r.team);
  const sel = s.s.selectedPlayer;
  const rows = r.eligiblePlayers.map((p, i) => prow(p, sel?.id === p.id, i)).join('');
  const left = s.scoutAgainRemaining;
  return `
    <div class="compare-head">${teamBadge(r.team, ti)}<div class="t"><b>${esc(ti.name)} · ${esc(r.era.label)}</b><span>${r.eligiblePlayers.length} eligible ${r.isSixthMan ? 'sixth men' : `at ${r.position}`} — compare and draft one</span></div>
      ${left ? `<button class="btn btn-gold btn-sm" data-act="respin" title="Spin a new team and era">${icon('refresh')} Respin <span class="badge-count">${left}</span></button>` : ''}</div>
    <div class="compare-grid">
      <div class="plist" role="listbox" aria-label="Eligible players">${rows}</div>
      <div id="pdetail">${playerDetail(sel)}</div>
    </div>
    <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="draft" id="draft-btn">${draftLabel(sel)}</button></div>
    <div class="kbd-hint" style="margin-top:12px"><span><kbd>↑</kbd><kbd>↓</kbd> compare</span><span><kbd>Enter</kbd> draft</span></div>`;
}

const draftLabel = (p) => `${icon('check')} Draft ${esc(p ? pname(p) : '')}`;

function prow(p, selected, i) {
  const n = pname(p);
  return `<button class="prow" type="button" role="option" aria-selected="${selected}" data-act="select-player" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i, 10) * 0.035}s">
    ${hex(p.overall, 'sm')}
    <span class="prow-main"><span class="prow-name">${esc(n)}</span>
      <span class="prow-sub">${posBadge(p.primaryPosition)}<span class="arch">${esc(p.archetype)}${p.secondaryPositions.length ? ` · ${p.secondaryPositions.join('/')}` : ''}</span></span></span>
    <span class="mini-bars" aria-hidden="true">${miniBar('OFF', p.offense, RING_COLORS.off)}${miniBar('PLY', p.playmaking, RING_COLORS.ply)}${miniBar('DEF', p.defense, RING_COLORS.def)}</span>
  </button>`;
}

function playerDetail(p) {
  if (!p) return '';
  const s = app.session;
  const r = s.s.committedReport;
  const six = s.isDraftingSixthMan;
  const slot = s.s.currentPosition;
  const n = pname(p);
  const ti = tid(r.team);
  const hasRoster = Object.keys(s.s.roster).length > 0;
  const cur = hasRoster ? s.teamMetrics : null;
  const proj = s.projectedMetrics(p);
  const projPower = E.teamPower(proj);
  const curPower = cur ? E.teamPower(cur) : null;
  const o = outlook(proj);
  const curO = cur ? outlook(cur) : null;
  const eff = E.effectiveness(p, slot);

  let fitOrBench;
  if (six) {
    const b = proj.benchImpact;
    fitOrBench = `<div class="fit-line">${icon('users')} Bench role: <span class="fit f100">+${b.powerBonus.toFixed(2)} team power</span></div>`;
  } else {
    fitOrBench = `<div class="fit-line">${icon('court')} Fit at ${slot}: <span class="fit ${fitClass(eff)}">${fitLabel(eff)}</span><span>${eff >= 1 ? 'natural position' : eff >= 0.95 ? 'listed secondary position' : 'out of position'}</span></div>`;
  }

  let chemDiff = '';
  const before = new Set([...(cur?.chemistry.bonuses || []), ...(cur?.chemistry.penalties || [])].map((x) => x.reason));
  const after = [...proj.chemistry.bonuses, ...proj.chemistry.penalties];
  const gained = after.filter((x) => !before.has(x.reason));
  const afterSet = new Set(after.map((x) => x.reason));
  const lost = [...(cur?.chemistry.bonuses || []), ...(cur?.chemistry.penalties || [])].filter((x) => !afterSet.has(x.reason));
  const diffs = [
    ...gained.map((x) => ({ text: x.reason, v: x.value })),
    ...lost.map((x) => ({ text: `${x.reason} removed`, v: -x.value })),
  ].slice(0, 4);
  if (!six && diffs.length) {
    chemDiff = `<div class="chem-list" style="margin-top:12px">${diffs.map((d) => `<div class="${d.v >= 0 ? 'plus' : 'minus'}"><span>${esc(d.text)}</span><b>${signed(d.v)}</b></div>`).join('')}</div>`;
  }

  const benchGrid = six ? `<div class="impact-grid" style="margin-top:8px">
      <div class="impact-cell"><b>${proj.benchImpact.scoring}</b><span>SCORING</span></div>
      <div class="impact-cell"><b>${proj.benchImpact.positionalCoverage}</b><span>COVERAGE</span></div>
      <div class="impact-cell"><b>${proj.benchImpact.fatigueRelief}</b><span>FATIGUE RELIEF</span></div>
      <div class="impact-cell"><b>+${proj.benchImpact.powerBonus.toFixed(1)}</b><span>BENCH PWR</span></div></div>` : '';

  return `
    <div class="pcard" id="pcard">
      <div class="pcard-top">${hex(p.overall)}<div class="pcard-pos">${posBadge(six ? p.primaryPosition : slot)}<small>${esc(ti.abbreviation)}</small></div></div>
      <div class="pcard-id">${avatar(n, six ? 'SIX' : slot)}
        <div class="pcard-name">${esc(n)}</div>
        <div class="era-chip">${esc(r.era.label)} era</div>
        <div class="pcard-arch">${esc(p.archetype)} · ${[p.primaryPosition, ...p.secondaryPositions].join(' / ')}</div>
      </div>
      <div class="rings">
        ${ring('OFFENSE', p.offense, RING_COLORS.off)}${ring('DEFENSE', p.defense, RING_COLORS.def)}${ring('SHOOTING', p.shooting, RING_COLORS.sht)}
        ${ring('PASSING', p.playmaking, RING_COLORS.ply)}${ring('REBOUND', p.rebounding, RING_COLORS.reb)}${ring('ATHLETIC', p.athleticism, RING_COLORS.ath)}
      </div>
      <div class="pcard-notes">
        <div><span class="plus">+</span><span>${esc(p.strength)}</span></div>
        <div><span class="minus">–</span><span>${esc(p.weakness)}</span></div>
      </div>
      ${fitOrBench}
    </div>
    <div class="card impact">
      <div class="card-head"><span class="card-title">${six ? 'Bench impact' : 'Projected team impact'}</span><span class="tier-chip" style="--tier:${o.tier.color}">${o.tier.label}</span></div>
      <div class="impact-grid">
        <div class="impact-cell"><b class="num">${proj.overall}</b><span>TEAM OVR</span>${delta(proj.overall, cur?.overall)}</div>
        <div class="impact-cell"><b class="num">${proj.chemistry.score}</b><span>CHEM</span>${delta(proj.chemistry.score, cur?.chemistry.score)}</div>
        <div class="impact-cell"><b class="num">${projPower.toFixed(1)}</b><span>POWER</span>${delta(projPower, curPower, 1)}</div>
        <div class="impact-cell" title="Expected wins before any coaching calls"><b class="num">${o.wins}</b><span>PROJ. WINS</span>${delta(o.wins, curO?.wins)}</div>
      </div>
      ${benchGrid}${chemDiff}
    </div>`;
}

function viewLocked() {
  const s = app.session;
  const m = s.teamMetrics;
  const b = m.benchImpact;
  const six = s.s.sixthMan;
  const chem = [
    ...m.chemistry.bonuses.map((x) => `<div class="plus"><span>${esc(x.reason)}</span><b>+${x.value}</b></div>`),
    ...m.chemistry.penalties.map((x) => `<div class="minus"><span>${esc(x.reason)}</span><b>${x.value}</b></div>`),
  ].join('') || '<div><span>No modifiers — a neutral 70 base</span><b>±0</b></div>';
  return `
  <section class="locked" aria-labelledby="locked-title">
    <div class="flow-head">
      <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (progress is saved)">${icon('x')}</button>
      <div class="flow-title"><div class="kicker">Roster complete · 6 of 6</div></div>
    </div>
    <div class="locked-hero"><h1 id="locked-title">Lineup locked</h1><p>Five starters and a sixth man. Can they run the table?</p></div>
    <div class="locked-grid">
      <div class="card">${court({ roster: s.s.roster, sixthMan: six, name: pname, draftingSix: false, pickable: false, fresh: app.fresh })}</div>
      <div class="col">
        <div class="card">${metricsBlock(m)}</div>
        <div class="card"><div class="card-head"><span class="card-title">Chemistry breakdown</span><span class="chip">${m.chemistry.score}</span></div><div class="chem-list">${chem}</div></div>
        ${b && six ? `<div class="card"><div class="card-head"><span class="card-title">Sixth man</span><span class="chip gold">+${b.powerBonus.toFixed(2)} power</span></div>
          <div class="team-stats"><div class="metric-cell"><b>${b.scoring}</b><span>SCORING</span></div><div class="metric-cell"><b>${b.positionalCoverage}</b><span>COVERAGE</span></div><div class="metric-cell"><b>${b.fatigueRelief}</b><span>FATIGUE</span></div><div class="metric-cell"><b>${six.overall}</b><span>OVR</span></div></div></div>` : ''}
        <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="tip-off">${icon('play')} Tip off the 82-game season</button></div>
      </div>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// SEASON
// ---------------------------------------------------------------------------

const runner = {
  timer: null,
  paused: false,
  stop() { clearTimeout(this.timer); this.timer = null; },
  delay() {
    const d = app.settings.get('fastSim') ? 48 : 260;
    return reducedMotion() ? Math.min(d, 80) : d;
  },
  schedule(ms = this.delay()) {
    this.stop();
    if (this.paused) return;
    this.timer = setTimeout(() => { this.timer = null; this.step(); }, ms);
  },
  step() {
    const s = app.session;
    if (app.route !== 'season' || s.phase !== PHASES.simulating || this.paused) return;
    const locked = s.pendingLockedMoment;
    if (locked) { openCoaching(locked, true); return; }
    const moment = s.nextCoachingMoment();
    if (moment) { openCoaching(moment, false); return; }
    if (s.s.revealedGameCount >= 82) { finishSeason(); return; }
    s.markGameRevealed(s.s.revealedGameCount + 1);
    updateSeason(true);
    if (s.s.revealedGameCount % 10 === 0) { haptic(8); sound.tick(); }
    this.schedule();
  },
};

function viewSeason() {
  const s = app.session;
  const done = s.phase === PHASES.completed;
  const fast = app.settings.get('fastSim');
  const m = s.teamMetrics;
  const b = m.benchImpact;
  const six = s.s.sixthMan;

  const map = STRETCHES.map(([a, z, mid], i) => {
    const cells = [];
    for (let n = a; n <= z; n++) cells.push(`<i class="cell" data-n="${n}"></i>`);
    return `<div class="stretch"><div class="stretch-head"><span>G${a}–${z} · <span id="st-rec-${i}" class="num">0-0</span></span><em id="st-call-${i}">${mid ? '' : 'Opening stretch'}</em></div><div class="cells">${cells.join('')}</div></div>`;
  }).join('');

  const marks = E.COACHING_MOMENTS.map((mo) => `<span class="route-mark" id="mark-${mo.id}" style="left:${(mo.checkpoint / 82) * 100}%"><span>G${mo.checkpoint}</span></span>`).join('');

  return `
  <section class="season" aria-labelledby="season-title">
    <div class="season-head">
      <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (season is saved)">${icon('x')}</button>
      <div class="flow-title"><div class="kicker">Season strategy room</div><h1 id="season-title">${done ? 'Final record' : 'Regular season'}</h1></div>
      <div class="season-controls">
        <span class="chip orange live" id="live-chip"><span class="dot"></span><span id="live-text">LIVE</span></span>
        ${done ? '' : `<div class="seg" role="group" aria-label="Simulation speed">
          <button data-act="speed" data-fast="0" aria-pressed="${!fast}">Watch</button><button data-act="speed" data-fast="1" aria-pressed="${fast}">Fast</button></div>
          <button class="icon-btn" data-act="pause" id="pause-btn" aria-label="Pause">${icon('pause')}</button>`}
      </div>
    </div>
    <div id="final-slot">${done ? htmlFinal() : ''}</div>
    <div class="season-layout">
      <div class="col">
        <div class="scoreboard">
          ${BOARD_LINES}
          <div class="kicker muted" style="position:relative">82-GAME OPERATIONS BOARD</div>
          <div class="record" aria-live="off">
            <div class="record-col"><span class="record-num w" id="sb-w">0</span><span class="record-label">WINS</span></div>
            <span class="record-dash">–</span>
            <div class="record-col"><span class="record-num l zero" id="sb-l">0</span><span class="record-label">LOSSES</span></div>
          </div>
          <span class="chip sb-status" id="sb-status">SCOUTING THE OPENING MATCHUP</span>
          <div class="route"><div class="route-head"><span>SEASON ROUTE</span><b id="route-pct">0%</b></div>
            <div class="route-track"><div class="route-fill" id="route-fill"></div>${marks}</div></div>
        </div>
        <div class="card season-map">
          <div class="card-head"><span class="card-title">Season map</span><span class="map-legend"><span><i style="background:var(--win)"></i>Win</span><span><i style="background:var(--loss)"></i>Loss</span></span></div>
          ${map}
        </div>
        <div id="spotlight"></div>
      </div>
      <div class="col">
        <div class="card"><div class="card-head"><span class="card-title">Recent results</span><span class="chip" id="nb-count">LAST 0</span></div><div class="notebook" id="notebook"></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Season decisions</span><span class="chip gold" id="dec-count">0 / 3 CALLED</span></div><div class="decisions" id="decisions"></div></div>
        <div class="card"><div class="card-head"><span class="card-title">Your team</span><span class="chip">POWER ${E.teamPower(m).toFixed(1)}</span></div>
          <div class="team-stats">
            <div class="metric-cell"><b>${m.overall}</b><span>OVR</span></div><div class="metric-cell"><b>${m.offense}</b><span>OFF</span></div>
            <div class="metric-cell"><b>${m.defense}</b><span>DEF</span></div><div class="metric-cell"><b>${m.chemistry.score}</b><span>CHEM</span></div>
            <div class="metric-cell"><b>${m.shooting}</b><span>SHT</span></div><div class="metric-cell"><b>${m.rebounding}</b><span>REB</span></div>
            <div class="metric-cell"><b>${m.playmaking}</b><span>PLY</span></div><div class="metric-cell"><b>${m.benchImpact ? '+' + m.benchImpact.powerBonus.toFixed(1) : '—'}</b><span>BENCH</span></div>
          </div>
          ${b && six ? `<div class="six-line"><b>SIXTH MAN · ${esc(pname(six))}</b>Scoring ${b.scoring} · Coverage ${b.positionalCoverage} · Fatigue ${b.fatigueRelief}</div>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function statusOf(W, L, n, streak, done) {
  if (done) return ['REGULAR SEASON COMPLETE', 'gold'];
  if (L === 0 && n >= 10) return ['PERFECT SEASON WATCH', 'gold'];
  if (streak >= 5) return [`${streak}-GAME WIN STREAK`, 'win'];
  if (n === 0) return ['SCOUTING THE OPENING MATCHUP', ''];
  return [`GAME ${n} OF 82 IN THE BOOKS`, ''];
}

function updateSeason(newGame = false) {
  const s = app.session;
  const games = s.revealedGames;
  const n = games.length;
  const W = games.filter((g) => g.won).length;
  const L = n - W;
  const done = s.phase === PHASES.completed;
  const streak = E.activeStreak(games);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  set('sb-w', W);
  set('sb-l', L);
  $('#sb-l')?.classList.toggle('zero', L === 0);
  const [status, tone] = statusOf(W, L, n, Math.max(0, streak), done);
  const st = $('#sb-status');
  if (st) { st.textContent = status; st.className = `chip sb-status ${tone}`; }
  set('route-pct', `${Math.round((n / 82) * 100)}%`);
  const fill = $('#route-fill');
  if (fill) fill.style.width = `${(n / 82) * 100}%`;
  for (const mo of E.COACHING_MOMENTS) $(`#mark-${mo.id}`)?.classList.toggle('done', s.s.coachingDecisions.some((d) => d.moment === mo.id));

  // live chip
  const chip = $('#live-chip');
  if (chip) {
    const dlgOpen = $('#coach-dialog')?.open;
    const label = done ? 'FINAL' : dlgOpen ? 'COACH CALL' : runner.paused ? 'PAUSED' : 'LIVE';
    chip.className = `chip ${done ? 'gold' : dlgOpen ? 'gold' : runner.paused ? '' : 'orange live'}`;
    set('live-text', label);
  }

  // season map
  const cells = $$('.cell');
  for (const c of cells) {
    const g = games[Number(c.dataset.n) - 1];
    c.className = `cell${g ? (g.won ? ' W' : ' L') : ''}${g && g.n === n && !done ? ' last' : ''}`;
  }
  STRETCHES.forEach(([a, z, mid], i) => {
    const part = games.slice(a - 1, z);
    const w = part.filter((g) => g.won).length;
    set(`st-rec-${i}`, `${w}-${part.length - w}`);
    if (mid) {
      const d = s.s.coachingDecisions.find((x) => x.moment === mid);
      set(`st-call-${i}`, d ? d.title : '');
    }
  });

  // spotlight
  const last = games[n - 1];
  const spot = $('#spotlight');
  if (spot) spot.innerHTML = spotlightHtml(last, done);

  // notebook
  const nb = $('#notebook');
  if (nb) {
    const recent = games.slice(-8).reverse();
    nb.innerHTML = recent.length ? recent.map((g, i) => `<div class="nb-row ${g.won ? 'W' : 'L'}${i === 0 && newGame ? ' new' : ''}">
      <span class="nb-num">${String(g.n).padStart(2, '0')}</span>
      <span class="nb-main"><b>${g.won ? 'WIN RECORDED' : 'LOSS RECORDED'}</b><span>vs ${esc(oppName(g.team))} · OPP ${g.opp}</span></span>
      <span class="nb-score">${g.us}-${g.them}</span><span class="nb-margin">${signed(g.us - g.them)}</span></div>`).join('')
      : '<div class="empty">Preparing the opening matchup…</div>';
    set('nb-count', `LAST ${recent.length}`);
  }

  // decisions
  const dec = $('#decisions');
  if (dec) {
    const next = E.COACHING_MOMENTS.find((mo) => !s.s.coachingDecisions.some((d) => d.moment === mo.id));
    dec.innerHTML = E.COACHING_MOMENTS.map((mo) => {
      const d = s.s.coachingDecisions.find((x) => x.moment === mo.id);
      return `<div class="decision${d ? ' made' : ''}"><i>G${mo.checkpoint}</i><div><b>${esc(d ? d.title : mo.title)}</b><span>${d ? `${esc(d.summary)} · games ${mo.checkpoint + 1}–${mo.endGame}` : mo === next ? `Up next after game ${mo.checkpoint}` : `Unlocks after game ${mo.checkpoint}`}</span></div></div>`;
    }).join('');
    set('dec-count', `${s.s.coachingDecisions.length} / 3 CALLED`);
  }
}

function spotlightHtml(g, done) {
  if (!g) {
    return `<div class="spotlight"><span class="spot-icon">${icon('scope')}</span><div class="spot-text"><small>NEXT MATCHUP</small><b>Coaches are reviewing the tape</b><span>Opening night is on deck</span></div><div></div></div>`;
  }
  const head = done ? `Season closed on Game ${g.n}` : g.won ? `Game ${g.n} secured` : `Game ${g.n} goes to the opponent`;
  return `<div class="spotlight${g.won ? '' : ' loss'}"><span class="spot-icon">${icon(g.won ? 'up' : 'down')}</span>
    <div class="spot-text"><small>LATEST FINAL</small><b>${head}</b><span>vs ${esc(oppName(g.team))} · opponent rating ${g.opp}</span></div>
    <div class="spot-score"><b>${g.us}-${g.them}</b><span style="color:${g.won ? 'var(--win)' : 'var(--loss)'}">${signed(g.us - g.them)}</span></div></div>`;
}

function mountSeason() {
  updateSeason(false);
  const s = app.session;
  if (s.phase === PHASES.completed) return;
  runner.paused = false;
  syncPauseButton();
  const locked = s.pendingLockedMoment;
  const moment = locked || s.nextCoachingMoment();
  if (moment) { openCoaching(moment, !!locked); return; }
  runner.schedule(s.s.revealedGameCount === 0 ? 700 : 350);
}

function syncPauseButton() {
  const b = $('#pause-btn');
  if (!b) return;
  b.innerHTML = icon(runner.paused ? 'play' : 'pause');
  b.setAttribute('aria-label', runner.paused ? 'Resume' : 'Pause');
}

function openCoaching(moment, locked) {
  runner.stop();
  const d = dialog('coach-dialog');
  d.oncancel = (e) => e.preventDefault();
  d.innerHTML = htmlCoach(moment, locked);
  if (!d.open) { d.showModal(); sound.coach(); haptic([12, 40, 12]); }
  updateSeason(false);
}

function htmlCoach(moment, locked) {
  const s = app.session;
  const games = s.revealedGames;
  const W = games.filter((g) => g.won).length;
  const m = s.teamMetrics;
  let body;
  if (locked) {
    const d = s.s.coachingDecisions[s.s.coachingDecisions.length - 1];
    body = `<div class="locked-call"><div class="seal">${icon('seal')}</div><div class="kicker">CALL LOCKED</div><h3>${esc(d.title)}</h3><p>${esc(d.summary)}. Games ${moment.checkpoint + 1}–${moment.endGame} have been re-planned.</p></div>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-xl" data-act="coach-continue" data-moment="${moment.id}">${icon('play')} Continue season</button>
        ${s.s.hasUsedSecondChance ? '' : `<button class="btn btn-gold" data-act="second-chance" data-moment="${moment.id}">${icon('refresh')} Second chance <span class="badge-count">1 per season</span></button>`}
      </div>`;
  } else {
    body = `<div class="kicker muted" style="margin-bottom:10px">CALL THE PLAN</div><div class="options">${moment.options.map((o, i) => `
      <button class="option" data-act="coach-pick" data-moment="${moment.id}" data-opt="${o.id}">
        <span class="option-icon">${icon(o.icon)}</span>
        <span><span class="option-top"><b>${esc(o.title)}</b><span><span class="chip orange">${o.impact}</span> <kbd>${i + 1}</kbd></span></span><p>${esc(o.detail)}</p></span>
      </button>`).join('')}</div>`;
  }
  return `<div class="sheet-body">
    <div class="kicker">${moment.chapter}</div>
    <h2>${esc(moment.title)}</h2>
    <p>${esc(moment.prompt)}</p>
    <div class="sheet-metrics"><div><b class="num">${W}-${games.length - W}</b><span>RECORD</span></div><div><b>${m.overall}</b><span>TEAM</span></div><div><b>${m.chemistry.score}</b><span>CHEM</span></div></div>
    ${body}
  </div>`;
}

function finishSeason() {
  const s = app.session;
  s.completeSimulation();
  ensureRecorded();
  const wins = s.s.simulationResult.wins;
  const slot = $('#final-slot');
  if (slot) slot.innerHTML = htmlFinal();
  $('.seg')?.remove();
  $('#pause-btn')?.remove();
  const title = $('#season-title');
  if (title) title.textContent = 'Final record';
  updateSeason(false);
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  sound.finale(wins);
  haptic(wins >= 65 ? [30, 60, 30, 60, 80] : 40);
  if (wins >= 82) { confetti({ count: 260, duration: 4800 }); setTimeout(() => confetti({ count: 180 }), 900); } else if (wins >= 65) confetti();
}

const FINAL_LINES = {
  perfect: 'Eighty-two up, eighty-two down. You did the impossible.',
  legendary: 'A season for the history books.',
  elite: 'Dominant. Just short of immortal.',
  contender: 'A real contender — but the ceiling is higher.',
  average: 'A .500 kind of year. Back to the draft board.',
  below: 'Rebuilding year. Every dynasty starts somewhere.',
};

function htmlFinal() {
  const s = app.session;
  const games = s.s.simulationResult.games;
  const sum = E.seasonSummary(games);
  const tier = E.tierFor(sum.wins);
  const perfect = sum.wins === 82;
  const gameLabel = (g) => (g ? `${signed(g.us - g.them)} <small style="color:var(--text-3);font-size:12px">G${g.n}</small>` : '—');
  const calls = s.s.coachingDecisions.map((d) => `<span class="chip gold">${esc(d.title)}</span>`).join('');
  return `<div class="final" style="--tier:${tier.color}">
    <span class="final-tier">${icon(perfect ? 'crown' : 'trophy')} ${tier.label}</span>
    <div class="final-record${perfect ? ' perfect' : ''}">${sum.wins}-${sum.losses}</div>
    <p class="final-line">${FINAL_LINES[tier.key]}</p>
    <div class="final-stats">
      <div><b>${sum.longestWinStreak}</b><span>LONGEST STREAK</span></div>
      <div><b>${signed(sum.averageMargin, 1)}</b><span>AVG MARGIN</span></div>
      <div><b>${gameLabel(sum.bestWin)}</b><span>BEST WIN</span></div>
      <div><b>${gameLabel(sum.worstLoss)}</b><span>WORST LOSS</span></div>
    </div>
    ${calls ? `<div class="final-calls">${calls}</div>` : ''}
    <div class="final-actions">
      <button class="btn btn-primary btn-xl" data-act="new-draft-now">${icon('ball')} Continue drafting</button>
      <div class="row">
        ${s.s.hasUsedRunItBack
    ? `<button class="btn btn-secondary" disabled>${icon('repeat')} Run it back used</button>`
    : `<button class="btn btn-gold" data-act="run-it-back">${icon('repeat')} Run it back <span class="badge-count">1 left</span></button>`}
        <button class="btn btn-secondary" data-act="share">${icon('share')} Share result</button>
      </div>
      <button class="btn btn-ghost" data-act="home-reset">${icon('home')} Back to home</button>
    </div>
    <div class="final-promo">Chase 82-0 anywhere — <a href="${APP_STORE_URL}" target="_blank" rel="noopener noreferrer">get the iPhone &amp; iPad app</a></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

function shareText(run) {
  const tier = E.tierFor(run.wins);
  const rows = STRETCHES.map(([a, z]) => run.grid.slice(a - 1, z).split('').map((c) => (c === 'W' ? '🟩' : '🟥')).join(''));
  const url = `${location.origin}${location.pathname}`;
  return `82-0 🏀 ${run.wins}-${run.losses} · ${tier.label}\n${rows.join('\n')}\n${run.overall} OVR · ${run.chemistry} CHEM\nCan you go 82-0? ${url}`;
}

async function share(run) {
  const text = shareText(run);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Result copied — paste it anywhere');
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Could not share from this browser');
  }
}

function currentRunForShare() {
  const s = app.session;
  const res = s.s.simulationResult;
  return { wins: res.wins, losses: res.losses, overall: s.teamMetrics.overall, chemistry: s.teamMetrics.chemistry.score, grid: res.games.map((g) => (g.won ? 'W' : 'L')).join('') };
}

// ---------------------------------------------------------------------------
// HISTORY / TROPHIES / SETTINGS
// ---------------------------------------------------------------------------

function viewHistory() {
  const f = app.historyFilter;
  const runs = app.history.runs.filter((r) => (f === 'perfect' ? r.isPerfect : f === '70' ? r.wins >= 70 : true));
  const btn = (key, label) => `<button data-act="filter" data-f="${key}" aria-pressed="${f === key}">${label}</button>`;
  return `
  <div class="page-head"><div><div class="kicker">Records</div><h1>Season history</h1><p>${app.history.runs.length} seasons on file · best ${app.history.stats.bestRecord}</p></div>
    <div class="filters" role="group" aria-label="Filter seasons">${btn('all', 'All')}${btn('perfect', '82-0')}${btn('70', '70+ Wins')}</div></div>
  ${runs.length ? `<div class="run-list">${runs.map(runRow).join('')}</div>`
    : `<div class="card empty"><b>${app.history.runs.length ? 'No seasons match this filter' : 'No seasons recorded yet'}</b>${app.history.runs.length ? 'Keep drafting — history is made one season at a time.' : 'Finish an 82-game season and it will be saved here.'}</div>`}`;
}

function openRunDetail(id) {
  const run = app.history.runs.find((r) => r.id === id);
  if (!run) return;
  const tier = E.tierFor(run.wins);
  const players = [...['PG', 'SG', 'SF', 'PF', 'C'].map((pos) => [pos, run.roster?.[pos]]), ['SIX', run.sixthMan]].filter(([, p]) => p);
  const d = dialog('run-dialog');
  d.innerHTML = `<div class="sheet-body">
    <div class="detail-head"><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span><button class="icon-btn" data-act="close-dialog" aria-label="Close">${icon('x')}</button></div>
    <div class="detail-rec" style="color:${tier.color}">${run.wins}-${run.losses}</div>
    <p>${fmtDate(run.date, true)}</p>
    <div class="sheet-metrics"><div><b>${run.overall}</b><span>TEAM OVR</span></div><div><b>${run.chemistry}</b><span>CHEM</span></div><div><b>${run.longestStreak}</b><span>STREAK</span></div></div>
    <div class="mini-map" aria-label="Game by game results">${run.grid.split('').map((c) => `<i class="${c}"></i>`).join('')}</div>
    <div class="roster-list">${players.map(([pos, p]) => { const n = pname(p); return `<div class="roster-item">${avatar(n, pos)}<div><b>${esc(n)}</b><span>${esc(p.archetype)}</span></div><span class="rr">${posBadge(pos).replace('>SIX<', '>6TH<')}<span class="r">${p.overall}</span></span></div>`; }).join('')}</div>
    ${run.decisions?.length ? `<div class="final-calls">${run.decisions.map((x) => `<span class="chip gold">${esc(x.title)}</span>`).join('')}</div>` : ''}
    <div class="sheet-actions"><button class="btn btn-secondary" data-act="share-run" data-id="${esc(run.id)}">${icon('share')} Share this season</button></div>
  </div>`;
  d.onclick = (e) => { if (e.target === d) d.close(); };
  d.oncancel = null;
  d.showModal();
}

function viewTrophies() {
  const list = achievements(app.history);
  const on = list.filter((a) => a.unlocked).length;
  const iconFor = { ball: 'ball', shield: 'shield', flame: 'flame', sparkles: 'sparkles', crown: 'crown', bolt: 'bolt', repeat: 'repeat' };
  return `
  <div class="page-head"><div><div class="kicker">Trophy case</div><h1>Achievements</h1><p>Earned from your saved seasons on this device.</p></div></div>
  <div class="trophy-summary"><b>${on}/${list.length}</b><div style="flex:1"><span>trophies unlocked</span><div class="bar" style="margin-top:8px"><i style="--v:${(on / list.length) * 100}%"></i></div></div></div>
  <div class="trophies">${list.map((a) => `<div class="trophy${a.unlocked ? ' on' : ''}">
    <span class="trophy-icon">${icon(iconFor[a.icon] || 'trophy')}</span>
    <div><b>${esc(a.title)}</b><p>${esc(a.description)}</p>
    ${a.unlocked ? '<div class="t-prog"><span class="chip gold">Unlocked</span></div>' : `<div class="t-prog"><div class="bar"><i style="--v:${a.progress * 100}%"></i></div><span>${a.progressLabel}</span></div>`}</div>
  </div>`).join('')}</div>`;
}

function viewSettings() {
  const st = app.settings;
  const sw = (key, label, sub) => `<div class="set-row"><div><b>${label}</b><span>${sub}</span></div><button class="switch" role="switch" aria-checked="${!!st.get(key)}" aria-label="${label}" data-act="toggle" data-key="${key}"></button></div>`;
  const inProgress = app.session.phase !== PHASES.idle;
  return `
  <div class="page-head"><div><div class="kicker">Preferences</div><h1>Settings</h1></div></div>
  <div class="settings">
    <section class="set-group"><h2>GAMEPLAY</h2>
      ${sw('fastSim', 'Fast simulation', 'Start every season in Fast mode instead of Watch mode')}
      ${sw('sound', 'Sound effects', 'Subtle cues for picks, coaching calls and the final buzzer')}
      ${canVibrate() ? sw('haptics', 'Vibration', 'Haptic ticks every ten games on supported phones') : ''}
      <div class="set-row"><div><b>Player &amp; team names</b><span>${app.identity.realNames ? 'Real names' : 'Fictional identities'} — matches the 82-0 iOS app</span></div></div>
    </section>
    <section class="set-group"><h2>DATA</h2>
      ${inProgress ? `<div class="set-row"><div><b>Abandon current run</b><span>Clears the draft or season in progress</span></div><button class="btn btn-secondary" data-act="abandon">Abandon</button></div>` : ''}
      <div class="set-row"><div><b>Delete season history</b><span>${app.history.runs.length} saved season${app.history.runs.length === 1 ? "" : "s"} on this device</span></div><button class="btn btn-secondary danger" data-act="clear-history" ${app.history.runs.length ? '' : 'disabled'}>${icon('trash')} Delete</button></div>
    </section>
    <section class="set-group"><h2>ABOUT</h2>
      <a class="set-row" href="${APP_STORE_URL}" target="_blank" rel="noopener noreferrer"><div><b>Get 82-0 for iPhone &amp; iPad</b><span>Game Center leaderboards and achievements</span></div>${icon('external', 'chev')}</a>
      <a class="set-row" href="../support/"><div><b>Support</b><span>Questions, feedback and bug reports</span></div>${icon('arrow')}</a>
      <a class="set-row" href="../privacy/"><div><b>Privacy policy</b><span>The web edition stores your progress only in this browser</span></div>${icon('arrow')}</a>
    </section>
  </div>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function act(name, el) {
  const s = app.session;
  const mod = gameModule();
  if (mod && name.startsWith(mod.prefix)) {
    await mod.act(name, el);
    return;
  }
  switch (name) {
    case 'switch-game': switchGame(el.dataset.game); break;
    case 'toggle-sidebar': {
      const open = document.body.classList.toggle('sidebar-open');
      $('.sidebar-toggle')?.setAttribute('aria-expanded', String(open));
      break;
    }
    case 'close-sidebar':
      document.body.classList.remove('sidebar-open');
      $('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
      break;
    case 'nav': go(el.dataset.to); break;
    case 'play': s.startDraft(); sound.tap(); go('draft'); break;
    case 'new-draft': {
      const ok = await confirmDialog({ title: 'Start a new draft?', body: 'Your current draft or season in progress will be cleared.', confirm: 'Start new draft', danger: true });
      if (ok) { s.startDraft(); go('draft'); }
      break;
    }
    case 'new-draft-now': ensureRecorded(); s.startDraft(); sound.tap(); go('draft'); break;
    case 'home-reset': ensureRecorded(); s.resetToIdle(); go('home'); break;

    case 'choose-pos':
      if (app.busy) break;
      s.choosePosition(el.dataset.pos); sound.tap(); render(false);
      break;
    case 'spin': spin(); break;
    case 'respin':
      if (!app.busy && s.scoutAgain()) { app.autoSpin = true; render(false); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
      break;
    case 'scout-players': s.scoutPlayers(); sound.tap(); render(false); break;
    case 'select-player': {
      const p = s.s.committedReport?.eligiblePlayers.find((x) => x.id === el.dataset.id);
      if (p) selectPlayer(p, true);
      break;
    }
    case 'draft': draftPlayer(); break;
    case 'tip-off':
      if (s.beginSimulation()) { sound.whistle(); haptic(20); go('season'); }
      break;

    case 'speed': {
      const fast = el.dataset.fast === '1';
      app.settings.set('fastSim', fast);
      for (const b of $$('.seg button')) b.setAttribute('aria-pressed', String((b.dataset.fast === '1') === fast));
      if (runner.timer) runner.schedule();
      break;
    }
    case 'pause': togglePause(); break;
    case 'coach-pick': {
      const moment = E.momentById(el.dataset.moment);
      const option = moment?.options.find((o) => o.id === el.dataset.opt);
      if (moment && option && s.applyCoachingOption(option, moment)) {
        sound.stamp(); haptic(25);
        $('#coach-dialog').innerHTML = htmlCoach(moment, true);
        updateSeason(false);
      }
      break;
    }
    case 'second-chance': {
      const moment = E.momentById(el.dataset.moment);
      if (moment && s.useSecondChance(moment)) {
        sound.open();
        $('#coach-dialog').innerHTML = htmlCoach(moment, false);
        updateSeason(false);
        toast('Call rewound — make a new one');
      }
      break;
    }
    case 'coach-continue': {
      const moment = E.momentById(el.dataset.moment);
      if (moment) s.finalizeCoachingDecision(moment);
      $('#coach-dialog')?.close();
      runner.paused = false;
      syncPauseButton();
      updateSeason(false);
      runner.schedule(250);
      break;
    }
    case 'run-it-back':
      if (s.runItBack() && s.beginSimulation()) { sound.whistle(); toast('Same roster. New timeline.'); render(true); }
      break;
    case 'share': share(currentRunForShare()); break;
    case 'share-run': { const run = app.history.runs.find((r) => r.id === el.dataset.id); if (run) share(run); break; }

    case 'run-detail': openRunDetail(el.dataset.id); break;
    case 'close-dialog': el.closest('dialog')?.close(); break;
    case 'filter': app.historyFilter = el.dataset.f; render(false); break;
    case 'toggle': {
      const key = el.dataset.key;
      app.settings.set(key, !app.settings.get(key));
      el.setAttribute('aria-checked', String(!!app.settings.get(key)));
      if (key === 'sound') sound.tap();
      if (key === 'haptics') haptic(15);
      break;
    }
    case 'abandon': {
      const ok = await confirmDialog({ title: 'Abandon this run?', body: 'The current draft or season will be cleared. Saved history stays.', confirm: 'Abandon run', danger: true });
      if (ok) { ensureRecorded(); s.resetToIdle(); render(false); toast('Run cleared'); }
      break;
    }
    case 'clear-history': {
      const ok = await confirmDialog({ title: 'Delete all seasons?', body: 'This removes every saved season and resets your trophies on this device. It cannot be undone.', confirm: 'Delete history', danger: true });
      if (ok) { app.history.clear(); render(false); toast('Season history deleted'); }
      break;
    }
    default: break;
  }
}

/**
 * Spins both reels. The outcome is the report already generated and persisted
 * for this pick, so a refresh mid-spin lands on the same team and era.
 */
async function spin() {
  const s = app.session;
  if (app.busy || s.phase !== PHASES.choosingReport) return;
  const report = s.s.reports[s.s.selectedReportIndex];
  if (!report) return;
  app.busy = true;
  const btn = $('#spin-btn');
  if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
  $$('.strip-slot.pickable, .tok[data-act="choose-pos"]').forEach((b) => { b.disabled = true; });
  haptic(12);

  const teamCab = $('.reel-cab.team');
  const eraCab = $('.reel-cab.era');
  if (teamCab && eraCab && !reducedMotion() && typeof Element.prototype.animate === 'function') {
    sound.spinStart();
    const [tp, tn] = neighbours(app.db.teams, report.team);
    const [ep, en] = neighbours(app.db.eras, report.era);
    const teamFill = E.shuffled(app.db.teams.filter((t) => t.id !== report.team.id)).slice(0, 22);
    const eraStart = Math.floor(Math.random() * app.db.eras.length);
    const eraFill = Array.from({ length: 26 }, (_, i) => app.db.eras[(eraStart + i) % app.db.eras.length]);
    await Promise.all([
      animateReel(teamCab, [teamItem(tp), teamItem(report.team, true), teamItem(tn), ...teamFill.map((t) => teamItem(t))], 1900),
      animateReel(eraCab, [eraItem(ep), eraItem(report.era, true), eraItem(en), ...eraFill.map((e) => eraItem(e))], 2650),
    ]);
    await new Promise((r) => setTimeout(r, 180));
  }

  app.busy = false;
  if (s.phase !== PHASES.choosingReport) return;
  s.openSelectedReport();
  app.justLanded = true;
  sound.jackpot();
  haptic([18, 50, 18]);
  if (app.route === 'draft') render(false);
}

function selectPlayer(p, fromClick) {
  const s = app.session;
  s.selectPlayer(p);
  for (const row of $$('.prow')) row.setAttribute('aria-selected', String(row.dataset.id === p.id));
  const detail = $('#pdetail');
  if (detail) {
    detail.innerHTML = playerDetail(p);
    const card = $('#pcard');
    card?.classList.add('swap');
  }
  const btn = $('#draft-btn');
  if (btn) btn.innerHTML = draftLabel(p);
  if (fromClick && matchMedia('(max-width: 959px)').matches) {
    const top = detail.getBoundingClientRect().top;
    if (top < 60 || top > innerHeight * 0.5) detail.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  } else {
    $(`.prow[data-id="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'nearest' });
  }
}

function draftPlayer() {
  const s = app.session;
  const p = s.s.selectedPlayer;
  if (!p || s.phase !== PHASES.comparingPlayers) return;
  const role = s.isDraftingSixthMan ? 'sixth man' : s.s.currentPosition;
  s.draftSelectedPlayer();
  app.fresh = p.id;
  sound.draft();
  haptic(18);
  toast(`${pname(p)} drafted · ${role}`);
  if (s.phase === PHASES.rosterComplete) sound.whistle();
  render(false);
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function togglePause() {
  if (app.session.phase !== PHASES.simulating || $('#coach-dialog')?.open) return;
  runner.paused = !runner.paused;
  syncPauseButton();
  if (runner.paused) runner.stop(); else runner.schedule(150);
  updateSeason(false);
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.tagName === 'A' && el.getAttribute('href')) return;
  e.preventDefault();
  act(el.dataset.act, el);
}

function onKey(e) {
  if (e.key === 'Escape' && document.body.classList.contains('sidebar-open')) {
    document.body.classList.remove('sidebar-open');
    $('.sidebar-toggle')?.setAttribute('aria-expanded', 'false');
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (gameModule()) { gameModule().onKey(e); return; }
  const onControl = ['BUTTON', 'A'].includes(e.target.tagName);
  const s = app.session;

  const coach = $('#coach-dialog');
  if (coach?.open) {
    if (/^[123]$/.test(e.key)) $$('.option', coach)[Number(e.key) - 1]?.click();
    return;
  }
  if ($('dialog[open]')) return;

  if (app.route === 'draft') {
    if (s.phase === PHASES.choosingReport) {
      if ((e.key === ' ' || e.key === 'Enter') && !onControl) { e.preventDefault(); spin(); }
    } else if (s.phase === PHASES.reportRevealed && e.key === 'Enter' && !onControl) {
      e.preventDefault(); act('scout-players');
    } else if (s.phase === PHASES.reportRevealed && e.key.toLowerCase() === 'r') {
      act('respin');
    } else if (s.phase === PHASES.comparingPlayers) {
      const list = s.s.committedReport.eligiblePlayers;
      const idx = list.findIndex((p) => p.id === s.s.selectedPlayer?.id);
      if (['ArrowDown', 'ArrowRight', 'j'].includes(e.key)) { e.preventDefault(); selectPlayer(list[Math.min(list.length - 1, idx + 1)], false); }
      else if (['ArrowUp', 'ArrowLeft', 'k'].includes(e.key)) { e.preventDefault(); selectPlayer(list[Math.max(0, idx - 1)], false); }
      else if (e.key === 'Enter' && (!onControl || e.target.id === 'draft-btn')) { e.preventDefault(); draftPlayer(); }
    } else if (s.phase === PHASES.rosterComplete && e.key === 'Enter' && !onControl) {
      e.preventDefault(); act('tip-off');
    }
  } else if (app.route === 'season') {
    if (e.key === ' ' && !onControl) { e.preventDefault(); togglePause(); }
    else if (e.key.toLowerCase() === 'f') $(`.seg button[data-fast="${app.settings.get('fastSim') ? '0' : '1'}"]`)?.click();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function loadData() {
  const get = async (n) => {
    const r = await fetch(new URL(`../data/${n}.json`, import.meta.url));
    if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
    return r.json();
  };
  const [players, teams, eras] = await Promise.all([get('players'), get('teams'), get('eras')]);
  return { players, teams, eras, teamById: new Map(teams.map((t) => [t.id, t])) };
}

/** Returning players of another game (or ?game= links) get that game's splash and accent before data loads. */
function preselectGame() {
  let game = null;
  try { game = new URLSearchParams(location.search).get('game') || JSON.parse(localStorage.getItem('820.web.settings.v1') || '{}').game; } catch { /* storage blocked */ }
  if (!MODULES[game]) return;
  document.body.dataset.game = game;
  const mark = $('.splash-mark');
  if (mark) mark.innerHTML = `${GAME_CATALOG[game].record}<span>-</span>0`;
}

async function boot() {
  const splash = $('#splash');
  preselectGame();
  try {
    app.db = await loadData();
  } catch (err) {
    console.error(err);
    $('.splash-inner', splash).insertAdjacentHTML('beforeend', '<p class="splash-error">The player database could not be loaded. Check your connection and refresh the page.</p>');
    $('.splash-bar', splash)?.remove();
    return;
  }
  app.settings = new Settings();
  initFx(app.settings);
  app.identity = new IdentityConfig();
  app.history = new History();
  app.session = new DraftSession(app.db);
  ensureRecorded();

  // Last game played, or ?game=17-0 / ?game=162-0 from a shared link.
  const wanted = new URLSearchParams(location.search).get('game');
  if (wanted) {
    if (GAME_CATALOG[wanted]?.live) app.settings.set('game', wanted);
    const url = new URL(location.href);
    url.searchParams.delete('game');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  const saved = app.settings.get('game');
  if (GAME_CATALOG[saved]?.live) app.selectedGame = saved;
  if (gameModule()) {
    try { await gameModule().load(); } catch (err) { console.error(err); }
  }

  window.addEventListener('hashchange', onRoute);
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  onRoute();
  requestAnimationFrame(() => splash.classList.add('hide'));
  setTimeout(() => splash.remove(), 700);

  app.identity.refresh().then((changed) => { if (changed && !$('dialog[open]')) render(false); });
}

mountAppSwitcher();
boot();
