// Stan's School (decision 0065): the courses are built from the What's new cards and can't fall behind them.
import assert from 'assert';
import { COURSES, TASKS, NEEDED, courseSteps, courseProblems, coursesFor, coursesForRoles, stillNeeded, progressText, learnLines, addLocalProgress, localProgress } from '../js/training.js';
import { UPDATES } from '../js/whatsnew.js';
import { STAN_LINES } from '../js/stanlines.js';
const t = (n, f) => { try { f(); console.log('✓', n); } catch (e) { console.log('✗', n, e.message); process.exitCode = 1; } };

t('STB-077 every card is taught in a course, and the courses are sound', () => assert.deepEqual(courseProblems(), []));
t('STB-077 a new card with no lesson fails the check', () => {
  const extra = [{ id: '2099-01-01-new', date: '2099-01-01', for: ['driver'], title: 'Something new', what: 'x', why: 'y', say: 'z' }, ...UPDATES];
  assert.ok(courseProblems(extra).some((p) => p.includes('2099-01-01-new') && p.includes('isn\'t taught')));
});
t('STB-078 a replaced card can\'t stay in a course', () => {
  const list = UPDATES.map((u) => (u.id === '2026-11-08-ticking' ? { ...u, replaced: '2099-01-01-new' } : u));
  assert.ok(courseProblems(list).some((p) => p.includes('2026-11-08-ticking') && p.includes('replaced')));
});
t('STB-078 a card taught to the wrong people fails', () => {
  const list = UPDATES.map((u) => (u.id === '2026-11-22-odometer' ? { ...u, for: ['dispatcher'] } : u));
  assert.ok(courseProblems(list).some((p) => p.includes('odometer') && p.includes('not driver')));
});
t('steps read from the cards: same words, and the card\'s recorded clip', () => {
  const s = courseSteps('driver'); const odo = s.find((x) => x.id === '2026-11-22-odometer'); const u = UPDATES.find((x) => x.id === odo.id);
  assert.equal(odo.what, u.what); assert.equal(odo.sayKey, 'news.2026-11-22-odometer'); assert.ok(STAN_LINES[odo.sayKey]);
  assert.ok(s.every((x) => !x.missing));
});
t('own steps are Stan lines, so they are recorded on publish (decision 0061)', () => {
  for (const [k, l] of Object.entries(learnLines())) { assert.ok(STAN_LINES[k], k); assert.equal(STAN_LINES[k].say, l.say); }
});
t('STB-079 a new driver needs the driver course and its four practice tasks', () => {
  assert.deepEqual(NEEDED, ['course:driver', 'task:go-on-duty', 'task:tick', 'task:cant-deliver', 'task:finish']);
  assert.equal(stillNeeded(NEEDED).length, 0); assert.equal(stillNeeded(['course:driver']).length, 4);
});
t('courses for each person: their role, plus the extras', () => {
  assert.deepEqual(coursesForRoles(['driver']), ['driver', 'more']);
  assert.deepEqual(coursesForRoles(['helper', 'dispatcher']), ['helper', 'more', 'dispatcher']);
  assert.deepEqual(coursesFor('2026-11-23-school').sort(), ['dispatcher', 'more']);
});
t('progress text for the dispatch board', () => {
  assert.equal(progressText([]), 'Not started');
  assert.equal(progressText(['course:driver', 'task:tick'], { required: true }), 'Needs training (3 to go) · New driver ✓ · practice 1 of 5');
  assert.equal(progressText(NEEDED, { required: true }).startsWith('Training done ✓'), true);
});
// A pretend sandbox storage, to prove the practice checks read what the app really writes.
const store = (o) => { const m = new Map(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)])); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
t('STB-080 practice tasks are checked from what the app saved, not ticked by hand', () => {
  const empty = store({});
  for (const k of Object.keys(TASKS)) assert.equal(TASKS[k].done(empty), false, k);
  const S = store({
    'stb.duty': [{ state: 'on_duty', helpers: [] }, { state: 'on_run' }, { state: 'off_duty' }], 'stb.odo.start': { km: 100 }, 'stb.odo.end': { km: 140 },
    'stb.events.abc': [{ done: true, outcome: 'delivered' }, { done: true, outcome: 'delivered' }, { done: true, outcome: 'futile' }],
  });
  for (const k of ['go-on-duty', 'tick', 'cant-deliver', 'finish']) assert.equal(TASKS[k].done(S), true, k);
  assert.equal(TASKS['helper-duty'].done(S), false);
  assert.equal(TASKS['helper-duty'].done(store({ 'stb.duty': [{ state: 'on_duty', driver: 'Lisa' }] })), true);
});
t('progress on the phone is kept once per item', () => {
  const S = store({}); assert.equal(addLocalProgress('task:tick', S), true); assert.equal(addLocalProgress('task:tick', S), false); assert.equal(localProgress(S).length, 1);
});
t('every course has a title, who it is for and some steps', () => { for (const c of Object.values(COURSES)) assert.ok(c.title && c.for && c.steps.length > 1); });
// Pictures (decision 0065): every picture a lesson names is taken by tools/training-shots.py and is in learn/shots/.
import { readFileSync, existsSync } from 'fs';
t('STB-083 every lesson picture is taken by the picture job and exists', () => {
  const script = readFileSync(new URL('../tools/training-shots.py', import.meta.url), 'utf8');
  const taken = JSON.parse(/SHOTS = (\[[^\]]*\])/.exec(script)[1].replace(/'/g, '"'));
  const named = [...new Set(Object.keys(COURSES).flatMap((c) => courseSteps(c)).map((s) => s.shot).filter(Boolean))];
  assert.ok(named.length >= 6);
  for (const n of named) { assert.ok(taken.includes(n), `${n} isn't taken by tools/training-shots.py`); assert.ok(existsSync(new URL(`../learn/shots/${n}.png`, import.meta.url)), `learn/shots/${n}.png is missing`); }
});
import { emailCards, emailFor } from '../js/training.js';
t('STB-084 the end-of-day email: your recent cards, not ones you read in the app or were sent before', () => {
  const list = [{ id: 'a', date: '2026-11-23', for: ['driver'], title: 'A', what: 'w', why: 'y' }, { id: 'b', date: '2026-11-23', for: ['dispatcher'], title: 'B', what: 'w', why: 'y' },
    { id: 'c', date: '2026-11-10', for: ['all'], title: 'C', what: 'w', why: 'y' }, { id: 'd', date: '2026-11-22', for: ['all'], title: 'D', what: 'w', why: 'y' }, { id: 'e', date: '2026-11-22', for: ['all'], title: 'E', what: 'w', why: 'y', replaced: 'a' }];
  assert.deepEqual(emailCards(['driver'], { today: '2026-11-23', list }).map((u) => u.id), ['d', 'a']);
  assert.deepEqual(emailCards(['driver'], { today: '2026-11-23', list, seen: ['d'], emailed: ['a'] }), []);
  assert.deepEqual(emailCards(['helper', 'dispatcher'], { today: '2026-11-23', list }).map((u) => u.id), ['d', 'b']);
});
t('STB-084 the email links each card to its lesson, and keeps names safe', () => {
  const e = emailFor('Jo <b>', [UPDATES.find((u) => u.id === '2026-11-22-odometer')], 'https://x.example/stb/');
  assert.ok(e.subject.includes('Odometer')); assert.ok(e.html.includes('https://x.example/stb/learn/#card-2026-11-22-odometer')); assert.ok(e.html.includes('Jo &lt;b&gt;')); assert.ok(e.text.includes('Why:'));
});
