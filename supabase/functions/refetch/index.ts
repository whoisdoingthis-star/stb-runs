// Supabase Edge Function: "Re-fetch from RouteSmart" button in the app.
//
// A signed-in family member asks for a re-fetch; this checks they're on the
// family list, then starts the same GitHub Actions job the evening schedule
// runs ("Fetch tomorrow's run sheets"). The job re-downloads the sheets from
// RouteSmart, checks every total, and replaces the runs; phones with a run
// open refresh live.
//
// Needs one secret (Supabase -> Edge Functions -> Secrets):
//   GITHUB_DISPATCH_TOKEN  a fine-grained GitHub token for the stb-runs repo
//                          with "Actions: Read and write" and nothing else.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const REPO = Deno.env.get('GITHUB_REPO') ?? 'whoisdoingthis-star/stb-runs';
const WORKFLOW = 'fetch-run-sheets.yml';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return reply(401, { error: 'Sign in first.' });
    const { data: member } = await admin.from('members').select('display_name').ilike('email', user.email ?? '').maybeSingle();
    if (!member) return reply(403, { error: 'This login is not on the family list.' });

    const { date } = await req.json().catch(() => ({ date: '' }));
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(400, { error: 'Date must look like 2026-11-09.' });

    const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
    if (!token) return reply(500, { error: 'GITHUB_DISPATCH_TOKEN is not set in Supabase.' });
    const gh = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'stb-runs-refetch',
      },
      body: JSON.stringify({ ref: 'main', inputs: { target_date: date || '' } }),
    });
    if (gh.status !== 204) return reply(502, { error: `GitHub refused the request (${gh.status}). ${(await gh.text()).slice(0, 200)}` });
    return reply(200, { ok: true, by: member.display_name, date: date || 'tomorrow' });
  } catch (e) {
    return reply(500, { error: String(e) });
  }
});
