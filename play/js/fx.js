/**
 * 82-0 Web — Feedback effects: synthesized sound, haptics, confetti.
 * Everything is optional and degrades silently.
 */

let ctx = null;
let settings = null;

export function initFx(s) { settings = s; }

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function audio() {
  if (!settings?.get('sound')) return null;
  try {
    ctx = ctx || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(ac, { freq = 440, type = 'sine', at = 0, dur = 0.12, gain = 0.06, slide = 0 }) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(ac, { at = 0, dur = 0.08, gain = 0.05, freq = 2000 }) {
  const t = ac.currentTime + at;
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  const g = ac.createGain();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t);
}

let lastReelTick = 0;

export const sound = {
  tap() { const ac = audio(); if (ac) tone(ac, { freq: 660, dur: 0.05, gain: 0.03, type: 'triangle' }); },
  tick() { const ac = audio(); if (ac) tone(ac, { freq: 1180, dur: 0.04, gain: 0.025, type: 'square' }); },
  open() {
    const ac = audio(); if (!ac) return;
    noise(ac, { dur: 0.16, gain: 0.08, freq: 1400 });
    tone(ac, { freq: 300, at: 0.05, dur: 0.18, gain: 0.05, slide: 260 });
  },
  stamp() {
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 140, dur: 0.18, gain: 0.12, slide: -80 });
    noise(ac, { dur: 0.06, gain: 0.07, freq: 900 });
  },
  draft() {
    const ac = audio(); if (!ac) return;
    [523, 659, 784].forEach((f, i) => tone(ac, { freq: f, at: i * 0.06, dur: 0.16, gain: 0.045, type: 'triangle' }));
  },
  coach() {
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 392, dur: 0.14, gain: 0.05, type: 'triangle' });
    tone(ac, { freq: 587, at: 0.12, dur: 0.22, gain: 0.05, type: 'triangle' });
  },
  whistle() {
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 2300, dur: 0.32, gain: 0.03, type: 'sine', slide: 120 });
  },
  spinStart() {
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 180, dur: 0.35, gain: 0.05, type: 'sawtooth', slide: 520 });
    noise(ac, { dur: 0.12, gain: 0.05, freq: 3000 });
  },
  reelTick() {
    const now = performance.now();
    if (now - lastReelTick < 55) return;
    lastReelTick = now;
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 1400 + Math.random() * 300, dur: 0.022, gain: 0.016, type: 'square' });
  },
  reelStop() {
    const ac = audio(); if (!ac) return;
    tone(ac, { freq: 170, dur: 0.16, gain: 0.11, slide: -90 });
    noise(ac, { dur: 0.05, gain: 0.07, freq: 1100 });
  },
  jackpot() {
    const ac = audio(); if (!ac) return;
    [659, 784, 988, 1319].forEach((f, i) => tone(ac, { freq: f, at: i * 0.07, dur: 0.22, gain: 0.045, type: 'triangle' }));
  },
  finale(wins) {
    const ac = audio(); if (!ac) return;
    if (wins >= 65) {
      const notes = wins >= 82 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(ac, { freq: f, at: i * 0.11, dur: 0.38, gain: 0.05, type: 'triangle' }));
    } else {
      tone(ac, { freq: 220, dur: 0.7, gain: 0.05, type: 'sawtooth', slide: -40 });
    }
  },
};

export function haptic(pattern = 10) {
  if (!settings?.get('haptics')) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function confetti({ count = 140, duration = 3200, colors = ['#ff5500', '#ffc726', '#00d2ff', '#ffffff', '#34d399'] } = {}) {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti';
  document.body.appendChild(canvas);
  const c = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  resize();
  const parts = Array.from({ length: count }, () => ({
    x: innerWidth * (0.2 + Math.random() * 0.6),
    y: innerHeight * 0.35 + Math.random() * 40,
    vx: (Math.random() - 0.5) * 14,
    vy: -8 - Math.random() * 12,
    s: 5 + Math.random() * 7,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  function frame(now) {
    const t = now - start;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save();
      c.globalAlpha = Math.max(0, 1 - t / duration);
      c.translate(p.x, p.y); c.rotate(p.r);
      c.fillStyle = p.color;
      c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      c.restore();
    }
    if (t < duration) requestAnimationFrame(frame); else canvas.remove();
  }
  requestAnimationFrame(frame);
}
