// The voice build queue (decision 0065). Used only by .github/workflows/voice-build.yml.
//   node tools/build-queue.mjs next      claim the oldest waiting request; writes voice-build-request.md
//   node tools/build-queue.mjs finish    record how it ended (reads the files the agents wrote)
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Prints nothing secret. The agents never get these keys.

import fs from 'node:fs';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''); const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); console.log(`${k}=${v}`); };
const rest = (path, init = {}) => fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) } });
const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return ''; } };

/** Drivers are on the road from about 1 am to 8 am: nothing is built or published then (decision 0065). */
export const QUIET_FROM = 1; export const QUIET_TO = 8;
export const nzHour = (now = new Date()) => Number(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' }).format(now));
export const quietNow = (now = new Date()) => { const h = nzHour(now); return h >= QUIET_FROM && h < QUIET_TO; };
/** How a build ended, from what the checks and the reviewer said. */
export function outcome({ held, built, checks, verdict }) {
  if (held) return 'held';
  if (!built) return 'failed';
  if (checks !== 'success') return 'failed';
  return verdict === 'publish' ? 'done' : 'held';
}

const cmd = process.argv[2];
if (cmd === 'next') {
  if (!URL_ || !KEY) { console.log('No Supabase details here, so nothing to do.'); out('has', 'false'); process.exit(0); }
  if (process.env.HAS_AGENT_KEY !== 'true') { console.log('No Claude key in this repository’s secrets yet, so requests stay waiting.'); out('has', 'false'); process.exit(0); }
  if (quietNow() && process.env.FORCE !== 'true') { console.log('The runs are on. Requests wait until 8 am.'); out('has', 'false'); process.exit(0); }
  const busy = await (await rest('build_requests?select=id&status=eq.running&started_at=gt.' + new Date(Date.now() - 90 * 60e3).toISOString())).json();
  if (Array.isArray(busy) && busy.length) { console.log('A build is already running.'); out('has', 'false'); process.exit(0); }
  const waiting = await (await rest('build_requests?select=id,request,requested_by,created_at&status=eq.queued&order=created_at.asc&limit=1')).json();
  if (!Array.isArray(waiting) || !waiting.length) { console.log('Nothing waiting.'); out('has', 'false'); process.exit(0); }
  const r = waiting[0];
  const claimed = await (await rest(`build_requests?id=eq.${r.id}&status=eq.queued`, { method: 'PATCH', body: JSON.stringify({ status: 'running', started_at: new Date().toISOString(), run_url: process.env.RUN_URL || null }) })).json();
  if (!Array.isArray(claimed) || !claimed.length) { console.log('Someone else took it.'); out('has', 'false'); process.exit(0); }
  fs.writeFileSync('voice-build-request.md', `# Request from ${r.requested_by || 'Mike'}, taken down ${r.created_at}\n\n${r.request}\n`);
  out('has', 'true'); out('id', r.id);
} else if (cmd === 'finish') {
  const id = process.env.REQUEST_ID; if (!id || !URL_ || !KEY) process.exit(0);
  const hold = read('voice-build-hold.md'); const summary = read('voice-build-summary.md');
  let review = {}; try { review = JSON.parse(read('voice-build-review.json') || '{}'); } catch { review = { verdict: 'hold', reasons: ['The reviewer’s verdict could not be read.'] }; }
  const status = outcome({ held: !!hold, built: process.env.BUILT === 'true', checks: process.env.CHECKS, verdict: review.verdict });
  const published = status === 'done' && process.env.PUBLISHED === 'true';
  const row = {
    status: status === 'done' && !published ? 'failed' : status, finished_at: new Date().toISOString(),
    summary: (review.for_mike || summary || '').slice(0, 2000) || null,
    held_reason: (hold || (status === 'held' ? (review.reasons || []).join(' · ') : '') || (status === 'failed' ? `Checks: ${process.env.CHECKS || 'not run'}. Built: ${process.env.BUILT || 'no'}.` : '')).slice(0, 2000) || null,
    commit_sha: published ? (process.env.COMMIT_SHA || null) : null, branch: process.env.BRANCH || null, run_url: process.env.RUN_URL || null,
  };
  const res = await rest(`build_requests?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(row) });
  console.log(`Request ${id}: ${row.status}${res.ok ? '' : ` (couldn't record it: ${res.status})`}`);
}
