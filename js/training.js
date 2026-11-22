// Stan's School (Mike, 23 Nov 2026; decision 0065): the training site, the practice app and who has done what.
//
// The courses are built from the What's new cards (js/whatsnew.js), so a lesson says exactly what the card says and Stan
// reads it with the clip already recorded for the card. A course can also have steps of its own (a welcome, how to
// practise), with their own spoken line. Because every card has to sit in a course (test/training.mjs fails otherwise),
// a change can't be published without its lesson, and a card marked `replaced` can't stay in one.
//
//   COURSES   id → { title, for, core, intro, steps: [ 'card id' | own step ], tasks: [task ids] }
//             own step: { id, title, what, why, say (≤300 characters, for the ear), covers: [card ids it teaches] }
//             shot: an optional picture of the real app for a step (learn/shots/<name>.png, taken by tools/training-shots.py)
//   TASKS     id → { title, ask, done(S) }: a thing to do in Sandbox Stan. S reads the sandbox's own storage.
//   NEEDED    what a new driver must finish before they can go on duty as a driver (Mike, 23 Nov 2026)

import { UPDATES } from './whatsnew.js';

export const COURSES = {
  driver: {
    title: 'New driver', for: 'driver', core: true,
    intro: 'Everything a driver needs for a morning: on duty, the odometer, ticking, what to do when it goes wrong, and finishing up.',
    steps: [
      { id: 'hello', title: 'Hello, driver', what: 'This is how a morning goes in Send The Boy, in the order you’ll do it. Tap 🔊 and I’ll read each card to you. Back and Next move between them.',
        why: 'The app keeps the record that proves every delivery. It only works if everyone uses it the same way.',
        say: "Hello, driver. Stan here. I'll walk you through a morning, in the order you'll do it. Tap next when you're ready. At the end, you'll practise it all in my sandbox, where nothing is real." },
      '2026-11-12-on-duty', '2026-11-19-crew', '2026-11-10-depot-pick', '2026-11-22-location', '2026-11-22-odometer',
      '2026-11-08-ticking', '2026-11-21-sounds', '2026-11-09-problem', '2026-11-08-photos', '2026-11-13-new-start-photo',
      '2026-11-23-comes-back', '2026-11-22-not-your-run', '2026-11-22-handover', '2026-11-22-last-delivery', '2026-11-22-spares',
      { id: 'practise', title: 'Now practise it', what: 'Open Sandbox Stan and do the four practice tasks: go on duty, tick some stops, record one you couldn’t deliver, and finish the shift. Practice runs only, nothing real.',
        why: 'Doing it once with nobody waiting is how it sticks. When the four are done, you can go on duty as a driver.',
        say: "Now it's your turn. Open my sandbox and do the four practice tasks. Go on duty, tick some stops, record one you couldn't deliver, and finish the shift. Nothing there is real, so you can't break anything." },
    ],
    tasks: ['go-on-duty', 'tick', 'cant-deliver', 'finish'],
  },
  helper: {
    title: 'New helper', for: 'helper', core: false,
    intro: 'Riding with a driver: saying who you’re with, ticking your side, and what to do when a stop goes wrong.',
    steps: [
      { id: 'hello', title: 'Hello, helper', what: 'Helpers ride with a driver, fold and bag the papers, and take the letterboxes on their side of the car. Here’s how the app works for you.',
        why: 'Your ticks count as much as the driver’s: each one is a delivery record.',
        say: "Hello, helper. Stan here. You ride with a driver, fold and bag the papers, and take the letterboxes on your side. Your ticks count just as much as the driver's. Let's go through it." },
      '2026-11-08-ticking', '2026-11-21-sounds', '2026-11-09-problem', '2026-11-08-photos', '2026-11-22-not-your-run', '2026-11-21-own-order',
      { id: 'practise', title: 'Now practise it', what: 'Open Sandbox Stan as a helper: go on duty, say who’s driving, and tick a few stops.',
        why: 'Practice runs only, so nothing you do there reaches the real runs.',
        say: "Now have a go in my sandbox. Go on duty, say who's driving, and tick a few stops. Practice runs only, so nothing reaches the real runs." },
    ],
    tasks: ['helper-duty', 'tick'],
  },
  more: {
    title: 'Getting more from Stan', for: 'all', core: false,
    intro: 'The extras: the day plan, the co-driver, your own order, your morning card, the notice board and more.',
    steps: [
      '2026-11-19-plan', '2026-11-21-runs-page', '2026-11-12-finish-time', '2026-11-12-assistant', '2026-11-21-own-order',
      '2026-11-21-address-check', '2026-11-18-untick', '2026-11-21-your-morning', '2026-11-21-clean-mornings', '2026-11-23-between-runs',
      '2026-11-19-notice-board', '2026-11-13-ping', '2026-11-17-did-you-know', '2026-11-12-ideas', '2026-11-22-whatsnew', '2026-11-14-game',
      { id: 'school', title: 'Stan’s School', what: 'Any time something in the app changes, there’s a card in What’s new, a lesson here, and often a practice task in Sandbox Stan. New changes also come by email at the end of the day.',
        why: 'So the training is always about the app as it is today, not as it was when someone made a video.',
        covers: ['2026-11-23-school'],
        say: "One more thing. Whenever the app changes, there's a card in what's new, a lesson here, and often a practice task in my sandbox. You'll get an email at the end of that day too. So the training is always about the app as it is today." },
    ],
    tasks: [],
  },
  dispatcher: {
    title: 'Dispatch', for: 'dispatcher', core: false,
    intro: 'The dispatch board: watching the morning, closing runs, the report, insights and the people list.',
    steps: [
      { id: 'hello', title: 'Hello, dispatcher', what: 'The dispatch board is where the morning is watched and the record is kept straight: runs, complaints, addresses, people and Stan’s voice.',
        why: 'Drivers make the record; dispatch makes sure it’s complete and answers questions about it.',
        say: "Hello, dispatcher. The dispatch board is where we watch the morning and keep the record straight. Runs, complaints, addresses, people, and my voice. Here's what's on it." },
      '2026-11-21-dispatch-phone', '2026-11-13-dispatch-tools', '2026-11-17-insights', '2026-11-23-report-card', '2026-11-23-one-letterbox',
      { id: 'close-run', title: 'Closing a run someone else did', what: 'On Runs & sheets, Close run… records who delivered a run outside the app, when it finished, and whether it was on the paper sheet. The drivers leave those stops unticked.',
        why: 'The record has to name whoever was really at the letterbox.',
        say: "When someone outside the app delivers a run, close it on the dispatch board. Runs and sheets, then close run. Choose who did it and when it finished. The drivers leave those stops alone." },
      { id: 'training', title: 'People and training', what: 'On People, the Training column shows each person’s courses and practice tasks. A new driver starts with Needs training on: they can go on duty as a helper, but not as a driver, until the driver course and its practice are done. You can switch it off for someone who already knows the job.',
        why: 'A new driver’s first real run shouldn’t be the first time they see the hard lines.',
        covers: ['2026-11-23-school'],
        say: "On the people page, the training column shows who has done which course. A new driver can't go on duty as a driver until the driver course and its practice are done. You can switch that off for someone who already knows the job." },
    ],
    tasks: [],
  },
};

const ls = (S, k, d) => { try { const v = S.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const sandboxEvents = (S) => { const out = []; for (let i = 0; i < S.length; i++) { const k = S.key(i); if (k && k.startsWith('stb.events.')) out.push(...ls(S, k, [])); } return out; };
const duty = (S) => ls(S, 'stb.duty', []);

/** Practice tasks. done(S) looks at Sandbox Stan's storage (a Storage-like object) and says whether it has been done. */
export const TASKS = {
  'go-on-duty': { title: 'Go on duty and start a run', course: 'driver',
    ask: 'Tap On duty, say who’s with you (Just me is fine), tap Prepped: starting the run, and enter the odometer (any number).',
    done: (S) => duty(S).some((e) => e.state === 'on_duty' && Array.isArray(e.helpers)) && duty(S).some((e) => e.state === 'on_run') && !!ls(S, 'stb.odo.start', null) },
  tick: { title: 'Tick three stops', course: 'driver',
    ask: 'Open a practice run and tap three tiles, as if the papers were in the boxes.',
    done: (S) => sandboxEvents(S).filter((e) => e.done && e.outcome !== 'undone').length >= 3 },
  'cant-deliver': { title: 'Record a stop you couldn’t deliver', course: 'driver',
    ask: 'Tick a stop, then tap ⚠ in the bottom bar and pick a reason.',
    done: (S) => sandboxEvents(S).some((e) => e.outcome && !['delivered', 'undone'].includes(e.outcome)) },
  finish: { title: 'Finish the shift', course: 'driver',
    ask: 'Tick every stop on your practice runs. When the last one goes in, enter the end odometer and count the spares.',
    done: (S) => duty(S).some((e) => e.state === 'off_duty') && !!ls(S, 'stb.odo.end', null) },
  'helper-duty': { title: 'Go on duty as a helper', course: 'helper',
    ask: 'Tap On duty and pick who’s driving.',
    done: (S) => duty(S).some((e) => e.state === 'on_duty' && e.driver) },
};

/** What a new driver must finish before going on duty as a driver. */
export const NEEDED = ['course:driver', ...COURSES.driver.tasks.map((t) => `task:${t}`)];

/** A course's steps as cards: { id, title, what, why, say, sayKey, shot, date, card } in order. */
export function courseSteps(id, updates = UPDATES) {
  const c = COURSES[id]; if (!c) return [];
  const byId = new Map(updates.map((u) => [u.id, u]));
  return c.steps.map((s) => {
    if (typeof s === 'string') { const u = byId.get(s); return u ? { id: u.id, title: u.title, what: u.what, why: u.why, say: u.say, sayKey: `news.${u.id}`, shot: u.shot || null, date: u.date, card: true } : { id: s, missing: true }; }
    return { ...s, sayKey: `learn.${id}.${s.id}`, shot: s.shot || null, card: false };
  });
}
/** Stan's lines for the steps that aren't cards (recorded like any other line: decision 0061). */
export function learnLines() {
  const out = {};
  for (const [cid, c] of Object.entries(COURSES)) for (const s of c.steps) if (typeof s !== 'string') out[`learn.${cid}.${s.id}`] = { say: s.say, when: 'Stan’s School, read aloud' };
  return out;
}
/** Which courses teach a card (a step that is the card, or an own step that covers it). */
export function coursesFor(cardId) {
  return Object.entries(COURSES).filter(([, c]) => c.steps.some((s) => (typeof s === 'string' ? s === cardId : (s.covers || []).includes(cardId)))).map(([id]) => id);
}
/** Which courses suit someone: their role's, plus the extras. roles as in whatsnew.rolesOf. */
export function coursesForRoles(roles) {
  return Object.entries(COURSES).filter(([, c]) => c.for === 'all' || roles.includes(c.for)).map(([id]) => id);
}
/**
 * The problems with the courses, as sentences (empty = all good). Used by test/training.mjs, so a publish fails when:
 * a card isn't taught anywhere, a course names a card that doesn't exist or has been replaced, a card is taught in a
 * course that isn't for its people, a spoken line is too long or has symbols, or a course names a task that doesn't exist.
 */
export function courseProblems(updates = UPDATES) {
  const bad = []; const byId = new Map(updates.map((u) => [u.id, u]));
  const SAY_OK = /^[A-Za-z0-9 .,'’?!:;\-–]+$/;
  for (const [cid, c] of Object.entries(COURSES)) {
    const seen = new Set();
    for (const s of c.steps) {
      const id = typeof s === 'string' ? s : s.id;
      if (seen.has(id)) bad.push(`${cid}: step ${id} is in the course twice.`); seen.add(id);
      if (typeof s === 'string') {
        const u = byId.get(s);
        if (!u) { bad.push(`${cid}: card ${s} doesn't exist in js/whatsnew.js.`); continue; }
        if (u.replaced) bad.push(`${cid}: card ${s} has been replaced by ${u.replaced}; teach that one instead.`);
        if (c.for !== 'all' && !u.for.includes('all') && !u.for.includes(c.for)) bad.push(`${cid}: card ${s} is for ${u.for.join('/')}, not ${c.for}.`);
      } else {
        if (!s.id || !s.title || !s.what || !s.say) bad.push(`${cid}: own step ${s.id || '?'} needs id, title, what and say.`);
        if (s.say && s.say.length > 300) bad.push(`${cid}.${s.id}: spoken line is ${s.say.length} characters (300 at most).`);
        if (s.say && !SAY_OK.test(s.say)) bad.push(`${cid}.${s.id}: spoken line has symbols Stan can't say.`);
        for (const k of s.covers || []) if (!byId.has(k)) bad.push(`${cid}.${s.id}: covers ${k}, which doesn't exist.`);
      }
    }
    for (const t of c.tasks) if (!TASKS[t]) bad.push(`${cid}: task ${t} doesn't exist.`);
  }
  for (const u of updates) if (!u.replaced && !coursesFor(u.id).length) bad.push(`Card ${u.id} (“${u.title}”) isn't taught in any course: add it to a course in js/training.js, or mark it replaced.`);
  return bad;
}

/** Someone's progress items ['course:driver', 'task:tick', …] → what's left of what's needed. */
export const stillNeeded = (done = []) => NEEDED.filter((n) => !done.includes(n));
/** A short line for the dispatch board: "Driver course ✓ · practice 3 of 4". */
export function progressText(done = [], { required = false } = {}) {
  const parts = [];
  for (const [id, c] of Object.entries(COURSES)) if (done.includes(`course:${id}`)) parts.push(`${c.title} ✓`);
  const tasks = Object.keys(TASKS).filter((t) => done.includes(`task:${t}`)).length;
  if (tasks) parts.push(`practice ${tasks} of ${Object.keys(TASKS).length}`);
  const left = stillNeeded(done).length;
  if (required) parts.unshift(left ? `Needs training (${left} to go)` : 'Training done ✓');
  return parts.join(' · ') || 'Not started';
}

/** Progress kept on this phone until it can be sent (key outside the sandbox's own storage). */
export const PROGRESS_KEY = 'stb.training';
export function localProgress(S = globalThis.localStorage) { return ls(S, PROGRESS_KEY, []); }
export function addLocalProgress(item, S = globalThis.localStorage) {
  const have = localProgress(S); if (have.some((x) => x.item === item)) return false;
  try { S.setItem(PROGRESS_KEY, JSON.stringify([...have, { item, at: new Date().toISOString(), sent: false }])); } catch { /* private mode */ }
  return true;
}

// ---- The end-of-day email (decision 0065; sent by tools/training-digest.mjs) ----
export const EMAIL_DAYS = 7;   // a card is emailed if it went out in the last week and the person hasn't seen it in the app
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** The cards to email someone: theirs (roles as whatsnew.rolesOf), recent, not yet seen in the app, not emailed before. Oldest first. */
export function emailCards(roles, { seen = [], emailed = [], today, list = UPDATES } = {}) {
  const skip = new Set([...seen, ...emailed]);
  return list.filter((u) => (u.for.includes('all') || u.for.some((r) => roles.includes(r))) && !skip.has(u.id) && !u.replaced)
    .filter((u) => { const d = daysBetween(u.date, today); return d >= 0 && d <= EMAIL_DAYS; })
    .sort((a, b) => a.date.localeCompare(b.date));
}
/** The email itself: { subject, html, text }. site: the app's address, ending in a slash. */
export function emailFor(name, cards, site) {
  const n = cards.length; const subject = n === 1 ? `What's new in Send The Boy: ${cards[0].title}` : `What's new in Send The Boy: ${n} changes`;
  const learn = (u) => `${site}learn/#card-${u.id}`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1c1b18">
<p style="font-size:17px">Hi ${esc(name)}, Stan here. ${n === 1 ? 'Something changed' : `${n} things changed`} in the app. Here's what, and why.</p>
${cards.map((u) => `<div style="border:1px solid #8a8478;border-radius:14px;padding:14px 16px;margin:12px 0">
<div style="font-size:18px;font-weight:700;margin-bottom:6px">${esc(u.title)}</div>
<p style="margin:0 0 8px;line-height:1.5">${esc(u.what)}</p>
<p style="margin:0 0 10px;line-height:1.5;color:#5f5b53"><b>Why:</b> ${esc(u.why)}</p>
<a href="${learn(u)}" style="display:inline-block;background:#2f3337;color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:600">Learn it with Stan</a></div>`).join('\n')}
<p style="line-height:1.5">Want to try it first? <a href="${site}sandbox/">Sandbox Stan</a> is the real app with made-up runs. Nothing there is real.</p>
<p style="font-size:13px;color:#5f5b53">You get this because you're on the Send The Boy team. Cards you've already read in the app aren't sent.</p></div>`;
  const text = [`Hi ${name}, Stan here. What changed in the app, and why:`, '', ...cards.flatMap((u) => [`* ${u.title}`, u.what, `Why: ${u.why}`, `Learn it: ${learn(u)}`, '']), `Practise: ${site}sandbox/`].join('\n');
  return { subject, html, text };
}
