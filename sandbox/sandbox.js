// Sandbox Stan (Mike, 23 Nov 2026; decision 0065): the real app, running in demo mode on made-up practice runs, with a
// practice bar on top. It is the same code the family uses (js/app.js), so practice can never fall behind the app.
//
// Safety first: everything the app saves here goes into its own corner of the phone's storage ("sbx:" in front of every
// name), so practice can never touch the real app's runs, duty or odometer on the same phone. If this browser won't let
// us set that up, the sandbox refuses to start rather than risk it.

import { TASKS, COURSES, addLocalProgress, localProgress } from '../js/training.js';

const REAL = window.localStorage;
const P = 'sbx:';
const SHARED = new Set(['stb-theme', 'stb-big', 'stb-sfx', 'stb-stan']);   // this phone's display settings: the same in and out of practice

/** The app's storage, kept apart from the real app's. */
const box = {
  getItem: (k) => REAL.getItem(SHARED.has(k) ? k : P + k),
  setItem: (k, v) => REAL.setItem(SHARED.has(k) ? k : P + k, String(v)),
  removeItem: (k) => REAL.removeItem(SHARED.has(k) ? k : P + k),
  key: (i) => { const ks = []; for (let j = 0; j < REAL.length; j++) { const k = REAL.key(j); if (k.startsWith(P)) ks.push(k.slice(P.length)); } return ks[i] ?? null; },
  get length() { let n = 0; for (let j = 0; j < REAL.length; j++) if (REAL.key(j).startsWith(P)) n += 1; return n; },
  clear: () => { for (let j = REAL.length - 1; j >= 0; j--) { const k = REAL.key(j); if (k.startsWith(P)) REAL.removeItem(k); } },
};

const bar = document.getElementById('sbx-bar');
const params = new URLSearchParams(location.search);
const nzToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const role = params.get('as') === 'helper' || TASKS[params.get('task')]?.course === 'helper' ? 'helper' : 'driver';

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Fresh practice runs for today, as the person (a driver or a helper) the task is for. */
async function seed(force = false) {
  const was = box.getItem('sbx.seed');
  if (!force && was === `${nzToday()}|${role}`) return;
  box.clear();
  const [{ LocalStore }, { practiceRuns }] = await Promise.all([import('../js/store.js'), import('../js/practice-data.js')]);
  const store = new LocalStore(); const ids = [];
  for (const r of practiceRuns(nzToday())) ids.push(await store.saveRun(r, 'practice-sheet.pdf'));
  box.setItem('stb.crew', JSON.stringify([{ name: 'Me', crew: role }, { name: 'Jo (practice)', crew: 'driver' }, { name: 'Sam (practice)', crew: 'helper' }]));
  box.setItem('stb.myruns', JSON.stringify({ date: nzToday(), ids: ids.reverse() }));
  box.setItem('stb.updateseen', JSON.stringify([]));
  box.setItem('sbx.seed', `${nzToday()}|${role}`);
}

// ---- the practice bar ----
let current = TASKS[params.get('task')] ? params.get('task') : null;
let open = false; let sb = null;
const doneSet = () => new Set(localProgress(REAL).map((x) => x.item));
function draw(justDone) {
  const got = doneSet();
  const mine = Object.entries(TASKS).filter(([, t]) => t.course === role);
  const next = current && !got.has(`task:${current}`) ? current : mine.find(([id]) => !got.has(`task:${id}`))?.[0] || null;
  const t = next ? TASKS[next] : null;
  bar.replaceChildren(...[
    h('div', { class: 'sbx-row' },
      h('div', { class: 'sbx-task' },
        h('div', { class: 'sbx-tag' }, 'Sandbox Stan · practice, nothing is real'),
        justDone ? h('b', { class: 'sbx-done', role: 'status' }, `✓ Done: ${TASKS[justDone].title}`) : null,
        t ? [h('b', null, t.title), h('span', null, t.ask)] : h('b', { class: 'sbx-done' }, `✓ All the ${COURSES[role].title.toLowerCase()} practice is done.`)),
      h('button', { class: 'btn', 'aria-expanded': String(open), onclick: () => { open = !open; draw(); } }, open ? 'Close' : 'More')),
    open ? h('div', { class: 'sbx-list' },
      ...mine.map(([id, x]) => h('button', { class: `btn ${id === next ? 'primary' : ''}`, onclick: () => { current = id; open = false; draw(); } }, `${got.has(`task:${id}`) ? '✓' : '○'} ${x.title}`)),
      h('button', { class: 'btn', onclick: async () => { if (!confirm('Start the practice runs again from the beginning? (Your ticked-off practice tasks stay ticked.)')) return; await seed(true); location.replace(`${location.pathname}${location.search}`); } }, '↺ Start the practice runs again'),
      h('a', { class: 'btn', href: '../learn/' }, '‹ Stan’s School'),
      h('a', { class: 'btn', href: '../' }, '‹ The real app')) : null].filter(Boolean));
}
/** Ticks off any practice task the app's own records show has been done. */
async function check() {
  let fresh = null;
  for (const [id, t] of Object.entries(TASKS)) {
    if (doneSet().has(`task:${id}`)) continue;
    let ok = false; try { ok = t.done(box); } catch { /* not yet */ }
    if (ok && addLocalProgress(`task:${id}`, REAL)) fresh = id;
  }
  if (fresh) {
    draw(fresh);
    try { (await import('../js/sfx.js')).playSfx?.('done'); } catch { /* no sound */ }
    if (sb) { const { syncTraining } = await import('../js/training-sync.js'); syncTraining(sb, REAL).catch(() => {}); }
  }
}
async function connect() {
  // Signed in on the real app on this phone? Then practice is saved to your name. (The real sign-in, read from the real storage.)
  try {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('../config.js'); if (!SUPABASE_URL) return;
    const { createClient } = await import('../vendor/supabase.mjs');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: REAL } });
    const { syncTraining } = await import('../js/training-sync.js'); await syncTraining(sb, REAL);
  } catch { /* practice works without it */ }
}

async function start() {
  try { Object.defineProperty(window, 'localStorage', { value: box, configurable: true }); } catch { /* checked next */ }
  if (window.localStorage !== box) {
    document.getElementById('app').replaceChildren(h('div', { class: 'page' }, h('div', { class: 'banner bad' }, 'Sandbox Stan can’t run safely in this browser, so it hasn’t started. Try Chrome or Safari.'), h('a', { class: 'btn big', href: '../learn/' }, 'Stan’s School')));
    return;
  }
  globalThis.__stbSandbox = true;
  globalThis.__stbFakeDest = null;
  await seed();
  draw();
  await import('../js/app.js');
  setInterval(check, 1500);
  connect();
}
start();
