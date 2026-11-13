import assert from 'node:assert/strict';
import { nzTime, deadlineFor, runWatch, typicalDuration, summaryText, needsAttention } from '../js/watch.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const at = (hm, d = '2026-11-13') => nzTime(d, hm);
t('6:00 am NZ in summer is 17:00 UTC the day before; in winter 18:00', () => { assert.equal(new Date(at('06:00')).toISOString(), '2026-11-12T17:00:00.000Z'); assert.equal(new Date(nzTime('2026-06-15', '06:00')).toISOString(), '2026-06-14T18:00:00.000Z'); });
t('deadline: 6 am Monday to Friday, 7 am weekends and public holidays', () => {
  assert.deepEqual([deadlineFor('2026-11-13').hhmm, deadlineFor('2026-11-13').kind], ['06:00', 'weekday']);
  assert.deepEqual([deadlineFor('2026-11-14').hhmm, deadlineFor('2026-11-15').kind], ['07:00', 'weekend']);
  assert.deepEqual([deadlineFor('2026-12-25').hhmm, deadlineFor('2026-12-25').kind], ['07:00', 'holiday']); // a Friday
  assert.equal(deadlineFor('2026-11-13', { weekday: '05:30' }).at, at('05:30'));
});
const D = at('06:00'); const ticks = (from, n, gapS) => Array.from({ length: n }, (_, i) => at(from) + i * gapS * 1000);
t('going well: on track, with the finish time', () => { const w = runWatch({ run: { total: 60, done: 30 }, tickTimes: ticks('05:00', 30, 40), deadline: D, now: at('05:20') }); assert.equal(w.state, 'on_track'); assert.ok(w.eta < D); });
t('too slow: running late, by how many minutes', () => { const w = runWatch({ run: { total: 100, done: 20 }, tickTimes: ticks('05:20', 20, 60), deadline: D, now: at('05:40') }); assert.equal(w.state, 'late'); assert.ok(w.overMin >= 55 && w.overMin <= 65, String(w.overMin)); assert.match(w.text, /Running about \d+ min late/); });
t('nobody has started, and there is still time: not started', () => { const w = runWatch({ run: { total: 60, done: 0 }, deadline: D, typicalMs: 45 * 60000, now: at('04:50') }); assert.equal(w.state, 'not_started'); assert.equal(w.startBy, at('05:15')); });
t('nobody has started and it can no longer be done in time: early warning', () => { const w = runWatch({ run: { total: 60, done: 0 }, deadline: D, typicalMs: 45 * 60000, now: at('05:30') }); assert.equal(w.state, 'not_started_late'); assert.equal(w.overMin, 15); assert.ok(needsAttention(w)); });
t('a stray tick the evening before doesn\u2019t count as started', () => { const w = runWatch({ run: { total: 60, done: 1 }, tickTimes: [at('20:26', '2026-11-12')], deadline: D, typicalMs: 45 * 60000, now: at('05:30') }); assert.equal(w.state, 'not_started_late'); });
t('finished before the deadline: done on time; after: late by so many minutes', () => {
  assert.equal(runWatch({ run: { total: 60, done: 60, complete: true }, tickTimes: ticks('05:00', 60, 40), deadline: D, now: at('08:00') }).state, 'done_on_time');
  const w = runWatch({ run: { total: 60, done: 60, complete: true, finishedAt: at('06:12') }, deadline: D, now: at('08:00') }); assert.equal(w.state, 'done_late'); assert.equal(w.overMin, 12);
});
t('yesterday’s run never finished in the app: says so, no false alarm about minutes', () => assert.equal(runWatch({ run: { total: 60, done: 10 }, tickTimes: ticks('05:00', 10, 40), deadline: D, now: at('14:00') }).state, 'unfinished'));
t('a route’s usual time is the middle of its recent runs', () => assert.equal(typicalDuration([{ first: 0, last: 40 * 60000, ticks: 50 }, { first: 0, last: 50 * 60000, ticks: 50 }, { first: 0, last: 70 * 60000, ticks: 50 }, { first: 0, last: 60000, ticks: 2 }]), 50 * 60000));
t('the morning summary reads plainly', () => {
  const rows = [{ name: 'Run 6', watch: runWatch({ run: { total: 60, done: 60, complete: true, finishedAt: at('05:41') }, deadline: D, now: at('08:00') }) }, { name: 'Run 10', watch: runWatch({ run: { total: 60, done: 60, complete: true, finishedAt: at('06:12') }, deadline: D, now: at('08:00') }) }];
  const s = summaryText('Fri 13 Nov', rows, { notDelivered: ['12 Rimu Street (gate locked)'], photos: 3 }, (x) => new Date(x).toISOString().slice(11, 16));
  assert.match(s, /all 2 runs delivered, 1 after the 17:00 deadline/); assert.match(s, /Run 10: finished 17:12, 12 min late/); assert.match(s, /Not delivered \(1\): 12 Rimu Street \(gate locked\)/); assert.match(s, /3 delivery photos on file/);
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
