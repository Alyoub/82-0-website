/**
 * 17-0 Web — Football controller and views.
 *
 * Home · Draft (spin → reveal → compare → roster locked) · Season (live gamecast,
 * three coaching calls, final record) · History · Trophies · Settings.
 * Data, ratings and the season model come from the 17-0 Football iOS app (fb-engine.js).
 */

import * as F from './fb-engine.js';
import { FootballSession, FootballHistory, FB, footballAchievements } from './fb-session.js';
import { IdentityConfig } from './store.js';
import { esc, icon, hex, ring, ovrRing, signed, delta, initials, lastName } from './ui.js';
import { sound, haptic, confetti, canVibrate } from './fx.js';
import { QMARK_ITEM, BLANK_ITEM, reelCab, animateReel, neighbours } from './reels.js';

export const FB_APP_STORE_URL = 'https://apps.apple.com/us/app/17-0-football-draft-game/id6818844831';
const FB_CONFIG_URL = 'https://alyoub.github.io/17PROV2-config.json';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLES = {
  home: 'Play 17-0 Online – The Football Draft Game',
  draft: 'Draft Room · 17-0',
  season: 'Season · 17-0',
  history: 'Season History · 17-0',
  trophies: 'Trophy Case · 17-0',
  settings: 'Settings · 17-0',
};

const POS_VAR = { QB: '--fb-qb', RB: '--fb-rb', WR: '--fb-wr', TE: '--fb-te', FLEX: '--fb-te', EDGE: '--fb-def', DL: '--fb-def', LB: '--fb-def', CB: '--fb-def', S: '--fb-def', DEF: '--fb-def' };
const pc = (pos) => `var(${POS_VAR[pos] || '--text-3'})`;
const RING = { PASS: '#34d399', AWR: '#ffc726', MOB: '#f59e0b', RUN: '#f59e0b', REC: '#38bdf8', BLK: '#a78bfa', ATH: '#e056fd', COV: '#22d3ee', RUSH: '#f87171', TKL: '#fb923c' };
const FIELD_POS = { DEF: [50, 21], WR: [16, 56], FLEX: [84, 56], QB: [50, 67], RB: [67, 87] };

const FINAL_LINES = {
  perfect: 'Seventeen up, seventeen down. Football perfection.',
  legendary: 'A season they will talk about for decades.',
  elite: 'Dominant. Just short of immortal.',
  contender: 'A real contender — but the ceiling is higher.',
  average: 'A .500 kind of year. Back to the draft board.',
  struggling: 'Long Sundays. Time to rethink the formula.',
  rebuild: 'Rebuilding year. Every dynasty starts somewhere.',
};

export const FOOTBALL_SVG = `<svg viewBox="0 0 120 76" aria-hidden="true">
  <defs>
    <radialGradient id="fb-leather" cx="36%" cy="28%" r="82%">
      <stop offset="0" stop-color="#c47640"/><stop offset="0.5" stop-color="#8a3c18"/><stop offset="1" stop-color="#3f1606"/>
    </radialGradient>
  </defs>
  <path d="M6 38C22 4 98 4 114 38C98 72 22 72 6 38Z" fill="url(#fb-leather)" stroke="#2a0d03" stroke-width="1.6"/>
  <g fill="none" stroke="#f4ede2" stroke-linecap="round">
    <path d="M27 16.5C23.5 27 23.5 49 27 59.5" stroke-width="4.2"/><path d="M93 16.5C96.5 27 96.5 49 93 59.5" stroke-width="4.2"/>
    <path d="M42 38H78" stroke-width="3"/>
    <path d="M47 32.5V43.5M53.5 32V44M60 31.8V44.2M66.5 32V44M73 32.5V43.5" stroke-width="2.6"/>
  </g>
  <ellipse cx="44" cy="20" rx="20" ry="6" fill="#fff" opacity="0.16" transform="rotate(-12 44 20)"/>
</svg>`;

const FIELD_SVG = (() => {
  const top = 46;
  const seg = (380 - top) / 10;
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="0" y="${(top + i * seg).toFixed(1)}" width="300" height="${seg.toFixed(1)}" fill="${i % 2 ? '#0e3f2c' : '#114a34'}"/>`).join('');
  const lines = Array.from({ length: 9 }, (_, i) => {
    const y = (top + (i + 1) * seg).toFixed(1);
    const n = [10, 20, 30, 40, 50, 40, 30, 20, 10][i];
    return `<path d="M0 ${y}H300"/><text x="24" y="${(+y + 4.5).toFixed(1)}">${n}</text><text x="276" y="${(+y + 4.5).toFixed(1)}">${n}</text>`;
  }).join('');
  const hashes = Array.from({ length: 20 }, (_, i) => {
    const y = (top + (i + 0.5) * (seg / 2)).toFixed(1);
    return `<path d="M112 ${y}h9M179 ${y}h9"/>`;
  }).join('');
  return `<svg class="field-lines" viewBox="0 0 300 380" aria-hidden="true">
    ${stripes}
    <rect x="0" y="0" width="300" height="${top}" fill="#0a5a3c"/>
    <text class="ez" x="150" y="31">17-0</text>
    <g class="yl" stroke="rgba(255,255,255,0.26)" stroke-width="1.5">${lines}</g>
    <g stroke="rgba(255,255,255,0.22)" stroke-width="1.2">${hashes}</g>
    <path d="M0 ${top}H300" stroke="rgba(255,255,255,0.65)" stroke-width="2.5"/>
    <path class="fd" d="M0 138H300"/>
    <path class="los" d="M0 172H300"/>
    <rect x="1" y="1" width="298" height="378" rx="12" fill="none" stroke="rgba(255,255,255,0.32)" stroke-width="2"/>
  </svg>`;
})();

const BOARD_LINES = `<svg class="lines" viewBox="0 0 400 200" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
  <rect x="1" y="1" width="398" height="198" rx="12"/><path d="M40 1v198M360 1v198" stroke-dasharray="5 5"/>
  <path d="M80 1v198M120 1v198M160 1v198M200 1v198M240 1v198M280 1v198M320 1v198" stroke-dasharray="2 8"/>
</svg>`;

export function createFootball(host) {
  let db = null;
  let session = null;
  let history = null;
  let legends = [];
  let loading = null;
  const identity = new IdentityConfig(globalThis.localStorage, { url: FB_CONFIG_URL, cacheKey: 'remote-17-config-v1' });
  const ui = { busy: false, justLanded: false, autoSpin: false, fresh: null, filter: 'all', castTimers: [] };

  const tid = (teamId, era) => F.teamIdentity(teamId, identity.realNames, era);
  const pname = (p) => F.playerName(p, identity.realNames);
  const hidden = () => session?.mode.hidden && session.inDraft;

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  function load() {
    if (db) return Promise.resolve(true);
    if (!loading) {
      loading = (async () => {
        const res = await fetch(new URL('../data/fb-players.json', import.meta.url));
        if (!res.ok) throw new Error(`fb-players.json: ${res.status}`);
        const players = await res.json();
        // Wait briefly for the 17-0 app's name config so the first paint uses the right names.
        await Promise.race([identity.refresh(), sleep(1500)]);
        db = { players, byId: new Map(players.map((p) => [p.id, p])) };
        session = new FootballSession(db);
        history = new FootballHistory();
        legends = draftableLegends();
        ensureRecorded();
        identity.refresh().then((changed) => { if (changed && !$('dialog[open]')) host.render(); });
        return true;
      })().catch((err) => { loading = null; throw err; });
    }
    return loading;
  }

  function draftableLegends() {
    const seen = new Set();
    const out = [];
    for (let r = 1; r <= F.ROUNDS.length; r++) {
      for (const c of F.eligibleContexts(db.players, r)) {
        for (const p of F.generatePool(db.players, r, { team: c.team, era: c.era })) {
          if (!seen.has(p.person)) { seen.add(p.person); out.push(p); }
        }
      }
    }
    return out.sort((a, b) => b.ovr - a.ovr).slice(0, 12);
  }

  function ensureRecorded() {
    if (session.phase === FB.final && !session.s.recorded) {
      history.record(session);
      session.markRecorded();
    }
  }

  // ---------------------------------------------------------------------------
  // Atoms
  // ---------------------------------------------------------------------------

  const fpos = (pos) => `<span class="pos" style="--pc:${pc(pos)}">${pos}</span>`;
  const favatar = (name, pos) => `<span class="avatar" style="--pc:${pc(pos)}" aria-hidden="true">${esc(initials(name))}</span>`;
  const fbadge = (teamId, era, size = '') => { const t = tid(teamId, era); return `<span class="team-badge ${size}" style="--tc:${t.c1};--tc2:${t.c2}" aria-hidden="true">${esc(t.abbr)}</span>`; };
  const youBadge = (size = 'sm') => `<span class="team-badge ${size} you" aria-hidden="true">YOU</span>`;
  const qhex = (size = '') => `<span class="hex t-slate ${size}" aria-label="Rating hidden"><b>?</b><small>OVR</small></span>`;
  const ovr = (p, size = '') => (hidden() ? qhex(size) : hex(p.ovr, size));
  const eraLabel = (id) => F.eraById(id).label;
  const pct = (p) => `${Math.round(p * 100)}%`;

  function qring(label) {
    return `<div class="ring" style="--rc:var(--text-3)"><div class="ring-num"><svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="19"/></svg><b>?</b></div><span>${label}</span></div>`;
  }

  function oddsText(p) {
    if (!(p > 0)) return '—';
    if (p >= 0.1) return pct(p);
    const n = 1 / p;
    if (n > 100000) return '1 in 100K+';
    const r = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
    return `1 in ${r.toLocaleString('en-US')}`;
  }

  const rec = (r) => F.recordText(r);

  /** Five-slot formation on a broadcast-style field. */
  function field({ roster, current = null, fresh = null, hide = false }) {
    const tokens = F.SLOTS.map((slot, i) => {
      const p = roster[i];
      const [x, y] = FIELD_POS[slot];
      const style = `left:${x}%;top:${y}%;--pc:${pc(p ? p.pos : slot)}`;
      if (p) {
        const n = pname(p);
        return `<div class="ftok${fresh === p.id ? ' fresh' : ''}" style="${style}" title="${esc(n)}">
          <span class="tok-rate">${p.pos} ${hide ? '??' : p.ovr}</span>${favatar(n, p.pos)}<span class="tok-name">${esc(lastName(n))}</span></div>`;
      }
      const now = current === slot;
      return `<div class="ftok${now ? ' now' : ''}" style="${style}"><span class="tok-empty">${slot}</span><span class="tok-name">${now ? 'Picking' : 'Open'}</span></div>`;
    }).join('');
    const oline = [38, 44, 50, 56, 62].map((x) => `<i class="ol" style="left:${x}%"></i>`).join('');
    const dline = [41, 47, 53, 59].map((x) => `<i class="dl" style="left:${x}%"></i>`).join('');
    return `<div class="field-wrap"><div class="field">${FIELD_SVG}${oline}${dline}${tokens}</div>
      <p class="field-note">${icon('users')} The other 48 roster spots play as a ${F.BASELINE}-rated supporting cast.</p></div>`;
  }

  function strip({ roster, current }) {
    return `<div class="strip fb-strip" aria-label="Your roster">${F.SLOTS.map((slot, i) => {
      const p = roster[i];
      const now = current === slot && !p;
      const inner = p ? favatar(pname(p), p.pos) : `<span class="s-empty">${now ? '•' : '+'}</span>`;
      return `<div class="strip-slot${now ? ' now' : ''}" style="--pc:${pc(p ? p.pos : slot)}">${inner}<span class="s-pos">${slot}</span></div>`;
    }).join('')}</div>`;
  }

  function metricsBlock(m, { hide = false } = {}) {
    if (!m || !m.count) {
      return `${ovrRing(null)}<p class="chem-note" style="margin-top:10px">Draft your quarterback to see team ratings, chemistry and the season outlook.</p>`;
    }
    if (hide) {
      return `<div class="metrics">${ovrRing(null)}<p class="chem-note">${icon('scope')} Gridiron IQ: ratings, chemistry and projections stay hidden until your roster is locked.</p></div>`;
    }
    const o = F.seasonOutlook(m);
    const tier = F.tierFor(Math.round(o.wins));
    const boosts = m.chemistryBreakdown.filter((b) => b.value > 0).length;
    return `<div class="metrics">
      <div class="metric-top">${ovrRing(Math.round(m.teamRating))}
        <div class="chem"><div class="chem-head"><span>TEAM CHEMISTRY</span><b>${Math.round(m.chemistry)}</b></div>
        <div class="bar"><i style="--v:${m.chemistry}%"></i></div>
        <div class="chem-note">${boosts} boost${boosts === 1 ? '' : 's'} · base 70${m.count < 5 ? ' · locks at 5/5' : ''}</div></div>
      </div>
      <div class="metric-row">
        <div class="metric-cell"><b class="num">${Math.round(m.passing)}</b><span>PASSING</span></div>
        <div class="metric-cell"><b class="num">${Math.round(m.rushing)}</b><span>RUSHING</span></div>
        <div class="metric-cell"><b class="num">${Math.round(m.defense)}</b><span>DEFENSE</span></div>
      </div>
      ${m.count < 5
    ? `<div class="outlook" title="Open slots play at ${F.BASELINE} until you draft them"><div><small>OUTLOOK SO FAR</small><b>~${o.wins.toFixed(1)} wins</b></div><span class="chip">${m.count}/5 DRAFTED</span></div>`
    : `<div class="outlook" title="Expected record before coaching calls"><div><small>PROJECTED RECORD</small><b>~${o.wins.toFixed(1)} wins</b></div><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span></div>`}
      <div class="outlook"><div><small>17-0 ODDS</small><b>${oddsText(o.perfect)}</b></div><span class="odds-hint">${m.count < 5 ? `open slots at ${F.BASELINE}` : 'per season'}</span></div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------------

  function viewHome() {
    const s = session;
    const st = history.stats;
    const mode = s.mode;
    let cta;
    switch (s.phase) {
      case FB.idle:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="fb-play">${icon('ball')} START YOUR FRANCHISE ${icon('arrow')}</button>
          <div class="row"><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a><a class="btn btn-secondary" href="#/trophies">${icon('star')} Trophies</a></div>`;
        break;
      case FB.season:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="season">${icon('play')} RESUME SEASON</button>
          <div class="row"><button class="btn btn-secondary" data-act="fb-new">${icon('refresh')} New draft</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
          <p class="resume-note">Week ${s.s.revealed} of 17 · ${rec(s.record)} · your season is saved</p>`;
        break;
      case FB.final:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="fb-new-now">${icon('ball')} NEW DRAFT ${icon('arrow')}</button>
          <div class="row"><button class="btn btn-secondary" data-act="nav" data-to="season">${icon('trophy')} Last final</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>`;
        break;
      default: {
        const label = s.phase === FB.complete ? 'Roster locked · ready for kickoff' : `Round ${s.s.round} of 5 · ${s.rule.title}`;
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="draft">${icon('play')} CONTINUE DRAFT</button>
          <div class="row"><button class="btn btn-secondary" data-act="fb-new">${icon('refresh')} Start over</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
          <p class="resume-note">${esc(label)} · ${esc(mode.title)}</p>`;
      }
    }

    const modes = s.phase === FB.idle ? `
      <div class="mode-pick" role="radiogroup" aria-label="Game mode">${Object.values(F.MODES).map((md) => `
        <button type="button" role="radio" aria-checked="${md.id === mode.id}" data-act="fb-mode" data-mode="${md.id}"><b>${md.title}</b><span>${md.difficulty}</span></button>`).join('')}
      </div>
      <p class="mode-blurb">${esc(mode.blurb)}</p>` : '';

    const recent = history.runs.slice(0, 5);
    return `
    <section class="home-hero fb-hero" aria-label="17-0 home">
      <div id="home-title" class="wordmark">17-0</div>
      <div class="hero-kicker">DRAFT FIVE LEGENDS · WIN ALL 17</div>
      <p class="hero-sub">Random franchise. Random era. Your call.</p>
      <div class="fb-stage" aria-hidden="true"><div class="fb-turf"></div><div class="fb-tee"></div><div class="fb-float">${FOOTBALL_SVG}</div></div>
      ${modes}
      <div class="hero-cta">${cta}</div>
      <div class="stat-tiles">
        <div class="stat-tile"><b class="num">${st.bestRecord}</b><span>BEST RECORD</span></div>
        <div class="stat-tile gold"><b class="num">${st.perfect}</b><span>17-0 SEASONS</span></div>
        <div class="stat-tile"><b class="num">${st.total}</b><span>TOTAL RUNS</span></div>
      </div>
    </section>

    <div class="home-grid">
      <section class="card" aria-labelledby="fb-loop-title">
        <div class="card-head"><h2 class="card-title" id="fb-loop-title">The core loop</h2><span class="chip">5 picks · 17 games</span></div>
        <div class="loop-steps">
          <div class="loop-step"><i>1</i><b>SPIN</b><span>Random team + era</span></div>
          <div class="loop-step"><i>2</i><b>DRAFT</b><span>QB · RB · WR · FLEX · DEF</span></div>
          <div class="loop-step"><i>3</i><b>COACH</b><span>Three big calls</span></div>
          <div class="loop-step"><i>4</i><b>WIN</b><span>Go 17-0</span></div>
        </div>
        <p class="hint">${icon('info')} Passing, rushing, defense and chemistry decide every drive. Coaching calls tilt the odds.</p>
      </section>
      <section class="card" aria-labelledby="fb-recent-title">
        <div class="card-head"><h2 class="card-title" id="fb-recent-title">Recent seasons</h2>${history.runs.length ? '<a class="chip" href="#/history">View all</a>' : ''}</div>
        ${recent.length ? `<div class="run-list">${recent.map(runRow).join('')}</div>`
          : '<div class="empty"><b>No seasons recorded yet</b>Start your first draft above and chase a perfect 17-0.</div>'}
      </section>
    </div>

    <section class="card fb-legends" aria-labelledby="fb-legends-title">
      <div class="card-head"><h2 class="card-title" id="fb-legends-title">Legends in the draft pool</h2><span class="chip">${db.players.length} players</span></div>
      <div class="legend-row">${legends.map((p) => `<div class="legend">${hex(p.ovr, 'sm')}<div><b>${esc(pname(p))}</b><span>${fpos(p.pos)} ${esc(tid(p.team, p.era).abbr)} · ${eraLabel(p.era)}</span></div></div>`).join('')}</div>
      <p class="hint">${icon('info')} Land the right franchise and era and they are yours. Ratings are original game judgments, not official stats.</p>
    </section>`;
  }

  function runRow(run) {
    const tier = F.tierFor(run.wins);
    const top = run.top ? pname(run.top) : 'Your roster';
    const md = F.modeOf(run.mode);
    return `<button class="run-row" data-act="fb-run-detail" data-id="${esc(run.id)}">
      <span class="run-rec num" style="color:${tier.color}">${rec(run)}</span>
      <span class="run-meta"><b>${esc(top)} &amp; co.</b><span>${fmtDate(run.date)} · ${Math.round(run.teamRating)} TEAM · ${Math.round(run.chemistry)} CHEM${md.id !== 'classic' ? ` · ${md.title}` : ''}</span></span>
      <span class="run-side"><span class="tier-chip" style="--tier:${tier.color}">${run.perfect ? 'PERFECT' : tier.label}</span></span>
    </button>`;
  }

  const fmtDate = (iso, long = false) => new Date(iso).toLocaleDateString(undefined, long
    ? { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

  // ---------------------------------------------------------------------------
  // DRAFT
  // ---------------------------------------------------------------------------

  function viewDraft() {
    const s = session;
    if (s.phase === FB.complete) return viewLocked();
    const stageIdx = { [FB.spin]: 0, [FB.revealed]: 1, [FB.compare]: 2 }[s.phase] ?? 0;
    const stages = ['Spin', 'Reveal', 'Draft'].map((label, i) => {
      const cls = i < stageIdx ? 'done' : i === stageIdx ? 'on' : '';
      const line = i < 2 ? `<li class="stage-line ${i < stageIdx ? 'done' : ''}" aria-hidden="true"></li>` : '';
      return `<li class="stage ${cls}"><i>${i < stageIdx ? icon('check') : i + 1}</i>${label}</li>${line}`;
    }).join('');
    const done = s.s.picks.length;
    const pips = Array.from({ length: 5 }, (_, i) => `<span class="pip${i < done ? ' done' : i === done ? ' now' : ''}"></span>`).join('');
    const roster = s.roster;
    const main = s.phase === FB.spin ? htmlChoose() : s.phase === FB.revealed ? htmlReveal() : htmlCompare();
    const modeChip = s.mode.id !== 'classic' ? ` · ${s.mode.title}` : '';
    return `
    <section class="draft fb-draft" aria-labelledby="draft-title">
      <div class="flow-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Leave draft (progress is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">Round ${s.s.round} of 5${esc(modeChip)}</div><h1 id="draft-title">${esc(s.rule.title)}</h1></div>
        <div class="pips" aria-label="${done} of 5 picks made">${pips}</div>
      </div>
      <ol class="stages" aria-label="Pick progress">${stages}</ol>
      ${strip({ roster, current: s.rule.slot })}
      <div class="draft-grid">
        <div class="draft-main">${main}</div>
        <aside class="draft-aside" aria-label="Your roster">
          <div class="card"><div class="card-head"><span class="card-title">Your formation</span><span class="chip">${done}/5</span></div>${field({ roster, current: s.rule.slot, fresh: ui.fresh, hide: hidden() })}</div>
          <div class="card">${metricsBlock(roster.length ? s.metrics : null, { hide: hidden() })}</div>
        </aside>
      </div>
    </section>`;
  }

  function teamItem(teamId, era, target = false) {
    const t = tid(teamId, era);
    return `<div class="ri${target ? ' target' : ''}"><span class="team-badge" style="--tc:${t.c1};--tc2:${t.c2}">${esc(t.abbr)}</span><span class="ri-name">${esc(t.name)}</span></div>`;
  }

  function eraItem(eraId, target = false) {
    const e = F.eraById(eraId);
    return `<div class="ri${target ? ' target' : ''}"><span class="ri-era">${e.label}</span><span class="ri-sub">${e.start}–${e.end}</span></div>`;
  }

  function slotHtml(ctx, won = false) {
    if (!ctx) {
      return `<div class="slot" aria-hidden="true">
        ${reelCab('team', 'TEAM', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}
        ${reelCab('era', 'ERA', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}</div>`;
    }
    const [tp, tn] = neighbours(F.TEAMS, F.teamById(ctx.team));
    const [ep, en] = neighbours(F.ERAS, F.eraById(ctx.era));
    return `<div class="slot" role="img" aria-label="${esc(tid(ctx.team, ctx.era).name)}, ${eraLabel(ctx.era)}">
      ${reelCab('team', 'TEAM', [teamItem(tp.id, ctx.era), teamItem(ctx.team, ctx.era, true), teamItem(tn.id, ctx.era)], 1, won)}
      ${reelCab('era', 'ERA', [eraItem(ep.id), eraItem(ctx.era, true), eraItem(en.id)], 1, won)}</div>`;
  }

  function roundIntro(rule) {
    switch (rule.slot) {
      case 'FLEX': return 'One random franchise, one random decade. Wide receivers and tight ends who played there both qualify.';
      case 'DEF': return 'One random franchise, one random decade. Edge rushers, linemen, linebackers, corners and safeties all qualify.';
      default: return `One random franchise, one random decade. Every ${rule.title.toLowerCase()} who played there becomes your pool.`;
    }
  }

  function htmlChoose() {
    const rule = session.rule;
    return `
      <div class="phase-head"><h2>Spin for ${esc(rule.need)}</h2><p>${roundIntro(rule)}</p></div>
      ${slotHtml(null)}
      <div class="spin-actions">
        <button class="btn btn-primary spin-btn" data-act="fb-spin" id="fb-spin-btn">${icon('refresh')} SPIN</button>
        ${session.mode.id === 'challenge' ? `<p class="hint">${icon('star')} Challenge mode: nobody rated 95 or higher is in the pool.</p>` : ''}
        <div class="kbd-hint"><span><kbd>Space</kbd> or <kbd>Enter</kbd> spin</span></div>
      </div>`;
  }

  function htmlReveal() {
    const s = session;
    const ctx = s.s.context;
    const t = tid(ctx.team, ctx.era);
    const e = F.eraById(ctx.era);
    const n = s.pool.length;
    const won = ui.justLanded;
    ui.justLanded = false;
    return `
      <div class="phase-head"><h2>${esc(t.name)} · ${e.label}</h2><p>The reels have spoken. Scout the pool and draft one.</p></div>
      ${slotHtml(ctx, won)}
      <div class="spin-result">
        <div class="sr-top">
          ${fbadge(ctx.team, ctx.era, 'lg')}
          <div class="sr-text"><div class="kicker">${esc(s.rule.title)} pool</div><b>${esc(t.name)}</b><span>${e.start} – ${e.end}</span></div>
          <div class="sr-count"><b class="num">${n}</b><span>${n === 1 ? 'PLAYER' : 'PLAYERS'}</span></div>
        </div>
        <div class="sr-actions">
          <button class="btn btn-primary btn-xl" data-act="fb-scout">Scout the players ${icon('arrow')}</button>
          <button class="btn btn-gold" data-act="fb-respin" ${s.canRespin ? '' : 'disabled'}>${icon('refresh')} Respin <span class="badge-count">${s.s.respins} left</span></button>
        </div>
        <div class="kbd-hint"><span><kbd>Enter</kbd> scout the players</span>${s.canRespin ? '<span><kbd>R</kbd> respin</span>' : ''}</div>
      </div>`;
  }

  function htmlCompare() {
    const s = session;
    const ctx = s.s.context;
    const t = tid(ctx.team, ctx.era);
    const pool = s.pool;
    const sel = s.selected;
    const plural = s.rule.slot === 'FLEX' ? 'receivers and tight ends' : s.rule.slot === 'DEF' ? 'defenders' : `${s.rule.title.toLowerCase()}s`;
    return `
      <div class="compare-head">${fbadge(ctx.team, ctx.era)}<div class="t"><b>${esc(t.name)} · ${eraLabel(ctx.era)}</b><span>${pool.length} eligible ${plural} — compare and draft one</span></div>
        ${s.canRespin ? `<button class="btn btn-gold btn-sm" data-act="fb-respin" title="Spin a new team and era">${icon('refresh')} Respin <span class="badge-count">${s.s.respins}</span></button>` : ''}</div>
      <div class="compare-grid">
        <div class="plist" role="listbox" aria-label="Eligible players">${pool.map((p, i) => prow(p, sel?.id === p.id, i)).join('')}</div>
        <div id="pdetail">${playerDetail(sel)}</div>
      </div>
      <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="fb-draft" id="fb-draft-btn">${draftLabel(sel)}</button></div>
      <div class="kbd-hint" style="margin-top:12px"><span><kbd>↑</kbd><kbd>↓</kbd> compare</span><span><kbd>Enter</kbd> draft</span></div>`;
  }

  const draftLabel = (p) => `${icon('check')} Draft ${esc(p ? pname(p) : '')}`;

  function prow(p, selected, i) {
    const n = pname(p);
    const bars = hidden() ? '' : `<span class="mini-bars" aria-hidden="true">${F.displayRatings(p).slice(0, 3).map(([l, v]) => `<span class="mini-bar"><span>${l}</span><i style="--v:${v}%;--bc:${RING[l]}"></i></span>`).join('')}</span>`;
    return `<button class="prow" type="button" role="option" aria-selected="${selected}" data-act="fb-select" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i, 10) * 0.035}s">
      ${ovr(p, 'sm')}
      <span class="prow-main"><span class="prow-name">${esc(n)}</span>
        <span class="prow-sub">${fpos(p.pos)}<span class="arch">${esc(p.arch)} · ${esc(p.seasons)}</span></span></span>
      ${bars}
    </button>`;
  }

  function slotFit(p) {
    const slot = session.rule.slot;
    if (slot === 'FLEX') return p.pos === 'TE' ? 'Tight end in the flex — a target who also blocks' : 'Second wide receiver in the flex slot';
    if (slot === 'DEF') return `${F.POSITION_NAMES[p.pos]} anchoring your defense`;
    return `Starting ${F.POSITION_NAMES[p.pos].toLowerCase()}`;
  }

  function playerDetail(p) {
    if (!p) return '';
    const s = session;
    const n = pname(p);
    const t = tid(p.team, p.era);
    const hide = hidden();
    const rings = F.displayRatings(p).map(([l, v]) => (hide ? qring(l) : ring(l, v, RING[l]))).join('');
    const card = `
      <div class="pcard fb-pcard" id="pcard" style="--tc:${t.c1}">
        <div class="pcard-top">${ovr(p)}<div class="pcard-pos">${fpos(p.pos)}<small>${esc(t.abbr)}</small></div></div>
        <div class="pcard-id">${favatar(n, p.pos)}
          <div class="pcard-name">${esc(n)}</div>
          <div class="era-chip">${eraLabel(p.era)} · ${esc(p.seasons)}</div>
          <div class="pcard-arch">${esc(p.arch)} · ${F.POSITION_NAMES[p.pos]}</div>
        </div>
        <div class="rings fb-rings">${rings}</div>
        <div class="pcard-notes">
          <div><span class="plus">+</span><span>${esc(p.str)}</span></div>
          <div><span class="minus">–</span><span>${esc(p.weak)}</span></div>
        </div>
        <div class="fit-line">${icon('court')} <span>${esc(slotFit(p))}</span></div>
      </div>`;
    if (hide) {
      return `${card}<div class="card impact iq-note">${icon('scope')}<div><b>Gridiron IQ</b><p>Ratings, chemistry and projections stay hidden until your roster is locked. Draft on football knowledge.</p></div></div>`;
    }
    const cur = s.roster.length ? s.metrics : null;
    const proj = s.projected(p);
    const o = F.seasonOutlook(proj);
    const curO = cur ? F.seasonOutlook(cur) : null;
    const tier = F.tierFor(Math.round(o.wins));
    const r = (v) => Math.round(v);
    const before = new Map((cur?.chemistryBreakdown || []).map((b) => [b.key, b]));
    const diffs = proj.chemistryBreakdown
      .map((b) => ({ label: b.label, v: b.value - (before.get(b.key)?.value || 0) }))
      .filter((d) => Math.abs(d.v) >= 0.05)
      .slice(0, 4);
    const unit = (label, now, was) => `<div class="unit"><span>${label}</span><b class="num">${r(now)}</b>${delta(r(now), was == null ? null : r(was))}</div>`;
    return `${card}
      <div class="card impact">
        <div class="card-head"><span class="card-title">Projected team impact</span>${proj.count === 5
    ? `<span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span>`
    : `<span class="chip" title="Open slots play at ${F.BASELINE} until drafted">PICK ${proj.count} OF 5</span>`}</div>
        <div class="impact-grid">
          <div class="impact-cell"><b class="num">${r(proj.teamRating)}</b><span>TEAM</span>${delta(r(proj.teamRating), cur ? r(cur.teamRating) : null)}</div>
          <div class="impact-cell"><b class="num">${r(proj.chemistry)}</b><span>CHEM</span>${delta(r(proj.chemistry), cur ? r(cur.chemistry) : null)}</div>
          <div class="impact-cell" title="Expected wins before coaching calls"><b class="num">${o.wins.toFixed(1)}</b><span>PROJ. WINS</span>${delta(o.wins, curO?.wins, 1)}</div>
          <div class="impact-cell" title="Chance of a perfect 17-0 season"><b class="num odds">${oddsText(o.perfect)}</b><span>17-0 ODDS</span></div>
        </div>
        <div class="units">${unit('PASS', proj.passing, cur?.passing)}${unit('RUSH', proj.rushing, cur?.rushing)}${unit('DEF', proj.defense, cur?.defense)}</div>
        ${diffs.length ? `<div class="chem-list" style="margin-top:12px">${diffs.map((d) => `<div class="${d.v >= 0 ? 'plus' : 'minus'}"><span>${esc(d.label)}</span><b>${signed(d.v, 1)}</b></div>`).join('')}</div>` : ''}
      </div>`;
  }

  function viewLocked() {
    const s = session;
    const m = s.metrics;
    const ev = F.evaluate(m);
    const chem = [
      '<div><span>Base chemistry</span><b>70</b></div>',
      ...m.chemistryBreakdown.map((b) => `<div class="${b.value >= 0 ? 'plus' : 'minus'}"><span>${esc(b.label)}</span><b>${signed(b.value, 1)}</b></div>`),
    ].join('');
    const reveal = s.mode.hidden ? '<span class="chip gold">Ratings revealed</span>' : '';
    return `
    <section class="locked fb-locked" aria-labelledby="locked-title">
      <div class="flow-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (progress is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">Roster complete · 5 of 5${s.mode.id !== 'classic' ? ` · ${esc(s.mode.title)}` : ''}</div></div>
        ${reveal}
      </div>
      <div class="locked-hero"><h1 id="locked-title">Roster locked</h1><p>Five legends and a 48-man supporting cast. Can they run the table?</p></div>
      <div class="locked-grid">
        <div class="card">${field({ roster: s.roster, fresh: ui.fresh })}</div>
        <div class="col">
          <div class="card">${metricsBlock(m)}</div>
          <div class="card"><div class="card-head"><span class="card-title">Scouting report</span></div>
            <div class="scout-report"><div class="plus"><small>BIGGEST STRENGTH</small><b>${esc(ev.strength)}</b></div><div class="minus"><small>BIGGEST WEAKNESS</small><b>${esc(ev.weakness)}</b></div></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Chemistry breakdown</span><span class="chip">${Math.round(m.chemistry)}</span></div><div class="chem-list">${chem}</div></div>
          <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="fb-kickoff">${icon('play')} Kick off the 17-game season</button></div>
        </div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------------------
  // Spin
  // ---------------------------------------------------------------------------

  async function spin() {
    const s = session;
    if (ui.busy || s.phase !== FB.spin || !s.s.context) return;
    const ctx = s.s.context;
    ui.busy = true;
    const btn = $('#fb-spin-btn');
    if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
    haptic(12);
    const teamCab = $('.reel-cab.team');
    const eraCab = $('.reel-cab.era');
    if (teamCab && eraCab && !reducedMotion() && typeof Element.prototype.animate === 'function') {
      sound.spinStart();
      const team = F.teamById(ctx.team);
      const era = F.eraById(ctx.era);
      const [tp, tn] = neighbours(F.TEAMS, team);
      const [ep, en] = neighbours(F.ERAS, era);
      const teamFill = F.shuffled(F.TEAMS.filter((t) => t.id !== team.id)).slice(0, 20);
      const eraStart = Math.floor(Math.random() * F.ERAS.length);
      const eraFill = Array.from({ length: 24 }, (_, i) => F.ERAS[(eraStart + i) % F.ERAS.length]);
      try {
        await Promise.all([
          animateReel(teamCab, [teamItem(tp.id, ctx.era), teamItem(team.id, ctx.era, true), teamItem(tn.id, ctx.era), ...teamFill.map((t) => teamItem(t.id, ctx.era))], 1900),
          animateReel(eraCab, [eraItem(ep.id), eraItem(era.id, true), eraItem(en.id), ...eraFill.map((e) => eraItem(e.id))], 2650),
        ]);
      } catch { /* animation interrupted by navigation */ }
      await sleep(180);
    }
    ui.busy = false;
    if (s.phase !== FB.spin) return;
    s.openContext();
    ui.justLanded = true;
    sound.jackpot();
    haptic([18, 50, 18]);
    if (host.route() === 'draft') host.render();
  }

  function selectPlayer(p, fromClick) {
    if (!session.select(p.id)) return;
    for (const row of $$('.prow')) row.setAttribute('aria-selected', String(row.dataset.id === p.id));
    const detail = $('#pdetail');
    if (detail) {
      detail.innerHTML = playerDetail(p);
      $('#pcard')?.classList.add('swap');
    }
    const btn = $('#fb-draft-btn');
    if (btn) btn.innerHTML = draftLabel(p);
    if (fromClick && matchMedia('(max-width: 959px)').matches) {
      const top = detail.getBoundingClientRect().top;
      if (top < 60 || top > innerHeight * 0.5) detail.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    } else {
      $(`.prow[data-id="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function draftPlayer() {
    const s = session;
    const p = s.selected;
    if (!p || s.phase !== FB.compare) return;
    const slot = s.rule.slot;
    s.draftSelected();
    ui.fresh = p.id;
    sound.draft();
    haptic(18);
    host.toast(`${pname(p)} drafted · ${slot}`);
    if (s.phase === FB.complete) sound.whistle();
    host.render();
    ui.fresh = null;
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------------------------------------------------------------------------
  // SEASON
  // ---------------------------------------------------------------------------

  const fast = () => !!host.settings.get('fbFast');

  const runner = {
    timer: null,
    paused: false,
    stop() {
      clearTimeout(this.timer);
      this.timer = null;
      ui.castTimers.forEach(clearTimeout);
      ui.castTimers = [];
    },
    delay() { return reducedMotion() ? 260 : fast() ? 300 : 1750; },
    schedule(ms = this.delay()) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.paused) return;
      this.timer = setTimeout(() => { this.timer = null; this.step(); }, ms);
    },
    step() {
      const s = session;
      if (host.route() !== 'season' || s.phase !== FB.season || this.paused) return;
      const locked = s.lockedCall;
      if (locked) { openCall(locked, true); return; }
      const due = s.dueCall;
      if (due) { openCall(due, false); return; }
      const g = s.revealNext();
      if (!g) return;
      const done = s.phase === FB.final;
      playGame(g, () => {
        if (done) finishSeason();
        else if (g.n % 4 === 0) haptic(8);
      });
      if (!done) this.schedule();
    },
  };

  function viewSeason() {
    const s = session;
    const done = s.phase === FB.final;
    const m = s.metrics;
    const marks = F.COACHING_CALLS.map((c) => `<span class="route-mark" id="fb-mark-${c.id}" style="left:${(c.checkpoint / 17) * 100}%"><span>W${c.checkpoint}</span></span>`).join('');
    return `
    <section class="season fb-season" aria-labelledby="season-title">
      <div class="season-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (season is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">17-game regular season</div><h1 id="season-title">${done ? 'Final record' : 'Regular season'}</h1></div>
        <div class="season-controls">
          <span class="chip orange live" id="live-chip"><span class="dot"></span><span id="live-text">LIVE</span></span>
          ${done ? '' : `<div class="seg" role="group" aria-label="Simulation speed">
            <button data-act="fb-speed" data-fast="0" aria-pressed="${!fast()}">Watch</button><button data-act="fb-speed" data-fast="1" aria-pressed="${fast()}">Fast</button></div>
            <button class="icon-btn" data-act="fb-pause" id="fb-pause-btn" aria-label="Pause">${icon('pause')}</button>`}
        </div>
      </div>
      <div id="final-slot">${done ? htmlFinal() : ''}</div>
      <div class="season-layout">
        <div class="col">
          <div class="scoreboard fb-board">
            ${BOARD_LINES}
            <div class="kicker muted" style="position:relative">17-GAME OPERATIONS BOARD</div>
            <div class="record" id="fb-record" aria-live="off"></div>
            <span class="chip sb-status" id="sb-status">OPENING KICKOFF</span>
            <div class="route"><div class="route-head"><span>SEASON ROUTE</span><b id="route-pct">0%</b></div>
              <div class="route-track"><div class="route-fill" id="route-fill"></div>${marks}</div></div>
          </div>
          <div id="gamecast">${gamecastHtml(s.revealedGames.at(-1) || null)}</div>
          <div class="card season-map fb-map">
            <div class="card-head"><span class="card-title">Schedule</span><span class="map-legend"><span><i style="background:var(--win)"></i>Win</span><span><i style="background:var(--loss)"></i>Loss</span><span><i style="background:var(--gold)"></i>Tie</span></span></div>
            <div id="fb-weeks"></div>
          </div>
        </div>
        <div class="col">
          <div class="card"><div class="card-head"><span class="card-title">Recent results</span><span class="chip" id="nb-count">LAST 0</span></div><div class="notebook" id="notebook"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Coaching calls</span><span class="chip gold" id="dec-count">0 / 3 CALLED</span></div><div class="decisions" id="decisions"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Your team</span><span class="chip">TEAM ${Math.round(m.teamRating)}</span></div>
            <div class="team-stats">
              <div class="metric-cell"><b>${Math.round(m.passing)}</b><span>PASS</span></div><div class="metric-cell"><b>${Math.round(m.rushing)}</b><span>RUSH</span></div>
              <div class="metric-cell"><b>${Math.round(m.defense)}</b><span>DEF</span></div><div class="metric-cell"><b>${Math.round(m.chemistry)}</b><span>CHEM</span></div>
              <div class="metric-cell"><b id="fb-ppg">—</b><span>PTS/G</span></div><div class="metric-cell"><b id="fb-opp">—</b><span>OPP/G</span></div>
              <div class="metric-cell"><b id="fb-diff">—</b><span>DIFF</span></div><div class="metric-cell"><b id="fb-streak">0</b><span>STREAK</span></div>
            </div>
            <div class="six-line fb-roster-line">${s.roster.map((p) => `<span>${fpos(p.pos)} ${esc(lastName(pname(p)))}</span>`).join('')}</div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function fxFor(n) {
    const call = F.callForGame(n);
    const d = call && session.s.calls.find((c) => c.id === call.id);
    return d ? F.callEffect(d.option, session.metrics) : {};
  }

  function gamecastHtml(g, { live = false } = {}) {
    const s = session;
    if (!g) {
      const next = s.s.schedule[0];
      const opp = next ? tid(next.opp) : null;
      return `<div class="gamecast idle">
        <div class="gc-head"><span>WEEK 1 · ${next?.home ? 'HOME' : 'AWAY'}</span><span class="gc-state">PREGAME</span></div>
        <div class="gc-pre"><span class="spot-icon">${icon('scope')}</span><div><b>Opening kickoff is on deck</b><span>${opp ? `${next.home ? 'vs' : 'at'} ${esc(opp.name)} · opponent rating ${Math.round(next.str)}` : 'Coaches are reviewing the tape'}</span></div></div>
      </div>`;
    }
    const opp = tid(g.opp);
    const chance = F.gameOdds(s.metrics, { home: g.home, str: g.str, fx: fxFor(g.n) }).win;
    const cell = (side, i) => `<span class="q" data-q="${side}${i}">${live ? '' : g.q[side][i]}</span>`;
    return `<div class="gamecast ${live ? 'live' : g.result}" id="gc">
      <div class="gc-head"><span>WEEK ${g.n} · ${g.home ? 'HOME' : 'AWAY'}</span><span class="gc-state" id="gc-state">${live ? 'KICKOFF' : 'FINAL'}</span></div>
      <div class="gc-grid">
        <span></span><span class="gc-ql">1</span><span class="gc-ql">2</span><span class="gc-ql">3</span><span class="gc-ql">4</span><span class="gc-ql">T</span>
        <span class="gc-team you">${youBadge()}<b>Your team</b></span>${[0, 1, 2, 3].map((i) => cell(0, i)).join('')}<b class="gc-tot" id="gc-us">${live ? 0 : g.us}</b>
        <span class="gc-team">${fbadge(g.opp, null, 'sm')}<b>${esc(opp.name)}</b></span>${[0, 1, 2, 3].map((i) => cell(1, i)).join('')}<b class="gc-tot" id="gc-them">${live ? 0 : g.them}</b>
      </div>
      <div class="gc-foot"><span>OPP RATING <b>${Math.round(g.str)}</b></span><span>PRE-GAME WIN CHANCE <b>${pct(chance)}</b></span></div>
      <span class="gc-stamp" aria-label="${g.result === 'W' ? 'Win' : g.result === 'L' ? 'Loss' : 'Tie'}">${g.result}</span>
    </div>`;
  }

  /** Shows a newly revealed game; in Watch mode the line score fills quarter by quarter. */
  function playGame(g, after) {
    const box = $('#gamecast');
    const animate = box && !fast() && !reducedMotion();
    if (!animate) {
      if (box) box.innerHTML = gamecastHtml(g);
      updateBoard(true);
      gameSound(g);
      after?.();
      return;
    }
    box.innerHTML = gamecastHtml(g, { live: true });
    let us = 0;
    let them = 0;
    const step = 240;
    for (let i = 0; i < 4; i++) {
      ui.castTimers.push(setTimeout(() => {
        us += g.q[0][i];
        them += g.q[1][i];
        const a = $(`#gc [data-q="0${i}"]`);
        const b = $(`#gc [data-q="1${i}"]`);
        if (a) { a.textContent = g.q[0][i]; a.classList.add('in'); }
        if (b) { b.textContent = g.q[1][i]; b.classList.add('in'); }
        const u = $('#gc-us');
        const t = $('#gc-them');
        if (u) u.textContent = us;
        if (t) t.textContent = them;
        const st = $('#gc-state');
        if (st) st.textContent = i < 3 ? `END Q${i + 1}` : 'FINAL';
        if (g.q[0][i] > 0) sound.tick();
      }, step * (i + 1)));
    }
    ui.castTimers.push(setTimeout(() => {
      const gc = $('#gc');
      if (gc) { gc.classList.remove('live'); gc.classList.add(g.result, 'stamped'); }
      updateBoard(true);
      gameSound(g);
      after?.();
    }, step * 5));
  }

  function gameSound(g) {
    if (g.result === 'W') sound.tap();
    else if (g.result === 'L') haptic(30);
  }

  function statusOf(r, n, streak, done) {
    if (done) return r.wins === 17 ? ['PERFECT SEASON', 'gold'] : ['REGULAR SEASON COMPLETE', 'gold'];
    if (r.losses === 0 && r.ties === 0 && n >= 5) return ['PERFECT SEASON WATCH', 'gold'];
    if (streak >= 4) return [`${streak}-GAME WIN STREAK`, 'win'];
    if (n === 0) return ['OPENING KICKOFF', ''];
    return [`WEEK ${n} OF 17 IN THE BOOKS`, ''];
  }

  function updateBoard(newGame = false) {
    const s = session;
    const games = s.revealedGames;
    const n = games.length;
    const r = F.recordOf(games);
    const done = s.phase === FB.final;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

    const recEl = $('#fb-record');
    if (recEl) {
      recEl.innerHTML = `<div class="record-col"><span class="record-num w">${r.wins}</span><span class="record-label">WINS</span></div>
        <span class="record-dash">–</span>
        <div class="record-col"><span class="record-num l${r.losses === 0 ? ' zero' : ''}">${r.losses}</span><span class="record-label">LOSSES</span></div>
        ${r.ties ? `<span class="record-dash">–</span><div class="record-col"><span class="record-num t">${r.ties}</span><span class="record-label">TIES</span></div>` : ''}`;
    }
    const [status, tone] = statusOf(r, n, F.activeStreak(games), done);
    const st = $('#sb-status');
    if (st) { st.textContent = status; st.className = `chip sb-status ${tone}`; }
    set('route-pct', `${Math.round((n / 17) * 100)}%`);
    const fill = $('#route-fill');
    if (fill) fill.style.width = `${(n / 17) * 100}%`;
    for (const c of F.COACHING_CALLS) $(`#fb-mark-${c.id}`)?.classList.toggle('done', s.s.calls.some((d) => d.id === c.id));

    const chip = $('#live-chip');
    if (chip) {
      const dlg = $('#fb-coach-dialog')?.open;
      const label = done ? 'FINAL' : dlg ? 'COACH CALL' : runner.paused ? 'PAUSED' : 'LIVE';
      chip.className = `chip ${done || dlg ? 'gold' : runner.paused ? '' : 'orange live'}`;
      set('live-text', label);
    }

    const weeks = $('#fb-weeks');
    if (weeks) {
      weeks.innerHTML = F.STRETCHES.map(([a, z], i) => {
        const part = games.slice(a - 1, z);
        const pr = F.recordOf(part);
        const call = F.COACHING_CALLS[i - 1];
        const d = call && s.s.calls.find((c) => c.id === call.id);
        const label = i === 0 ? 'Opening stretch' : d ? d.title : `Call after week ${call.checkpoint}`;
        const cells = [];
        for (let k = a; k <= z; k++) {
          const slot = s.s.schedule[k - 1];
          const g = games[k - 1];
          const t = tid(slot.opp);
          cells.push(`<div class="wk${g ? ` ${g.result}` : ''}${g && g.n === n && !done ? ' last' : ''}" title="Week ${k}: ${slot.home ? 'vs' : 'at'} ${esc(t.name)}${g ? ` · ${g.us}-${g.them}` : ` · rating ${Math.round(slot.str)}`}">
            <small>W${k}</small><b>${slot.home ? '' : '@'}${esc(t.abbr)}</b><i>${g ? `${g.us}-${g.them}` : Math.round(slot.str)}</i></div>`);
        }
        return `<div class="stretch"><div class="stretch-head"><span>WEEKS ${a}–${z} · <span class="num">${part.length ? rec(pr) : '0-0'}</span></span><em class="${d ? '' : 'muted'}">${esc(label)}</em></div><div class="weeks" style="--cols:${z - a + 1}">${cells.join('')}</div></div>`;
      }).join('');
    }

    const nb = $('#notebook');
    if (nb) {
      const recent = games.slice(-6).reverse();
      nb.innerHTML = recent.length ? recent.map((g, i) => {
        const t = tid(g.opp);
        const word = g.result === 'W' ? 'WIN' : g.result === 'L' ? 'LOSS' : 'TIE';
        return `<div class="nb-row ${g.result}${i === 0 && newGame ? ' new' : ''}">
          <span class="nb-num">W${String(g.n).padStart(2, '0')}</span>
          <span class="nb-main"><b>${word}</b><span>${g.home ? 'vs' : 'at'} ${esc(t.name)} · OPP ${Math.round(g.str)}</span></span>
          <span class="nb-score">${g.us}-${g.them}</span><span class="nb-margin">${signed(g.us - g.them)}</span></div>`;
      }).join('') : '<div class="empty">Preparing the opening matchup…</div>';
      set('nb-count', `LAST ${recent.length}`);
    }

    const dec = $('#decisions');
    if (dec) {
      const next = F.COACHING_CALLS.find((c) => !s.s.calls.some((d) => d.id === c.id));
      dec.innerHTML = F.COACHING_CALLS.map((c) => {
        const d = s.s.calls.find((x) => x.id === c.id);
        return `<div class="decision${d ? ' made' : ''}"><i>W${c.checkpoint}</i><div><b>${esc(d ? d.title : c.title)}</b><span>${d ? `${esc(d.summary)} · weeks ${c.checkpoint + 1}–${c.endGame}` : c === next ? `Up next after week ${c.checkpoint}` : `Unlocks after week ${c.checkpoint}`}</span></div></div>`;
      }).join('');
      set('dec-count', `${s.s.calls.length} / 3 CALLED`);
    }

    if (n) {
      const sum = F.seasonSummary(games);
      set('fb-ppg', sum.ppg.toFixed(1));
      set('fb-opp', sum.oppPpg.toFixed(1));
      set('fb-diff', signed(sum.diff));
      set('fb-streak', F.activeStreak(games));
    }
  }

  function mountSeason() {
    const s = session;
    updateBoard(false);
    if (s.phase === FB.final) return;
    runner.paused = false;
    syncPause();
    const call = s.lockedCall || s.dueCall;
    if (call) { openCall(call, !!s.lockedCall); return; }
    runner.schedule(s.s.revealed === 0 ? 900 : 450);
  }

  function syncPause() {
    const b = $('#fb-pause-btn');
    if (!b) return;
    b.innerHTML = icon(runner.paused ? 'play' : 'pause');
    b.setAttribute('aria-label', runner.paused ? 'Resume' : 'Pause');
  }

  function togglePause() {
    if (session.phase !== FB.season || $('#fb-coach-dialog')?.open) return;
    runner.paused = !runner.paused;
    syncPause();
    if (runner.paused) { clearTimeout(runner.timer); runner.timer = null; } else runner.schedule(150);
    updateBoard(false);
  }

  function openCall(call, locked) {
    clearTimeout(runner.timer);
    runner.timer = null;
    const d = host.dialog('fb-coach-dialog');
    d.oncancel = (e) => e.preventDefault();
    d.onclick = null;
    d.innerHTML = htmlCall(call, locked);
    if (!d.open) { d.showModal(); sound.coach(); haptic([12, 40, 12]); }
    updateBoard(false);
  }

  function htmlCall(call, locked) {
    const s = session;
    const r = s.record;
    const m = s.metrics;
    const upcoming = s.s.schedule.slice(call.checkpoint, call.endGame).map((g) => {
      const t = tid(g.opp);
      return `<span class="up-game${g.str >= 88 ? ' tough' : ''}"><small>W${g.n}</small><b>${g.home ? 'vs' : '@'} ${esc(t.abbr)}</b><i>${Math.round(g.str)}</i></span>`;
    }).join('');
    let body;
    if (locked) {
      const d = s.s.calls.find((x) => x.id === call.id);
      body = `<div class="locked-call"><div class="seal">${icon('seal')}</div><div class="kicker">CALL LOCKED</div><h3>${esc(d?.title || '')}</h3><p>${esc(d?.summary || '')}. Weeks ${call.checkpoint + 1}–${call.endGame} have been game-planned.</p></div>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-xl" data-act="fb-call-continue" data-call="${call.id}">${icon('play')} Continue season</button>
          ${s.s.secondChanceUsed ? '' : `<button class="btn btn-gold" data-act="fb-second-chance" data-call="${call.id}">${icon('refresh')} Second chance <span class="badge-count">1 per season</span></button>`}
        </div>`;
    } else {
      body = `<div class="kicker muted" style="margin-bottom:10px">CALL THE PLAN</div><div class="options">${call.options.map((o, i) => `
        <button class="option" data-act="fb-call-pick" data-call="${call.id}" data-opt="${o.id}">
          <span class="option-icon">${icon(o.icon)}</span>
          <span><span class="option-top"><b>${esc(o.title)}</b><span><span class="chip orange">${o.impact}</span> <kbd>${i + 1}</kbd></span></span><p>${esc(o.detail)}</p></span>
        </button>`).join('')}</div>`;
    }
    return `<div class="sheet-body">
      <div class="kicker">${call.chapter}</div>
      <h2>${esc(call.title)}</h2>
      <p>${esc(call.prompt)}</p>
      <div class="sheet-metrics"><div><b class="num">${rec(r)}</b><span>RECORD</span></div><div><b>${Math.round(m.teamRating)}</b><span>TEAM</span></div><div><b>${Math.round(m.chemistry)}</b><span>CHEM</span></div></div>
      <div class="upcoming"><span class="kicker muted">NEXT UP</span><div class="up-row">${upcoming}</div></div>
      ${body}
    </div>`;
  }

  function finishSeason() {
    const s = session;
    ensureRecorded();
    const r = F.recordOf(s.s.games);
    const slot = $('#final-slot');
    if (slot) slot.innerHTML = htmlFinal();
    $('.fb-season .seg')?.remove();
    $('#fb-pause-btn')?.remove();
    const title = $('#season-title');
    if (title) title.textContent = 'Final record';
    updateBoard(false);
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    sound.finale(Math.round((r.wins / 17) * 82));
    haptic(r.wins >= 14 ? [30, 60, 30, 60, 80] : 40);
    if (r.wins === 17) { confetti({ count: 260, duration: 4800 }); setTimeout(() => confetti({ count: 180 }), 900); } else if (r.wins >= 14) confetti();
  }

  function htmlFinal() {
    const s = session;
    const sum = F.seasonSummary(s.s.games);
    const tier = F.tierFor(sum.wins);
    const perfect = sum.perfect;
    const label = (g) => (g ? `${g.us}-${g.them} <small>W${g.n}</small>` : '—');
    const calls = s.s.calls.map((d) => `<span class="chip gold">${esc(d.title)}</span>`).join('');
    const lineKey = perfect ? 'perfect' : tier.key;
    return `<div class="final fb-final" style="--tier:${tier.color}">
      <span class="final-tier">${icon(perfect ? 'crown' : 'trophy')} ${perfect ? 'PERFECT SEASON' : tier.label}</span>
      <div class="final-record${perfect ? ' perfect' : ''}">${rec(sum)}</div>
      <p class="final-line">${FINAL_LINES[lineKey]}</p>
      <div class="mini-map fb-mini" aria-label="Game by game results">${s.s.games.map((g) => `<i class="${g.result}" title="W${g.n} ${g.us}-${g.them}"></i>`).join('')}</div>
      <div class="final-stats">
        <div><b>${sum.ppg.toFixed(1)}</b><span>POINTS / GAME</span></div>
        <div><b>${sum.oppPpg.toFixed(1)}</b><span>ALLOWED / GAME</span></div>
        <div><b>${label(sum.bestWin)}</b><span>BEST WIN</span></div>
        <div><b>${sum.longestWinStreak}</b><span>LONGEST STREAK</span></div>
      </div>
      ${calls ? `<div class="final-calls">${calls}</div>` : ''}
      <div class="final-actions">
        <button class="btn btn-primary btn-xl" data-act="fb-new-now">${icon('ball')} New draft</button>
        <div class="row">
          ${s.canRunItBack
    ? `<button class="btn btn-gold" data-act="fb-run-it-back">${icon('repeat')} Run it back <span class="badge-count">1 left</span></button>`
    : `<button class="btn btn-secondary" disabled>${icon('repeat')} Run it back used</button>`}
          <button class="btn btn-secondary" data-act="fb-share">${icon('share')} Share result</button>
        </div>
        <button class="btn btn-ghost" data-act="fb-home-reset">${icon('home')} Back to home</button>
      </div>
      <div class="final-promo">Chase 17-0 anywhere — <a href="${FB_APP_STORE_URL}" target="_blank" rel="noopener noreferrer">get the iPhone &amp; iPad app</a></div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Sharing
  // ---------------------------------------------------------------------------

  function shareText(run) {
    const tier = F.tierFor(run.wins);
    const sq = (c) => (c === 'W' ? '🟩' : c === 'L' ? '🟥' : '🟨');
    const rows = F.STRETCHES.map(([a, z]) => run.grid.slice(a - 1, z).split('').map(sq).join('')).join(' ');
    const url = new URL('../../17-0/', import.meta.url).href;
    return `17-0 🏈 ${rec(run)} · ${run.perfect ? 'PERFECT SEASON' : tier.label}\n${rows}\nTeam ${Math.round(run.teamRating)} · Chem ${Math.round(run.chemistry)} · ${run.ppg.toFixed(1)} PPG\nCan you go 17-0? ${url}`;
  }

  async function share(run) {
    const text = shareText(run);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      host.toast('Result copied — paste it anywhere');
    } catch (e) {
      if (e?.name !== 'AbortError') host.toast('Could not share from this browser');
    }
  }

  function currentRun() {
    const s = session;
    const m = s.metrics;
    const sum = F.seasonSummary(s.s.games);
    return { ...sum, teamRating: m.teamRating, chemistry: m.chemistry, ppg: sum.ppg, grid: s.s.games.map((g) => g.result).join('') };
  }

  // ---------------------------------------------------------------------------
  // HISTORY / TROPHIES / SETTINGS
  // ---------------------------------------------------------------------------

  function viewHistory() {
    const f = ui.filter;
    const runs = history.runs.filter((r) => (f === 'perfect' ? r.perfect : f === '12' ? r.wins >= 12 : true));
    const btn = (key, label) => `<button data-act="fb-filter" data-f="${key}" aria-pressed="${f === key}">${label}</button>`;
    return `
    <div class="page-head"><div><div class="kicker">Records</div><h1>Season history</h1><p>${history.runs.length} seasons on file · best ${history.stats.bestRecord}</p></div>
      <div class="filters" role="group" aria-label="Filter seasons">${btn('all', 'All')}${btn('perfect', '17-0')}${btn('12', '12+ Wins')}</div></div>
    ${runs.length ? `<div class="run-list">${runs.map(runRow).join('')}</div>`
      : `<div class="card empty"><b>${history.runs.length ? 'No seasons match this filter' : 'No seasons recorded yet'}</b>${history.runs.length ? 'Keep drafting — history is made one season at a time.' : 'Finish a 17-game season and it will be saved here.'}</div>`}`;
  }

  function openRunDetail(id) {
    const run = history.runs.find((r) => r.id === id);
    if (!run) return;
    const tier = F.tierFor(run.wins);
    const d = host.dialog('fb-run-dialog');
    d.innerHTML = `<div class="sheet-body">
      <div class="detail-head"><span class="tier-chip" style="--tier:${tier.color}">${run.perfect ? 'PERFECT SEASON' : tier.label}</span><button class="icon-btn" data-act="close-dialog" aria-label="Close">${icon('x')}</button></div>
      <div class="detail-rec" style="color:${tier.color}">${rec(run)}</div>
      <p>${fmtDate(run.date, true)}${run.mode !== 'classic' ? ` · ${esc(F.modeOf(run.mode).title)}` : ''}</p>
      <div class="sheet-metrics"><div><b>${Math.round(run.teamRating)}</b><span>TEAM</span></div><div><b>${Math.round(run.chemistry)}</b><span>CHEM</span></div><div><b>${run.ppg.toFixed(1)}</b><span>PTS/G</span></div></div>
      <div class="mini-map fb-mini" aria-label="Game by game results">${run.grid.split('').map((c, i) => `<i class="${c}" title="W${i + 1}"></i>`).join('')}</div>
      <div class="roster-list">${run.roster.map((p) => { const n = pname(p); return `<div class="roster-item">${favatar(n, p.pos)}<div><b>${esc(n)}</b><span>${esc(tid(p.team, p.era).abbr)} · ${eraLabel(p.era)} · ${esc(p.arch)}</span></div><span class="rr">${fpos(p.pos)}<span class="r">${p.ovr}</span></span></div>`; }).join('')}</div>
      ${run.calls?.length ? `<div class="final-calls">${run.calls.map((x) => `<span class="chip gold">${esc(x.title)}</span>`).join('')}</div>` : ''}
      <div class="sheet-actions"><button class="btn btn-secondary" data-act="fb-share-run" data-id="${esc(run.id)}">${icon('share')} Share this season</button></div>
    </div>`;
    d.onclick = (e) => { if (e.target === d) d.close(); };
    d.oncancel = null;
    d.showModal();
  }

  function viewTrophies() {
    const list = footballAchievements(history);
    const on = list.filter((a) => a.unlocked).length;
    return `
    <div class="page-head"><div><div class="kicker">Trophy case</div><h1>Achievements</h1><p>Earned from your saved 17-0 seasons on this device.</p></div></div>
    <div class="trophy-summary"><b>${on}/${list.length}</b><div style="flex:1"><span>trophies unlocked</span><div class="bar" style="margin-top:8px"><i style="--v:${(on / list.length) * 100}%"></i></div></div></div>
    <div class="trophies">${list.map((a) => `<div class="trophy${a.unlocked ? ' on' : ''}">
      <span class="trophy-icon">${icon(a.icon)}</span>
      <div><b>${esc(a.title)}</b><p>${esc(a.description)}</p>
      ${a.unlocked ? '<div class="t-prog"><span class="chip gold">Unlocked</span></div>' : `<div class="t-prog"><div class="bar"><i style="--v:${a.progress * 100}%"></i></div><span>${esc(a.progressLabel)}</span></div>`}</div>
    </div>`).join('')}</div>`;
  }

  function viewSettings() {
    const st = host.settings;
    const sw = (key, label, sub) => `<div class="set-row"><div><b>${label}</b><span>${sub}</span></div><button class="switch" role="switch" aria-checked="${!!st.get(key)}" aria-label="${label}" data-act="toggle" data-key="${key}"></button></div>`;
    const inProgress = session.phase !== FB.idle;
    return `
    <div class="page-head"><div><div class="kicker">17-0 preferences</div><h1>Settings</h1></div></div>
    <div class="settings">
      <section class="set-group"><h2>GAMEPLAY</h2>
        ${sw('fbFast', 'Fast simulation', 'Skip the quarter-by-quarter gamecast and show finals instantly')}
        ${sw('sound', 'Sound effects', 'Subtle cues for spins, picks, coaching calls and the final whistle')}
        ${canVibrate() ? sw('haptics', 'Vibration', 'Haptic taps for picks and results on supported phones') : ''}
        <div class="set-row"><div><b>Player &amp; team names</b><span>${identity.realNames ? 'Real player and team names' : 'Fictional identities'}</span></div></div>
      </section>
      <section class="set-group"><h2>DATA</h2>
        ${inProgress ? '<div class="set-row"><div><b>Abandon current run</b><span>Clears the draft or season in progress</span></div><button class="btn btn-secondary" data-act="fb-abandon">Abandon</button></div>' : ''}
        <div class="set-row"><div><b>Delete season history</b><span>${history.runs.length} saved season${history.runs.length === 1 ? '' : 's'} on this device</span></div><button class="btn btn-secondary danger" data-act="fb-clear-history" ${history.runs.length ? '' : 'disabled'}>${icon('trash')} Delete</button></div>
      </section>
      <section class="set-group"><h2>ABOUT</h2>
        <div class="set-row"><div><b>About 17-0</b><span>A free football draft game: spin a random franchise and era, build a 17-0 team from five key positions and try to go undefeated. Web edition by 0 Studio.</span></div></div>
        <div class="set-row"><div><b>Unofficial fan game</b><span>Not affiliated with, endorsed by or licensed by the NFL, its teams or its players. Names are used only to identify them, and ratings are our own opinions.</span></div></div>
        <a class="set-row" href="${FB_APP_STORE_URL}" target="_blank" rel="noopener noreferrer"><div><b>Get 17-0 for iPhone &amp; iPad</b><span>Game modes, multiplayer and Game Center leaderboards</span></div>${icon('external', 'chev')}</a>
        <a class="set-row" href="${new URL('../../17-0/support/', import.meta.url).href}"><div><b>Support</b><span>Questions, feedback and bug reports</span></div>${icon('arrow')}</a>
        <a class="set-row" href="${new URL('../../17-0/privacy/', import.meta.url).href}"><div><b>Privacy policy</b><span>The web edition stores your progress only in this browser</span></div>${icon('arrow')}</a>
      </section>
      <p class="fine-print">Ratings are original game-balancing judgments, not official statistics. 17-0 is not affiliated with or endorsed by the NFL or any team.</p>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function act(name, el) {
    const s = session;
    if (!s) return;
    switch (name) {
      case 'fb-mode':
        if (s.setMode(el.dataset.mode)) { sound.tap(); host.render(); }
        break;
      case 'fb-play': s.startDraft(); sound.tap(); host.go('draft'); break;
      case 'fb-new': {
        const ok = await host.confirm({ title: 'Start a new draft?', body: 'Your current draft or season in progress will be cleared.', confirm: 'Start new draft', danger: true });
        if (ok) { ensureRecorded(); s.startDraft(); host.go('draft'); }
        break;
      }
      case 'fb-new-now': ensureRecorded(); s.startDraft(); sound.tap(); host.go('draft'); break;
      case 'fb-home-reset': ensureRecorded(); s.resetToIdle(); host.go('home'); break;
      case 'fb-spin': spin(); break;
      case 'fb-respin':
        if (!ui.busy && s.respin()) { ui.autoSpin = true; host.render(); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
        break;
      case 'fb-scout': if (s.scout()) { sound.tap(); host.render(); } break;
      case 'fb-select': {
        const p = s.pool.find((x) => x.id === el.dataset.id);
        if (p) selectPlayer(p, true);
        break;
      }
      case 'fb-draft': draftPlayer(); break;
      case 'fb-kickoff':
        if (s.kickoff()) { sound.whistle(); haptic(20); host.go('season'); }
        break;
      case 'fb-speed': {
        const f = el.dataset.fast === '1';
        host.settings.set('fbFast', f);
        for (const b of $$('.fb-season .seg button')) b.setAttribute('aria-pressed', String((b.dataset.fast === '1') === f));
        if (runner.timer) runner.schedule(f ? 200 : runner.delay());
        break;
      }
      case 'fb-pause': togglePause(); break;
      case 'fb-call-pick': {
        const call = F.callById(el.dataset.call);
        if (call && s.applyCall(call.id, el.dataset.opt)) {
          sound.stamp(); haptic(25);
          $('#fb-coach-dialog').innerHTML = htmlCall(call, true);
          updateBoard(false);
        }
        break;
      }
      case 'fb-second-chance': {
        const call = F.callById(el.dataset.call);
        if (call && s.secondChance(call.id)) {
          sound.open();
          $('#fb-coach-dialog').innerHTML = htmlCall(call, false);
          updateBoard(false);
          host.toast('Call rewound — make a new one');
        }
        break;
      }
      case 'fb-call-continue': {
        s.finalizeCall(el.dataset.call);
        $('#fb-coach-dialog')?.close();
        runner.paused = false;
        syncPause();
        updateBoard(false);
        runner.schedule(300);
        break;
      }
      case 'fb-run-it-back':
        if (s.runItBack()) { sound.whistle(); host.toast('Same roster. New schedule.'); host.render(true); }
        break;
      case 'fb-share': share(currentRun()); break;
      case 'fb-share-run': { const run = history.runs.find((r) => r.id === el.dataset.id); if (run) share(run); break; }
      case 'fb-run-detail': openRunDetail(el.dataset.id); break;
      case 'fb-filter': ui.filter = el.dataset.f; host.render(); break;
      case 'fb-abandon': {
        const ok = await host.confirm({ title: 'Abandon this run?', body: 'The current draft or season will be cleared. Saved history stays.', confirm: 'Abandon run', danger: true });
        if (ok) { ensureRecorded(); s.resetToIdle(); host.render(); host.toast('Run cleared'); }
        break;
      }
      case 'fb-clear-history': {
        const ok = await host.confirm({ title: 'Delete all 17-0 seasons?', body: 'This removes every saved 17-0 season and resets its trophies on this device. It cannot be undone.', confirm: 'Delete history', danger: true });
        if (ok) { history.clear(); host.render(); host.toast('Season history deleted'); }
        break;
      }
      default: break;
    }
  }

  function onKey(e) {
    if (!session) return;
    const onControl = ['BUTTON', 'A'].includes(e.target.tagName);
    const coach = $('#fb-coach-dialog');
    if (coach?.open) {
      if (/^[123]$/.test(e.key)) $$('.option', coach)[Number(e.key) - 1]?.click();
      return;
    }
    if ($('dialog[open]')) return;
    const s = session;
    const route = host.route();
    if (route === 'draft') {
      if (s.phase === FB.spin) {
        if ((e.key === ' ' || e.key === 'Enter') && !onControl) { e.preventDefault(); spin(); }
      } else if (s.phase === FB.revealed && e.key === 'Enter' && !onControl) {
        e.preventDefault(); act('fb-scout');
      } else if (s.phase === FB.revealed && e.key.toLowerCase() === 'r') {
        act('fb-respin');
      } else if (s.phase === FB.compare) {
        const list = s.pool;
        const idx = list.findIndex((p) => p.id === s.s.selectedId);
        if (['ArrowDown', 'ArrowRight', 'j'].includes(e.key)) { e.preventDefault(); selectPlayer(list[Math.min(list.length - 1, idx + 1)], false); }
        else if (['ArrowUp', 'ArrowLeft', 'k'].includes(e.key)) { e.preventDefault(); selectPlayer(list[Math.max(0, idx - 1)], false); }
        else if (e.key === 'Enter' && (!onControl || e.target.id === 'fb-draft-btn')) { e.preventDefault(); draftPlayer(); }
      } else if (s.phase === FB.complete && e.key === 'Enter' && !onControl) {
        e.preventDefault(); act('fb-kickoff');
      }
    } else if (route === 'season') {
      if (e.key === ' ' && !onControl) { e.preventDefault(); togglePause(); }
      else if (e.key.toLowerCase() === 'f') $(`.fb-season .seg button[data-fast="${fast() ? '0' : '1'}"]`)?.click();
    }
  }

  // ---------------------------------------------------------------------------
  // Host interface
  // ---------------------------------------------------------------------------

  return {
    prefix: 'fb-',
    load,
    title: (r) => TITLES[r] || TITLES.home,
    resolveRoute(r) {
      if (!session) return r === 'draft' || r === 'season' ? 'home' : r;
      const p = session.phase;
      if (r === 'draft') {
        if (p === FB.season || p === FB.final) return 'season';
        if (p === FB.idle) return 'home';
      }
      if (r === 'season' && p !== FB.season && p !== FB.final) return p === FB.idle ? 'home' : 'draft';
      return r;
    },
    view(r) {
      if (r !== 'season') runner.stop();
      if (!session) {
        load().then(() => host.render(), () => host.toast('The 17-0 player database could not be loaded. Check your connection.'));
        return '<div class="fb-loading"><div class="splash-bar"></div><p>Loading the draft board…</p></div>';
      }
      ensureRecorded();
      return ({ home: viewHome, draft: viewDraft, season: viewSeason, history: viewHistory, trophies: viewTrophies, settings: viewSettings }[r] || viewHome)();
    },
    mounted(r) {
      if (!session) return;
      if (r === 'season') { runner.stop(); mountSeason(); }
      if (r === 'draft' && ui.autoSpin && session.phase === FB.spin) {
        ui.autoSpin = false;
        setTimeout(spin, 260);
      }
    },
    act,
    onKey,
    stop() { runner.stop(); },
  };
}
