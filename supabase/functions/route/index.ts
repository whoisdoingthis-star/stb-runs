// Supabase Edge Function: directions for the Driver Assistant (docs/decisions/0019-driver-assistant.md).
//
// A signed-in family member's phone asks for a driving route from where it is to the next
// stop (or, once, where an address is). This checks they're on the family list and asks
// OpenRouteService, so the ORS key never sits in the app (the repository is public).
//
//   POST { from: [lng, lat], to: [lng, lat] }   -> ORS GeoJSON route with turn instructions
//   POST { geocode: "27 Luplau Crescent, Howick" } -> { lng, lat, label } or 404
//
// Needs one secret (Supabase -> Edge Functions -> Secrets):
//   ORS_API_KEY   a free "Standard" key from https://account.heigit.org (2,000 directions a day).
// Without it the app quietly uses arrow-and-distance guidance instead.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ORS = 'https://api.openrouteservice.org';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Only New Zealand (keeps a leaked login from using our quota for anything else).
const inNZ = (p: unknown): p is [number, number] =>
  Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n))
  && p[0] > 165 && p[0] < 179.5 && p[1] > -47.5 && p[1] < -34;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return reply(401, { error: 'Sign in first.' });
    const { data: member } = await admin.from('members').select('display_name, active').ilike('email', user.email ?? '').maybeSingle();
    if (!member || member.active === false) return reply(403, { error: 'This login is not on the family list.' });

    const key = Deno.env.get('ORS_API_KEY');
    if (!key) return reply(503, { error: 'ORS_API_KEY is not set in Supabase.', setup: true });
    const body = await req.json().catch(() => ({}));

    if (typeof body.geocode === 'string') {
      const text = body.geocode.slice(0, 120);
      const u = `${ORS}/geocode/search?api_key=${encodeURIComponent(key)}&text=${encodeURIComponent(text)}&boundary.country=NZ&size=1&layers=address`;
      const r = await fetch(u);
      if (!r.ok) return reply(r.status, { error: `Geocoding failed (${r.status}).` });
      const f = (await r.json()).features?.[0];
      if (!f) return reply(404, { error: 'Address not found.' });
      const [lng, lat] = f.geometry.coordinates;
      return reply(200, { lng, lat, label: f.properties?.label ?? text, confidence: f.properties?.confidence ?? null });
    }

    if (!inNZ(body.from) || !inNZ(body.to)) return reply(400, { error: 'from and to must be [lng, lat] in New Zealand.' });
    const r = await fetch(`${ORS}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json', Accept: 'application/geo+json' },
      body: JSON.stringify({ coordinates: [body.from, body.to], instructions: true, language: 'en', units: 'm' }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) return reply(r.status, { error: out?.error?.message ?? `Routing failed (${r.status}).` });
    return reply(200, out);
  } catch (e) {
    return reply(500, { error: String(e) });
  }
});
