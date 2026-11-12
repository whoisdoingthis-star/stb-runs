// Driver Assistant engine: distances, sides, and what it says when (decision 0019).
import assert from 'node:assert/strict';
import { distance, bearing, sideOf, relativeAngle, parseOrs, sayDistance, Guide, stopNotes } from '../js/assistant.js';

let failed = 0;
const t = async (name, fn) => { try { await fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.log(`✗ ${name}\n  ${e.message}`); } };

// A made-up street in Howick: drive 400 m north, turn left, 200 m west to the stop.
const lat0 = -36.9000; const lng0 = 174.9300;
const north = (m) => m / 111320; const west = (m) => -m / (111320 * Math.cos((lat0 * Math.PI) / 180));
const pt = (n, w) => ({ lat: lat0 + north(n), lng: lng0 + west(w) });
const corner = pt(400, 0); const roadEnd = pt(400, 200); const stopAt = pt(392, 200); // letterbox 8 m south of the road = on the left driving west
const ors = { features: [{ geometry: { coordinates: [[lng0, lat0], [corner.lng, corner.lat], [roadEnd.lng, roadEnd.lat]] },
  properties: { summary: { distance: 600 }, segments: [{ steps: [
    { type: 11, instruction: 'Head north on Selwyn Road', name: 'Selwyn Road', way_points: [0, 1], distance: 400 },
    { type: 0, instruction: 'Turn left onto Masefield Avenue', name: 'Masefield Avenue', way_points: [1, 2], distance: 200 },
    { type: 10, instruction: 'Arrive at Masefield Avenue, on the left', name: '-', way_points: [2, 2], distance: 0 }] }] } }] };
const route = parseOrs(ors);

await t('distance and bearing', () => { assert.ok(Math.abs(distance(pt(0, 0), corner) - 400) < 2); assert.ok(Math.abs(bearing(pt(0, 0), corner)) < 1 || Math.abs(bearing(pt(0, 0), corner) - 360) < 1); });
await t('a point west of a road heading north is on the left', () => assert.equal(sideOf(pt(0, 0), corner, pt(200, 20)), 'left'));
await t('relative angle: target to the west while heading north is -90', () => assert.equal(Math.round(relativeAngle(0, 270)), -90));
await t('ORS steps parse with turn angles', () => { assert.equal(route.steps[1].angle, -90); assert.equal(route.steps[1].text, 'Turn left onto Masefield Avenue'); });
await t('distances are said the way people say them', () => { assert.equal(sayDistance(380), '400 metres'); assert.equal(sayDistance(180), '200 metres'); assert.equal(sayDistance(1240), '1.2 kilometres'); });

await t('new stop: names it and the first turn; then warns before the turn, at the turn, and on arrival', async () => {
  const g = new Guide({ route: async () => route });
  g.setStop({ key: 'a', label: '12 Masefield Avenue', spoken: '12 Masefield Avenue', at: stopAt, notes: ["Don't throw, put it in the Herald box"] });
  const said = [];
  const drive = (n, w, speed = 8) => { const r = g.update({ ...pt(n, w), heading: n < 400 ? 0 : 270, speed }); said.push(...r.say); return r; };
  drive(0, 0); await new Promise((r) => setTimeout(r, 0)); // first fix asks for the route
  const first = drive(5, 0);
  assert.match(said.join(' | '), /Next stop, 12 Masefield Avenue\. In 400 metres, turn left onto Masefield Avenue\./);
  assert.equal(first.view.mode, 'turn'); assert.equal(first.view.angle, -90);
  drive(250, 0); assert.match(said.at(-1), /^In 150 metres, turn left onto Masefield Avenue\.$/);
  drive(370, 0); assert.equal(said.at(-1), 'Turn left onto Masefield Avenue.');
  const near = drive(400, 170); assert.equal(near.view.mode, 'stop');
  drive(400, 185);
  assert.match(said.at(-1), /^Arriving\. 12 Masefield Avenue, on your left\. Don't throw, put it in the Herald box\.$/);
  assert.equal(said.filter((s) => s.startsWith('Arriving')).length, 1);
});

await t('without a route it points at the stop from the way you are moving', () => {
  const g = new Guide({ route: async () => null });
  g.setStop({ key: 'b', label: '27 Luplau Crescent', at: pt(100, 100), notes: [] });
  g.update({ ...pt(0, 0), heading: 0, speed: 5 });
  const r = g.update({ ...pt(20, 0), heading: 0, speed: 5 });
  assert.equal(r.view.mode, 'stop'); assert.ok(r.view.angle < -20 && r.view.angle > -70, `angle ${r.view.angle}`);
});

await t('a stop with no position yet still gets named', () => {
  const g = new Guide(); g.setStop({ key: 'c', label: '9 The Glebe', at: null, notes: [] });
  const r = g.update({ ...pt(0, 0) }); assert.equal(r.view.mode, 'nopos'); assert.deepEqual(r.say, ['Next stop, 9 The Glebe.']);
});

await t('notes read out: papers, sheet note, stop', () => {
  const n = stopNotes([{ parts: [{ pub: 'NZH', qty: 1 }, { pub: 'WD', qty: 1 }], note: 'Glass doors', flags: [{ type: 'stop', until: '2026-11-18', text: "STOP until Wed 18 Nov: don't deliver" }] }]);
  assert.deepEqual(n, ["1 Herald and 1 Woman's Day", "STOP until Wed 18 Nov: don't deliver", 'Glass doors']);
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }

// ---- lines Stan's voice gets ready early (decision 0023) ----
{
  const { Guide } = await import('../js/assistant.js');
  const g = new Guide({});
  g.setStop({ key: 'k1', label: '27 Luplau Crescent', spoken: '27 Luploe Crescent', notes: ['2 papers'], at: { lat: -36.9, lng: 174.93 } });
  const lines = g.likelyLines();
  t('Stan gets the next-stop and arriving lines ready early', () => { assert.ok(lines.includes('Next stop, 27 Luploe Crescent.')); assert.ok(lines.includes('Arriving. 27 Luploe Crescent, on your left. 2 papers.')); });
  g.setStop(null);
  t('no stop, nothing to get ready', () => assert.deepEqual(g.likelyLines(), []));
}
