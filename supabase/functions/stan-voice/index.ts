// Supabase Edge Function: records one of Stan's lines (decision 0043).
//
// Who can call it (it checks for itself, so it is deployed with the gateway's own sign-in check off):
//   - an active dispatcher, signed in (the button on Dispatch → Set-up → Stan's voice), or
//   - the publishing job on GitHub (decision 0061), which sends the project's server key in the x-server-key header.
//     The key is proved by using it: it must be able to do something only a server key can.
// Body: { key, text }.
// It asks ElevenLabs to say `text` in Stan's voice, keeps the clip in the public "stan-voice" bucket as <key>.mp3,
// and notes it in the stan_lines table. One line per call, so a slow one can't sink the rest.
//
// Needs one secret, set by hand in Supabase (Edge Functions → Secrets). It must never be in the repository or a chat:
//   ELEVENLABS_API_KEY   an ElevenLabs key that is allowed to use Text to Speech
// Optional: STAN_VOICE_ID and STAN_VOICE_MODEL, to change the voice without changing this file.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const VOICE_ID = Deno.env.get('STAN_VOICE_ID') ?? 'KmDkZyMv2YNBDYoB7H1S';   // "Stan v2 (Send The Boy)", designed 21 Nov 2026
const MODEL = Deno.env.get('STAN_VOICE_MODEL') ?? 'eleven_v3';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',   // x-server-key is deliberately not here: it is for servers, never a browser
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let who = '';
    const serverKey = (req.headers.get('x-server-key') ?? '').trim();
    if (serverKey) {
      // Only a server key can list the project's users. A wrong or ordinary key fails here.
      const probe = await createClient(Deno.env.get('SUPABASE_URL')!, serverKey, { auth: { persistSession: false } }).auth.admin.listUsers({ page: 1, perPage: 1 });
      if (probe.error) return reply(401, { error: 'That server key isn’t accepted.' });
      who = 'Stan (auto)';
    } else {
      const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
      if (authErr || !user) return reply(401, { error: 'Sign in first.' });
      const { data: me } = await admin.from('members').select('display_name, role, active').ilike('email', user.email ?? '').maybeSingle();
      if (!me || !me.active || me.role !== 'dispatcher') return reply(403, { error: 'Only a dispatcher can record Stan’s lines.' });
      who = me.display_name;
    }

    const body = await req.json().catch(() => ({}));
    const key = String(body.key ?? '');
    const text = String(body.text ?? '').trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(key)) return reply(400, { error: 'That line has no proper name.' });
    if (!text || text.length > 300) return reply(400, { error: 'A line must be between 1 and 300 characters.' });

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) return reply(503, { error: 'The voice key isn’t set yet. Add ELEVENLABS_API_KEY under Edge Functions → Secrets in Supabase.' });

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL }),
    });
    if (!res.ok) {
      const why = (await res.text()).slice(0, 300);
      return reply(502, { error: `The voice service said no (${res.status}). ${why}` });
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length < 500) return reply(502, { error: 'The voice service sent back an empty clip.' });

    const path = `${key}.mp3`;
    const up = await admin.storage.from('stan-voice').upload(path, audio, { contentType: 'audio/mpeg', upsert: true, cacheControl: '300' });
    if (up.error) return reply(500, { error: `Couldn’t keep the clip: ${up.error.message}` });
    const row = { key, text, voice_id: VOICE_ID, model: MODEL, bytes: audio.length, recorded_by: who, recorded_at: new Date().toISOString() };
    const saved = await admin.from('stan_lines').upsert(row);
    if (saved.error) return reply(500, { error: `Couldn’t note the clip: ${saved.error.message}` });
    return reply(200, { ok: true, ...row });
  } catch (e) {
    return reply(500, { error: String((e as Error)?.message ?? e) });
  }
});
