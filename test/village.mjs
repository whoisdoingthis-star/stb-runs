// Run 8 acceptance tests (AT-01..AT-10 from the Run 8 rules doc), run against real sheets.
import * as pdfjs from '/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import assert from 'assert';
import { extractPages, parseReport } from '../js/parser.js';
import { arrange, layoutFor, unitNumber, bankFor } from '../js/village.js';
const t = (n, f) => { try { f(); console.log('✓', n); } catch (e) { console.log('✗', n, '-', e.message); process.exitCode = 1; } };
const sheets = process.argv.slice(2);
const L = layoutFor('HOWICK08');
const monaco = L.sections.find((s) => s.id === 'MONACO');

t('unit numbers', () => { assert.equal(unitNumber('IA/ 249'), 249); assert.equal(unitNumber('267IA'), 267); assert.equal(unitNumber('Level 2/ 238'), 238); assert.equal(unitNumber('401A'), 401); });
t('AT-05 Monaco 462 is in Bank 2 (override)', () => assert.equal(bankFor(monaco, '462').bank, '2'));
const hulmeS = L.sections.find((x) => x.id === 'HULME');
t('Hulme Bank 2 photo: 352-354 and 440-450 are Bank 2', () => { for (const u of [352, 353, 354, 440, 444, 447, 450]) assert.equal(bankFor(hulmeS, String(u)).bank, '2', u); });
t('Hulme Bank 1 photo: 140-144, 240-254, 340-351 incl. 254 and 253A', () => { for (const u of ['140', '144', '240', '253A', '254', '343', '351']) assert.equal(bankFor(hulmeS, u).bank, '1', u); assert.equal(bankFor(hulmeS, '255').bank, null); });
t('Monaco photos: 165 is Bank 2; 160-164 Bank 1; 366/369/464/468/472 Bank 2', () => {
  assert.equal(bankFor(monaco, '165').bank, '2');
  for (const u of ['160', '164', '486', '383']) assert.equal(bankFor(monaco, u).bank, '1', u);
  for (const u of ['A/ 366', 'A/ 369', '464', 'IA/ 468', '472', '266', '267IA']) assert.equal(bankFor(monaco, u).bank, '2', u);
  assert.equal(bankFor(monaco, '170').bank, null);
});
t('AT-05 corrected 379 is Bank 1, not 79', () => { assert.equal(bankFor(monaco, '379').bank, '1'); assert.equal(bankFor(monaco, '79').bank, null); });

for (const f of sheets) {
  const res = parseReport(await extractPages(pdfjs, new Uint8Array(fs.readFileSync(f))));
  const r = res.routes.find((x) => x.route === 'HOWICK08');
  if (!r) continue;
  const lines = r.lines.map((l) => ({ ...l }));
  const shuffled = [...lines].reverse();
  const a = arrange(L, lines);
  const b = arrange(L, shuffled);
  const ids = (x) => x.groups.filter((g) => g.section).map((g) => g.section.id).join('>');
  const tag = `[${r.deliveryDate}]`;
  console.log(`\n${tag} ${r.summary.copies} copies:`, a.totals.map((x) => `${x.label} ${x.qty}`).join(' · '));
  t(`${tag} AT-01 order Amon>Hulme>Monaco>Austin>Reception, even shuffled`, () => { assert.equal(ids(a), 'AMON>HULME>MONACO>AUSTIN>RECEPTION'); assert.equal(ids(b), ids(a)); });
  const rec = a.groups.find((g) => g.type === 'bundle');
  t(`${tag} AT-03 Room 145, Room 236, SA103 once each in reception, still marked unrouted`, () => {
    for (const [num, st] of [['145', 'CARE CENTRE'], ['236', 'CARE CENTRE'], ['103', 'SERVICED']]) {
      const hits = a.groups.flatMap((g) => g.lines).filter((l) => l.number === num && l.street.includes(st));
      assert.equal(hits.length, 1, `${num} ${st}`);
      assert.ok(rec.lines.includes(hits[0]), `${num} not in reception`);
      assert.ok(hits[0].flags.some((fl) => fl.type === 'unrouted'));
    }
  });
  t(`${tag} AT-04 reception is one handover of ${rec.qty} (Reception ${rec.parts.map((p) => p.qty).join(' + ')})`, () => assert.equal(rec.qty, rec.parts.reduce((n, p) => n + p.qty, 0)));
  const hulme = a.groups.find((g) => g.section?.id === 'HULME');
  t(`${tag} AT-05 Hulme/Monaco show separate banks`, () => { assert.ok(hulme.banks.length >= 2); assert.ok(a.groups.find((g) => g.section?.id === 'MONACO').banks.length >= 2); });
  t(`${tag} AT-06 prefixes kept, numeric sort, 249 and IA/249 both kept side by side`, () => {
    const hl = hulme.banks.flatMap((x) => x.lines).map((l) => l.number);
    const i = hl.indexOf('249');
    if (hl.includes('IA/ 249')) assert.equal(hl[i + 1], 'IA/ 249');
    for (const bk of hulme.banks) { const ns = bk.lines.map((l) => unitNumber(l.number)); assert.deepEqual(ns, [...ns].sort((x, y) => x - y)); }
  });
  t(`${tag} AT-07 totals reconcile to the sheet (${JSON.stringify(r.summary.byPub)})`, () => { assert.ok(r.ok); assert.equal(a.totals.reduce((n, x) => n + x.qty, 0) + a.groups.filter((g) => !g.section).flatMap((g) => g.lines).reduce((n, l) => n + l.qty, 0), r.summary.copies); });
  t(`${tag} AT-09 every source line placed exactly once`, () => assert.ok(a.mappedOnce));
  t(`${tag} AT-10 reconciled to its own totals, not forced to 71`, () => assert.equal(r.checks.every((c) => c.ok), true));
  t(`${tag} every Hulme and Monaco unit on this sheet is on a photographed bank`, () => assert.deepEqual(a.exceptions, []));
  if (a.exceptions.length) console.log(`  ${a.exceptions.length} for review:\n   - ${a.exceptions.join('\n   - ')}`);
}
