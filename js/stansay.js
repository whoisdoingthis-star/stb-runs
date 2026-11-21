// Stan's recorded voice on the phone (decision 0047): keeps his clips on the phone and plays them with his robot finish.
// Loaded only when needed. If anything here fails, Stan is simply quiet: the words are still on the screen.

import { playStanClip } from './stanfx.js';

const CACHE = 'stan-voice-clips-v1';
const MANIFEST = 'stb.stan.clips';      // { key: recorded_at } for the clips this phone holds
let ctx = null; let queue = Promise.resolve(); let syncing = null; let current = null; let gen = 0;
const LONG = 'stb.stan.long';           // { key: recorded_at } for the long read-aloud clips (What's new): known about, fetched only when asked for
const longOnes = () => { try { return JSON.parse(localStorage.getItem(LONG) || '{}'); } catch { return {}; } };
const isLong = (key) => key.startsWith('news.');
const manifest = () => { try { return JSON.parse(localStorage.getItem(MANIFEST) || '{}'); } catch { return {}; } };

/** Sound can only start after a tap. Call this from the first one. */
export function unlockStanAudio() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch { /* no sound on this phone */ }
}
/**
 * Fetches any clip this phone doesn't have yet (or that has been recorded again) and keeps it for when there's no signal.
 * store.loadStanLines() → [{ key, recorded_at }] · store.stanClipUrl(key, stamp) → address. Returns how many it now holds.
 */
export function syncStanClips(store) {
  syncing ||= (async () => {
    try {
      if (!('caches' in window)) return 0;
      const rows = await store.loadStanLines(); if (!rows.length) return Object.keys(manifest()).length;
      const cache = await caches.open(CACHE); const have = manifest(); const next = {}; const long = {};
      for (const r of rows) {
        if (isLong(r.key)) { long[r.key] = r.recorded_at; continue; }   // a read-aloud card is ten times a normal line: not worth everyone's data until someone taps the speaker
        const url = store.stanClipUrl(r.key, r.recorded_at); if (!url) continue;
        if (have[r.key] === r.recorded_at && await cache.match(url)) { next[r.key] = r.recorded_at; continue; }
        try { const res = await fetch(url); if (!res.ok) continue; await cache.put(url, res); next[r.key] = r.recorded_at;
          if (have[r.key] && have[r.key] !== r.recorded_at) await cache.delete(store.stanClipUrl(r.key, have[r.key])); } catch { /* next time */ }
      }
      try { localStorage.setItem(MANIFEST, JSON.stringify(next)); localStorage.setItem(LONG, JSON.stringify(long)); } catch { /* private mode */ }
      return Object.keys(next).length;
    } catch { return 0; } finally { setTimeout(() => { syncing = null; }, 60000); }
  })();
  return syncing;
}
/** Plays clips one after another, from the phone's own copy. Skips quietly if a clip isn't here or sound isn't allowed yet. */
export function playStanKeys(keys, store, { onstart, onend } = {}) {
  globalThis.__stbStanLog?.push([...keys]);
  const mine = gen;
  queue = queue.then(async () => {
    try {
      if (mine !== gen) return;
      if (!ctx || ctx.state !== 'running' || !('caches' in window)) return;
      if ('speechSynthesis' in window && speechSynthesis.speaking) return;      // never over the co-driver's directions
      const cache = await caches.open(CACHE); const have = manifest();
      for (const key of keys) {
        if (!have[key] || mine !== gen) continue;
        const res = await cache.match(store.stanClipUrl(key, have[key])); if (!res) continue;
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        onstart?.();
        await new Promise((ok) => { const src = playStanClip(ctx, buf); current = src; src.onended = ok; setTimeout(ok, (buf.duration + 2.5) * 1000); });
        onend?.();
      }
    } catch { onend?.(); }
  });
  return queue;
}

/** Stop whatever Stan is saying, and anything queued behind it. */
export function stopStan() { gen += 1; try { current?.stop(); } catch { /* already finished */ } current = null; }
/**
 * Read one long clip aloud (a What's new card): fetched when asked for, then kept. Stops anything else he was saying.
 * Returns 'played' | 'stopped' | 'none' (not recorded yet) | 'offline' (couldn't fetch) | 'silent' (sound not allowed).
 */
export async function readStanAloud(key, store) {
  globalThis.__stbStanLog?.push([key]);
  stopStan(); const mine = gen;
  try {
    unlockStanAudio(); if (!ctx || !('caches' in window)) return 'silent';
    let stamp = longOnes()[key];
    if (!stamp) { try { const rows = await store.loadStanLines(); const long = Object.fromEntries(rows.filter((r) => isLong(r.key)).map((r) => [r.key, r.recorded_at])); localStorage.setItem(LONG, JSON.stringify(long)); stamp = long[key]; } catch { return 'offline'; } }
    if (!stamp) return 'none';
    const url = store.stanClipUrl(key, stamp); const cache = await caches.open(CACHE);
    let res = await cache.match(url);
    if (!res) { try { const got = await fetch(url); if (!got.ok) return 'offline'; await cache.put(url, got.clone()); res = got; } catch { return 'offline'; } }
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    if (mine !== gen) return 'stopped';
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { return 'silent'; } }
    return await new Promise((ok) => { const src = playStanClip(ctx, buf); current = src; src.onended = () => ok(mine === gen ? 'played' : 'stopped'); setTimeout(() => ok('played'), (buf.duration + 2.5) * 1000); });
  } catch { return 'silent'; }
}
