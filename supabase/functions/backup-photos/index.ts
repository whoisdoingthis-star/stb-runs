// Supabase Edge Function: hands the nightly backup script (tools/gdrive-backup.gs, in Mike's Google account) short-lived
// links to the photos it hasn't copied to Drive yet (Mike, 28 Nov 2026; decision 0080).
// Only a bridge device with its secret gets anything; links last 30 minutes. Deploy with JWT verification off:
// the script sends the app's public key, and the device secret is the check.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  try {
    const { device, secret, limit } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const ok = await admin.rpc('bridge_device_ok', { p_device: String(device ?? ''), p_secret: String(secret ?? '') });
    if (ok.data !== true) return reply(403, { error: 'Not allowed' });
    const todo = await admin.rpc('photos_to_copy', { p_limit: Math.min(Math.max(Number(limit) || 100, 1), 500) });
    if (todo.error) throw todo.error;
    const photos = [];
    for (const p of todo.data ?? []) {
      const s = await admin.storage.from(p.bucket).createSignedUrl(p.name, 1800);
      if (s.data?.signedUrl) photos.push({ bucket: p.bucket, name: p.name, size: p.size, created_at: p.created_at, url: s.data.signedUrl });
    }
    return reply(200, { photos });
  } catch (e) {
    console.log('backup-photos error', e);
    return reply(500, { error: 'Something went wrong' });
  }
});
