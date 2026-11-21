// Records any of Stan's lines that are in the code but not yet in his voice (decision 0061).
// Run by GitHub after a publish (.github/workflows/record-stan.yml). By hand: node tools/record-stan.mjs [--dry-run]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (GitHub's secrets). Nothing is printed that is secret.
// The clips are made by the stan-voice function, which holds the ElevenLabs key: this script never sees it.

import { STAN_LINES, linesToRecord, recordingBatch } from '../js/stanlines.js';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''); const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const dry = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
if (!URL_ || !KEY) { console.log('No Supabase details here, so nothing to do. (On GitHub they come from the repository secrets.)'); process.exit(0); }

const got = await fetch(`${URL_}/rest/v1/stan_lines?select=key,text&limit=2000`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!got.ok) { console.error(`Couldn't read what is already recorded (${got.status}).`); process.exit(1); }
const todo = linesToRecord(await got.json(), STAN_LINES);
const { batch, left, chars } = recordingBatch(todo);
console.log(`${Object.keys(STAN_LINES).length} lines in the code · ${todo.length} to record · doing ${batch.length} now (${chars} characters)${left ? ` · ${left} held back by the cap, for the next run` : ''}`);
if (dry) { for (const l of batch) console.log(`  would record ${l.key} (${l.why}, ${l.say.length})`); process.exit(0); }

let ok = 0; let failedInARow = 0; const failed = [];
for (const l of batch) {
  let res; let body = {};
  try { res = await fetch(`${URL_}/functions/v1/stan-voice`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-server-key': KEY }, body: JSON.stringify({ key: l.key, text: l.say }) }); body = await res.json().catch(() => ({})); }
  catch (e) { body = { error: String(e?.message || e) }; }
  if (res?.ok && body.ok) { ok += 1; failedInARow = 0; console.log(`  ✓ ${l.key} (${body.bytes} bytes)`); }
  else { failed.push(l.key); failedInARow += 1; console.log(`  ✗ ${l.key}: ${String(body.error || res?.status || 'no answer').slice(0, 200)}`); }
  if (failedInARow >= 3) { console.log('Three in a row failed, so stopping here. The rest will be tried on the next publish.'); break; }
  await new Promise((r) => setTimeout(r, 400));   // gently
}
console.log(`Recorded ${ok} of ${batch.length}.${failed.length ? ` Not recorded: ${failed.join(', ')}` : ''}`);
process.exit(failed.length && !ok ? 1 : 0);   // a run where nothing worked shows red; a partial one finishes next time
