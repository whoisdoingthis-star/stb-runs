import assert from 'node:assert/strict';
import { tickPath, tickTracks, runDistance, lineKm, thin, chunks, routeKm, routeTrack, simplify, doubledBack, bestKm, clockKm, ROAD_FACTOR } from '../js/runkm.js';
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
// Two cars on one run: one works south from -36.900, the other works south from -36.950, ticking in turn every 30 seconds.
const two = []; for (let i = 0; i < 10; i++) { two.push(tick(i * 2, -36.9 - i * 0.001, 174.93, { user_name: 'Lisa' })); two.push(tick(i * 2 + 1, -36.95 - i * 0.001, 174.93, { user_name: 'Mike' })); }
t('two cars on one run are two tracks, not one path zig-zagging between them', () => { const tr = tickTracks(two); assert.equal(tr.length, 2); assert.deepEqual(tr.map((x) => x.length), [10, 10]); assert.ok(lineKm(tickTracks(two)[0]) < 1.1); });
t('a run’s kilometres add the cars together', async () => { const d = await runDistance(two, async (pts) => lineKm(pts) * 1250); assert.deepEqual(d, { line_km: 2, road_km: 2.5, points: 20, trace: null }); });
t('a driver and a helper ticking from the same car are one track', () => { const same = []; for (let i = 0; i < 12; i++) same.push(tick(i, -36.9 - i * 0.001, 174.93, { user_name: i % 3 ? 'Lisa' : 'Lenny' })); assert.equal(tickTracks(same).length, 1); });
t('a stray point far from the car adds nothing', async () => { const stray = [...two.filter((x) => x.user_name === 'Lisa'), tick(9, -36.2, 174.5)]; const d = await runDistance(stray, async () => null); assert.equal(d.line_km, 1); assert.equal(d.road_km, null); assert.equal(d.points, 10); });
t('nothing driven, no figure', async () => assert.equal(await runDistance([tick(0, -36.9, 174.93), tick(1, -36.9, 174.93)], async () => 5), null));
// the map hands back the road it took, as [lng, lat] points: here, the path itself with a point halfway along each hop
const withLine = async (pts) => ({ metres: lineKm(pts) * 1100, line: pts.flatMap((p, i) => (i ? [[(pts[i - 1].lng + p.lng) / 2, (pts[i - 1].lat + p.lat) / 2], [p.lng, p.lat]] : [[p.lng, p.lat]])) });
t('when the map hands back the road it took, the trace is kept as lat/lng, thinned to its shape', async () => { const r = await routeTrack(path, withLine); assert.equal(r.km, 0.36); assert.deepEqual(r.line, [[-36.9, 174.93], [-36.903, 174.93]]); });
t('a run’s trace has one line per car, and none if the map gave no road', async () => { const d = await runDistance(two, withLine); assert.equal(d.trace.length, 2); assert.deepEqual(d.trace[0][0], [-36.9, 174.93]); assert.equal((await runDistance(two, async (pts) => lineKm(pts) * 1250)).trace, null); });
t('thinning keeps corners and drops points along a straight', () => assert.deepEqual(simplify([[-36.9, 174.93], [-36.9005, 174.93], [-36.901, 174.93], [-36.901, 174.931], [-36.901, 174.932]]), [[-36.9, 174.93], [-36.901, 174.93], [-36.901, 174.932]]));
t('going back over the same road is found, whichever way it is driven', () => {
  const outAndBack = [[[-36.9, 174.93], [-36.905, 174.93], [-36.9, 174.93]]]; const g = doubledBack(outAndBack);
  assert.ok(Math.abs(g.metres - 553) < 40, String(g.metres)); assert.ok(Math.abs(g.totalMetres - 1106) < 30, String(g.totalMetres)); assert.equal(g.pieces.length, 1);
  const loop = [[[-36.9, 174.93], [-36.905, 174.93], [-36.905, 174.936], [-36.9, 174.936], [-36.9, 174.93]]]; assert.equal(doubledBack(loop).metres, 0); assert.deepEqual(doubledBack(loop).pieces, []);
  assert.deepEqual(doubledBack([]), { metres: 0, totalMetres: 0, pieces: [] });
});
t('two cars on the same street are not each other’s doubling back', () => assert.equal(doubledBack([[[-36.9, 174.93], [-36.905, 174.93]], [[-36.9, 174.93], [-36.905, 174.93]]]).metres, 0));
t('the figure shown is routed when every run has one, otherwise stretched from the straight line and marked rough', () => {
  assert.deepEqual(bestKm([{ line_km: 8, road_km: 10.44 }, { line_km: 5, road_km: 6.5 }]), { km: 16.9, routed: true, runs: 2 });
  assert.deepEqual(bestKm([{ line_km: 8, road_km: 10.44 }, { line_km: 5, road_km: null }]), { km: +(10.44 + 5 * ROAD_FACTOR).toFixed(1), routed: false, runs: 2 }); assert.equal(bestKm([]), null);
});
t('kilometres on the clock need two readings that make sense', () => { assert.equal(clockKm(84512, 84547), 35); assert.equal(clockKm(84512, null), null); assert.equal(clockKm(84547, 84512), null); assert.equal(clockKm(100, 84512), null); });
for (const run of later) await run();
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
