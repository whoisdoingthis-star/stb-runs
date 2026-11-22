// Stan's School (Mike, 23 Nov 2026; decision 0065). Stan walks you through the app, course by course, reading each card
// in his recorded voice. Everything here comes from the app's own code: the courses from js/training.js, the words from
// the What's new cards (js/whatsnew.js), the pictures from the real app (learn/shots/, taken by tools/training-shots.py).
// Nothing here needs a sign-in; signed in on this phone, what you finish is saved to your name.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { COURSES, TASKS, courseSteps, coursesFor, addLocalProgress, localProgress } from '../js/training.js';
import { UPDATES, whoText } from '../js/whatsnew.js';
import { clipUrl } from '../js/stanlines.js';
import { playStanClip } from '../js/stanfx.js';
import { stan } from '../js/stan.js';
import { syncTraining, cachedTraining } from '../js/training-sync.js';

const root = document.getElementById('school');
const ORDER = ['driver', 'helper', 'more', 'dispatcher'];
const FOR = { driver: 'For drivers', helper: 'For helpers', dispatcher: 'For dispatch', all: 'For everyone' };
const SEEN = 'stb.learn.seen';   // { course: furthest step reached }

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
const fmtDay = (d) => new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const done = () => new Set([...(me?.done || []), ...localProgress().map((x) => x.item)]);

// ---- who's here (optional) ----
let me = cachedTraining(); let sb = null;
async function connect() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try { const { createClient } = await import('../vendor/supabase.mjs'); sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } }); me = (await syncTraining(sb)) || null; } catch { /* the school works without it */ }
}
const finish = async (item) => { addLocalProgress(item); if (sb) me = (await syncTraining(sb)) || me; };

// ---- Stan's voice ----
let ctx = null; let playing = null; let reading = false; let gen = 0;
const stamp = (s) => { let x = 5381; for (const c of String(s)) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(36); };
function stopVoice() { gen += 1; try { playing?.stop(); } catch { /* done */ } playing = null; }
/** Reads a step aloud. Returns 'played' | 'stopped' | 'none' (not recorded yet) | 'silent'. */
async function say(step) {
  stopVoice(); const mine = gen;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') await ctx.resume();
    if (!SUPABASE_URL) return 'none';
    const res = await fetch(clipUrl(SUPABASE_URL, step.sayKey, stamp(step.say))); if (!res.ok) return 'none';
    const buf = await ctx.decodeAudioData(await res.arrayBuffer()); if (mine !== gen) return 'stopped';
    return await new Promise((ok) => { const src = playStanClip(ctx, buf); playing = src; src.onended = () => ok(mine === gen ? 'played' : 'stopped'); });
  } catch { return 'silent'; }
}

// ---- screens ----
function route() {
  stopVoice();
  const q = new URLSearchParams(location.search); const hash = location.hash.slice(1);
  const card = /^card-(.+)$/.exec(hash);
  if (card) { const c = coursesFor(card[1])[0]; const i = c ? courseSteps(c).findIndex((s) => s.id === card[1] || (s.covers || []).includes(card[1])) : -1; location.replace(c ? `#/c/${c}/${Math.max(0, i)}` : '#'); return; }
  const m = /^\/c\/(\w+)\/(\d+)$/.exec(hash);
  if (m && COURSES[m[1]]) return viewStep(m[1], Number(m[2]));
  if (!hash && q.get('course') && COURSES[q.get('course')]) { history.replaceState(null, '', `${location.pathname}#/c/${q.get('course')}/0`); return viewStep(q.get('course'), 0); }
  return viewHome();
}

function viewHome() {
  const got = done(); const seen = ls.get(SEEN, {});
  const courseCard = (id) => {
    const c = COURSES[id]; const n = courseSteps(id).length; const at = Math.min(n, (seen[id] ?? -1) + 1); const fin = got.has(`course:${id}`);
    return h('a', { class: `sc-course ${fin ? 'fin' : ''}`, href: `#/c/${id}/${fin || at >= n ? 0 : at}` },
      h('div', { class: 'sc-course-top' }, h('b', null, c.title), h('span', { class: 'chip' }, FOR[c.for])),
      h('p', { class: 'small muted' }, c.intro),
      h('div', { class: 'sc-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': fin ? n : at }, h('i', { style: `width:${Math.round(((fin ? n : at) / n) * 100)}%` })),
      h('div', { class: 'small' }, fin ? '✓ Finished · go through it again' : at ? `${at} of ${n} · carry on` : `${n} cards · start`, c.core ? h('span', { class: 'sc-need' }, ' · needed before driving') : null));
  };
  const recent = [...UPDATES].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  root.replaceChildren(h('div', { class: 'page sc' },
    h('div', { class: 'sc-hello' }, stan({ pose: 'wave', size: 84 }),
      h('div', null, h('div', { class: 'brand' }, 'Send The Boy'), h('h1', null, 'Stan’s School'),
        h('p', { class: 'muted' }, me?.name ? `Hello, ${me.name}. What you finish is saved to your name.` : 'Sign in on the app on this phone and what you finish is saved to your name. Until then it stays on this phone.'))),
    me?.needs && me.left?.length ? h('div', { class: 'banner warn' }, `Before your first run as a driver: ${me.left.length} thing${me.left.length > 1 ? 's' : ''} to finish. The driver course, then its practice in Sandbox Stan.`) : null,
    h('h2', { class: 'sc-h' }, 'Courses'),
    h('div', { class: 'sc-grid' }, ORDER.map(courseCard)),
    h('h2', { class: 'sc-h' }, 'Practise in Sandbox Stan'),
    h('p', { class: 'small muted' }, 'The real app, with made-up runs. Nothing you do there reaches the real runs, and you can start again any time.'),
    h('div', { class: 'sc-tasks' }, Object.entries(TASKS).map(([id, t]) => h('a', { class: `sc-task ${got.has(`task:${id}`) ? 'fin' : ''}`, href: `../sandbox/?task=${id}` },
      h('span', { class: 'sc-tick', 'aria-hidden': 'true' }, got.has(`task:${id}`) ? '✓' : '○'),
      h('span', null, h('b', null, t.title), h('span', { class: 'small muted' }, ` · ${COURSES[t.course].title}`), got.has(`task:${id}`) ? h('span', { class: 'sr-only' }, ' (done)') : null)))),
    h('h2', { class: 'sc-h' }, 'What’s new lately'),
    h('div', { class: 'sc-news' }, recent.map((u) => h('a', { class: 'sc-newsrow', href: `#card-${u.id}` }, h('span', { class: 'small muted' }, `${fmtDay(u.date)} · ${whoText(u)}`), h('b', null, u.title)))),
    h('p', { class: 'small muted sc-foot' }, h('a', { href: '../' }, '‹ Back to the app'))));
}

function viewStep(id, i) {
  const c = COURSES[id]; const steps = courseSteps(id); const n = steps.length;
  if (i >= n) return viewFinished(id);
  const s = steps[Math.max(0, i)]; const seen = ls.get(SEEN, {}); if ((seen[id] ?? -1) < i) ls.set(SEEN, { ...seen, [id]: i });
  const status = h('span', { class: 'small muted', role: 'status' });
  const speak = h('button', { class: 'btn sc-say', 'aria-pressed': String(reading), onclick: () => { if (reading) { reading = false; stopVoice(); draw(); return; } reading = true; draw(); readNow(); } });
  const draw = () => { speak.textContent = reading ? '🔇 Stop reading' : '🔊 Stan, read it to me'; speak.setAttribute('aria-pressed', String(reading)); };
  const readNow = async () => {
    status.textContent = '';
    const r = await say(s);
    if (r === 'none') status.textContent = 'Stan hasn’t recorded this one yet. The words are all here.';
    else if (r === 'silent') status.textContent = 'This phone won’t play sound right now.';
    if (r === 'played' && reading && location.hash === `#/c/${id}/${i}`) setTimeout(() => { if (reading && location.hash === `#/c/${id}/${i}`) location.hash = `#/c/${id}/${i + 1}`; }, 900);
    if (r !== 'played' && r !== 'stopped') { reading = false; draw(); }
  };
  draw();
  root.replaceChildren(h('div', { class: 'page sc sc-step' },
    h('div', { class: 'topbar' }, h('a', { class: 'icon-btn', href: '#', 'aria-label': 'Back to Stan’s School' }, '‹'), h('h1', null, c.title), h('span', { class: 'small muted' }, `${i + 1} of ${n}`)),
    h('div', { class: 'sc-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(((i + 1) / n) * 100)}%` })),
    h('article', { class: 'sc-card' },
      h('div', { class: 'sc-kicker' }, s.card ? `${whoText(UPDATES.find((u) => u.id === s.id))} · since ${fmtDay(s.date)}` : 'Stan’s School'),
      h('h2', null, s.title),
      s.shot ? h('img', { class: 'sc-shot', src: `shots/${s.shot}.png`, alt: `The app: ${s.title}`, loading: 'lazy', onerror: (e) => e.target.remove() }) : h('div', { class: 'sc-stan' }, stan({ pose: i % 2 ? 'point' : 'talk', size: 72 })),
      h('p', { class: 'sc-what' }, s.what),
      s.why ? h('p', { class: 'sc-why' }, h('b', null, 'Why: '), s.why) : null,
      h('div', { class: 'sc-voice' }, speak, status)),
    h('div', { class: 'sc-nav' },
      h('a', { class: 'btn big', href: i > 0 ? `#/c/${id}/${i - 1}` : '#', 'aria-label': 'Back' }, '‹ Back'),
      h('a', { class: 'btn primary big', href: `#/c/${id}/${i + 1}` }, i + 1 < n ? 'Next ›' : 'Finish ✓'))));
  if (reading) readNow();
}

async function viewFinished(id) {
  reading = false; const c = COURSES[id];
  await finish(`course:${id}`);
  const got = done();
  root.replaceChildren(h('div', { class: 'page sc' },
    h('div', { class: 'sc-hello' }, stan({ pose: 'hop', size: 84 }), h('div', null, h('h1', null, `${c.title}: done!`), h('p', { class: 'muted' }, me?.name ? 'Saved to your name.' : 'Saved on this phone.'))),
    c.tasks.length ? [h('h2', { class: 'sc-h' }, 'Now practise it'),
      h('p', { class: 'small muted' }, 'Sandbox Stan is the real app with made-up runs. Do each one there; it ticks itself off when you’ve done it.'),
      h('div', { class: 'sc-tasks' }, c.tasks.map((t) => h('a', { class: `sc-task ${got.has(`task:${t}`) ? 'fin' : ''}`, href: `../sandbox/?task=${t}` }, h('span', { class: 'sc-tick', 'aria-hidden': 'true' }, got.has(`task:${t}`) ? '✓' : '○'), h('span', null, h('b', null, TASKS[t].title), h('br'), h('span', { class: 'small muted' }, TASKS[t].ask)))))] : null,
    h('a', { class: 'btn primary big', href: c.tasks.length ? `../sandbox/?task=${c.tasks.find((t) => !got.has(`task:${t}`)) || c.tasks[0]}` : '#', style: 'margin-top:16px' }, c.tasks.length ? 'Open Sandbox Stan' : 'Back to Stan’s School'),
    h('a', { class: 'btn big', href: '#', style: 'margin-top:8px' }, 'Stan’s School')));
}

window.addEventListener('hashchange', route);
window.addEventListener('keydown', (e) => { const m = /^#\/c\/(\w+)\/(\d+)$/.exec(location.hash); if (!m) return; if (e.key === 'ArrowRight') location.hash = `#/c/${m[1]}/${Number(m[2]) + 1}`; if (e.key === 'ArrowLeft' && Number(m[2]) > 0) location.hash = `#/c/${m[1]}/${Number(m[2]) - 1}`; });
route();
connect().then(() => { if (!/^#\/c\//.test(location.hash)) route(); });
// Swipe left and right between cards, like turning pages.
let x0 = null;
window.addEventListener('touchstart', (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
window.addEventListener('touchend', (e) => {
  const m = /^#\/c\/(\w+)\/(\d+)$/.exec(location.hash); if (!m || x0 == null) return;
  const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) < 70) return;
  if (dx < 0) location.hash = `#/c/${m[1]}/${Number(m[2]) + 1}`; else if (Number(m[2]) > 0) location.hash = `#/c/${m[1]}/${Number(m[2]) - 1}`;
}, { passive: true });
