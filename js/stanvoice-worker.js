// Stan's voice, made on the phone (decision 0023). A module worker so speaking never stalls a tap.
// Piper (open-source text-to-speech) in WebAssembly: words -> phonemes (piper_phonemize, eSpeak data)
// -> sound (a Piper voice model run by onnxruntime-web). Everything it downloads is kept in the
// 'stb-stan-voice' cache, so after the first time it works with no signal.
//
// Messages in:  { type: 'init', urls, voice: { model, config, speaker } }
//               { type: 'say', id, text, lengthScale, noiseScale, noiseW }
// Messages out: { type: 'progress', loaded, total } | { type: 'ready', sampleRate } | { type: 'error', id?, message }
//               { type: 'audio', id, pcm (Float32Array), sampleRate }

const CACHE = 'stb-stan-voice';
let ort; let session; let config; let speaker = 0; let phon = null;

/** Fetch once, then from the cache forever. Reports download progress for the big files. */
async function cached(url, track) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch { /* no Cache Storage (private mode): just fetch */ }
  const hit = cache && (await cache.match(url));
  if (hit) return hit.blob();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url.split('/').pop()}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let blob;
  if (track && res.body && total) {
    const reader = res.body.getReader(); const parts = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value); got += value.length; track(got, total);
    }
    blob = new Blob(parts);
  } else blob = await res.blob();
  if (cache) await cache.put(url, new Response(blob)).catch(() => {});
  return blob;
}

async function init({ urls, voice }) {
  // Sizes, roughly: voice model 60-80 MB, eSpeak data 18 MB, onnxruntime 11 MB, small files.
  const sizes = { model: 77e6, data: 18e6, ort: 10.6e6 };
  const done = { model: 0, data: 0, ort: 0 };
  const report = () => postMessage({ type: 'progress', loaded: done.model + done.data + done.ort, total: sizes.model + sizes.data + sizes.ort });
  const track = (k) => (got, total) => { sizes[k] = total; done[k] = got; report(); };

  const [ortWasm, phData, phWasm, cfgBlob, modelBlob] = await Promise.all([
    cached(urls.ortWasm, track('ort')).then((b) => { done.ort = sizes.ort = b.size; report(); return b; }),
    cached(urls.phonemizeData, track('data')).then((b) => { done.data = sizes.data = b.size; report(); return b; }),
    cached(urls.phonemizeWasm),
    cached(voice.config),
    cached(voice.model, track('model')).then((b) => { done.model = sizes.model = b.size; report(); return b; }),
  ]);
  config = JSON.parse(await cfgBlob.text());
  const map = config.speaker_id_map || {};
  speaker = typeof voice.speaker === 'number' ? voice.speaker : (map[voice.speaker] ?? 0);

  ort = await import(urls.ort);
  ort.env.wasm.numThreads = 1; // phones can't use threads here (no cross-origin isolation on GitHub Pages)
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { 'ort-wasm-simd.wasm': URL.createObjectURL(ortWasm), 'ort-wasm.wasm': URL.createObjectURL(ortWasm) };
  session = await ort.InferenceSession.create(new Uint8Array(await modelBlob.arrayBuffer()), { executionProviders: ['wasm'] });

  const { createPiperPhonemize } = await import(urls.phonemizeJs);
  phon = { create: createPiperPhonemize, wasm: URL.createObjectURL(phWasm), data: URL.createObjectURL(phData) };
  await phonemes('Hello.'); // warm up both halves so the first real line is quick
  postMessage({ type: 'ready', sampleRate: config.audio.sample_rate, speakers: Object.keys(map).length });
}

/** Words -> phoneme ids (eSpeak, in the voice's language). One phonemizer, made once and reused. */
let waiting = null; let module = null;
async function phonemes(text) {
  if (!module) {
    module = await phon.create({
      print: (line) => { const w = waiting; waiting = null; try { w?.resolve(JSON.parse(line).phoneme_ids); } catch (e) { w?.reject(e); } },
      printErr: () => {},
      locateFile: (f) => (f.endsWith('.wasm') ? phon.wasm : f.endsWith('.data') ? phon.data : f),
    });
  }
  return new Promise((resolve, reject) => {
    waiting = { resolve, reject };
    try { module.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']); } catch (e) { waiting = null; reject(e); }
  });
}

async function say({ id, text, lengthScale, noiseScale, noiseW }) {
  const ids = await phonemes(text);
  const inf = config.inference || {};
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([noiseScale ?? inf.noise_scale ?? 0.667, lengthScale ?? inf.length_scale ?? 1, noiseW ?? inf.noise_w ?? 0.8]), [3]),
  };
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speaker)]), [1]);
  const out = await session.run(feeds);
  const pcm = new Float32Array(out.output.data);
  postMessage({ type: 'audio', id, pcm, sampleRate: config.audio.sample_rate }, [pcm.buffer]);
}

let chain = Promise.resolve(); // one line at a time
onmessage = ({ data }) => {
  if (data.type === 'init') init(data).catch((e) => postMessage({ type: 'error', message: String(e.message || e) }));
  if (data.type === 'say') chain = chain.then(() => say(data)).catch((e) => postMessage({ type: 'error', id: data.id, message: String(e.message || e) }));
};
