// Supabase Edge Function: user admin for the dispatch dashboard.
//
// Only an active dispatcher can call it. Actions:
//   add       { email, name, role, password }  create the login (confirmed) and the member
//   password  { email, password }              set a new temporary password
//   role      { email, role }                  'driver' (app only) or 'dispatcher' (app + dashboard)
//   active    { email, active }                switch access off or back on
// Logins are created with a temporary password the dispatcher passes on in person;
// the person can change it in the app. (Supabase's built-in email sender only
// delivers to the project's own team, so email invites are left for STB proper.)
// Uses the built-in SUPABASE_SERVICE_ROLE_KEY; nothing else to configure.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) return reply(401, { error: 'Sign in first.' });
    const { data: me } = await admin.from('members').select('display_name, role, active').ilike('email', user.email ?? '').maybeSingle();
    if (!me || !me.active || me.role !== 'dispatcher') return reply(403, { error: 'Only a dispatcher can manage users.' });

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: 'That email address doesn’t look right.' });
    const findUser = async () => {
      for (let page = 1; page < 20; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const u = data.users.find((x) => (x.email ?? '').toLowerCase() === email);
        if (u || data.users.length < 200) return u ?? null;
      }
      return null;
    };
    const goodPassword = (p: unknown) => typeof p === 'string' && p.length >= 8;
    // Writes go through the members table with the caller's rights checked above;
    // the database trigger still refuses to remove the last dispatcher.
    const audit = (action: string, data: unknown) =>
      admin.from('dispatch_history').insert({ by_email: user.email, entity: 'login', entity_id: email, action, data });

    switch (body.action) {
      case 'add': {
        const name = String(body.name ?? '').trim();
        const role = body.role === 'dispatcher' ? 'dispatcher' : 'driver';
        if (!name) return reply(400, { error: 'Give them a name (it shows on the tiles they tick).' });
        if (!goodPassword(body.password)) return reply(400, { error: 'The temporary password needs at least 8 characters.' });
        let u = await findUser();
        if (!u) {
          const { data, error } = await admin.auth.admin.createUser({ email, password: body.password, email_confirm: true });
          if (error) return reply(400, { error: error.message });
          u = data.user;
        } else {
          const { error } = await admin.auth.admin.updateUserById(u.id, { password: body.password, ban_duration: 'none' });
          if (error) return reply(400, { error: error.message });
        }
        const { data: existing } = await admin.from('members').select('email').ilike('email', email).maybeSingle();
        const { error } = existing
          ? await admin.from('members').update({ display_name: name, role, active: true }).eq('email', existing.email)
          : await admin.from('members').insert({ email, display_name: name, role, active: true });
        if (error) return reply(400, { error: error.message });
        await audit('add', { name, role });
        return reply(200, { ok: true });
      }
      case 'password': {
        if (!goodPassword(body.password)) return reply(400, { error: 'The temporary password needs at least 8 characters.' });
        const u = await findUser();
        if (!u) return reply(404, { error: 'No login with that email.' });
        const { error } = await admin.auth.admin.updateUserById(u.id, { password: body.password });
        if (error) return reply(400, { error: error.message });
        await audit('password', null);
        return reply(200, { ok: true });
      }
      case 'role': {
        const role = body.role === 'dispatcher' ? 'dispatcher' : 'driver';
        const { error } = await admin.from('members').update({ role }).ilike('email', email);
        if (error) return reply(400, { error: error.message });
        return reply(200, { ok: true });
      }
      case 'active': {
        const active = !!body.active;
        const { error } = await admin.from('members').update({ active }).ilike('email', email);
        if (error) return reply(400, { error: error.message });
        const u = await findUser();
        // Also stop the login itself, so an open session can't refresh.
        if (u) await admin.auth.admin.updateUserById(u.id, { ban_duration: active ? 'none' : '876000h' });
        return reply(200, { ok: true });
      }
      default:
        return reply(400, { error: 'Unknown action.' });
    }
  } catch (e) {
    return reply(500, { error: String(e?.message ?? e) });
  }
});
