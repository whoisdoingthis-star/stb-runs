// Opening animation (Mike's design, 14 Nov 2026; decision 0033): Stan pops up with the name on his band,
// winks, spins once on a cyan swoosh, and cheers with a burst of sparks. With the sound on, each beat has its own
// soft note, rising (the chimes from decision 0016). About a second and three quarters, over the top of the app
// while it loads (it never holds the app up), and a tap skips it.
//  - Shown every time the app is opened or brought back to the front, and after signing in
//    (app.js decides when; not while a run is on screen).
//  - Sound (a soft note per beat) is OFF unless switched on in Settings: runs start around 5am.
//    Phones only allow sound after a touch, so on a cold open it may stay silent anyway.
// See docs/decisions/0033-brand.md (and 0016 for the first opening).
import { stanHead, STAN_DEFS } from './stan.js';

const DAY_KEY = 'stb-splash-day';
const SOUND_KEY = 'stb-sound';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());

export const soundOn = () => get(SOUND_KEY) === 'on';
export const setSound = (on) => set(SOUND_KEY, on ? 'on' : 'off');
/** True once per day per phone. */
export const splashDue = () => get(DAY_KEY) !== today();

let ctx = null;
/**
 * Soft bell notes. `notes` is a list of [ms from now, frequency in Hz]; each is one quiet note
 * with a faint shimmer an octave up. Silent if the phone won't allow sound yet.
 */
export function chimes(notes) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const asked = performance.now();
    const go = () => {
      if (ctx.state !== 'running') return;
      const late = performance.now() - asked; // time spent waiting for the phone to allow sound
      // Damped (Mike, 10 Nov 2026, twice): a soft start, a short ring, and the bright edge taken off.
      const out = ctx.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 2600; out.Q.value = 0.5; out.connect(ctx.destination);
      const tone = (f, t, d, v, type = 'sine') => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
      };
      for (const [ms, f] of notes) {
        if (ms - late < -150) continue; // too late to match its stop: leave it out
        const t = ctx.currentTime + Math.max(0, ms - late) / 1000;
        tone(f, t, 0.42, 0.065); tone(f * 2.01, t, 0.18, 0.006, 'triangle');
      }
    };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  } catch { /* no sound on this phone */ }
}

// The beats (ms): hello, wink, spin, cheer, and the note each one plays: C, E, G, then the C above.
const HELLO_AT = 60; const WINK_AT = 380; const SPIN_AT = 620; const CHEER_AT = 1060;
const NOTES = [[HELLO_AT, 1046.5], [WINK_AT, 1318.5], [SPIN_AT, 1568], [CHEER_AT, 2093]];
const SVG = `<svg viewBox="0 0 380 300" role="img" aria-label="Send The Boy">${STAN_DEFS}
  <ellipse class="sp-glow" cx="190" cy="262" rx="86" ry="7" fill="#22e6f2"/>
  <path class="sp-swoosh" d="M70 226q120 52 250-12" fill="none" stroke="#22e6f2" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
  <g class="sp-burst" stroke="#ffc400" stroke-width="6" stroke-linecap="round"><path d="M66 118l-26-8"/><path d="M70 160l-28 6"/><path d="M314 118l26-8"/><path d="M310 160l28 6"/></g>
  <g transform="translate(60 26) scale(1.3)"><g class="sp-stan">${stanHead('stb')}</g></g>
</svg>`;

let showing = null;
/**
 * Play the opening. `sound`: play the chimes too (only if the phone allows it).
 * Returns straight away; the overlay removes itself. Does nothing if one is already showing.
 */
export function playSplash({ sound = false } = {}) {
  set(DAY_KEY, today());
  if (showing || !document.body.animate) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { if (sound) chimes([[0, 1568]]); return; }
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG;
  const done = () => { if (showing !== el) return; showing = null; el.remove(); };
  el.addEventListener('click', done); // click, not pointerdown: the tap must not fall through to a run card underneath
  document.body.append(el);
  showing = el;

  const q = (s) => el.querySelector(s);
  const O = 'cubic-bezier(.2,1.5,.4,1)';
  const a = (n, kf, o) => n.animate(kf, { fill: 'both', ...o });
  const show = (sel, from, to = 1e6) => el.querySelectorAll(sel).forEach((n) => a(n, [{ opacity: 0 }, { opacity: 0, offset: Math.min(.999, from / 1800) }, { opacity: 1, offset: Math.min(1, from / 1800 + .001) },
    ...(to < 1800 ? [{ opacity: 1, offset: to / 1800 }, { opacity: 0, offset: to / 1800 + .001 }] : []), { opacity: to < 1800 ? 0 : 1 }], { duration: 1800 }));
  const stan = q('.sp-stan'); stan.style.transformBox = 'fill-box'; stan.style.transformOrigin = '50% 58%';
  // hello (pop in), then one spin, then a little jump for the cheer
  a(stan, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 260, delay: HELLO_AT, easing: O });
  a(stan, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)', offset: .18 }, { transform: 'rotate(360deg)' }], { duration: 420, delay: SPIN_AT, easing: 'ease-in-out', composite: 'add' });
  a(stan, [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px)', offset: .4 }, { transform: 'translateY(0)' }], { duration: 300, delay: CHEER_AT, easing: 'ease-out', composite: 'add' });
  // eyes: open, then a wink, then happy
  show('.st-eye-l', 0, CHEER_AT); show('.st-eye-open', 0, WINK_AT); show('.st-eye-wink', WINK_AT, CHEER_AT); show('.st-eye-happy', CHEER_AT);
  a(q('.sp-swoosh'), [{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: .6 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 520, delay: SPIN_AT - 40, easing: 'ease-out' });
  const burst = q('.sp-burst'); burst.style.transformBox = 'fill-box'; burst.style.transformOrigin = 'center';
  a(burst, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, delay: CHEER_AT, easing: O });
  a(q('.sp-glow'), [{ opacity: 0 }, { opacity: .5 }], { duration: 300, delay: CHEER_AT });
  if (sound) chimes(NOTES);
  a(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 1750, easing: 'ease-in' }).finished.then(done, done);
}
