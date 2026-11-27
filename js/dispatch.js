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
import { stanSays, tipOfDay, stbLogo } from './stan.js';
import { IDEA_STATUS } from './stanchat.js';
import { avatar } from './avatars.js';
import { runMapData, pingText } from './runmap.js';
import { buildReport, evidenceText, nzDate, reportFileName, reportRef } from './report.js';
import { buildInsights, EARLY_DAYS, duration, runMornings } from './insights.js';
import { runStats, buildPlan, planText, clockTime } from './dayplan.js';
import { STAN_LINES, linesToRecord } from './stanlines.js';
import { playStanClip } from './stanfx.js';
import { runDistance, doubledBack, ROAD_FACTOR } from './runkm.js';
import { DEFAULT_DEADLINES, deadlineFor, runWatch, typicalDuration, summaryText, needsAttention } from './watch.js';
import { shiftSegments, runOwners, parseLatLng, clock, SEGMENT_LABEL, DUTY_LABEL, currentDuty, autoOffAt, shiftCrews } from './shifts.js';
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
    // The size watch (decision 0080): how full the free plan is. Never holds up the board.
    sb.rpc('stb_usage').then(({ data }) => { D.usage = data || []; }).catch(() => {});
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
    // Anyone left on duty after all of that day's runs were closed is shown as off duty from when the last run closed (decision 0038).
    // Their phone records the same thing for real the next time it opens the Runs page; until then this stands in for it.
    for (const n of [...new Set(D.duty.map((e) => e.user_name))]) {
      const off = autoOffAt(D.duty.filter((e) => e.user_name === n), D.runs);
      if (off) D.duty.push({ id: `auto-${n}`, user_name: n, state: 'off_duty', source: 'auto', device_time: new Date(off).toISOString(), assumed: true });
    }
    D.depot = await app.store.getSetting('depot');
    try { D.ideas = await app.store.loadIdeas(); } catch { D.ideas = null; } // null = table not there yet
    // Morning watch (decision 0028): the deadlines, and how long each run has taken before (app ticks only).
    D.deadlines = (await app.store.getSetting('deadlines')) || null;
    try { const tm = app.store.loadRunTimes ? await app.store.loadRunTimes() : must(await sb.from('run_times').select('*').in('run_id', allIds.slice(0, 300))); D.times = Object.fromEntries(tm.map((x) => [x.run_id, x])); } catch { D.times = {}; }
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
  const tabs = [['overview', 'Overview'], ['insights', 'Insights'], ['plan', 'Day plan'], ['runs', 'Runs & sheets'], ['complaints', 'Complaints'], ['addresses', 'Addresses'], ['locations', 'Locations'], ['policies', 'Policies'], ['users', 'People'], ['voice', 'Stan’s voice'], ['history', 'Change log']];
  if (!tabs.some(([k]) => k === tab)) tab = 'overview';
  // Four sections, each with its pages (decision 0048). On a laptop they are headings down the side; on a phone the
  // sections are a bar along the bottom and the section's pages are a row of pills under the header.
  const SECTIONS = [
    { key: 'today', label: 'Today', icon: '☀', pages: [['overview', 'Now'], ['plan', 'Plan'], ['runs', 'Runs']] },
    { key: 'proof', label: 'Proof', icon: '✓', pages: [['complaints', 'Complaints']] },
    { key: 'insights', label: 'Insights', icon: '↗', pages: [['insights', 'Insights']] },
    { key: 'setup', label: 'Set-up', icon: '⚙', pages: [['users', 'People'], ['addresses', 'Addresses'], ['locations', 'Locations'], ['policies', 'Policies'], ['voice', 'Stan’s voice'], ['history', 'Change log']] },
  ];
  const sectionOf = (k) => SECTIONS.find((sec) => sec.pages.some(([p]) => p === k)) || SECTIONS[0];
  const lastIn = (sec) => { let k = null; try { k = localStorage.getItem(`stb.dz.last.${sec.key}`); } catch { /* private mode */ } return sec.pages.some(([p]) => p === k) ? k : sec.pages[0][0]; };
  const body = h('div', { class: 'dz-body' }, h('p', { class: 'muted' }, 'Loading…'));
  const nav = h('nav', { class: 'dz-nav', 'aria-label': 'Dispatch' });
  const subnav = h('nav', { class: 'dz-subnav', 'aria-label': 'Pages in this section' });
  const bottom = h('nav', { class: 'dz-bottom', 'aria-label': 'Dispatch sections' });
  // On a phone a wide table can't be read: each row becomes a card, and each cell needs its column's name beside it.
  const labelTables = () => { for (const t of body.querySelectorAll('table.dz-table')) { const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim()); if (!heads.length) { t.classList.add('dz-nohead'); continue; }
    for (const tr of t.querySelectorAll('tbody tr')) [...tr.children].forEach((td, i) => { if (heads[i] && td.dataset.label !== heads[i]) td.dataset.label = heads[i]; }); } };
  new MutationObserver(() => labelTables()).observe(body, { childList: true, subtree: true });
  // Switch pages without leaving (keeps what's selected); the address bar follows along.
  const go = async (k, focus) => {
    const needHistory = k === 'history' && tab !== 'history';
    tab = k; if (focus !== undefined) current = focus;
    try { localStorage.setItem(`stb.dz.last.${sectionOf(k).key}`, k); } catch { /* private mode */ }
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
    h('main', { class: 'dz-content' }, subnav, body),
    bottom));
  try { await load(); } catch (e) { body.replaceChildren(h('div', { class: 'banner bad' }, `Could not load: ${e.message}. Has the dispatch part of sql/schema.sql been run?`)); return; }
  const render = () => {
    maps.splice(0).forEach((m) => m.remove());
    const full = Object.fromEntries(tabs);
    const unplaced = D.addresses.filter((a) => !a.operating_location_id).length; const open = D.register.filter((c) => c.status === 'open').length;
    const badge = (k) => (k === 'addresses' && unplaced ? h('span', { class: 'dz-count' }, unplaced) : k === 'complaints' && open ? h('span', { class: 'dz-count bad' }, open) : null);
    const link = (k, label, cls = '') => h('a', { href: `#/dispatch/${k}`, class: `${cls} ${k === tab ? 'on' : ''}`.trim(), 'aria-current': k === tab ? 'page' : null, onclick: (e) => { e.preventDefault(); go(k, null); } }, label, badge(k));
    const here = sectionOf(tab);
    nav.replaceChildren(...SECTIONS.flatMap((sec) => [h('div', { class: 'dz-nav-h' }, sec.label), ...sec.pages.map(([k]) => link(k, full[k]))]));
    subnav.replaceChildren(...(here.pages.length > 1 ? here.pages.map(([k, short]) => link(k, short, 'dz-pill')) : []));
    subnav.hidden = here.pages.length < 2;
    bottom.replaceChildren(...SECTIONS.map((sec) => { const n = sec.key === 'proof' ? open : sec.key === 'setup' ? unplaced : 0;
      return h('a', { href: `#/dispatch/${lastIn(sec)}`, class: sec === here ? 'on' : '', 'aria-current': sec === here ? 'true' : null, onclick: (e) => { e.preventDefault(); go(sec === here ? sec.pages[0][0] : lastIn(sec), null); } },
        h('span', { class: 'dz-bottom-i', 'aria-hidden': 'true' }, sec.icon), h('span', null, sec.label), n ? h('span', { class: `dz-dot ${sec.key === 'proof' ? 'bad' : ''}`, 'aria-label': `${n} to look at` }, n) : null); }));
    body.replaceChildren(h('h1', { class: 'dz-title' }, tabs.find(([k]) => k === tab)[1]), usageWarning(D.usage, h),
      ({ overview: renderOverview, insights: renderInsights, plan: renderPlan, voice: renderVoice, runs: renderRuns, complaints: renderComplaints, addresses: renderAddresses, locations: renderLocations, policies: renderPolicies, users: renderUsers, history: renderHistory })[tab]());
  };
  const refresh = async () => { await load(); render(); };
  // Morning watch keeps itself fresh: every minute while the Overview is showing a day with a run still under way.
  const auto = setInterval(async () => {
    if (!body.isConnected) { clearInterval(auto); return; }
    if (tab !== 'overview' || document.visibilityState !== 'visible' || document.querySelector('.sheet, .stb-report')) return;
    const date = focusDate(); const live = D.runs.some((r) => r.delivery_date === date && !runComplete(r)) && Math.abs(Date.now() - deadlineFor(date, D.deadlines || DEFAULT_DEADLINES).at) < 8 * 3600e3;
    if (live) { const y = window.scrollY; try { await refresh(); window.scrollTo(0, y); } catch { /* offline: try again next minute */ } }
  }, 60000);
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
    const attnCard = card('Needs attention', attention.length ? h('ul', { class: 'dz-attn' }, attention) : stanSays(h('p', { class: 'ok' }, '✓ Nothing waiting.'), { pose: 'wave', size: 44 }));
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
    const proofCard = card('Proof of delivery', h('p', { class: 'small muted' }, 'Look up any address: every delivery with who, when, GPS and photos.'), h('div', { class: 'dz-actions' }, h('button', { class: 'btn small', onclick: () => findDelivery() }, 'Find a delivery\u2026'), h('button', { class: 'btn small', onclick: () => openReport() }, 'Delivery report (PDF)\u2026')));
    const watchCard = rs.length ? card(`Morning watch \u00b7 ${fmtDate(date, true)}`, watchView(rs, date)) : null;
    const shiftsCard = card('Shifts', shiftsView(rs));
    const ideasCard = card(`Stan\u2019s ideas book${D.ideas?.some((i) => i.status === 'new') ? ` (${D.ideas.filter((i) => i.status === 'new').length} new)` : ''}`, ideasView());
    const tipCard = card('Stan\u2019s tip', stanSays(h('p', null, tipOfDay(), ' ',
      h('a', { href: 'https://github.com/whoisdoingthis-star/stb-runs/blob/main/docs/dispatch-guide.md', target: '_blank', rel: 'noopener' }, 'More in the Dispatch guide')), { size: 40, cls: 'dz-tip' }));
    const depotCard = card('Depot', D.depot?.lat
      ? h('p', null, `Set${D.depot.updated_by ? ` by ${D.depot.updated_by}` : ''}: ${D.depot.lat.toFixed(5)}, ${D.depot.lng.toFixed(5)} (within ${D.depot.radius_m || 150} m counts as at the depot). `,
        h('a', { href: `https://www.google.com/maps/search/?api=1&query=${D.depot.lat},${D.depot.lng}`, target: '_blank', rel: 'noopener' }, 'Check on the map'))
      : h('p', { class: 'warn' }, 'Not set yet. Phones can’t tell drivers they’re at the depot until it is.'),
      h('button', { class: 'btn', onclick: () => setDepot() }, D.depot?.lat ? 'Change the depot…' : 'Set the depot…'));
    const photosCard = card('Recent photos', D.photos.length ? h('ul', { class: 'dz-attn' }, D.photos.map((ph) => h('li', null, `${fmtStamp(ph.taken_at)} · ${ph.address_key.split('|').slice(1).reverse().join(' ')} · ${ph.user_name || ''}`)))
        : h('p', { class: 'muted' }, 'No delivery photos yet.'));
    // Two columns on a laptop: the day's work on the left, what needs a look on the right (first on a phone).
    return h('div', { class: 'dz-over' },
      h('div', { class: 'dz-col side' }, attnCard, proofCard, complaintsCard, photosCard, depotCard, tipCard),
      h('div', { class: 'dz-col main' }, watchCard, sheetsCard, h('div', { class: 'dz-pair' }, progressCard, itemsCard), shiftsCard, ideasCard, scoreCard));
  }

  // ---- Shifts: each person's morning as one bar, every minute accounted for (decision 0020)
  function shiftsView(rs) {
    const ticks = D.status.filter((x) => x.done && x.method !== 'paper' && x.user_name);
    const owners = runOwners(rs, D.status);
    const people = [...new Set([...D.duty.map((e) => e.user_name), ...ticks.map((x) => x.user_name)].filter(Boolean))].sort();
    if (!people.length) return stanSays(h('p', { class: 'muted' }, 'Nobody has gone on duty or ticked a stop this day yet.'), { size: 44 });
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
        h('div', { class: 'dz-shift-head' }, avatar(p, 26), h('b', null, p),
          ` ${hm(x.start)}–${x.open ? 'now' : hm(x.end)} · ${clock(x.totals.shift)}`,
          (() => { const cs = shiftCrews(D.duty); const mineC = cs.find((c) => c.driver === p); const helping = cs.find((c) => c.helpers.includes(p));
            return mineC ? h('span', { class: 'small muted' }, mineC.helpers.length ? ` · with ${mineC.helpers.join(' and ')}` : ' · on their own') : helping ? h('span', { class: 'small muted' }, ` · helping ${helping.driver}`) : null; })(),
          (() => { const ho = [...D.duty].reverse().find((e) => e.user_name === p && e.state === 'off_duty' && (e.handover_to || e.reason)); return ho ? h('span', { class: 'small', style: 'font-weight:700' }, ho.handover_to ? ` · handed the rest to ${ho.handover_to}` : ` · stopped early: ${{ unwell: 'unwell', car: 'car trouble', other: 'something else' }[ho.reason] || ho.reason}`) : null; })(),
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

  // ---- Morning watch (decision 0028): each run against its deadline, and a summary to send on
  const usualFor = (route, exceptId) => typicalDuration(D.runs.filter((r) => r.route === route && r.id !== exceptId && D.times[r.id]).map((r) => ({ first: Date.parse(D.times[r.id].first_tick), last: Date.parse(D.times[r.id].last_tick), ticks: D.times[r.id].ticks })));
  const watchOf = (r, now = Date.now()) => {
    const dl = deadlineFor(r.delivery_date, D.deadlines || DEFAULT_DEADLINES);
    const ticks = D.status.filter((x) => x.run_id === r.id && x.done && x.method !== 'paper').map((x) => Date.parse(x.device_time));
    const complete = runComplete(r);
    const finishedAt = r.closed_at ? Date.parse(r.closed_at) : complete && r.lastTick ? Date.parse(r.lastTick) : null;
    return { ...runWatch({ run: { total: r.summary?.lines || 0, done: r.done || 0, complete, finishedAt }, tickTimes: ticks, deadline: dl.at, typicalMs: usualFor(r.route, r.id), now }), kind: dl.kind };
  };
  function watchView(rs, date) {
    const hm = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit' });
    const rows = rs.map((r) => ({ r, name: shortRoute(r.route), watch: watchOf(r) }));
    const dl = deadlineFor(date, D.deadlines || DEFAULT_DEADLINES);
    const bad = rows.filter((x) => needsAttention(x.watch));
    const ICON = { done_on_time: '\u2713', done_late: '\u2713', on_track: '\u25b6', late: '\u26a0', not_started: '\u25cb', not_started_late: '\u26a0', unfinished: '?' };
    const detail = (w) => (w.state.startsWith('done') ? (w.finishedAt ? `finished ${hm(w.finishedAt)}` : 'closed from the paper sheet')
      : w.state === 'not_started' ? `needs to start by ${hm(w.startBy)}` : w.eta ? `finish about ${hm(w.eta)}` : '');
    // The last two weeks, for the record: how many finished runs made their deadline.
    const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
    const past = D.runs.filter((r) => r.delivery_date >= since && r.delivery_date <= date && runComplete(r)).map((r) => watchOf(r)).filter((w) => w.finishedAt);
    const onTime = past.filter((w) => w.state === 'done_on_time').length;
    const lineOf = (x) => D.lines.find((l) => l.run_id === x.run_id && l.line_key === x.line_key);
    const notDelivered = D.status.filter((x) => x.outcome === 'futile').map((x) => { const l = lineOf(x); return `${l ? `${String(l.number).replace(/\s+/g, '')} ${titleCase(l.street)}` : 'an address'} (${(x.reason || 'no reason given').toLowerCase()})`; });
    const text = () => summaryText(fmtDate(date, true), rows, { notDelivered, photos: D.photos.filter((p) => nzDate(p.taken_at) === date).length });
    return h('div', { class: 'dz-watch' },
      h('p', { class: bad.length ? 'bad' : 'ok', role: 'status' }, bad.length ? `\u26a0 ${bad.length} run${bad.length === 1 ? '' : 's'} need${bad.length === 1 ? 's' : ''} attention.` : rows.every((x) => x.watch.state.startsWith('done')) ? '\u2713 Every run is finished.' : '\u2713 Nothing is at risk right now.',
        h('span', { class: 'small muted' }, ` Deadline ${hm(dl.at)} (${dl.kind === 'weekday' ? 'Monday to Friday' : dl.kind === 'holiday' ? 'public holiday' : 'weekend'}).`)),
      h('table', { class: 'dz-table dz-watch-table' }, h('tbody', null, rows.map(({ r, name, watch: w }) => h('tr', { class: `ws-${w.state}` },
        h('td', { class: 'ws-icon', 'aria-hidden': 'true' }, ICON[w.state]), h('td', null, h('b', null, name)), h('td', null, w.text), h('td', { class: 'muted' }, detail(w)),
        h('td', { class: 'num muted' }, `${r.done || 0}/${r.summary?.lines ?? '?'}`))))),
      h('div', { class: 'dz-actions' },
        h('button', { class: 'btn small', onclick: async (e) => { const b = e.currentTarget; try { await navigator.clipboard.writeText(text()); b.textContent = 'Copied \u2713'; } catch { openSheet('Morning summary', h('textarea', { rows: 10, style: 'width:100%', readonly: true }, text())); } } }, 'Copy the morning summary'),
        h('button', { class: 'btn small', onclick: () => setDeadlines() }, 'Deadlines\u2026'),
        past.length ? h('span', { class: 'small muted' }, `Last two weeks: ${onTime} of ${past.length} finished runs on time.`) : null),
      h('p', { class: 'small muted' }, 'Finish times come from the pace of the ticks so far. Runs done on paper show once they are closed. This page refreshes itself every minute while a run is under way.'));
  }
  function setDeadlines() {
    const d = { ...DEFAULT_DEADLINES, ...(D.deadlines || {}) };
    const wk = h('input', { type: 'time', value: d.weekday }); const we = h('input', { type: 'time', value: d.weekend });
    const hol = h('textarea', { rows: 6, style: 'width:100%', 'aria-label': 'Public holidays, one date per line' }, (d.holidays || []).join('\n'));
    const msg = h('p', { class: 'small muted' }, 'Public holidays use the weekend time. One date per line, like 2026-12-25. Check the list each year.');
    const close = openSheet('Delivery deadlines',
      h('label', { class: 'field' }, h('span', null, 'Monday to Friday, finished by'), wk), h('label', { class: 'field' }, h('span', null, 'Weekends and public holidays, finished by'), we),
      h('label', { class: 'field' }, h('span', null, 'Public holidays'), hol), msg,
      h('button', { class: 'btn primary', onclick: async () => {
        const days = hol.value.split(/[\s,]+/).filter(Boolean);
        const wrong = days.find((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x) || Number.isNaN(Date.parse(x)));
        if (wrong || !wk.value || !we.value) { msg.textContent = wrong ? `\u201c${wrong}\u201d isn\u2019t a date like 2026-12-25.` : 'Both times are needed.'; msg.className = 'small bad'; return; }
        try { await app.store.setSetting('deadlines', { weekday: wk.value, weekend: we.value, holidays: [...new Set(days)].sort() }, by()); close(); toast('Deadlines saved.'); await refresh(); }
        catch (e) { msg.textContent = `Couldn\u2019t save: ${e.message}`; msg.className = 'small bad'; }
      } }, 'Save'));
  }

  // ---- Stan's ideas book: what the family told Stan, with a status and a note (decision 0024)
  function ideasView() {
    if (D.ideas === null) return h('p', { class: 'warn' }, 'The ideas table isn\u2019t in the database yet (run the Chat with Stan block of sql/schema.sql).');
    if (!D.ideas.length) return stanSays(h('p', { class: 'muted' }, 'No ideas yet. On the phones: Runs page \u2192 Got an idea? Tell Stan.'), { size: 44 });
    const open = D.ideas.filter((i) => i.status === 'new' || i.status === 'planned');
    const closed = D.ideas.filter((i) => i.status === 'done' || i.status === 'declined');
    const row = (i) => {
      const sel = h('select', { 'aria-label': 'Status', onchange: async () => { try { await app.store.reviewIdea(i.id, { status: sel.value }, by()); toast('Saved.'); await refresh(); } catch (e) { toast(`Couldn\u2019t save: ${e.message}`); } } },
        Object.entries(IDEA_STATUS).map(([k, v]) => h('option', { value: k, selected: i.status === k }, v)));
      return h('li', { class: `dz-idea st-${i.status}` },
        h('div', { class: 'dz-idea-text' }, i.text),
        h('div', { class: 'small muted dz-idea-who' }, avatar(i.user_name || '?', 20), `${i.user_name || 'Someone'} \u00b7 ${fmtStamp(i.device_time)}${i.screen ? ` \u00b7 from the ${i.screen} screen` : ''}${i.note ? ` \u00b7 ${i.note}` : ''}`),
        h('div', { class: 'dz-idea-act' }, sel,
          h('button', { class: 'btn small', onclick: () => {
            const box = h('textarea', { rows: 3, style: 'width:100%', 'aria-label': 'Note' }, i.note || '');
            const close = openSheet('Note on this idea', h('p', { class: 'muted' }, i.text), box,
              h('button', { class: 'btn primary', style: 'margin-top:8px', onclick: async () => { try { await app.store.reviewIdea(i.id, { note: box.value.trim() || null }, by()); close(); await refresh(); } catch (e) { toast(`Couldn\u2019t save: ${e.message}`); } } }, 'Save'));
          } }, i.note ? 'Edit note' : 'Add a note')));
    };
    return h('div', null,
      open.length ? h('ul', { class: 'dz-ideas' }, open.map(row)) : h('p', { class: 'ok' }, '\u2713 Every idea has been dealt with.'),
      closed.length ? h('details', null, h('summary', null, `Done or not now (${closed.length})`), h('ul', { class: 'dz-ideas' }, closed.map(row))) : null);
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
      h('div', { class: 'dz-actions', style: 'margin-bottom:8px' }, h('button', { class: 'btn primary', onclick: () => openReport() }, 'Delivery report (PDF)\u2026'), h('button', { class: 'btn', onclick: () => findDelivery() }, 'Find a delivery\u2026')),
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
    h('button', { class: 'btn small', onclick: () => openRunMap(r) }, 'Map'),
    h('button', { class: 'btn small', onclick: () => (r.closed_at ? reopenRun(r) : closeRun(r)) }, r.closed_at ? 'Reopen…' : runComplete(r) ? 'Set driver…' : 'Close run…'));

  // Default finish time: 7am on the delivery day (runs are done early), or now if that is still ahead.
  const defaultFinish = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    const seven = new Date(`${date}T07:00`); const now = new Date();
    const d = seven > now ? now : seven;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ================= Find a delivery: proof on demand (decision 0028) =================
  function findDelivery() {
    const q = h('input', { type: 'search', placeholder: 'e.g. 12 Rimu or 2/2A Kerry', 'aria-label': 'Address' });
    const hits = h('div', { class: 'dz-find-hits' }); const out = h('div', { class: 'dz-find-out', 'aria-live': 'polite' });
    const time = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const label = (a) => `${String(a.number || '').replace(/\s+/g, '')} ${titleCase(a.street || '')}`;
    const search = () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean); out.replaceChildren();
      if (!words.length) { hits.replaceChildren(); return; }
      const found = D.addresses.filter((a) => { const t = `${String(a.number || '').replace(/\s+/g, '')} ${a.street || ''}`.toLowerCase(); return words.every((w) => t.includes(w)); }).slice(0, 8);
      hits.replaceChildren(...(found.length ? found.map((a) => h('button', { class: 'btn small', onclick: () => show(a) }, `${label(a)}${a.route ? ` \u00b7 ${shortRoute(a.route)}` : ''}`)) : [h('p', { class: 'small muted' }, 'No address like that on any sheet so far.')]));
    };
    async function show(a) {
      out.replaceChildren(h('p', { class: 'small muted' }, 'Looking up deliveries\u2026'));
      try {
        const rows = app.store.loadProof ? await app.store.loadProof(a.address_key) : await (async () => {
          const ticks = must(await sb.from('tap_events').select('address_key, done, outcome, reason, method, user_name, device_time, lat, lng, accuracy_m').eq('address_key', a.address_key).order('device_time', { ascending: false }).limit(400));
          const photos = must(await sb.from('photos').select('*').eq('address_key', a.address_key).order('taken_at', { ascending: false }).limit(60));
          if (photos.length) { const { data } = await sb.storage.from('delivery-photos').createSignedUrls(photos.map((p) => p.path), 3600); (data || []).forEach((u, i) => { photos[i].url = u.signedUrl || null; }); }
          return { ticks, photos };
        })();
        const days = [...new Set([...rows.ticks.map((t) => nzDate(t.device_time)), ...rows.photos.map((p) => nzDate(p.taken_at))])].sort().reverse();
        const R = buildReport({ from: days.at(-1) || '0000', to: days[0] || '9999', complaints: D.register.filter((c) => c.address_key === a.address_key), photos: rows.photos, ticks: rows.ticks });
        const byDay = new Map(); const slot = (d) => { if (!byDay.has(d)) byDay.set(d, { delivery: null, photos: [] }); return byDay.get(d); };
        for (const t of [...rows.ticks].reverse()) slot(nzDate(t.device_time)).delivery = { by: t.user_name, at: t.device_time, outcome: t.outcome || (t.done ? 'delivered' : 'undone'), reason: t.reason, method: t.method === 'paper' ? 'paper' : 'app', lat: t.lat, lng: t.lng, accuracy_m: t.accuracy_m };
        for (const p of rows.photos) slot(nzDate(p.taken_at)).photos.push(p);
        for (const c of R.complaints) slot(c.day || c.reported).complaint = c;
        const list = [...byDay.entries()].sort((x, y) => y[0].localeCompare(x[0]));
        out.replaceChildren(h('h3', null, `${label(a)}: ${list.length} delivery day${list.length === 1 ? '' : 's'} on record`),
          ...(list.length ? list.map(([d, v]) => h('div', { class: 'dz-find-day' }, h('b', null, day(d)),
            h('div', null, evidenceText(v.delivery, time), ' ', v.delivery?.lat != null && v.delivery.method !== 'paper' ? h('a', { href: `https://www.google.com/maps/search/?api=1&query=${v.delivery.lat},${v.delivery.lng}`, target: '_blank', rel: 'noopener' }, 'map') : null),
            v.complaint ? h('div', { class: 'small bad' }, `Complaint received: ${v.complaint.kindText}. ${v.complaint.statusText}${v.complaint.notes ? `. ${v.complaint.notes}` : ''}`) : null,
            v.photos.length ? h('div', { class: 'dz-find-photos' }, v.photos.map((p) => (p.url ? h('a', { href: p.url, target: '_blank', rel: 'noopener' }, h('img', { src: p.url, alt: `Photo, ${time(p.taken_at)}` })) : h('span', { class: 'small muted' }, 'photo not available')))) : null))
            : [h('p', { class: 'muted' }, 'Nothing ticked or photographed at this address yet.')]));
      } catch (e) { out.replaceChildren(h('p', { class: 'bad' }, `Couldn\u2019t look that up: ${e.message}`)); }
    }
    q.addEventListener('input', () => { clearTimeout(q.t); q.t = setTimeout(search, 200); });
    openSheet('Find a delivery', h('p', { class: 'small muted' }, 'Type part of the address. You\u2019ll see every day it was delivered: who, the time, GPS and photos.'), q, hits, out);
    setTimeout(() => q.focus(), 200);
  }

  // ================= Delivery report (decision 0027) =================
  // Complaints and how each was resolved, with the delivery record (who, when, GPS) and photos, plus every
  // photographed delivery in the dates. Opens as a page to check, then Save as PDF from the print box.
  function openReport() {
    const today = nzDate(Date.now());
    const from = h('input', { type: 'date', value: nzDate(Date.now() - 6 * 864e5), max: today });
    const to = h('input', { type: 'date', value: today, max: today });
    const msg = h('p', { class: 'small muted' }, 'Includes every complaint about or received in these dates, each set beside our delivery record for that morning (time, who, GPS, photos), and every other delivery that has a photo. You can leave a note out before you save it.');
    const close = openSheet('Delivery report',
      h('label', { class: 'field' }, h('span', null, 'From'), from), h('label', { class: 'field' }, h('span', null, 'To'), to), msg,
      h('button', { class: 'btn primary big', onclick: async (e) => {
        if (!from.value || !to.value || from.value > to.value) { msg.textContent = 'Pick a From date that is on or before the To date.'; msg.className = 'small bad'; return; }
        e.currentTarget.disabled = true; msg.textContent = 'Gathering deliveries and photos\u2026'; msg.className = 'small muted';
        try { const rows = await loadReport(from.value, to.value); close(); showReport(buildReport({ from: from.value, to: to.value, ...rows })); }
        catch (err) { msg.textContent = `Couldn\u2019t make the report: ${err.message}`; msg.className = 'small bad'; e.currentTarget.disabled = false; }
      } }, 'Make the report'));
  }
  // ================= Insights (decision 0035) =================
  // What the collected data says, with a suggestion each. The sums are in js/insights.js (tested);
  // this loads the rows for the dates and lays the findings out.
  const INS = { from: null, to: null, data: null, loading: false, error: null, rows: null, km: null, kmBusy: null, kmStop: false, kmError: null };
  async function loadInsights(from, to) {
    if (app.store.loadInsights) return app.store.loadInsights(from, to, D.register); // (test page)
    const runs = must(await sb.from('runs').select('id, route, delivery_date').gte('delivery_date', from).lte('delivery_date', to).order('delivery_date').limit(2000));
    const ids = runs.map((r) => r.id); const ticks = []; const lines = [];
    // a few runs at a time, a thousand rows a page: a month is tens of thousands of ticks
    for (let i = 0; i < ids.length; i += 20) {
      for (let page = 0; ; page += 1000) {
        const rows = must(await sb.from('tap_events').select('run_id, line_key, address_key, done, outcome, reason, method, user_name, device_time, lat, lng, accuracy_m').in('run_id', ids.slice(i, i + 20)).order('device_time').range(page, page + 999));
        ticks.push(...rows); if (rows.length < 1000) break;
      }
      for (let page = 0; ; page += 1000) { // every stop on those sheets, for DIFOT
        const rows = must(await sb.from('run_lines').select('run_id, line_key').in('run_id', ids.slice(i, i + 20)).order('run_id').order('line_key').range(page, page + 999));
        lines.push(...rows); if (rows.length < 1000) break;
      }
    }
    const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 36 * 3600e3).toISOString(); const hi = new Date(Date.parse(`${to}T00:00:00Z`) + 36 * 3600e3).toISOString();
    const photos = must(await sb.from('photos').select('address_key, taken_at, user_name, route, path').gte('taken_at', lo).lte('taken_at', hi).order('taken_at').limit(5000));
    return { runs, ticks, lines, photos, complaints: D.register };
  }
  // ================= Stan's voice (decision 0043) =================
  // Every line Stan says in his recorded voice: listen, record what's missing, record again if it came out wrong.
  const VOICE = { rows: undefined, busy: null, error: null, ctx: null, playing: null, stop: false };
  function renderVoice() {
    const box = h('div', { class: 'sv' });
    const load = async () => { try { const { data, error } = await sb.from('stan_lines').select('*'); if (error) throw error; VOICE.rows = data || []; } catch (e) { VOICE.rows = []; VOICE.error = `Couldn’t read the recordings: ${e.message}`; } paint(); };
    const record = async (key) => {
      const { data, error } = await sb.functions.invoke('stan-voice', { body: { key, text: STAN_LINES[key].say } });
      if (error) { let msg = error.message; try { msg = (await error.context.json()).error || msg; } catch { /* keep */ } throw new Error(msg); }
      VOICE.rows = [...VOICE.rows.filter((r) => r.key !== key), data];
    };
    const recordMany = async (keys) => {
      VOICE.error = null; VOICE.stop = false;
      for (const key of keys) {
        if (VOICE.stop) break;
        VOICE.busy = key; paint();
        try { await record(key); } catch (e) { VOICE.error = `Stopped at “${STAN_LINES[key].say}”: ${e.message}`; break; }
      }
      VOICE.busy = null; paint();
    };
    const play = async (key, plain) => {
      try {
        const row = VOICE.rows.find((r) => r.key === key); if (!row) return;
        VOICE.ctx ||= new (window.AudioContext || window.webkitAudioContext)(); await VOICE.ctx.resume();
        try { VOICE.playing?.stop(); } catch { /* finished already */ }
        const url = `${sb.storage.from('stan-voice').getPublicUrl(`${key}.mp3`).data.publicUrl}?v=${encodeURIComponent(row.recorded_at)}`;
        const buf = await VOICE.ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
        VOICE.playing = playStanClip(VOICE.ctx, buf, plain ? { reverb: 0, robot: 0, speed: 100 } : {});
      } catch (e) { toast(`Couldn’t play it: ${e.message}`); }
    };
    function paint() {
      if (VOICE.rows === undefined) { box.replaceChildren(h('p', { class: 'muted' }, 'Loading…')); return; }
      const todo = linesToRecord(VOICE.rows); const by = new Map(VOICE.rows.map((r) => [r.key, r])); const groups = new Map();
      for (const [key, l] of Object.entries(STAN_LINES)) { if (!groups.has(l.when)) groups.set(l.when, []); groups.get(l.when).push([key, l]); }
      const total = Object.keys(STAN_LINES).length;
      box.replaceChildren(...[
        h('p', { class: 'muted', style: 'max-width:760px' }, 'What Stan says out loud in his own recorded voice. ▶ plays a line the way the phones will hear it, with his light robot finish. Each recording uses a few credits from the voice service, so record a line again only if it came out wrong.'),
        h('div', { class: 'banner' }, `${total - todo.length} of ${total} lines recorded.${todo.length ? ` ${todo.filter((x) => x.why === 'new').length} not recorded yet${todo.some((x) => x.why === 'changed') ? `, ${todo.filter((x) => x.why === 'changed').length} with changed words` : ''}.` : ' All done.'}`),
        VOICE.error ? h('div', { class: 'banner bad' }, VOICE.error) : null,
        h('div', { class: 'dz-polgrid' },
          todo.length && !VOICE.busy ? h('button', { class: 'btn primary', onclick: () => recordMany(todo.map((x) => x.key)) }, `Record the ${todo.length} that ${todo.length === 1 ? 'is' : 'are'} missing`) : null,
          VOICE.busy ? h('button', { class: 'btn', onclick: () => { VOICE.stop = true; } }, 'Stop after this one') : null,
          VOICE.busy ? h('span', { class: 'small muted' }, `Recording “${STAN_LINES[VOICE.busy].say}”…`) : null),
        ...[...groups.entries()].map(([when, lines]) => h('div', { class: 'sv-group' }, h('h3', null, when),
          h('table', { class: 'dz-table' }, h('tbody', null, lines.map(([key, l]) => { const r = by.get(key); const changed = r && r.text !== l.say;
            return h('tr', null,
              h('td', null, h('b', null, l.say), changed ? h('div', { class: 'small warn' }, `Recorded as “${r.text}”`) : null),
              h('td', { class: 'small muted' }, VOICE.busy === key ? 'Recording…' : r ? `${changed ? 'Words changed · ' : ''}${r.recorded_by || ''} ${new Date(r.recorded_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}` : 'Not recorded'),
              h('td', { style: 'white-space:nowrap;text-align:right' },
                r ? h('button', { class: 'btn small', 'aria-label': `Play: ${l.say}`, onclick: () => play(key, false) }, '▶') : null, ' ',
                r ? h('button', { class: 'link small', onclick: () => play(key, true) }, 'plain') : null, ' ',
                h('button', { class: 'link small', disabled: VOICE.busy ? true : null, onclick: () => recordMany([key]) }, r ? 'Record again' : 'Record'))); }))))),
      ].filter(Boolean));
    }
    paint(); if (VOICE.rows === undefined) load();
    return box;
  }
  // ================= Day plan (decision 0040) =================
  // Who is driving, who is helping, and Stan works out the order and the start times from how long the runs really take.
  const PLAN = { date: null, crews: null, plan: null, saved: undefined, loading: false, error: null, note: '' };
  function renderPlan() {
    const box = h('div', { class: 'dp' });
    const dates = [...new Set(D.runs.map((r) => r.delivery_date))].sort(); const today = nzDate(Date.now());
    if (!PLAN.date) PLAN.date = dates.find((d) => d > today) || focusDate();
    const people = D.members.filter((m) => m.active !== false);
    const drivers = people.filter((m) => (m.crew || 'driver') === 'driver').map((m) => m.display_name); const helpers = people.filter((m) => m.crew === 'helper').map((m) => m.display_name);
    if (!PLAN.crews) PLAN.crews = Object.fromEntries(drivers.map((n) => [n, { on: false, helpers: [] }]));
    for (const n of drivers) PLAN.crews[n] ||= { on: false, helpers: [] };
    const dayRuns = () => D.runs.filter((r) => r.delivery_date === PLAN.date);
    const dl = () => deadlineFor(PLAN.date, D.deadlines || DEFAULT_DEADLINES);
    const loadSaved = async () => {
      try { const { data, error } = app.store.loadDayPlan ? { data: await app.store.loadDayPlan(PLAN.date) } : await sb.from('day_plans').select('*').eq('delivery_date', PLAN.date).maybeSingle(); if (error) throw error; PLAN.saved = data || null; }
      catch { PLAN.saved = null; }
      if (PLAN.saved && !PLAN.plan) { for (const c of PLAN.saved.plan.crews || []) if (PLAN.crews[c.driver]) PLAN.crews[c.driver] = { on: true, helpers: [...c.helpers] }; PLAN.note = PLAN.saved.note || ''; }
      paint();
    };
    const work = async () => {
      const crews = drivers.filter((n) => PLAN.crews[n].on).map((n) => ({ driver: n, helpers: PLAN.crews[n].helpers }));
      if (!crews.length) return toast('Tick at least one driver.');
      if (!dayRuns().length) return toast('No run sheets are loaded for that day yet.');
      PLAN.loading = true; PLAN.error = null; paint();
      try {
        const from = nzDate(Date.parse(`${PLAN.date}T00:00:00Z`) - 28 * 864e5);
        const rows = await loadInsights(from, PLAN.date);
        const stats = runStats(runMornings(rows.runs.filter((r) => r.delivery_date < PLAN.date), rows.ticks, D.deadlines || DEFAULT_DEADLINES));
        const runs = dayRuns().map((r) => ({ route: r.route, stops: r.summary?.copies ?? r.summary?.lines }));
        PLAN.plan = { ...buildPlan({ runs, crews, stats, deadline: dl().at, depot: D.depot?.lat ? D.depot : null, usual: runs.map((r) => r.route).sort() }), date: PLAN.date, deadline: dl().at, madeAt: new Date().toISOString() };
      } catch (e) { PLAN.error = e.message; }
      PLAN.loading = false; paint();
    };
    const send = async (note) => {
      try {
        if (app.store.saveDayPlan) await app.store.saveDayPlan(PLAN.date, PLAN.plan, note);
        else { const { error } = await sb.from('day_plans').upsert({ delivery_date: PLAN.date, plan: PLAN.plan, note: note || null, updated_by: app.me.name, updated_at: new Date().toISOString() }); if (error) throw error; }
        toast('Plan sent. Stan will show it to everyone in it the next time they open the app.'); PLAN.plan = null; PLAN.saved = undefined; loadSaved();
      } catch (e) { toast(`Didn’t send: ${e.message}`); }
    };
    const crewCard = (c, deadline) => {
      const lateBy = Date.now() > c.depotAt && Date.now() < deadline ? Math.round((Date.now() + c.shiftMin * 60e3 - deadline) / 60e3) : 0;
      return h('div', { class: `dp-card ${lateBy > 0 ? 'late' : ''}` },
        h('h3', null, `${c.driver}${c.helpers.length ? ` with ${c.helpers.join(' and ')}` : ', on their own'}`),
        h('div', { class: 'dp-big' }, h('div', null, h('span', null, 'At the depot by'), h('b', null, clockTime(c.depotAt))), h('div', null, h('span', null, 'First paper by'), h('b', null, clockTime(c.firstPaperAt))), h('div', null, h('span', null, 'All done by'), h('b', null, clockTime(c.finishAt)))),
        h('table', null, h('tbody', null, c.runs.map((r) => h('tr', null, h('td', null, h('b', null, r.name), r.during ? ` (on the way through ${r.duringName})` : ''), h('td', null, r.during ? '' : `${clockTime(r.startAt)} to ${clockTime(r.finishAt)} · ${r.minutes} min${r.own ? '' : ' (all drivers)'}`))))),
        h('p', { class: 'small muted' }, `${duration(c.shiftMin)} in all: ${c.prepMin} min at the depot, ${c.roadMin} min delivering, ${c.travelMin} min between runs.`),
        lateBy > 0 ? h('p', { class: 'dp-late' }, `It’s past the depot time. Starting now, the last paper lands about ${clockTime(Date.now() + c.shiftMin * 60e3)}: ${lateBy} minutes after the deadline.`) : null);
    };
    function paint() {
      const date = h('select', { 'aria-label': 'Delivery day', onchange: (e) => { PLAN.date = e.target.value; PLAN.plan = null; PLAN.saved = undefined; PLAN.crews = null; render(); } }, dates.filter((d) => d >= today).concat(dates.includes(PLAN.date) || PLAN.date >= today ? [] : [PLAN.date]).map((d) => h('option', { value: d, selected: d === PLAN.date || null }, new Intl.DateTimeFormat('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`)))));
      const rows = drivers.map((n) => { const c = PLAN.crews[n];
        return h('div', { class: 'dp-crew' }, h('label', { class: 'dp-name' }, h('input', { type: 'checkbox', checked: c.on || null, onchange: (e) => { c.on = e.target.checked; if (!c.on) c.helpers = []; PLAN.plan = null; paint(); } }), n),
          c.on ? helpers.map((x) => h('label', null, h('input', { type: 'checkbox', checked: c.helpers.includes(x) || null, onchange: (e) => { for (const k of drivers) PLAN.crews[k].helpers = PLAN.crews[k].helpers.filter((y) => y !== x); if (e.target.checked) c.helpers.push(x); PLAN.plan = null; paint(); } }), `with ${x}`)) : h('span', { class: 'small muted' }, 'not driving')); });
      const shown = PLAN.plan || PLAN.saved?.plan; const note = h('textarea', { rows: 2, placeholder: 'A note for the crew (optional), e.g. “Papers are due at the depot at 2:15”', style: 'width:100%;max-width:720px' }, PLAN.note);
      note.addEventListener('input', () => { PLAN.note = note.value; });
      box.replaceChildren(...[
        h('p', { class: 'muted', style: 'max-width:760px' }, 'Tick who is driving and who is helping them. Stan works out who takes which runs, the order, and when to be at the depot, from how long each run has really taken over the last four weeks.'),
        h('div', { class: 'ins-dates' }, h('label', null, 'Delivery day ', date), h('span', { class: 'small muted' }, `${dayRuns().length} run${dayRuns().length === 1 ? '' : 's'} loaded · deadline ${clockTime(dl().at)}`)),
        h('div', { class: 'dp-crews' }, rows, drivers.length ? null : h('p', { class: 'muted' }, 'Nobody is marked as a driver yet: see People.')),
        h('button', { class: 'btn primary', onclick: work, disabled: PLAN.loading || null }, PLAN.loading ? 'Working it out…' : 'Work out the plan'),
        PLAN.error ? h('div', { class: 'banner bad' }, `Couldn’t work it out: ${PLAN.error}`) : null,
        PLAN.saved && !PLAN.plan ? h('div', { class: 'banner dp-sent' }, `This plan was sent to the phones by ${PLAN.saved.updated_by || 'someone'} at ${clockTime(PLAN.saved.updated_at)} on ${new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', timeZone: 'Pacific/Auckland' }).format(new Date(PLAN.saved.updated_at))}.${PLAN.saved.note ? ` Note: ${PLAN.saved.note}` : ''}`) : null,
        PLAN.plan ? h('div', { class: 'banner dp-sent' }, 'Not sent yet. Check it, then send it to the phones.') : null,
        shown ? h('div', { class: 'dp-plan' }, shown.crews.map((c) => crewCard(c, shown.deadline))) : null,
        shown ? h('ul', { class: 'dp-assume' }, (shown.assumptions || []).map((a) => h('li', null, a))) : null,
        PLAN.plan ? note : null,
        shown ? h('div', { class: 'dz-polgrid' }, PLAN.plan ? h('button', { class: 'btn primary', onclick: () => send(PLAN.note.trim()) }, PLAN.saved ? 'Send the new plan to the phones' : 'Send to the phones') : null,
          h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(planText(shown, { date: shown.date || PLAN.date, deadline: shown.deadline })); toast('Copied.'); } catch { toast('Couldn’t copy.'); } } }, 'Copy as a message')) : null,
      ].filter(Boolean));
    }
    paint(); if (PLAN.saved === undefined) loadSaved();
    return box;
  }
  function renderInsights() {
    const today = nzDate(Date.now()); const back = (n) => nzDate(Date.now() - n * 864e5);
    if (!INS.from) { INS.from = back(28); INS.to = today; }
    const box = h('div', { class: 'ins' });
    const from = h('input', { type: 'date', value: INS.from, max: today, 'aria-label': 'From' }); const to = h('input', { type: 'date', value: INS.to, max: today, 'aria-label': 'To' });
    const run = async () => {
      if (!from.value || !to.value || from.value > to.value) return toast('Pick a From date on or before the To date.');
      INS.from = from.value; INS.to = to.value; INS.loading = true; INS.error = null; paint();
      try { const rows = await loadInsights(INS.from, INS.to); INS.rows = rows; INS.km = null; loadKm(); INS.data = buildInsights({ ...rows, deadlines: D.deadlines || DEFAULT_DEADLINES, from: INS.from, to: INS.to }); }
      catch (e) { INS.error = e.message; }
      INS.loading = false; paint();
    };
    // ---- Kilometres per run (decision 0045): from where the ticks were made, in the order delivered ----
    const loadKm = async () => {
      try { const ids = INS.rows.runs.map((r) => r.id); const all = [];
        for (let i = 0; i < ids.length; i += 100) { const { data, error } = await sb.from('run_km').select('run_id, line_km, road_km, points').in('run_id', ids.slice(i, i + 100)); if (error) throw error; all.push(...(data || [])); }
        INS.km = new Map(all.map((r) => [r.run_id, r])); } catch { INS.km = new Map(); }
      paint();
    };
    const kmTodo = () => { const withTicks = new Set(INS.rows.ticks.filter((t) => t.done && t.lat != null).map((t) => t.run_id)); return INS.rows.runs.filter((r) => withTicks.has(r.id) && INS.km.get(r.id)?.road_km == null); };
    const workOutKm = async () => {
      INS.kmStop = false; INS.kmError = null; const todo = kmTodo(); let n = 0; let last = 0;
      const through = async (pts) => { const wait = 1700 - (Date.now() - last); if (wait > 0) await new Promise((ok) => setTimeout(ok, wait)); last = Date.now();   // the mapping service allows 40 requests a minute
        const { data, error } = await sb.functions.invoke('route', { body: { through: pts.map((p) => [p.lng, p.lat]) } }); return error || typeof data?.metres !== 'number' ? null : { metres: data.metres, line: data.line || null }; };
      for (const r of todo) {
        if (INS.kmStop) break;
        INS.kmBusy = `${++n} of ${todo.length}`; paint();
        try {
          const d = await runDistance(INS.rows.ticks.filter((t) => t.run_id === r.id), through); if (!d) continue;
          const row = { run_id: r.id, ...d, computed_by: app.me.name, computed_at: new Date().toISOString() };
          const { error } = await sb.from('run_km').upsert(row); if (error) throw error;
          INS.km.set(r.id, { ...row, trace: undefined });
        } catch (e) { INS.kmError = `Stopped: ${e.message}`; break; }
      }
      INS.kmBusy = null; paint();
    };
    // Stan's report card (decisions 0064, 0066): how well the time model predicts past mornings from the other days.
    // Worked out here from the ticks already loaded; the headline is kept in settings so progress can be followed.
    const predictorBlock = () => {
      if (!INS.rows) return null;
      if (INS.pred?.rows === INS.rows) return INS.pred.box;   // worked out once per load, not on every redraw
      const box = h('div', { class: 'dz-card predictor' }, h('h3', null, 'Stan’s report card'), h('p', { class: 'muted' }, 'Working it out…'));
      Promise.all([import('./timemodel.js'), import('./village.js')]).then(([tm, vg]) => {
        const r = tm.reportCard(runMornings(INS.rows.runs, INS.rows.ticks, D.deadlines || DEFAULT_DEADLINES), { skip: (route) => !!vg.layoutFor(route) });
        const run = (route) => `Run ${+(/(\d+)$/.exec(route)?.[1] || 0) || route}`;
        if (!r.n) { box.replaceChildren(h('h3', null, 'Stan’s report card'), h('p', { class: 'muted' }, 'Not enough ticked mornings in these dates to test Stan’s time predictions.')); return; }
        box.replaceChildren(
          h('h3', null, 'Stan’s report card'),
          h('p', null, 'Before Stan suggests a quicker order, he has to show he can predict how long a morning takes. Each run-morning in these dates is predicted from the ', h('b', null, 'other'), ' days and compared with what it really took.'),
          h('p', null, h('b', null, 'The test that counts: the driving. '), `An order can only change the drives between stops (legs of ${tm.DRIVE_M} m or more), not the time at each letterbox${r.drive.minutes != null ? `. That is about ${r.drive.minutes} minutes of a run` : ''}.`),
          h('div', { class: 'ins-sum' },
            h('div', null, h('b', null, r.drive.n), ' run-mornings tested'),
            h('div', { class: r.pass ? '' : 'act' }, h('b', null, r.drive.typicalMissPct == null ? 'n/a' : `${r.drive.typicalMissPct}%`), ` typical miss on the driving (target ${tm.TARGET_PCT}%)`),
            h('div', null, h('b', null, `${r.drive.within5}%`), ' within 5%'), h('div', null, h('b', null, `${r.drive.within10}%`), ' within 10%'), h('div', null, h('b', null, `${r.drive.within20}%`), ' within 20%')),
          h('p', { class: 'small muted' }, `The whole morning, for comparison: typical miss ${r.typicalMissPct}%, ${r.within5}% within 5%, ${r.within10}% within 10%, ${r.within20}% within 20%.`),
          h('p', { class: r.pass ? 'ok-text' : 'warn-text', style: 'font-weight:700' }, r.pass ? 'Good enough: Stan’s predictions can be trusted for comparing orders.' : `Not good enough yet${r.n < tm.MIN_MORNINGS ? ` (needs at least ${tm.MIN_MORNINGS} mornings)` : ''}. Stan is not suggesting any change of order.`),
          h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' }, h('thead', null, h('tr', null, h('th', null, 'Run'), h('th', null, 'Mornings'), h('th', null, 'Typical miss'))),
            h('tbody', null, r.byRun.map((b) => h('tr', null, h('td', null, h('b', null, run(b.route))), h('td', null, String(b.n)), h('td', null, `${b.typicalMissPct}%`)))))),
          h('details', null, h('summary', null, 'Every morning tested'), h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' }, h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', null, 'Run'), h('th', null, 'Crew'), h('th', null, 'Took'), h('th', null, 'Predicted'), h('th', null, 'Out by'), h('th', null, 'Driving'), h('th', null, 'Driving out by'), h('th', null, 'Legs seen before'))),
            h('tbody', null, r.rows.map((x) => h('tr', null, h('td', null, x.date.slice(5)), h('td', null, run(x.route)), h('td', null, x.kind), h('td', null, `${x.actualMin} min`), h('td', null, `${x.predictedMin} min`), h('td', null, `${x.errPct > 0 ? '+' : ''}${x.errPct}%`), h('td', null, x.driveMin == null ? '' : `${x.driveMin} min`), h('td', null, x.driveErrPct == null ? '' : `${x.driveErrPct > 0 ? '+' : ''}${x.driveErrPct}%`), h('td', null, `${x.coverage}%`))))))),
          h('p', { class: 'small muted' }, 'A leg is the time from one tick to the next in the same car. Its cost is what it usually took on other mornings, or its distance if it hasn’t been driven that way; the total is scaled by how that crew usually compares. Run 8 is left out: its order is fixed by the buildings.'));
        const head = { at: new Date().toISOString(), from: INS.from, to: INS.to, n: r.n, typicalMissPct: r.typicalMissPct, biasPct: r.biasPct, within5: r.within5, within10: r.within10, within20: r.within20, byRun: r.byRun, drive: r.drive, pass: r.pass };
        app.store.setSetting('predictor_report', head, by()).catch(() => {});
      }).catch((e) => box.replaceChildren(h('h3', null, 'Stan’s report card'), h('p', { class: 'bad' }, `Couldn’t work it out: ${e.message}`)));
      INS.pred = { rows: INS.rows, box };
      return box;
    };
    // Time between stops, the same legs by two drivers each on their own (decision 0068). Dispatch board only: facts, not scores.
    const stopTimesBlock = () => {
      if (!INS.rows) return null;
      if (INS.stops?.rows === INS.rows) return INS.stops.box;
      const box = h('div', { class: 'dz-card predictor' }, h('h3', null, 'Time between stops'), h('p', { class: 'muted' }, 'Working it out…'));
      Promise.all([import('./timemodel.js'), import('./village.js')]).then(([tm, vg]) => {
        const res = tm.stopTimes(runMornings(INS.rows.runs, INS.rows.ticks, D.deadlines || DEFAULT_DEADLINES), { skip: (route) => !!vg.layoutFor(route) });
        const run = (route) => `Run ${+(/(\d+)$/.exec(route)?.[1] || 0) || route}`; const tc = (s) => String(s).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        const cBy = new Map(); for (const c of INS.rows.complaints || []) { const k = `${c.route}|${c.street}`; cBy.set(k, (cBy.get(k) || 0) + 1); }
        const secs = (s) => (s >= 90 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
        const intro = h('p', null, 'The same stop-to-stop legs, driven by two people each on their own, set side by side. Because it is the same piece of road for both, the order of the run and a slow day don’t come into it. ', h('b', null, 'It shows where two ways of delivering differ, not which is better'), ': a paper walked to the door takes longer than one thrown, and may be why a street has no complaints.');
        if (!res.length) { box.replaceChildren(h('h3', null, 'Time between stops'), intro, h('p', { class: 'muted' }, `Nothing to compare in these dates yet. It needs two drivers who have each done the same run alone at least ${tm.MIN_SOLO} times.`)); return; }
        box.replaceChildren(h('h3', null, 'Time between stops'), intro, ...res.map((x) => { const d = Math.round((x.bMin - x.aMin) * 10) / 10; const slow = d >= 0 ? x.b : x.a; const few = Math.min(x.aMornings, x.bMornings) < 4;
          return h('div', null,
            h('h4', { style: 'margin:14px 0 4px' }, `${run(x.route)}: ${x.a} and ${x.b}`),
            h('p', null, `Over the ${x.legs} legs both have driven alone, ${x.a} usually takes ${x.aMin} minutes and ${x.b} ${x.bMin}`, Math.abs(d) < 0.5 ? ': no real difference.' : h('span', null, ': ', h('b', null, `${slow} about ${Math.abs(d)} minutes longer`), '.'), ` (${x.a}: ${x.aMornings} mornings alone, ${x.b}: ${x.bMornings}.)`),
            few ? h('p', { class: 'warn-text small' }, 'Only a few mornings alone so far: treat this as a pointer, not a finding.') : null,
            h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' }, h('thead', null, h('tr', null, h('th', null, 'Street'), h('th', null, 'Legs'), h('th', null, x.a), h('th', null, x.b), h('th', null, 'Difference'), h('th', null, 'Complaints'))),
              h('tbody', null, x.streets.slice(0, 8).map((s) => h('tr', null, h('td', null, h('b', null, tc(s.street))), h('td', null, String(s.legs)), h('td', null, secs(s.aSecs)), h('td', null, secs(s.bSecs)), h('td', null, s.diff === 0 ? 'none' : `${s.diff > 0 ? x.b : x.a} +${secs(Math.abs(s.diff))}`), h('td', null, String(cBy.get(`${x.route}|${s.street}`) || 0))))))),
            x.streets.length > 8 ? h('p', { class: 'small muted' }, `The ${x.streets.length - 8} other streets differ by less.`) : null); }),
          h('p', { class: 'small muted' }, 'What to do with it: on the streets at the top, ask what each of you does differently there, and look at the complaints beside it before changing anything. Mornings with a helper are left out, and so are stops of more than ten minutes.'));
      }).catch((e) => box.replaceChildren(h('h3', null, 'Time between stops'), h('p', { class: 'bad' }, `Couldn’t work it out: ${e.message}`)));
      INS.stops = { rows: INS.rows, box };
      return box;
    };
    const kmBlock = () => {
      if (!INS.rows || !INS.km) return null;
      const med = (xs) => { const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
      const by = new Map(); for (const r of INS.rows.runs) { const k = INS.km.get(r.id); if (!k) continue; if (!by.has(r.route)) by.set(r.route, []); by.get(r.route).push(k); }
      const todo = kmTodo(); const f = (x) => (Math.round(x * 10) / 10).toFixed(1);
      const rows = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([route, ks]) => { const road = ks.filter((k) => k.road_km != null).map((k) => Number(k.road_km)); const use = road.length ? road : ks.map((k) => Number(k.line_km) * ROAD_FACTOR);
        return h('tr', null, h('td', null, h('b', null, `Run ${+(/(\d+)$/.exec(route)?.[1] || 0) || route}`)), h('td', null, `${road.length ? '' : '~'}${f(med(use))} km`), h('td', null, `${f(Math.min(...use))} to ${f(Math.max(...use))} km`), h('td', null, `${road.length} of ${ks.length} along the roads`)); });
      return h('div', { class: 'dz-card' }, h('h3', { style: 'margin:0 0 4px' }, 'Kilometres per run'),
        h('p', { class: 'small muted', style: 'margin:0 0 8px;max-width:760px' }, 'Worked out from where each tick was made, in the order the stops were actually delivered. The middle morning is the one to watch: if a change of order really is shorter, it comes down. A figure with ~ in front is a rough one (straight lines, stretched), until it has been worked out along the roads.'),
        rows.length ? h('table', { class: 'dz-table dz-fit' }, h('thead', null, h('tr', null, ['Run', 'Middle morning', 'Shortest to longest', 'Worked out'].map((c) => h('th', null, c)))), h('tbody', null, rows)) : h('p', { class: 'muted' }, 'No kilometres worked out for these dates yet.'),
        INS.kmError ? h('p', { class: 'bad' }, INS.kmError) : null,
        h('div', { class: 'dz-polgrid', style: 'margin-top:8px' },
          todo.length && !INS.kmBusy ? h('button', { class: 'btn primary', onclick: workOutKm }, `Work out ${todo.length} run${todo.length === 1 ? '' : 's'} along the roads`) : null,
          INS.kmBusy ? h('button', { class: 'btn', onclick: () => { INS.kmStop = true; } }, 'Stop after this one') : null,
          INS.kmBusy ? h('span', { class: 'small muted' }, `Working out run ${INS.kmBusy}. It asks the map a few times a run, so a month takes several minutes. Keep this page open.`) : null,
          !todo.length && rows.length ? h('span', { class: 'small muted' }, 'Every run in these dates has been worked out along the roads.') : null));
    };
    const LEVEL = { act: ['Do something', 'act'], watch: ['Keep an eye on', 'watch'], good: ['Working well', 'good'], info: ['For interest', 'info'] };
    const asText = (I) => [`Send The Boy insights, ${I.from} to ${I.to} (${I.days} delivery days, ${I.delivered} deliveries)${I.early ? ' - early findings' : ''}`,
      `DIFOT ${I.metrics.difot.pct ?? '-'}% (${I.metrics.difot.n} of ${I.metrics.difot.of} stops) | Complaints ${I.metrics.complaints.pct ?? '-'}% (${I.metrics.complaints.n} for ${I.metrics.complaints.of} deliveries) | Runs finished on time ${I.metrics.onTime.pct ?? '-'}% (${I.metrics.onTime.n} of ${I.metrics.onTime.of})`,
      ...I.metrics.perRun.filter((r) => r.mornings).map((r) => `${r.name}: ${duration(r.avgMin)} average, ${r.perDeliverySec} s per delivery, usually done by ${r.usualFinish}, on time ${r.onTime} of ${r.mornings}`), '',
      ...I.findings.filter((f) => f.level !== 'info').map((f) => `${LEVEL[f.level][0].toUpperCase()}: ${f.title}\n${f.text}${f.suggestion ? `\nSuggestion: ${f.suggestion}` : ''}`)].join('\n\n');
    const card = (f) => h('article', { class: `ins-card ins-${f.level}` },
      h('div', { class: 'ins-head' }, h('span', { class: `ins-badge ${LEVEL[f.level][1]}` }, LEVEL[f.level][0]), h('span', { class: 'small muted' }, f.area)),
      h('h3', null, f.title), h('p', null, f.text),
      f.suggestion ? h('p', { class: 'ins-sug' }, h('b', null, 'Suggestion: '), f.suggestion) : null,
      f.rows?.length ? h('div', { class: 'dz-scroll' }, h('table', { class: 'dz-table dz-fit' }, h('thead', null, h('tr', null, f.cols.map((c) => h('th', null, c)))), h('tbody', null, f.rows.map((r) => h('tr', null, r.map((c) => h('td', null, String(c)))))))) : null,
      h('p', { class: 'small muted ins-basis' }, `Based on: ${f.basis}`));
    // The three headline numbers (Mike, 17 Nov 2026): DIFOT, complaints, average completion time per run.
    const banner = (I) => { const M = I.metrics; const n = (x) => x.toLocaleString('en-NZ'); const dlw = (D.deadlines || DEFAULT_DEADLINES);
      const tile = (cls, label, big, sub, note) => h('div', { class: `ins-kpi ${cls}` }, h('div', { class: 'ins-kpi-l' }, label), h('div', { class: 'ins-kpi-n' }, big), h('div', { class: 'ins-kpi-s' }, sub), note ? h('div', { class: 'small muted' }, note) : null);
      const d = M.difot; const c = M.complaints; const o = M.onTime;
      const missed = [d.late ? `${n(d.late)} after the deadline` : '', d.short ? `${n(d.short)} short` : '', d.futile ? `${n(d.futile)} couldn’t deliver` : '', d.notRecorded ? `${n(d.notRecorded)} not ticked` : ''].filter(Boolean).join(', ');
      const fact = (k, v, cls = '') => (v == null || v === '' ? null : h('div', { class: `ins-fact ${cls}` }, h('span', null, k), h('b', null, v)));
      const perDel = (s) => (s == null ? null : s >= 90 ? `${+(s / 60).toFixed(1)} min` : `${s} s`);
      const runTile = (r) => h('div', { class: `ins-run ${r.mornings ? (r.onTime === r.mornings ? 'good' : r.onTime >= r.mornings / 2 ? 'watch' : 'act') : ''}` },
        h('div', { class: 'ins-kpi-l' }, r.name, r.bulk ? h('span', { class: 'ins-tag' }, 'one drop') : null),
        h('div', { class: 'ins-run-n' }, r.mornings ? duration(r.avgMin) : 'Paper only'), h('div', { class: 'small muted' }, r.mornings ? 'average completion time' : 'no times recorded'),
        r.mornings ? h('div', { class: 'ins-facts' },
          fact('Per delivery', perDel(r.perDeliverySec)), fact('Stops', r.stops), fact('Usually starts', r.usualStart), fact('Usually done by', r.usualFinish),
          fact('On time', `${r.onTime} of ${r.mornings} mornings`, r.onTime === r.mornings ? 'good' : 'bad'), fact('DIFOT', r.difotPct == null ? null : `${r.difotPct}%`),
          r.mornings > 1 ? fact('Quickest / slowest', `${duration(r.fastestMin)} / ${duration(r.slowestMin)}`) : null, fact('Complaints', r.complaints), r.paperMornings ? fact('On paper', `${r.paperMornings} morning${r.paperMornings === 1 ? '' : 's'}`) : null) : h('div', { class: 'ins-facts' }, fact('On paper', `${r.paperMornings} morning${r.paperMornings === 1 ? '' : 's'}`), fact('Complaints', r.complaints)));
      return h('div', { class: 'ins-banner' }, h('div', { class: 'ins-kpis' },
        tile(d.pct == null ? '' : d.pct >= 95 ? 'good' : d.pct >= 85 ? 'watch' : 'act', 'DIFOT', d.pct == null ? '–' : `${d.pct}%`, d.of ? `${n(d.n)} of ${n(d.of)} stops` : 'No timed stops in these dates',
          `Delivered in full by the ${String(dlw.weekday).replace(/^0/, '')} am (weekend ${String(dlw.weekend).replace(/^0/, '')} am) deadline.${missed ? ` Missed: ${missed}.` : ''}${d.paper ? ` ${n(d.paper)} more were signed off on paper, with no times, so they’re not in this figure.` : ''}`),
        tile(c.pct == null ? '' : c.pct <= 0.2 ? 'good' : c.pct <= 0.5 ? 'watch' : 'act', 'Complaints', c.pct == null ? '–' : `${c.pct}%`, `${n(c.n)} for ${n(c.of)} deliveries`, 'Complaints about or received in these dates, against every delivery recorded (app and paper).'),
        tile(o.pct == null ? '' : o.pct >= 95 ? 'good' : o.pct >= 80 ? 'watch' : 'act', 'Runs finished on time', o.pct == null ? '–' : `${o.pct}%`, o.of ? `${n(o.n)} of ${n(o.of)} runs` : 'No timed runs in these dates', 'A run is on time when its last stop is ticked by the deadline.')),
        M.perRun.length ? h('div', { class: 'ins-runs-h' }, 'Run by run', h('span', { class: 'small muted' }, ' · completion time is first tick to last tick of the morning, averaged; “per delivery” is that time shared across the stops')) : null,
        M.perRun.length ? h('div', { class: 'ins-runs' }, M.perRun.map(runTile)) : null);
    };
    function paint() {
      const I = INS.data;
      box.replaceChildren(...[
        h('div', { class: 'dz-card' }, h('p', { class: 'small muted', style: 'margin:0 0 8px' }, 'What the ticks, photos and complaints we’ve collected are telling us, each with a suggestion. The sums are fixed: the same dates always give the same findings.'),
          h('div', { class: 'ins-dates' }, h('label', null, 'From ', from), h('label', null, 'To ', to), h('button', { class: 'btn primary', onclick: run, disabled: INS.loading || null }, INS.loading ? 'Working it out…' : I ? 'Update' : 'Show insights'),
            I ? h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(asText(I)); toast('Copied. Paste it into a message.'); } catch { toast('Couldn’t copy on this device.'); } } }, 'Copy as text') : null)),
        INS.error ? h('p', { class: 'bad' }, `Couldn’t work it out: ${INS.error}`) : null,
        !I ? null : banner(I),
        !I ? null : kmBlock(),
        !I ? null : predictorBlock(),
        !I ? null : stopTimesBlock(),
        !I ? null : h('div', { class: 'ins-sum' }, h('div', null, h('b', null, I.days), ` delivery day${I.days === 1 ? '' : 's'}`), h('div', null, h('b', null, I.delivered.toLocaleString('en-NZ')), ' deliveries'),
          h('div', { class: 'act' }, h('b', null, I.counts.act), ' to do something about'), h('div', { class: 'watch' }, h('b', null, I.counts.watch), ' to keep an eye on'), h('div', { class: 'good' }, h('b', null, I.counts.good), ' working well')),
        I?.early ? h('p', { class: 'ins-early' }, h('b', null, 'Early findings. '), `There are ${I.days} delivery days in these dates. Patterns firm up after about ${EARLY_DAYS}; until then treat these as pointers, not verdicts.`) : null,
        I && !I.findings.length ? stanSays('Nothing to report for these dates yet. I need a few mornings of ticks first.', { pose: 'idle' }) : null,
        ...(I ? I.findings.map(card) : [])].filter(Boolean));
    }
    paint();
    if (!INS.data && !INS.loading) run();
    return box;
  }

  async function loadReport(from, to) {
    if (app.store.loadReport) return app.store.loadReport(from, to, D.register); // (test page)
    // NZ days -> UTC window, a day wider each side; the report itself keeps only what falls in the dates.
    const lo = new Date(Date.parse(`${from}T00:00:00Z`) - 36 * 3600e3).toISOString(); const hi = new Date(Date.parse(`${to}T00:00:00Z`) + 36 * 3600e3).toISOString();
    const photos = must(await sb.from('photos').select('*').gte('taken_at', lo).lte('taken_at', hi).order('taken_at').limit(2000));
    const complaints = D.register.filter((c) => { const d = c.happened_on || c.reported_on; return (d >= from && d <= to) || (c.reported_on >= from && c.reported_on <= to); });
    // Photos for complaint days outside the window (a complaint reported now about an earlier day).
    const keys = [...new Set([...complaints.map((c) => c.address_key), ...photos.map((p) => p.address_key)])];
    const early = complaints.map((c) => c.happened_on).filter((d) => d && d < from).sort()[0];
    if (early) { const more = must(await sb.from('photos').select('*').in('address_key', complaints.map((c) => c.address_key)).gte('taken_at', `${early}T00:00:00Z`).lt('taken_at', lo).limit(500)); photos.push(...more); }
    const ticks = [];
    const tlo = early ? new Date(Date.parse(`${early}T00:00:00Z`) - 36 * 3600e3).toISOString() : lo;
    for (let i = 0; i < keys.length; i += 100) ticks.push(...must(await sb.from('tap_events').select('address_key, done, outcome, reason, method, user_name, device_time, lat, lng, accuracy_m').in('address_key', keys.slice(i, i + 100)).gte('device_time', tlo).lte('device_time', hi).order('device_time').limit(5000)));
    if (photos.length) {
      const { data } = await sb.storage.from('delivery-photos').createSignedUrls(photos.map((p) => p.path), 3600);
      (data || []).forEach((u, i) => { photos[i].url = u.signedUrl || null; });
    }
    return { complaints, photos, ticks };
  }
  function showReport(R) {
    const day = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
    const dayShort = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
    const time = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const made = new Date(); const ref = reportRef(R.from, R.to, made); const S = R.summary;
    const mapLink = (d) => (d?.lat != null && d.method !== 'paper' ? h('a', { href: `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}`, target: '_blank', rel: 'noopener' }, 'view on map') : null);
    const pics = (ps, cls = '') => (ps.length ? h('div', { class: `rp-photos ${cls}` }, ps.map((p) => h('figure', null,
      p.url ? h('img', { src: p.url, alt: `Photo at the address, ${time(p.taken_at)}` }) : h('div', { class: 'rp-nophoto' }, 'Photo not available'),
      h('figcaption', null, `${p.added_later ? 'Photo added later,' : 'Photo taken'} ${dayShort(nzDate(p.taken_at))}, ${time(p.taken_at)}${p.user_name ? `, by ${p.user_name}` : ''}`)))) : null);
    const row = (k, ...v) => h('tr', null, h('th', { scope: 'row' }, k), h('td', null, ...v));
    // Our record for one morning, as a table of facts: the time first and largest.
    const facts = (d) => {
      if (!d || d.outcome === 'undone') return h('p', null, 'Nothing was recorded in the app at this address that morning.');
      const paper = d.method === 'paper';
      return h('table', { class: 'rp-facts' }, h('tbody', null,
        paper ? row('Time', 'Not recorded for each stop (paper run sheet)') : row(d.outcome === 'futile' ? 'Attempted' : 'Delivered', h('b', { class: 'rp-time' }, time(d.at))),
        d.outcome === 'futile' ? row('Outcome', `Could not deliver${d.reason ? `: ${d.reason}` : ''}`) : d.outcome === 'short' ? row('Outcome', 'Delivered short') : null,
        d.method === 'photo' ? null : row('By', d.by || 'Not recorded'),
        row('How recorded', paper ? 'Run done from the paper run sheet and signed off afterwards' : d.method === 'photo' ? `From the delivery photo: the time is when the photo was taken. Added to the run afterwards${d.by ? ` by ${d.by}` : ''}` : d.method === 'correction' ? `Corrected record. ${d.note || 'Entered afterwards by a dispatcher; the original records are kept.'}` : 'Driver tapped the stop in the app at the address'),
        paper ? null : row('Position', d.lat != null ? [`${d.method === 'photo' ? 'From the photo' : 'Recorded at the address'}${d.accuracy_m ? `, accurate to about ${Math.round(d.accuracy_m)} m` : ''} · `, mapLink(d), h('span', { class: 'rp-coords' }, ` (${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)})`)] : 'No GPS fix at that moment')));
    };
    const sinceLine = (x) => { const d = x.delivery; const ok = d && d.outcome !== 'undone';
      return h('li', null, h('b', null, dayShort(x.day)), ': ', !ok ? 'photo only' : d.method === 'paper' ? `delivered${d.by ? ` by ${d.by}` : ''} (paper run sheet)` : d.method === 'photo' ? `delivered ${time(d.at)} (time from the photo)` : `${d.outcome === 'futile' ? 'could not deliver' : 'delivered'} ${time(d.at)}${d.by ? ` by ${d.by}` : ''}${d.lat != null ? ', GPS recorded' : ''}`, x.photos.length ? `, ${x.photos.length} photo${x.photos.length === 1 ? '' : 's'}` : ''); };
    const aboutText = (c) => (c.dayFrom === 'publisher' ? day(c.day) : c.dayFrom === 'reference' ? `${day(c.day)} (read from the publisher’s reference)` : 'Not stated by the publisher');
    const complaint = (c) => h('article', { class: `rp-item rs-${c.record.state}` },
      h('h3', null, h('span', { class: 'rp-no' }, `${c.no} of ${R.complaints.length}`), c.address, h('span', { class: 'rp-meta' }, shortRoute(c.route))),
      h('section', { class: 'rp-claim' }, h('h4', null, 'Complaint received ', h('span', null, '(as reported by the publisher, not verified)')),
        h('table', { class: 'rp-facts' }, h('tbody', null,
          row('Reported as', `${c.kindText}${c.publication ? ` · ${c.publication}` : ''}`), row('For delivery on', aboutText(c)), row('On our run sheet', day(c.reported)),
          c.description ? row('Publisher’s wording', c.description) : null, c.repeat ? row('History', c.repeat) : null))),
      h('section', { class: 'rp-record' }, h('h4', null, c.day ? `Our delivery record for ${day(c.day)}` : 'Our delivery record', h('span', { class: `rp-badge ${c.record.good ? 'good' : 'none'}` }, c.record.label)),
        c.day ? facts(c.delivery) : h('p', null, 'The publisher gave no date, so this complaint can’t be matched to one morning. Every delivery we have on record at this address in these dates is listed below.'),
        pics(c.photos)),
      c.since.length ? h('section', { class: 'rp-since' }, h('h4', null, c.day ? 'Deliveries since' : 'Deliveries on record in these dates'), h('ul', null, c.since.map(sinceLine)), pics(c.since.flatMap((x) => x.photos), 'small')) : null,
      h('section', { class: 'rp-status' }, h('p', null, h('b', null, 'Status: '), c.statusText),
        c.notes ? h('p', null, h('b', null, 'Our response: '), c.notes, ' ', h('button', { class: 'rp-screen rp-leave', onclick: (e) => e.currentTarget.parentElement.remove() }, 'Leave this note out')) : null));
    const page = h('div', { class: 'stb-report', role: 'document' },
      h('div', { class: 'rp-bar' }, h('button', { class: 'btn primary', onclick: () => { const t = document.title; document.title = reportFileName(R.from, R.to); const back = () => { document.title = t; window.removeEventListener('afterprint', back); }; window.addEventListener('afterprint', back); window.print(); } }, 'Save as PDF / Print'), h('button', { class: 'btn', onclick: () => page.remove() }, 'Close'),
        h('span', { class: 'small muted' }, 'In the print box choose “Save as PDF”, paper size A4. Wait for the photos to show first. Read any “Our response” notes: they go to the run owner unless you leave them out.')),
      h('style', null, `@page { @bottom-left { content: "Zalense delivery report · ${ref}"; font: 9pt system-ui, sans-serif; color: #555; } }`),
      h('header', null, h('div', { class: 'rp-brand' }, stbLogo({ height: 58, ink: '#17130a', outline: true })), h('h1', null, 'Delivery report'), h('p', null, 'Zalense · NZ Herald runs HOWICK 06, 08, 10, 11, 13'),
        h('p', null, h('b', null, `${day(R.from)} to ${day(R.to)}`)), h('p', { class: 'rp-meta' }, `Prepared ${made.toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' })} by ${by()} · Reference ${ref}`)),
      h('section', { class: 'rp-summary' },
        h('div', null, h('b', null, S.complaints), ` complaint${S.complaints === 1 ? '' : 's'} received`), h('div', null, h('b', null, S.timed), ' with a timed delivery record'), h('div', null, h('b', null, S.paper), ' delivered on a paper run sheet'),
        h('div', null, h('b', null, S.noRecord), ' with no app record'), h('div', null, h('b', null, S.withPhoto), ' with a photo that morning'), h('div', null, h('b', null, S.followedUp), ' photographed since')),
      R.complaints.length ? h('table', { class: 'rp-index' }, h('thead', null, h('tr', null, ['#', 'Address', 'Run', 'Reported as', 'For', 'Our record', 'Photo', 'Status'].map((x) => h('th', null, x)))),
        h('tbody', null, R.complaints.map((c) => h('tr', null, h('td', null, c.no), h('td', null, c.address), h('td', null, shortRoute(c.route).replace(/^Run\s*/i, '')), h('td', null, `${c.kindText}${c.publication ? ` · ${c.publication}` : ''}`), h('td', null, dayShort(c.day) || 'Not stated'),
          h('td', { class: c.record.good ? 'good' : '' }, ['app', 'app_nogps', 'photo'].includes(c.record.state) ? `Delivered ${time(c.delivery.at)}` : c.record.state === 'paper' ? 'Delivered (paper sheet)' : c.record.label),
          h('td', null, c.photos.length ? 'Yes' : c.since.some((x) => x.photos.length) ? 'Since' : 'No'), h('td', null, c.statusText.split(':')[0]))))) : null,
      h('p', { class: 'rp-how' }, h('b', null, 'How to read this report. '), 'Each complaint is shown exactly as the publisher reported it, followed by our own record of that morning’s delivery. A timed record is made when the driver taps the stop in the app at the address: the phone saves the time and its GPS position at that moment.'),
      h('h2', null, 'Complaints and our delivery records'),
      R.complaints.length ? R.complaints.map(complaint) : h('p', null, 'No complaints in these dates.'),
      h('h2', { class: 'rp-newpage' }, 'Appendix: other photographed deliveries'),
      R.photographed.length ? R.photographed.map((g) => h('article', { class: 'rp-item rp-group' },
        h('h3', null, g.address, h('span', { class: 'rp-meta' }, shortRoute(g.route))), h('ul', null, g.days.map(sinceLine)), pics(g.days.flatMap((x) => x.photos), 'small'))) : h('p', null, 'No other photographed deliveries in these dates.'),
      h('footer', null, 'All times are New Zealand time. Each position was recorded once, at the delivery address, at the moment the delivery was recorded; no location is recorded at any other time. “Paper run sheet” means the run was done from the printed sheet and signed off afterwards, so there is no time or position for each stop. \u201cTime from the delivery photo\u201d means the stop couldn\u2019t be recorded in the app at the time, so the delivery time is the moment the photo was taken, read from the photo file. “Read from the publisher’s reference” means the run sheet gave no date and we took it from the day and month at the start of the publisher’s code.'));
    document.querySelectorAll('.stb-report').forEach((x) => x.remove());
    document.body.append(page); page.scrollTop = 0;
  }

  // ================= A run on the map, and Ping (decision 0026) =================
  // Pins: hollow blue = still to do, solid green = done, red = couldn't deliver. The trail joins them in
  // delivery order and turns green as it's travelled. Ping asks an on-duty driver's phone where it is.
  const PIN = { todo: { color: '#2563eb', fillColor: '#ffffff', fillOpacity: 0.9, weight: 3, radius: 6 }, done: { color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 2, radius: 6 }, failed: { color: '#991b1b', fillColor: '#ef4444', fillOpacity: 1, weight: 2, radius: 7 } };
  async function openRunMap(r) {
    const el = h('div', { class: 'dz-runmap' });
    const info = h('p', { class: 'small muted' }, 'Loading the map\u2026');
    const people = h('div', { class: 'dz-ping-row' });
    const pingMsg = h('p', { class: 'dz-ping-msg', 'aria-live': 'polite' });
    const key = h('div', { class: 'dz-shift-key small' },
      h('span', null, h('i', { class: 'pin-todo' }), 'To do'), h('span', null, h('i', { class: 'pin-done' }), 'Done'), h('span', null, h('i', { class: 'pin-failed' }), 'Couldn\u2019t deliver'),
      h('span', null, h('i', { class: 'pin-who' }), 'Driver (pinged)'));
    const asDriven = h('div', { class: 'dz-asdriven' });
    openSheet(`${shortRoute(r.route)} on the map \u00b7 ${r.delivery_date}`, info, asDriven, el, key, people, pingMsg);
    try { await leaflet(); } catch (e) { info.textContent = e.message; return; }
    const m = L.map(el, { zoomControl: true }); maps.push(m);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '\u00a9 OpenStreetMap contributors' }).addTo(m);
    const layer = L.layerGroup().addTo(m); const whoLayer = L.layerGroup().addTo(m); const traceLayer = L.layerGroup().addTo(m);
    let first = true; let data = null;
    // ---- The route as delivered (decision 0046): the road between the ticks, in the order they were made ----
    const TR = { row: undefined, show: true, busy: false, error: null };
    const drawTrace = () => {
      traceLayer.clearLayers();
      const t = TR.row?.trace; const back = t ? doubledBack(t) : null;
      if (t && TR.show) {
        for (const line of t) L.polyline(line, { color: '#f59e0b', weight: 5, opacity: 0.85 }).addTo(traceLayer);
        for (const piece of back.pieces) L.polyline(piece, { color: '#dc2626', weight: 7, opacity: 0.9 }).bindTooltip('Driven more than once').addTo(traceLayer);
      }
      const located = (data?.status || []).filter((x) => x.done && x.lat != null).length;
      asDriven.replaceChildren(...[
        t ? h('label', { class: 'dz-check' }, h('input', { type: 'checkbox', checked: TR.show || null, onchange: (e) => { TR.show = e.target.checked; drawTrace(); draw(); } }), ' Show the route as delivered') : null,
        t ? h('span', { class: 'small' }, h('i', { class: 'trace-key' }), `As delivered: ${Number(TR.row.road_km).toFixed(1)} km along the roads${t.length > 1 ? ` (${t.length} cars)` : ''}. `,
          back.metres >= 100 ? h('span', null, h('i', { class: 'trace-key back' }), `${(back.metres / 1000).toFixed(1)} km of it was over road already driven.`) : 'No road driven twice.') : null,
        !t && TR.row !== undefined && located >= 2 && !TR.busy ? h('button', { class: 'btn small', onclick: trace }, 'Trace the route as delivered') : null,
        !t && TR.row !== undefined && located < 2 ? h('span', { class: 'small muted' }, 'No route to trace yet: it needs ticks with a location.') : null,
        TR.busy ? h('span', { class: 'small muted' }, 'Asking the map for the roads between the ticks…') : null,
        TR.error ? h('span', { class: 'small bad' }, TR.error) : null,
        t ? h('span', { class: 'small muted' }, ' It is the map’s likely route between ticks, not a recording of the drive.') : null].filter(Boolean));
    };
    const loadTrace = async () => { try { const { data: row, error } = await sb.from('run_km').select('run_id, line_km, road_km, points, trace').eq('run_id', r.id).maybeSingle(); if (error) throw error; TR.row = row?.trace ? row : null; } catch { TR.row = null; } drawTrace(); };
    const trace = async () => {
      TR.busy = true; TR.error = null; drawTrace();
      try {
        let last = 0;
        const through = async (pts) => { const wait = 1700 - (Date.now() - last); if (wait > 0) await new Promise((ok) => setTimeout(ok, wait)); last = Date.now();
          const { data: d, error } = await sb.functions.invoke('route', { body: { through: pts.map((p) => [p.lng, p.lat]) } }); return error || typeof d?.metres !== 'number' ? null : { metres: d.metres, line: d.line || null }; };
        const d = await runDistance((data?.status || []).filter((x) => x.done), through);
        if (!d?.trace) throw new Error('The map couldn’t trace this one. Try again in a minute.');
        const row = { run_id: r.id, ...d, computed_by: app.me.name, computed_at: new Date().toISOString() };
        const { error } = await sb.from('run_km').upsert(row); if (error) throw error;
        TR.row = row;
      } catch (e) { TR.error = e.message; }
      TR.busy = false; drawTrace(); draw();
    };
    const draw = async () => {
      if (!el.isConnected) { clearInterval(timer); return; }
      let raw; try { raw = await app.store.loadRunMap(r.id, r.route); } catch (e) { info.textContent = `Couldn\u2019t load the run: ${e.message}`; return; }
      data = runMapData(raw); data.status = raw.status; data.lines = raw.lines;
      layer.clearLayers();
      for (const sg of data.trail) if (!(sg.travelled && TR.row?.trace && TR.show)) L.polyline([sg.from, sg.to], { color: sg.travelled ? '#16a34a' : '#2563eb', weight: sg.travelled ? 4 : 3, opacity: sg.travelled ? 0.9 : 0.55, dashArray: sg.travelled ? null : '6 7' }).addTo(layer);
      const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
      const rank = new Map([...data.stops].filter((x) => x.at && x.state !== 'todo').sort((x, y) => String(x.at).localeCompare(String(y.at))).map((x, n) => [x.key, n + 1]));
      data.stops.forEach((st, i) => L.circleMarker([st.lat, st.lng], PIN[st.state]).bindTooltip(`${i + 1}. ${st.label}${rank.has(st.key) ? ` (delivered ${nth(rank.get(st.key))})` : ''}${st.state === 'done' ? ` \u2713 ${st.by || ''} ${st.at ? fmtStamp(st.at) : ''}` : st.state === 'failed' ? ' \u26a0 not delivered' : ''}`).addTo(layer));
      const c = data.counts;
      info.textContent = `${c.done} of ${c.total} stops done${c.failed ? `, ${c.failed} not delivered` : ''}, ${c.todo} to go.${c.missing ? ` ${c.missing} not on the map yet (no position): ${data.missing.slice(0, 4).join(', ')}${c.missing > 4 ? '\u2026' : ''}.` : ''} Updates every 20 seconds.`;
      if (first && data.stops.length) { m.fitBounds(data.stops.map((x) => [x.lat, x.lng]), { padding: [24, 24], maxZoom: 18 }); first = false; } else if (first) m.setView(HOWICK, 15);
      drawPeople();
      if (TR.row === undefined && !TR.loading) { TR.loading = true; loadTrace(); } else drawTrace();
    };
    const lastTickOf = (name) => {
      const mine = (data?.status || []).filter((x) => x.done && x.user_name === name && x.lat != null).sort((a, b) => String(b.device_time).localeCompare(String(a.device_time)))[0];
      if (!mine) return null;
      const ln = data.lines.find((l) => l.line_key === mine.line_key);
      return { at: mine.device_time, lat: mine.lat, lng: mine.lng, label: ln ? `${String(ln.number).replace(/\s+/g, '')} ${String(ln.street).toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())}` : 'a stop' };
    };
    const showWho = (name, lat, lng, text) => { whoLayer.clearLayers(); L.circleMarker([lat, lng], { radius: 11, color: '#111', weight: 3, fillColor: '#fdb704', fillOpacity: 1 }).bindTooltip(text, { permanent: true, direction: 'top' }).addTo(whoLayer); m.fitBounds([...data.stops.map((x) => [x.lat, x.lng]), [lat, lng]], { padding: [30, 30], maxZoom: 18 }); };
    const drawPeople = () => {
      // Who to ping: people on duty today, else whoever has ticked on this run.
      const onDutyNow = [...new Set(D.duty.map((e) => e.user_name))].filter((n) => currentDuty(D.duty.filter((e) => e.user_name === n))?.onDuty);
      const tickers = [...new Set((data?.status || []).filter((x) => x.done && x.user_name).map((x) => x.user_name))];
      const names = [...new Set([...onDutyNow, ...tickers])];
      people.replaceChildren(names.length ? h('span', { class: 'small muted' }, 'Where are they now? ') : h('span', { class: 'small muted' }, 'Nobody is on duty or has ticked on this run yet, so there is nobody to ping.'),
        ...names.map((n) => h('button', { class: 'btn small', onclick: (e) => doPing(n, e.currentTarget) }, avatar(n, 20), ` Ping ${n}`)));
    };
    async function doPing(name, btn) {
      btn.disabled = true; pingMsg.textContent = `Pinging ${name}\u2026`;
      let ping = null;
      try {
        const id = await app.store.ping(name, by());
        for (let i = 0; i < 10 && el.isConnected; i++) { await new Promise((ok) => setTimeout(ok, 2000)); ping = await app.store.getPing(id); if (ping && ping.state !== 'asked') break; }
      } catch (e) { pingMsg.textContent = `Couldn\u2019t ping: ${e.message}`; btn.disabled = false; return; }
      const answered = ping && ping.state !== 'asked' ? ping : null;
      const last = lastTickOf(name);
      pingMsg.textContent = pingText(name, answered, last);
      if (answered?.state === 'answered') showWho(name, answered.lat, answered.lng, `${name}, now`);
      else if (last) showWho(name, last.lat, last.lng, `${name}, last tick`);
      btn.disabled = false;
    }
    await draw();
    const timer = setInterval(draw, 20000);
    setTimeout(() => m.invalidateSize(), 80);
  }

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
      }) : stanSays(h('p', { class: 'muted' }, hist ? 'No finished runs yet.' : D.runs.length ? '✓ Nothing active: every run is finished or closed.' : 'No sheets loaded yet.'), { pose: !hist && D.runs.length ? 'hop' : 'idle', size: 44 }));
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
      const crewSel = h('select', { 'aria-label': `${m.display_name}: drives or helps`, onchange: (e) => act(async () => { const { error } = await sb.from('members').update({ crew: e.target.value }).eq('email', m.email); if (error) throw error; }, `${m.display_name}: ${e.target.value === 'helper' ? 'helper' : 'driver'}.`) },
        h('option', { value: 'driver' }, 'Driver'), h('option', { value: 'helper' }, 'Helper'));
      crewSel.value = m.crew || 'driver';
      return h('tr', { class: m.active === false ? 'muted' : '' },
        h('td', null, h('b', null, m.display_name)),
        h('td', null, m.email),
        h('td', null, role),
        h('td', null, crewSel),
        h('td', { class: 'upd-cell', 'data-name': m.display_name, 'data-crew': m.crew || 'driver', 'data-role': m.role || '' }, '…'),
        h('td', null, h('div', { class: 'trn-cell small', 'data-name': m.display_name, 'data-needs': (m.crew || 'driver') === 'driver' && m.needs_training ? '1' : '' }, '…'),
          (m.crew || 'driver') === 'driver' ? h('label', { class: 'small dz-check' }, h('input', { type: 'checkbox', checked: m.needs_training ? true : null, onchange: (e) => act(async () => { const { error } = await sb.from('members').update({ needs_training: e.target.checked }).eq('email', m.email); if (error) throw error; }, e.target.checked ? `${m.display_name} does the driver course before driving.` : `${m.display_name} can drive without the course.`) }), ' Needs training') : null),
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
        h('thead', null, h('tr', null, h('th', null, 'Name'), h('th', null, 'Email'), h('th', null, 'Access'), h('th', null, 'On the run'), h('th', null, 'What’s new'), h('th', null, 'Training'), h('th', null, 'Active'), h('th', null, ''))),
        (() => { const body = h('tbody', null, rows);
          // Who has read Stan's "What's new" cards (decision 0059): filled in once the list arrives; a dash if it can't be read.
          Promise.all([import('./whatsnew.js'), sb.from('update_seen').select('update_id, user_name').limit(2000)]).then(([w, { data, error }]) => { const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
            for (const td of body.querySelectorAll('.upd-cell')) { if (error) { td.textContent = '–'; continue; } const seen = (data || []).filter((r) => r.user_name === td.dataset.name).map((r) => r.update_id); const n = w.unreadCount(w.rolesOf({ driver: td.dataset.crew === 'driver', dispatcher: td.dataset.role === 'dispatcher' }), seen, today); td.textContent = n ? `${n} to read` : '✓ Up to date'; td.classList.toggle('warn-text', n > 0); } }).catch(() => { for (const td of body.querySelectorAll('.upd-cell')) td.textContent = '–'; });
          // Stan's School (decision 0065): each person's courses and practice, and whether a new driver still has some to do.
          Promise.all([import('./training.js'), sb.from('training_progress').select('user_name, item').limit(5000)]).then(([tr, { data, error }]) => {
            for (const el of body.querySelectorAll('.trn-cell')) { if (error) { el.textContent = '–'; continue; } const done = (data || []).filter((r) => r.user_name === el.dataset.name).map((r) => r.item); el.textContent = tr.progressText(done, { required: !!el.dataset.needs }); el.classList.toggle('warn-text', !!el.dataset.needs && tr.stillNeeded(done).length > 0); } }).catch(() => { for (const el of body.querySelectorAll('.trn-cell')) el.textContent = '–'; });
          return body; })()),
      h('p', { class: 'small muted' }, 'Training: courses finished in Stan’s School and practice tasks done in Sandbox Stan. A driver with Needs training ticked can go on duty as a helper but not as a driver until the driver course and its four practice tasks are done. New people start with it ticked.'),
      h('h3', null, 'Helpers without a login'),
      h('p', { class: 'small muted' }, 'Names a driver typed under “Other…” when going on duty. They show as buttons on “Who’s with you?”. Remove one if it was a typo.'),
      (() => { const box = h('div', { class: 'dz-polgrid' }, h('span', { class: 'small muted' }, 'Loading…'));
        sb.from('helper_names').select('name').order('name').then(({ data }) => { box.replaceChildren(...((data || []).length ? data.map((r) => h('span', { class: 'chip' }, r.name, ' ', h('button', { class: 'link small danger', 'aria-label': `Remove ${r.name}`, onclick: () => act(async () => { const { error } = await sb.from('helper_names').delete().eq('name', r.name); if (error) throw error; }, `${r.name} removed.`) }, '✕'))) : [h('span', { class: 'small muted' }, 'None yet.')])); });
        return box; })(),
      h('h3', null, 'Add a person'),
      h('div', { class: 'dz-polgrid' }, name, email, role, pw,
        h('button', { class: 'btn primary', onclick: () => act(() => adminCall({ action: 'add', name: name.value, email: email.value, role: role.value, password: pw.value }), `${name.value} added. Give them the password in person.`) }, 'Add')),
      h('p', { class: 'small muted' }, 'App only: runs, ticks and photos. App + Dispatch: also this dashboard. Driver or Helper (On the run): drivers take runs; helpers ride with a driver, folding and bagging and taking the passenger-side letterboxes. Stan’s day plan uses it. There must always be at least one dispatcher. Everyone can change their own password from the Runs page.'));
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

/**
 * The size watch (Mike, 28 Nov 2026; decision 0080): a banner only when something needs doing, at 70% of the free plan's
 * database (500 MB) or file storage (1 GB). Says what to do, not just the number.
 */
export function usageWarning(usage, h) {
  const full = (usage || []).filter((u) => Number(u.pct) >= 70);
  if (!full.length) return null;
  const mb = (b) => `${Math.round(Number(b) / 1048576)} MB`;
  return h('div', { class: 'banner bad', role: 'status' }, ...full.map((u) => h('p', null, u.what === 'photos'
    ? `Photo storage is ${u.pct}% full (${mb(u.used_bytes)} of ${mb(u.limit_bytes)}). ${u.photos_in_drive} of ${u.photos_total} photos are copied to Google Drive. Ask Claude to clear photos older than 60 days from the app (they stay in Drive).`
    : `The database is ${u.pct}% full (${mb(u.used_bytes)} of ${mb(u.limit_bytes)}). Ask Claude to archive old tick detail to Google Drive, or move to a paid Supabase plan.`)));
}
