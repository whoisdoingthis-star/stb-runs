import assert from 'node:assert/strict';
import { STAN_LINES, clipUrl, linesToRecord } from '../js/stanlines.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const all = Object.entries(STAN_LINES);
t('every line has a file-safe name and something short to say', () => { for (const [k, l] of all) { assert.match(k, /^[a-z0-9][a-z0-9._-]{0,59}$/, k); assert.ok(l.say.length >= 2 && l.say.length <= 300, k); assert.ok(l.when, k); } assert.ok(all.length >= 60); });
t('no two lines say the same thing', () => { const seen = new Map(); for (const [k, l] of all) { assert.ok(!seen.has(l.say), `${k} repeats ${seen.get(l.say)}`); seen.set(l.say, k); } });
t('Stan’s lines are his own: no borrowed catchphrases', () => { const text = all.map(([, l]) => l.say.toLowerCase()).join(' | '); for (const bad of ['okely', 'dokely', 'we did it! we did it', 'we did it, we did it', 'd’oh', 'to infinity']) assert.ok(!text.includes(bad), bad); });
t('everyone in the family has a good morning', () => { for (const n of ['mike', 'lisa', 'moana', 'lenny', 'zaph', 'serene']) assert.ok(STAN_LINES[`name.${n}`], n); });
t('a clip’s address is the public bucket, the key and a stamp so a re-recording is fetched fresh', () => { assert.equal(clipUrl('https://x.supabase.co/', 'hello.1'), 'https://x.supabase.co/storage/v1/object/public/stan-voice/hello.1.mp3'); assert.equal(clipUrl('https://x.supabase.co', 'hello.1', '2026-11-21T00:00:00Z'), 'https://x.supabase.co/storage/v1/object/public/stan-voice/hello.1.mp3?v=2026-11-21T00%3A00%3A00Z'); });
t('what needs recording: new lines, and lines whose words have changed', () => {
  const lines = { a: { say: 'One.' }, b: { say: 'Two.' }, c: { say: 'Three.' } };
  assert.deepEqual(linesToRecord([{ key: 'a', text: 'One.' }, { key: 'b', text: 'Too.' }], lines), [{ key: 'b', say: 'Two.', why: 'changed' }, { key: 'c', say: 'Three.', why: 'new' }]);
  assert.deepEqual(linesToRecord(Object.entries(lines).map(([key, l]) => ({ key, text: l.say })), lines), []);
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
