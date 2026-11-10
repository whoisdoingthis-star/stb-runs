// What-changed detection between two versions of a run sheet (js/rows.js).
import assert from 'assert';
import { diffLines, changeRecord, sha256Hex, runRow, rebundle } from '../js/rows.js';
const t = (n, f) => { try { f(); console.log('✓', n); } catch (e) { console.log('✗', n, e.message); process.exitCode = 1; } };
const line = (num, street, parts, note = null) => ({ address_key: `HOWICK|${street}|${num}`, number: num, street, parts: parts.map(([pub, qty]) => ({ pub, qty })), note });
const before = [line('13', 'AMBROSE LANE', [['NZH', 1]]), line('37', 'GRIGGS ROAD', [['NZH', 1]]), line('319', 'CLIFTON ROAD', [['NZH', 1]])];
t('same sheet, no changes', () => assert.deepEqual(diffLines(before, before), []));
t('quantity, note, added and removed are reported', () => {
  const after = [line('13', 'AMBROSE LANE', [['NZH', 2]]), line('37', 'GRIGGS ROAD', [['NZH', 1]], 'Leave at door'), line('12', 'SMITH ROAD', [['NZH', 1], ['WD', 1]])];
  assert.deepEqual(diffLines(before, after), [
    '13 Ambrose Lane: NZH ×1 → NZH ×2',
    '37 Griggs Road: note now "Leave at door"',
    'Added 12 Smith Road (NZH ×1, WD ×1)',
    'Removed 319 Clifton Road (NZH ×1)',
  ]);
});
t('publication order does not count as a change', () => {
  const a = [line('1', 'X ROAD', [['NZH', 1], ['WD', 1]])], b = [line('1', 'X ROAD', [['WD', 1], ['NZH', 1]])];
  assert.deepEqual(diffLines(a, b), []);
});
t('change record counts items', () => { const r = changeRecord(before, []); assert.equal(r.count, 3); assert.ok(r.at); });
// Depot pick, all runs: the day's total re-bundled by that day's bundle size (Mike, 10 Nov 2026).
t('RB-015 all runs: total papers re-bundled by the bundle size of the day', () => {
  const day = [{ pub: 'NZH', size: 80, bundles: 1, loose: 37, draw: 117, retailQty: 16 }, { pub: 'NZH', size: null, bundles: 0, loose: 69, draw: 69 },
    { pub: 'NZH', size: null, bundles: 0, loose: 79, draw: 79 }, { pub: 'NZH', size: null, bundles: 0, loose: 22, draw: 22 }, { pub: 'NZH', size: null, bundles: 0, loose: 32, draw: 32 }];
  const [x] = rebundle(day);
  assert.deepEqual([x.draw, x.size, x.bundles, x.loose, x.retailQty], [319, 80, 3, 79, 16]);
  // another day, another size: same papers, different answer
  const [y] = rebundle(day.map((d) => ({ ...d, size: d.size ? 100 : null })));
  assert.deepEqual([y.size, y.bundles, y.loose], [100, 3, 19]);
});
t('RB-015 all runs: no bundle size on the sheets means all loose, and says so', () => {
  const [x] = rebundle([{ pub: 'WD', size: null, bundles: 0, loose: 4, draw: 4 }, { pub: 'WD', size: null, bundles: 0, loose: 3, draw: 3 }]);
  assert.deepEqual([x.bundles, x.loose, x.sizeUnknown], [0, 7, true]);
});
t('RB-015 all runs: sheets that disagree on the size are added up, not guessed', () => {
  const [x] = rebundle([{ pub: 'NZH', size: 80, bundles: 1, loose: 5, draw: 85 }, { pub: 'NZH', size: 100, bundles: 1, loose: 10, draw: 110 }]);
  assert.deepEqual([x.bundles, x.loose, x.mixed], [2, 15, [80, 100]]);
});
(async () => {
  const hex = await sha256Hex(new TextEncoder().encode('abc'));
  t('sha256 of "abc"', () => assert.equal(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  t('the run row carries the fingerprint', () => assert.equal(runRow({ route: 'X', sourceHash: hex }, 'f.pdf').source_hash, hex));
})();
