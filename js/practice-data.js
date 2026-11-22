// Made-up run sheets for Sandbox Stan (decision 0065). The same shape the parser makes from a real RouteSmart sheet, so
// the practice app runs exactly the code the family uses. Every street, number and note here is invented: the repository
// is public and no customer is ever in it. Two short runs, so a practice morning takes a few minutes, with one of each
// thing worth meeting before a real run: a shop drop with a docket, a second paper, two papers at one box, a new start,
// a complaint and a delivery note.

import { addressKey } from './parser.js';

const AREA = 'PRACTICE';
// [street, number, papers [[pub, qty]], note, flag]
const RUNS = {
  PRACTICE01: [
    ['KOWHAI LANE', '2', [['NZH', 1]]], ['KOWHAI LANE', '6', [['NZH', 1]], 'Box on the fence'], ['KOWHAI LANE', '9', [['NZH', 1]], null, 'start'],
    ['KOWHAI LANE', '14', [['NZH', 2]]], ['TUI CRESCENT', '1', [['NZH', 1], ['WD', 1]]], ['TUI CRESCENT', '5', [['NZH', 1]]],
    ['TUI CRESCENT', '11', [['NZH', 1]], null, 'complaint'], ['TUI CRESCENT', '20', [['WD', 1]]], ['HARBOUR VIEW ROAD', '3', [['NZHR', 3]], 'Corner dairy: docket with the papers'],
    ['HARBOUR VIEW ROAD', '17', [['NZH', 1]]], ['HARBOUR VIEW ROAD', '25A', [['NZH', 1]], 'In the green box, not the letterbox'], ['HARBOUR VIEW ROAD', '31', [['NZH', 1]]],
  ],
  PRACTICE02: [
    ['KERERU PLACE', '4', [['NZH', 1]]], ['KERERU PLACE', '8', [['NZH', 1]]], ['KERERU PLACE', '12', [['NZH', 1]], 'Beware of the dog: throw over the gate'],
    ['PIPI STREET', '2', [['NZH', 1]]], ['PIPI STREET', '7', [['NZH', 1], ['WD', 1]]], ['PIPI STREET', '15', [['NZH', 1]]],
    ['PIPI STREET', '19', [['NZH', 1]], null, 'start'], ['PIPI STREET', '23', [['NZH', 1]]],
  ],
};

const fmtShort = (d) => new Intl.DateTimeFormat('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));

/** The practice runs for a date (YYYY-MM-DD), as parser.js would return them. */
export function practiceRuns(date) {
  const yesterday = new Date(Date.parse(`${date}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat('en-NZ', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return Object.entries(RUNS).map(([route, rows]) => {
    let block = 0; let prev = null; const byPub = {};
    const lines = rows.map(([street, number, papers, note, flag], i) => {
      if (street !== prev) { block += 1; prev = street; }
      const parts = papers.map(([pub, qty]) => ({ pub, qty, lines: 1 }));
      for (const p of parts) byPub[p.pub] = (byPub[p.pub] || 0) + p.qty;
      const key = addressKey(AREA, street, number);
      const flags = flag === 'start' ? [{ type: 'start', text: 'New start: NZH (WKLY7)' }]
        : flag === 'complaint' ? [{ type: 'complaint', text: `Missed delivery on ${fmtShort(yesterday)} (NZH, 7-day subscriber)`, kind: 'MISSED', on: yesterday, pub: 'NZH', service: 'WKLY7', raw: 'practice' }] : [];
      return { lineKey: key, addressKey: key, seq: i + 1, block, street, number, column: i % 3 === 2 ? 'indent' : 'left', pub: parts.map((p) => p.pub).join('+'), qty: parts.reduce((n, p) => n + p.qty, 0),
        note: note || null, flags, sources: parts.map((p) => ({ pub: p.pub, qty: p.qty, raw: `${number} ${p.pub} ${p.qty}${note ? ` ${note}` : ''}`, seq: i + 1, page: 1, ...(note ? { note } : {}) })), parts };
    });
    const copies = lines.reduce((n, l) => n + l.qty, 0);
    const checks = [...Object.entries(byPub).map(([p, n]) => ({ label: `${p}: delivery list total`, expected: n, got: n, ok: true })), { label: 'Total draw', expected: copies, got: copies, ok: true }];
    return {
      route, deliveryDate: date, weekdayName: weekday, dataProcessed: null, reportRequested: null, ok: true, lines, checks, warnings: [],
      summary: { lines: lines.length, sheetLines: lines.length, multiPub: lines.filter((l) => l.parts.length > 1).length, copies, byPub, dockets: lines.filter((l) => l.parts.some((p) => p.pub.endsWith('R'))).length, streets: new Set(lines.map((l) => l.street)).size },
      keyReport: { route, pubs: Object.fromEntries(Object.entries(byPub).map(([p, n]) => [p, { draw: n, odd: n, bundles: '0 with 50' }])), stops: [], wraps: [], starts: [], complaints: [], counts: {}, dateText: date },
    };
  });
}
