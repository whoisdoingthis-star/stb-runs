import assert from 'node:assert/strict';
import { buildReport, evidenceText } from '../js/report.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const K = 'HOWICK|KERRY DELL|2/2A';
const complaints = [
  { address_key: K, number: '2/ 2A', street: 'KERRY DELL', route: 'HOWICK06', kind: 'MISSED', publication: 'NZH', happened_on: '2026-11-12', reported_on: '2026-11-13', status: 'disputed', notes: 'Delivered 5:19, told Puneet', customer_complaints: 2, customer_complaint_no: 2 },
  { address_key: 'HOWICK|PICTON STREET|9', number: '9', street: 'PICTON STREET', route: 'HOWICK06', kind: 'WET', happened_on: '2026-11-02', reported_on: '2026-11-03', status: 'closed' },
];
const ticks = [
  { address_key: K, done: true, user_name: 'Mike', device_time: '2026-11-11T16:19:28Z', lat: -36.90147, lng: 174.93534, accuracy_m: 4 },
  { address_key: 'HOWICK|MOORE STREET|4', done: true, user_name: 'Lisa', device_time: '2026-11-11T16:40:00Z', lat: -36.9, lng: 174.93, accuracy_m: 6 },
];
const photos = [
  { address_key: K, taken_at: '2026-11-11T16:19:40Z', path: 'a.jpg', user_name: 'Mike', route: 'HOWICK06' },
  { address_key: 'HOWICK|MOORE STREET|4', taken_at: '2026-11-11T16:40:10Z', path: 'b.jpg', user_name: 'Lisa', route: 'HOWICK06' },
  { address_key: 'HOWICK|MOORE STREET|4', taken_at: '2026-10-01T16:40:10Z', path: 'old.jpg', route: 'HOWICK06' },
];
const r = buildReport({ from: '2026-11-09', to: '2026-11-13', complaints, photos, ticks });
t('complaints in the dates are listed with their status and our notes', () => { assert.equal(r.complaints.length, 1); const c = r.complaints[0]; assert.equal(c.address, '2/2A Kerry Dell'); assert.match(c.statusText, /Disputed/); assert.equal(c.notes, 'Delivered 5:19, told Puneet'); assert.match(c.repeat, /2 of 2/); });
t('each complaint carries that day’s delivery record: who, when, GPS', () => { const d = r.complaints[0].delivery; assert.equal(d.by, 'Mike'); assert.equal(d.lat, -36.90147); assert.equal(d.accuracy_m, 4); });
t('and the photos taken at that address that day', () => assert.deepEqual(r.complaints[0].photos.map((p) => p.path), ['a.jpg']));
t('a photographed delivery with no complaint is included too', () => { assert.equal(r.photographed.length, 1); assert.equal(r.photographed[0].address, '4 Moore Street'); assert.equal(r.photographed[0].delivery.by, 'Lisa'); });
t('nothing from outside the dates gets in', () => { assert.ok(!r.complaints.some((c) => c.address === '9 Picton Street')); assert.ok(!r.photographed.some((p) => p.photos.some((x) => x.path === 'old.jpg'))); });
t('the summary counts add up', () => assert.deepEqual([r.summary.complaints, r.summary.disputed, r.summary.withProof, r.summary.withPhoto, r.summary.photographed], [1, 1, 1, 1, 1]));
t('the delivery line reads plainly, with GPS', () => assert.match(evidenceText(r.complaints[0].delivery, () => '5:19:28 am'), /^Delivered by Mike at 5:19:28 am \(ticked in the app\) · GPS -36\.90147, 174\.93534, to about 4 m$/));
t('a paper-sheet delivery says so and claims no GPS', () => assert.match(evidenceText({ outcome: 'delivered', by: 'Moana', method: 'paper', at: 1 }), /^Delivered by Moana \(recorded from the paper run sheet, so no GPS\)$/));
t('no record is said plainly', () => assert.match(evidenceText(null), /No delivery record/));
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
