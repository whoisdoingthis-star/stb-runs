// Short sounds for what happens on a run (decision 0051): a tick, an untick, a problem at a stop, a stop that needs a look,
// a run done. Each is a few soft notes made on the phone: no sound files. Stan's own tunes: not taken from anywhere.
// If sound isn't allowed or anything fails, it is simply quiet.

const KEY = 'stb-sfx'; const MUSIC_KEY = 'stb-over-music';
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
export const sfxOn = () => get(KEY) !== 'off';                    // on unless switched off (Mike, 21 Nov 2026)
export const setSfx = (on) => set(KEY, on ? 'on' : 'off');

/** A five-note scale: ticks climb it one stop at a time, so a row of ticks sounds like getting somewhere, not one beep on repeat. */
export const TICK_SCALE = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const E5 = 659.25;
// [ms from now, Hz, seconds long, loudness, wave]
export const SFX = {
  tick:    (step = 0) => [[0, E5 * TICK_SCALE[((step % 5) + 5) % 5], 0.11, 0.05, 'sine']],
  untick:  () => [[0, 523.25, 0.1, 0.045, 'sine'], [90, 392, 0.14, 0.045, 'sine']],
  problem: () => [[0, 233.08, 0.16, 0.07, 'triangle'], [200, 233.08, 0.22, 0.07, 'triangle']],          // low, twice: nothing like a tick
  headsup: () => [[0, 987.77, 0.08, 0.05, 'triangle'], [110, 1318.5, 0.08, 0.05, 'triangle'], [220, 987.77, 0.12, 0.05, 'triangle']],
  runDone: () => [[0, 523.25, 0.14, 0.055, 'sine'], [120, 659.25, 0.14, 0.055, 'sine'], [240, 783.99, 0.14, 0.055, 'sine'], [360, 1046.5, 0.3, 0.06, 'sine']],
  allDone: () => [[0, 523.25, 0.14, 0.055, 'sine'], [130, 783.99, 0.14, 0.055, 'sine'], [260, 659.25, 0.14, 0.055, 'sine'], [390, 1046.5, 0.16, 0.06, 'sine'], [560, 1318.5, 0.4, 0.06, 'sine']],
  notice:  () => [[0, 880, 0.18, 0.05, 'sine'], [160, 1174.7, 0.28, 0.05, 'sine']],
  streak:  () => [[0, 783.99, 0.1, 0.05, 'sine'], [100, 987.77, 0.1, 0.05, 'sine'], [200, 1174.7, 0.1, 0.05, 'sine'], [300, 1568, 0.35, 0.055, 'sine']],
};
/** The notes for a sound, or [] if there is no such sound. */
export const sfxNotes = (name, step = 0) => (SFX[name] ? SFX[name](step) : []);
/** Which step of the scale the next tick plays: one up from the last, starting again after a pause (a new street, a drive). */
export const TICK_PAUSE_MS = 45000;
export const nextTickStep = (last, now) => (last && now - last.at <= TICK_PAUSE_MS ? { step: last.step + 1, at: now } : { step: 0, at: now });

let ctx = null;
/** Sound can only start after a tap. Call this from the first one. */
export function unlockSfx() {
  try { if (!sfxOn()) return; ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* no sound on this phone */ }
}
export function playSfx(name, { step = 0 } = {}) {
  globalThis.__stbSfxLog?.push([name, step]);
  try {
    if (!sfxOn() || !ctx || ctx.state !== 'running') return;
    if ('speechSynthesis' in window && speechSynthesis.speaking) return;      // never over the co-driver's directions
    const out = ctx.createBiquadFilter(); out.type = 'lowpass'; out.frequency.value = 3200; out.Q.value = 0.5; out.connect(ctx.destination);
    for (const [ms, f, d, v, type] of sfxNotes(name, step)) {
      const t = ctx.currentTime + ms / 1000; const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.03);
    }
  } catch { /* quiet */ }
}

// ---- Stan and the phone's music (iPhones only: other phones give a web app no say in this) ----
export const canDuck = () => typeof navigator !== 'undefined' && !!navigator.audioSession;
export const musicMode = () => (get(MUSIC_KEY) === 'solo' ? 'solo' : 'mix');   // 'mix': play along with the music · 'solo': pause the music while Stan talks
export const setMusicMode = (m) => set(MUSIC_KEY, m === 'solo' ? 'solo' : 'mix');
/** Around Stan's voice: ask the phone to hold the music, then hand it back. Returns a function to call when he has finished. */
export function holdMusic() {
  try {
    if (!canDuck() || musicMode() !== 'solo') return () => {};
    navigator.audioSession.type = 'transient-solo';
    return () => { try { navigator.audioSession.type = 'auto'; } catch { /* leave it */ } };
  } catch { return () => {}; }
}
