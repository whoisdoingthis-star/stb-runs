// Opening animation: a run line draws across the screen, three stops tick green, a pin drops
// at the end and becomes the STB logo. About a second and a half, over the top of the app
// while it loads (it never holds the app up), and a tap skips it.
//  - Shown on the first open of each day on this phone, and after signing in.
//  - Sound ("fairy chimes") is OFF unless switched on in Settings: runs start around 5am.
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
/** Five quiet high notes, one after another, starting `ms` from now. Silent if the phone won't allow sound yet. */
export function chimes(ms = 0) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    const asked = performance.now();
    const go = () => {
      if (ctx.state !== 'running') return;
      const t0 = ctx.currentTime + Math.max(0, ms - (performance.now() - asked)) / 1000;
      const tone = (f, t, d, v, type = 'sine') => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + d + 0.05);
      };
      [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => { tone(f, t0 + i * 0.075, 1.3, 0.06); tone(f * 2.01, t0 + i * 0.075, 0.7, 0.02, 'triangle'); });
    };
    if (ctx.state === 'running') go(); else ctx.resume().then(go).catch(() => {});
  } catch { /* no sound on this phone */ }
}

const SVG = `<svg viewBox="0 0 380 300" role="img" aria-label="Send The Boy">
  <defs><clipPath id="sp-clip"><rect x="-100" y="-100" width="200" height="200" rx="36"/></clipPath></defs>
  <g class="sp-route">
    <path d="M10 262 C100 262 70 205 140 205 S250 190 190 150" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="10" stroke-linecap="round"/>
    <path class="sp-line" d="M10 262 C100 262 70 205 140 205 S250 190 190 150" fill="none" stroke="#fdb704" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
    <g class="sp-stop" transform="translate(62 252)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
    <g class="sp-stop" transform="translate(112 212)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
    <g class="sp-stop" transform="translate(196 196)"><g><circle r="9" fill="#22c55e"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#04250f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  </g>
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
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { if (sound) chimes(0); return; }
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
  el.querySelectorAll('.sp-stop > g').forEach((n, i) => a(box(n), [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 180, delay: 120 + i * 170, easing: O }));
  a(box(q('.sp-pin')), [
    { opacity: 0, transform: 'translateY(-220px)' }, { opacity: 1, transform: 'translateY(-220px)', offset: 0.01 },
    { opacity: 1, transform: 'translateY(0)', offset: 0.5 }, { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
    { opacity: 0, transform: 'translateY(0) scale(.4)' }], { duration: 640, delay: 520, easing: 'ease-out' });
  a(q('.sp-route'), [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1250 });
  a(box(q('.sp-logo')), [{ opacity: 0, transform: 'translateY(14px) scale(.12)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 980, easing: O });
  if (sound) chimes(980);
  a(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 1750, easing: 'ease-in' }).finished.then(done, done);
}
