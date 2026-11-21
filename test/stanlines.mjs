import assert from 'node:assert/strict';
import { recordingBatch, AUTO_MAX_LINES, AUTO_MAX_CHARS, STAN_LINES, STAN_MOMENTS, CHEERFUL, stanLine, clipUrl, linesToRecord } from '../js/stanlines.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const all = Object.entries(STAN_LINES);
t('every line has a file-safe name and something short to say', () => { for (const [k, l] of all) { assert.match(k, /^[a-z0-9][a-z0-9._-]{0,59}$/, k); assert.ok(l.say.length >= 2 && l.say.length <= 300, k); assert.ok(l.when, k); } assert.ok(all.length >= 110); });
t('no two lines say the same thing', () => { const seen = new Map(); for (const [k, l] of all) { assert.ok(!seen.has(l.say), `${k} repeats ${seen.get(l.say)}`); seen.set(l.say, k); } });
t('Stan’s lines are his own: no borrowed catchphrases', () => { const text = all.map(([, l]) => l.say.toLowerCase()).join(' | '); for (const bad of ['okely', 'dokely', 'we did it! we did it', 'we did it, we did it', 'd’oh', 'to infinity']) assert.ok(!text.includes(bad), bad); });
t('everyone in the family has a good morning', () => { for (const n of ['mike', 'lisa', 'moana', 'lenny', 'zaph', 'serene']) assert.ok(STAN_LINES[`name.${n}`], n); });
t('a clip’s address is the public bucket, the key and a stamp so a re-recording is fetched fresh', () => { assert.equal(clipUrl('https://x.supabase.co/', 'hello.1'), 'https://x.supabase.co/storage/v1/object/public/stan-voice/hello.1.mp3'); assert.equal(clipUrl('https://x.supabase.co', 'hello.1', '2026-11-21T00:00:00Z'), 'https://x.supabase.co/storage/v1/object/public/stan-voice/hello.1.mp3?v=2026-11-21T00%3A00%3A00Z'); });
t('what needs recording: new lines, and lines whose words have changed', () => {
  const lines = { a: { say: 'One.' }, b: { say: 'Two.' }, c: { say: 'Three.' } };
  assert.deepEqual(linesToRecord([{ key: 'a', text: 'One.' }, { key: 'b', text: 'Too.' }], lines), [{ key: 'b', say: 'Two.', why: 'changed' }, { key: 'c', say: 'Three.', why: 'new' }]);
  assert.deepEqual(linesToRecord(Object.entries(lines).map(([key, l]) => ({ key, text: l.say })), lines), []);
});
// ---- moments, pools and moods ----
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
t('every moment draws only on lines Stan has, and every cheerful line is real', () => { for (const [m, v] of Object.entries(STAN_MOMENTS)) { assert.ok(v.say > 0 && v.say <= 1, m); assert.ok(v.lines.length >= 1, m); for (const k of v.lines) assert.ok(STAN_LINES[k], `${m}: ${k}`); } for (const k of CHEERFUL) assert.ok(STAN_LINES[k], k); });
t('lines are recycled: plenty of them belong to more than one moment', () => { const n = new Map(); for (const v of Object.values(STAN_MOMENTS)) for (const k of v.lines) n.set(k, (n.get(k) || 0) + 1); assert.ok([...n.values()].filter((x) => x >= 2).length >= 12); assert.ok(n.get('word.goodoo') >= 3); });
t('the same moment sounds different each time: no line comes round again until the pool is used up', () => {
  let heard = {}; const said = [];
  for (let i = 0; i < 8; i++) { const r = stanLine('all.done', { heard, rand: () => 0 }); said.push(r.key); heard = r.heard; }
  assert.equal(new Set(said).size, 8); assert.deepEqual([...said].sort(), [...STAN_MOMENTS['all.done'].lines].sort());
  const again = stanLine('all.done', { heard, rand: () => 0 }); assert.notEqual(again.key, said[7]); assert.ok(STAN_MOMENTS['all.done'].lines.includes(again.key));
});
t('on a rough morning he never uses a cheerful line', () => { let heard = {}; for (let i = 0; i < 30; i++) { const r = stanLine('run.done', { mood: 'rough', heard, rand: seq(0, (i * 0.37) % 1) }); heard = r.heard; assert.ok(r.key && !CHEERFUL.has(r.key), r.key); }
  assert.ok(['re.done', 'noise.phew'].includes(stanLine('all.done', { mood: 'rough', rand: () => 0.5 }).key)); assert.equal(stanLine('game.best', { mood: 'rough', rand: () => 0 }).key, null); });
t('routine moments only speak some of the time; big ones always do', () => { assert.equal(stanLine('run.done', { rand: () => 0.9 }).key, null); assert.ok(stanLine('run.done', { rand: () => 0.1 }).key); assert.ok(stanLine('run.done', { rand: () => 0.9, force: true }).key); assert.ok(stanLine('late.warn', { rand: () => 0.99 }).key); });
t('a moment he doesn’t know says nothing', () => assert.deepEqual(stanLine('nope'), { key: null, say: null, heard: {} }));
t('what he says comes back as words too, for the screen', () => assert.equal(stanLine('odometer', { rand: () => 0, force: true }).say, 'What’s the odometer say?'));
t('the publishing job records new lines before reworded ones, short before long, and never past its caps', () => {
  const todo = [{ key: 'a', say: 'x'.repeat(200), why: 'changed' }, { key: 'b', say: 'x'.repeat(250), why: 'new' }, { key: 'c', say: 'x'.repeat(40), why: 'new' }];
  assert.deepEqual(recordingBatch(todo).batch.map((l) => l.key), ['c', 'b', 'a']);
  const capped = recordingBatch(todo, { maxChars: 300 }); assert.deepEqual(capped.batch.map((l) => l.key), ['c', 'b']); assert.equal(capped.left, 1); assert.equal(capped.chars, 290);
  assert.equal(recordingBatch(todo, { maxLines: 1 }).batch.length, 1); assert.ok(AUTO_MAX_LINES <= 100 && AUTO_MAX_CHARS <= 10000);
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
