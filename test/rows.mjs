// What-changed detection between two versions of a run sheet (js/rows.js).
import assert from 'assert';
import { diffLines, changeRecord, sha256Hex, runRow } from '../js/rows.js';
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
(async () => {
  const hex = await sha256Hex(new TextEncoder().encode('abc'));
  t('sha256 of "abc"', () => assert.equal(hex, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
  t('the run row carries the fingerprint', () => assert.equal(runRow({ route: 'X', sourceHash: hex }, 'f.pdf').source_hash, hex));
})();
