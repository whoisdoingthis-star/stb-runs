import { weekdayConflict, weekdayRule, parseReport, normNumber } from '../js/parser.js';
import assert from 'assert';
const t = (n, f) => { try { f(); console.log('✓', n); } catch (e) { console.log('✗', n, e.message); process.exitCode = 1; } };
t('FRI only on Saturday conflicts', () => assert.ok(weekdayConflict('FRI only', '2026-11-07')));
t('FRI only on Friday ok', () => assert.equal(weekdayConflict('FRI only', '2026-11-06'), null));
t('Friday Saturday only on Sat ok', () => assert.equal(weekdayConflict('Friday Saturday only', '2026-11-07'), null));
t('Friday Saturday only on Sunday conflicts', () => assert.ok(weekdayConflict('Friday Saturday only', '2026-11-08')));
t('7 days MonSun never conflicts', () => { for (let d = 1; d <= 7; d++) assert.equal(weekdayConflict('Del inside Mbx 7 days MonSun', `2026-11-0${d}`), null); });
t('Mon-Fri only on Sat conflicts', () => assert.ok(weekdayConflict('Mon-Fri only', '2026-11-07')));
t('No Sat on Sat conflicts', () => assert.ok(weekdayConflict('No Sat please', '2026-11-07')));
t('Plain note no rule', () => assert.equal(weekdayRule('Sushi shop, Monitor box').days, null));
t('Wades/Sushi not days', () => assert.equal(weekdayConflict('Wades Sushi only', '2026-11-07'), null));
t('normNumber', () => { assert.equal(normNumber('Suite 1/ 87'), 'SUITE 1/87'); assert.equal(normNumber('4c/ 12'), '4C/12'); });

// Synthetic page reproducing the old "TIMES" defect: an upper-case wrapped note line.
const hdr = (y) => [
  { s: 'Delivery List by Sequence for Saturday', x: 14.9, y: 805 }, { s: 'Route:', x: 14.9, y: 773.8 }, { s: 'HOWICK06', x: 72, y: 775.4 },
  { s: 'Delivery Date:', x: 371.9, y: 770 }, { s: '07-Nov-2026', x: 445.4, y: 770.3 },
  { s: 'ADDRESS', x: 14.9, y: 748.8 }, { s: 'PUB', x: 176.3, y: 748.8 }, { s: 'QTY', x: 242.4, y: 748.8 }, { s: 'DELIVERY INSTRUCTIONS', x: 293.9, y: 748.8 },
];
const row = (y, num, x, pub, qty, note) => [{ s: num, x, y }, { s: pub, x: 188.3, y }, { s: String(qty), x: 251.1, y }, ...(note ? [{ s: note, x: 287.9, y }] : [])];
const page = { number: 1, items: [
  ...hdr(), { s: 'UXBRIDGE ROAD', x: 14.9, y: 700 },
  ...row(685, '92', 98.3, 'NZH', 1, 'Deliver to the back of box at all'),
  { s: 'TIMES', x: 287.9, y: 671 },
  ...row(652, '95', 14.9, 'NZH', 1), ...row(634, '99A', 14.9, 'NZH', 1, 'FRI only'),
  ...row(616, '25', 14.9, 'NZH', 1), ...row(598, '25', 14.9, 'NZH', 3), ...row(580, '7', 14.9, 'WW', 1), ...row(562, '7', 14.9, 'NZH', 1),
  { s: 'Total Draw:', x: 41.5, y: 540 }, { s: '9', x: 108.5, y: 539 }, { s: 'TOTAL BY SERVICE:', x: 37, y: 530 }, { s: 'NZH', x: 37, y: 510 }, { s: '8', x: 165, y: 510 }, { s: 'WW', x: 37, y: 495 }, { s: '1', x: 165, y: 495 },
] };
const res = parseReport([page]).routes[0];
t('TIMES stays in the note, not a street', () => { assert.deepEqual([...new Set(res.lines.map((l) => l.street))], ['UXBRIDGE ROAD']); assert.match(res.lines[0].note, /all TIMES$/); });
t('Weekday conflict flagged but kept', () => assert.ok(res.lines.find((l) => l.number === '99A').flags.some((f) => f.type === 'weekday')));
t('Two rows at 25 combined into one tile of 4', () => { const k = res.lines.filter((l) => l.number === '25'); assert.equal(k.length, 1); assert.equal(k[0].qty, 4); assert.equal(k[0].sources.length, 2); assert.deepEqual(k[0].parts, [{ pub: 'NZH', qty: 4, lines: 2 }]); assert.ok(k[0].flags.some((f) => f.type === 'combined')); });
t('Totals reconcile', () => assert.ok(res.checks.every((c) => c.ok), JSON.stringify(res.checks)));
t('Column side', () => { assert.equal(res.lines[0].column, 'indent'); assert.equal(res.lines[1].column, 'left'); });
t('Different publications at one address share a tile, NZH first', () => { const k = res.lines.filter((l) => l.number === '7'); assert.equal(k.length, 1); assert.deepEqual(k[0].parts.map((p) => p.pub), ['NZH', 'WW']); assert.equal(k[0].qty, 2); assert.equal(k[0].lineKey, 'HOWICK|UXBRIDGE ROAD|7'); });
