// Stan's own voice (decision 0023): the same kind of voice as the family video, made on the phone,
// with real pauses at commas and full stops and a warmer sound. Falls back to the phone's voice
// whenever it isn't ready, so Stan never goes quiet.
//
//   const v = stanVoice();         one per app
//   v.prepare()                    load (first time: download ~100 MB, then from the phone's cache)
//   v.say(text) -> Promise         speak (queued); v.cancel() stops; v.warm(text) gets a line ready early
//   v.state                        'off' | 'loading' | 'ready' | 'failed'; v.progress 0..1; v.on(fn)

// Pinned versions: these never change under us.
export const URLS = {
  ort: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/esm/ort.wasm.min.js',
  ortWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm',
  phonemizeJs: 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.5/dist/piper-o91UDS6e.js',
  phonemizeWasm: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm',
  phonemizeData: 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',
};
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en';
// Both voices are CC BY 4.0 (free for business use, with credit: see docs/credits.md).
export const VOICES = {
  vctk: { model: `${HF}/en_GB/vctk/medium/en_GB-vctk-medium.onnx`, config: `${HF}/en_GB/vctk/medium/en_GB-vctk-medium.onnx.json`, credit: 'CSTR VCTK Corpus (CC BY 4.0)' },
  libritts_r: { model: `${HF}/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx`, config: `${HF}/en_US/libritts_r/medium/en_US-libritts_r-medium.onnx.json`, credit: 'LibriTTS-R (CC BY 4.0)' },
};

/** Stan's settings: which voice and speaker, and how he's shaped. Chosen by Mike in the voice lab. */
// Mike, 12 Nov 2026, in the voice lab: VCTK speaker p316, pitched right up, a bit slower, warm, full robot shimmer.
export const STAN = { voice: 'vctk', speaker: 'p316', pitch: 1.35, pace: 1.2, warmth: 8, robot: 0.4 };

const ABBR = [
  [/\b(\d+(?:\.\d+)?)\s?km\b/g, '$1 kilometres'], [/\b(\d+)\s?m\b/g, '$1 metres'],
  [/\bRd\b/g, 'Road'], [/\bCres\b/g, 'Crescent'], [/\bAve\b/g, 'Avenue'], [/\bPl\b/g, 'Place'],
  [/\bTce\b/g, 'Terrace'], [/\bHwy\b/g, 'Highway'], [/\b(\w+) St\b/g, '$1 Street'], [/\b(\w+) Dr\b/g, '$1 Drive'],
  [/&/g, ' and '], [/\bNZH\b/g, 'Herald'], [/\s+/g, ' '],
];
/** Text as Stan should say it: abbreviations in full, then split where a person would pause. */
export function speakable(text) {
  let s = String(text || '').trim();
  for (const [re, to] of ABBR) s = s.replace(re, to);
  const out = [];
  // A clause ends at , ; : or a dash (short pause) or . ! ? (longer pause).
  // (Only where a space or the end follows, so 1.2 km, 5:30 and 5–7 stay whole.)
  for (const m of s.matchAll(/.+?(?:[,;:—–]|[.!?]+)(?=\s|$)|.+$/g)) {
    const t = m[0].trim();
    if (!/[A-Za-z0-9]/.test(t)) continue;
    const end = t.slice(-1);
    out.push({ text: t, pause: /[.!?]/.test(end) ? 0.42 : /[,;:—–]/.test(end) ? 0.22 : 0.3 });
  }
  return out;
}

class StanVoice {
  constructor(opts = {}) {
    this.opts = { ...STAN, urls: URLS, voices: VOICES, ...opts };
    this.state = 'off'; this.progress = 0; this.error = '';
    this.fns = new Set(); this.jobs = new Map(); this.lines = new Map(); this.queue = Promise.resolve(); this.n = 0;
  }
  on(fn) { this.fns.add(fn); return () => this.fns.delete(fn); }
  emit() { for (const fn of this.fns) try { fn(this); } catch { /* listener's problem */ } }

  prepare() {
    if (this.ready) return this.ready;
    this.state = 'loading'; this.emit();
    this.ready = new Promise((resolve, reject) => {
      const w = new Worker(new URL('./stanvoice-worker.js', import.meta.url), { type: 'module' });
      this.worker = w;
      w.onmessage = ({ data }) => {
        if (data.type === 'progress') { this.progress = data.total ? data.loaded / data.total : 0; this.emit(); }
        if (data.type === 'ready') { this.state = 'ready'; this.progress = 1; this.sampleRate = data.sampleRate; this.emit(); resolve(this); }
        if (data.type === 'audio') this.jobs.get(data.id)?.resolve(data), this.jobs.delete(data.id);
        if (data.type === 'error') {
          if (data.id != null) { this.jobs.get(data.id)?.reject(new Error(data.message)); this.jobs.delete(data.id); return; }
          this.state = 'failed'; this.error = data.message; this.emit(); reject(new Error(data.message)); this.ready = null; w.terminate();
        }
      };
      const v = this.opts.voices[this.opts.voice];
      w.postMessage({ type: 'init', urls: this.opts.urls, voice: { model: v.model, config: v.config, speaker: this.opts.speaker } });
    });
    return this.ready;
  }

  clause(text, urgent) {
    const id = ++this.n;
    const p = new Promise((resolve, reject) => this.jobs.set(id, { resolve, reject }));
    // Make it slower by `pitch` too: playing it back faster raises the pitch and brings the pace back.
    this.worker.postMessage({ type: 'say', id, urgent: !!urgent, text, lengthScale: this.opts.pace * this.opts.pitch, noiseScale: 0.6, noiseW: 0.7 });
    return p;
  }
  /** Get a line ready (sound made, not played). Kept for the last 40 lines. */
  warm(text, urgent = false) {
    const key = String(text || '').trim();
    if (!key || this.state !== 'ready') return null;
    if (this.lines.has(key)) { const v = this.lines.get(key); this.lines.delete(key); this.lines.set(key, v); return v; }
    const parts = speakable(key);
    const made = Promise.all(parts.map((c) => this.clause(c.text, urgent))).then((outs) => {
      const sr = outs[0]?.sampleRate || this.sampleRate;
      const gaps = parts.map((c, i) => (i === parts.length - 1 ? 0.05 : c.pause) * this.opts.pitch);
      const len = outs.reduce((n, o, i) => n + o.pcm.length + Math.round(gaps[i] * sr), 0);
      const pcm = new Float32Array(len); let at = 0;
      outs.forEach((o, i) => { pcm.set(o.pcm, at); at += o.pcm.length + Math.round(gaps[i] * sr); });
      return { pcm, sampleRate: sr };
    });
    made.catch(() => this.lines.delete(key));
    this.lines.set(key, made);
    while (this.lines.size > 40) this.lines.delete(this.lines.keys().next().value);
    return made;
  }

  audio() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  /** Speak a line. Resolves when he's finished (or was cancelled). Throws if the voice isn't ready. */
  say(text, { onstart, onend } = {}) {
    const made = this.warm(text, true);
    if (!made) return Promise.reject(new Error('Stan’s voice isn’t ready'));
    const gen = this.gen = (this.gen || 0) + 1;
    this.queue = this.queue.then(async () => {
      const { pcm, sampleRate } = await made;
      if (gen !== this.gen) return;
      await this.play(pcm, sampleRate, onstart);
    }).finally(() => onend?.());
    return this.queue;
  }
  play(pcm, sampleRate, onstart) {
    const ctx = this.audio(); const o = this.opts;
    const buf = ctx.createBuffer(1, pcm.length, sampleRate); buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = o.pitch;
    // Warmth: a little more body, a little less hiss (the "tinny" part).
    const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = o.warmth;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 3200; mid.Q.value = 1; mid.gain.value = -o.warmth / 2;
    const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 6500; high.gain.value = -o.warmth;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    src.connect(low).connect(mid).connect(high).connect(comp).connect(ctx.destination);
    // Robot shimmer: a quiet copy 12 ms behind, gently wobbling (0 = none).
    if (o.robot > 0) {
      const d = ctx.createDelay(0.05); d.delayTime.value = 0.012;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5; const depth = ctx.createGain(); depth.gain.value = 0.002;
      lfo.connect(depth).connect(d.delayTime); lfo.start();
      const mix = ctx.createGain(); mix.gain.value = o.robot;
      high.connect(d).connect(mix).connect(comp);
      src.addEventListener('ended', () => lfo.stop());
    }
    this.src = src; this.played = (this.played || 0) + 1;
    return new Promise((resolve) => { src.onended = () => { if (this.src === src) this.src = null; resolve(); }; onstart?.(); src.start(); });
  }
  cancel() { this.gen = (this.gen || 0) + 1; try { this.src?.stop(); } catch { /* already stopped */ } this.src = null; }
}

let one = null;
// Tests point it at local copies with globalThis.__stbVoiceOpts (same idea as __stbFakeRoute).
const testOpts = () => globalThis.__stbVoiceOpts || {};
export function stanVoice(opts) { if (!one) one = new StanVoice({ ...testOpts(), ...opts }); return one; }
export { StanVoice };

/** The family's choice (Settings): 'stan' = Stan's own voice, 'phone' = the phone's voice. */
export function voicePref() { try { return localStorage.getItem('stb-voice') || 'stan'; } catch { return 'stan'; } }
export function setVoicePref(v) { try { localStorage.setItem('stb-voice', v); } catch { /* private mode */ } }
/** Has this phone already got Stan's voice (so loading it costs no data)? */
export async function voiceDownloaded(opts = {}) {
  try {
    const c = await caches.open('stb-stan-voice');
    const o = { ...testOpts(), ...opts };
    const v = (o.voices || VOICES)[o.voice || STAN.voice];
    return !!(await c.match(v.model));
  } catch { return false; }
}
