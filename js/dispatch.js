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

export async function viewDispatch(ctx, tab = 'addresses') {
  const { app, h, mount, toast, titleCase, shortRoute } = ctx;
  if (app.store.mode !== 'shared') {
    mount(h('div', { class: 'page' }, h('p', null, 'The dispatch dashboard needs the shared version.'), h('a', { href: '#/' }, '‹ Runs')));
    return;
  }
  if (app.me.role !== 'dispatcher') {
    mount(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, 'The dispatch dashboard is for dispatchers. Ask Mike to switch your access on.'), h('a', { href: '#/' }, '‹ Runs')));
    return;
  }
  const sb = app.store.sb;
  const D = { addresses: [], groups: [], ops: [], svcs: [], policies: [], members: [], history: [] };
  const sel = new Set();             // selected address keys
  const F = { route: '', status: 'all', q: '' };
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
  const policyText = (p) => {
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
        L.circleMarker([p.lat, p.lng], { radius: p.big ? 9 : 6, color: p.color || '#2f3337', weight: 2, fillOpacity: 0.7 })
          .bindTooltip(p.label || '').addTo(layer);
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
  const tabs = [['addresses', 'Addresses'], ['locations', 'Locations'], ['policies', 'Policies'], ['users', 'Users']];
  if (!tabs.some(([k]) => k === tab)) tab = 'addresses';
  const body = h('div', { class: 'dz-body' }, h('p', { class: 'muted' }, 'Loading…'));
  const nav = h('nav', { class: 'dz-tabs' });
  // Switch tabs without leaving the page (keeps what's selected); the address bar follows along.
  const go = (k, focus) => { tab = k; if (focus !== undefined) current = focus; history.replaceState(null, '', `#/dispatch/${k}`); render(); };
  mount(h('div', { class: 'dz' },
    h('header', { class: 'dz-top' }, h('a', { href: '#/', class: 'link' }, '‹ Runs'), h('h1', null, 'Dispatch'), nav),
    body));
  try { await load(); } catch (e) { body.replaceChildren(h('div', { class: 'banner bad' }, `Could not load: ${e.message}. Has the dispatch part of sql/schema.sql been run?`)); return; }
  const render = () => {
    maps.splice(0).forEach((m) => m.remove());
    nav.replaceChildren(...tabs.map(([k, label]) => h('a', { href: `#/dispatch/${k}`, class: k === tab ? 'on' : '', onclick: (e) => { e.preventDefault(); go(k, null); } }, label)));
    body.replaceChildren(({ addresses: renderAddresses, locations: renderLocations, policies: renderPolicies, users: renderUsers })[tab]());
  };
  const refresh = async () => { await load(); render(); };
  const act = async (fn, ok) => { try { await fn(); if (ok) toast(ok); await refresh(); } catch (e) { toast(`Didn't save: ${e.message}`); } };

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
    const bulk = h('div', { class: 'dz-bulk', hidden: !sel.size },
      h('b', null, `${sel.size} selected`), opSel, svcSel,
      h('button', { class: 'btn small primary', onclick: () => { if (!opSel.value) return toast('Choose an operating location.'); act(async () => must(await sb.from('addresses').update({ operating_location_id: opSel.value, service_location_id: svcSel.value || null, validated_at: null, validated_by: null, updated_at: now(), updated_by: by() }).in('address_key', keys())), `Assigned ${sel.size}.`); } }, 'Assign'),
      h('button', { class: 'btn small', onclick: () => act(async () => must(await sb.from('addresses').update({ validated_at: now(), validated_by: by(), updated_at: now(), updated_by: by() }).in('address_key', keys()).not('operating_location_id', 'is', null)), 'Marked validated (assigned ones only).') }, 'Mark validated'),
      h('button', { class: 'btn small', onclick: () => act(async () => must(await sb.from('addresses').update({ operating_location_id: null, service_location_id: null, validated_at: null, validated_by: null, updated_at: now(), updated_by: by() }).in('address_key', keys())), 'Unassigned.') }, 'Unassign'),
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
        h('div', { class: 'dz-tablewrap' }, h('table', { class: 'dz-table' },
          h('thead', null, h('tr', null, h('th', null, allBox), h('th', null, 'Address'), h('th', null, 'Runs'), h('th', null, 'GPS'), h('th', null, 'Operating location'), h('th', null, 'Service location'), h('th', null, 'OK'))),
          h('tbody', null, rows))),
        shown.length > 600 ? h('p', { class: 'small muted' }, `Showing 600 of ${shown.length}. Narrow it with the filters.`) : null,
        !D.addresses.length ? h('p', { class: 'muted' }, 'No addresses yet. They are added automatically each time a run sheet loads.') : null),
      h('aside', { class: 'dz-side' }, current?.type === 'address' ? addressPanel(D.addresses.find((a) => a.address_key === current.id)) : h('p', { class: 'muted' }, 'Tick addresses to assign them to an operating location in bulk, or click one to see it on the map.')));
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
    return h('li', { class: p.active ? '' : 'muted' }, policyText(p),
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
    const show = () => {
      const k = kind.value;
      from.hidden = !['not_before', 'time_window'].includes(k); to.hidden = k !== 'time_window';
      speed.hidden = k !== 'speed_limit'; lat.hidden = lng.hidden = k !== 'entry_point';
    };
    kind.addEventListener('change', show); show();
    const form = h('details', { class: 'dz-polform' }, h('summary', null, '+ Add a policy'),
      h('div', { class: 'dz-polgrid' }, kind, note, from, to, speed, lat, lng),
      h('div', { class: 'dz-days' }, h('span', { class: 'small muted' }, 'Days (none = every day): '), days),
      h('button', { class: 'btn small primary', onclick: () => act(async () => {
        const k = kind.value;
        const row = { ...scope, kind: k, note: note.value || null, days: days.map((d) => d.firstChild).filter((c) => c.checked).map((c) => c.value), updated_by: by() };
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
      h('p', { class: 'small muted' }, 'Policies attach to a group, an operating location, a service location or one address, and apply to everything under it. Add them from the Locations tab (or an address). Kinds: entry point from the road, access notes, no service before a time, deliver between two times, speed limits, delivery restrictions.'),
      all.length ? h('table', { class: 'dz-table' },
        h('thead', null, h('tr', null, h('th', null, 'Applies to'), h('th', null, 'Policy'), h('th', null, ''))),
        h('tbody', null, all.map((p) => h('tr', { class: p.active ? '' : 'muted' }, h('td', null, policyTarget(p)), h('td', null, policyText(p)), h('td', null, [...policyItem(p).querySelectorAll('button')]))))) : h('p', { class: 'muted' }, 'No policies yet.'));
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
