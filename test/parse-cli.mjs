import * as pdfjs from '/opt/npm-tools/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import { extractPages, parseReport } from '../js/parser.js';
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const res = parseReport(await extractPages(pdfjs, data));
if (process.argv[3] === '--json') { fs.writeFileSync(process.argv[4] || '/dev/stdout', JSON.stringify(res, null, 1)); } else {
console.log('problems', res.problems);
for (const r of res.routes) {
  console.log(`\n== ${r.route} ${r.deliveryDate} (${r.weekdayName}) ok=${r.ok}`, r.summary);
  for (const c of r.checks) console.log(c.ok ? '  ✓' : '  ✗', c.label, 'expected', c.expected, 'got', c.got);
  for (const w of r.warnings) console.log('  ! ', w);
  for (const l of r.lines.filter(l=>l.flags.length)) console.log('  flag', l.number, l.street, l.pub, l.flags.map(f=>f.text).join('; '));
  console.log('  blocks', Math.max(...r.lines.map(l=>l.block)), 'first', r.lines[0], 'notes w/ wrap sample', r.lines.find(l=>l.number==='G/ 87')?.note);
}
}
