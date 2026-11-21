// Opening animation (Mike's design, 21 Nov 2026; decision 0056): Stan runs in with his newspaper satchel in his hand,
// each little footstep a soft note, then jumps and pumps his fist: "Stan-tastic!". About two and a quarter seconds,
// over the top of the app while it loads (it never holds the app up), and a tap skips it.
// (Before this: he popped up, winked, spun and cheered; decision 0033.)
//  - Shown every time the app is opened or brought back to the front, and after signing in
//    (app.js decides when; not while a run is on screen).
//  - Sound (a soft note per beat) is OFF unless switched on in Settings: runs start around 5am.
//    Phones only allow sound after a touch, so on a cold open it may stay silent anyway.
// See docs/decisions/0033-brand.md (and 0016 for the first opening).
import { stanFigure, STAN_DEFS } from './stan.js';

const DAY_KEY = 'stb-splash-day';
const SOUND_KEY = 'stb-sound';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());

export const soundOn = () => get(SOUND_KEY) !== 'off';   // on unless switched off (Mike, 21 Nov 2026; it was off unless switched on)
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
      for (const [ms, f, d = 0.42, v = 0.065] of notes) {   // [ms from now, Hz, seconds long, loudness]
        if (ms - late < -150) continue; // too late to match its stop: leave it out
        const t = ctx.currentTime + Math.max(0, ms - late) / 1000;
        tone(f, t, d, v); if (d > 0.2) tone(f * 2.01, t, 0.18, 0.006, 'triangle');
      }
    };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  } catch { /* no sound on this phone */ }
}

// The beats (ms). Four footsteps as he runs in, each a short note a step higher; then the jump, three quick notes up.
export const STEP_MS = 200; export const STEPS = [110, 310, 510, 710]; export const STOP_AT = 880; export const JUMP_AT = 980; export const END_AT = 2050;
export const STEP_NOTES = STEPS.map((ms, i) => [ms, [261.63, 293.66, 329.63, 392][i], 0.09, 0.075]);
export const JUMP_NOTES = [[JUMP_AT, 523.25], [JUMP_AT + 90, 783.99], [JUMP_AT + 180, 1046.5]];
const SATCHEL = `<g class="sp-bag"><path d="M10 138q-8 6-6 16" fill="none" stroke="#7a4a1e" stroke-width="5" stroke-linecap="round"/><rect x="-26" y="150" width="50" height="40" rx="8" fill="#b0692b" stroke="#7a4a1e" stroke-width="3"/><path d="M-26 164h50" stroke="#7a4a1e" stroke-width="3"/><rect x="-14" y="138" width="28" height="18" rx="3" fill="#f4f1ea" stroke="#8a8478" stroke-width="2"/><path d="M-8 144h16M-8 150h10" stroke="#8a8478" stroke-width="2"/></g>`;
const SVG = `<svg viewBox="0 0 380 300" role="img" aria-label="Send The Boy">${STAN_DEFS}
  <ellipse class="sp-glow" cx="190" cy="262" rx="86" ry="7" fill="#22e6f2"/>
  <g class="sp-burst" stroke="#ffc400" stroke-width="6" stroke-linecap="round"><path d="M92 74l-24-12"/><path d="M84 116l-28 2"/><path d="M300 60l22-16"/><path d="M312 104l28-4"/><path d="M262 22l8-24"/></g>
  <g class="sp-run"><g class="sp-fig"><g transform="translate(110 62) scale(.8)">${stanFigure('stb')}${SATCHEL}</g></g></g>
  <text class="sp-word" x="190" y="296" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-style="italic" font-size="34" fill="#ffc400">Stan-tastic!</text>
</svg>`;

let showing = null;
/**
 * Play the opening. `sound`: play the notes too (only if the phone allows it). `onCheer`: called as he jumps, so the
 * app can play his recorded "Stan-tastic!" if he's allowed to talk. Returns straight away; the overlay removes itself.
 * Does nothing if one is already showing.
 */
export function playSplash({ sound = false, onCheer } = {}) {
  set(DAY_KEY, today());
  if (showing || !document.body.animate) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { if (sound) chimes([[0, 1046.5]]); return; }
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG;
  let cheer = null;
  const done = () => { if (showing !== el) return; showing = null; clearTimeout(cheer); el.remove(); };
  el.addEventListener('click', done); // click, not pointerdown: the tap must not fall through to a run card underneath
  document.body.append(el);
  showing = el;

  const q = (s) => el.querySelector(s);
  const O = 'cubic-bezier(.2,1.5,.4,1)';
  const a = (n, kf, o) => n.animate(kf, { fill: 'both', ...o });
  const show = (sel, from, to = 1e6) => el.querySelectorAll(sel).forEach((n) => a(n, [{ opacity: 0 }, { opacity: 0, offset: Math.min(.999, from / END_AT) }, { opacity: 1, offset: Math.min(1, from / END_AT + .001) },
    ...(to < END_AT ? [{ opacity: 1, offset: to / END_AT }, { opacity: 0, offset: to / END_AT + .001 }] : []), { opacity: to < END_AT ? 0 : 1 }], { duration: END_AT }));
  // he runs in from the left: the whole of him slides across, bobbing once per step, legs and arms swinging
  a(q('.sp-run'), [{ transform: 'translateX(-125%)' }, { transform: 'translateX(0)' }], { duration: STOP_AT, easing: 'cubic-bezier(.25,.6,.4,1)' });
  const fig = q('.sp-fig');
  a(fig, [{ transform: 'translateY(0)' }, { transform: 'translateY(-9px)' }, { transform: 'translateY(0)' }], { duration: STEP_MS, iterations: STEPS.length, delay: STEPS[0] - STEP_MS / 2, easing: 'ease-in-out' });
  el.querySelectorAll('.st-leg').forEach((leg, i) => { leg.style.transformBox = 'fill-box'; leg.style.transformOrigin = '50% 6%';
    a(leg, [{ transform: `rotate(${i ? -24 : 24}deg)` }, { transform: `rotate(${i ? 24 : -24}deg)` }], { duration: STEP_MS, iterations: STOP_AT / STEP_MS, direction: 'alternate', easing: 'ease-in-out' }).finished.then(() => { leg.style.transform = 'none'; }, () => {}); });
  const armR = q('.st-armR'); armR.style.transformOrigin = '166px 130px'; armR.parentNode.append(armR);   // in front of his head, so the raised fist shows
  a(armR, [{ transform: 'rotate(26deg)' }, { transform: 'rotate(-10deg)' }], { duration: STEP_MS, iterations: STOP_AT / STEP_MS, direction: 'alternate', easing: 'ease-in-out' });
  const bag = q('.sp-bag'); bag.style.transformOrigin = '10px 136px';
  a(bag, [{ transform: 'rotate(-10deg)' }, { transform: 'rotate(12deg)' }], { duration: STEP_MS, iterations: STOP_AT / STEP_MS, direction: 'alternate', easing: 'ease-in-out' });
  // the jump: up and down once, fist in the air, happy eyes, sparks, and the word
  a(fig, [{ transform: 'translateY(0)' }, { transform: 'translateY(-52px)', offset: .42, easing: 'ease-in' }, { transform: 'translateY(0)' }], { duration: 560, delay: JUMP_AT, easing: 'ease-out', composite: 'add' });
  a(armR, [{ transform: 'translate(0px, 0px) rotate(8deg) scale(1)' }, { transform: 'translate(10px, -46px) rotate(-56deg) scale(1.4)' }], { duration: 200, delay: JUMP_AT - 40, easing: O });
  show('.st-eye-l', 0, JUMP_AT); show('.st-eye-open', 0, JUMP_AT); show('.st-eye-happy', JUMP_AT);
  const burst = q('.sp-burst'); burst.style.transformBox = 'fill-box'; burst.style.transformOrigin = 'center';
  a(burst, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 220, delay: JUMP_AT + 120, easing: O });
  a(q('.sp-glow'), [{ opacity: 0 }, { opacity: .5 }], { duration: 300, delay: STOP_AT });
  const word = q('.sp-word'); word.style.transformBox = 'fill-box'; word.style.transformOrigin = 'center';
  a(word, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 240, delay: JUMP_AT + 100, easing: O });
  if (sound) chimes([...STEP_NOTES, ...JUMP_NOTES]);
  if (onCheer) cheer = setTimeout(() => { try { onCheer(); } catch { /* quiet */ } }, JUMP_AT + 60);
  a(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: END_AT, easing: 'ease-in' }).finished.then(done, done);
}
