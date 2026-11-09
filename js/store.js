// Data layer. Two backends with the same shape:
//  - SupabaseStore: shared runs, live ticks, family logins.
//  - LocalStore: demo mode, everything stays on this phone.
// Both keep a local copy of open runs and a queue of taps not yet sent,
// so the app keeps working with no signal.

import { lineRows, runRow, changeRecord } from './rows.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
const shortId = () => uuid().replace(/-/g, '').slice(0, 10);

/** A random id for this phone/browser, kept forever. Used to tell helpers apart. */
export function deviceId() {
  let id = LS.get('stb.device', null);
  if (!id) { id = uuid(); LS.set('stb.device', id); }
  return id;
}

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  return 'Other';
}

/** Latest event per line wins. */
export function statusFrom(events) {
  const s = {};
  for (const e of events) {
    const k = `${e.run_id}::${e.line_key}`;
    const cur = s[k];
    if (!cur || e.device_time > cur.device_time || (e.device_time === cur.device_time && (e.server_time || '') > (cur.server_time || ''))) s[k] = e;
  }
  return s;
}

class Base {
  constructor() { this.listeners = new Set(); }
  onSync(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emitSync() { for (const fn of this.listeners) fn(this.pendingCount()); }
  pending() { return LS.get('stb.pending', []); }
  pendingCount() { return this.pending().length + Object.keys(this.pendingSeqs()).length; }
  cacheRun(id, data) { LS.set(`stb.run.${id}`, data); }
  cachedRun(id) { return LS.get(`stb.run.${id}`, null); }
  cacheEvents(id, evs) { LS.set(`stb.events.${id}`, evs); }
  cachedEvents(id) { return LS.get(`stb.events.${id}`, []); }
  withPending(runIds, events) {
    const ids = new Set(events.map((e) => e.id));
    return events.concat(this.pending().filter((e) => runIds.includes(e.run_id) && !ids.has(e.id)));
  }
  /**
   * Record a tap: saved on the phone straight away, sent when there is signal.
   * `hold` keeps it back briefly while GPS catches up (see patchEvent); a held
   * tap older than HOLD_MS is sent anyway, so a closed app never loses one.
   */
  addEvent(e, hold = false) {
    const row = hold ? { ...e, _hold: Date.now() } : e;
    LS.set('stb.pending', [...this.pending(), row]);
    this.cacheEvents(e.run_id, [...this.cachedEvents(e.run_id), e]);
    this.emitSync();
    this.flush();
  }
  addEvents(list, hold = false) {
    if (!list.length) return;
    const rows = hold ? list.map((e) => ({ ...e, _hold: Date.now() })) : list;
    LS.set('stb.pending', [...this.pending(), ...rows]);
    const byRun = {};
    for (const e of list) (byRun[e.run_id] ||= []).push(e);
    for (const [run, evs] of Object.entries(byRun)) this.cacheEvents(run, [...this.cachedEvents(run), ...evs]);
    this.emitSync();
    this.flush();
  }
  patchEvents(ids, patch) {
    const set = new Set(ids);
    const runs = new Set(this.pending().filter((e) => set.has(e.id)).map((e) => e.run_id));
    for (const run of runs) this.cacheEvents(run, this.cachedEvents(run).map((e) => (set.has(e.id) ? { ...e, ...patch } : e)));
    LS.set('stb.pending', this.pending().map((e) => {
      if (!set.has(e.id)) return e;
      const { _hold, ...rest } = { ...e, ...patch };
      void _hold;
      return rest;
    }));
    this.flush();
  }
  // ---- door / access codes per route section (kept behind the login) ----
  cachedCodes(route) { return LS.get(`stb.codes.${route}`, {}); }
  patchEvent(id, patch) {
    const p = this.pending().find((e) => e.id === id);
    if (p) this.cacheEvents(p.run_id, this.cachedEvents(p.run_id).map((e) => (e.id === id ? { ...e, ...patch } : e)));
    LS.set('stb.pending', this.pending().map((e) => {
      if (e.id !== id) return e;
      const { _hold, ...rest } = { ...e, ...patch };
      void _hold;
      return rest;
    }));
    this.flush();
  }
  // ---- custom route order (see sequence.js) ----
  cachedSeq(route) { return LS.get(`stb.seq.${route}`, null); }
  cacheSeq(route, v) { if (v) LS.set(`stb.seq.${route}`, v); else LS.del(`stb.seq.${route}`); }
  pendingSeqs() { return LS.get('stb.seqpending', {}); }
  /** keys = ordered address keys, or null to go back to sheet order. */
  saveSequence(route, keys, by) {
    const v = keys ? { keys, by, at: new Date().toISOString() } : null;
    this.cacheSeq(route, v);
    LS.set('stb.seqpending', { ...this.pendingSeqs(), [route]: v });
    this.flush();
  }
  sendable() {
    const now = Date.now();
    return this.pending().filter((e) => !e._hold || now - e._hold > HOLD_MS).map((e) => {
      const out = {};
      for (const k of EVENT_COLUMNS) if (e[k] !== undefined) out[k] = e[k];
      return out;
    });
  }
}

const HOLD_MS = 10000;
export const EVENT_COLUMNS = ['id', 'run_id', 'line_key', 'address_key', 'route', 'done', 'user_name', 'device_time', 'lat', 'lng', 'accuracy_m', 'fix_age_ms', 'device', 'outcome', 'reason', 'qty_delivered', 'method'];

// ---------------------------------------------------------------------------

export class LocalStore extends Base {
  mode = 'demo';
  async init() { return this; }
  async session() { return { id: 'demo', name: 'Me', email: '' }; }
  async signIn() { return this.session(); }
  async signOut() {}
  runs() { return LS.get('stb.demo.runs', []); }
  async listRuns() {
    return this.runs().map((r) => {
      const st = statusFrom(this.cachedEvents(r.id));
      r.done = Object.values(st).filter((e) => e.done).length;
      return r;
    }).sort((a, b) => (b.delivery_date + b.route < a.delivery_date + a.route ? -1 : 1));
  }
  async findRun(route, date) { return this.runs().find((r) => r.route === route && r.delivery_date === date) || null; }
  async saveRun(r, filename, replaceId) {
    const runs = this.runs();
    const id = replaceId || shortId();
    const prev = replaceId ? this.cachedRun(replaceId) : null;
    const now = new Date().toISOString();
    const row = { id, ...runRow(r, filename), source: 'upload', created_at: prev?.run.created_at || now, updated_at: now,
      last_changes: prev ? changeRecord(prev.lines, lineRows(id, r)) : null };
    this.lastChanges = row.last_changes;
    LS.set('stb.demo.runs', [...runs.filter((x) => x.id !== id), row]);
    this.cacheRun(id, { run: row, lines: lineRows(id, r) });
    this.bc()?.postMessage({ type: 'run', run: row });
    return id;
  }
  async refetch() { throw new Error('Re-fetch needs the shared (Supabase) version of the app.'); }
  watchRuns(cb) {
    const bc = this.bc();
    if (!bc) return () => {};
    const h = ({ data: m }) => { if (m.type === 'run') cb(m.run); };
    bc.addEventListener('message', h);
    return () => bc.removeEventListener('message', h);
  }
  async loadRuns(ids) {
    const out = [];
    for (const id of ids) { const c = this.cachedRun(id); if (c) out.push(c); }
    return out;
  }
  async loadEvents(ids) { return ids.flatMap((id) => this.cachedEvents(id)); }
  async loadSequences(routes) { return Object.fromEntries(routes.map((r) => [r, this.cachedSeq(r)])); }
  // Demo mode has nowhere to send to: once GPS is attached, a tap is final.
  async flush() {
    const sent = new Set(this.sendable().map((e) => e.id));
    LS.set('stb.pending', this.pending().filter((e) => !sent.has(e.id)));
    LS.set('stb.seqpending', {});
    this.emitSync();
  }
  // Demo mode: tabs on the same device talk to each other, so a second tab
  // behaves like a second driver (handy for trying out working a run together).
  bc() { if (!this._bc && 'BroadcastChannel' in window) this._bc = new BroadcastChannel('stb-demo'); return this._bc; }
  addEvent(e, hold) { super.addEvent(e, hold); this.bc()?.postMessage({ type: 'tap', ev: e }); }
  addEvents(list, hold) { super.addEvents(list, hold); for (const e of list) this.bc()?.postMessage({ type: 'tap', ev: e }); }
  async loadAccessCodes(route) { return this.cachedCodes(route); }
  async saveAccessCodes(route, codes) { LS.set(`stb.codes.${route}`, codes); }
  // Demo mode keeps a note that a photo was taken (the photo itself stays on the phone).
  async savePhoto(blob, meta) { LS.set('stb.demo.photos', [...LS.get('stb.demo.photos', []), { ...meta, taken_at: new Date().toISOString() }]); return null; }
  async loadPhotos(ids) { return LS.get('stb.demo.photos', []).filter((p) => ids.includes(p.run_id)); }
  async loadWatch(routes) { const all = LS.get('stb.watch', {}); return Object.fromEntries(routes.map((r) => [r, all[r] || []])); }
  async setWatch(route, addressKey, on) {
    const all = LS.get('stb.watch', {});
    const set = new Set(all[route] || []);
    if (on) set.add(addressKey); else set.delete(addressKey);
    all[route] = [...set]; LS.set('stb.watch', all);
  }
  saveSequence(route, keys, by) { super.saveSequence(route, keys, by); this.bc()?.postMessage({ type: 'seq', route, v: this.cachedSeq(route) }); }
  subscribe(ids, me, on) {
    const bc = this.bc();
    if (!bc) return () => {};
    const dev = deviceId() + Math.random().toString(36).slice(2, 6); // each tab counts as its own screen
    const others = new Map();
    const emitPresence = () => {
      const now = Date.now();
      for (const [k, v] of others) if (now - v.at > 15000) others.delete(k);
      on.presence?.([...others.values()].map((v) => v.name));
    };
    const hello = () => bc.postMessage({ type: 'here', dev, ids, name: 'Another screen' });
    const handler = ({ data: m }) => {
      if (m.type === 'tap' && ids.includes(m.ev.run_id)) on.event?.(m.ev);
      else if (m.type === 'run' && ids.includes(m.run.id)) on.runChanged?.(m.run);
      else if (m.type === 'seq') on.seq?.(m.route, m.v);
      else if (m.type === 'here' && m.dev !== dev && m.ids.some((i) => ids.includes(i))) {
        const isNew = !others.has(m.dev);
        others.set(m.dev, { name: m.name, at: Date.now() });
        if (isNew) hello();
        emitPresence();
      } else if (m.type === 'bye') { others.delete(m.dev); emitPresence(); }
    };
    bc.addEventListener('message', handler);
    hello();
    const t = setInterval(() => { hello(); emitPresence(); }, 5000);
    return () => { clearInterval(t); bc.postMessage({ type: 'bye', dev }); bc.removeEventListener('message', handler); };
  }
}

// ---------------------------------------------------------------------------

export class SupabaseStore extends Base {
  mode = 'shared';
  constructor(createClient, url, key) {
    super();
    this.sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.me = null;
    this.flushing = false;
    window.addEventListener('online', () => this.flush());
    setInterval(() => this.flush(), 20000);
  }
  async init() { return this; }
  async session() {
    const { data } = await this.sb.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    if (!this.me || this.me.id !== user.id) {
      let name = LS.get(`stb.name.${user.id}`, null);
      let res = null;
      let role = LS.get(`stb.role.${user.id}`, 'driver');
      try {
        res = await this.sb.from('members').select('display_name, role').ilike('email', user.email).maybeSingle();
        // Before the dispatch part of the schema is applied there is no role column: carry on as a driver.
        if (res.error && /role/.test(res.error.message)) res = await this.sb.from('members').select('display_name').ilike('email', user.email).maybeSingle();
      } catch { /* offline */ }
      if (res && !res.error) {
        if (!res.data) throw new Error('This login is not on the family list, or its access has been switched off.');
        name = res.data.display_name;
        role = res.data.role || 'driver';
        LS.set(`stb.name.${user.id}`, name);
        LS.set(`stb.role.${user.id}`, role);
      }
      this.me = { id: user.id, email: user.email, name: name || user.email.split('@')[0], role };
    }
    return this.me;
  }
  async changePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }
  async signIn(email, password) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email or password is wrong.' : error.message);
    return this.session();
  }
  async signOut() { await this.sb.auth.signOut(); this.me = null; }

  async listRuns() {
    const { data, error } = await this.sb.from('runs')
      .select('id, route, delivery_date, weekday_name, summary, created_at, updated_at, source, last_changes, key_report, driver, closed_at, close_method')
      .order('delivery_date', { ascending: false }).order('route').limit(60);
    if (error) { const c = LS.get('stb.runlist', []); if (c.length) return c; throw error; }
    const ids = data.map((r) => r.id);
    if (ids.length) {
      const { data: st } = await this.sb.from('run_progress').select('run_id, done, not_delivered, ticked_by').in('run_id', ids);
      const by = Object.fromEntries((st || []).map((x) => [x.run_id, x]));
      data.forEach((r) => { r.done = by[r.id]?.done || 0; r.notDelivered = by[r.id]?.not_delivered || 0; r.tickedBy = by[r.id]?.ticked_by || ''; });
    }
    LS.set('stb.runlist', data);
    return data;
  }
  async findRun(route, date) {
    const { data } = await this.sb.from('runs').select('id, route, delivery_date').eq('route', route).eq('delivery_date', date).maybeSingle();
    return data || null;
  }
  async saveRun(r, filename, replaceId) {
    let id = replaceId;
    if (replaceId) {
      // Swap the addresses first, then touch the run row last: phones watching
      // the run reload when the row changes, so the new addresses are already in.
      const { data: oldLines } = await this.sb.from('run_lines').select('line_key, address_key, street, number, pub, qty, note, parts').eq('run_id', replaceId);
      const rows = lineRows(id, r);
      const { error: delErr } = await this.sb.from('run_lines').delete().eq('run_id', replaceId);
      if (delErr) throw delErr;
      const { error: lErr } = await this.sb.from('run_lines').insert(rows);
      if (lErr) throw lErr;
      this.lastChanges = changeRecord(oldLines || [], rows);
      const { error } = await this.sb.from('runs').update({ ...runRow(r, filename), source: 'upload', last_changes: this.lastChanges, updated_at: new Date().toISOString() }).eq('id', replaceId);
      if (error) throw error;
      return id;
    }
    this.lastChanges = null;
    const { data, error } = await this.sb.from('runs').insert({ ...runRow(r, filename), source: 'upload' }).select('id').single();
    if (error) throw error;
    id = data.id;
    const { error: lErr } = await this.sb.from('run_lines').insert(lineRows(id, r));
    if (lErr) throw lErr;
    return id;
  }
  /** Ask the server to re-fetch a date's sheets from RouteSmart (shared mode only). */
  async refetch(date) {
    const { data, error } = await this.sb.functions.invoke('refetch', { body: { date } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context.json(); if (b?.error) msg = b.error; } catch { /* keep message */ }
      throw new Error(msg);
    }
    return data;
  }
  /** Call back whenever any run is added or its sheet replaced (for the runs list). */
  watchRuns(cb) {
    const ch = this.sb.channel('runs-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, (p) => cb(p.new || p.old))
      .subscribe();
    return () => { this.sb.removeChannel(ch); };
  }
  async loadRuns(ids) {
    try {
      const [{ data: runs, error: e1 }, { data: lines, error: e2 }] = await Promise.all([
        this.sb.from('runs').select('*').in('id', ids),
        this.sb.from('run_lines').select('*').in('run_id', ids).order('seq'),
      ]);
      if (e1 || e2) throw e1 || e2;
      const out = runs.map((run) => ({ run, lines: lines.filter((l) => l.run_id === run.id) }));
      out.forEach((o) => this.cacheRun(o.run.id, o));
      return ids.map((id) => out.find((o) => o.run.id === id)).filter(Boolean);
    } catch (e) {
      const cached = ids.map((id) => this.cachedRun(id)).filter(Boolean);
      if (cached.length) return cached;
      throw e;
    }
  }
  async loadEvents(ids) {
    try {
      const { data, error } = await this.sb.from('tap_events')
        .select('id, run_id, line_key, done, outcome, reason, qty_delivered, user_name, device_time, server_time, accuracy_m')
        .in('run_id', ids).order('device_time');
      if (error) throw error;
      ids.forEach((id) => this.cacheEvents(id, data.filter((e) => e.run_id === id)));
      return this.withPending(ids, data);
    } catch {
      return this.withPending(ids, ids.flatMap((id) => this.cachedEvents(id)));
    }
  }
  async loadSequences(routes) {
    try {
      const { data, error } = await this.sb.from('route_sequences').select('route, address_keys, updated_by, updated_at').in('route', routes);
      if (error) throw error;
      const pending = this.pendingSeqs();
      const out = {};
      for (const r of routes) {
        if (r in pending) { out[r] = pending[r]; continue; } // our unsent change wins
        const row = data.find((d) => d.route === r);
        out[r] = row ? { keys: row.address_keys, by: row.updated_by, at: row.updated_at } : null;
        this.cacheSeq(r, out[r]);
      }
      return out;
    } catch {
      return Object.fromEntries(routes.map((r) => [r, this.cachedSeq(r)]));
    }
  }
  /** Upload a delivery photo and record it against the address. Returns the stored path. */
  async savePhoto(blob, meta) {
    const safe = String(meta.address_key || 'x').replace(/[^A-Za-z0-9]+/g, '-');
    const path = `${meta.date}/${meta.route}/${safe}-${Date.now()}.jpg`;
    const { error: upErr } = await this.sb.storage.from('delivery-photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) throw upErr;
    const { error } = await this.sb.from('photos').insert({
      run_id: meta.run_id, route: meta.route, line_key: meta.line_key, address_key: meta.address_key, path,
      taken_at: new Date().toISOString(), lat: meta.lat ?? null, lng: meta.lng ?? null, user_name: meta.user_name,
    });
    if (error) throw error;
    return path;
  }
  async loadPhotos(ids) {
    try {
      const { data, error } = await this.sb.from('photos').select('run_id, line_key, address_key, taken_at, user_name').in('run_id', ids);
      if (error) throw error;
      return data;
    } catch { return []; }
  }
  /** Addresses where the family wants a photo every delivery (e.g. after a disputed complaint). */
  async loadWatch(routes) {
    try {
      const { data, error } = await this.sb.from('photo_watch').select('route, address_key').in('route', routes);
      if (error) throw error;
      const out = Object.fromEntries(routes.map((r) => [r, []]));
      for (const w of data) (out[w.route] ||= []).push(w.address_key);
      LS.set('stb.watch', out);
      return out;
    } catch { const all = LS.get('stb.watch', {}); return Object.fromEntries(routes.map((r) => [r, all[r] || []])); }
  }
  async setWatch(route, addressKey, on, by) {
    const q = on
      ? this.sb.from('photo_watch').upsert({ route, address_key: addressKey, added_by: by })
      : this.sb.from('photo_watch').delete().eq('route', route).eq('address_key', addressKey);
    const { error } = await q;
    if (error) throw error;
  }
  async loadAccessCodes(route) {
    try {
      const { data, error } = await this.sb.from('access_codes').select('section_id, code').eq('route', route);
      if (error) throw error;
      const codes = Object.fromEntries(data.map((r) => [r.section_id, r.code]));
      LS.set(`stb.codes.${route}`, codes);
      return codes;
    } catch { return this.cachedCodes(route); }
  }
  async saveAccessCodes(route, codes, by) {
    const rows = Object.entries(codes).map(([section_id, code]) => ({ route, section_id, code: code || '', updated_by: by, updated_at: new Date().toISOString() }));
    const { error } = await this.sb.from('access_codes').upsert(rows, { onConflict: 'route,section_id' });
    if (error) throw error;
    LS.set(`stb.codes.${route}`, codes);
  }
  async flushSeqs() {
    for (const [route, v] of Object.entries(this.pendingSeqs())) {
      const { error } = v
        ? await this.sb.from('route_sequences').upsert({ route, address_keys: v.keys, updated_by: v.by, updated_at: v.at }, { onConflict: 'route' })
        : await this.sb.from('route_sequences').delete().eq('route', route);
      if (error) return;
      const rest = this.pendingSeqs();
      if (rest[route] === v || JSON.stringify(rest[route]) === JSON.stringify(v)) { delete rest[route]; LS.set('stb.seqpending', rest); }
    }
  }
  async flush() {
    if (this.flushing || !navigator.onLine) return;
    this.flushing = true;
    try { await this.flushSeqs(); } catch { /* offline */ }
    this.flushing = false;
    const batch = this.sendable();
    if (!batch.length) { this.emitSync(); return; }
    this.flushing = true;
    try {
      const { error } = await this.sb.from('tap_events').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (!error) {
        const sent = new Set(batch.map((e) => e.id));
        LS.set('stb.pending', this.pending().filter((e) => !sent.has(e.id)));
      }
    } catch { /* still offline; try again later */ }
    this.flushing = false;
    this.emitSync();
  }
  /**
   * Live updates while a run is open:
   *  on.event(tap)          another phone ticked/unticked something
   *  on.presence([names])   who else has this run open right now
   *  on.seq(route, order)   someone changed the delivery order
   */
  subscribe(ids, me, on) {
    const dev = deviceId();
    const channels = [];
    const present = new Map(); // run id -> names
    const emitPresence = () => {
      const names = new Set();
      for (const list of present.values()) list.forEach((n) => names.add(n));
      on.presence?.([...names]);
    };
    for (const id of ids) {
      const ch = this.sb.channel(`run:${id}`, { config: { presence: { key: dev } } });
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_events', filter: `run_id=eq.${id}` }, (p) => on.event?.(p.new))
        .on('presence', { event: 'sync' }, () => {
          const st = ch.presenceState();
          present.set(id, Object.entries(st).filter(([k]) => k !== dev).flatMap(([, metas]) => metas.slice(0, 1).map((m) => m.name)));
          emitPresence();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') ch.track({ name: me.name, at: new Date().toISOString() });
          if (status === 'SUBSCRIBED' && channels.subscribedOnce) on.reconnect?.();
          if (status === 'SUBSCRIBED') channels.subscribedOnce = true;
        });
      channels.push(ch);
    }
    // A run's sheet was replaced (manual reload or re-fetch): tell the open run view.
    const runsCh = this.sb.channel(`runs:${ids.join(',')}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'runs', filter: `id=in.(${ids.join(',')})` }, (p) => on.runChanged?.(p.new))
      .subscribe();
    channels.push(runsCh);
    const routes = on.routes || [];
    if (routes.length) {
      const seqCh = this.sb.channel(`seq:${routes.join(',')}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'route_sequences' }, (p) => {
          const row = p.eventType === 'DELETE' ? p.old : p.new;
          if (!row || !routes.includes(row.route)) return;
          if (row.route in this.pendingSeqs()) return; // our own unsent change wins
          const v = p.eventType === 'DELETE' ? null : { keys: row.address_keys, by: row.updated_by, at: row.updated_at };
          this.cacheSeq(row.route, v);
          on.seq?.(row.route, v);
        })
        .subscribe();
      channels.push(seqCh);
    }
    return () => { channels.forEach((c) => this.sb.removeChannel(c)); };
  }
}
