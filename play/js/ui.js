/**
 * 82-0 Web — Reusable view components (HTML string builders).
 */

import { POSITIONS } from './engine.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// Icons (24px stroke icons)
// ---------------------------------------------------------------------------

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a4 4 0 0 1-4 4M7 5H4v2a4 4 0 0 0 4 4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  seal: '<path d="m9 12 2 2 4-4"/><path d="M12 2 14.4 4.2 17.6 3.8 18.4 7 21.2 8.6 20 11.6 21.2 14.6 18.4 16.2 17.6 19.4 14.4 19 12 21.2 9.6 19 6.4 19.4 5.6 16.2 2.8 14.6 4 11.6 2.8 8.6 5.6 7 6.4 3.8 9.6 4.2Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M8 13h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  court: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0L5 7ZM19 7l-3 6a3 3 0 0 0 6 0l-3-6Z"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  nodes: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7.3 11 16.7 6M7.3 13l9.4 5"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3.5-2-6-4-8 0 2.5-1.5 4-3 4 0-3.5-1.5-6.5-4-9-.5 4-5 6.5-5 12 0 4.5 4 8 9 8Z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>',
  crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>',
  up: '<path d="M7 17 17 7M9 7h8v8"/>',
  down: '<path d="M7 7l10 10M17 9v8H9"/>',
  scope: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export const APPLE_ICON = '<svg viewBox="0 0 170 170" fill="currentColor" aria-hidden="true"><path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.69-3.04-7.67-7.81-11.96-14.34-6.19-9.35-11.08-19.98-14.67-31.89-3.59-11.91-5.39-23.36-5.39-34.34 0-14.37 3.63-26.32 10.89-35.85 7.26-9.53 16.29-14.4 27.09-14.61 5.35 0 11.22 1.45 17.62 4.35 6.4 2.91 10.42 4.41 12.06 4.51 1.91-.1 6.16-1.63 12.75-4.6 6.59-2.97 12.21-4.35 16.86-4.14 12.56.74 22.47 5.43 29.74 14.07-10.97 6.64-16.34 15.75-16.12 27.34.22 9.07 3.73 16.73 10.53 22.98 6.8 6.25 14.72 9.77 23.76 10.56-2.12 6.53-4.68 13.06-7.68 19.59zm-38.35-112.59c-.21 2.33-.85 4.67-1.91 7.02-1.06 2.35-2.61 4.74-4.65 7.17-2.76 3.19-5.94 5.79-9.54 7.8-3.6 2.01-6.94 3.18-10.02 3.51-.43-2.12-.48-4.3-.16-6.53.32-2.23 1.09-4.57 2.3-7.02 2.65-5.32 6.22-9.45 10.7-12.39 4.48-2.94 8.9-4.78 13.28-5.51z"/></svg>';

export const BALL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="bg-ball" cx="35%" cy="30%" r="75%">
      <stop offset="0" stop-color="#ffa35c"/><stop offset="0.55" stop-color="#f05a16"/><stop offset="1" stop-color="#8a2b06"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#bg-ball)"/>
  <g fill="none" stroke="#2a1206" stroke-width="2.6" stroke-linecap="round" opacity="0.85">
    <path d="M4 50h92M50 4v92"/>
    <path d="M18 17c14 13 14 53 0 66"/><path d="M82 17c-14 13-14 53 0 66"/>
  </g>
  <ellipse cx="36" cy="28" rx="14" ry="8" fill="#fff" opacity="0.18" transform="rotate(-25 36 28)"/>
</svg>`;

export const COURT_LINES = `<svg class="lines" viewBox="0 0 300 300" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
  <rect x="6" y="6" width="288" height="288" rx="10"/>
  <path d="M6 6h288"/><path d="M114 6a36 36 0 0 0 72 0"/>
  <rect x="108" y="190" width="84" height="104"/><circle cx="150" cy="190" r="34"/>
  <path d="M28 294v-58a128 128 0 0 1 244 0v58"/>
  <path d="M130 272h40"/><circle cx="150" cy="264" r="6"/>
</svg>`;

export const BOARD_LINES = `<svg class="lines" viewBox="0 0 400 200" preserveAspectRatio="none" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 5" aria-hidden="true">
  <rect x="1" y="1" width="398" height="198" rx="12"/><path d="M200 1v198"/><circle cx="200" cy="100" r="30"/>
  <rect x="1" y="55" width="80" height="90"/><rect x="319" y="55" width="80" height="90"/>
</svg>`;

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export function initials(name) {
  const parts = String(name).replace(/[^\p{L}\s'-]/gu, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const lastName = (name) => {
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
};

const POS_VAR = { PG: '--pg', SG: '--sg', SF: '--sf', PF: '--pf', C: '--c', SIX: '--six' };
export const posColor = (pos) => `var(${POS_VAR[pos] || '--text-3'})`;

export function avatar(name, pos) {
  return `<span class="avatar" style="--pc:${posColor(pos)}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function posBadge(pos, secondary = false) {
  return `<span class="pos ${pos}${secondary ? ' sec' : ''}">${pos}</span>`;
}

export function ovrTier(v) {
  if (v >= 95) return 't-gold';
  if (v >= 90) return 't-orange';
  if (v >= 85) return 't-cyan';
  return 't-slate';
}

export function hex(value, size = '') {
  return `<span class="hex ${ovrTier(value)} ${size}" aria-label="${value} overall"><b>${value}</b><small>OVR</small></span>`;
}

function hexToRgb(h) {
  const n = parseInt(String(h).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminance(h) {
  const [r, g, b] = hexToRgb(h).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Team colors with a readable fallback for near-black or near-white primaries. */
export function teamColors(team) {
  let c1 = `#${team.primaryColor}`;
  let c2 = `#${team.secondaryColor}`;
  if (luminance(c1) < 0.06) c1 = '#2b3446';
  if (luminance(c1) > 0.85) c1 = '#5b6578';
  return { c1, c2 };
}

export function teamBadge(team, identity, size = '') {
  const { c1, c2 } = teamColors(team);
  return `<span class="team-badge ${size}" style="--tc:${c1};--tc2:${c2}" aria-hidden="true">${esc(identity.abbreviation)}</span>`;
}

export function ring(label, value, color) {
  const r = 19;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(99, value)) / 100);
  return `<div class="ring" style="--rc:${color}">
    <div class="ring-num"><svg viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="${r}"/><circle class="val" cx="22" cy="22" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${value}</b></div>
    <span>${label}</span></div>`;
}

export function ovrRing(value) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const off = value == null ? c : c * (1 - Math.min(99, value) / 100);
  return `<div class="ovr-ring"><svg viewBox="0 0 82 82"><circle class="track" cx="41" cy="41" r="${r}"/><circle class="val" cx="41" cy="41" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${value ?? '—'}<small>TEAM OVR</small></b></div>`;
}

export function miniBar(label, value, color) {
  return `<span class="mini-bar"><span>${label}</span><i style="--v:${value}%;--bc:${color}"></i></span>`;
}

export function fitClass(e) { return e >= 1 ? 'f100' : e >= 0.95 ? 'f95' : 'f85'; }
export function fitLabel(e) { return `${Math.round(e * 100)}%`; }

export function signed(v, digits = 0) {
  const n = digits ? Number(v).toFixed(digits) : Math.round(v);
  return v > 0 ? `+${n}` : `${n}`;
}

export function delta(now, before, digits = 0) {
  if (before == null) return '<span class="delta flat">new</span>';
  const d = now - before;
  const eps = digits ? 0.05 : 0.5;
  if (Math.abs(d) < eps) return '<span class="delta flat">±0</span>';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}">${signed(d, digits)}</span>`;
}

// ---------------------------------------------------------------------------
// Court lineup
// ---------------------------------------------------------------------------

/**
 * @param {object} o roster, sixthMan, name(fn), currentPos, draftingSix, pickable(bool), fresh(id)
 */
export function court(o) {
  const tokens = POSITIONS.map((pos) => {
    const p = o.roster[pos];
    const isNow = !o.draftingSix && o.currentPos === pos && !p;
    if (p) {
      const n = o.name(p);
      return `<div class="tok ${pos}${o.fresh === p.id ? ' fresh' : ''}" title="${esc(n)}">
        <span class="tok-rate">${pos} ${p.overall}</span>${avatar(n, pos)}<span class="tok-name">${esc(lastName(n))}</span></div>`;
    }
    const tag = o.pickable && !isNow ? 'button' : 'div';
    const attrs = tag === 'button' ? ` type="button" data-act="choose-pos" data-pos="${pos}" aria-label="Draft ${pos} next"` : '';
    return `<${tag} class="tok ${pos}${isNow ? ' now' : ''}"${attrs}><span class="tok-empty">${pos}</span><span class="tok-name">${isNow ? 'Picking' : 'Open'}</span></${tag}>`;
  }).join('');

  const six = o.sixthMan;
  const sixName = six ? o.name(six) : '';
  const bench = `<div class="bench${o.draftingSix && !six ? ' now' : ''}">
    ${six ? avatar(sixName, 'SIX') : '<span class="b-empty">6TH</span>'}
    <div class="b-meta"><b>${six ? esc(sixName) : 'Sixth man'}</b><span>${six ? `${six.primaryPosition} · ${six.overall} OVR · bench` : o.draftingSix ? 'Picking now · any position' : 'Drafted after the starting five'}</span></div>
  </div>`;

  return `<div class="court-wrap"><div class="court">${COURT_LINES}${tokens}</div>${bench}</div>`;
}

/** Compact six-slot lineup strip for small screens. */
export function strip(o) {
  const slots = POSITIONS.map((pos) => {
    const p = o.roster[pos];
    const isNow = !o.draftingSix && o.currentPos === pos && !p;
    const pickable = o.pickable && !p && !isNow;
    const tag = pickable ? 'button' : 'div';
    const attrs = pickable ? ` type="button" data-act="choose-pos" data-pos="${pos}" aria-label="Draft ${pos} next"` : '';
    const inner = p ? avatar(o.name(p), pos) : `<span class="s-empty">${isNow ? '•' : '+'}</span>`;
    return `<${tag} class="strip-slot ${pos}${isNow ? ' now' : ''}${pickable ? ' pickable' : ''}"${attrs}>${inner}<span class="s-pos">${pos}</span></${tag}>`;
  });
  const six = o.sixthMan;
  slots.push(`<div class="strip-slot SIX${o.draftingSix && !six ? ' now' : ''}">${six ? avatar(o.name(six), 'SIX') : `<span class="s-empty">${o.draftingSix ? '•' : '+'}</span>`}<span class="s-pos">6TH</span></div>`);
  return `<div class="strip" aria-label="Your lineup">${slots.join('')}</div>`;
}
