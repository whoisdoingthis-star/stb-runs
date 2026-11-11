// Dispatch dashboard: the address register, locations, policies and users.
// For dispatchers only (the database enforces it; this screen just hides itself).
// Model and rules: docs/business-rules.md#locations, docs/dispatch-guide.md.
//
// Loaded on demand from app.js (#/dispatch), so the drivers' run screens never load it.

const HOWICK = [-36.8935, 174.9300];
const GROUP_KINDS = ['village', 'building', 'street', 'area'];
const SERVICE_KINDS = ['letterbox', 'bank', 'reception', 'lobby', 'door', 'other'];
const POLICY_KINDS = {
  entry_point: 'Entry point from the road',
  access_note: 'Access note',
  not_before: 'No service before',
  time_window: 'Deliver between',
  speed_limit: 'Speed limit',
  restriction: 'Delivery restriction',
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let L = null; // Leaflet, loaded the first time a map is shown
async function leaflet() {
  if (L) return L;
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
  document.head.append(css);
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js'; s.onload = res; s.onerror = () => rej(new Error('Map could not load'));
    document.head.append(s);
  });
  L = window.L;
  L.Icon.Default.imagePath = 'vendor/leaflet/images/';
  return L;
}

import { runComplete } from './rows.js';
import { shiftSegments, runOwners, parseLatLng, clock, SEGMENT_LABEL, DUTY_LABEL, currentDuty } from './shifts.js';
export async function viewDispatch(ctx, tab = 'overview') {
  const { app, h, mount, toast, titleCase, shortRoute, paperSummary, openRefetch, pickSheets, fmtStamp, fmtDate, changeSummary, openSheet } = ctx;
  if (app.store.mode !== 'shared') {
    mount(h('div', { class: 'page' }, h('p', null, 'The dispatch dashboard needs the shared version.'), h('a', { href: '#/' }, '‹ Runs')));
    return;
  }
  if (app.me.role !== 'dispatcher') {
    mount(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, 'The dispatch dashboard is for dispatchers. Ask Mike to switch your access on.'), h('a', { href: '#/' }, '‹ Runs')));
    return;
  }
  const sb = app.store.sb;
  const D = { addresses: [], groups: [], ops: [], svcs: [], policies: [], members: [], history: [], runs: [], status: [], complaints: [], photos: [], register: [], lines: [], clashes: [] };
  const sel = new Set();             // selected address keys
  const F = { route: '', status: 'all', q: '', runsTab: 'active' };
  let current = null;                // { type: 'group'|'op'|'svc'|'address', id }
  const maps = [];

  const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  async function load() {
    const [a, g, o, s, p, m] = await Promise.all([
      sb.from('address_register').select('*').order('street').order('number'),
      sb.from('location_groups').select('*').order('name'),
      sb.from('operating_locations').select('*').order('seq', { nullsFirst: false }).order('name'),
      sb.from('service_locations').select('*').order('seq', { nullsFirst: false }).order('name'),
      sb.from('location_policies').select('*').order('updated_at'),
      sb.from('members').select('*').order('display_name'),
    ]);
    D.addresses = must(a); D.groups = must(g); D.ops = must(o); D.svcs = must(s); D.policies = must(p); D.members = must(m);
    D.addresses.sort(addrCompare);
    D.runs = must(await sb.from('runs').select('id, route, delivery_date, summary, checks, warnings, updated_at, created_at, source, last_changes, key_report, driver, closed_at, closed_by, close_method, close_note').order('delivery_date', { ascending: false }).order('route').limit(80));
    // Progress per run, counted in the database: a run is complete when closed or every stop is dealt with.
    const allIds = D.runs.map((r) => r.id);
    const prog = allIds.length ? (await sb.from('run_progress').select('run_id, done, not_delivered, last_tick, ticked_by').in('run_id', allIds)).data || [] : [];
    const pb = Object.fromEntries(prog.map((x) => [x.run_id, x]));
    D.runs.forEach((r) => { r.done = pb[r.id]?.done || 0; r.notDelivered = pb[r.id]?.not_delivered || 0; r.lastTick = pb[r.id]?.last_tick; r.tickedBy = pb[r.id]?.ticked_by; });
    const focus = focusDate();
    const ids = D.runs.filter((r) => r.delivery_date === focus).map((r) => r.id);
    D.register = (await sb.from('complaint_register').select('*').order('reported_on', { ascending: false }).limit(1000)).data || [];
    const [st, cl, ph, hi] = await Promise.all([
      ids.length ? sb.from('line_status').select('run_id, line_key, done, outcome, reason, qty_delivered, user_name, device_time, method').in('run_id', ids) : { data: [] },
      ids.length ? sb.from('run_lines').select('run_id, line_key, address_key, number, street, qty, flags').in('run_id', ids) : { data: [] },
      sb.from('photos').select('route, address_key, taken_at, user_name').order('taken_at', { ascending: false }).limit(10),
      tab === 'history' ? sb.from('dispatch_history').select('*').order('at', { ascending: false }).limit(250) : { data: D.history },
    ]);
    D.status = st.data || [];
    D.lines = cl.data || [];
    D.complaints = D.lines.filter((l) => (l.flags || []).some((f) => f.type === 'complaint'));
    D.clashes = (await sb.from('policy_clashes').select('*')).data || [];
    D.photos = ph.data || [];
    D.history = hi.data || [];
    // Shifts (decision 0020): everyone's duty changes around the focus day, and where the depot is.
    const from = new Date(Date.parse(`${focus}T00:00:00Z`) - 14 * 3600e3);
    const nzDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(t));
    D.duty = (await app.store.loadDuty(from.toISOString(), new Date(from.getTime() + 40 * 3600e3).toISOString())).filter((e) => nzDay(e.device_time) === focus);
    D.depot = await app.store.getSetting('depot');
  }
  // The delivery day the overview is about: today or the next one loaded, else the latest.
  function focusDate() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
    const dates = [...new Set(D.runs.map((r) => r.delivery_date))].sort();
    return dates.find((d) => d >= today) || dates[dates.length - 1] || today;
  }
  const by = () => app.me.name;
  const now = () => new Date().toISOString();
  const save = async (table, row, id) => {
    const q = id ? sb.from(table).update({ ...row, updated_at: now(), updated_by: by() }).eq('id', id).select().single()
      : sb.from(table).insert({ ...row, updated_by: by() }).select().single();
    return must(await q);
  };

  // ---- helpers
  const groupName = (id) => D.groups.find((g) => g.id === id)?.name;
  const opById = (id) => D.ops.find((o) => o.id === id);
  const svcById = (id) => D.svcs.find((s) => s.id === id);
  const addrLabel = (a) => `${a.number} ${titleCase(a.street)}`;
  const opLabel = (o) => `${o.seq != null ? `${o.seq}. ` : ''}${o.name}${o.group_id ? ` · ${groupName(o.group_id)}` : ''}`;
  const policyTarget = (p) => p.group_id ? `${groupName(p.group_id)} (group)`
    : p.operating_location_id ? `${opById(p.operating_location_id)?.name} (stop)`
      : p.service_location_id ? `${svcById(p.service_location_id)?.name} (service)`
        : addrLabel(D.addresses.find((a) => a.address_key === p.address_key) || { number: '?', street: p.address_key });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
  const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
  // Current, not started yet, or ended (ended ones stay for the record but drivers won't see them).
  const policyState = (p) => !p.active ? 'off' : p.valid_from && p.valid_from > today ? 'future' : p.valid_to && p.valid_to < today ? 'ended' : 'current';
  const policyDates = (p) => p.valid_from && p.valid_to ? ` · ${shortDay(p.valid_from)} to ${shortDay(p.valid_to)}`
    : p.valid_from ? ` · from ${shortDay(p.valid_from)}` : p.valid_to ? ` · until ${shortDay(p.valid_to)}` : '';
  const policyText = (p) => policyBody(p) + policyDates(p) + ({ future: ' (not started)', ended: ' (ended)', off: ' (off)' }[policyState(p)] || '');
  const policyBody = (p) => {
    const days = p.days?.length ? ` · ${p.days.join(', ')}` : '';
    const t = (x) => (x || '').slice(0, 5);
    switch (p.kind) {
      case 'entry_point': return `Entry point${p.note ? `: ${p.note}` : ''}${p.lat != null ? ` (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})` : ''}${days}`;
      case 'not_before': return `No service before ${t(p.time_from)}${days}`;
      case 'time_window': return `Deliver between ${t(p.time_from)} and ${t(p.time_to)}${days}`;
      case 'speed_limit': return `Speed limit ${p.speed_kmh} km/h${p.note ? ` (${p.note})` : ''}${days}`;
      default: return `${POLICY_KINDS[p.kind]}: ${p.note || ''}${days}`;
    }
  };
  // Policies that apply to an address: its own, its service location's, its stop's, and its groups' (inherited upwards).
  function policiesFor({ address, svc, op, group }) {
    const out = [];
    if (address) {
      out.push(...D.policies.filter((p) => p.address_key === address.address_key));
      svc = svc || svcById(address.service_location_id); op = op || opById(address.operating_location_id);
    }
    if (svc) { out.push(...D.policies.filter((p) => p.service_location_id === svc.id)); op = op || opById(svc.operating_location_id); }
    if (op) { out.push(...D.policies.filter((p) => p.operating_location_id === op.id)); group = group || op.group_id; }
    const seen = new Set();
    for (let g = group; g && !seen.has(g); g = D.groups.find((x) => x.id === g)?.parent_id) {
      seen.add(g); out.push(...D.policies.filter((p) => p.group_id === g));
    }
    return out;
  }
  function avgGps(addrs) {
    const pts = addrs.filter((a) => a.gps_lat != null);
    if (!pts.length) return null;
    return { lat: pts.reduce((t, a) => t + a.gps_lat, 0) / pts.length, lng: pts.reduce((t, a) => t + a.gps_lng, 0) / pts.length, n: pts.length };
  }

  async function map(el, { points = [], pick = null, center = null } = {}) {
    try { await leaflet(); } catch (e) { el.replaceChildren(h('div', { class: 'small muted' }, e.message)); return null; }
    const m = L.map(el, { zoomControl: true });
    maps.push(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m);
    const layer = L.layerGroup().addTo(m);
    const draw = (pts) => {
      layer.clearLayers();
      for (const p of pts) {
        const mk = L.circleMarker([p.lat, p.lng], { radius: p.big ? 9 : 6, color: p.color || '#2f3337', weight: 2, fillOpacity: 0.7 })
          .bindTooltip(p.label || '').addTo(layer);
        if (p.onClick) mk.on('click', p.onClick);
      }
    };
    draw(points);
    const located = points.filter((p) => p.lat != null);
    if (center) m.setView([center.lat, center.lng], 18);
    else if (located.length > 1) m.fitBounds(located.map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 18 });
    else if (located.length === 1) m.setView([located[0].lat, located[0].lng], 18);
    else m.setView(HOWICK, 15);
    if (pick) m.on('click', (e) => pick(e.latlng.lat, e.latlng.lng));
    setTimeout(() => m.invalidateSize(), 50);
    return { m, draw };
  }

  // ---- layout
  const tabs = [['overview', 'Overview'], ['runs', 'Runs & sheets'], ['complaints', 'Complaints'], ['addresses', 'Addresses'], ['locations', 'Locations'], ['policies', 'Policies'], ['users', 'People'], ['history', 'Change log']];
  if (!tabs.some(([k]) => k === tab)) tab = 'overview';
  const body = h('div', { class: 'dz-body' }, h('p', { class: 'muted' }, 'Loading…'));
  const nav = h('nav', { class: 'dz-nav', 'aria-label': 'Dispatch' });
  // Switch pages without leaving (keeps what's selected); the address bar follows along.
  const go = async (k, focus) => {
    const needHistory = k === 'history' && tab !== 'history';
    tab = k; if (focus !== undefined) current = focus;
    history.replaceState(null, '', `#/dispatch/${k}`);
    if (needHistory) await refresh(); else render();
  };
  mount(h('div', { class: 'dz dz-shell' },
    h('aside', { class: 'dz-sidebar' },
      h('div', { class: 'dz-logo' }, h('span', { class: 'brand' }, 'Send The Boy'), h('b', null, 'Dispatch')),
      nav,
      h('div', { class: 'dz-side-foot' },
        h('a', { href: '#/', class: 'dz-applink' }, '‹ Driver app'),
        h('div', { class: 'small muted' }, app.me.name))),
    h('main', { class: 'dz-content' }, body)));
  try { await load(); } catch (e) { body.replaceChildren(h('div', { class: 'banner bad' }, `Could not load: ${e.message}. Has the dispatch part of sql/schema.sql been run?`)); return; }
  const render = () => {
    maps.splice(0).forEach((m) => m.remove());
    nav.replaceChildren(...tabs.map(([k, label]) => h('a', { href: `#/dispatch/${k}`, class: k === tab ? 'on' : '', onclick: (e) => { e.preventDefault(); go(k, null); } }, label,
      k === 'addresses' && D.addresses.some((a) => !a.operating_location_id) ? h('span', { class: 'dz-count' }, D.addresses.filter((a) => !a.operating_location_id).length) : null,
      k === 'complaints' && D.register.some((c) => c.status === 'open') ? h('span', { class: 'dz-count bad' }, D.register.filter((c) => c.status === 'open').length) : null)));
    body.replaceChildren(h('h1', { class: 'dz-title' }, tabs.find(([k]) => k === tab)[1]),
      ({ overview: renderOverview, runs: renderRuns, complaints: renderComplaints, addresses: renderAddresses, locations: renderLocations, policies: renderPolicies, users: renderUsers, history: renderHistory })[tab]());
  };
  const refresh = async () => { await load(); render(); };
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await refresh(); } catch (e) { toast(`Didn't save: ${e.message}`); } };
  // Bulk actions on the selected addresses. The selection is cleared afterwards, so the next
  // assignment can never sweep up addresses from the previous one (bug found 8 Nov 2026).
  const bulkAct = (fn, ok) => act(async () => { await fn(); sel.clear(); }, ok);
  // (act/bulkAct return promises, so a toast with Undo can follow the refresh)

  // ================= Overview (landing) =================
  // Delivered In Full, On Time, In Specification (docs/business-rules.md#delivery-outcomes).
  // Counted per address on the sheet, as at the time of service; later complaints about
  // wet or wrong papers count against In spec, but never rewrite who ticked what.
  function difotis(rs, date) {
    const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '–');
    const rows = rs.map((r) => {
      const lines = D.lines.filter((l) => l.run_id === r.id);
      const st = Object.fromEntries(D.status.filter((x) => x.run_id === r.id).map((x) => [x.line_key, x]));
      let delivered = 0; let full = 0; let onTime = 0; let spec = 0; let futile = 0;
      for (const l of lines) {
        const e = st[l.line_key];
        if (!e?.done) continue;
        if (e.outcome === 'futile') { futile++; continue; }
        delivered++;
        if (e.outcome !== 'short') full++;
        if (deliveredOnTime(l, e, date)) onTime++;
        const bad = D.register.some((c) => c.address_key === l.address_key && c.happened_on === date && ['WET', 'DAMAGED', 'WRONG'].includes(c.kind));
        if (!bad) spec++;
      }
      return { r, n: lines.length, delivered, full, onTime, spec, futile };
    });
    return h('div', { class: 'dz-scroll' }, h('table', { class: 'dz-table dz-fit' },
      h('thead', null, h('tr', null, ['Run', 'Delivered', 'In full', 'On time', 'In spec', 'Not delivered'].map((t) => h('th', null, t)))),
      h('tbody', null, rows.map((x) => h('tr', null, h('td', null, shortRoute(x.r.route), x.r.close_method === 'paper' ? h('span', { class: 'small muted' }, ' (paper)') : null),
        h('td', null, `${x.delivered}/${x.n}`), h('td', null, pct(x.full, x.delivered)), h('td', null, pct(x.onTime, x.delivered)),
        h('td', null, pct(x.spec, x.delivered)), h('td', { class: x.futile ? 'bad' : '' }, String(x.futile)))))),
      h('p', { class: 'small muted' }, 'In full = no short delivery. On time = within the address\u2019s time policies if it has any, otherwise on the delivery day. In spec = no wet, damaged or wrong-paper complaint for that day. Not delivered = ticked as couldn\u2019t deliver. Paper runs: stops ticked when the run was closed count as delivered at the finish time entered.'));
  }
  // On time: inside any current time policy for that address and weekday; with none, on the delivery day.
  function deliveredOnTime(l, e, date) {
    const local = new Date(e.device_time);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(local);
    if (day !== date) return false;
    const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit', hour12: false }).format(local);
    const wd = new Date(`${date}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short' }).slice(0, 3);
    const a = D.addresses.find((x) => x.address_key === l.address_key);
    const rules = (a ? policiesFor({ address: a }) : []).filter((p) => policyState(p) === 'current' && (!p.days?.length || p.days.includes(wd)) && ['not_before', 'time_window'].includes(p.kind));
    return rules.every((p) => hm >= (p.time_from || '').slice(0, 5) && (p.kind !== 'time_window' || hm <= (p.time_to || '').slice(0, 5)));
  }

  function renderOverview() {
    const date = focusDate();
    const rs = D.runs.filter((r) => r.delivery_date === date).sort((a, b) => a.route.localeCompare(b.route));
    const doneBy = (id) => D.status.filter((x) => x.run_id === id && x.done).length;
    const active = rs.filter((r) => !runComplete(r)); const finished = rs.length - active.length;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
    const stale = D.runs.filter((r) => r.delivery_date < today && !runComplete(r));
    const lastTick = D.status.filter((x) => x.done).sort((a, b) => (a.device_time < b.device_time ? 1 : -1))[0];
    const unassigned = D.addresses.filter((a) => !a.operating_location_id);
    const newOnes = D.addresses.filter((a) => a.first_seen === date && D.addresses.some((b) => b.first_seen < date));
    const notValidated = D.svcs.filter((x) => !x.validated_at);
    const changed = rs.filter((r) => r.last_changes?.count);
    const failed = rs.filter((r) => (r.checks || []).some((c) => !c.ok));
    const todays = D.register.filter((c) => c.last_seen_on === date || c.reported_on === date);
    const lineOf = (x) => D.lines.find((l) => l.run_id === x.run_id && l.line_key === x.line_key);
    const futile = D.status.filter((x) => x.outcome === 'futile').map((x) => ({ ...x, line: lineOf(x) }));
    const card = (title, ...kids) => h('section', { class: `dz-card ${title.startsWith('Sheets') ? 'wide' : ''}` }, h('h2', null, title), ...kids);
    const attention = [
      stale.length ? h('li', { class: 'bad' }, h('button', { class: 'link', onclick: () => { F.runsTab = 'active'; go('runs', null); } },
        `${stale.length} earlier run${stale.length === 1 ? '' : 's'} not finished or closed: ${stale.slice(0, 5).map((r) => `${shortRoute(r.route)} (${fmtDate(r.delivery_date)})`).join(', ')}${stale.length > 5 ? '…' : ''}`)) : null,
      failed.length ? h('li', { class: 'bad' }, `Totals don't match on ${failed.map((r) => shortRoute(r.route)).join(', ')}`) : null,
      changed.length ? h('li', null, `${changed.map((r) => changeSummary(r.route, r.last_changes)).join(' · ')} since the previous sheet`) : null,
      todays.length ? h('li', null, h('button', { class: 'link', onclick: () => go('complaints', null) }, `${todays.length} complaint${todays.length === 1 ? '' : 's'} on this sheet (see below)`)) : null,
      D.clashes.length ? h('li', { class: 'bad' }, h('button', { class: 'link', onclick: () => go('policies', null) }, `${D.clashes.length} pair${D.clashes.length === 1 ? '' : 's'} of policies disagree`)) : null,
      futile.length ? h('li', { class: 'bad' }, `Not delivered: ${futile.map((x) => `${x.line ? `${x.line.number} ${titleCase(x.line.street)}` : '?'} (${x.reason || '?'}, ${x.user_name || '?'})`).join(', ')}`) : null,
      unassigned.length ? h('li', null, h('button', { class: 'link', onclick: () => { F.status = 'unassigned'; F.route = ''; go('addresses', null); } }, `${unassigned.length} addresses not tied to a location`)) : null,
      newOnes.length ? h('li', null, `${newOnes.length} new address${newOnes.length === 1 ? '' : 'es'} on this sheet: ${newOnes.slice(0, 6).map(addrLabel).join(', ')}${newOnes.length > 6 ? '…' : ''}`) : null,
      notValidated.length ? h('li', null, h('button', { class: 'link', onclick: () => go('locations', null) }, `${notValidated.length} service location${notValidated.length === 1 ? '' : 's'} not validated on the ground`)) : null,
    ].filter(Boolean);
    const sheetsCard = card(`Sheets · ${fmtDate(date, true)}`,
        active.length ? h('div', { class: 'dz-scroll' }, h('table', { class: 'dz-table' },
          h('thead', null, h('tr', null, h('th', null, 'Run'), h('th', null, 'Stops'), h('th', null, 'Items'), h('th', null, 'Totals'), h('th', null, 'Updated'), h('th', null, 'Changes'), h('th', null, 'Status'))),
          h('tbody', null, active.map((r) => h('tr', null,
            h('td', null, h('a', { href: `#/r/${r.id}` }, shortRoute(r.route))),
            h('td', null, r.summary?.lines ?? '?'),
            h('td', null, r.summary?.copies ?? '?'),
            h('td', null, (r.checks || []).every((c) => c.ok) ? h('span', { class: 'ok' }, '✓ match') : h('span', { class: 'bad' }, '✗ check')),
            h('td', null, `${fmtStamp(r.updated_at || r.created_at)} ${r.source === 'auto' ? '(RouteSmart)' : '(upload)'}`),
            h('td', null, r.last_changes ? (r.last_changes.count ? h('span', { class: 'warn' }, `${r.last_changes.count} changed`) : 'none') : '–'),
            h('td', null, runStatus(r))))))) : h('p', { class: rs.length ? 'ok' : 'muted' }, rs.length ? '✓ Every run for this day is finished.' : 'No sheets for this day yet.'),
        finished ? h('p', { class: 'small muted' }, h('button', { class: 'link', onclick: () => { F.runsTab = 'history'; go('runs', null); } }, `${finished} finished run${finished === 1 ? '' : 's'} for this day in History ›`)) : null,
        h('div', { class: 'dz-actions' },
          h('button', { class: 'btn primary', onclick: () => openRefetch() }, 'Get Runs from RouteSmart…'),
          h('button', { class: 'btn', onclick: () => pickSheets() }, 'Upload a sheet…')));
    const attnCard = card('Needs attention', attention.length ? h('ul', { class: 'dz-attn' }, attention) : h('p', { class: 'ok' }, '✓ Nothing waiting.'));
    const complaintsCard = todays.length ? card(`Complaints on this sheet (${todays.length})`, h('ul', { class: 'dz-complaints' }, todays.map(complaintSummary)),
        h('button', { class: 'link', onclick: () => go('complaints', null) }, 'All complaints and patterns ›')) : null;
    const progressCard = card('Progress',
        rs.length ? h('div', null, rs.map((r) => {
          const n = r.summary?.lines || 0; const d = doneBy(r.id);
          return h('div', { class: 'dz-prog' }, h('span', { class: 'dz-prog-name' }, shortRoute(r.route)),
            h('div', { class: 'bar' }, h('i', { style: `width:${n ? Math.round((100 * d) / n) : 0}%` })), h('span', { class: 'dz-prog-n' }, `${d}/${n}${r.closed_at ? ` · closed${r.close_method === 'paper' ? ' (paper)' : ''}` : ''}`));
        }),
        h('p', { class: 'small muted' }, lastTick ? `Last tick ${fmtStamp(lastTick.device_time)} by ${lastTick.user_name || 'someone'}.` : 'No deliveries ticked yet.')) : h('p', { class: 'muted' }, '–'));
    const scoreCard = rs.length ? card('Delivery score (DIFOTIS)', difotis(rs, date)) : null;
    const itemsCard = card('Items to collect', rs.length ? paperSummary(rs) : h('p', { class: 'muted' }, '–'));
    const shiftsCard = card('Shifts', shiftsView(rs));
    const depotCard = card('Depot', D.depot?.lat
      ? h('p', null, `Set${D.depot.updated_by ? ` by ${D.depot.updated_by}` : ''}: ${D.depot.lat.toFixed(5)}, ${D.depot.lng.toFixed(5)} (within ${D.depot.radius_m || 150} m counts as at the depot). `,
        h('a', { href: `https://www.google.com/maps/search/?api=1&query=${D.depot.lat},${D.depot.lng}`, target: '_blank', rel: 'noopener' }, 'Check on the map'))
      : h('p', { class: 'warn' }, 'Not set yet. Phones can’t tell drivers they’re at the depot until it is.'),
      h('button', { class: 'btn', onclick: () => setDepot() }, D.depot?.lat ? 'Change the depot…' : 'Set the depot…'));
    const photosCard = card('Recent photos', D.photos.length ? h('ul', { class: 'dz-attn' }, D.photos.map((ph) => h('li', null, `${fmtStamp(ph.taken_at)} · ${ph.address_key.split('|').slice(1).reverse().join(' ')} · ${ph.user_name || ''}`)))
        : h('p', { class: 'muted' }, 'No delivery photos yet.'));
    // Two columns on a laptop: the day's work on the left, what needs a look on the right (first on a phone).
    return h('div', { class: 'dz-over' },
      h('div', { class: 'dz-col side' }, attnCard, complaintsCard, photosCard, depotCard),
      h('div', { class: 'dz-col main' }, sheetsCard, h('div', { class: 'dz-pair' }, progressCard, itemsCard), shiftsCard, scoreCard));
  }

  // ---- Shifts: each person's morning as one bar, every minute accounted for (decision 0020)
  function shiftsView(rs) {
    const ticks = D.status.filter((x) => x.done && x.method !== 'paper' && x.user_name);
    const owners = runOwners(rs, D.status);
    const people = [...new Set([...D.duty.map((e) => e.user_name), ...ticks.map((x) => x.user_name)].filter(Boolean))].sort();
    if (!people.length) return h('p', { class: 'muted' }, 'Nobody has gone on duty or ticked a stop this day yet.');
    const name = (id) => shortRoute(rs.find((r) => r.id === id)?.route || '') || 'a run';
    const hm = (t) => new Date(t).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
    const rows = people.map((p) => {
      const duty = D.duty.filter((e) => e.user_name === p);
      const x = shiftSegments({ duty, ticks: ticks.filter((k) => k.user_name === p), owners, me: p });
      if (!x.start) return null;
      const span = Math.max(1, x.end - x.start);
      const now = currentDuty(duty);
      const tip = (sg) => `${SEGMENT_LABEL[sg.kind]}${sg.run_id ? ` (${name(sg.run_id)})` : ''}: ${hm(sg.start)}–${hm(sg.end)}, ${clock(sg.end - sg.start)}`;
      const parts = ['depot', 'travel', 'run', 'help', 'between', 'pause', 'wrap'].filter((k) => x.totals[k] >= 60000).map((k) => `${SEGMENT_LABEL[k]} ${clock(x.totals[k])}`);
      return h('div', { class: 'dz-shift' },
        h('div', { class: 'dz-shift-head' }, h('b', null, p),
          ` ${hm(x.start)}–${x.open ? 'now' : hm(x.end)} · ${clock(x.totals.shift)}`,
          x.forgot ? h('span', { class: 'small warn' }, ' · didn’t tap Off duty (ends at the last tick)') : null,
          x.open ? h('span', { class: 'dz-duty-now' }, ` · ${DUTY_LABEL[now.state]}${now.run_id ? `: ${name(now.run_id)}` : ''}`) : null,
          duty.length ? null : h('span', { class: 'small muted' }, ' · didn’t tap On duty (from first to last tick)')),
        h('div', { class: 'dz-shift-bar', role: 'img', 'aria-label': x.segments.map(tip).join('; ') },
          x.segments.map((sg) => h('i', { class: `sg-${sg.kind}`, title: tip(sg), style: `width:${(100 * (sg.end - sg.start)) / span}%` }))),
        h('div', { class: 'small muted' }, parts.join(' · ')),
        Object.keys(x.perRun).length ? h('div', { class: 'small' }, Object.entries(x.perRun).map(([id, d]) => `${name(id)} ${clock(d)}${owners[id] && owners[id] !== p ? ` (helping ${owners[id]})` : ''}`).join(' · ')) : null);
    }).filter(Boolean);
    return h('div', null, rows,
      h('div', { class: 'dz-shift-key small' }, ['depot', 'travel', 'run', 'help', 'between', 'pause', 'wrap'].map((k) => h('span', null, h('i', { class: `sg-${k}` }), SEGMENT_LABEL[k]))),
      h('p', { class: 'small muted' }, 'Driving to a run includes the gap after helping someone, up to your next run’s first tick. Times for each run include getting there.'));
  }

  // ---- Depot: paste a Maps link, or stand there and use this phone's location
  function setDepot() {
    const input = h('input', { type: 'text', placeholder: 'Paste a Google Maps link, or -36.91, 174.93', value: D.depot?.lat ? `${D.depot.lat}, ${D.depot.lng}` : '' });
    const radius = h('select', null, [100, 150, 250, 400].map((m) => h('option', { value: m, selected: (D.depot?.radius_m || 150) === m }, `${m} m`)));
    const msg = h('p', { class: 'small muted' }, 'Short links (goo.gl) can’t be read here: open the link, then copy the long address from the browser and paste that. Or stand at the depot and tap Use my location.');
    const close = openSheet('Where is the depot?',
      h('label', { class: 'field' }, h('span', null, 'Maps link or position'), input),
      h('label', { class: 'field' }, h('span', null, 'Counts as at the depot within'), radius),
      msg,
      h('div', { class: 'dz-actions' },
        h('button', { class: 'btn', onclick: () => navigator.geolocation.getCurrentPosition(
          (x) => { input.value = `${x.coords.latitude.toFixed(6)}, ${x.coords.longitude.toFixed(6)}`; msg.textContent = `Got it (to about ${Math.round(x.coords.accuracy)} m). Tap Save.`; },
          () => { msg.textContent = 'Couldn’t get this phone’s location. Allow location for this site, or paste a link.'; }, { enableHighAccuracy: true, timeout: 15000 }) }, 'Use my location'),
        h('button', { class: 'btn primary', onclick: async () => {
          const p = parseLatLng(input.value);
          if (!p || p.short) { msg.textContent = p?.short ? 'That’s a short link: open it, then paste the long one from the address bar.' : 'That doesn’t look like a Maps link or a position.'; msg.className = 'small bad'; return; }
          try {
            await app.store.setSetting('depot', { ...p, radius_m: Number(radius.value), updated_by: by() }, by());
            close(); toast('Depot saved.'); await refresh();
          } catch (e) { msg.textContent = `Couldn’t save: ${e.message}`; msg.className = 'small bad'; }
        } }, 'Save')));
  }

  // ================= Complaints =================
  const KIND = { MISSED: 'Missed', WET: 'Wet', DAMAGED: 'Damaged', LATE: 'Late', WRONG: 'Wrong paper' };
  const STATUS = [['open', 'Open'], ['disputed', 'Disputed (we delivered)'], ['accepted', 'Accepted (our miss)'], ['closed', 'Closed']];
  const cAddr = (c) => `${c.number} ${titleCase(c.street || '')}`;
  const dayFmt = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : '?');
  const nth = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;
  // Who ticked that delivery, as evidence (or the lack of it).
  function deliveredLine(c) {
    if (!c.happened_on) return 'Date of the problem not given';
    if (c.delivered_by && c.delivered_method === 'paper' && c.delivered) return `Done on the paper sheet by ${c.delivered_by} (closed in Dispatch, no GPS)`;
    if (c.delivered_by && c.delivered_outcome === 'futile') return `Not delivered: ${c.delivered_reason || 'no reason given'} (${c.delivered_by}, ${new Date(c.delivered_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })})`;
    if (c.delivered_by && c.delivered_outcome === 'short') return `Short delivery by ${c.delivered_by}`;
    if (c.delivered_by) return `${c.delivered ? 'Ticked' : 'Unticked'} by ${c.delivered_by} at ${new Date(c.delivered_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })}${c.photos_that_day ? ` · 📷 ${c.photos_that_day}` : ''}`;
    return c.happened_on < '2026-11-09' ? 'Before the app (no tick record)' : 'No tick recorded that day';
  }
  function historyLine(c) {
    return c.customer_complaints > 1 ? `${nth(c.customer_complaint_no)} of ${c.customer_complaints} from this address${c.previous_complaint_on ? ` · previous ${dayFmt(c.previous_complaint_on)}` : ''}` : 'First complaint from this address';
  }
  function complaintSummary(c) {
    return h('li', null, h('b', null, `${cAddr(c)} (${shortRoute(c.route || '')})`), `: ${c.description || KIND[c.kind] || 'Complaint'}`,
      h('div', { class: 'small muted' }, `${deliveredLine(c)} · ${historyLine(c)}${c.status !== 'open' ? ` · ${STATUS.find(([v]) => v === c.status)[1]}` : ''}`));
  }

  function renderComplaints() {
    const R = D.register;
    const CF = (F.c ||= { route: '', status: '', kind: '', q: '', days: '90' });
    const since = CF.days ? new Date(Date.now() - Number(CF.days) * 864e5).toISOString().slice(0, 10) : '';
    const shown = R.filter((c) => (!CF.route || c.route === CF.route) && (!CF.status || c.status === CF.status) && (!CF.kind || c.kind === CF.kind)
      && (!since || (c.happened_on || c.reported_on) >= since)
      && (!CF.q || `${c.number} ${c.street} ${c.notes || ''} ${c.delivered_by || ''}`.toLowerCase().includes(CF.q.toLowerCase())));
    const sel = (key, opts, blank) => { const x = h('select', { onchange: (e) => { CF[key] = e.target.value; render(); } }, h('option', { value: '' }, blank), opts.map(([v, t]) => h('option', { value: v }, t))); x.value = CF[key]; return x; };
    const q = h('input', { type: 'search', placeholder: 'Address, driver or note', value: CF.q });
    q.addEventListener('input', () => { CF.q = q.value; clearTimeout(q.t); q.t = setTimeout(() => { render(); const s2 = body.querySelector('.dz-filters input[type=search]'); s2?.focus(); s2?.setSelectionRange(CF.q.length, CF.q.length); }, 250); });

    // Patterns: counts by kind, run, who ticked, and repeat addresses (within the filters).
    const tally = (f) => Object.entries(shown.reduce((m, c) => { const k = f(c); if (k) m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    const repeat = Object.values(shown.reduce((m, c) => { (m[c.address_key] ||= { c, n: 0, last: '' }).n += 1; const d = c.happened_on || c.reported_on; if (d > m[c.address_key].last) m[c.address_key].last = d; return m; }, {}))
      .filter((x) => x.n > 1).sort((a, b) => b.n - a.n);
    const pat = (title, rows, fmt = (k) => k) => h('div', { class: 'dz-card' }, h('h2', null, title),
      rows.length ? h('table', { class: 'dz-table' }, h('tbody', null, rows.slice(0, 8).map(([k, n]) => h('tr', null, h('td', null, fmt(k)), h('td', { class: 'num' }, n))))) : h('p', { class: 'small muted' }, 'None.'));

    const statusSel = (c) => { const x = h('select', { onchange: (e) => act(async () => must(await sb.from('complaints').update({ status: e.target.value, updated_at: now(), updated_by: by() }).eq('id', c.id)), 'Saved.') }, STATUS.map(([v, t]) => h('option', { value: v }, t))); x.value = c.status; return x; };
    const noteBtn = (c) => h('button', { class: 'btn small', onclick: () => { const n = prompt(`Notes for ${cAddr(c)}, ${dayFmt(c.happened_on)}`, c.notes || ''); if (n !== null) act(async () => must(await sb.from('complaints').update({ notes: n || null, updated_at: now(), updated_by: by() }).eq('id', c.id)), 'Saved.'); } }, c.notes ? '✎ Edit note' : '+ Note');

    return h('div', null,
      h('p', { class: 'small muted' }, 'Every complaint from the RouteSmart key reports, kept once, with who ticked that delivery and the address\'s complaint history. Mark each as disputed (we delivered: the tick, GPS and photo back it up), accepted, or closed.'),
      h('div', { class: 'dz-filters' },
        sel('days', [['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year']], 'All time'),
        sel('route', [...new Set(R.map((c) => c.route).filter(Boolean))].sort().map((r) => [r, shortRoute(r)]), 'All runs'),
        sel('kind', [...new Set(R.map((c) => c.kind).filter(Boolean))].map((k) => [k, KIND[k] || k]), 'All kinds'),
        sel('status', STATUS, 'Any status'), q),
      h('div', { class: 'dz-grid dz-patterns' },
        pat(`Complaints (${shown.length})`, tally((c) => KIND[c.kind] || c.kind || 'Other')),
        pat('By run', tally((c) => c.route), shortRoute),
        pat('By who ticked it', tally((c) => (c.happened_on ? (c.delivered_by || (c.happened_on < '2026-11-09' ? 'Before the app' : 'No tick recorded')) : null))),
        h('div', { class: 'dz-card' }, h('h2', null, 'Repeat addresses'), repeat.length
          ? h('table', { class: 'dz-table' }, h('tbody', null, repeat.slice(0, 8).map((x) => h('tr', null, h('td', null, cAddr(x.c)), h('td', { class: 'num' }, x.n), h('td', { class: 'small muted' }, `last ${dayFmt(x.last)}`)))))
          : h('p', { class: 'small muted' }, 'No address has complained more than once.'))),
      shown.length ? h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' },
        h('thead', null, h('tr', null, ['On sheet', 'About', 'Address', 'Run', 'What', 'Delivery record', 'Customer history', 'Status', 'Notes'].map((t) => h('th', null, t)))),
        h('tbody', null, shown.map((c) => h('tr', { class: c.status === 'open' ? '' : 'muted-row' },
          h('td', null, dayFmt(c.reported_on)),
          h('td', null, dayFmt(c.happened_on)),
          h('td', null, h('b', null, cAddr(c))),
          h('td', null, shortRoute(c.route || '')),
          h('td', null, `${KIND[c.kind] || c.kind || '?'} · ${c.publication || ''}${c.service ? ` · ${c.service.replace(/^WKLY(\d)$/, '$1-day')}` : ''}`),
          h('td', null, deliveredLine(c)),
          h('td', { class: c.customer_complaints > 1 ? 'warn' : '' }, historyLine(c)),
          h('td', null, statusSel(c)),
          h('td', null, c.notes ? h('span', { class: 'small' }, c.notes, ' ') : null, noteBtn(c)))))))
        : h('p', { class: 'muted' }, 'No complaints match.'));
  }

  // ================= Runs & sheets =================
  // ================= Closing a run (docs/business-rules.md#closing-a-run) =================
  const runStatus = (r) => h('div', { class: 'dz-runstatus' },
    r.closed_at
      ? h('span', { class: 'ok' }, `✓ Closed (${r.close_method === 'paper' ? 'paper' : 'app'})${r.driver ? ` · ${r.driver}` : ''} · ${fmtStamp(r.closed_at)}`)
      : runComplete(r) ? h('span', { class: 'ok' }, `✓ Completed (app)${r.tickedBy ? ` · ${r.tickedBy}` : ''}${r.lastTick ? ` · ${fmtStamp(r.lastTick)}` : ''}`)
      : h('span', null, `Open${r.done ? ` · ${r.done}/${r.summary?.lines ?? '?'} done` : ''}${r.driver ? ` · ${r.driver}` : ''}`),
    r.close_note ? h('div', { class: 'small muted' }, r.close_note) : null,
    h('button', { class: 'btn small', onclick: () => (r.closed_at ? reopenRun(r) : closeRun(r)) }, r.closed_at ? 'Reopen…' : runComplete(r) ? 'Set driver…' : 'Close run…'));

  // Default finish time: 7am on the delivery day (runs are done early), or now if that is still ahead.
  const defaultFinish = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    const seven = new Date(`${date}T07:00`); const now = new Date();
    const d = seven > now ? now : seven;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  async function closeRun(r) {
    let lines; let st;
    try {
      [lines, st] = await Promise.all([
        sb.from('run_lines').select('line_key, address_key').eq('run_id', r.id).then(must),
        sb.from('line_status').select('line_key, done, outcome').eq('run_id', r.id).then(must)]);
    } catch (e) { toast(`Couldn't load the run: ${e.message}`); return; }
    const done = new Set(st.filter((x) => x.done).map((x) => x.line_key));
    const todo = lines.filter((l) => !done.has(l.line_key));
    const futile = st.filter((x) => x.outcome === 'futile').length;
    const names = D.members.filter((m) => m.active !== false).map((m) => m.display_name);
    const OTHER = '__other';
    const who = h('select', { 'aria-label': 'Driver' }, h('option', { value: '' }, 'Choose…'),
      ...names.map((n) => h('option', { value: n, selected: n === r.driver }, n)), h('option', { value: OTHER }, 'Someone else…'));
    const other = h('input', { type: 'text', placeholder: 'Their name', hidden: true });
    if (r.driver && !names.includes(r.driver)) { who.value = OTHER; other.hidden = false; other.value = r.driver; }
    who.onchange = () => { other.hidden = who.value !== OTHER; if (!other.hidden) other.focus(); };
    const when = h('input', { type: 'datetime-local', value: defaultFinish(r.delivery_date), 'aria-label': 'Finished at' });
    const paper = h('input', { type: 'radio', name: 'cm', value: 'paper', checked: todo.length > 0 });
    const inApp = h('input', { type: 'radio', name: 'cm', value: 'app', checked: todo.length === 0 });
    const note = h('input', { type: 'text', placeholder: 'Note (optional), e.g. "Lisa used the paper sheet; 2 papers short"' });
    const err = h('p', { class: 'bad small', hidden: true });
    openSheet(`Close ${shortRoute(r.route)} · ${fmtDate(r.delivery_date, true)}`,
      h('p', { class: 'small muted' }, `${lines.length - todo.length} of ${lines.length} stops ticked in the app${futile ? ` (${futile} not delivered)` : ''}.`),
      h('label', { class: 'dz-field' }, h('span', null, 'Driver'), who, other),
      h('label', { class: 'dz-field' }, h('span', null, 'Finished at'), when),
      h('div', { class: 'dz-field' }, h('span', null, 'How was it done?'),
        h('label', { class: 'dz-radio' }, paper, ` On the paper sheet: tick the ${todo.length} stop${todo.length === 1 ? '' : 's'} not ticked in the app as delivered by the driver`),
        h('label', { class: 'dz-radio' }, inApp, ' In the app: close it as it is', todo.length ? ` (${todo.length} stop${todo.length === 1 ? '' : 's'} stay unticked)` : '')),
      h('label', { class: 'dz-field' }, h('span', null, 'Note'), note),
      err,
      (close) => h('div', { class: 'dz-actions' },
        h('button', { class: 'btn primary', onclick: async (e) => {
          const driver = (who.value === OTHER ? other.value : who.value).trim();
          const at = when.value ? new Date(when.value) : null;
          const method = paper.checked ? 'paper' : 'app';
          if (!driver) { err.hidden = false; err.textContent = 'Choose who did the run.'; return; }
          if (!at || Number.isNaN(at.getTime())) { err.hidden = false; err.textContent = 'Enter when the run finished.'; return; }
          e.target.disabled = true;
          try {
            if (method === 'paper' && todo.length) {
              must(await sb.from('tap_events').insert(todo.map((l) => ({
                id: crypto.randomUUID(), run_id: r.id, line_key: l.line_key, address_key: l.address_key, route: r.route,
                done: true, outcome: 'delivered', method: 'paper', user_name: driver, device_time: at.toISOString(),
                device: `Dispatch: paper run sheet (entered by ${by()})`,
              }))));
            }
            must(await sb.from('runs').update({ driver, closed_at: at.toISOString(), closed_by: by(), close_method: method, close_note: note.value.trim() || null }).eq('id', r.id));
            close();
            toast(`${shortRoute(r.route)} closed${method === 'paper' ? `: ${todo.length} stop${todo.length === 1 ? '' : 's'} ticked from the paper sheet` : ''}.`);
            refresh();
          } catch (x) { e.target.disabled = false; err.hidden = false; err.textContent = `Not saved: ${x.message}`; }
        } }, 'Close run'),
        h('button', { class: 'btn', onclick: close }, 'Cancel')));
  }

  async function reopenRun(r) {
    let st;
    try { st = must(await sb.from('line_status').select('line_key, done, method').eq('run_id', r.id)); } catch (e) { toast(e.message); return; }
    const paperTicks = st.filter((x) => x.done && x.method === 'paper');
    if (!confirm(`Reopen ${shortRoute(r.route)}?${paperTicks.length ? `\n\nThe ${paperTicks.length} stop${paperTicks.length === 1 ? '' : 's'} ticked from the paper sheet will be unticked (the history keeps both).` : ''}\nTicks made in the app stay.`)) return;
    try {
      const { data: lines } = await sb.from('run_lines').select('line_key, address_key').eq('run_id', r.id);
      const addr = Object.fromEntries((lines || []).map((l) => [l.line_key, l.address_key]));
      if (paperTicks.length) {
        must(await sb.from('tap_events').insert(paperTicks.map((x) => ({
          id: crypto.randomUUID(), run_id: r.id, line_key: x.line_key, address_key: addr[x.line_key] || x.line_key, route: r.route,
          done: false, outcome: 'undone', method: 'paper', user_name: by(), device_time: new Date().toISOString(), device: 'Dispatch: run reopened',
        }))));
      }
      must(await sb.from('runs').update({ closed_at: null, closed_by: null, close_method: null, close_note: null }).eq('id', r.id));
      toast(`${shortRoute(r.route)} reopened.`);
      refresh();
    } catch (x) { toast(`Not reopened: ${x.message}`); }
  }

  function renderRuns() {
    const hist = F.runsTab === 'history';
    const shown = D.runs.filter((r) => runComplete(r) === hist);
    const dates = [...new Set(shown.map((r) => r.delivery_date))];
    const nHist = D.runs.filter(runComplete).length;
    return h('div', null,
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Which runs', style: 'max-width:420px;margin-bottom:12px' },
        h('button', { 'aria-pressed': String(!hist), onclick: () => { F.runsTab = 'active'; render(); } }, `Active (${D.runs.length - nHist})`),
        h('button', { 'aria-pressed': String(hist), onclick: () => { F.runsTab = 'history'; render(); } }, `History (${nHist})`)),
      h('p', { class: 'small muted' }, hist ? 'Finished runs: every stop dealt with in the app, or closed here. Reopen one to bring it back.' : 'Runs still to do or not yet closed, including earlier days. Close a run done on the paper sheet to move it to History.'),
      h('div', { class: 'dz-actions' },
        h('button', { class: 'btn primary', onclick: () => openRefetch() }, 'Get Runs from RouteSmart…'),
        h('button', { class: 'btn', onclick: () => pickSheets() }, 'Upload a sheet…')),
      dates.length ? dates.map((date) => {
        const rs = shown.filter((r) => r.delivery_date === date).sort((a, b) => a.route.localeCompare(b.route));
        return h('section', { class: 'dz-card' }, h('h2', null, fmtDate(date, true)),
          h('div', { class: 'dz-scroll' }, h('table', { class: 'dz-table' },
            h('thead', null, h('tr', null, h('th', null, 'Run'), h('th', null, 'Stops'), h('th', null, 'Items'), h('th', null, 'Totals'), h('th', null, 'Notes'), h('th', null, 'Loaded'), h('th', null, 'What changed'), h('th', null, 'Status'))),
            h('tbody', null, rs.map((r) => h('tr', null,
              h('td', null, h('a', { href: `#/r/${r.id}` }, shortRoute(r.route))),
              h('td', null, r.summary?.lines ?? '?'),
              h('td', null, r.summary?.copies ?? '?'),
              h('td', null, (r.checks || []).every((c) => c.ok) ? h('span', { class: 'ok' }, '✓ match') : h('span', { class: 'bad' }, (r.checks || []).filter((c) => !c.ok).map((c) => `✗ ${c.label}`).join(', '))),
              h('td', null, (r.warnings || []).length ? h('details', null, h('summary', null, `${r.warnings.length} note${r.warnings.length === 1 ? '' : 's'}`), h('ul', null, r.warnings.map((w) => h('li', null, w)))) : '–'),
              h('td', null, `${fmtStamp(r.updated_at || r.created_at)} · ${r.source === 'auto' ? 'RouteSmart' : 'upload'}`),
              h('td', null, !r.last_changes ? '–' : !r.last_changes.count ? 'No changes'
                : h('details', null, h('summary', null, `${r.last_changes.count} changed`), h('ul', null, r.last_changes.items.map((x) => h('li', null, x))))),
              h('td', null, runStatus(r))))))));
      }) : h('p', { class: 'muted' }, hist ? 'No finished runs yet.' : D.runs.length ? '✓ Nothing active: every run is finished or closed.' : 'No sheets loaded yet.'));
  }

  // ================= History =================
  function renderHistory() {
    const what = (x) => {
      const d = x.data || {};
      if (x.entity === 'addresses') return `${d.number || ''} ${titleCase(d.street || '')}: ${d.operating_location_id ? `→ ${opById(d.operating_location_id)?.name || 'a location'}${d.service_location_id ? ` / ${svcById(d.service_location_id)?.name || ''}` : ''}` : 'unassigned'}${d.validated_at ? ' ✓' : ''}`;
      if (x.entity === 'members') return `${d.display_name || x.entity_id}: ${d.role === 'dispatcher' ? 'App + Dispatch' : 'App only'}${d.active === false ? ' (switched off)' : ''}`;
      if (x.entity === 'login') return `${x.entity_id}: ${x.action}`;
      if (x.entity === 'location_policies') return policyText(d);
      return d.name || x.entity_id;
    };
    const ENT = { addresses: 'Address', members: 'Person', login: 'Login', location_groups: 'Group', operating_locations: 'Operating location', service_locations: 'Service location', location_policies: 'Policy' };
    return D.history.length ? h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' },
      h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Who'), h('th', null, 'What'), h('th', null, ''), h('th', null, 'Details'))),
      h('tbody', null, D.history.map((x) => h('tr', null,
        h('td', null, fmtStamp(x.at)), h('td', null, (x.by_email || 'system').split('@')[0]), h('td', null, ENT[x.entity] || x.entity),
        h('td', null, x.action), h('td', null, what(x)))))))
      : h('p', { class: 'muted' }, 'No changes recorded yet.');
  }

  // ================= Addresses =================
  function renderAddresses() {
    const routes = [...new Set(D.addresses.flatMap((a) => a.routes))].sort();
    const statusOf = (a) => (!a.operating_location_id ? 'unassigned' : a.validated_at ? 'validated' : 'assigned');
    const shown = D.addresses.filter((a) => (!F.route || a.routes.includes(F.route))
      && (F.status === 'all' || statusOf(a) === F.status || (F.status === 'nogps' && a.gps_lat == null))
      && (!F.q || `${a.number} ${a.street} ${a.notes || ''} ${a.operating_name || ''} ${a.service_name || ''}`.toLowerCase().includes(F.q.toLowerCase())));
    const count = (st) => D.addresses.filter((a) => statusOf(a) === st).length;

    const routeSel = h('select', { onchange: (e) => { F.route = e.target.value; render(); } }, h('option', { value: '' }, 'All runs'), routes.map((r) => h('option', { value: r }, shortRoute(r))));
    routeSel.value = F.route;
    const statusSel = h('select', { onchange: (e) => { F.status = e.target.value; render(); } },
      [['all', 'All'], ['unassigned', 'Not assigned'], ['assigned', 'Assigned, not validated'], ['validated', 'Validated'], ['nogps', 'No GPS yet']].map(([v, t]) => h('option', { value: v }, t)));
    statusSel.value = F.status;
    const search = h('input', { type: 'search', placeholder: 'Find address, note or location', value: F.q });
    search.addEventListener('input', () => { F.q = search.value; clearTimeout(search.t); search.t = setTimeout(() => { render(); const s2 = body.querySelector('input[type=search]'); s2?.focus(); s2?.setSelectionRange(F.q.length, F.q.length); }, 250); });

    // bulk assignment
    const opSel = h('select', null, h('option', { value: '' }, 'Choose operating location…'), D.ops.map((o) => h('option', { value: o.id }, opLabel(o))));
    const svcSel = h('select', null, h('option', { value: '' }, '(no service location)'));
    opSel.addEventListener('change', () => svcSel.replaceChildren(h('option', { value: '' }, '(no service location)'),
      ...D.svcs.filter((s) => s.operating_location_id === opSel.value).map((s) => h('option', { value: s.id }, s.name))));
    const keys = () => [...sel];
    // Confirm, remember what was there, change, then offer Undo.
    const bulkChange = (question, patch, ok, filter = () => true) => {
      const rows = D.addresses.filter((a) => sel.has(a.address_key) && filter(a));
      if (!rows.length) return toast('Nothing to change.');
      if (!confirm(`${question}\n\n${rows.slice(0, 12).map(addrLabel).join('\n')}${rows.length > 12 ? `\n…and ${rows.length - 12} more` : ''}`)) return;
      const before = rows.map((a) => ({ key: a.address_key, v: { operating_location_id: a.operating_location_id, service_location_id: a.service_location_id, validated_at: a.validated_at, validated_by: a.validated_by } }));
      bulkAct(async () => must(await sb.from('addresses').update({ ...patch, updated_at: now(), updated_by: by() }).in('address_key', rows.map((a) => a.address_key))), null)
        .then(() => toast(`${ok} (${rows.length})`, { label: 'Undo', fn: () => act(async () => { for (const b of before) must(await sb.from('addresses').update({ ...b.v, updated_at: now(), updated_by: by() }).eq('address_key', b.key)); }, 'Undone.') }));
    };
    const bulk = h('div', { class: 'dz-bulk', hidden: !sel.size },
      h('b', null, `${sel.size} selected`),
      [...sel].some((k) => !shown.some((a) => a.address_key === k)) ? h('span', { class: 'bad small' }, `(${[...sel].filter((k) => !shown.some((a) => a.address_key === k)).length} not shown by the filters)`) : null,
      opSel, svcSel,
      h('button', { class: 'btn small primary', onclick: () => {
        if (!opSel.value) return toast('Choose an operating location.');
        const o = opById(opSel.value); const sv = svcById(svcSel.value);
        bulkChange(`Assign ${sel.size} address${sel.size === 1 ? '' : 'es'} to ${o.name}${sv ? ` / ${sv.name}` : ''}?`, { operating_location_id: opSel.value, service_location_id: svcSel.value || null, validated_at: null, validated_by: null }, `Assigned to ${o.name}.`);
      } }, 'Assign'),
      h('button', { class: 'btn small', onclick: () => bulkChange('Mark these as checked on the ground?', { validated_at: now(), validated_by: by() }, 'Marked validated.', (a) => !!a.operating_location_id) }, 'Mark validated'),
      h('button', { class: 'btn small', onclick: () => bulkChange('Unassign these addresses?', { operating_location_id: null, service_location_id: null, validated_at: null, validated_by: null }, 'Unassigned.') }, 'Unassign'),
      h('button', { class: 'link small', onclick: () => { sel.clear(); render(); } }, 'Clear'));

    const allBox = h('input', { type: 'checkbox', checked: shown.length > 0 && shown.every((a) => sel.has(a.address_key)), title: 'Select all shown',
      onchange: (e) => { shown.forEach((a) => (e.target.checked ? sel.add(a.address_key) : sel.delete(a.address_key))); render(); } });
    const rows = shown.slice(0, 600).map((a) => h('tr', { class: current?.id === a.address_key ? 'on' : '' },
      h('td', null, h('input', { type: 'checkbox', checked: sel.has(a.address_key), onchange: (e) => { if (e.target.checked) sel.add(a.address_key); else sel.delete(a.address_key); render(); } })),
      h('td', null, h('button', { class: 'link', onclick: () => { current = { type: 'address', id: a.address_key }; render(); } }, addrLabel(a))),
      h('td', null, a.routes.map(shortRoute).join(', ')),
      h('td', null, a.gps_lat != null ? `${a.gps_taps} tap${a.gps_taps === 1 ? '' : 's'}` : h('span', { class: 'muted' }, '–')),
      h('td', null, a.operating_name || h('span', { class: 'muted' }, '–')),
      h('td', null, a.service_name || h('span', { class: 'muted' }, '–')),
      h('td', null, a.validated_at ? h('span', { class: 'ok' }, '✓') : '')));

    return h('div', { class: 'dz-split' },
      h('section', { class: 'dz-main' },
        h('div', { class: 'dz-stats' },
          h('span', null, h('b', null, D.addresses.length), ' addresses'),
          h('span', null, h('b', null, count('unassigned')), ' not assigned'),
          h('span', null, h('b', null, count('assigned')), ' to validate'),
          h('span', null, h('b', null, count('validated')), ' validated'),
          h('span', null, h('b', null, D.addresses.filter((a) => a.gps_lat != null).length), ' with GPS')),
        h('div', { class: 'dz-filters' }, routeSel, statusSel, search),
        bulk,
        addressMap(shown),
        h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' },
          h('thead', null, h('tr', null, h('th', null, allBox), h('th', null, 'Address'), h('th', null, 'Runs'), h('th', null, 'GPS'), h('th', null, 'Operating location'), h('th', null, 'Service location'), h('th', null, 'OK'))),
          h('tbody', null, rows))),
        shown.length > 600 ? h('p', { class: 'small muted' }, `Showing 600 of ${shown.length}. Narrow it with the filters.`) : null,
        !D.addresses.length ? h('p', { class: 'muted' }, 'No addresses yet. They are added automatically each time a run sheet loads.') : null),
      h('aside', { class: 'dz-side' }, current?.type === 'address' ? addressPanel(D.addresses.find((a) => a.address_key === current.id)) : h('p', { class: 'muted' }, 'Tick addresses to assign them to an operating location in bulk, or click one to see it on the map.')));
  }

  // Map of the shown addresses that have delivery GPS: click a dot to tick it for bulk assigning.
  function addressMap(shown) {
    const pts = shown.filter((a) => a.gps_lat != null);
    if (!pts.length) return h('p', { class: 'small muted' }, 'Map: no GPS for these addresses yet. Dots appear once deliveries are ticked.');
    const el = h('div', { class: 'dz-map dz-map-wide' });
    const det = h('details', { class: 'dz-mapcard', open: F.mapOpen ? true : null, ontoggle: () => { F.mapOpen = det.open; if (det.open) draw(); } },
      h('summary', null, `Map (${pts.length} with GPS) · click a dot to tick it`), el);
    const draw = () => map(el, { points: pts.map((a) => ({ lat: a.gps_lat, lng: a.gps_lng, label: `${addrLabel(a)}${a.operating_name ? ` · ${a.operating_name}` : ''}`,
      color: sel.has(a.address_key) ? '#c4b5fd' : a.operating_location_id ? '#15803d' : '#f59e0b', big: sel.has(a.address_key),
      onClick: () => { if (sel.has(a.address_key)) sel.delete(a.address_key); else sel.add(a.address_key); render(); } })) });
    if (F.mapOpen) setTimeout(draw, 0);
    return det;
  }

  function addressPanel(a) {
    if (!a) return h('p', { class: 'muted' }, 'Not found.');
    const op = opById(a.operating_location_id), svc = svcById(a.service_location_id);
    const mapEl = h('div', { class: 'dz-map' });
    const pts = [];
    if (a.gps_lat != null) pts.push({ lat: a.gps_lat, lng: a.gps_lng, label: `${addrLabel(a)}: delivered here (${a.gps_taps} taps, ±${Math.round(a.gps_accuracy_m)} m)`, color: '#15803d', big: true });
    if (op?.lat != null) pts.push({ lat: op.lat, lng: op.lng, label: `Stop: ${op.name}`, color: '#2563eb', big: true });
    if (svc?.lat != null) pts.push({ lat: svc.lat, lng: svc.lng, label: `Service: ${svc.name}`, color: '#c2410c' });
    setTimeout(() => map(mapEl, { points: pts }), 0);
    const notes = h('textarea', { rows: 2, placeholder: 'Notes for this address' }, a.notes || '');
    const pol = policiesFor({ address: a });
    return h('div', null,
      h('h2', null, addrLabel(a)),
      h('div', { class: 'small muted' }, `${a.routes.map(shortRoute).join(', ')} · seen ${a.first_seen} to ${a.last_seen}`),
      mapEl,
      h('div', { class: 'small muted' }, pts.length ? 'Green: where it was actually delivered (from taps). Blue: the stop. Orange: the service location.' : 'No GPS yet: it appears after the first deliveries are ticked.'),
      h('dl', { class: 'dz-dl' },
        h('dt', null, 'Operating location'), h('dd', null, op ? h('button', { class: 'link', onclick: () => go('locations', { type: 'op', id: op.id }) }, opLabel(op)) : 'Not assigned'),
        h('dt', null, 'Service location'), h('dd', null, svc ? `${svc.name} (${svc.kind})` : '–'),
        h('dt', null, 'Validated'), h('dd', null, a.validated_at ? `✓ ${a.validated_by}, ${new Date(a.validated_at).toLocaleDateString('en-NZ')}` : op
          ? h('button', { class: 'btn small', onclick: () => act(async () => must(await sb.from('addresses').update({ validated_at: now(), validated_by: by(), updated_at: now(), updated_by: by() }).eq('address_key', a.address_key)), 'Validated.') }, 'Mark validated') : '–')),
      h('label', { class: 'field' }, h('span', null, 'Notes'), notes),
      h('button', { class: 'btn small', onclick: () => act(async () => must(await sb.from('addresses').update({ notes: notes.value || null, updated_at: now(), updated_by: by() }).eq('address_key', a.address_key)), 'Saved.') }, 'Save notes'),
      h('h3', null, 'Policies that apply'),
      pol.length ? h('ul', { class: 'dz-pol' }, pol.map((p) => h('li', null, policyText(p), h('span', { class: 'muted' }, ` · from ${policyTarget(p)}`)))) : h('p', { class: 'small muted' }, 'None.'),
      policyForm({ address_key: a.address_key }));
  }

  // ================= Locations =================
  function renderLocations() {
    const tree = h('div', { class: 'dz-tree' });
    const item = (type, x, label, sub, depth) => h('button', { class: `dz-node d${depth} ${current?.type === type && current.id === x.id ? 'on' : ''}`, onclick: () => { current = { type, id: x.id }; render(); } }, label, sub ? h('span', { class: 'muted small' }, ` ${sub}`) : null);
    const nAddr = (f) => D.addresses.filter(f).length;
    const groupBlock = (g, depth) => [
      item('group', g, g.name, g.kind, depth),
      D.groups.filter((c) => c.parent_id === g.id).map((c) => groupBlock(c, depth + 1)),
      D.ops.filter((o) => o.group_id === g.id).map((o) => opBlock(o, depth + 1)),
    ];
    const opBlock = (o, depth) => [
      item('op', o, `🅿 ${o.seq != null ? `${o.seq}. ` : ''}${o.name}`, `${nAddr((a) => a.operating_location_id === o.id)} addr${o.lat == null ? ' · no GPS' : ''}`, depth),
      D.svcs.filter((s) => s.operating_location_id === o.id).map((s) => item('svc', s, `${s.validated_at ? '✓' : '○'} ${s.name}`, `${s.kind} · ${nAddr((a) => a.service_location_id === s.id)} addr`, depth + 1)),
    ];
    tree.append(...[
      D.groups.filter((g) => !g.parent_id || !D.groups.some((p) => p.id === g.parent_id)).map((g) => groupBlock(g, 0)),
      D.ops.some((o) => !o.group_id) ? [h('div', { class: 'dz-node-head muted small' }, 'Not in a group'), D.ops.filter((o) => !o.group_id).map((o) => opBlock(o, 0))] : null,
    ].flat(Infinity).filter(Boolean));
    const add = (type) => { current = { type, id: null, parent: current }; render(); };
    return h('div', { class: 'dz-split' },
      h('section', { class: 'dz-main dz-narrow' },
        h('div', { class: 'dz-actions' },
          h('button', { class: 'btn small', onclick: () => add('group') }, '+ Group'),
          h('button', { class: 'btn small', onclick: () => add('op') }, '+ Operating location'),
          h('button', { class: 'btn small', onclick: () => add('svc') }, '+ Service location')),
        D.groups.length || D.ops.length ? tree : h('p', { class: 'muted' }, 'Nothing yet. Start with a group (e.g. Bruce McLaren Village), then its operating locations (where the vehicle stops), then service locations (Bank 1, Bank 2, Reception).')),
      h('aside', { class: 'dz-side dz-wide' }, current && ['group', 'op', 'svc'].includes(current.type) ? locationEditor(current) : h('p', { class: 'muted' }, 'Choose a location on the left, or add one.')));
  }

  function locationEditor(cur) {
    const table = { group: 'location_groups', op: 'operating_locations', svc: 'service_locations' }[cur.type];
    const list = { group: D.groups, op: D.ops, svc: D.svcs }[cur.type];
    const x = cur.id ? list.find((r) => r.id === cur.id) : {};
    if (cur.id && !x) return h('p', { class: 'muted' }, 'Not found.');
    const parentHint = cur.parent;
    const f = {};
    const field = (label, el) => h('label', { class: 'field' }, h('span', null, label), el);
    const sel = (opts, value, blank) => { const s = h('select', null, blank ? h('option', { value: '' }, blank) : null, opts.map(([v, t]) => h('option', { value: v }, t))); s.value = value ?? ''; return s; };
    f.name = h('input', { value: x.name || '', required: true });
    f.notes = h('textarea', { rows: 2 }, x.notes || '');
    const parts = [field('Name', f.name)];
    if (cur.type === 'group') {
      f.kind = sel(GROUP_KINDS.map((k) => [k, k]), x.kind || 'area');
      f.parent = sel(D.groups.filter((g) => g.id !== x.id).map((g) => [g.id, g.name]), x.parent_id, '(top level)');
      f.route = sel([...new Set(D.addresses.flatMap((a) => a.routes))].sort().map((r) => [r, shortRoute(r)]), x.route, '(any run)');
      parts.push(field('Kind', f.kind), field('Inside group', f.parent), field('Run', f.route));
    } else if (cur.type === 'op') {
      f.group = sel(D.groups.map((g) => [g.id, g.name]), x.group_id ?? (parentHint?.type === 'group' ? parentHint.id : ''), '(no group)');
      f.seq = h('input', { type: 'number', min: 0, value: x.seq ?? '', placeholder: 'Order along the run' });
      f.route = sel([...new Set(D.addresses.flatMap((a) => a.routes))].sort().map((r) => [r, shortRoute(r)]), x.route, '(any run)');
      parts.push(field('Group', f.group), field('Run', f.route), field('Stop number', f.seq));
    } else {
      f.op = sel(D.ops.map((o) => [o.id, opLabel(o)]), x.operating_location_id ?? (parentHint?.type === 'op' ? parentHint.id : parentHint?.type === 'svc' ? svcById(parentHint.id)?.operating_location_id : ''), 'Choose…');
      f.kind = sel(SERVICE_KINDS.map((k) => [k, k]), x.kind || 'letterbox');
      f.seq = h('input', { type: 'number', min: 0, value: x.seq ?? '', placeholder: 'Order at the stop' });
      parts.push(field('Operating location', f.op), field('Kind', f.kind), field('Order', f.seq));
    }
    parts.push(field('Notes', f.notes));

    // GPS for stops and service locations: click the map, or use where deliveries were made.
    let gps = x.lat != null ? { lat: x.lat, lng: x.lng } : null;
    const assigned = !x.id ? [] : cur.type === 'op' ? D.addresses.filter((a) => a.operating_location_id === x.id)
      : cur.type === 'svc' ? D.addresses.filter((a) => a.service_location_id === x.id) : [];
    const gpsText = h('span', { class: 'small' });
    const showGps = () => { gpsText.textContent = gps ? `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}` : 'Not set: click the map'; };
    showGps();
    let mapApi = null;
    const points = () => [
      ...assigned.filter((a) => a.gps_lat != null).map((a) => ({ lat: a.gps_lat, lng: a.gps_lng, label: addrLabel(a), color: '#15803d' })),
      ...(gps ? [{ lat: gps.lat, lng: gps.lng, label: cur.type === 'op' ? 'Vehicle stops here' : 'Service location', color: cur.type === 'op' ? '#2563eb' : '#c2410c', big: true }] : []),
      ...policiesFor(cur.type === 'op' ? { op: x.id ? x : null, group: x.group_id } : { svc: x.id ? x : null })
        .filter((p) => p.kind === 'entry_point' && p.lat != null).map((p) => ({ lat: p.lat, lng: p.lng, label: `Entry: ${p.note || ''}`, color: '#7c3aed' })),
    ];
    const mapEl = cur.type !== 'group' ? h('div', { class: 'dz-map' }) : null;
    if (mapEl) setTimeout(async () => { mapApi = await map(mapEl, { points: points(), pick: (lat, lng) => { gps = { lat, lng }; showGps(); mapApi?.draw(points()); } }); }, 0);
    const avg = avgGps(assigned);

    const saveBtn = h('button', { class: 'btn primary', onclick: () => act(async () => {
      if (!f.name.value.trim()) throw new Error('Give it a name');
      let row = { name: f.name.value.trim(), notes: f.notes.value || null };
      if (cur.type === 'group') row = { ...row, kind: f.kind.value, parent_id: f.parent.value || null, route: f.route.value || null };
      if (cur.type === 'op') row = { ...row, group_id: f.group.value || null, route: f.route.value || null, seq: f.seq.value === '' ? null : Number(f.seq.value), lat: gps?.lat ?? null, lng: gps?.lng ?? null };
      if (cur.type === 'svc') {
        if (!f.op.value) throw new Error('Choose its operating location');
        row = { ...row, operating_location_id: f.op.value, kind: f.kind.value, seq: f.seq.value === '' ? null : Number(f.seq.value), lat: gps?.lat ?? null, lng: gps?.lng ?? null };
      }
      const saved = await save(table, row, x.id);
      current = { type: cur.type, id: saved.id };
    }, 'Saved.') }, x.id ? 'Save' : 'Create');

    const del = x.id ? h('button', { class: 'btn small danger', onclick: () => {
      const what = cur.type === 'svc' ? 'This service location' : cur.type === 'op' ? 'This operating location and its service locations' : 'This group';
      if (!confirm(`${what} will be deleted. Addresses assigned to it become unassigned. Continue?`)) return;
      act(async () => { must(await sb.from(table).delete().eq('id', x.id)); current = null; }, 'Deleted.');
    } }, 'Delete') : null;

    const validate = cur.type === 'svc' && x.id ? h('div', { class: 'dz-validate' },
      x.validated_at ? h('span', { class: 'ok' }, `✓ Validated by ${x.validated_by}, ${new Date(x.validated_at).toLocaleDateString('en-NZ')}`) : h('span', { class: 'muted' }, 'Not validated on the ground yet.'),
      h('button', { class: 'btn small', onclick: () => act(async () => must(await sb.from('service_locations').update(x.validated_at ? { validated_at: null, validated_by: null } : { validated_at: now(), validated_by: by() }).eq('id', x.id)), x.validated_at ? 'Validation removed.' : 'Validated.') }, x.validated_at ? 'Remove validation' : 'Mark validated')) : null;

    const scope = cur.type === 'group' ? { group_id: x.id } : cur.type === 'op' ? { operating_location_id: x.id } : { service_location_id: x.id };
    const own = x.id ? D.policies.filter((p) => (cur.type === 'group' ? p.group_id : cur.type === 'op' ? p.operating_location_id : p.service_location_id) === x.id) : [];
    const inherited = x.id && cur.type !== 'group' ? policiesFor(cur.type === 'op' ? { group: x.group_id } : { op: opById(x.operating_location_id) }) : [];

    return h('div', null,
      h('h2', null, x.id ? x.name : `New ${({ group: 'group', op: 'operating location', svc: 'service location' })[cur.type]}`),
      h('p', { class: 'small muted' }, ({ group: 'A village, building, street or area. Policies set here apply to everything inside it.', op: 'Where the vehicle stops. Navigation goes from stop to stop.', svc: 'Where the driver does the work from the stop: a letterbox, a mailbox bank, reception.' })[cur.type]),
      ...parts,
      mapEl ? h('div', { class: 'field' }, h('span', null, 'GPS'), mapEl, h('div', { class: 'dz-gps' }, gpsText,
        avg ? h('button', { class: 'btn small', onclick: () => { gps = { lat: avg.lat, lng: avg.lng }; showGps(); mapApi?.draw(points()); mapApi?.m.setView([avg.lat, avg.lng], 18); } }, `Use the middle of ${avg.n} delivered address${avg.n === 1 ? '' : 'es'}`) : null,
        gps ? h('button', { class: 'link small', onclick: () => { gps = null; showGps(); mapApi?.draw(points()); } }, 'Clear') : null)) : null,
      h('div', { class: 'dz-actions' }, saveBtn, del),
      validate,
      x.id && assigned.length ? h('details', { class: 'dz-assigned' }, h('summary', null, `${assigned.length} address${assigned.length === 1 ? '' : 'es'} assigned`),
        h('ul', null, assigned.map((a) => h('li', null, addrLabel(a), a.validated_at ? ' ✓' : '')))) : null,
      x.id && cur.type !== 'group' && !assigned.length ? h('p', { class: 'small muted' }, 'No addresses yet: assign them on the Addresses tab.') : null,
      x.id ? h('div', null,
        h('h3', null, 'Policies'),
        own.length ? h('ul', { class: 'dz-pol' }, own.map((p) => policyItem(p))) : h('p', { class: 'small muted' }, 'None set here.'),
        inherited.length ? h('div', { class: 'small muted' }, 'Also applies (from above): ', inherited.map(policyText).join(' · ')) : null,
        policyForm(scope)) : null);
  }

  // ================= Policies =================
  function policyItem(p) {
    return h('li', { class: policyState(p) === 'current' ? '' : 'muted' }, policyText(p),
      h('button', { class: 'link small', onclick: () => act(async () => must(await sb.from('location_policies').update({ active: !p.active, updated_at: now(), updated_by: by() }).eq('id', p.id)), p.active ? 'Switched off.' : 'Switched on.') }, p.active ? 'Switch off' : 'Switch on'),
      h('button', { class: 'link small danger', onclick: () => { if (confirm('Delete this policy?')) act(async () => must(await sb.from('location_policies').delete().eq('id', p.id)), 'Deleted.'); } }, 'Delete'));
  }

  function policyForm(scope) {
    const kind = h('select', null, Object.entries(POLICY_KINDS).map(([k, t]) => h('option', { value: k }, t)));
    const note = h('input', { placeholder: 'Details (e.g. enter from Bruce McLaren Road)' });
    const from = h('input', { type: 'time' }), to = h('input', { type: 'time' });
    const speed = h('input', { type: 'number', min: 5, max: 100, step: 5, placeholder: 'km/h' });
    const lat = h('input', { type: 'number', step: 'any', placeholder: 'Lat' }), lng = h('input', { type: 'number', step: 'any', placeholder: 'Lng' });
    const days = DAYS.map((d) => h('label', { class: 'dz-day' }, h('input', { type: 'checkbox', value: d }), d));
    const vFrom = h('input', { type: 'date', 'aria-label': 'Starts' }), vTo = h('input', { type: 'date', 'aria-label': 'Ends' });
    const show = () => {
      const k = kind.value;
      from.hidden = !['not_before', 'time_window'].includes(k); to.hidden = k !== 'time_window';
      speed.hidden = k !== 'speed_limit'; lat.hidden = lng.hidden = k !== 'entry_point';
    };
    kind.addEventListener('change', show); show();
    const form = h('details', { class: 'dz-polform' }, h('summary', null, '+ Add a policy'),
      h('div', { class: 'dz-polgrid' }, kind, note, from, to, speed, lat, lng),
      h('div', { class: 'dz-days' }, h('span', { class: 'small muted' }, 'Days (none = every day): '), days),
      h('div', { class: 'dz-days' }, h('span', { class: 'small muted' }, 'Starts (blank = now): '), vFrom, h('span', { class: 'small muted' }, ' Ends (blank = no end): '), vTo),
      h('button', { class: 'btn small primary', onclick: () => act(async () => {
        const k = kind.value;
        const row = { ...scope, kind: k, note: note.value || null, days: days.map((d) => d.firstChild).filter((c) => c.checked).map((c) => c.value), updated_by: by(),
          valid_from: vFrom.value || null, valid_to: vTo.value || null };
        if (row.valid_from && row.valid_to && row.valid_to < row.valid_from) throw new Error('The end date is before the start date');
        if (k === 'not_before' || k === 'time_window') { if (!from.value) throw new Error('Set the time'); row.time_from = from.value; }
        if (k === 'time_window') { if (!to.value) throw new Error('Set both times'); row.time_to = to.value; }
        if (k === 'speed_limit') { if (!speed.value) throw new Error('Set the speed'); row.speed_kmh = Number(speed.value); }
        if (k === 'entry_point') { if (lat.value && lng.value) { row.lat = Number(lat.value); row.lng = Number(lng.value); } else if (!note.value) throw new Error('Describe the entry point or give its GPS'); }
        if (['access_note', 'restriction'].includes(k) && !note.value) throw new Error('Write the note');
        must(await sb.from('location_policies').insert(row));
      }, 'Policy added.') }, 'Add policy'));
    return form;
  }

  function renderPolicies() {
    const all = [...D.policies].sort((a, b) => policyTarget(a).localeCompare(policyTarget(b)));
    return h('section', { class: 'dz-main' },
      h('p', { class: 'small muted' }, 'Policies attach to a group, an operating location, a service location or one address, and apply to everything under it. Add them from the Locations tab (or an address). Kinds: entry point from the road, access notes, no service before a time, deliver between two times, speed limits, delivery restrictions. Each can have a start and end date; ended ones are kept for the record. Two rules that disagree (say 5:30 on the village and 6:00 on one building, same days and dates) are refused: nothing is quietly overruled.'),
      D.clashes.length ? h('div', { class: 'banner bad' }, h('b', null, 'These policies disagree: '), D.clashes.map((c) => `${c.policy} vs ${c.other}`).join(' · '), '. Usually because an address moved under a different stop. Switch one off or give them different dates.') : null,
      all.length ? h('table', { class: 'dz-table' },
        h('thead', null, h('tr', null, h('th', null, 'Applies to'), h('th', null, 'Policy'), h('th', null, ''))),
        h('tbody', null, all.map((p) => h('tr', { class: policyState(p) === 'current' ? '' : 'muted' }, h('td', null, policyTarget(p)), h('td', null, policyText(p)), h('td', null, [...policyItem(p).querySelectorAll('button')]))))) : h('p', { class: 'muted' }, 'No policies yet.'));
  }

  // ================= Users =================
  async function adminCall(body) {
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error || msg; } catch { /* keep */ }
      throw new Error(msg);
    }
    return data;
  }
  function renderUsers() {
    const rows = D.members.map((m) => {
      const role = h('select', { onchange: (e) => act(() => adminCall({ action: 'role', email: m.email, role: e.target.value }), `${m.display_name}: ${e.target.value === 'dispatcher' ? 'app + dispatch' : 'app only'}.`) },
        h('option', { value: 'driver' }, 'App only'), h('option', { value: 'dispatcher' }, 'App + Dispatch'));
      role.value = m.role || 'driver';
      return h('tr', { class: m.active === false ? 'muted' : '' },
        h('td', null, h('b', null, m.display_name)),
        h('td', null, m.email),
        h('td', null, role),
        h('td', null, m.active === false ? 'Off' : 'On'),
        h('td', null,
          h('button', { class: 'link small', onclick: () => {
            const p = prompt(`New temporary password for ${m.display_name} (at least 8 characters). Tell them in person; they can change it in the app.`);
            if (p) act(() => adminCall({ action: 'password', email: m.email, password: p }), 'Password set.');
          } }, 'Set password'),
          m.email.toLowerCase() === app.me.email.toLowerCase() ? null : h('button', { class: `link small ${m.active === false ? '' : 'danger'}`, onclick: () => {
            if (m.active !== false && !confirm(`Switch off ${m.display_name}'s access? Their past ticks and photos stay.`)) return;
            act(() => adminCall({ action: 'active', email: m.email, active: m.active === false }), m.active === false ? 'Access back on.' : 'Access switched off.');
          } }, m.active === false ? 'Switch on' : 'Switch off')));
    });
    const name = h('input', { placeholder: 'Name (shows on ticked tiles)' });
    const email = h('input', { type: 'email', placeholder: 'Email' });
    const role = h('select', null, h('option', { value: 'driver' }, 'App only'), h('option', { value: 'dispatcher' }, 'App + Dispatch'));
    const pw = h('input', { type: 'text', placeholder: 'Temporary password (8+)', autocomplete: 'off' });
    return h('section', { class: 'dz-main' },
      h('table', { class: 'dz-table' },
        h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Access'), h('th', null, 'Active'), h('th', null, ''))),
        h('tbody', null, rows)),
      h('h3', null, 'Add a person'),
      h('div', { class: 'dz-polgrid' }, name, email, role, pw,
        h('button', { class: 'btn primary', onclick: () => act(() => adminCall({ action: 'add', name: name.value, email: email.value, role: role.value, password: pw.value }), `${name.value} added. Give them the password in person.`) }, 'Add')),
      h('p', { class: 'small muted' }, 'App only: runs, ticks and photos. App + Dispatch: also this dashboard. There must always be at least one dispatcher. Everyone can change their own password from the Runs page.'));
  }

  render();
}

// Addresses in street order, then house number (2 before 10, 1/71 before 2/71).
function addrCompare(a, b) {
  return a.street.localeCompare(b.street) || numKey(a.number).localeCompare(numKey(b.number));
}
function numKey(n) {
  const m = /^(?:(\w+)\/)?(\d+)(.*)$/.exec(n || '');
  if (!m) return n || '';
  return `${m[2].padStart(6, '0')}${m[3]}${m[1] ? `/${m[1].padStart(4, '0')}` : ''}`;
}
