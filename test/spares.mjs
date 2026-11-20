import assert from 'node:assert/strict';
import { papersNeeded, papersToday, spareRow, spareDay, spareText, morningLines } from '../js/spares.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const weekday = [{ summary: { byPub: { NZH: 100, NZHR: 20, LIS: 16, 'NZH+LIS': 9 } } }, { summary: { byPub: { NZH: 50 } } }];
const sunday = [{ summary: { byPub: { NZH: 84, SST: 21, NZHR: 13, SSTR: 12 } } }];
t('papers needed adds the retail copies to their paper and leaves magazines out', () => { assert.deepEqual(papersNeeded(weekday), { NZH: 170 }); assert.deepEqual(papersNeeded(sunday), { NZH: 97, SST: 33 }); });
t('the Herald is always asked about; the Sunday Star-Times only when it is on the sheets', () => { assert.deepEqual(papersToday(weekday), ['NZH']); assert.deepEqual(papersToday(sunday), ['NZH', 'SST']); assert.deepEqual(papersToday([]), ['NZH']); });
t('a spare count is tidied before it is saved', () => {
  const r = spareRow({ date: '2026-11-20', moment: 'end', counts: { NZH: '3', SST: -2, XX: 9 }, given: [{ to: ' A friend ', n: 1 }, { to: '', n: 2 }, { to: 'Nobody', n: 0 }], now: Date.parse('2026-11-19T17:31:00Z') });
  assert.deepEqual(r, { delivery_date: '2026-11-20', moment: 'end', counts: { NZH: 3, SST: 0 }, given: [{ to: 'A friend', n: 1 }], device_time: '2026-11-19T17:31:00.000Z' });
  assert.deepEqual(spareRow({ date: '2026-11-20', moment: 'start', counts: { NZH: 4 }, given: [{ to: 'A friend', n: 1 }] }).given, []);
});
const rows = [
  { delivery_date: '2026-11-20', user_name: 'Lisa', moment: 'start', counts: { NZH: 2 }, given: [], device_time: '2026-11-19T13:40:00Z' },
  { delivery_date: '2026-11-20', user_name: 'Lisa', moment: 'start', counts: { NZH: 4 }, given: [], device_time: '2026-11-19T13:45:00Z' },
  { delivery_date: '2026-11-20', user_name: 'Lisa', moment: 'end', counts: { NZH: 3 }, given: [{ to: 'A friend', n: 1 }], device_time: '2026-11-19T17:31:00Z' },
  { delivery_date: '2026-11-20', user_name: 'Mike', moment: 'end', counts: { NZH: 1 }, given: [], device_time: '2026-11-19T17:10:00Z' },
  { delivery_date: '2026-11-19', user_name: 'Lisa', moment: 'end', counts: { NZH: 9 }, given: [], device_time: '2026-11-18T17:10:00Z' }];
t('a day’s spares take each driver’s latest answer and add the drivers together', () => assert.deepEqual(spareDay(rows, '2026-11-20'), { start: { NZH: 4 }, end: { NZH: 4 }, given: [{ to: 'A friend', n: 1 }], by: ['Lisa', 'Mike'] }));
t('no answers, no spares line', () => { assert.equal(spareDay(rows, '2026-11-21'), null); assert.equal(spareText(null), null); });
t('the day’s spares read as a sentence', () => { assert.equal(spareText(spareDay(rows, '2026-11-20')), 'Herald: 4 at the start, 4 left · 1 to A friend'); assert.equal(spareText({ start: null, end: { NZH: 2, SST: 14 }, given: [], by: ['Lisa'] }), 'Herald: 2 left · Sunday Star-Times: 14 left'); });
t('the morning lists each run’s finish against the deadline', () => {
  const dl = Date.parse('2026-11-20T06:00:00+13:00'); const clock = (x) => new Date(x).toISOString().slice(11, 16);
  assert.deepEqual(morningLines([{ route: 'HOWICK06', finishedAt: dl - 113 * 60e3 }, { route: 'HOWICK13', finishedAt: dl + 30 * 60e3 }, { route: 'HOWICK11', finishedAt: null }], dl, clock),
    [{ name: 'Run 6', text: 'done 15:07', late: false, done: true }, { name: 'Run 13', text: 'done 17:30 (30 min after the deadline)', late: true, done: true }, { name: 'Run 11', text: 'not finished yet', late: false, done: false }]);
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
