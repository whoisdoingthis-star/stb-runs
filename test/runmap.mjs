import assert from 'node:assert/strict';
import { runMapData, pingText } from '../js/runmap.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const L = (k, n, seq) => ({ line_key: `k${k}`, address_key: `A${n}`, number: String(n), street: 'PICTON STREET', seq });
const lines = [L(1, 1, 1), L(2, 2, 2), L(3, 2, 3), L(4, 3, 4), L(5, 4, 5)];
const dests = { A1: { lat: -36.9, lng: 174.93 }, A2: { lat: -36.901, lng: 174.931 }, A3: { lat: -36.902, lng: 174.932 } };
const tick = (k, outcome = 'delivered') => ({ line_key: `k${k}`, done: true, outcome, user_name: 'Lisa', device_time: `2026-11-13T05:0${k}:00Z` });
t('stops are addresses, in sheet order, blue until done', () => {
  const m = runMapData({ lines, status: [], dests });
  assert.deepEqual(m.stops.map((s) => [s.label, s.state]), [['1 Picton Street', 'todo'], ['2 Picton Street', 'todo'], ['3 Picton Street', 'todo']]);
});
t('an address with two papers turns green only when both are ticked', () => {
  assert.equal(runMapData({ lines, status: [tick(2)], dests }).stops[1].state, 'todo');
  assert.equal(runMapData({ lines, status: [tick(2), tick(3)], dests }).stops[1].state, 'done');
});
t('the trail turns green up to each stop that has been dealt with', () => {
  const m = runMapData({ lines, status: [tick(1), tick(2), tick(3)], dests });
  assert.deepEqual(m.trail.map((x) => x.travelled), [true, false]);
});
t('couldn’t deliver is its own colour, and still counts as travelled', () => {
  const m = runMapData({ lines, status: [tick(4, 'futile')], dests });
  assert.equal(m.stops[2].state, 'failed'); assert.equal(m.trail[1].travelled, true);
});
t('the saved order for the route wins over the sheet', () => assert.deepEqual(runMapData({ lines, dests, order: ['A3', 'A1', 'A2'] }).stops.map((s) => s.key), ['A3', 'A1', 'A2']));
t('addresses with no position are listed, not dropped silently', () => { const m = runMapData({ lines, dests }); assert.deepEqual(m.missing, ['4 Picton Street']); assert.equal(m.counts.missing, 1); assert.equal(m.counts.total, 4); });
const fmt = () => '5:41 am';
t('ping answered: says where and how exact', () => assert.match(pingText('Lisa', { state: 'answered', answered_at: 1, accuracy_m: 8.4 }, null, fmt), /Lisa is here \(as of 5:41 am, to about 8 m\)/));
t('no answer: says the app isn’t open, and gives the last tick', () => assert.match(pingText('Lisa', null, { at: 1, label: '2 Picton Street' }, fmt), /isn’t open on Lisa’s phone\. Last tick: 5:41 am, 2 Picton Street/));
t('off duty: nothing is shared', () => assert.match(pingText('Lisa', { state: 'off_duty' }, null, fmt), /off duty/));
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
