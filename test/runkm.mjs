import assert from 'node:assert/strict';
import { tickPath, lineKm, thin, chunks, routeKm, bestKm, clockKm, ROAD_FACTOR } from '../js/runkm.js';
let failed = 0; const later = [];
const t = (name, fn) => { const run = async () => { try { await fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } }; later.push(run); };
const tick = (i, lat, lng, extra = {}) => ({ done: true, lat, lng, accuracy_m: 8, device_time: new Date(Date.parse('2026-11-20T15:00:00Z') + i * 30000).toISOString(), ...extra });
// 0.001° of latitude is about 111 m
const ticks = [tick(0, -36.9, 174.93), tick(1, -36.90005, 174.93), tick(2, -36.901, 174.93), tick(4, -36.903, 174.93), tick(3, -36.902, 174.93),
  tick(5, -36.95, 174.93, { accuracy_m: 300 }), tick(6, null, null), tick(7, -36.904, 174.93, { method: 'paper' }), tick(8, -36.904, 174.93, { done: false })];
const path = tickPath(ticks);
t('the path is the located, delivered ticks in time order, with ticks at one spot merged', () => assert.deepEqual(path.map((p) => p.lat), [-36.9, -36.901, -36.902, -36.903]));
t('straight-line kilometres add up along the path', () => assert.equal(lineKm(path), 0.33));
t('a long path is thinned for routing but keeps its ends', () => { const long = Array.from({ length: 1000 }, (_, i) => ({ lat: -36.9 - i * 0.0002, lng: 174.93 })); const x = thin(long, 240); assert.equal(x.length, 240); assert.equal(x[0], long[0]); assert.equal(x[239], long[999]); assert.equal(thin(path), path); });
t('pieces for the mapping service each start where the last ended', () => { const pts = Array.from({ length: 100 }, (_, i) => i); const c = chunks(pts, 40); assert.deepEqual(c.map((x) => [x[0], x[x.length - 1], x.length]), [[0, 39, 40], [39, 78, 40], [78, 99, 22]]); assert.deepEqual(chunks([1, 2], 40), [[1, 2]]); });
t('driving kilometres are the pieces added together', async () => { const calls = []; const km = await routeKm(path, async (p) => { calls.push(p.length); return 420; }); assert.equal(km, 0.42); assert.deepEqual(calls, [4]); });
t('an answer that is not believable, or a failed piece, gives no driving figure', async () => { assert.equal(await routeKm(path, async () => 100), null); assert.equal(await routeKm(path, async () => 9000), null); assert.equal(await routeKm(path, async () => null), null); assert.equal(await routeKm([path[0]], async () => 5), null); });
t('the figure shown is routed when every run has one, otherwise stretched from the straight line and marked rough', () => {
  assert.deepEqual(bestKm([{ line_km: 8, road_km: 10.44 }, { line_km: 5, road_km: 6.5 }]), { km: 16.9, routed: true, runs: 2 });
  assert.deepEqual(bestKm([{ line_km: 8, road_km: 10.44 }, { line_km: 5, road_km: null }]), { km: +(10.44 + 5 * ROAD_FACTOR).toFixed(1), routed: false, runs: 2 }); assert.equal(bestKm([]), null);
});
t('kilometres on the clock need two readings that make sense', () => { assert.equal(clockKm(84512, 84547), 35); assert.equal(clockKm(84512, null), null); assert.equal(clockKm(84547, 84512), null); assert.equal(clockKm(100, 84512), null); });
for (const run of later) await run();
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
