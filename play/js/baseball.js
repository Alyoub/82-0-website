/**
 * 162-0 Web — Baseball controller and views.
 *
 * Home · Draft (spin → reveal → pick a player → place him on the diamond → starting nine) ·
 * Season (line scores, live 30-club standings, three front-office calls, final record) ·
 * History · Trophies · Settings. Data, ratings and the season model come from the
 * 162-0 Baseball iOS app (bb-engine.js). All clubs and players are fictional.
 */

import * as B from './bb-engine.js';
import { BaseballSession, BaseballHistory, BB, baseballAchievements } from './bb-session.js';
import { esc, icon, hex, ring, ovrRing, signed, delta, initials, lastName } from './ui.js';
import { sound, haptic, confetti, canVibrate } from './fx.js';
import { QMARK_ITEM, BLANK_ITEM, reelCab, animateReel, neighbours } from './reels.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLES = {
  home: 'Play 162-0 Online – The Baseball Draft Game',
  draft: 'Draft Room · 162-0',
  season: 'Season · 162-0',
  history: 'Season History · 162-0',
  trophies: 'Trophy Case · 162-0',
  settings: 'Settings · 162-0',
};

const GROUP_VAR = { p: '--bb-p', c: '--bb-c', if: '--bb-if', of: '--bb-of' };
const pc = (pos) => `var(${GROUP_VAR[B.posGroup(pos)]})`;
const RING = { BAT: '#60a5fa', PWR: '#f5a623', CON: '#ef4444', FLD: '#10b981', ARM: '#8b5cf6', SPD: '#38d6e8', PIT: '#3b82f6', STA: '#2dd4bf' };
/** Diamond spots (DraftPosition.pitchOffset in the app). */
const SPOTS = { P: [50, 61], C: [50, 88], '1B': [81, 64], '2B': [68, 42], '3B': [19, 64], SS: [32, 42], LF: [16, 19], CF: [50, 12], RF: [84, 19] };
const fitClass = (e) => (e >= 1 ? 'f100' : e >= 0.95 ? 'f95' : e >= 0.85 ? 'f85' : 'f65');

const FINAL_LINES = {
  perfect: 'One hundred sixty-two up, none down. You built the impossible.',
  legendary: 'A season they will still talk about in a hundred years.',
  elite: 'Pennant chasers from April to October.',
  contender: 'Right in the race — a few pieces from a pennant.',
  average: 'In the hunt, but the nine needs work.',
  below: 'Rebuilding year. Every dynasty starts somewhere.',
};

const BASEBALL_SVG = (() => {
  // Two seams with stitches along each curve.
  const seam = (x0, cx, flip) => {
    const pts = [];
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x0;
      const y = (1 - t) ** 2 * 12 + 2 * (1 - t) * t * 50 + t * t * 88;
      const dx = 2 * (1 - t) * (cx - x0) + 2 * t * (x0 - cx);
      const dy = 2 * (1 - t) * 38 + 2 * t * 38;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len; const ny = dx / len;
      const s = flip ? -1 : 1;
      pts.push(`M${(x - nx * 3.6 + (dx / len) * 1.6 * s).toFixed(1)} ${(y - ny * 3.6 + (dy / len) * 1.6 * s).toFixed(1)}L${(x + nx * 3.6 - (dx / len) * 1.6 * s).toFixed(1)} ${(y + ny * 3.6 - (dy / len) * 1.6 * s).toFixed(1)}`);
    }
    return `<path d="M${x0} 12Q${cx} 50 ${x0} 88" stroke-width="1.6"/><path d="${pts.join('')}" stroke-width="1.5"/>`;
  };
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs><radialGradient id="bb-hide" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#ffffff"/><stop offset="0.62" stop-color="#ebe4d6"/><stop offset="1" stop-color="#a99f8c"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#bb-hide)"/>
    <g fill="none" stroke="#d2382b" stroke-linecap="round">${seam(24, 46, false)}${seam(76, 54, true)}</g>
    <ellipse cx="36" cy="26" rx="15" ry="7" fill="#fff" opacity="0.4" transform="rotate(-30 36 26)"/>
  </svg>`;
})();

const DIAMOND_SVG = `<svg class="diamond-lines" viewBox="0 0 300 300" aria-hidden="true">
  <defs>
    <linearGradient id="bb-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d3127"/><stop offset="1" stop-color="#145040"/></linearGradient>
    <clipPath id="bb-fair"><path d="M150 285L-140 -5H440Z"/></clipPath>
  </defs>
  <rect width="300" height="300" fill="url(#bb-grass)"/>
  <g opacity="0.07" fill="#fff">${Array.from({ length: 13 }, (_, i) => `<rect x="0" y="${i * 24}" width="300" height="12"/>`).join('')}</g>
  <path d="M0 0H300V70.2A262 262 0 0 0 0 70.2Z" fill="#081621"/>
  <path d="M0 78.8A255 255 0 0 1 300 78.8" fill="none" stroke="#6b5136" stroke-width="13" opacity="0.75"/>
  <path d="M0 70.2A262 262 0 0 1 300 70.2" fill="none" stroke="rgba(228,189,114,0.75)" stroke-width="2.5"/>
  <g clip-path="url(#bb-fair)"><circle cx="150" cy="221" r="100" fill="#6e5236"/></g>
  <path d="M150 271L205 216L150 161L95 216Z" fill="#165542"/>
  <circle cx="150" cy="282" r="15" fill="#6e5236"/>
  <circle cx="150" cy="221" r="10" fill="#7d5e3e"/>
  <rect x="146" y="219.6" width="8" height="2.4" fill="#f4ebdd"/>
  <g stroke="rgba(244,235,221,0.8)" stroke-width="1.6" fill="none"><path d="M150 285L0 135M150 285L300 135"/></g>
  <g fill="#f4ebdd"><rect x="212" y="213" width="9" height="9" transform="rotate(45 216.5 217.5)"/><rect x="145.5" y="146.5" width="9" height="9" transform="rotate(45 150 151)"/><rect x="79" y="213" width="9" height="9" transform="rotate(45 83.5 217.5)"/><path d="M144 281h12v4l-6 5-6-5z"/></g>
</svg>`;

const BOARD_LINES = `<svg class="lines" viewBox="0 0 400 200" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
  <rect x="1" y="1" width="398" height="198" rx="12"/><path d="M200 196L120 116L200 36L280 116Z" stroke-dasharray="5 5"/><circle cx="200" cy="140" r="6"/>
</svg>`;

export function createBaseball(host) {
  let db = null;
  let session = null;
  let history = null;
  let loading = null;
  const ui = { busy: false, justLanded: false, autoSpin: false, fresh: null, filter: 'all' };

  const team = (id) => db.teamById.get(id) || { id, name: 'League club', city: 'League', abbr: 'LGE', c1: '#5b6578', c2: '#f4ebdd' };
  const era = (id) => db.eraById.get(id) || db.eras[0];
  const eraYears = (e) => `${e.start}–${e.end}`;

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  function load() {
    if (db) return Promise.resolve(true);
    if (!loading) {
      loading = (async () => {
        const res = await fetch(new URL('../data/bb-players.json', import.meta.url));
        if (!res.ok) throw new Error(`bb-players.json: ${res.status}`);
        db = B.buildDb(await res.json());
        session = new BaseballSession(db);
        history = new BaseballHistory();
        ensureRecorded();
        return true;
      })().catch((err) => { loading = null; throw err; });
    }
    return loading;
  }

  function ensureRecorded() {
    if (session.phase === BB.final && !session.s.recorded) {
      history.record(session);
      session.markRecorded();
    }
  }

  // ---------------------------------------------------------------------------
  // Atoms
  // ---------------------------------------------------------------------------

  const bpos = (pos, cls = '') => `<span class="pos ${cls}" style="--pc:${pc(pos)}">${pos}</span>`;
  const bavatar = (name, pos) => `<span class="avatar" style="--pc:${pc(pos)}" aria-hidden="true">${esc(initials(name))}</span>`;
  const badge = (teamId, size = '') => { const t = team(teamId); return `<span class="team-badge ${size}" style="--tc:${t.c1};--tc2:${t.c2}" aria-hidden="true">${esc(t.abbr)}</span>`; };
  const youBadge = (size = 'sm') => `<span class="team-badge ${size} you" aria-hidden="true">YOU</span>`;
  const pct = (p) => `${Math.round(p * 100)}%`;
  const rec = (r) => `${r.wins}-${r.losses}`;
  const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  const gbText = (gb) => (gb === 0 ? '—' : gb % 1 ? gb.toFixed(1) : String(gb));

  function oddsText(p) {
    if (!(p > 0)) return '—';
    if (p >= 0.1) return pct(p);
    const n = 1 / p;
    if (n > 1e6) return '1 in 1M+';
    const r = n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
    return `1 in ${r.toLocaleString('en-US')}`;
  }

  function ratingsOf(p) {
    return p.pos === 'P'
      ? [['PIT', p.pit], ['STA', p.sta], ['ARM', p.arm], ['FLD', p.def], ['BAT', p.bat], ['SPD', p.spd]]
      : [['BAT', p.bat], ['PWR', p.pow], ['CON', p.con], ['FLD', p.def], ['ARM', p.arm], ['SPD', p.spd]];
  }

  /** The diamond: drafted nine, open spots, and (while placing) each open spot's fit for the selected player. */
  function diamond({ roster, eff = {}, placing = null, chosen = null, fresh = null }) {
    const occupied = Object.keys(roster);
    const fits = placing ? new Map(B.availableSlots(placing, occupied).map((x) => [x.slot, x.eff])) : null;
    const tokens = B.POSITIONS.map((slot) => {
      const [x, y] = SPOTS[slot];
      const style = `left:${x}%;top:${y}%;--pc:${pc(slot)}`;
      const p = roster[slot];
      if (p) {
        const n = p.name;
        const e = eff[slot] ?? 1;
        const fitNote = e < 1 ? ` · ${B.fitLabel(e)} fit` : '';
        return `<div class="dtok${fresh === p.id ? ' fresh' : ''}" style="${style}" title="${esc(n)} · ${slot}${fitNote}">
          <span class="tok-rate${e < 1 ? ` off ${fitClass(e)}` : ''}">${slot} ${p.ovr}</span>${bavatar(n, p.pos)}<span class="tok-name">${esc(lastName(n))}</span></div>`;
      }
      if (fits) {
        const e = fits.get(slot);
        if (e) {
          const on = chosen === slot;
          return `<button type="button" class="dtok open ${fitClass(e)}${on ? ' chosen' : ''}" style="${style}" data-act="bb-slot" data-slot="${slot}" aria-pressed="${on}" aria-label="Place at ${B.POSITION_NAMES[slot]}, ${B.fitLabel(e)} fit">
            <span class="tok-empty">${on ? esc(initials(placing.name)) : slot}</span><span class="tok-name">${slot} ${B.fitLabel(e)}</span></button>`;
        }
        return `<div class="dtok blocked" style="${style}"><span class="tok-empty">${slot}</span><span class="tok-name">${slot === 'P' || slot === 'C' ? 'Specialist' : 'No fit'}</span></div>`;
      }
      return `<div class="dtok" style="${style}"><span class="tok-empty">${slot}</span><span class="tok-name">Open</span></div>`;
    }).join('');
    return `<div class="diamond-wrap"><div class="diamond">${DIAMOND_SVG}${tokens}</div></div>`;
  }

  function strip(roster) {
    return `<div class="strip bb-strip" aria-label="Your nine">${B.POSITIONS.map((slot) => {
      const p = roster[slot];
      return `<div class="strip-slot" style="--pc:${pc(slot)}">${p ? bavatar(p.name, p.pos) : '<span class="s-empty">+</span>'}<span class="s-pos">${slot}</span></div>`;
    }).join('')}</div>`;
  }

  function metricsBlock() {
    const s = session;
    const m = s.metrics;
    if (!m.count) {
      return `${ovrRing(null)}<p class="chem-note" style="margin-top:10px">Draft your first player to see team ratings, chemistry and the 162-game outlook.</p>`;
    }
    const partial = m.count < 9;
    const o = B.seasonOutlook(partial ? s.previewMetrics : m);
    const tier = B.tierFor(Math.round(o.wins));
    const c = m.chemistry;
    const proj = `${Math.round(o.wins)}-${162 - Math.round(o.wins)}`;
    return `<div class="metrics">
      <div class="metric-top">${ovrRing(m.overall)}
        <div class="chem"><div class="chem-head"><span>TEAM CHEMISTRY</span><b>${c.score}</b></div>
        <div class="bar"><i style="--v:${c.score}%"></i></div>
        <div class="chem-note">${c.bonuses.length} boost${c.bonuses.length === 1 ? '' : 's'} · ${c.penalties.length} mismatch${c.penalties.length === 1 ? '' : 'es'} · base 65</div></div>
      </div>
      <div class="metric-row">
        <div class="metric-cell"><b class="num">${m.batting || '—'}</b><span>BATTING</span></div>
        <div class="metric-cell"><b class="num">${m.pitching || '—'}</b><span>PITCHING</span></div>
        <div class="metric-cell"><b class="num">${m.defense || '—'}</b><span>FIELDING</span></div>
      </div>
      ${partial
    ? `<div class="outlook" title="Open spots play at ${B.REPLACEMENT} until you fill them"><div><small>OUTLOOK SO FAR</small><b>~${proj}</b></div><span class="chip">${m.count}/9 DRAFTED</span></div>`
    : `<div class="outlook" title="Expected record before front-office calls"><div><small>PROJECTED RECORD</small><b>~${proj}</b></div><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span></div>`}
      <div class="outlook"><div><small>162-0 ODDS</small><b>${oddsText(o.perfect)}</b></div><span class="odds-hint">${partial ? `open spots at ${B.REPLACEMENT}` : `${pct(o.perGame)} per game`}</span></div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------------

  function viewHome() {
    const s = session;
    const st = history.stats;
    let cta;
    switch (s.phase) {
      case BB.idle:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="bb-play">${icon('ball')} START YOUR DRAFT ${icon('arrow')}</button>
          <div class="row"><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a><a class="btn btn-secondary" href="#/trophies">${icon('star')} Trophies</a></div>`;
        break;
      case BB.season:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="season">${icon('play')} RESUME SEASON</button>
          <div class="row"><button class="btn btn-secondary" data-act="bb-new">${icon('refresh')} New draft</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
          <p class="resume-note">Game ${s.s.revealed} of 162 · ${rec(s.record)} · your season is saved</p>`;
        break;
      case BB.final:
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="bb-new-now">${icon('ball')} NEW DRAFT ${icon('arrow')}</button>
          <div class="row"><button class="btn btn-secondary" data-act="nav" data-to="season">${icon('trophy')} Last final</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>`;
        break;
      default: {
        const label = s.phase === BB.complete ? 'Starting nine set · ready for Opening Day' : `Round ${s.round} of 9`;
        cta = `<button class="btn btn-primary btn-xl btn-block" data-act="nav" data-to="draft">${icon('play')} CONTINUE DRAFT</button>
          <div class="row"><button class="btn btn-secondary" data-act="bb-new">${icon('refresh')} Start over</button><a class="btn btn-secondary" href="#/history">${icon('history')} Records</a></div>
          <p class="resume-note">${esc(label)}</p>`;
      }
    }
    const recent = history.runs.slice(0, 5);
    const eraStars = db.eras.map((e) => {
      const star = db.players.filter((p) => p.era === e.id).sort((a, b) => b.ovr - a.ovr || (a.id < b.id ? -1 : 1))[0];
      return `<div class="era-tile"><small>${eraYears(e)}</small><b>${esc(e.label)}</b><span>${bpos(star.pos)} ${esc(star.name)} <em>${star.ovr}</em></span></div>`;
    }).join('');
    return `
    <section class="home-hero bb-hero" aria-label="162-0 home">
      <div id="home-title" class="wordmark">162-0</div>
      <div class="hero-kicker">BUILD THE UNBEATEN NINE</div>
      <p class="hero-sub">Draft. Deploy. Dominate 162.</p>
      <div class="bb-stage" aria-hidden="true"><div class="bb-turf"></div><div class="bb-tee"></div><div class="bb-float">${BASEBALL_SVG}</div></div>
      <div class="hero-cta">${cta}</div>
      <div class="stat-tiles">
        <div class="stat-tile"><b class="num">${st.bestRecord}</b><span>BEST RECORD</span></div>
        <div class="stat-tile gold"><b class="num">${st.perfect}</b><span>162-0 SEASONS</span></div>
        <div class="stat-tile"><b class="num">${st.total}</b><span>TOTAL RUNS</span></div>
      </div>
    </section>

    <div class="home-grid">
      <section class="card" aria-labelledby="bb-loop-title">
        <div class="card-head"><h2 class="card-title" id="bb-loop-title">The core loop</h2><span class="chip">9 picks · 162 games</span></div>
        <div class="loop-steps">
          <div class="loop-step"><i>1</i><b>SPIN</b><span>Random club + era</span></div>
          <div class="loop-step"><i>2</i><b>DRAFT</b><span>Any player in the pool</span></div>
          <div class="loop-step"><i>3</i><b>PLACE</b><span>Put him on the diamond</span></div>
          <div class="loop-step"><i>4</i><b>PLAY</b><span>162 games</span></div>
        </div>
        <p class="hint">${icon('info')} Pitcher and catcher are specialists. Everyone else can move around the diamond, at a cost.</p>
      </section>
      <section class="card" aria-labelledby="bb-recent-title">
        <div class="card-head"><h2 class="card-title" id="bb-recent-title">Recent seasons</h2>${history.runs.length ? '<a class="chip" href="#/history">View all</a>' : ''}</div>
        ${recent.length ? `<div class="run-list">${recent.map(runRow).join('')}</div>`
          : '<div class="empty"><b>No seasons recorded yet</b>Draft your first nine and chase a perfect 162-0.</div>'}
      </section>
    </div>

    <section class="card bb-eras" aria-labelledby="bb-eras-title">
      <div class="card-head"><h2 class="card-title" id="bb-eras-title">Four eras, 29 clubs</h2><span class="chip">${db.players.length.toLocaleString('en-US')} players</span></div>
      <div class="era-tiles">${eraStars}</div>
      <p class="hint">${icon('info')} Every club and player is an original 162-0 creation. Ratings are gameplay values, not real statistics.</p>
    </section>`;
  }

  function runRow(run) {
    const tier = B.tierFor(run.wins);
    const top = run.roster.reduce((b, p) => (!b || p.ovr > b.ovr ? p : b), null);
    return `<button class="run-row" data-act="bb-run-detail" data-id="${esc(run.id)}">
      <span class="run-rec num" style="color:${tier.color}">${run.wins}-${run.losses}</span>
      <span class="run-meta"><b>${esc(top ? top.name : 'Your nine')} &amp; co.</b><span>${fmtDate(run.date)} · ${run.overall} OVR · ${run.chemistry} CHEM · ${ord(run.rank)} of 30</span></span>
      <span class="run-side"><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span></span>
    </button>`;
  }

  const fmtDate = (iso, long = false) => new Date(iso).toLocaleDateString(undefined, long
    ? { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' });

  // ---------------------------------------------------------------------------
  // DRAFT
  // ---------------------------------------------------------------------------

  function viewDraft() {
    const s = session;
    if (s.phase === BB.complete) return viewLocked();
    const stageIdx = { [BB.spin]: 0, [BB.revealed]: 1, [BB.compare]: 2 }[s.phase] ?? 0;
    const stages = ['Spin', 'Reveal', 'Draft & place'].map((label, i) => {
      const cls = i < stageIdx ? 'done' : i === stageIdx ? 'on' : '';
      const line = i < 2 ? `<li class="stage-line ${i < stageIdx ? 'done' : ''}" aria-hidden="true"></li>` : '';
      return `<li class="stage ${cls}"><i>${i < stageIdx ? icon('check') : i + 1}</i>${label}</li>${line}`;
    }).join('');
    const done = s.occupied.length;
    const pips = Array.from({ length: 9 }, (_, i) => `<span class="pip${i < done ? ' done' : i === done ? ' now' : ''}"></span>`).join('');
    const roster = s.roster;
    const main = s.phase === BB.spin ? htmlChoose() : s.phase === BB.revealed ? htmlReveal() : htmlCompare();
    const placing = s.phase === BB.compare ? s.selected : null;
    return `
    <section class="draft bb-draft" aria-labelledby="draft-title">
      <div class="flow-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Leave draft (progress is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">Round ${s.round} of 9</div><h1 id="draft-title">${s.phase === BB.compare && placing ? 'Draft &amp; place' : 'Build your nine'}</h1></div>
        <div class="pips bb-pips" aria-label="${done} of 9 picks made">${pips}</div>
      </div>
      <ol class="stages" aria-label="Pick progress">${stages}</ol>
      ${strip(roster)}
      <div class="draft-grid">
        <div class="draft-main">${main}</div>
        <aside class="draft-aside" aria-label="Your nine">
          <div class="card"><div class="card-head"><span class="card-title">${placing ? 'Tap a spot to place' : 'Your diamond'}</span><span class="chip">${done}/9</span></div>${diamond({ roster, eff: s.s.eff, placing, chosen: s.s.slot, fresh: ui.fresh })}</div>
          <div class="card">${metricsBlock()}</div>
        </aside>
      </div>
    </section>`;
  }

  function teamItem(teamId, target = false) {
    const t = team(teamId);
    return `<div class="ri${target ? ' target' : ''}"><span class="team-badge" style="--tc:${t.c1};--tc2:${t.c2}">${esc(t.abbr)}</span><span class="ri-name">${esc(t.name)}</span></div>`;
  }

  function eraItem(eraId, target = false) {
    const e = era(eraId);
    return `<div class="ri${target ? ' target' : ''}"><span class="ri-era long">${esc(e.label)}</span><span class="ri-sub">${eraYears(e)}</span></div>`;
  }

  function slotHtml(ctx, won = false) {
    if (!ctx) {
      return `<div class="slot" aria-hidden="true">
        ${reelCab('team', 'CLUB', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}
        ${reelCab('era', 'ERA', [BLANK_ITEM, QMARK_ITEM, BLANK_ITEM], 1)}</div>`;
    }
    const [tp, tn] = neighbours(db.teams, team(ctx.team));
    const [ep, en] = neighbours(db.eras, era(ctx.era));
    return `<div class="slot" role="img" aria-label="${esc(team(ctx.team).name)}, ${esc(era(ctx.era).label)}">
      ${reelCab('team', 'CLUB', [teamItem(tp.id), teamItem(ctx.team, true), teamItem(tn.id)], 1, won)}
      ${reelCab('era', 'ERA', [eraItem(ep.id), eraItem(ctx.era, true), eraItem(en.id)], 1, won)}</div>`;
  }

  function htmlChoose() {
    const open = 9 - session.occupied.length;
    return `
      <div class="phase-head"><h2>Spin for your next player</h2><p>One random club, one random era. Any of its nine players can join you — then you pick his spot. ${open} spot${open === 1 ? '' : 's'} left on the diamond.</p></div>
      ${slotHtml(null)}
      <div class="spin-actions">
        <button class="btn btn-primary spin-btn" data-act="bb-spin" id="bb-spin-btn">${icon('refresh')} SPIN</button>
        <div class="kbd-hint"><span><kbd>Space</kbd> or <kbd>Enter</kbd> spin</span></div>
      </div>`;
  }

  function htmlReveal() {
    const s = session;
    const ctx = s.s.context;
    const t = team(ctx.team);
    const e = era(ctx.era);
    const n = s.pool.length;
    const won = ui.justLanded;
    ui.justLanded = false;
    return `
      <div class="phase-head"><h2>${esc(t.name)} · ${esc(e.label)}</h2><p>The reels have spoken. Scout the clubhouse and sign one.</p></div>
      ${slotHtml(ctx, won)}
      <div class="spin-result">
        <div class="sr-top">
          ${badge(ctx.team, 'lg')}
          <div class="sr-text"><div class="kicker">${esc(e.label)} clubhouse</div><b>${esc(t.name)}</b><span>${eraYears(e)}</span></div>
          <div class="sr-count"><b class="num">${n}</b><span>${n === 1 ? 'PLAYER' : 'PLAYERS'}</span></div>
        </div>
        <div class="sr-actions">
          <button class="btn btn-primary btn-xl" data-act="bb-scout">Scout the players ${icon('arrow')}</button>
          <button class="btn btn-gold" data-act="bb-respin" ${s.canRespin ? '' : 'disabled'}>${icon('refresh')} Respin <span class="badge-count">${s.s.respins} left</span></button>
        </div>
        <div class="kbd-hint"><span><kbd>Enter</kbd> scout the players</span>${s.canRespin ? '<span><kbd>R</kbd> respin</span>' : ''}</div>
      </div>`;
  }

  function htmlCompare() {
    const s = session;
    const ctx = s.s.context;
    const t = team(ctx.team);
    const pool = s.pool;
    const sel = s.selected;
    return `
      <div class="compare-head">${badge(ctx.team)}<div class="t"><b>${esc(t.name)} · ${esc(era(ctx.era).label)}</b><span>${pool.length} player${pool.length === 1 ? '' : 's'} can join your nine — pick one, then his spot</span></div>
        ${s.canRespin ? `<button class="btn btn-gold btn-sm" data-act="bb-respin" title="Spin a new club and era">${icon('refresh')} Respin <span class="badge-count">${s.s.respins}</span></button>` : ''}</div>
      <div class="compare-grid">
        <div class="plist" role="listbox" aria-label="Eligible players">${pool.map((p, i) => prow(p, sel?.id === p.id, i)).join('')}</div>
        <div id="pdetail">${playerDetail(sel)}</div>
      </div>
      <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="bb-draft" id="bb-draft-btn">${draftLabel()}</button></div>
      <div class="kbd-hint" style="margin-top:12px"><span><kbd>↑</kbd><kbd>↓</kbd> compare</span><span><kbd>←</kbd><kbd>→</kbd> change spot</span><span><kbd>Enter</kbd> draft</span></div>`;
  }

  function draftLabel() {
    const p = session.selected;
    const slot = session.s.slot;
    return p && slot ? `${icon('check')} Draft ${esc(p.name)} · ${slot}` : `${icon('check')} Pick a player`;
  }

  function prow(p, selected, i) {
    const top = session.slotsFor(p)[0];
    const bars = ratingsOf(p).slice(0, 3).map(([l, v]) => `<span class="mini-bar"><span>${l}</span><i style="--v:${v}%;--bc:${RING[l]}"></i></span>`).join('');
    return `<button class="prow" type="button" role="option" aria-selected="${selected}" data-act="bb-select" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i, 10) * 0.035}s">
      ${hex(p.ovr, 'sm')}
      <span class="prow-main"><span class="prow-name">${esc(p.name)}</span>
        <span class="prow-sub">${bpos(p.pos)}<span class="arch">${esc(p.arch)}</span>${top ? `<span class="fit-tag ${fitClass(top.eff)}">${top.slot} ${B.fitLabel(top.eff)}</span>` : ''}</span></span>
      <span class="mini-bars" aria-hidden="true">${bars}</span>
    </button>`;
  }

  function playerDetail(p) {
    if (!p) return '';
    const s = session;
    const t = team(p.team);
    const e = era(p.era);
    const slots = s.slotsFor(p);
    const slot = s.s.slot || slots[0]?.slot;
    const fit = B.effectiveness(p, slot);
    const rings = ratingsOf(p).map(([l, v]) => ring(l, v, RING[l])).join('');
    const chips = slots.map((x) => `<button type="button" class="place-chip ${fitClass(x.eff)}" data-act="bb-slot" data-slot="${x.slot}" aria-pressed="${x.slot === slot}"><b>${x.slot}</b><span>${B.fitLabel(x.eff)}</span></button>`).join('');
    const cur = s.metrics;
    const proj = s.projected(p, slot);
    const pm = proj.metrics;
    const o = B.seasonOutlook(proj.preview || pm);
    const curO = cur.count ? B.seasonOutlook(cur.count < 9 ? s.previewMetrics : cur) : null;
    const tier = B.tierFor(Math.round(o.wins));
    const before = new Map([...cur.chemistry.bonuses, ...cur.chemistry.penalties].map((b) => [b.reason, b.value]));
    const after = [...pm.chemistry.bonuses, ...pm.chemistry.penalties];
    const afterSet = new Set(after.map((b) => b.reason));
    const diffs = [
      ...after.filter((b) => !before.has(b.reason)).map((b) => ({ text: b.reason, v: b.value })),
      ...[...before].filter(([r]) => !afterSet.has(r)).map(([r, v]) => ({ text: `${r} removed`, v: -v })),
    ].slice(0, 4);
    const unit = (label, now, was) => `<div class="unit"><span>${label}</span><b class="num">${now || '—'}</b>${now ? delta(now, cur.count ? was || null : null) : ''}</div>`;
    return `
      <div class="pcard bb-pcard" id="pcard" style="--tc:${t.c1}">
        <div class="pcard-top">${hex(p.ovr)}<div class="pcard-pos">${bpos(p.pos)}<small>${esc(t.abbr)}</small></div></div>
        <div class="pcard-id">${bavatar(p.name, p.pos)}
          <div class="pcard-name">${esc(p.name)}</div>
          <div class="era-chip">${esc(e.label)} · ${eraYears(e)}</div>
          <div class="pcard-arch">${esc(p.arch)} · ${B.POSITION_NAMES[p.pos]}${p.sec.length ? ` · also ${p.sec.join(', ')}` : ''}</div>
        </div>
        <div class="rings">${rings}</div>
        <div class="pcard-notes">
          <div><span class="plus">+</span><span>${esc(p.str)}</span></div>
          <div><span class="minus">–</span><span>${esc(p.weak)}</span></div>
        </div>
        <div class="place">
          <div class="place-head"><span>PLACE AT</span><b class="fit ${fitClass(fit)}">${B.fitText(fit)}</b></div>
          <div class="place-chips" role="group" aria-label="Choose a spot">${chips}</div>
        </div>
      </div>
      <div class="card impact">
        <div class="card-head"><span class="card-title">Projected team impact</span>${pm.count === 9
    ? `<span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span>`
    : `<span class="chip" title="Open spots play at ${B.REPLACEMENT} until filled">PICK ${pm.count} OF 9</span>`}</div>
        <div class="impact-grid">
          <div class="impact-cell"><b class="num">${pm.overall}</b><span>TEAM</span>${delta(pm.overall, cur.count ? cur.overall : null)}</div>
          <div class="impact-cell"><b class="num">${pm.chemistry.score}</b><span>CHEM</span>${delta(pm.chemistry.score, cur.count ? cur.chemistry.score : null)}</div>
          <div class="impact-cell" title="Expected wins before front-office calls"><b class="num">${Math.round(o.wins)}</b><span>PROJ. WINS</span>${delta(o.wins, curO?.wins)}</div>
          <div class="impact-cell" title="Chance to win any single game"><b class="num">${pct(o.perGame)}</b><span>WIN %</span>${delta(o.perGame * 100, curO ? curO.perGame * 100 : null)}</div>
        </div>
        <div class="units">${unit('BAT', pm.batting, cur.batting)}${unit('PIT', pm.pitching, cur.pitching)}${unit('FLD', pm.defense, cur.defense)}</div>
        ${diffs.length ? `<div class="chem-list" style="margin-top:12px">${diffs.map((d) => `<div class="${d.v >= 0 ? 'plus' : 'minus'}"><span>${esc(d.text)}</span><b>${signed(d.v)}</b></div>`).join('')}</div>` : ''}
      </div>`;
  }

  function viewLocked() {
    const s = session;
    const m = s.metrics;
    const ev = B.evaluate(m);
    const roster = s.roster;
    const chem = [
      '<div><span>Base chemistry</span><b>65</b></div>',
      ...m.chemistry.bonuses.map((x) => `<div class="plus"><span>${esc(x.reason)}</span><b>+${x.value}</b></div>`),
      ...m.chemistry.penalties.map((x) => `<div class="minus"><span>${esc(x.reason)}</span><b>${x.value}</b></div>`),
    ].join('');
    const lineup = B.POSITIONS.map((slot) => {
      const p = roster[slot];
      const e = s.s.eff[slot];
      return `<div class="roster-item">${bavatar(p.name, p.pos)}<div><b>${esc(p.name)}</b><span>${esc(team(p.team).abbr)} · ${esc(era(p.era).label)} · ${esc(p.arch)}</span></div><span class="rr">${bpos(slot)}${e < 1 ? `<span class="fit-tag ${fitClass(e)}">${B.fitLabel(e)}</span>` : ''}<span class="r">${p.ovr}</span></span></div>`;
    }).join('');
    return `
    <section class="locked bb-locked" aria-labelledby="locked-title">
      <div class="flow-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (progress is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">Starting nine complete · 9 of 9</div></div>
      </div>
      <div class="locked-hero"><h1 id="locked-title">Ready for Opening Day</h1><p>Nine players, one pitcher carrying the staff. Can they win all 162?</p></div>
      <div class="locked-grid">
        <div class="col">
          <div class="card">${diamond({ roster, eff: s.s.eff, fresh: ui.fresh })}</div>
          <div class="card"><div class="card-head"><span class="card-title">Lineup card</span><span class="chip">${m.overall} OVR</span></div><div class="roster-list">${lineup}</div></div>
        </div>
        <div class="col">
          <div class="card">${metricsBlock()}</div>
          <div class="card"><div class="card-head"><span class="card-title">Scouting report</span></div>
            <div class="scout-report"><div class="plus"><small>BIGGEST STRENGTH</small><b>${esc(ev.strength)}</b></div><div class="minus"><small>BIGGEST WEAKNESS</small><b>${esc(ev.weakness)}</b></div></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Chemistry breakdown</span><span class="chip">${m.chemistry.score}</span></div><div class="chem-list">${chem}</div></div>
          <div class="sticky-cta"><button class="btn btn-primary btn-xl btn-block" data-act="bb-kickoff">${icon('play')} Play ball · start the 162-game season</button></div>
        </div>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------------------
  // Spin
  // ---------------------------------------------------------------------------

  async function spin() {
    const s = session;
    if (ui.busy || s.phase !== BB.spin || !s.s.context) return;
    const ctx = s.s.context;
    ui.busy = true;
    const btn = $('#bb-spin-btn');
    if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
    haptic(12);
    const teamCab = $('.reel-cab.team');
    const eraCab = $('.reel-cab.era');
    if (teamCab && eraCab && !reducedMotion() && typeof Element.prototype.animate === 'function') {
      sound.spinStart();
      const t = team(ctx.team);
      const e = era(ctx.era);
      const [tp, tn] = neighbours(db.teams, t);
      const [ep, en] = neighbours(db.eras, e);
      const teamFill = B.shuffled(db.teams.filter((x) => x.id !== t.id), Math.random).slice(0, 20);
      const eraStart = Math.floor(Math.random() * db.eras.length);
      const eraFill = Array.from({ length: 24 }, (_, i) => db.eras[(eraStart + i) % db.eras.length]);
      try {
        await Promise.all([
          animateReel(teamCab, [teamItem(tp.id), teamItem(t.id, true), teamItem(tn.id), ...teamFill.map((x) => teamItem(x.id))], 1900),
          animateReel(eraCab, [eraItem(ep.id), eraItem(e.id, true), eraItem(en.id), ...eraFill.map((x) => eraItem(x.id))], 2650),
        ]);
      } catch { /* animation interrupted by navigation */ }
      await sleep(180);
    }
    ui.busy = false;
    if (s.phase !== BB.spin) return;
    s.openContext();
    ui.justLanded = true;
    sound.jackpot();
    haptic([18, 50, 18]);
    if (host.route() === 'draft') host.render();
  }

  /** Updates the detail card, list, diamond and CTA after a selection or spot change. */
  function refreshPick(scrollDetail) {
    const s = session;
    const p = s.selected;
    for (const row of $$('.prow')) row.setAttribute('aria-selected', String(row.dataset.id === p?.id));
    const detail = $('#pdetail');
    if (detail) {
      detail.innerHTML = playerDetail(p);
      $('#pcard')?.classList.add('swap');
    }
    const btn = $('#bb-draft-btn');
    if (btn) btn.innerHTML = draftLabel();
    const card = $('.draft-aside .diamond-wrap')?.parentElement;
    if (card) {
      $('.draft-aside .diamond-wrap').outerHTML = diamond({ roster: s.roster, eff: s.s.eff, placing: p, chosen: s.s.slot });
      const title = $('.card-title', card);
      if (title) title.textContent = 'Tap a spot to place';
    }
    if (scrollDetail && matchMedia('(max-width: 959px)').matches && detail) {
      const top = detail.getBoundingClientRect().top;
      if (top < 60 || top > innerHeight * 0.5) detail.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    } else if (p) {
      $(`.prow[data-id="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function draftPlayer() {
    const s = session;
    if (s.phase !== BB.compare) return;
    const done = s.draftSelected();
    if (!done) return;
    ui.fresh = done.player.id;
    sound.draft();
    haptic(18);
    host.toast(`${done.player.name} drafted · ${done.slot}${done.eff < 1 ? ` (${B.fitLabel(done.eff)} fit)` : ''}`);
    if (s.phase === BB.complete) sound.whistle();
    host.render();
    ui.fresh = null;
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  // ---------------------------------------------------------------------------
  // SEASON
  // ---------------------------------------------------------------------------

  const fast = () => !!host.settings.get('bbFast');

  const runner = {
    timer: null,
    paused: false,
    stop() { clearTimeout(this.timer); this.timer = null; },
    delay(lastGame) {
      if (reducedMotion()) return 60;
      const s = session;
      const r = s.record;
      if (s.s.revealed === 161 && r.losses === 0) return 900;
      if (lastGame && lastGame.result === 'L' && r.losses === 1) return 700;
      return fast() ? 40 : 230;
    },
    schedule(ms) {
      clearTimeout(this.timer);
      this.timer = null;
      if (this.paused) return;
      this.timer = setTimeout(() => { this.timer = null; this.step(); }, ms ?? this.delay());
    },
    step() {
      const s = session;
      if (host.route() !== 'season' || s.phase !== BB.season || this.paused) return;
      const locked = s.lockedCall;
      if (locked) { openCall(locked, true); return; }
      const due = s.dueCall;
      if (due) { openCall(due, false); return; }
      const g = s.revealNext();
      if (!g) return;
      showGame(g, true);
      if (s.phase === BB.final) { finishSeason(); return; }
      if (g.n % 27 === 0) { haptic(8); sound.tick(); }
      this.schedule(this.delay(g));
    },
  };

  function viewSeason() {
    const s = session;
    const done = s.phase === BB.final;
    const marks = B.COACHING_CALLS.map((c) => `<span class="route-mark" id="bb-mark-${c.id}" style="left:${(c.checkpoint / 162) * 100}%"><span>G${c.checkpoint}</span></span>`).join('');
    const months = B.MONTHS.map(([label, a, z], i) => {
      const cells = [];
      for (let n = a; n <= z; n++) cells.push(`<i class="cell" data-n="${n}"></i>`);
      return `<div class="month"><div class="stretch-head"><span>${label} · <span class="num" id="bb-mrec-${i}">0-0</span></span><em id="bb-mcall-${i}"></em></div><div class="mcells">${cells.join('')}</div></div>`;
    }).join('');
    const m = s.metrics;
    return `
    <section class="season bb-season" aria-labelledby="season-title">
      <div class="season-head">
        <button class="icon-btn" data-act="nav" data-to="home" aria-label="Back to home (season is saved)">${icon('x')}</button>
        <div class="flow-title"><div class="kicker">162-game regular season</div><h1 id="season-title">${done ? 'Final record' : 'Regular season'}</h1></div>
        <div class="season-controls">
          <span class="chip orange live" id="live-chip"><span class="dot"></span><span id="live-text">LIVE</span></span>
          ${done ? '' : `<div class="seg" role="group" aria-label="Simulation speed">
            <button data-act="bb-speed" data-fast="0" aria-pressed="${!fast()}">Watch</button><button data-act="bb-speed" data-fast="1" aria-pressed="${fast()}">Fast</button></div>
            <button class="icon-btn" data-act="bb-pause" id="bb-pause-btn" aria-label="Pause">${icon('pause')}</button>`}
        </div>
      </div>
      <div id="final-slot">${done ? htmlFinal() : ''}</div>
      <div class="season-layout">
        <div class="col">
          <div class="scoreboard bb-board">
            ${BOARD_LINES}
            <div class="kicker muted" style="position:relative">162-GAME SCOREBOARD</div>
            <div class="record" aria-live="off">
              <div class="record-col"><span class="record-num w" id="sb-w">0</span><span class="record-label">WINS</span></div>
              <span class="record-dash">–</span>
              <div class="record-col"><span class="record-num l zero" id="sb-l">0</span><span class="record-label">LOSSES</span></div>
            </div>
            <span class="chip sb-status" id="sb-status">OPENING DAY</span>
            <div class="route"><div class="route-head"><span>GAME <b id="bb-gameno">0</b> OF 162</span><b id="route-pct">0%</b></div>
              <div class="route-track"><div class="route-fill" id="route-fill"></div>${marks}</div></div>
          </div>
          <div id="linescore">${lineScoreHtml(s.revealedGames.at(-1) || null)}</div>
          <div class="card season-map bb-map">
            <div class="card-head"><span class="card-title">Season calendar</span><span class="map-legend"><span><i style="background:var(--win)"></i>Win</span><span><i style="background:var(--loss)"></i>Loss</span></span></div>
            ${months}
          </div>
        </div>
        <div class="col">
          <div class="card"><div class="card-head"><span class="card-title">Standings</span><span class="chip" id="bb-rank">30 CLUBS</span></div><div id="bb-standings"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Recent results</span><span class="chip" id="nb-count">LAST 0</span></div><div class="notebook" id="notebook"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Front-office calls</span><span class="chip gold" id="dec-count">0 / 3 CALLED</span></div><div class="decisions" id="decisions"></div></div>
          <div class="card"><div class="card-head"><span class="card-title">Your nine</span><span class="chip">${m.overall} OVR</span></div>
            <div class="team-stats">
              <div class="metric-cell"><b>${m.batting}</b><span>BAT</span></div><div class="metric-cell"><b>${m.pitching}</b><span>PIT</span></div>
              <div class="metric-cell"><b>${m.defense}</b><span>FLD</span></div><div class="metric-cell"><b>${m.chemistry.score}</b><span>CHEM</span></div>
              <div class="metric-cell"><b id="bb-rs">0</b><span>RUNS</span></div><div class="metric-cell"><b id="bb-ra">0</b><span>ALLOWED</span></div>
              <div class="metric-cell"><b id="bb-diff">0</b><span>DIFF</span></div><div class="metric-cell"><b id="bb-sho">0</b><span>SHUTOUTS</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function fxFor(n) {
    const call = B.callForGame(n);
    const d = call && session.s.calls.find((c) => c.id === call.id);
    return d ? B.callEffect(d.option, session.metrics) : {};
  }

  /** Baseball line score: visitors on top, innings 1–9 (+ extras), R. */
  function lineScoreHtml(g, animate = false) {
    const s = session;
    if (!g) {
      const next = s.schedule?.[0];
      const t = next ? team(next.opp) : null;
      return `<div class="linescore idle">
        <div class="gc-head"><span>OPENING DAY · ${next?.home ? 'HOME' : 'AWAY'}</span><span class="gc-state">PREGAME</span></div>
        <div class="gc-pre"><span class="spot-icon">${icon('scope')}</span><div><b>First pitch is coming up</b><span>${t ? `${next.home ? 'vs' : 'at'} ${esc(t.name)} · club rating ${next.str}` : 'The grounds crew is lining the field'}</span></div></div>
      </div>`;
    }
    const t = team(g.opp);
    const extra = g.inn > 9;
    const chance = B.gameOdds(s.metrics, { home: g.home, round: g.n - 1, opp: s.league.opponents[g.oi - 1], fx: fxFor(g.n) });
    const rows = g.home
      ? [{ name: t.city, b: badge(g.opp, 'sm'), inn: g.top, r: g.them, you: false }, { name: 'Your nine', b: youBadge(), inn: g.bottom, r: g.us, you: true }]
      : [{ name: 'Your nine', b: youBadge(), inn: g.top, r: g.us, you: true }, { name: t.city, b: badge(g.opp, 'sm'), inn: g.bottom, r: g.them, you: false }];
    let k = 0;
    const cell = (v) => `<span class="q${animate ? ' in' : ''}"${animate ? ` style="animation-delay:${(k++) * 12}ms"` : ''}>${v == null ? 'X' : v}</span>`;
    const line = (row) => {
      const regulation = row.inn.slice(0, 9);
      const ex = extra ? row.inn.slice(9).reduce((a, b) => a + (b || 0), 0) : null;
      return `<span class="gc-team${row.you ? ' you' : ''}">${row.b}<b>${esc(row.name)}</b></span>${regulation.map(cell).join('')}${extra ? cell(ex) : ''}<b class="gc-tot">${row.r}</b>`;
    };
    const walkoff = g.home && g.result === 'W' && g.bottom.at(-1) != null;
    const note = walkoff ? 'WALK-OFF WIN' : g.them === 0 ? 'SHUTOUT' : g.result === 'W' && g.us - g.them >= 8 ? 'BLOWOUT' : '';
    return `<div class="linescore ${g.result}${animate ? ' stamped' : ''}${extra ? ' extra' : ''}" id="ls">
      <div class="gc-head"><span>GAME ${g.n} · ${g.home ? 'VS' : 'AT'} ${esc(t.abbr)}</span><span class="gc-state">${extra ? `F/${g.inn}` : 'FINAL'}</span></div>
      <div class="ls-grid">
        <span></span>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<span class="gc-ql">${i}</span>`).join('')}${extra ? '<span class="gc-ql">10+</span>' : ''}<span class="gc-ql">R</span>
        ${line(rows[0])}
        ${line(rows[1])}
      </div>
      <div class="gc-foot"><span>${esc(t.name)} · RATING <b>${g.str}</b></span><span>${note ? `<b class="ls-note">${note}</b> · ` : ''}WIN CHANCE <b>${pct(chance)}</b></span></div>
      <span class="gc-stamp" aria-label="${g.result === 'W' ? 'Win' : 'Loss'}">${g.result}</span>
    </div>`;
  }

  function showGame(g, isNew) {
    const box = $('#linescore');
    if (box) box.innerHTML = lineScoreHtml(g, isNew && !fast() && !reducedMotion());
    updateBoard(isNew);
    if (isNew && !fast()) { if (g.result === 'W') sound.tap(); else haptic(20); }
  }

  function statusOf(n, r, firstLossAt, streak, done) {
    if (done) return r.wins === 162 ? ['PERFECT SEASON', 'gold'] : ['SEASON COMPLETE', 'gold'];
    if (n === 0) return ['OPENING DAY', ''];
    if (firstLossAt === n) return ['BOUNCE BACK · NEXT GAME', 'loss'];
    if (r.wins === n) {
      if (n === 161) return ['ONE. MORE.', 'gold'];
      if (n === 160) return ['TWO LEFT', 'gold'];
      if (n >= 140) return ['PERFECTION IN SIGHT', 'gold'];
      if (n >= 81) return ['HALFWAY PERFECT', 'gold'];
      if (n >= 10) return ['PERFECT START', 'gold'];
      return ['EVERY GAME COUNTS', 'gold'];
    }
    return streak >= 3 ? [`${streak} GAME WIN STREAK`, 'win'] : ['BUILDING YOUR SEASON', ''];
  }

  function standingsHtml(table, done) {
    if (!table.length) return '';
    const youAt = table.findIndex((x) => x.idx === 0);
    const top = table.slice(0, 5).map((x, i) => [x, i]);
    if (youAt >= 5) top.push([table[youAt], youAt]);
    const row = ([x, i]) => {
      const t = x.idx === 0 ? null : team(x.id);
      return `<div class="st-row${x.idx === 0 ? ' you' : ''}"><span class="st-rank">${i + 1}</span><span class="st-club">${x.idx === 0 ? youBadge() : badge(x.id, 'sm')}<b>${x.idx === 0 ? 'Your nine' : esc(t.name)}</b></span><span class="num">${x.w}</span><span class="num">${x.l}</span><span class="num">${B.pctText(x.w, x.l)}</span><span class="num">${gbText(x.gb)}</span></div>`;
    };
    const all = done ? `<details class="st-all"><summary>Full standings · 30 clubs</summary><div class="st-table">${table.map((x, i) => row([x, i])).join('')}</div></details>` : '';
    return `<div class="st-table"><div class="st-row st-head"><span>#</span><span>CLUB</span><span>W</span><span>L</span><span>PCT</span><span>GB</span></div>${top.map(row).join('')}</div>${all}`;
  }

  function updateBoard(newGame = false) {
    const s = session;
    const games = s.revealedGames;
    const n = games.length;
    const r = B.recordOf(games);
    const done = s.phase === BB.final;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sb-w', r.wins);
    set('sb-l', r.losses);
    $('#sb-l')?.classList.toggle('zero', r.losses === 0);
    const firstLoss = games.findIndex((g) => g.result === 'L');
    const [status, tone] = statusOf(n, r, firstLoss === -1 ? null : firstLoss + 1, B.activeStreak(games), done);
    const st = $('#sb-status');
    if (st) { st.textContent = status; st.className = `chip sb-status ${tone}`; }
    set('bb-gameno', n);
    set('route-pct', `${Math.round((n / 162) * 100)}%`);
    const fill = $('#route-fill');
    if (fill) fill.style.width = `${(n / 162) * 100}%`;
    for (const c of B.COACHING_CALLS) $(`#bb-mark-${c.id}`)?.classList.toggle('done', s.s.calls.some((d) => d.id === c.id));

    const chip = $('#live-chip');
    if (chip) {
      const dlg = $('#bb-coach-dialog')?.open;
      chip.className = `chip ${done || dlg ? 'gold' : runner.paused ? '' : 'orange live'}`;
      set('live-text', done ? 'FINAL' : dlg ? 'FRONT OFFICE' : runner.paused ? 'PAUSED' : 'LIVE');
    }

    // Calendar: only touch cells that changed.
    for (const c of $$('.bb-map .cell')) {
      const g = games[Number(c.dataset.n) - 1];
      const cls = `cell${g ? ` ${g.result}` : ''}${g && g.n === n && !done ? ' last' : ''}`;
      if (c.className !== cls) c.className = cls;
    }
    B.MONTHS.forEach(([, a, z], i) => {
      const part = games.slice(a - 1, z);
      set(`bb-mrec-${i}`, rec(B.recordOf(part)));
      const call = B.COACHING_CALLS.find((c) => c.checkpoint === a - 1);
      const d = call && s.s.calls.find((x) => x.id === call.id);
      set(`bb-mcall-${i}`, d ? d.title : i === 0 ? 'Opening Day' : '');
    });

    // Standings: every game in Watch mode, every few games in Fast mode.
    if (!newGame || !fast() || n % 6 === 0 || done || n === 1) {
      const table = s.standings(n);
      const box = $('#bb-standings');
      if (box) box.innerHTML = standingsHtml(table, done);
      const at = table.findIndex((x) => x.idx === 0) + 1;
      set('bb-rank', n ? `${ord(at)} OF 30` : '30 CLUBS');
    }

    const nb = $('#notebook');
    if (nb) {
      const recent = games.slice(-6).reverse();
      nb.innerHTML = recent.length ? recent.map((g, i) => {
        const t = team(g.opp);
        return `<div class="nb-row ${g.result}${i === 0 && newGame && !fast() ? ' new' : ''}">
          <span class="nb-num">${String(g.n).padStart(3, '0')}</span>
          <span class="nb-main"><b>${g.result === 'W' ? 'WIN' : 'LOSS'}${g.inn > 9 ? ` · F/${g.inn}` : ''}</b><span>${g.home ? 'vs' : 'at'} ${esc(t.name)}</span></span>
          <span class="nb-score">${g.us}-${g.them}</span><span class="nb-margin">${signed(g.us - g.them)}</span></div>`;
      }).join('') : '<div class="empty">The grounds crew is lining the field…</div>';
      set('nb-count', `LAST ${recent.length}`);
    }

    const dec = $('#decisions');
    if (dec) {
      const next = B.COACHING_CALLS.find((c) => !s.s.calls.some((d) => d.id === c.id));
      dec.innerHTML = B.COACHING_CALLS.map((c) => {
        const d = s.s.calls.find((x) => x.id === c.id);
        return `<div class="decision${d ? ' made' : ''}"><i>G${c.checkpoint}</i><div><b>${esc(d ? d.title : c.title)}</b><span>${d ? `${esc(d.summary)} · games ${c.checkpoint + 1}–${c.endGame}` : c === next ? `${esc(c.chapter.toLowerCase().replace(/^./, (x) => x.toUpperCase()))} · after game ${c.checkpoint}` : `Unlocks after game ${c.checkpoint}`}</span></div></div>`;
      }).join('');
      set('dec-count', `${s.s.calls.length} / 3 CALLED`);
    }

    if (n) {
      const sum = B.seasonSummary(games);
      set('bb-rs', sum.runsFor);
      set('bb-ra', sum.runsAgainst);
      set('bb-diff', signed(sum.diff));
      set('bb-sho', sum.shutouts);
    }
  }

  function mountSeason() {
    const s = session;
    updateBoard(false);
    if (s.phase === BB.final) return;
    runner.paused = false;
    syncPause();
    const call = s.lockedCall || s.dueCall;
    if (call) { openCall(call, !!s.lockedCall); return; }
    runner.schedule(s.s.revealed === 0 ? 900 : 400);
  }

  function syncPause() {
    const b = $('#bb-pause-btn');
    if (!b) return;
    b.innerHTML = icon(runner.paused ? 'play' : 'pause');
    b.setAttribute('aria-label', runner.paused ? 'Resume' : 'Pause');
  }

  function togglePause() {
    if (session.phase !== BB.season || $('#bb-coach-dialog')?.open) return;
    runner.paused = !runner.paused;
    syncPause();
    if (runner.paused) runner.stop(); else runner.schedule(150);
    updateBoard(false);
  }

  function openCall(call, locked) {
    runner.stop();
    const d = host.dialog('bb-coach-dialog');
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
    const table = s.standings();
    const at = table.findIndex((x) => x.idx === 0);
    const me = table[at];
    let body;
    if (locked) {
      const d = s.s.calls.find((x) => x.id === call.id);
      body = `<div class="locked-call"><div class="seal">${icon('seal')}</div><div class="kicker">CALL LOCKED</div><h3>${esc(d?.title || '')}</h3><p>${esc(d?.summary || '')}. Games ${call.checkpoint + 1}–${call.endGame} have been planned.</p></div>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-xl" data-act="bb-call-continue" data-call="${call.id}">${icon('play')} Continue season</button>
          ${s.s.secondChanceUsed ? '' : `<button class="btn btn-gold" data-act="bb-second-chance" data-call="${call.id}">${icon('refresh')} Second chance <span class="badge-count">1 per season</span></button>`}
        </div>`;
    } else {
      body = `<div class="kicker muted" style="margin-bottom:10px">MAKE THE CALL</div><div class="options">${call.options.map((o, i) => `
        <button class="option" data-act="bb-call-pick" data-call="${call.id}" data-opt="${o.id}">
          <span class="option-icon">${icon(o.icon)}</span>
          <span><span class="option-top"><b>${esc(o.title)}</b><span><span class="chip orange">${o.impact}</span> <kbd>${i + 1}</kbd></span></span><p>${esc(o.detail)}</p></span>
        </button>`).join('')}</div>`;
    }
    return `<div class="sheet-body">
      <div class="kicker">${call.chapter}</div>
      <h2>${esc(call.title)}</h2>
      <p>${esc(call.prompt)}</p>
      <div class="sheet-metrics"><div><b class="num">${rec(r)}</b><span>RECORD</span></div><div><b>${me ? ord(at + 1) : '—'}</b><span>STANDING</span></div><div><b>${me ? gbText(me.gb) : '—'}</b><span>GAMES BACK</span></div></div>
      <div class="sheet-metrics bb-strengths"><div><b>${m.batting}</b><span>BAT</span></div><div><b>${m.pitching}</b><span>PIT</span></div><div><b>${m.stamina}</b><span>STAMINA</span></div></div>
      ${body}
    </div>`;
  }

  function finishSeason() {
    const s = session;
    ensureRecorded();
    const r = B.recordOf(s.s.games);
    const slot = $('#final-slot');
    if (slot) slot.innerHTML = htmlFinal();
    $('.bb-season .seg')?.remove();
    $('#bb-pause-btn')?.remove();
    const title = $('#season-title');
    if (title) title.textContent = 'Final record';
    updateBoard(false);
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    sound.finale(Math.round((r.wins / 162) * 82));
    haptic(r.wins >= 110 ? [30, 60, 30, 60, 80] : 40);
    if (r.wins === 162) { confetti({ count: 260, duration: 4800 }); setTimeout(() => confetti({ count: 180 }), 900); } else if (r.wins >= 110) confetti();
  }

  function htmlFinal() {
    const s = session;
    const sum = B.seasonSummary(s.s.games);
    const tier = B.tierFor(sum.wins);
    const table = s.standings(162);
    const rank = table.findIndex((x) => x.idx === 0) + 1;
    const me = table[rank - 1];
    const second = table[1];
    const standing = rank === 1 ? `Finished 1st of 30${second ? ` · ${gbText(second.gb)} games ahead` : ''}` : `Finished ${ord(rank)} of 30 · ${gbText(me.gb)} games back`;
    const record = sum.wins > 116 && !sum.perfect ? '<span class="chip gold">More wins than any real big-league team ever</span>' : '';
    const calls = s.s.calls.map((d) => `<span class="chip gold">${esc(d.title)}</span>`).join('');
    const label = (g) => (g ? `${g.us}-${g.them} <small>G${g.n}</small>` : '—');
    return `<div class="final bb-final" style="--tier:${tier.color}">
      <span class="final-tier">${icon(sum.perfect ? 'crown' : 'trophy')} ${tier.label}</span>
      <div class="final-record${sum.perfect ? ' perfect' : ''}">${rec(sum)}</div>
      <p class="final-line">${FINAL_LINES[tier.key]}</p>
      <p class="final-standing">${icon('trophy')} ${standing}</p>
      ${record ? `<div class="final-calls">${record}</div>` : ''}
      <div class="final-months">${sum.months.map((x) => `<div><small>${x.label.slice(0, 3)}</small><b>${x.wins}-${x.losses}</b><i style="--v:${(x.wins / (x.wins + x.losses || 1)) * 100}%"></i></div>`).join('')}</div>
      <div class="final-stats">
        <div><b>${B.pctText(sum.wins, sum.losses)}</b><span>WIN PCT</span></div>
        <div><b>${signed(sum.diff)}</b><span>RUN DIFF</span></div>
        <div><b>${sum.shutouts}</b><span>SHUTOUTS</span></div>
        <div><b>${sum.longestWinStreak}</b><span>LONGEST STREAK</span></div>
      </div>
      <p class="final-extra">Best win ${label(sum.bestWin)} · ${sum.extras} extra-inning game${sum.extras === 1 ? '' : 's'} · ${sum.walkoffs} walk-off${sum.walkoffs === 1 ? '' : 's'}</p>
      ${calls ? `<div class="final-calls">${calls}</div>` : ''}
      <div class="final-actions">
        <button class="btn btn-primary btn-xl" data-act="bb-new-now">${icon('ball')} New draft</button>
        <div class="row">
          ${s.canRunItBack
    ? `<button class="btn btn-gold" data-act="bb-run-it-back">${icon('repeat')} Run it back <span class="badge-count">1 left</span></button>`
    : `<button class="btn btn-secondary" disabled>${icon('repeat')} Run it back used</button>`}
          <button class="btn btn-secondary" data-act="bb-share">${icon('share')} Share result</button>
        </div>
        <button class="btn btn-ghost" data-act="bb-home-reset">${icon('home')} Back to home</button>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Sharing
  // ---------------------------------------------------------------------------

  function shareText(run) {
    const tier = B.tierFor(run.wins);
    const months = B.MONTHS.map(([label], i) => `${label.slice(0, 3)} ${run.months[i][0]}-${run.months[i][1]}`);
    const url = `${location.origin}${location.pathname}?game=162-0`;
    return `162-0 ⚾ ${run.wins}-${run.losses} · ${tier.label}\n${months.slice(0, 3).join(' · ')}\n${months.slice(3).join(' · ')}\n${B.pctText(run.wins, run.losses)} · ${signed(run.diff)} run diff · ${ord(run.rank)} of 30\nCan you go 162-0? ${url}`;
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
    const sum = B.seasonSummary(s.s.games);
    const table = s.standings(162);
    return { wins: sum.wins, losses: sum.losses, diff: sum.diff, rank: table.findIndex((x) => x.idx === 0) + 1, months: sum.months.map((x) => [x.wins, x.losses]) };
  }

  // ---------------------------------------------------------------------------
  // HISTORY / TROPHIES / SETTINGS
  // ---------------------------------------------------------------------------

  function viewHistory() {
    const f = ui.filter;
    const runs = history.runs.filter((r) => (f === 'perfect' ? r.perfect : f === '110' ? r.wins >= 110 : true));
    const btn = (key, label) => `<button data-act="bb-filter" data-f="${key}" aria-pressed="${f === key}">${label}</button>`;
    return `
    <div class="page-head"><div><div class="kicker">Records</div><h1>Season history</h1><p>${history.runs.length} seasons on file · best ${history.stats.bestRecord}</p></div>
      <div class="filters" role="group" aria-label="Filter seasons">${btn('all', 'All')}${btn('perfect', '162-0')}${btn('110', '110+ Wins')}</div></div>
    ${runs.length ? `<div class="run-list">${runs.map(runRow).join('')}</div>`
      : `<div class="card empty"><b>${history.runs.length ? 'No seasons match this filter' : 'No seasons recorded yet'}</b>${history.runs.length ? 'Keep drafting — history is made one season at a time.' : 'Finish a 162-game season and it will be saved here.'}</div>`}`;
  }

  function openRunDetail(id) {
    const run = history.runs.find((r) => r.id === id);
    if (!run) return;
    const tier = B.tierFor(run.wins);
    const d = host.dialog('bb-run-dialog');
    d.innerHTML = `<div class="sheet-body">
      <div class="detail-head"><span class="tier-chip" style="--tier:${tier.color}">${tier.label}</span><button class="icon-btn" data-act="close-dialog" aria-label="Close">${icon('x')}</button></div>
      <div class="detail-rec" style="color:${tier.color}">${run.wins}-${run.losses}</div>
      <p>${fmtDate(run.date, true)} · ${ord(run.rank)} of 30</p>
      <div class="sheet-metrics"><div><b>${run.overall}</b><span>TEAM</span></div><div><b>${run.chemistry}</b><span>CHEM</span></div><div><b>${signed(run.diff)}</b><span>RUN DIFF</span></div></div>
      <div class="final-months compact">${B.MONTHS.map(([label], i) => `<div><small>${label.slice(0, 3)}</small><b>${run.months[i][0]}-${run.months[i][1]}</b><i style="--v:${(run.months[i][0] / 27) * 100}%"></i></div>`).join('')}</div>
      <div class="roster-list">${run.roster.map((p) => `<div class="roster-item">${bavatar(p.name, p.pos)}<div><b>${esc(p.name)}</b><span>${esc(team(p.team).abbr)} · ${esc(era(p.era).label)}</span></div><span class="rr">${bpos(p.slot)}${p.eff < 1 ? `<span class="fit-tag ${fitClass(p.eff)}">${B.fitLabel(p.eff)}</span>` : ''}<span class="r">${p.ovr}</span></span></div>`).join('')}</div>
      ${run.calls?.length ? `<div class="final-calls">${run.calls.map((x) => `<span class="chip gold">${esc(x.title)}</span>`).join('')}</div>` : ''}
      <div class="sheet-actions"><button class="btn btn-secondary" data-act="bb-share-run" data-id="${esc(run.id)}">${icon('share')} Share this season</button></div>
    </div>`;
    d.onclick = (e) => { if (e.target === d) d.close(); };
    d.oncancel = null;
    d.showModal();
  }

  function viewTrophies() {
    const list = baseballAchievements(history);
    const on = list.filter((a) => a.unlocked).length;
    return `
    <div class="page-head"><div><div class="kicker">Trophy case</div><h1>Milestones</h1><p>Earned from your saved 162-0 seasons on this device.</p></div></div>
    <div class="trophy-summary"><b>${on}/${list.length}</b><div style="flex:1"><span>milestones unlocked</span><div class="bar" style="margin-top:8px"><i style="--v:${(on / list.length) * 100}%"></i></div></div></div>
    <div class="trophies">${list.map((a) => `<div class="trophy${a.unlocked ? ' on' : ''}">
      <span class="trophy-icon">${icon(a.icon)}</span>
      <div><b>${esc(a.title)}</b><p>${esc(a.description)}</p>
      ${a.unlocked ? '<div class="t-prog"><span class="chip gold">Unlocked</span></div>' : `<div class="t-prog"><div class="bar"><i style="--v:${a.progress * 100}%"></i></div><span>${esc(a.progressLabel)}</span></div>`}</div>
    </div>`).join('')}</div>`;
  }

  function viewSettings() {
    const st = host.settings;
    const sw = (key, label, sub) => `<div class="set-row"><div><b>${label}</b><span>${sub}</span></div><button class="switch" role="switch" aria-checked="${!!st.get(key)}" aria-label="${label}" data-act="toggle" data-key="${key}"></button></div>`;
    const inProgress = session.phase !== BB.idle;
    return `
    <div class="page-head"><div><div class="kicker">162-0 preferences</div><h1>Settings</h1></div></div>
    <div class="settings">
      <section class="set-group"><h2>GAMEPLAY</h2>
        ${sw('bbFast', 'Fast simulation', 'Race through the 162-game schedule instead of watching each final')}
        ${sw('sound', 'Sound effects', 'Subtle cues for spins, signings, front-office calls and the last out')}
        ${canVibrate() ? sw('haptics', 'Vibration', 'Haptic taps for signings and results on supported phones') : ''}
        <div class="set-row"><div><b>Clubs &amp; players</b><span>29 original clubs and 1,044 fictional players across four eras</span></div></div>
      </section>
      <section class="set-group"><h2>DATA</h2>
        ${inProgress ? '<div class="set-row"><div><b>Abandon current run</b><span>Clears the draft or season in progress</span></div><button class="btn btn-secondary" data-act="bb-abandon">Abandon</button></div>' : ''}
        <div class="set-row"><div><b>Delete season history</b><span>${history.runs.length} saved season${history.runs.length === 1 ? '' : 's'} on this device</span></div><button class="btn btn-secondary danger" data-act="bb-clear-history" ${history.runs.length ? '' : 'disabled'}>${icon('trash')} Delete</button></div>
      </section>
      <section class="set-group"><h2>ABOUT</h2>
        <div class="set-row"><div><b>162-0 for iPhone &amp; iPad</b><span>Coming soon to the App Store</span></div><span class="chip">SOON</span></div>
        <a class="set-row" href="${new URL('../../support/', import.meta.url).href}"><div><b>Support</b><span>Questions, feedback and bug reports</span></div>${icon('arrow')}</a>
        <a class="set-row" href="${new URL('../../privacy/', import.meta.url).href}"><div><b>Privacy policy</b><span>The web edition stores your progress only in this browser</span></div>${icon('arrow')}</a>
      </section>
      <p class="fine-print">All clubs, players and ratings in 162-0 are fictional. Eras are historical date ranges used to organize original gameplay content. Not affiliated with MLB or any team.</p>
    </div>`;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function act(name, el) {
    const s = session;
    if (!s) return;
    switch (name) {
      case 'bb-play': s.startDraft(); sound.tap(); host.go('draft'); break;
      case 'bb-new': {
        const ok = await host.confirm({ title: 'Start a new draft?', body: 'Your current draft or season in progress will be cleared.', confirm: 'Start new draft', danger: true });
        if (ok) { ensureRecorded(); s.startDraft(); host.go('draft'); }
        break;
      }
      case 'bb-new-now': ensureRecorded(); s.startDraft(); sound.tap(); host.go('draft'); break;
      case 'bb-home-reset': ensureRecorded(); s.resetToIdle(); host.go('home'); break;
      case 'bb-spin': spin(); break;
      case 'bb-respin':
        if (!ui.busy && s.respin()) { ui.autoSpin = true; host.render(); window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
        break;
      case 'bb-scout': if (s.scout()) { sound.tap(); host.render(); } break;
      case 'bb-select':
        if (s.select(el.dataset.id)) refreshPick(true);
        break;
      case 'bb-slot':
        if (s.chooseSlot(el.dataset.slot)) { sound.tick(); refreshPick(false); }
        break;
      case 'bb-draft': draftPlayer(); break;
      case 'bb-kickoff':
        if (s.kickoff()) { sound.whistle(); haptic(20); host.go('season'); }
        break;
      case 'bb-speed': {
        const f = el.dataset.fast === '1';
        host.settings.set('bbFast', f);
        for (const b of $$('.bb-season .seg button')) b.setAttribute('aria-pressed', String((b.dataset.fast === '1') === f));
        if (runner.timer) runner.schedule();
        break;
      }
      case 'bb-pause': togglePause(); break;
      case 'bb-call-pick': {
        const call = B.callById(el.dataset.call);
        if (call && s.applyCall(call.id, el.dataset.opt)) {
          sound.stamp(); haptic(25);
          $('#bb-coach-dialog').innerHTML = htmlCall(call, true);
          updateBoard(false);
        }
        break;
      }
      case 'bb-second-chance': {
        const call = B.callById(el.dataset.call);
        if (call && s.secondChance(call.id)) {
          sound.open();
          $('#bb-coach-dialog').innerHTML = htmlCall(call, false);
          updateBoard(false);
          host.toast('Call rewound — make a new one');
        }
        break;
      }
      case 'bb-call-continue':
        s.finalizeCall(el.dataset.call);
        $('#bb-coach-dialog')?.close();
        runner.paused = false;
        syncPause();
        updateBoard(false);
        runner.schedule(300);
        break;
      case 'bb-run-it-back':
        if (s.runItBack()) { sound.whistle(); host.toast('Same nine. New schedule.'); host.render(); }
        break;
      case 'bb-share': share(currentRun()); break;
      case 'bb-share-run': { const run = history.runs.find((r) => r.id === el.dataset.id); if (run) share(run); break; }
      case 'bb-run-detail': openRunDetail(el.dataset.id); break;
      case 'bb-filter': ui.filter = el.dataset.f; host.render(); break;
      case 'bb-abandon': {
        const ok = await host.confirm({ title: 'Abandon this run?', body: 'The current draft or season will be cleared. Saved history stays.', confirm: 'Abandon run', danger: true });
        if (ok) { ensureRecorded(); s.resetToIdle(); host.render(); host.toast('Run cleared'); }
        break;
      }
      case 'bb-clear-history': {
        const ok = await host.confirm({ title: 'Delete all 162-0 seasons?', body: 'This removes every saved 162-0 season and resets its milestones on this device. It cannot be undone.', confirm: 'Delete history', danger: true });
        if (ok) { history.clear(); host.render(); host.toast('Season history deleted'); }
        break;
      }
      default: break;
    }
  }

  function onKey(e) {
    if (!session) return;
    const onControl = ['BUTTON', 'A'].includes(e.target.tagName);
    const coach = $('#bb-coach-dialog');
    if (coach?.open) {
      if (/^[123]$/.test(e.key)) $$('.option', coach)[Number(e.key) - 1]?.click();
      return;
    }
    if ($('dialog[open]')) return;
    const s = session;
    const route = host.route();
    if (route === 'draft') {
      if (s.phase === BB.spin) {
        if ((e.key === ' ' || e.key === 'Enter') && !onControl) { e.preventDefault(); spin(); }
      } else if (s.phase === BB.revealed && e.key === 'Enter' && !onControl) {
        e.preventDefault(); act('bb-scout');
      } else if (s.phase === BB.revealed && e.key.toLowerCase() === 'r') {
        act('bb-respin');
      } else if (s.phase === BB.compare) {
        const list = s.pool;
        const idx = list.findIndex((p) => p.id === s.s.selectedId);
        if (['ArrowDown', 'j'].includes(e.key)) { e.preventDefault(); if (s.select(list[Math.min(list.length - 1, idx + 1)].id)) refreshPick(false); }
        else if (['ArrowUp', 'k'].includes(e.key)) { e.preventDefault(); if (s.select(list[Math.max(0, idx - 1)].id)) refreshPick(false); }
        else if (['ArrowLeft', 'ArrowRight'].includes(e.key) && s.selected) {
          e.preventDefault();
          const slots = s.slotsFor(s.selected).map((x) => x.slot);
          const i = slots.indexOf(s.s.slot);
          const next = slots[(i + (e.key === 'ArrowRight' ? 1 : slots.length - 1)) % slots.length];
          if (s.chooseSlot(next)) { sound.tick(); refreshPick(false); }
        } else if (e.key === 'Enter' && (!onControl || e.target.id === 'bb-draft-btn')) { e.preventDefault(); draftPlayer(); }
      } else if (s.phase === BB.complete && e.key === 'Enter' && !onControl) {
        e.preventDefault(); act('bb-kickoff');
      }
    } else if (route === 'season') {
      if (e.key === ' ' && !onControl) { e.preventDefault(); togglePause(); }
      else if (e.key.toLowerCase() === 'f') $(`.bb-season .seg button[data-fast="${fast() ? '0' : '1'}"]`)?.click();
    }
  }

  // ---------------------------------------------------------------------------
  // Host interface
  // ---------------------------------------------------------------------------

  return {
    prefix: 'bb-',
    load,
    title: (r) => TITLES[r] || TITLES.home,
    resolveRoute(r) {
      if (!session) return r === 'draft' || r === 'season' ? 'home' : r;
      const p = session.phase;
      if (r === 'draft') {
        if (p === BB.season || p === BB.final) return 'season';
        if (p === BB.idle) return 'home';
      }
      if (r === 'season' && p !== BB.season && p !== BB.final) return p === BB.idle ? 'home' : 'draft';
      return r;
    },
    view(r) {
      if (r !== 'season') runner.stop();
      if (!session) {
        load().then(() => host.render(), () => host.toast('The 162-0 player database could not be loaded. Check your connection.'));
        return '<div class="fb-loading"><div class="splash-bar"></div><p>Loading the clubhouse…</p></div>';
      }
      ensureRecorded();
      return ({ home: viewHome, draft: viewDraft, season: viewSeason, history: viewHistory, trophies: viewTrophies, settings: viewSettings }[r] || viewHome)();
    },
    mounted(r) {
      if (!session) return;
      if (r === 'season') { runner.stop(); mountSeason(); }
      if (r === 'draft' && ui.autoSpin && session.phase === BB.spin) {
        ui.autoSpin = false;
        setTimeout(spin, 260);
      }
    },
    act,
    onKey,
    stop() { runner.stop(); },
  };
}
