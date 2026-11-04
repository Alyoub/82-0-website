/**
 * Shared TEAM + ERA slot-machine reels (82-0 and 17-0).
 */

import { sound, haptic } from './fx.js';

export const QMARK_ITEM = '<div class="ri"><span class="ri-q">?</span></div>';
export const BLANK_ITEM = '<div class="ri ri-blank"></div>';

export function reelCab(kind, label, items, center, won) {
  const leds = (n) => Array.from({ length: n }, (_, i) => `<i class="led" style="--i:${i}"></i>`).join('');
  return `<div class="reel-cab ${kind}${won ? ' won' : ''}" data-reel="${kind}">
    <div class="reel-label"><span class="leds">${leds(3)}</span><span>${label}</span><span class="leds">${leds(3)}</span></div>
    <div class="reel-bezel"><div class="reel-window">
      <div class="reel-strip" style="transform:translateY(calc(var(--item-h) * -${center + 0.5}))">${items.join('')}</div>
      <span class="rail l"></span><span class="rail r"></span><div class="reel-shade"></div>
    </div></div>
    <span class="payline l"></span><span class="payline r"></span>
  </div>`;
}

/**
 * Builds a strip of [prev, TARGET, next, ...fillers, blank, ?, blank] and rolls
 * it downward from the "?" to the target, then settles with a small clunk.
 */
export function animateReel(cab, items, duration) {
  const strip = cab.querySelector('.reel-strip');
  strip.innerHTML = [...items, BLANK_ITEM, QMARK_ITEM, BLANK_ITEM].join('');
  const h = strip.firstElementChild.getBoundingClientRect().height;
  const y = (i) => -(i + 0.5) * h;
  const start = items.length + 1;
  strip.style.transform = `translateY(${y(start)}px)`;
  cab.classList.add('spinning');

  const move = strip.animate(
    [{ transform: `translateY(${y(start)}px)` }, { transform: `translateY(${y(1)}px)` }],
    { duration, easing: 'cubic-bezier(0.18, 0.62, 0.16, 1)', fill: 'forwards' },
  );
  strip.animate(
    [{ filter: 'blur(0px)' }, { filter: 'blur(2.6px)', offset: 0.14 }, { filter: 'blur(1.8px)', offset: 0.55 }, { filter: 'blur(0px)', offset: 0.86 }, { filter: 'blur(0px)' }],
    { duration },
  );

  let last = start;
  let raf = 0;
  const watch = () => {
    const m = new DOMMatrixReadOnly(getComputedStyle(strip).transform);
    const idx = Math.round(-m.m42 / h - 0.5);
    if (idx !== last) { last = idx; sound.reelTick(); }
    raf = requestAnimationFrame(watch);
  };
  raf = requestAnimationFrame(watch);

  return move.finished.then(() => {
    cancelAnimationFrame(raf);
    strip.style.transform = `translateY(${y(1)}px)`;
    move.cancel();
    cab.classList.remove('spinning');
    sound.reelStop();
    haptic(15);
    return strip.animate(
      [{ transform: `translateY(${y(1)}px)` }, { transform: `translateY(${y(1) + 10}px)`, offset: 0.35 }, { transform: `translateY(${y(1)}px)` }],
      { duration: 320, easing: 'ease-out' },
    ).finished;
  });
}

/** Neighbours around `item` in `list` so a landed reel looks identical before and after re-render. */
export function neighbours(list, item, key = (x) => x.id) {
  const i = Math.max(0, list.findIndex((x) => key(x) === key(item)));
  return [list[(i - 1 + list.length) % list.length], list[(i + 1) % list.length]];
}
