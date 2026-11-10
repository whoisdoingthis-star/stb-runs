// Opening animation: a run line draws across the screen, three stops tick green, a pin drops
// at the end and becomes the STB logo. Each stop and the pin gets a small twinkle, and (with
// the sound on) its own soft note, rising stop by stop (Mike, 10 Nov 2026). About a second and a half, over the top of the app
// while it loads (it never holds the app up), and a tap skips it.
//  - Shown every time the app is opened or brought back to the front, and after signing in
//    (app.js decides when; not while a run is on screen).
//  - Sound (a soft note per stop) is OFF unless switched on in Settings: runs start around 5am.
//    Phones only allow sound after a touch, so on a cold open it may stay silent anyway.
// See docs/decisions/0016-opening-animation.md.

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

// When each stop pops and when the pin lands (ms), and the note each one plays: C, E, G, then the C above.
const STOPS_AT = [120, 290, 460];
const PIN_AT = 840;
const NOTES = [[STOPS_AT[0], 1046.5], [STOPS_AT[1], 1318.5], [STOPS_AT[2], 1568], [PIN_AT, 2093]];
// A fairy-light twinkle: one four-point star and two tiny ones.
const TWINKLE = '<g class="sp-tw"><path d="M0-13L3-3L13 0L3 3L0 13L-3 3L-13 0L-3-3Z" fill="#fff7d6"/><path d="M13-13l1.6 4.4L19-7l-4.4 1.6L13-1l-1.6-4.4L7-7l4.4-1.6z" fill="#fde68a"/><circle cx="-12" cy="9" r="1.8" fill="#fff7d6"/></g>';

const SVG = `<svg viewBox="0 0 380 300" role="img" aria-label="Send The Boy">
  <defs><clipPath id="sp-clip"><rect x="-100" y="-100" width="200" height="200" rx="36"/></clipPath></defs>
  <g class="sp-route">
    <path d="M10 262 C100 262 70 205 140 205 S250 190 190 150" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>
    <path class="sp-line" d="M10 262 C100 262 70 205 140 205 S250 190 190 150" fill="none" stroke="#fdb704" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    <g class="sp-stop" transform="translate(62 252)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
    <g class="sp-stop" transform="translate(112 212)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
    <g class="sp-stop" transform="translate(196 196)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  </g>
  <g transform="translate(74 238)">${TWINKLE}</g><g transform="translate(124 198)">${TWINKLE}</g><g transform="translate(208 182)">${TWINKLE}</g><g transform="translate(206 106)">${TWINKLE}</g>
  <g transform="translate(190 150)"><g class="sp-pin"><path d="M0 0C-14-18-18-28-18-36A18 18 0 1 1 18-36C18-28 14-18 0 0Z" fill="#fdb704"/><circle cx="0" cy="-36" r="7" fill="#0e0f11"/></g></g>
  <g transform="translate(190 140) scale(.7)"><g class="sp-logo"><image href="icons/icon-512.png" x="-100" y="-100" width="200" height="200" clip-path="url(#sp-clip)"/></g></g>
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
  const box = (n) => { n.style.transformBox = 'fill-box'; n.style.transformOrigin = 'center'; return n; };
  const a = (n, kf, o) => n.animate(kf, { fill: 'both', ...o });
  a(q('.sp-line'), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 620, easing: 'ease-in-out' });
  el.querySelectorAll('.sp-stop > g').forEach((n, i) => a(box(n), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 180, delay: STOPS_AT[i], easing: O }));
  el.querySelectorAll('.sp-tw').forEach((n, i) => a(box(n), [
    { opacity: 0, transform: 'scale(0) rotate(-40deg)' }, { opacity: 1, transform: 'scale(1.15) rotate(0deg)', offset: 0.4 },
    { opacity: 0, transform: 'scale(.3) rotate(40deg)' }], { duration: 460, delay: [...STOPS_AT, PIN_AT][i] + 40, easing: 'ease-out' }));
  a(box(q('.sp-pin')), [
    { opacity: 0, transform: 'translateY(-220px)' }, { opacity: 1, transform: 'translateY(-220px)', offset: 0.01 },
    { opacity: 1, transform: 'translateY(0)', offset: 0.5 }, { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
    { opacity: 0, transform: 'translateY(0) scale(.4)' }], { duration: 640, delay: 520, easing: 'ease-out' });
  a(q('.sp-route'), [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1250 });
  a(box(q('.sp-logo')), [{ opacity: 0, transform: 'translateY(14px) scale(.12)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 980, easing: O });
  if (sound) chimes(NOTES);
  a(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 1750, easing: 'ease-in' }).finished.then(done, done);
}
