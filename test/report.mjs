import assert from 'node:assert/strict';
import { buildReport, evidenceText, refDate, recordState, reportFileName } from '../js/report.js';
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
t('a photographed delivery with no complaint is included too', () => { assert.equal(r.photographed.length, 1); assert.equal(r.photographed[0].address, '4 Moore Street'); assert.equal(r.photographed[0].days[0].delivery.by, 'Lisa'); });
t('nothing from outside the dates gets in', () => { assert.ok(!r.complaints.some((c) => c.address === '9 Picton Street')); assert.ok(!r.photographed.some((g) => g.days.some((d) => d.photos.some((x) => x.path === 'old.jpg')))); });
t('the summary counts add up', () => assert.deepEqual([r.summary.complaints, r.summary.disputed, r.summary.withProof, r.summary.withPhoto, r.summary.photographed], [1, 1, 1, 1, 1]));
t('the delivery line reads plainly, with GPS', () => assert.match(evidenceText(r.complaints[0].delivery, () => '5:19:28 am'), /^Delivered by Mike at 5:19:28 am \(ticked in the app\) · GPS -36\.90147, 174\.93534, to about 4 m$/));
t('a paper-sheet delivery says so and claims no GPS', () => assert.match(evidenceText({ outcome: 'delivered', by: 'Moana', method: 'paper', at: 1 }), /^Delivered by Moana \(recorded from the paper run sheet, so no GPS\)$/));
t('no record is said plainly', () => assert.match(evidenceText(null), /No delivery record/));
// The clearer report (decision 0029)
t('a complaint is labelled as the publisher’s report, in plain words', () => { assert.equal(r.complaints[0].kindText, 'Missed delivery'); assert.equal(r.complaints[0].dayFrom, 'publisher'); assert.equal(r.complaints[0].no, 1); });
t('our record is stated on its own: delivered with time and GPS, paper sheet, or no record', () => {
  assert.deepEqual([recordState(r.complaints[0].delivery).state, recordState({ outcome: 'delivered', method: 'paper' }).state, recordState(null).state, recordState({ outcome: 'futile', method: 'app' }).good], ['app', 'paper', 'none', false]);
  assert.match(r.complaints[0].record.label, /^Delivered · time and GPS recorded$/); });
t('with no date on the sheet, the day comes from the publisher’s reference', () => {
  assert.equal(refDate('Nstna complaint (1211 NSNA) (NZH, 7-day subscriber)', '2026-11-13'), '2026-11-12');
  assert.equal(refDate('Missed delivery (711NZME DNR non 1st Issue Extension) (WW, SAT)', '2026-11-14'), '2026-11-07');
  assert.equal(refDate('Missed delivery (0711 missed delivery) (NZH, DIGSSBNDL)', '2026-11-14'), '2026-11-07'); });
t('a reference that isn’t a recent date is not guessed at', () => { assert.equal(refDate('Missed delivery (NZH, 7-day subscriber)', '2026-11-14'), null); assert.equal(refDate('ref 3002 x', '2026-03-05'), null); assert.equal(refDate('ref 0105 x', '2026-11-14'), null); });
const K2 = 'HOWICK|CARRIAGE CLOSE|1';
const r2 = buildReport({ from: '2026-11-08', to: '2026-11-14', complaints: [
  { address_key: K, number: '2/ 2A', street: 'KERRY DELL', route: 'HOWICK06', kind: 'NSTNA', happened_on: null, reported_on: '2026-11-13', description: 'Nstna complaint (1211 NSNA)', status: 'open' },
  { address_key: K2, number: '1', street: 'CARRIAGE CLOSE', route: 'HOWICK10', kind: 'MISSED', happened_on: null, reported_on: '2026-11-14', description: 'Missed delivery (WW, SAT)', status: 'open' }],
  ticks: [...ticks, { address_key: K, done: true, user_name: 'Lisa', device_time: '2026-11-12T14:40:13Z', lat: -36.9, lng: 174.9, accuracy_m: 4 }, { address_key: K2, done: true, user_name: 'Lisa', device_time: '2026-11-13T16:46:56Z', lat: -36.9, lng: 174.9, accuracy_m: 3 }],
  photos: [...photos, { address_key: K, taken_at: '2026-11-12T14:40:20Z', path: 'next.jpg', route: 'HOWICK06' }] });
const kd = r2.complaints.find((c) => c.address === '2/2A Kerry Dell'); const cc = r2.complaints.find((c) => c.address === '1 Carriage Close');
t('the record shown is for the morning complained about, not the day the complaint arrived', () => { assert.equal(kd.day, '2026-11-12'); assert.equal(kd.dayFrom, 'reference'); assert.equal(kd.delivery.by, 'Mike'); });
t('later deliveries at a complaint address sit with the complaint, not in the appendix', () => { assert.deepEqual(kd.since.map((x) => x.day), ['2026-11-13']); assert.equal(kd.since[0].photos[0].path, 'next.jpg'); assert.ok(!r2.photographed.some((g) => g.address === '2/2A Kerry Dell')); });
t('a complaint with no date at all is not matched to a morning', () => { assert.equal(cc.day, null); assert.equal(cc.delivery, null); assert.equal(cc.record.state, 'undated'); assert.deepEqual(cc.since.map((x) => x.day), ['2026-11-14']); });
t('the appendix groups photographed deliveries by address', () => { const g = r2.photographed.find((x) => x.address === '4 Moore Street'); assert.equal(g.days.length, 1); });
t('the saved PDF is named for the report and its dates', () => assert.equal(reportFileName('2026-11-08', '2026-11-14'), 'Zalense-Delivery-Report_HOWICK_2026-11-08_to_2026-11-14'));
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
