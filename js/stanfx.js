// Stan's voice effect: a light "robot" finish put on his recorded lines when they are played.
// The recordings stay clean; the effect is these few numbers, so it can be tuned by ear (tools/voice.html) without re-recording.

export const STAN_VOICE = { reverb: 12, room: 35, robot: 15, speed: 100 };   // all 0–100, except speed (90–105, 100 = as recorded)

/** A made-up room: a short burst of fading noise. room 0–100 → about 0.25 s to 1.6 s of tail. */
function roomImpulse(ctx, room) {
  const secs = 0.25 + (Math.max(0, Math.min(100, room)) / 100) * 1.35; const n = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let seed = 1234 + ch * 77; for (let i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; d[i] = ((seed / 2147483647) * 2 - 1) * (1 - i / n) ** 3; } }
  return buf;
}
/**
 * Builds the effect on an audio context. Returns { input, output }: connect a source to input, and output to the speakers.
 *  reverb: how much room is mixed in · room: how big the room is · robot: a tight metallic ring (a very short echo fed back on itself)
 */
export function stanVoiceChain(ctx, opts = {}) {
  const o = { ...STAN_VOICE, ...opts }; const pc = (v) => Math.max(0, Math.min(100, Number(v) || 0)) / 100;
  const input = ctx.createGain(); const output = ctx.createGain();
  const dry = ctx.createGain(); dry.gain.value = 1 - pc(o.reverb) * 0.35; input.connect(dry).connect(output);
  if (pc(o.robot) > 0) {
    const d = ctx.createDelay(0.05); d.delayTime.value = 0.0075; const fb = ctx.createGain(); fb.gain.value = 0.25 + pc(o.robot) * 0.5;
    const mix = ctx.createGain(); mix.gain.value = pc(o.robot) * 0.9;
    input.connect(d); d.connect(fb).connect(d); d.connect(mix).connect(output);
  }
  if (pc(o.reverb) > 0) {
    const conv = ctx.createConvolver(); conv.buffer = roomImpulse(ctx, o.room); const wet = ctx.createGain(); wet.gain.value = pc(o.reverb) * 1.6;
    input.connect(conv).connect(wet).connect(output);
  }
  return { input, output };
}
/** Plays a decoded clip through the effect. speed below 100 lowers his pitch a touch and slows him by the same amount. Returns the source (call .stop()). */
export function playStanClip(ctx, buffer, opts = {}) {
  const o = { ...STAN_VOICE, ...opts }; const src = ctx.createBufferSource(); src.buffer = buffer; src.playbackRate.value = Math.max(0.8, Math.min(1.2, (Number(o.speed) || 100) / 100));
  const chain = stanVoiceChain(ctx, o); src.connect(chain.input); chain.output.connect(ctx.destination); src.start();
  return src;
}
