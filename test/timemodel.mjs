import assert from 'node:assert/strict';
import { carTracks, legsOf, homes, learn, legCost, reportCard, stopTimes, LEG_CAP_S, TARGET_PCT } from '../js/timemodel.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const T0 = Date.parse('2026-11-09T14:00:00Z');
// A street of 30 letterboxes 40 m apart. gap(i) = the seconds this crew takes on the leg into stop i, on day d.
const morning = (d, who, gap, { order = [...Array(30).keys()], route = 'R6' } = {}) => { let at = T0 + d * 864e5; const list = order.map((i, n) => { if (n) at += gap(i, n) * 1000; return { run_id: `${route}-${d}`, address_key: `${route}|${i}`, done: true, user_name: who, device_time: new Date(at).toISOString(), lat: -36.9 + i * 0.00036, lng: 174.93, accuracy_m: 8 }; });
  return { run_id: `${route}-${d}`, route, date: new Date(T0 + d * 864e5).toISOString().slice(0, 10), list, drivers: [who], bulk: false }; };
const steady = (i) => 20 + (i % 5) * 4;
// The same street with a drive after every third letterbox: stops 0,1,2 then 250 m on, and so on.
const drives = (d, who, gap) => { const m = morning(d, who, gap); m.list.forEach((x, i) => { x.lat = -36.9 + i * 0.00036 + Math.floor(i / 3) * 0.00225; }); return m; };
t('two cars working one run are two tracks; two phones in one car are one', () => {
  const a = morning(0, 'Mike', () => 30).list.slice(0, 6); const far = a.map((x, i) => ({ ...x, address_key: `far${i}`, user_name: 'Lisa', lat: x.lat + 0.05, device_time: new Date(Date.parse(x.device_time) + 5000).toISOString() }));
  assert.equal(carTracks([...a, ...far]).length, 2); assert.equal(carTracks(a.map((x, i) => ({ ...x, user_name: i % 2 ? 'Zaph' : 'Mike' }))).length, 1);
  assert.equal(legsOf([...a, ...far], homes([...a, ...far])).length, 10);
});
t('a leg counts for ten minutes at most, however long the stop', () => { const m = morning(0, 'Mike', (i) => (i === 7 ? 1500 : 30)); const legs = legsOf(m.list, homes(m.list)); assert.equal(Math.max(...legs.map((l) => l.cs)), LEG_CAP_S); assert.equal(Math.max(...legs.map((l) => l.secs)), 1500); });
const steadyDays = Array.from({ length: 12 }, (_, d) => morning(d, 'Mike', steady));
t('steady mornings are predicted almost exactly, and the report card passes', () => { const r = reportCard(steadyDays); assert.equal(r.n, 12); assert.ok(r.typicalMissPct <= 1, `miss ${r.typicalMissPct}`); assert.equal(r.within5, 100); assert.equal(r.wholePass, true); assert.ok(r.rows.every((x) => x.coverage === 100)); });
t('a morning is never predicted from itself', () => { const model = learn([morning(0, 'Mike', steady), morning(1, 'Mike', steady)]); const u = model.used[0]; assert.equal(legCost(model, 'R6', u.legs[0], u.date).how, 'distance'); assert.equal(legCost(model, 'R6', u.legs[0], null).how, 'seen'); });
t('a leg nobody has driven is costed from its distance: further takes longer', () => { const hops = [...Array(30).keys()].filter((i) => i % 3 !== 1); const model = learn(Array.from({ length: 6 }, (_, d) => morning(d, 'Mike', (i, n) => 15 + (i - hops[n - 1]) * 12, { order: hops }))); const near = legCost(model, 'R6', { from: 'x', to: 'y', m: 40 }); const far = legCost(model, 'R6', { from: 'x', to: 'y', m: 400 }); assert.equal(near.how, 'distance'); assert.ok(far.secs > near.secs * 2, `${near.secs} ${far.secs}`); assert.equal(legCost(model, 'R6', { from: 'x', to: 'y', m: null }).how, 'average'); });
t('a crew that is always slower than the sum of its legs is scaled for it, so the prediction has no lean either way', () => {
  const days = Array.from({ length: 12 }, (_, d) => (d % 2 ? morning(d, 'Mike', steady) : morning(d, 'Lisa', (i, n) => steady(i) + (n % 10 === 0 ? 240 : 0))));
  const r = reportCard(days); assert.ok(Math.abs(r.biasPct) <= 3, `bias ${r.biasPct}`); assert.ok(r.rows.filter((x) => x.kind === 'Lisa').every((x) => Math.abs(x.errPct) <= 8), JSON.stringify(r.rows.filter((x) => x.kind === 'Lisa').map((x) => x.errPct)));
});
t('mornings that swing a lot from day to day fail the card, and it says by how much', () => {
  const days = Array.from({ length: 12 }, (_, d) => morning(d, 'Mike', (i) => steady(i) * (d % 3 === 0 ? 1.6 : d % 3 === 1 ? 1 : 0.7)));
  const r = reportCard(days); assert.equal(r.pass, false); assert.ok(r.typicalMissPct > TARGET_PCT); assert.ok(r.within5 < 60); assert.equal(r.byRun[0].route, 'R6');
});
t('the gate is the driving part: steady drives pass even when the time at the letterbox swings', () => {
  const days = Array.from({ length: 12 }, (_, d) => drives(d, 'Mike', (i) => (i % 3 === 0 ? 60 : 20 * (d % 3 === 0 ? 2 : d % 3 === 1 ? 1 : 0.6))));
  const r = reportCard(days); assert.equal(r.drive.n, 12); assert.ok(r.drive.typicalMissPct <= 1, `drive ${r.drive.typicalMissPct}`); assert.equal(r.pass, true); assert.equal(r.wholePass, false); assert.ok(r.rows[0].driveMin > 0);
});
t('drives that swing from day to day fail the gate; a street with no drives is not tested on driving', () => {
  const r = reportCard(Array.from({ length: 12 }, (_, d) => drives(d, 'Mike', (i) => (i % 3 === 0 ? 60 * (d % 3 === 0 ? 1.7 : d % 3 === 1 ? 1 : 0.6) : 20))));
  assert.equal(r.pass, false); assert.ok(r.drive.typicalMissPct > TARGET_PCT); assert.equal(reportCard(steadyDays).drive.n, 0); assert.equal(reportCard(steadyDays).pass, false);
});
t('too few mornings never pass, and runs marked to skip or ticked in one go are left out', () => { assert.equal(reportCard(steadyDays.slice(0, 5)).pass, false); assert.equal(reportCard(steadyDays, { skip: () => true }).n, 0); assert.equal(reportCard(steadyDays.map((m) => ({ ...m, bulk: true }))).n, 0); });
// Time at stops: the same legs, two drivers each alone. Lisa takes 6 s longer per leg on the first ten stops (street A), the same elsewhere.
const two = (lisaExtra) => [...[0, 2, 4].map((d) => morning(d, 'Mike', steady)), ...[1, 3].map((d) => morning(d, 'Lisa', (i) => steady(i + 1) + lisaExtra(i), { order: [...Array(30).keys()].reverse() }))].map((m) => { m.list.forEach((x) => { const i = +x.address_key.split('|')[1]; x.address_key = `H|${i < 10 ? 'A STREET' : 'B ROAD'}|${i}`; }); return m; });
t('time between stops is compared on the legs both have driven, whichever way round, street by street', () => {
  const r = stopTimes(two((i) => (i <= 9 ? 6 : 0))); assert.equal(r.length, 1); const x = r[0]; assert.equal(x.a, 'Lisa'); assert.equal(x.b, 'Mike'); assert.equal(x.aMornings, 2); assert.equal(x.legs, 29);
  assert.equal(x.streets[0].street, 'A STREET'); assert.equal(x.streets[0].diff, -60); assert.equal(x.streets.find((s) => s.street === 'B ROAD').diff, 0); assert.equal(x.aMin - x.bMin, 1);
});
t('one morning alone is not enough to compare, a morning with a helper is left out, and nothing is said about a run only one person drives', () => {
  assert.equal(stopTimes(two(() => 0).slice(0, 4)).length, 0); assert.equal(stopTimes(two(() => 0).map((m) => (m.drivers[0] === 'Lisa' ? { ...m, drivers: ['Lisa', 'Zaph'] } : m))).length, 0); assert.equal(stopTimes(steadyDays).length, 0);
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
