import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { LocalStore, SupabaseStore, statusFrom, uuid, deviceLabel } from './store.js';
import { Geo } from './geo.js';
import { applySequence, moveKeys, mergeOrder } from './sequence.js';
import { layoutFor, arrange } from './village.js';
import { isRetailPub, basePub } from './parser.js';

// ---------------------------------------------------------------- helpers

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $app = () => document.getElementById('app');
const mount = (...nodes) => { const a = $app(); a.replaceChildren(...nodes); };

// "Big & clear" view: much bigger text and tiles, one address per row, stronger
// contrast. Remembered per phone; on by default for Mum's login.
const BIG_KEY = 'stb-big';
function bigOn() {
  let v = null;
  try { v = localStorage.getItem(BIG_KEY); } catch { /* private mode */ }
  if (v != null) return v === '1';
  return /moana|mum/i.test(app.me?.name || '');
}
function applyBig() { document.documentElement.classList.toggle('big', bigOn()); }

// Colours: Night is the default (runs start in the dark; Zaph's call, 8 Nov 2026),
// Day, or Auto (night from 7pm to 7am NZ time). Remembered per phone.
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const THEMES = [['night', 'Night'], ['day', 'Day'], ['auto', 'Auto']];
function themeIsDark() {
  const t = pref('stb-theme', 'night');
  if (t === 'day') return false;
  if (t === 'auto') {
    const hr = Number(new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    return hr >= 19 || hr < 7;
  }
  return true;
}
function applyTheme() {
  const dark = themeIsDark();
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0e0f11' : '#2f3337');
}
setInterval(applyTheme, 60000);
// Tiles two across (read left to right, then down) or one per row. Big text is always one per row.
const layoutIsList = () => bigOn() || pref('stb-layout', 'grid') === 'list';

// A panel that slides up from the bottom, used for menus and settings.
function openSheet(title, ...content) {
  const close = () => { panel.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const panel = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === panel) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => close() }, '✕')),
      ...content.map((c) => (typeof c === 'function' ? c(close) : c))));
  document.addEventListener('keydown', esc);
  document.body.append(panel);
  return close;
}
// One row of choices in a sheet, e.g. Colours: Night | Day | Auto.
function choiceRow(label, options, current, onPick) {
  const row = h('div', { class: 'choice-row' }, h('span', { class: 'choice-label' }, label));
  const seg = h('div', { class: 'seg' });
  const draw = (cur) => seg.replaceChildren(...options.map(([v, t]) => h('button', { 'aria-pressed': String(v === cur), onclick: () => { onPick(v); draw(v); } }, t)));
  draw(current);
  row.append(seg);
  return row;
}
const menuItem = (label, fn, opts = {}) => h('button', { class: `menu-item ${opts.danger ? 'danger' : ''}`, onclick: fn }, h('span', null, label), opts.hint ? h('small', null, opts.hint) : null);

// House numbers as the driver says them: "2C/ 12" -> 12, Unit 2C; "Suite 1/ 87" -> 87, Suite 1.
function fmtNumber(n) {
  const m = /^(.+?)\/\s*(.+)$/.exec(String(n || '').trim());
  if (!m) return { main: n, sub: '' };
  const pre = m[1].trim();
  const sub = /^(suite|level|shop|unit|flat|apt|apartment|room|villa|lot)\b/i.test(pre) ? pre.replace(/^\w/, (c) => c.toUpperCase()) : `Unit ${pre}`;
  return { main: m[2].trim(), sub };
}
const addrText = (l) => { const f = fmtNumber(l.number); return `${f.main} ${titleCase(l.street)}${f.sub ? ` (${f.sub})` : ''}`; };
function toggleBig() {
  const next = !bigOn();
  try { localStorage.setItem(BIG_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  applyBig();
  return next;
}

let toastTimer;
function toast(msg, action) {
  const t = document.getElementById('toast');
  const actions = (Array.isArray(action) ? action : [action]).filter(Boolean);
  t.replaceChildren(h('span', null, msg), ...actions.map((a) => h('button', { onclick: () => { t.hidden = true; a.fn(); } }, a.label)));
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, actions.length ? 6000 : 3500);
}

const fmtDate = (iso, long) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-NZ',
  long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
const shortRoute = (route) => route.replace(/^[A-Z]+0?/, 'Run ');
// Colour scheme (Mike, 8 Nov):
//   NZH                      plain (outlined chip)
//   retail (NZHR, SSTR…)     blue chip, light blue tile: a shop drop with a docket
//   any other publication    yellow/orange chip, light yellow tile
//   several publications     darker orange chips, light orange tile
// No greens anywhere: green means delivered.
const COLORS = {
  retail: ['#2563eb', '#fff'],
  other: ['#f59e0b', '#1c1300'],
  multi: ['#c2410c', '#fff'],
};
function pubColor(p, kind) {
  if (p === 'NZH') return null;
  if (isRetailPub(p)) return COLORS.retail;
  return kind === 'multi' ? COLORS.multi : COLORS.other;
}
// What kind of drop an address is, for the tile's colour.
function tileKind(parts) {
  if (parts.some((pt) => isRetailPub(pt.pub))) return 'retail';
  if (new Set(parts.map((pt) => basePub(pt.pub))).size > 1) return 'multi';
  if (parts.some((pt) => pt.pub !== 'NZH')) return 'other';
  return null;
}
const partsOf = (l) => (Array.isArray(l.parts) && l.parts.length ? l.parts : [{ pub: l.pub, qty: l.qty }]);
const FLAG_LABEL = { unrouted: 'Not routed', start: 'New', complaint: 'Complaint', stop: 'Stop?', weekday: 'Check day', combined: 'Combined' };

const runLink = (ids) => `${location.origin}${location.pathname}#/r/${ids.join('+')}`;
async function shareRuns(ids, label) {
  const url = runLink(ids);
  const text = `${label}: tap to open the run`;
  if (navigator.share) {
    try { await navigator.share({ title: label, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  location.href = `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`;
}

// ---------------------------------------------------------------- app state

const app = { store: null, me: null, cleanup: null, pendingLoad: null };

async function boot() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createClient } = await import('../vendor/supabase.mjs');
    app.store = new SupabaseStore(createClient, SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    app.store = new LocalStore();
  }
  await app.store.init();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then((reg) => reg.update()).catch(() => {});
    // A new version took over: reload straight away on the Runs list, or offer it mid-run.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (!location.hash.startsWith('#/r/')) location.reload();
      else toast('A new version of the app is ready.', { label: 'Reload', fn: () => location.reload() });
    });
  }
  window.addEventListener('hashchange', route);
  await route();
}

async function route() {
  if (app.cleanup) { app.cleanup(); app.cleanup = null; }
  applyBig();
  applyTheme();
  clearTimeout(toastTimer); document.getElementById('toast').hidden = true; // a message never follows you to another screen
  window.scrollTo(0, 0);
  try {
    app.me = await app.store.session();
  } catch (e) {
    await app.store.signOut();
    return viewLogin(e.message);
  }
  if (!app.me) return viewLogin();
  const hash = location.hash.replace(/^#/, '');
  if (!hash && app.me.role === 'dispatcher' && window.innerWidth >= 1000) { location.replace('#/dispatch'); return; }
  const m = /^\/r\/([A-Za-z0-9+]+)/.exec(hash);
  if (m) return viewRun(m[1].split('+').filter(Boolean));
  if (hash === '/load' && app.pendingLoad) return viewLoad();
  const dz = /^\/dispatch(?:\/(\w+))?/.exec(hash);
  if (dz) {
    // Upload from the dashboard: same checks as the app's upload screen.
    const pickSheets = () => {
      const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, class: 'file-input' });
      input.addEventListener('change', () => { if (input.files.length) loadFiles([...input.files]); input.remove(); });
      document.body.append(input); input.click();
    };
    return import('./dispatch.js').then((m) => m.viewDispatch({ app, h, mount, toast, titleCase, shortRoute, paperSummary, openRefetch, pickSheets, fmtStamp, fmtDate, changeSummary }, dz[1] || 'overview'));
  }
  return viewHome();
}

// ---------------------------------------------------------------- login

function viewLogin(error) {
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, inputmode: 'email' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const msg = h('div', { class: error ? 'banner bad' : '', hidden: !error }, error || '');
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Sign in');
  const form = h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      btn.disabled = true; btn.textContent = 'Signing in…';
      try { await app.store.signIn(email.value.trim(), pw.value); await route(); } catch (e) {
        msg.hidden = false; msg.className = 'banner bad'; msg.textContent = e.message;
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    },
  },
  h('label', { class: 'field' }, h('span', null, 'Email'), email),
  h('label', { class: 'field' }, h('span', null, 'Password'), pw),
  msg, btn);
  mount(h('div', { class: 'login' }, h('div', { class: 'brand' }, 'Send The Boy'), h('h1', null, 'Runs'), form,
    h('p', { class: 'muted small' }, 'You stay signed in on this phone. On iPhone, sign in once in Safari as well if you open runs from text links.')));
}

// ---------------------------------------------------------------- home

// ---------------------------------------------------------------- home: Today
// The driver's home: today's and upcoming runs as big cards. Everything else
// (getting sheets, uploads, text size, colours, password) is in Settings (⚙).
const nzToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
function dayName(iso) {
  const t = nzToday();
  const tomorrow = new Date(Date.parse(`${t}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  return iso === t ? `Today · ${fmtDate(iso)}` : iso === tomorrow ? `Tomorrow · ${fmtDate(iso)}` : fmtDate(iso);
}

async function viewHome() {
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,.pdf', multiple: true, class: 'file-input', id: 'pdf' });
  fileInput.addEventListener('change', () => { if (fileInput.files.length) loadFiles([...fileInput.files]); });
  const list = h('div', null, h('p', { class: 'muted' }, 'Loading runs…'));
  mount(h('div', { class: 'page home' },
    h('header', { class: 'home-top' },
      h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'brand' }, 'Send The Boy'), h('h1', null, 'Runs')),
      app.store.mode === 'shared' ? h('span', { class: 'who-me' }, app.me.name) : null,
      h('button', { class: 'icon-btn settings-btn', 'aria-label': 'Settings', onclick: () => openSettings(fileInput) }, '⚙')),
    app.store.mode === 'demo' ? h('div', { class: 'banner' }, 'Demo mode: saved on this phone only.') : null,
    app.me.role === 'dispatcher' ? h('a', { class: 'dispatch-link', href: '#/dispatch' }, 'Dispatch dashboard ›') : null,
    fileInput,
    list));

  async function renderList() {
    let runs;
    try { runs = await app.store.listRuns(); } catch (e) {
      list.replaceChildren(h('div', { class: 'banner bad' }, `Could not load runs: ${e.message}`));
      return;
    }
    if (!runs.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('p', null, app.store.mode === 'shared' ? 'No runs yet. They load themselves from RouteSmart each evening after 7pm.' : 'No runs on this phone yet.'),
        app.store.mode === 'shared' ? h('button', { class: 'btn primary big', onclick: () => openRefetch() }, 'Get Runs now') : null,
        h('button', { class: `btn big ${app.store.mode === 'shared' ? '' : 'primary'}`, style: 'margin-top:8px', onclick: () => fileInput.click() }, 'Upload a run sheet (PDF)')));
      return;
    }
    const byDate = {};
    for (const r of runs) (byDate[r.delivery_date] ||= []).push(r);
    // After Get Runs: once every run for that day has been replaced, say what changed.
    const w = app.awaitingFetch;
    if (w) {
      const day = byDate[w.date] || [];
      const fresh = day.filter((r) => (r.updated_at || r.created_at) > w.at);
      if (day.length && fresh.length === day.length) {
        app.awaitingFetch = null;
        const changed = fresh.filter((r) => r.last_changes?.count);
        toast(changed.length
          ? `Runs updated. ${changed.map((r) => changeSummary(r.route, r.last_changes)).join(' · ')}. No changes on the others.`
          : `Runs updated ${fmtStamp(new Date().toISOString())}. No details changed.`);
      }
    }
    const today = nzToday();
    const dates = Object.keys(byDate);
    const upcoming = dates.filter((d) => d >= today).sort();
    const earlier = dates.filter((d) => d < today).sort().reverse();
    const daySection = (date) => {
      const rs = [...byDate[date]].sort((a, b) => a.route.localeCompare(b.route));
      const changed = rs.filter((r) => r.last_changes?.count);
      const latest = rs.reduce((m, r) => { const t = r.updated_at || r.created_at; return t > m ? t : m; }, '');
      const auto = rs.every((r) => r.source === 'auto');
      return h('section', { class: 'date-group' },
        h('div', { class: 'date-head' }, h('h2', null, dayName(date)),
          rs.length > 1 ? h('button', { class: 'btn small', onclick: () => { location.hash = `#/r/${rs.map((r) => r.id).join('+')}`; } }, 'Open all') : null),
        latest ? h('div', { class: `updated ${changed.length ? 'some' : ''}` },
          `Updated ${fmtStamp(latest)} ${auto ? 'from RouteSmart' : 'by upload'}`,
          changed.length ? ` · ${changed.map((r) => changeSummary(r.route, r.last_changes)).join(' · ')}` : rs.some((r) => r.last_changes) ? ' · no changes' : '') : null,
        rs.map((r) => {
          const stops = r.summary?.lines || 0;
          const done = r.done || 0;
          const dockets = r.summary?.dockets || 0;
          return h('div', { class: 'run-tile-wrap' },
            h('button', { class: `run-tile ${done && done >= stops ? 'finished' : ''}`, onclick: () => { location.hash = `#/r/${r.id}`; } },
              h('div', { class: 'rt-main' },
                h('div', { class: 'rt-name' }, shortRoute(r.route)),
                h('div', { class: 'rt-sub' }, `${stops} stops · ${r.summary?.copies ?? '?'} papers${dockets ? ` · ${dockets} docket${dockets === 1 ? '' : 's'}` : ''}`),
                pickList(r).length ? h('div', { class: 'rt-pick' }, h('span', { class: 'rt-pick-label' }, 'Pick'),
                  pickList(r).map((x) => h('span', { class: 'rt-pick-item' }, h('b', null, x.pub), ` ${pickText(x)}`))) : null,
                done ? h('div', { class: 'bar' }, h('i', { style: `width:${stops ? Math.round((100 * done) / stops) : 0}%` })) : null,
                done ? h('div', { class: 'rt-sub' }, done >= stops ? '✓ Finished' : `${done} of ${stops} done`) : null),
              h('span', { class: 'rt-go' }, done ? (done >= stops ? 'View' : 'Continue') : 'Start')),
            r.last_changes?.count ? h('details', { class: 'change-list' }, h('summary', null, `What changed on ${shortRoute(r.route)}`),
              h('ul', null, r.last_changes.items.map((x) => h('li', null, x)))) : null);
        }),
        h('details', { class: 'papers' }, h('summary', null, `Papers to collect: ${rs.reduce((t, r) => t + (r.summary?.copies || 0), 0)} papers`,
          rs.some((r) => r.summary?.dockets) ? `, ${rs.reduce((t, r) => t + (r.summary?.dockets || 0), 0)} dockets` : ''), paperSummary(rs)));
    };
    list.replaceChildren(...[
      ...(upcoming.length ? upcoming.map(daySection) : [h('div', { class: 'empty' }, 'No runs for today or tomorrow yet. They load themselves after 7pm.')]),
      earlier.length ? h('details', { class: 'earlier' }, h('summary', null, `Earlier days (${earlier.length})`), earlier.map(daySection)) : null,
    ].filter(Boolean));
  }
  await renderList();

  // New or replaced sheets (the evening fetch, a re-fetch, someone's upload) show up by themselves.
  let t;
  const unwatch = app.store.watchRuns(() => { clearTimeout(t); t = setTimeout(renderList, 1500); });
  app.cleanup = () => { unwatch(); clearTimeout(t); };
}

// Settings (⚙ on the Runs page): reading, getting sheets, account.
function openSettings(fileInput) {
  openSheet('Settings',
    (close) => h('div', { class: 'menu-group' },
      choiceRow('Text', [['normal', 'Normal'], ['big', 'Big']], bigOn() ? 'big' : 'normal', (v) => { if ((v === 'big') !== bigOn()) { toggleBig(); close(); route().then(() => openSettings(document.getElementById('pdf'))); } }),
      bigOn() ? null : choiceRow('Tiles', [['grid', 'Two across'], ['list', 'One per row']], pref('stb-layout', 'grid'), (v) => setPref('stb-layout', v)),
      choiceRow('Colours', THEMES, pref('stb-theme', 'night'), (v) => { setPref('stb-theme', v); applyTheme(); })),
    (close) => h('div', { class: 'menu-group' },
      app.store.mode === 'shared' ? menuItem('Get Runs from RouteSmart…', () => { close(); openRefetch(); }, { hint: 'Fetches the latest sheets for a day. Use it if a change is phoned in' }) : null,
      menuItem('Upload a run sheet (PDF)…', () => { close(); fileInput?.click(); }, { hint: 'A sheet you downloaded yourself' }),
      app.me.role === 'dispatcher' ? menuItem('Dispatch dashboard', () => { close(); location.hash = '#/dispatch'; }) : null),
    app.store.mode === 'shared' ? (close) => h('div', { class: 'menu-group' },
      h('div', { class: 'small muted', style: 'padding:0 12px' }, `Signed in as ${app.me.name}`),
      menuItem('Change password…', () => { close(); changePassword(); }),
      menuItem('Sign out', async () => { close(); await app.store.signOut(); route(); }, { danger: true })) : null);
}

// Change your own password (e.g. after a dispatcher set a temporary one).
function changePassword() {
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const msg = h('div', { class: 'small', hidden: true });
  const close = () => panel.remove();
  const panel = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === panel) close(); } },
    h('form', { class: 'sheet', onsubmit: async (e) => {
      e.preventDefault();
      const fail = (t) => { msg.hidden = false; msg.className = 'banner bad'; msg.textContent = t; };
      if (p1.value.length < 8) return fail('At least 8 characters, please.');
      if (p1.value !== p2.value) return fail('The two passwords are different.');
      try { await app.store.changePassword(p1.value); close(); toast('Password changed.'); } catch (err) { fail(err.message); }
    } },
    h('h2', null, 'Change password'),
    h('label', { class: 'field' }, h('span', null, 'New password'), p1),
    h('label', { class: 'field' }, h('span', null, 'Same again'), p2),
    msg,
    h('div', { style: 'display:flex;gap:8px' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', type: 'submit', style: 'flex:1' }, 'Change password'))));
  document.body.append(panel);
}

// Re-fetch a delivery date's sheets from RouteSmart (e.g. after a late change phoned in).
// When this day's sheets were last loaded, and whether that was from RouteSmart.
function lastRefreshed(rs) {
  const latest = rs.reduce((a, r) => { const t = r.updated_at || r.created_at; return t && (!a || t > a.t) ? { t, r } : a; }, null);
  if (!latest) return null;
  const how = latest.r.source === 'auto' ? 'from RouteSmart' : 'by manual upload';
  return h('div', { class: 'refreshed' }, h('span', { class: 'refreshed-label' }, 'Runs last updated'), h('b', null, fmtStamp(latest.t)), h('span', { class: 'muted' }, ` ${how}`));
}

// Shrink a camera photo to a sensible size and stamp the address and time
// along the bottom, so the picture explains itself when it's forwarded.
async function stampPhoto(file, lines) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), hgt = Math.round(bmp.height * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, w, hgt);
  const fs = Math.max(18, Math.round(w / 32));
  const pad = Math.round(fs * 0.6);
  const boxH = lines.length * fs * 1.3 + pad * 2;
  g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, hgt - boxH, w, boxH);
  g.fillStyle = '#fff'; g.textBaseline = 'top';
  lines.forEach((t, i) => { g.font = `${i === 0 ? 'bold ' : ''}${fs}px sans-serif`; g.fillText(t, pad, hgt - boxH + pad + i * fs * 1.3, w - pad * 2); });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the photo'))), 'image/jpeg', 0.82));
}

// What to pick up at the depot for a run, straight from the key report's
// "Bundles: 1 with 100 · ODD: 5 · DRAW: 105" lines: whole bundles plus loose copies.
function pickList(r) {
  const pubs = r.key_report?.pubs || {};
  return Object.entries(pubs)
    .map(([pub, x]) => {
      const m = /(\d+)\s*with\s*(\d+)/i.exec(String(x.bundles || ''));
      const bundles = m ? Number(m[1]) : 0;
      const size = m ? Number(m[2]) : null;
      const draw = Number(x.draw) || 0;
      const loose = Number.isFinite(Number(x.odd)) && x.odd != null ? Number(x.odd) : Math.max(0, draw - bundles * (size || 0));
      return { pub, bundles, size, loose, draw };
    })
    .filter((x) => x.draw > 0)
    .sort((a, b) => (a.pub === 'NZH' ? -1 : b.pub === 'NZH' ? 1 : a.pub.localeCompare(b.pub)));
}
const pickText = (x) => [x.bundles ? `${x.bundles} bundle${x.bundles === 1 ? '' : 's'}${x.size ? ` of ${x.size}` : ''}` : null, x.loose ? `${x.loose} loose` : null].filter(Boolean).join(' + ');

// "Run 13: 3 details changed" / "Run 13: no details changed".
function changeSummary(route, ch) {
  const r = shortRoute(route);
  if (!ch) return `${r}: loaded`;
  return ch.count ? `${r}: ${ch.count} detail${ch.count === 1 ? '' : 's'} changed` : `${r}: no details changed`;
}
const fmtStamp = (iso) => new Date(iso).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Papers to collect for a day: each run's copies by paper, plus totals.
// Retail codes (NZHR…) are the same paper, so they count in its column;
// the Dockets column is how many delivery dockets to bring (one per retail drop).
function paperSummary(rs) {
  const runs = [...rs].sort((a, b) => a.route.localeCompare(b.route));
  const papers = (r) => {
    const out = {};
    for (const [p, q] of Object.entries(r.summary?.byPub || {})) out[basePub(p)] = (out[basePub(p)] || 0) + q;
    return out;
  };
  const retailCopies = (r) => Object.entries(r.summary?.byPub || {}).filter(([p]) => isRetailPub(p)).reduce((t, [, q]) => t + q, 0);
  const docketsOf = (r) => (r.summary?.dockets ?? null);
  const pubs = [...new Set(runs.flatMap((r) => Object.keys(papers(r))))]
    .sort((a, b) => (a === 'NZH' ? -1 : b === 'NZH' ? 1 : a.localeCompare(b)));
  if (!pubs.length) return null;
  const n = (r, p) => papers(r)[p] || 0;
  const total = (p) => runs.reduce((t, r) => t + n(r, p), 0);
  const grand = runs.reduce((t, r) => t + (r.summary?.copies || 0), 0);
  const anyRetail = runs.some((r) => retailCopies(r));
  const dk = (r) => { const d = docketsOf(r); return d == null ? (retailCopies(r) ? '?' : '–') : (d || '–'); };
  const dkTotal = runs.every((r) => docketsOf(r) != null || !retailCopies(r)) ? runs.reduce((t, r) => t + (docketsOf(r) || 0), 0) : '?';
  const head = (p) => {
    const c = pubColor(p);
    return h('th', null, h('span', { class: `pub ${c ? '' : 'nzh'}`, style: c ? `background:${c[0]};color:${c[1]}` : null }, p));
  };
  return h('div', { class: 'card paper-sum' },
    h('div', { class: 'paper-sum-title' }, 'Papers to collect'),
    h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Run'), pubs.map(head), h('th', null, 'Total'), anyRetail ? h('th', { class: 'dk' }, 'Dockets') : null)),
      h('tbody', null, runs.map((r) => h('tr', null,
        h('td', null, r.route.replace(/^HOWICK0?/, 'Run ')),
        pubs.map((p) => h('td', { class: n(r, p) ? '' : 'zero' }, n(r, p) || '–')),
        h('td', { class: 'tot' }, r.summary?.copies ?? '?'),
        anyRetail ? h('td', { class: `dk ${retailCopies(r) ? '' : 'zero'}` }, dk(r)) : null))),
      h('tfoot', null, h('tr', null, h('td', null, 'All runs'), pubs.map((p) => h('td', null, total(p))), h('td', { class: 'tot' }, grand),
        anyRetail ? h('td', { class: 'dk' }, dkTotal) : null))),
    runs.some((r) => pickList(r).length) ? h('div', { class: 'pick-table' },
      h('div', { class: 'paper-sum-title' }, 'Depot pick (bundles + loose)'),
      h('table', null, h('tbody', null, runs.map((r) => h('tr', null,
        h('td', null, r.route.replace(/^HOWICK0?/, 'Run ')),
        h('td', null, pickList(r).map((x) => h('div', null, h('b', null, x.pub), ` ${pickText(x)}`)))))))) : null,
    h('div', { class: 'small muted' }, `${runs.reduce((t, r) => t + (r.summary?.lines || 0), 0)} addresses across ${runs.length} run${runs.length === 1 ? '' : 's'}`,
      anyRetail ? `. NZH includes ${runs.reduce((t, r) => t + retailCopies(r), 0)} retail copies (NZHR); each shop also gets a delivery docket.` : ''));
}

// Which delivery day "Get Runs" means: before midday NZ it's today's run
// (the one being delivered this morning), after midday it's tomorrow's.
function nzRunDay() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const today = Date.parse(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  return new Date(Number(p.hour) < 12 ? today : today + 864e5).toISOString().slice(0, 10);
}
function openRefetch() {
  const date = h('input', { type: 'date', value: nzRunDay() });
  const msg = h('div', { class: 'small', hidden: true });
  const go = h('button', { class: 'btn primary', type: 'submit', style: 'flex:1' }, 'Get Runs');
  const close = () => panel.remove();
  const panel = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === panel) close(); } },
    h('form', {
      class: 'sheet',
      onsubmit: async (e) => {
        e.preventDefault();
        go.disabled = true; go.textContent = 'Starting…';
        try {
          await app.store.refetch(date.value);
          app.awaitingFetch = { date: date.value, at: new Date().toISOString() };
          close();
          toast(`Getting the runs for ${fmtDate(date.value)} from RouteSmart. Give it 2 to 3 minutes; they appear here by themselves.`);
        } catch (err) {
          msg.hidden = false; msg.className = 'banner bad'; msg.textContent = err.message;
          go.disabled = false; go.textContent = 'Get Runs';
        }
      },
    },
    h('h2', null, 'Get Runs'),
    h('p', { class: 'small muted' }, 'Gets the latest run sheets for that day from RouteSmart. Every total is checked, and if the runs are already here they are replaced with the latest version. Ticks already made are kept.'),
    h('label', { class: 'field' }, h('span', null, 'Delivery date'), date),
    msg,
    h('div', { style: 'display:flex;gap:8px' },
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'), go)));
  document.body.append(panel);
}

// ---------------------------------------------------------------- load a PDF

let pdfjsPromise;
function pdfjs() {
  pdfjsPromise ||= import('../vendor/pdf.min.mjs').then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
    return lib;
  });
  return pdfjsPromise;
}

async function loadFiles(files) {
  mount(h('div', { class: 'page' }, h('p', { class: 'boot' }, 'Reading the run sheet…')));
  try {
    const [{ extractPages, parseReport }, lib] = await Promise.all([import('./parser.js'), pdfjs()]);
    const results = [];
    const problems = [];
    for (const f of files) {
      const pages = await extractPages(lib, new Uint8Array(await f.arrayBuffer()));
      const res = parseReport(pages);
      problems.push(...res.problems.map((p) => `${f.name}: ${p}`));
      for (const r of res.routes) results.push({ r, filename: f.name });
    }
    for (const item of results) {
      try { item.existing = await app.store.findRun(item.r.route, item.r.deliveryDate); } catch { item.existing = null; }
      item.include = item.r.ok;
    }
    app.pendingLoad = { results, problems };
    if (location.hash === '#/load') viewLoad(); else location.hash = '#/load';
  } catch (e) {
    console.error(e);
    toast(`Could not read that PDF: ${e.message}`);
    viewHome();
  }
}

// For routes with a layout (Run 8): section totals, and anything to check.
function villageSummary(r) {
  const layout = layoutFor(r.route);
  if (!layout) return null;
  const lines = r.lines.map((l) => ({ ...l, address_key: l.addressKey }));
  const a = arrange(layout, lines);
  const sum = a.totals.reduce((n, x) => n + x.qty, 0) + a.groups.filter((g) => !g.section).flatMap((g) => g.lines).reduce((n, l) => n + l.qty, 0);
  const ok = a.mappedOnce && sum === r.summary.copies;
  return h('div', { class: 'village-sum' },
    h('div', { class: 'small' }, h('b', null, `${layout.name}: `), a.totals.map((x) => `${x.label.replace(' Apartments', '').replace(' handover', '')} ${x.qty}`).join(' · '), ` = ${sum}`),
    h('div', { class: `small ${ok ? 'ok' : 'fail'}` }, ok ? '✓ Every sheet line placed once, in building order' : '✗ Building totals don’t add up to the sheet: check before saving'),
    a.exceptions.length ? h('details', null, h('summary', { class: 'small' }, `${a.exceptions.length} to check (bank map)`),
      h('ul', { class: 'warnings' }, a.exceptions.map((x) => h('li', null, x)))) : null);
}

function viewLoad() {
  const { results, problems } = app.pendingLoad;
  const saveBtn = h('button', { class: 'btn primary big' }, 'Save');
  const refresh = () => {
    const n = results.filter((x) => x.include).length;
    saveBtn.disabled = n === 0;
    saveBtn.textContent = n ? `Save ${n} run${n > 1 ? 's' : ''} and open` : 'Nothing selected';
  };
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const ids = [];
      const said = [];
      for (const x of results.filter((y) => y.include)) {
        ids.push(await app.store.saveRun(x.r, x.filename, x.existing ? x.existing.id : null));
        if (x.existing) said.push({ route: x.r.route, ch: app.store.lastChanges });
      }
      app.pendingLoad = null;
      location.hash = `#/r/${ids.join('+')}`;
      if (said.length) {
        const changed = said.filter((x) => x.ch?.count);
        const msg = !changed.length ? 'Sheet replaced. No details changed.'
          : `Sheet replaced. ${changed.map((x) => changeSummary(x.route, x.ch)).join(' · ')}${changed.length < said.length ? '. No changes on the others.' : '.'} See the Runs page for what changed.`;
        setTimeout(() => toast(msg), 400);
      }
    } catch (e) {
      toast(`Save failed: ${e.message}`);
      refresh();
    }
  });

  const cards = results.map((x) => {
    const { r } = x;
    const failed = r.checks.filter((c) => !c.ok);
    const flagged = r.lines.filter((l) => l.flags.length);
    const include = h('input', { type: 'checkbox', checked: x.include, onchange: (e) => { x.include = e.target.checked; refresh(); } });
    return h('div', { class: 'card' },
      h('div', { style: 'display:flex;align-items:baseline;gap:8px' }, h('h2', { style: 'margin:0;font-size:20px;flex:1' }, r.route),
        h('span', { class: 'muted small' }, r.deliveryDate ? fmtDate(r.deliveryDate, true) : 'no date')),
      h('div', { class: 'small muted', style: 'margin-top:4px' },
        `${r.summary.lines} addresses${r.summary.sheetLines > r.summary.lines ? ` (${r.summary.sheetLines} sheet lines)` : ''} · ${r.summary.copies} copies`),
      h('div', { class: 'pubs', style: 'margin-top:6px' }, Object.entries(r.summary.byPub).map(([p, n]) => {
        const c = pubColor(p);
        return h('span', { class: `pub ${c ? '' : 'nzh'}`, style: c ? `background:${c[0]};color:${c[1]}` : null }, `${p} ${n}`);
      })),
      failed.length
        ? h('ul', { class: 'checks' }, failed.map((c) => h('li', { class: 'fail' }, `✗ ${c.label}: report says ${c.expected}, sheet adds up to ${c.got}`)))
        : h('ul', { class: 'checks' }, h('li', { class: 'ok' }, `✓ All ${r.checks.length} totals match the report`)),
      villageSummary(r),
      flagged.length ? h('div', { class: 'small' }, h('b', null, 'Flagged on tiles: '),
        flagged.map((l) => `${addrText(l)} (${l.flags.map((f) => FLAG_LABEL[f.type]).join(', ')})`).join('; ')) : null,
      r.warnings.length ? h('details', { style: 'margin-top:6px' }, h('summary', { class: 'small' }, `${r.warnings.length} note${r.warnings.length > 1 ? 's' : ''} to check`),
        h('ul', { class: 'warnings' }, r.warnings.map((w) => h('li', null, w)))) : null,
      x.existing ? h('div', { class: 'banner warn', style: 'margin-top:10px' },
        'Already loaded for this date. Saving replaces the sheet; ticks already made are kept.') : null,
      h('label', { class: 'choice' }, include,
        h('span', null, r.ok ? 'Save this run' : h('b', { class: 'fail' }, 'Totals don’t match. Save anyway?'))));
  });

  mount(h('div', { class: 'page' },
    h('div', { class: 'topbar' }, h('button', { class: 'link', onclick: () => { app.pendingLoad = null; location.hash = '#/'; } }, '‹ Runs'), h('h1', null, 'Check the sheet')),
    problems.length ? h('div', { class: 'banner warn' }, problems.join(' ')) : null,
    results.length ? cards : h('div', { class: 'banner bad' }, 'No delivery lists found in that PDF. Is it the “Delivery List by Sequence” report?'),
    h('div', { class: 'stickybar' }, h('div', { class: 'inner' }, saveBtn))));
  refresh();
}

// ---------------------------------------------------------------- run view

async function viewRun(ids) {
  mount(h('div', { class: 'page' }, h('p', { class: 'boot' }, 'Opening run…')));
  let data;
  try { data = await app.store.loadRuns(ids); } catch (e) {
    mount(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, `Could not open this run: ${e.message}`),
      h('a', { class: 'btn', href: '#/' }, 'Back to runs')));
    return;
  }
  if (!data.length) {
    mount(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, 'Run not found. It may have been removed, or the link is incomplete.'),
      h('a', { class: 'btn', href: '#/' }, 'Back to runs')));
    return;
  }
  const S = {
    data,
    events: await app.store.loadEvents(ids),
    show: 'all',
    todoOnly: false,
    query: '',
    flash: null,
    seq: await app.store.loadSequences([...new Set(data.map((d) => d.run.route))]),
    useCustom: true,   // show our own order when a route has one
    blocks: {},        // section id -> { runId, route, keys } for dragging whole streets
    codes: {},         // route -> { section id -> door code }, for routes with a layout
    photos: await app.store.loadPhotos(ids),   // photos taken on these runs
    watch: await app.store.loadWatch([...new Set(data.map((d) => d.run.route))]), // route -> addresses to photo every time
  };
  for (const r of new Set(data.map((d) => d.run.route))) if (layoutFor(r)) S.codes[r] = await app.store.loadAccessCodes(r);
  const hasCustom = (d) => !!S.seq[d.run.route]?.keys?.length;
  const orderedLines = (d) => (S.useCustom ? applySequence(d.lines, S.seq[d.run.route]?.keys) : d.lines);
  const status = () => statusFrom(S.events);
  const label = data.map((d) => d.run.route).join(' + ');
  const date = data[0].run.delivery_date;

  // ---- header: one slim sticky bar (back, run, search, menu), progress and status under it
  const fbFill = h('i', { class: 'fb-fill' });
  const fbProg = h('span', { class: 'fb-prog' });
  const fbTime = h('span', { class: 'fb-time' });
  const fbNote = h('span', { class: 'fb-note' });
  const floatbar = h('div', { class: 'rh-prog', role: 'status', onclick: () => window.scrollTo({ top: 0, behavior: 'smooth' }) }, fbProg, fbTime, fbNote);
  const withChip = h('span', { class: 'st with', hidden: true });
  const gpsChip = h('span', { class: 'st' });
  const syncChip = h('span', { class: 'st' });
  const orderChip = h('span', { class: 'st', hidden: true });
  const body = h('div', { class: 'runbody' });
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Find a number, street or note', enterkeyhint: 'search', autocomplete: 'off' });
  search.addEventListener('input', () => { S.query = search.value.trim().toLowerCase(); render(); });
  const searchRow = h('div', { class: 'rh-row', hidden: true }, search,
    h('button', { class: 'btn small', onclick: () => { search.value = ''; S.query = ''; searchRow.hidden = true; render(); } }, 'Done'));
  const todoBtn = { setAttribute() {} }; // "To do only" now lives in the menu
  const seg = data.length > 1 ? h('div', { class: 'seg' },
    [['all', 'All'], ...data.map((d) => [d.run.id, shortRoute(d.run.route)])].map(([v, t]) => h('button', {
      'aria-pressed': String(S.show === v),
      onclick: (e) => { S.show = v; [...seg.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); render(); },
    }, t))) : null;

  // ---- bottom bar: what you just did (with Undo and Photo), and where to go next
  const abMain = h('div', { class: 'ab-main' });
  const abSub = h('div', { class: 'ab-sub' });
  const abUndo = h('button', { class: 'ab-btn', hidden: true, onclick: () => { const l = S.last; if (l) { S.last = null; tapMany(l.lines, l.label, l.flashKey); } } }, '↶ Undo');
  const abPhoto = h('button', { class: 'ab-btn', hidden: true, onclick: () => { if (S.last?.lines.length === 1) takePhoto(S.last.lines[0]); } }, '📷');
  const abNext = h('button', { class: 'ab-btn primary', onclick: () => goNext(true) }, 'Next ↓');
  const actionbar = h('div', { class: 'actionbar', role: 'region', 'aria-label': 'Last delivery and next stop' },
    h('div', { class: 'ab-text', onclick: () => goNext(true) }, abMain, abSub), abUndo, abPhoto, abNext);
  function drawBar(nextEl) {
    const last = S.last;
    abUndo.hidden = !last; abPhoto.hidden = !(last && last.lines.length === 1);
    abMain.textContent = last ? `✓ ${last.label}` : (nextEl ? 'Next stop' : '');
    abSub.textContent = nextEl ? `Next: ${nextEl.getAttribute('data-label') || ''}` : (S.progress?.total ? 'All done on this screen' : '');
    abNext.hidden = !nextEl;
  }
  // Scroll the next stop into view (only if it's off screen, unless asked).
  function goNext(force) {
    const el = body.querySelector('.tile.next');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = document.querySelector('.rh')?.getBoundingClientRect().bottom || 0;
    const bottom = innerHeight - actionbar.getBoundingClientRect().height;
    if (force || r.top < top + 8 || r.bottom > bottom - 8) {
      window.scrollBy({ top: r.top - top - (bottom - top - r.height) / 3, behavior: 'smooth' });
    }
  }

  const geo = new Geo(() => { gpsChip.textContent = geo.label(); gpsChip.className = `st ${geo.state === 'ok' ? 'good' : geo.state === 'denied' ? 'warn' : ''}`; });
  geo.start();
  const updateSync = (n = app.store.pendingCount()) => {
    if (app.store.mode === 'demo') { syncChip.textContent = 'On this phone'; syncChip.className = 'st'; return; }
    syncChip.textContent = n ? `${n} to send` : 'All sent';
    syncChip.className = `st ${n ? 'warn' : 'good'}`;
  };
  updateSync();
  const offSync = app.store.onSync(updateSync);

  // One tap = one tile, or a whole bundle (e.g. Run 8 reception). A bundle
  // records an entry for every paper in it, same time and GPS, so the audit
  // keeps each obligation while the driver makes one handover.
  async function tap(line) { return tapMany([line], addrText(line), `${line.run_id}::${line.line_key}`); }
  async function tapMany(lines, label, flashKey) {
    const st = status();
    const done = !lines.every((l) => st[`${l.run_id}::${l.line_key}`]?.done);
    const now = Date.now();
    const fresh = geo.last && now - geo.last.t < 15000;
    const evs = lines.map((l) => {
      const e = {
        id: uuid(), run_id: l.run_id, line_key: l.line_key, address_key: l.address_key, route: l.route,
        done, user_name: app.me.name, device_time: new Date(now).toISOString(), device: deviceLabel(),
      };
      if (fresh) Object.assign(e, { lat: geo.last.lat, lng: geo.last.lng, accuracy_m: geo.last.acc, fix_age_ms: now - geo.last.t });
      return e;
    });
    S.events.push(...evs);
    S.flash = done ? flashKey : null;
    app.store.addEvents(evs, !fresh);
    if (navigator.vibrate) navigator.vibrate(done ? 15 : [10, 40, 10]);
    const wasNext = body.querySelector('.tile.next')?.getAttribute('data-key') === flashKey;
    S.last = done ? { lines, label, flashKey } : (S.last?.flashKey === flashKey ? null : S.last);
    render();
    if (done && wasNext) goNext(false); // ticked the next stop: bring the new one into view
    if (!fresh) {
      const fix = await geo.fixFor(now);
      const patch = fix ? { lat: fix.lat, lng: fix.lng, accuracy_m: fix.acc, fix_age_ms: Math.max(0, now - fix.t) } : {};
      app.store.patchEvents(evs.map((e) => e.id), patch);
    }
  }

  // ---- delivery photos -------------------------------------------------
  // For addresses that complain about non-delivery: a photo of the paper in
  // the box, stamped with the address and time, saved to the run and ready to
  // send on WhatsApp.
  const watched = (l) => (S.watch[l.route] || []).includes(l.address_key);
  const photosOf = (l) => S.photos.filter((p) => p.run_id === l.run_id && p.address_key === l.address_key);
  const wantsPhoto = (l) => watched(l) || (l.flags || []).some((f) => f.type === 'complaint');
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  document.body.append(camInput);
  let camFor = null;
  camInput.addEventListener('change', () => {
    const f = camInput.files[0]; camInput.value = '';
    if (f && camFor) photoTaken(camFor, f);
  });
  function takePhoto(l) { camFor = l; camInput.click(); }

  async function photoTaken(l, file) {
    const when = new Date();
    const fix = geo.last && Date.now() - geo.last.t < 60000 ? geo.last : null;
    const addr = `${l.number} ${titleCase(l.street)}`;
    const stamp = [addr, `${shortRoute(l.route)} · ${when.toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`,
      `Delivered by ${app.me.name}${fix ? ` · GPS ${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : ''}`];
    let blob;
    try { blob = await stampPhoto(file, stamp); } catch { blob = file; }
    const name = `${addr.replace(/[^A-Za-z0-9]+/g, '-')}-${when.toISOString().slice(0, 16).replace(/[:T]/g, '')}.jpg`;
    const photoFile = new File([blob], name, { type: 'image/jpeg' });
    const shareText = `Delivered: ${addr}, ${when.toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} (${shortRoute(l.route)})`;

    // Taking the photo counts as delivering, if it isn't ticked yet.
    if (!status()[`${l.run_id}::${l.line_key}`]?.done) tap(l);

    const meta = { run_id: l.run_id, route: l.route, line_key: l.line_key, address_key: l.address_key, date, user_name: app.me.name, lat: fix?.lat, lng: fix?.lng };
    const saveMsg = h('div', { class: 'small muted' }, 'Saving to the run…');
    const save = async () => {
      saveMsg.className = 'small muted'; saveMsg.textContent = 'Saving to the run…';
      try {
        await app.store.savePhoto(blob, meta);
        S.photos.push({ ...meta, taken_at: when.toISOString() }); render();
        saveMsg.className = 'small ok'; saveMsg.textContent = app.store.mode === 'demo' ? 'Kept on this phone (demo mode).' : '✓ Saved to the run.';
      } catch (e) {
        saveMsg.className = 'small fail';
        saveMsg.replaceChildren(`Not saved yet (${navigator.onLine ? e.message : 'no signal'}). `, h('button', { class: 'link', style: 'padding:0', onclick: save }, 'Try again'));
      }
    };
    save();

    const url = URL.createObjectURL(photoFile);
    const watchBox = h('input', { type: 'checkbox', checked: watched(l), onchange: async (e) => {
      const on = e.target.checked;
      const list = new Set(S.watch[l.route] || []); if (on) list.add(l.address_key); else list.delete(l.address_key);
      S.watch[l.route] = [...list]; render();
      try { await app.store.setWatch(l.route, l.address_key, on, app.me.name); } catch (err) { toast(`Couldn't save that: ${err.message}`); }
    } });
    const canShareFile = !!(navigator.canShare && navigator.canShare({ files: [photoFile] }));
    const close = () => { panel.remove(); URL.revokeObjectURL(url); };
    const panel = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === panel) close(); } },
      h('div', { class: 'sheet photo-sheet' },
        h('h2', null, `📷 ${addr}`),
        h('img', { class: 'photo-preview', src: url, alt: `Delivery photo, ${addr}` }),
        saveMsg,
        h('button', { class: 'btn primary big', onclick: async () => {
          try {
            if (canShareFile) await navigator.share({ files: [photoFile], text: shareText });
            else { const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); toast('Photo downloaded. Send it from your gallery.'); }
          } catch { /* share closed */ }
        } }, canShareFile ? 'Send (WhatsApp…)' : 'Save photo to phone'),
        h('label', { class: 'choice' }, watchBox, h('span', null, 'Ask for a photo at this address every delivery')),
        h('div', { style: 'display:flex;gap:8px;margin-top:10px' },
          h('button', { class: 'btn', style: 'flex:1', onclick: () => { close(); takePhoto(l); } }, 'Take another'),
          h('button', { class: 'btn', style: 'flex:1', onclick: close }, 'Done'))));
    document.body.append(panel);
  }

  // How a run is laid out: a route layout (Run 8 village) if it has one,
  // otherwise street blocks in your order (or the sheet's).
  function groupsFor(d) {
    const layout = layoutFor(d.run.route);
    const lines = d.lines.map((l) => ({ ...l, route: d.run.route }));
    if (layout) return { fixed: true, ...arrange(layout, lines) };
    const groups = [];
    for (const l of applySequence(lines, S.useCustom ? S.seq[d.run.route]?.keys : null)) {
      const last = groups[groups.length - 1];
      if (last && last.street === l.street) last.lines.push(l); else groups.push({ type: 'street', street: l.street, lines: [l] });
    }
    return { fixed: false, groups };
  }

  function render() {
    const st = status();
    const isDone = (l) => !!st[`${l.run_id}::${l.line_key}`]?.done;
    const visibleRuns = S.show === 'all' ? S.data : S.data.filter((d) => d.run.id === S.show);
    const laid = visibleRuns.map((d) => ({ d, ...groupsFor(d) }));

    // Progress counts stops (a tile, or one handover bundle); copies count papers.
    let stops = 0; let stopsDone = 0; let copies = 0; let copiesDone = 0;
    for (const { groups } of laid) {
      for (const g of groups) {
        if (g.type === 'bundle') { stops += 1; if (g.lines.every(isDone)) stopsDone += 1; } else { stops += g.lines.length; stopsDone += g.lines.filter(isDone).length; }
        for (const l of g.lines) { copies += l.qty; if (isDone(l)) copiesDone += l.qty; }
      }
    }
    fbProg.replaceChildren(h('b', null, `${stopsDone}/${stops}`), ` · ${copiesDone}/${copies} copies`);
    fbFill.style.width = `${stops ? (100 * stopsDone) / stops : 0}%`;
    S.progress = { done: stopsDone, total: stops, runIds: visibleRuns.map((d) => d.run.id) };
    tick();

    const q = S.query;
    const match = (l) => !q || `${l.number} ${l.street} ${l.note || ''} ${l.pub}`.toLowerCase().includes(q);
    const visible = (l) => match(l) && !(S.todoOnly && isDone(l));
    const out = [];
    S.blocks = {};
    for (const { d, groups, fixed } of laid) {
      if (visibleRuns.length > 1 || fixed) {
        out.push(h('div', { class: 'route-divider' }, fixed ? `${shortRoute(d.run.route)} · ${layoutFor(d.run.route).name}` : shortRoute(d.run.route),
          !fixed && S.useCustom && hasCustom(d) ? ' · your order' : ''));
      }
      groups.forEach((g, gi) => {
        const id = `${d.run.id}:${gi}`;
        const nDone = g.lines.filter(isDone).length;
        const allDone = nDone === g.lines.length;
        if (g.type === 'bundle') {
          if (!g.lines.some(match) || (S.todoOnly && allDone)) return;
          out.push(h('section', { class: `street village ${allDone ? 'all-done' : ''}`, 'data-run': d.run.id, 'data-fixed': '1' },
            sectionHead(d, g.section, `${allDone ? 1 : 0}/1 · ${g.qty} papers`),
            bundleTile(d, g, st, allDone)));
          return;
        }
        if (g.type === 'section') {
          const banks = g.banks.map((b) => ({ ...b, shown: b.lines.filter(visible) })).filter((b) => b.shown.length);
          if (!banks.length) return;
          out.push(h('section', { class: `street village ${allDone ? 'all-done' : ''}`, 'data-run': d.run.id, 'data-fixed': '1' },
            sectionHead(d, g.section, `${nDone}/${g.lines.length}`),
            banks.map((b) => [
              b.label ? h('h3', { class: `bank ${b.id === '?' ? 'unmapped' : ''}` }, b.label,
                h('span', { class: 'count' }, `${b.lines.filter(isDone).length}/${b.lines.length}`)) : null,
              h('div', { class: 'tiles' }, b.shown.map((l) => tile(l, st[`${l.run_id}::${l.line_key}`], { fixed: true }))),
            ])));
          return;
        }
        const shown = g.lines.filter(visible);
        if (!shown.length) return;
        if (!fixed) S.blocks[id] = { runId: d.run.id, route: d.run.route, keys: g.lines.map((l) => l.address_key), label: titleCase(g.street) };
        const title = g.type === 'review' ? 'Needs review: not a known building' : titleCase(g.street);
        out.push(h('section', { class: `street ${g.type === 'review' ? 'review' : ''} ${allDone ? 'all-done' : ''}`, 'data-run': d.run.id, 'data-block': fixed ? null : id, 'data-fixed': fixed ? '1' : null },
          h('h2', null, title, h('span', { class: 'count' }, `${nDone}/${g.lines.length}`)),
          h('div', { class: 'tiles' }, shown.map((l) => tile(l, st[`${l.run_id}::${l.line_key}`], { fixed, showStreet: g.type === 'review' })))));
      });
    }
    if (!out.some((n) => n.tagName === 'SECTION')) {
      out.push(h('div', { class: 'finished' }, q ? 'No match.' : S.todoOnly && stopsDone === stops ? 'Run complete. Nice work.' : 'Nothing to show.'));
    }
    body.replaceChildren(...out);
    body.classList.toggle('as-list', layoutIsList());
    // The next stop: the first tile not yet done, in reading order.
    const next = body.querySelector('.tile:not(.done)');
    if (next && !q) next.classList.add('next');
    drawBar(q ? null : next);
    S.flash = null;
    const custom = S.data.some((d) => !layoutFor(d.run.route) && hasCustom(d));
    orderChip.hidden = !custom;
    orderChip.textContent = S.useCustom ? 'your order' : 'sheet order';
  }

  // Building header for a route layout: name, access code (from behind the login), progress.
  function sectionHead(d, section, countText) {
    const code = S.codes[d.run.route]?.[section.id];
    return h('h2', { class: 'building' },
      h('span', null, section.label),
      code ? h('span', { class: 'code', title: 'Door code' }, `🔑 ${code}`)
        : section.bundle ? null : h('button', { class: 'code add', onclick: (e) => { e.stopPropagation(); openCodes(d); } }, '+ code'),
      h('span', { class: 'count' }, countText));
  }

  // Edit door codes for a route's buildings. Saved behind the login, for everyone.
  function openCodes(d) {
    const layout = layoutFor(d.run.route);
    if (!layout) return;
    const cur = S.codes[d.run.route] || {};
    const inputs = {};
    const sections = layout.sections.filter((x) => !x.bundle);
    const close = () => panel.remove();
    const panel = h('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === panel) close(); } },
      h('form', {
        class: 'sheet',
        onsubmit: async (e) => {
          e.preventDefault();
          const codes = Object.fromEntries(sections.map((x) => [x.id, inputs[x.id].value.trim()]));
          try {
            await app.store.saveAccessCodes(d.run.route, codes, app.me.name);
            S.codes[d.run.route] = codes; close(); render(); toast('Door codes saved for everyone.');
          } catch (err) { toast(`Couldn’t save: ${err.message}`); }
        },
      },
      h('h2', null, `Door codes · ${layout.name}`),
      h('p', { class: 'small muted' }, 'Only signed-in family can see these. Changes are logged.'),
      sections.map((x) => h('label', { class: 'field' }, h('span', null, x.label),
        (inputs[x.id] = h('input', { value: cur[x.id] || '', autocomplete: 'off', inputmode: 'text', placeholder: 'e.g. 1234#' })))),
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit', style: 'flex:1' }, 'Save codes'))));
    document.body.append(panel);
  }

  // One tile for a whole handover, with what's in it listed underneath.
  function bundleTile(d, g, st, allDone) {
    const key = `bundle:${d.run.id}:${g.section.id}`;
    const pubs = {};
    for (const l of g.lines) for (const pt of partsOf(l)) pubs[pt.pub] = (pubs[pt.pub] || 0) + pt.qty;
    const last = allDone ? g.lines.map((l) => st[`${l.run_id}::${l.line_key}`]).sort((a, b) => (a.device_time < b.device_time ? 1 : -1))[0] : null;
    const someDone = !allDone && g.lines.some((l) => st[`${l.run_id}::${l.line_key}`]?.done);
    return h('button', {
      class: `tile bundle ${allDone ? 'done' : ''} ${S.flash === key ? 'flash' : ''}`,
      'aria-pressed': String(allDone), 'data-fixed': '1', 'data-key': key, 'data-label': g.section.label,
      'aria-label': `${g.section.label}, ${g.qty} papers in one handover${allDone ? ', done' : ''}`,
      onclick: () => { if (drag.suppressClick) return; tapMany(g.lines, `${g.section.label} (${g.qty} papers)`, key); },
    },
    h('div', { class: 'num' }, `${g.qty} papers`, h('span', { class: 'bundle-tag' }, 'one handover')),
    h('div', { class: 'pubs' }, Object.entries(pubs).map(([p, n]) => pubChip(p, n))),
    h('div', { class: 'composition' }, g.parts.map((p) => h('div', { class: 'comp' },
      h('div', { class: 'comp-head' }, h('b', null, p.label), ` ${p.qty}`),
      h('div', { class: 'comp-list' }, p.lines.map((l) => h('span', { class: 'who-line' },
        l.number, l.note ? ` ${l.note}` : '', (l.flags || []).some((f) => f.type === 'unrouted') ? h('i', null, ' (not routed)') : '')))))),
    someDone ? h('div', { class: 'flags' }, h('span', { class: 'flag weekday' }, 'Partly ticked: tap to finish')) : null,
    allDone ? h('div', { class: 'who' }, `${last?.user_name || ''} ${fmtTime(last.device_time)}`.trim()) : null);
  }

  // Elapsed time runs from the first tick on the runs shown (anyone's), and
  // stops at the last tick once everything is done.
  const fmtClock = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(t / 3600); const mm = Math.floor((t % 3600) / 60); const ss = t % 60;
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };
  const fmtDur = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 1) return 'under a min';
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  };
  function tick() {
    const p = S.progress;
    if (!p) return;
    const st = status();
    const times = S.events.filter((e) => e.done && p.runIds.includes(e.run_id)).map((e) => Date.parse(e.device_time)).filter(Number.isFinite);
    if (!times.length) { fbTime.textContent = 'Starts at first tick'; return; }
    const start = Math.min(...times);
    const complete = p.total > 0 && p.done === p.total;
    const lastDone = Math.max(...Object.values(st).filter((e) => e.done && p.runIds.includes(e.run_id)).map((e) => Date.parse(e.device_time)), start);
    if (complete) { fbTime.textContent = `✓ Done in ${fmtClock(lastDone - start)}`; return; }
    let text = `⏱ ${fmtClock(Date.now() - start)}`;
    if (p.done >= 5 && lastDone > start) {
      const per = (lastDone - start) / (p.done - 1);
      const rem = per * (p.total - p.done);
      text += rem < 60000 ? ' · nearly done' : ` · ~${fmtDur(rem)} to go`;
    }
    fbTime.textContent = text;
  }
  const clock = setInterval(tick, 1000);

  // A helper's tick: flash the tile and say who did what in the bar.
  let noteTimer;
  function showNote(text) {
    fbNote.textContent = text;
    floatbar.classList.add('has-note');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { floatbar.classList.remove('has-note'); fbNote.textContent = ''; }, 6000);
  }

  function pubChip(p, n, kind) {
    const c = pubColor(p, kind);
    const chip = h('span', { class: `pub ${c ? '' : 'nzh'}`, style: c ? `background:${c[0]};color:${c[1]}` : null }, isRetailPub(p) ? basePub(p) : p, n > 1 ? h('b', null, ` ×${n}`) : null);
    return isRetailPub(p) ? [chip, h('span', { class: 'pub docket' }, '+ DOCKET')] : chip;
  }

  function tile(l, ev, opts = {}) {
    const done = !!ev?.done;
    const key = `${l.run_id}::${l.line_key}`;
    const flags = l.flags || [];
    const parts = partsOf(l);
    const plainNZH = parts.length === 1 && parts[0].pub === 'NZH';
    const kind = tileKind(parts);
    const stripe = kind ? h('span', { class: 'stripe' }) : null;
    return h('button', {
      class: `tile ${done ? 'done' : ''} ${kind ? `has-pub kind-${kind}` : ''} ${S.flash === key ? 'flash' : ''}`,
      'aria-pressed': String(done),
      'aria-label': `${addrText(l)}, ${parts.map((pt) => `${pt.qty} ${pt.pub}`).join(' and ')}${done ? ', done' : ''}`,
      'data-key': key,
      'data-run': l.run_id,
      'data-addr': l.address_key,
      'data-label': addrText(l),
      'data-fixed': opts.fixed ? '1' : null,
      onclick: () => { if (drag.suppressClick) return; tap(l); },
    },
    stripe,
    h('div', { class: 'num' }, fmtNumber(l.number).main,
      plainNZH && l.qty > 1 ? h('span', { class: 'badge qty' }, `×${l.qty}`) : null),
    fmtNumber(l.number).sub ? h('div', { class: 'unit' }, fmtNumber(l.number).sub) : null,
    plainNZH ? null : h('div', { class: 'pubs' }, parts.map((pt) => pubChip(pt.pub, pt.qty, kind))),
    S.query || opts.showStreet ? h('div', { class: 'street-name' }, titleCase(l.street)) : null,
    l.bankNote ? h('div', { class: 'flags' }, h('span', { class: 'flag weekday', title: l.bankNote }, 'Check bank')) : null,
    flags.length ? h('div', { class: 'flags' }, flags.map((f) => h('span', { class: `flag ${f.type}`, title: f.text }, FLAG_LABEL[f.type] || f.type))) : null,
    ...flags.filter((f) => f.type === 'complaint' && f.text).map((f) => h('div', { class: 'flag-detail' }, f.text.replace(/^Complaint:\s*/, ''))),
    l.note ? h('div', { class: 'note' }, l.note) : null,
    (wantsPhoto(l) || photosOf(l).length) ? h('span', {
      class: `cam ${photosOf(l).length ? 'has' : ''}`, role: 'button', tabindex: '0',
      'aria-label': `Take a delivery photo at ${l.number} ${titleCase(l.street)}`,
      onclick: (e) => { e.stopPropagation(); e.preventDefault(); if (drag.suppressClick) return; takePhoto(l); },
    }, photosOf(l).length ? `📷 Photo taken (${photosOf(l).length})` : '📷 Take photo') : null,
    done ? h('div', { class: 'who' }, `${ev.user_name || ''} ${fmtTime(ev.device_time)}`.trim()) : null,
    done ? h('div', { class: 'done-word' }, 'DONE') : null);
  }

  // ---- the ⋯ menu: everything that isn't ticking lives here
  const visibleData = () => (S.show === 'all' ? S.data : S.data.filter((d) => d.run.id === S.show));
  function openMenu() {
    const hasLayout = data.some((d) => layoutFor(d.run.route));
    openSheet('Run options',
      (close) => h('div', { class: 'menu-group' },
        choiceRow('Show', [['all', 'All stops'], ['todo', 'To do only']], S.todoOnly ? 'todo' : 'all', (v) => { S.todoOnly = v === 'todo'; render(); }),
        S.data.some((d) => !layoutFor(d.run.route) && hasCustom(d))
          ? choiceRow('Order', [['mine', 'Your order'], ['sheet', 'Sheet order']], S.useCustom ? 'mine' : 'sheet', (v) => { S.useCustom = v === 'mine'; render(); }) : null,
        bigOn() ? null : choiceRow('Tiles', [['grid', 'Two across'], ['list', 'One per row']], pref('stb-layout', 'grid'), (v) => { setPref('stb-layout', v); render(); }),
        choiceRow('Text', [['normal', 'Normal'], ['big', 'Big']], bigOn() ? 'big' : 'normal', (v) => { if ((v === 'big') !== bigOn()) { toggleBig(); render(); close(); openMenu(); } }),
        choiceRow('Colours', THEMES, pref('stb-theme', 'night'), (v) => { setPref('stb-theme', v); applyTheme(); })),
      (close) => h('div', { class: 'menu-group' },
        menuItem('Find an address…', () => { close(); searchRow.hidden = false; search.focus(); }),
        menuItem('Text a link to this run', () => { close(); shareRuns(ids, `${label} ${fmtDate(date)}`); }, { hint: 'Anyone in the family can open it and help' }),
        hasLayout ? menuItem('Door codes…', () => { close(); const d = S.data.find((x) => layoutFor(x.run.route) && (S.show === 'all' || x.run.id === S.show)) || S.data.find((x) => layoutFor(x.run.route)); if (d) openCodes(d); }) : null,
        menuItem('Refresh', async () => { close(); S.events = await app.store.loadEvents(ids); S.seq = await app.store.loadSequences(Object.keys(S.seq)); render(); toast('Up to date.'); }),
        menuItem('How to move tiles', () => { close(); toast('Hold a tile or a street name, drag it, let go. Quick taps still tick.'); }),
        menuItem('Sheet checks', () => { close(); openSheet('Sheet checks', h('div', { class: 'checks-list' }, S.data.map((d) => h('div', { class: 'card' },
          h('b', null, shortRoute(d.run.route)),
          h('ul', { class: 'checks' }, (d.run.checks || []).map((c) => h('li', { class: c.ok ? 'ok' : 'fail' }, `${c.ok ? '✓' : '✗'} ${c.label}: ${c.got}/${c.expected}`))),
          (d.run.warnings || []).length ? h('ul', { class: 'warnings' }, d.run.warnings.map((w) => h('li', null, w))) : null)))); })),
      (close) => h('div', { class: 'menu-group' },
        menuItem('Put back in the sheet’s order…', () => {
          close();
          const runs = visibleData().filter(hasCustom);
          if (!runs.length) return toast('Already in sheet order.');
          if (!confirm(`Put ${runs.map((d) => shortRoute(d.run.route)).join(' + ')} back in the sheet's order? This changes it for everyone, for future runs too.`)) return;
          for (const d of runs) { S.seq[d.run.route] = null; app.store.saveSequence(d.run.route, null, app.me.name); }
          render();
        }, { danger: true }),
        menuItem('Untick everything…', () => {
          close();
          const st = status();
          const done = visibleData().flatMap((d) => d.lines.map((l) => ({ ...l, route: d.run.route }))).filter((l) => st[`${l.run_id}::${l.line_key}`]?.done);
          if (!done.length) return toast('Nothing is ticked.');
          if (!confirm(`Untick all ${done.length} completed deliveries? Everyone sharing this run will see it.`)) return;
          for (const l of done) {
            const ev = { id: uuid(), run_id: l.run_id, line_key: l.line_key, address_key: l.address_key, route: l.route, done: false, user_name: app.me.name, device_time: new Date().toISOString(), device: deviceLabel() };
            S.events.push(ev); app.store.addEvent(ev);
          }
          S.last = null; render();
        }, { danger: true })));
  }

  mount(
    h('header', { class: 'rh' },
      h('div', { class: 'rh-row' },
        h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Back to runs' }, '‹'),
        h('div', { class: 'rh-title' },
          h('h1', null, data.map((d) => shortRoute(d.run.route)).join(' + ')),
          h('div', { class: 'rh-status' }, fmtDate(date), withChip, orderChip, gpsChip, syncChip)),
        h('button', { class: 'icon-btn search-btn', 'aria-label': 'Find an address', onclick: () => { searchRow.hidden = !searchRow.hidden; if (!searchRow.hidden) search.focus(); } }, '🔍'),
        h('button', { class: 'icon-btn', 'aria-label': 'Run options', onclick: openMenu }, '⋯')),
      floatbar,
      seg ? h('div', { class: 'rh-row' }, seg) : null,
      searchRow,
      fbFill),
    body,
    actionbar);

  // ------------------------------------------------------------ hold to move
  // Hold a tile (or a street name) ~half a second: it lifts and follows your
  // finger. Let go to drop it before/after the tile underneath. A quick tap
  // still ticks; a normal swipe still scrolls.
  const HOLD_MS = 450;
  const drag = { timer: null, active: null, suppressClick: false, x: 0, y: 0, raf: null, target: null };

  function clearMarks() {
    body.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  }
  function startDrag(el, kind, x, y) {
    drag.timer = null;
    // A long hold is never a tap, even if moving isn't allowed here.
    drag.suppressClick = true;
    clearTimeout(drag.sTimer);
    if (!S.useCustom && S.data.some(hasCustom)) { toast('Switch back to your order (•••) to move tiles.'); return; }
    if (S.todoOnly || S.query) { toast('Show all stops and close search (⋯ menu) to move tiles, so you can see where they land.'); return; }
    if (el.closest('[data-fixed]')) { toast('This run follows its own layout rules (building order, banks), so tiles can’t be moved here.'); return; }
    const src = kind === 'tile' ? el : el.closest('.street');
    const runId = src.dataset.run;
    const keys = kind === 'tile' ? [el.dataset.addr] : S.blocks[src.dataset.block].keys;
    const r = (kind === 'tile' ? el : el).getBoundingClientRect();
    const ghost = (kind === 'tile' ? el : el).cloneNode(true);
    ghost.classList.add('ghost');
    Object.assign(ghost.style, { width: `${r.width}px`, left: '0px', top: '0px' });
    document.body.append(ghost);
    src.classList.add('drag-src');
    document.body.classList.add('is-dragging');
    drag.active = { kind, runId, keys, src, ghost, offX: x - r.left, offY: y - r.top, label: kind === 'tile' ? el.querySelector('.num')?.firstChild?.textContent : S.blocks[src.dataset.block].label };
    if (navigator.vibrate) navigator.vibrate(30);
    moveGhost(x, y);
    autoScroll();
  }
  function moveGhost(x, y) {
    const a = drag.active;
    drag.x = x; drag.y = y;
    a.ghost.style.transform = `translate(${x - a.offX}px, ${y - a.offY}px) rotate(-1.5deg) scale(1.03)`;
    clearMarks();
    drag.target = null;
    const under = document.elementFromPoint(x, y);
    if (!under) return;
    if (a.kind === 'tile') {
      let t = under.closest('.tile');
      let after = false;
      if (t && t.dataset.run === a.runId && t !== a.src) {
        const rc = t.getBoundingClientRect();
        after = y > rc.bottom - rc.height * 0.25 || (y >= rc.top + rc.height * 0.25 && x > rc.left + rc.width / 2);
      } else {
        const head = under.closest('.street');
        if (!head || head.dataset.run !== a.runId) return;
        const tiles = [...head.querySelectorAll('.tile')].filter((n) => n !== a.src);
        if (!tiles.length) return;
        // over a street name: drop at the start; over the gap below the tiles: drop at the end
        const first = tiles[0].getBoundingClientRect();
        if (y < first.top) { t = tiles[0]; after = false; } else { t = tiles[tiles.length - 1]; after = true; }
      }
      t.classList.add(after ? 'drop-after' : 'drop-before');
      drag.target = { anchor: t.dataset.addr, after };
    } else {
      const sec = under.closest('.street');
      if (!sec || sec.dataset.run !== a.runId || sec === a.src) return;
      const rc = sec.getBoundingClientRect();
      const after = y > rc.top + rc.height / 2;
      sec.classList.add(after ? 'drop-after' : 'drop-before');
      const keys = S.blocks[sec.dataset.block].keys;
      drag.target = { anchor: after ? keys[keys.length - 1] : keys[0], after };
    }
  }
  // While a tile or street is lifted, hold it near the top or bottom of the
  // screen and the list scrolls that way: faster the closer to the edge, and
  // speeding up the longer it's held there, until you let go or move away.
  function autoScroll() {
    if (!drag.active) return;
    const top = Math.max(0, document.querySelector('.rh')?.getBoundingClientRect().bottom || 0);
    const bottom = (window.visualViewport ? window.visualViewport.height : innerHeight) - (document.querySelector('.actionbar')?.getBoundingClientRect().height || 0);
    const zone = Math.max(90, (bottom - top) * 0.18);
    let dir = 0, depth = 0;
    if (drag.y < top + zone) { dir = -1; depth = (top + zone - drag.y) / zone; }
    else if (drag.y > bottom - zone) { dir = 1; depth = (drag.y - (bottom - zone)) / zone; }
    if (dir) {
      drag.edgeSince ||= performance.now();
      const held = Math.min(2, 1 + (performance.now() - drag.edgeSince) / 1500);
      const step = Math.round((3 + 22 * Math.min(1, depth) ** 2) * held);
      const before = window.scrollY;
      window.scrollBy(0, dir * step);
      if (window.scrollY !== before) moveGhost(drag.x, drag.y);
    } else drag.edgeSince = 0;
    drag.raf = requestAnimationFrame(autoScroll);
  }
  function endDrag(drop) {
    const a = drag.active;
    if (!a) return;
    cancelAnimationFrame(drag.raf);
    drag.edgeSince = 0;
    a.ghost.remove();
    a.src.classList.remove('drag-src');
    document.body.classList.remove('is-dragging');
    clearMarks();
    drag.active = null;
    drag.suppressClick = true;
    setTimeout(() => { drag.suppressClick = false; }, 350);
    const tgt = drag.target;
    drag.target = null;
    if (!drop || !tgt) { render(); return; }
    const d = S.data.find((x) => x.run.id === a.runId);
    const route = d.run.route;
    const before = S.seq[route] || null;
    const current = orderedLines(d).map((l) => l.address_key);
    const next = moveKeys(current, a.keys, tgt.anchor, tgt.after);
    if (next.join() === current.join()) { render(); return; }
    const merged = mergeOrder(before?.keys, next);
    S.seq[route] = { keys: merged, by: app.me.name, at: new Date().toISOString() };
    S.useCustom = true;
    app.store.saveSequence(route, merged, app.me.name);
    render();
    toast(`Moved ${a.label || 'it'}. Saved for future ${shortRoute(route)} runs.`, {
      label: 'Undo',
      fn: () => { S.seq[route] = before; app.store.saveSequence(route, before?.keys || null, app.me.name); render(); },
    });
  }
  body.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || drag.active) return;
    const tileEl = e.target.closest('.tile');
    const headEl = tileEl ? null : e.target.closest('.street h2');
    if (!tileEl && !headEl) return;
    drag.x = e.clientX; drag.y = e.clientY;
    drag.sx = e.clientX; drag.sy = e.clientY;
    clearTimeout(drag.timer);
    drag.timer = setTimeout(() => startDrag(tileEl || headEl, tileEl ? 'tile' : 'block', drag.x, drag.y), HOLD_MS);
  });
  const onMove = (e) => {
    if (drag.active) { moveGhost(e.clientX, e.clientY); return; }
    if (drag.timer && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10) { clearTimeout(drag.timer); drag.timer = null; }
    drag.x = e.clientX; drag.y = e.clientY;
  };
  const onUp = () => {
    clearTimeout(drag.timer); drag.timer = null;
    if (drag.active) { endDrag(true); return; }
    if (drag.suppressClick) { clearTimeout(drag.sTimer); drag.sTimer = setTimeout(() => { drag.suppressClick = false; }, 350); }
  };
  const onCancel = () => { clearTimeout(drag.timer); drag.timer = null; endDrag(false); };
  // Once a tile is lifted, stop the page scrolling under the finger.
  const blockScroll = (e) => { if (drag.active) e.preventDefault(); };
  const noMenu = (e) => { if (e.target.closest?.('.tile, .street h2')) e.preventDefault(); };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  document.addEventListener('touchmove', blockScroll, { passive: false });
  body.addEventListener('contextmenu', noMenu);

  render();
  try {
    if (!localStorage.getItem('stb.hint.move')) {
      localStorage.setItem('stb.hint.move', '1');
      setTimeout(() => toast('Tip: hold a tile or street name to move it.'), 800);
    }
  } catch { /* no storage */ }

  // Live updates: other phones on the same run (helpers jumping in).
  const findLine = (runId, key) => S.data.find((d) => d.run.id === runId)?.lines.find((l) => l.line_key === key);
  const unsub = app.store.subscribe(ids, app.me, {
    routes: Object.keys(S.seq),
    event: (ev) => {
      if (S.events.some((e) => e.id === ev.id)) return;
      S.events.push(ev);
      const l = findLine(ev.run_id, ev.line_key);
      if (l) {
        const lay = layoutFor(l.route || S.data.find((d) => d.run.id === ev.run_id)?.run.route);
        const bundle = lay?.sections.find((sec) => sec.bundle && sec.streets.includes(l.street));
        if (ev.done) S.flash = bundle ? `bundle:${ev.run_id}:${bundle.id}` : `${ev.run_id}::${ev.line_key}`;
        showNote(`${ev.user_name || 'Someone'} ${ev.done ? '✓' : 'unticked'} ${l.number} ${titleCase(l.street)}`);
      }
      if (!drag.active) render();
    },
    presence: (names) => {
      withChip.hidden = !names.length;
      withChip.textContent = names.length === 1 ? `with ${names[0]}` : `with ${names.length} others`;
      withChip.title = names.join(', ');
    },
    seq: (route, v) => {
      if (drag.active) return;
      S.seq[route] = v;
      render();
      showNote(v ? `${v.by || 'Someone'} changed the order` : 'Order reset to the sheet');
    },
    reconnect: () => refresh(),
    runChanged: async (run) => {
      if (drag.active) return;
      try {
        S.data = await app.store.loadRuns(ids);
        render();
        showNote(`${run.route || 'Run'} sheet updated ${fmtTime(run.updated_at || new Date().toISOString())}`);
      } catch { /* keep showing the old sheet; next refresh will pick it up */ }
    },
  });
  async function refresh() {
    if (document.visibilityState !== 'visible' || drag.active) return;
    S.events = await app.store.loadEvents(ids);
    S.seq = await app.store.loadSequences(Object.keys(S.seq));
    if (!drag.active) render();
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('pagehide', unsub); // closing the app: drop off "who's on this run" straight away
  const poll = app.store.mode === 'shared' ? setInterval(refresh, 30000) : null;

  // keep the screen awake while a run is open
  let lock = null;
  const wake = async () => { try { if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ } };
  wake();
  document.addEventListener('visibilitychange', wake);

  app.cleanup = () => {
    camInput.remove();
    endDrag(false);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('touchmove', blockScroll);
    geo.stop(); unsub(); offSync(); clearInterval(poll); clearInterval(clock); clearTimeout(noteTimer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('pagehide', unsub);
    document.removeEventListener('visibilitychange', refresh);
    document.removeEventListener('visibilitychange', wake);
    if (lock) lock.release().catch(() => {});
  };
}

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

boot().catch((e) => {
  console.error(e);
  mount(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, `Something went wrong starting the app: ${e.message}`)));
});
