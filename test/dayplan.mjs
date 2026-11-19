import assert from 'node:assert/strict';
import { runStats, hopMinutes, bestOrder, buildPlan, planText, myPart, clockTime, PREP_S_PER_PAPER, BUFFER_MIN, LOAD_MIN } from '../js/dayplan.js';
import { runMornings } from '../js/insights.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
// Four mornings. Run 6 at the depot (60 stops, 60 min; Mike is quicker: 50), Run 10 next door (40 stops, 40 min), Run 13 far east (20 stops, 30 min).
const DAYS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16'];
const nz = (d, mins) => new Date(Date.parse(`${d}T00:00:00+13:00`) + mins * 60e3).toISOString();
const runs = []; const ticks = [];
const lay = (id, route, d, who, startMin, n, total, lat0, lng0, dLng) => { runs.push({ id, route, delivery_date: d }); for (let i = 0; i < n; i++) ticks.push({ run_id: id, address_key: `H|${route}|${i}`, done: true, user_name: who, device_time: nz(d, startMin + (i * total) / (n - 1)), lat: lat0, lng: lng0 + i * dLng, accuracy_m: 5 }); };
DAYS.forEach((d, i) => {
  const mike = i >= 3;
  lay(`a${i}`, 'HOWICK06', d, mike ? 'Mike' : 'Lisa', 200, 60, mike ? 50 : 60, -36.895, 174.930, 0.0001);
  lay(`b${i}`, 'HOWICK10', d, mike ? 'Mike' : 'Lisa', 200 + (mike ? 50 : 60) + 6, 40, 40, -36.910, 174.925, 0.0001);
  lay(`c${i}`, 'HOWICK13', d, mike ? 'Mike' : 'Lisa', 200 + (mike ? 50 : 60) + 6 + 40 + 12, 20, 30, -36.930, 174.950, 0.001);
});
const S = runStats(runMornings(runs, ticks));
const depot = { lat: -36.8952, lng: 174.932 };
const deadline = Date.parse('2026-11-20T06:00:00+13:00');
const today = [{ route: 'HOWICK06', stops: 60 }, { route: 'HOWICK10', stops: 40 }, { route: 'HOWICK13', stops: 20 }];
const usual = ['HOWICK06', 'HOWICK10', 'HOWICK13'];
t('history gives each run its usual time, and a driver’s own time once they have three mornings', () => { assert.equal(S.routes.HOWICK06.minutes, 55); assert.deepEqual(S.routes.HOWICK06.byDriver, { Lisa: { minutes: 60, mornings: 3 }, Mike: { minutes: 50, mornings: 3 } }); assert.equal(S.routes.HOWICK13.stops, 20); });
t('the hop between two runs is what it has actually taken', () => { assert.equal(S.hops['HOWICK06>HOWICK10'], 6); assert.equal(S.hops['HOWICK10>HOWICK13'], 12); assert.equal(hopMinutes(S, 'HOWICK06', 'HOWICK10'), 6); });
t('a hop never driven is estimated from the distance', () => { const m = hopMinutes(S, 'HOWICK13', 'HOWICK06'); assert.ok(m >= 8 && m <= 20, String(m)); assert.ok(hopMinutes(S, null, 'HOWICK06', depot) <= 2); });
t('the order with the least driving wins, starting from the depot', () => assert.deepEqual(bestOrder(['HOWICK13', 'HOWICK10', 'HOWICK06'], S, depot, usual).order, usual));
const one = buildPlan({ runs: today, crews: [{ driver: 'Lisa', helpers: ['Lenny'] }], stats: S, deadline, depot, usual });
const L = one.crews[0];
t('one driver with a helper: every run, in order, working back from ten minutes before the deadline', () => {
  assert.deepEqual(L.runs.map((r) => r.route), usual); assert.equal(L.finishAt, deadline - BUFFER_MIN * 60e3);
  assert.equal(clockTime(L.runs[2].finishAt), '5:50 am'); assert.equal(clockTime(L.runs[2].startAt), '5:20 am'); assert.equal(clockTime(L.runs[1].startAt), '4:28 am'); assert.equal(clockTime(L.firstPaperAt), '3:22 am');
});
t('with a helper the depot time is just loading', () => { assert.equal(L.prepMin, LOAD_MIN); assert.equal(clockTime(L.depotAt), '3:16 am'); });
const solo = buildPlan({ runs: today, crews: [{ driver: 'Lisa', helpers: [] }], stats: S, deadline, depot, usual }).crews[0];
t('on their own, the driver folds and bags at the depot first, so they start earlier', () => { assert.equal(solo.prepMin, Math.round((120 * PREP_S_PER_PAPER) / 60)); assert.equal(clockTime(solo.firstPaperAt), '3:22 am'); assert.equal(clockTime(solo.depotAt), '2:49 am'); });
t('the driver’s own times are used where there are enough', () => { const m = buildPlan({ runs: today, crews: [{ driver: 'Mike', helpers: ['Zaph'] }], stats: S, deadline, depot, usual }).crews[0]; assert.equal(m.runs[0].minutes, 50); assert.equal(clockTime(m.firstPaperAt), '3:32 am'); });
const two = buildPlan({ runs: today, crews: [{ driver: 'Lisa', helpers: ['Lenny'] }, { driver: 'Mike', helpers: [] }], stats: S, deadline, depot, usual });
t('two drivers: the runs are shared so the longest shift is as short as it can be', () => {
  const shifts = two.crews.map((c) => c.shiftMin); assert.ok(Math.max(...shifts) < L.shiftMin - 30, String(shifts));
  assert.deepEqual(two.crews.flatMap((c) => c.runs.map((r) => r.route)).sort(), [...usual].sort()); assert.ok(two.crews.every((c) => c.runs.length >= 1));
});
t('a run with no history is planned on a guess, and the plan says so', () => { const p = buildPlan({ runs: [...today, { route: 'HOWICK99', stops: 40 }], crews: [{ driver: 'Lisa', helpers: ['Lenny'] }], stats: S, deadline, depot, usual }); assert.deepEqual(p.unknown, ['HOWICK99']); assert.ok(p.assumptions.some((a) => /No history yet for Run 99/.test(a))); assert.equal(p.crews[0].runs.find((r) => r.route === 'HOWICK99').minutes, 30); });
t('the plan says what it is assuming about helpers and folding', () => { assert.ok(one.assumptions.some((a) => /helper folding on the way/.test(a))); assert.ok(buildPlan({ runs: today, crews: [{ driver: 'Lisa', helpers: [] }], stats: S, deadline, depot, usual }).assumptions.some((a) => /16 seconds a paper/.test(a))); });
t('the plan reads as a message', () => assert.equal(planText(one, { date: '2026-11-20', deadline }).split('\n')[1], 'Lisa with Lenny: at the depot by 3:16 am, first paper by 3:22 am. Run 6 3:22 am–4:22 am, Run 10 4:28 am–5:08 am, Run 13 5:20 am–5:50 am.'));
t('each person finds their own part, driver or helper', () => { assert.equal(myPart(one, 'Lisa').role, 'driver'); assert.equal(myPart(one, 'Lenny').role, 'helper'); assert.equal(myPart(one, 'Lenny').driver, 'Lisa'); assert.equal(myPart(one, 'Mike'), null); });
t('a run that is always dropped off inside another rides along and adds no time', () => {
  const r2 = [...runs]; const t2 = [...ticks]; DAYS.forEach((d, i) => { r2.push({ id: `v${i}`, route: 'HOWICK08', delivery_date: d }); for (let k = 0; k < 12; k++) t2.push({ run_id: `v${i}`, address_key: `V|${k}`, done: true, user_name: 'Lisa', device_time: nz(d, 290 + k * 0.02), lat: -36.9105, lng: 174.926, accuracy_m: 5 }); });
  const S2 = runStats(runMornings(r2, t2)); assert.equal(S2.routes.HOWICK08.inside, 'HOWICK10');
  const p = buildPlan({ runs: [...today, { route: 'HOWICK08', stops: 12 }], crews: [{ driver: 'Lisa', helpers: ['Lenny'] }], stats: S2, deadline, depot, usual: ['HOWICK06', 'HOWICK08', 'HOWICK10', 'HOWICK13'] });
  const c = p.crews[0]; assert.deepEqual(c.runs.map((r) => r.route), ['HOWICK06', 'HOWICK10', 'HOWICK08', 'HOWICK13']); assert.equal(c.runs[2].during, 'HOWICK10'); assert.equal(c.shiftMin, L.shiftMin);
  assert.ok(p.assumptions.some((a) => /Run 8 is dropped off part-way through Run 10/.test(a))); assert.match(planText(p, { date: '2026-11-20', deadline }), /Run 8 on the way through Run 10/);
});
t('nobody driving, no plan', () => assert.deepEqual(buildPlan({ runs: today, crews: [], stats: S, deadline }).crews, []));
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
