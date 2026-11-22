// Stan's School progress (decision 0065): sends what this phone has finished, and learns what this person has done on
// any phone. Shared by the app, Stan's School (learn/) and Sandbox Stan (sandbox/), which all sit on the same site and so
// share the same sign-in. With no sign-in or no signal, progress waits on the phone and is sent next time.

import { PROGRESS_KEY, localProgress, stillNeeded } from './training.js';

const CACHE = 'stb.training.me';   // { name, done, needs }: what was last known, for when there's no signal

/** The last known status on this phone, or null. */
export function cachedTraining(S = globalThis.localStorage) { try { return JSON.parse(S.getItem(CACHE) || 'null'); } catch { return null; } }

/**
 * sb: a Supabase client (or null). Returns { name, done: ['course:driver', …], needs: bool, left: [...] } for the signed-in
 * person, or null if nobody is signed in. Falls back to what this phone knows if the database can't be reached.
 */
export async function syncTraining(sb, S = globalThis.localStorage) {
  const local = localProgress(S);
  const mine = (name, done, needs) => { const all = [...new Set([...done, ...local.map((x) => x.item)])]; const v = { name, done: all, needs: !!needs, left: needs ? stillNeeded(all) : [] }; try { S.setItem(CACHE, JSON.stringify(v)); } catch { /* private mode */ } return v; };
  if (!sb) return null;
  let user = null;
  try { user = (await sb.auth.getSession()).data.session?.user || null; } catch { /* offline */ }
  if (!user) return null;
  try {
    const { data: m, error } = await sb.from('members').select('display_name, needs_training').ilike('email', user.email).maybeSingle();
    if (error || !m) throw error || new Error('not on the list');
    const unsent = local.filter((x) => !x.sent);
    if (unsent.length) {
      const { error: e2 } = await sb.from('training_progress').upsert(unsent.map((x) => ({ user_name: m.display_name, item: x.item, done_at: x.at })), { onConflict: 'user_name,item', ignoreDuplicates: true });
      if (!e2) try { S.setItem(PROGRESS_KEY, JSON.stringify(local.map((x) => ({ ...x, sent: true })))); } catch { /* private mode */ }
    }
    const { data: rows } = await sb.from('training_progress').select('item').eq('user_name', m.display_name).limit(500);
    return mine(m.display_name, (rows || []).map((r) => r.item), m.needs_training);
  } catch {
    const c = cachedTraining(S);
    return c ? mine(c.name, c.done, c.needs) : null;
  }
}
