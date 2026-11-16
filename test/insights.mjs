import assert from 'node:assert/strict';
import { buildInsights, runMornings, deadlineRecord, streetTimes, doubleBacks, proofStrength, metres, keyMetrics, duration } from '../js/insights.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
// A small world: Run 6 on time each weekday, Run 13 always late, Run 8 delivered in one drop. NZ is UTC+13 in November.
const DAYS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];           // Mon to Thu
const nz = (date, hhmmss) => new Date(Date.parse(`${date}T${hhmmss}+13:00`)).toISOString();
const runs = []; const ticks = [];
const tick = (run_id, key, date, time, extra = {}) => ticks.push({ run_id, address_key: key, done: true, user_name: 'Lisa', device_time: nz(date, time), lat: -36.9, lng: 174.9, accuracy_m: 5, ...extra });
const at = (h, m, s = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
for (const d of DAYS) {
  runs.push({ id: `r6-${d}`, route: 'HOWICK06', delivery_date: d }, { id: `r13-${d}`, route: 'HOWICK13', delivery_date: d }, { id: `r8-${d}`, route: 'HOWICK08', delivery_date: d });
  // Run 6: 04:30 to 05:20. Oak Road, then Elm Street, then back to Oak Road; one stop on Far Lane takes 4 minutes.
  for (let i = 0; i < 10; i++) tick(`r6-${d}`, `HOWICK|OAK ROAD|${i + 1}`, d, at(4, 30 + i), { lat: -36.9 + i * 0.0003 });
  for (let i = 0; i < 10; i++) tick(`r6-${d}`, `HOWICK|ELM STREET|${i + 1}`, d, at(4, 41 + i), { lat: -36.91 + i * 0.0003 });
  tick(`r6-${d}`, 'HOWICK|FAR LANE|1', d, at(4, 55), { lat: -36.93 });
  for (let i = 10; i < 20; i++) tick(`r6-${d}`, `HOWICK|OAK ROAD|${i + 1}`, d, at(5, 1 + (i - 10) * 2), { lat: -36.9 + i * 0.0003 });
  // Run 13: 05:50 to 06:25, so 25 minutes over the 6:00 deadline every day
  for (let i = 0; i < 8; i++) tick(`r13-${d}`, `HOWICK|PINE AVENUE|${i + 1}`, d, at(5 + Math.floor((50 + i * 5) / 60), (50 + i * 5) % 60), { user_name: 'Mike', lat: -36.95 + i * 0.0003 });
  // Run 8: forty ticks two seconds apart at one spot
  for (let i = 0; i < 40; i++) tick(`r8-${d}`, `HOWICK|VILLAGE WAY|${i + 1}`, d, at(5, 30, 0).replace(':00', `:${String(i).padStart(2, '0')}`).replace(/^(\d\d):(\d\d):(\d\d)$/, (m, h, mi, s) => `${h}:${String(+mi + Math.floor((i * 2) / 60)).padStart(2, '0')}:${String((i * 2) % 60).padStart(2, '0')}`), { lat: -36.97 });
}
const M = runMornings(runs, ticks);
const m13 = M.find((m) => m.run_id === 'r13-2026-11-09');
t('a run’s morning is its first and last app tick, measured against the deadline', () => { assert.equal(m13.ticks, 8); assert.equal(m13.lateMin, 25); assert.equal(Math.round(m13.durationMs / 60000), 35); assert.equal(m13.kind, 'weekday'); });
t('a stray tick the evening before is not part of the morning', () => {
  const extra = [...ticks, { run_id: 'r13-2026-11-09', address_key: 'HOWICK|PINE AVENUE|1', done: true, user_name: 'Mike', device_time: nz('2026-11-08', '20:26:00'), lat: -36.95, lng: 174.9 }];
  const m = runMornings(runs, extra).find((x) => x.run_id === 'r13-2026-11-09'); assert.equal(m.ticks, 8); assert.equal(Math.round(m.durationMs / 60000), 35);
});
t('a run late on most mornings is reported, with how late and when it starts', () => {
  const r = deadlineRecord(M).find((x) => x.route === 'HOWICK13'); assert.deepEqual([r.days, r.late, r.typicalLateMin, r.typicalStartOffsetMin, r.typicalDurationMin], [4, 4, 25, -10, 35]);
});
const I = buildInsights({ runs, ticks });
const find = (id) => I.findings.find((f) => f.id === id);
t('the late run comes first, with a suggestion to start earlier', () => { assert.equal(I.findings[0].id, 'late-HOWICK13-weekday'); assert.equal(I.findings[0].level, 'act'); assert.match(I.findings[0].text, /Late on 4 of 4 weekdays, typically by 25 min/); assert.match(I.findings[0].suggestion, /25 min earlier/); });
t('runs that are always on time are said to be', () => { assert.match(find('on-time').title, /Run 6/); assert.ok(!/Run 13/.test(find('on-time').title)); });
t('a run delivered in one drop is recognised and left out of street times', () => { assert.ok(M.find((m) => m.run_id === 'r8-2026-11-09').bulk); assert.ok(!streetTimes(M).some((s) => s.route === 'HOWICK08')); assert.match(find('bulk').title, /Run 8/); });
t('street times add up the gaps between ticks', () => { const oak = streetTimes(M).find((s) => s.street === 'Oak Road'); assert.equal(oak.days, 4); assert.ok(oak.typicalMin > 25 && oak.typicalMin < 40, String(oak.typicalMin)); });
t('a short street that costs minutes a stop is pointed out', () => { assert.match(find('slow-stops').text, /Far Lane \(Run 6\): 5 min a stop/); });
t('a street left and come back to on most mornings is flagged for the order', () => { const b = doubleBacks(M); assert.deepEqual(b.map((x) => [x.street, x.days, x.of]), [['Oak Road', 4, 4]]); assert.match(find('double-back').suggestion, /dragging those tiles together/); });
t('distance between two points is in metres', () => assert.ok(Math.abs(metres({ lat: -36.9, lng: 174.9 }, { lat: -36.901, lng: 174.9 }) - 111) < 2));
t('a tick far from where that address is usually ticked counts as away from the letterbox', () => {
  const moved = ticks.map((x) => (x.run_id === 'r6-2026-11-12' && x.address_key === 'HOWICK|ELM STREET|3' ? { ...x, lat: x.lat + 0.002 } : x));
  const p = proofStrength(runMornings(runs, moved)); assert.equal(p.away, 1); assert.equal(p.awayList[0].address, '3 Elm Street'); assert.ok(p.awayList[0].m > 200);
});
t('the one-drop run is not counted as away from the letterbox', () => { const p = proofStrength(M); assert.equal(p.away, 0); assert.ok(p.checked > 100 && p.checked < ticks.length - 100); });
t('someone whose phone records no GPS is named, with what to do', () => {
  const blind = ticks.map((x) => (x.user_name === 'Mike' ? { ...x, lat: null, lng: null } : x));
  const f = buildInsights({ runs, ticks: blind }).findings.find((x) => x.id === 'gps-Mike'); assert.equal(f.level, 'act'); assert.match(f.text, /0 of 32/); assert.match(f.suggestion, /allow Location/);
});
t('deliveries signed off on paper are counted as having no proof for each stop', () => {
  const paper = [...ticks, ...Array.from({ length: 30 }, (_, i) => ({ run_id: 'r13-2026-11-12', address_key: `HOWICK|PAPER ROAD|${i}`, done: true, method: 'paper', user_name: 'Lisa', device_time: nz('2026-11-12', '07:00:00') }))];
  const p = proofStrength(runMornings(runs, paper)); assert.equal(p.paper, 30); assert.deepEqual(p.paperRuns, [{ route: 'HOWICK13', date: '2026-11-12' }]);
});
const complaints = [
  { address_key: 'HOWICK|ELM STREET|3', number: '3', street: 'ELM STREET', route: 'HOWICK06', kind: 'MISSED', happened_on: '2026-11-10', reported_on: '2026-11-11', status: 'open' },
  { address_key: 'HOWICK|ELM STREET|3', number: '3', street: 'ELM STREET', route: 'HOWICK06', kind: 'WET', happened_on: '2026-11-11', reported_on: '2026-11-12', status: 'open' },
  { address_key: 'HOWICK|NOWHERE ROAD|9', number: '9', street: 'NOWHERE ROAD', route: 'HOWICK13', kind: 'MISSED', happened_on: '2026-11-10', reported_on: '2026-11-11', status: 'open' }];
const IC = buildInsights({ runs, ticks, complaints, photos: [] });
t('complaints are set against deliveries and against our own records', () => { const f = IC.findings.find((x) => x.id === 'complaints'); assert.match(f.title, /^3 complaints for 316 deliveries \(9\.5 per thousand\)/); assert.match(f.text, /^2 can be answered .* 1 has no record/); });
t('an address that complains twice is called out', () => assert.match(IC.findings.find((x) => x.id === 'repeats').text, /3 Elm Street \(Run 6\): 2 complaints/));
t('complaint addresses with no photo are listed', () => assert.match(IC.findings.find((x) => x.id === 'no-photo').text, /3 Elm Street, 9 Nowhere Road/));
t('with under two weeks of data the page says the findings are early', () => { assert.equal(I.days, 4); assert.equal(I.early, true); });
t('a pattern needs three mornings: two late days are not a finding', () => { const two = buildInsights({ runs: runs.filter((r) => r.delivery_date <= '2026-11-10'), ticks }); assert.ok(!two.findings.some((f) => f.id.startsWith('late-'))); });
t('the same data always gives the same findings', () => assert.deepEqual(buildInsights({ runs, ticks, complaints }).findings.map((f) => f.title), buildInsights({ runs: [...runs].reverse(), ticks: [...ticks].reverse(), complaints }).findings.map((f) => f.title)));
// The headline numbers (Mike, 17 Nov 2026)
{ const R = [{ id: 'a', route: 'HOWICK06', delivery_date: '2026-11-09' }, { id: 'b', route: 'HOWICK10', delivery_date: '2026-11-09' }];
  const L = []; const T = []; const tk = (run_id, n, time, extra = {}) => T.push({ run_id, line_key: `L${n}`, address_key: `HOWICK|X ROAD|${n}`, done: true, user_name: 'Lisa', device_time: nz('2026-11-09', time), ...extra });
  for (let i = 1; i <= 10; i++) L.push({ run_id: 'a', line_key: `L${i}` }, { run_id: 'b', line_key: `L${i}` });
  for (let i = 1; i <= 6; i++) tk('a', i, at(5, i * 5));          // 6 delivered before 6:00
  tk('a', 7, at(6, 10)); tk('a', 8, at(6, 20));                    // 2 delivered after the deadline
  tk('a', 9, at(5, 50), { outcome: 'futile' });                    // 1 couldn't deliver; L10 never ticked
  tk('a', 1, at(5, 2), { done: false });                           // an earlier untick of L1 doesn't matter: the later tick stands
  for (let i = 1; i <= 10; i++) tk('b', i, at(7, 0), { method: 'paper' });
  const K = keyMetrics({ runs: R, lines: L, ticks: T, complaintCount: 2 });
  t('DIFOT is stops delivered in full by the deadline, out of the stops that can be measured', () => { assert.deepEqual([K.difot.n, K.difot.of, K.difot.pct], [6, 10, 60]); assert.deepEqual([K.difot.late, K.difot.futile, K.difot.notRecorded], [2, 1, 1]); });
  t('stops signed off on paper have no time, so they are counted apart and not against', () => { assert.equal(K.difot.paper, 10); assert.equal(K.difot.due, 20); });
  t('a stop that was delivered short is not in full', () => { const k = keyMetrics({ runs: R, lines: L, ticks: [...T, { run_id: 'a', line_key: 'L2', done: true, outcome: 'short', device_time: nz('2026-11-09', '05:59:00') }] }); assert.equal(k.difot.n, 5); assert.equal(k.difot.short, 1); });
  t('complaints are a share of everything delivered', () => assert.deepEqual([K.complaints.n, K.complaints.of, K.complaints.pct], [2, 18, 11.11]));
  t('average completion time is first tick to last, averaged over each run’s mornings', () => { assert.equal(K.completion.avgMin, 75); assert.deepEqual(K.completion.byRoute.map((r) => [r.name, r.avgMin, r.mornings]), [['Run 6', 75, 1]]); assert.equal(duration(75), '1 h 15'); assert.equal(duration(48), '48 min'); });
}
t('the headline numbers come with the findings', () => { assert.ok(I.metrics.completion.avgMin > 30); assert.equal(I.metrics.difot.pct, null); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
