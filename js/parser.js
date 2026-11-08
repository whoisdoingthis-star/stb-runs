// Run sheet parser for "Transaction Processing" key reports and
// "Delivery List by Sequence" pages.
//
// It reads text by position, not by guessing: every piece of text on a page
// has an x/y position, and each column (address, publication, quantity,
// instructions) sits at a fixed x. That is what keeps a wrapped note such as
// "TIMES" from ever being mistaken for a street heading.
//
// Works in the browser and in Node. Pass in pdf.js so the same code runs in both.

/** Read every page of a PDF into positioned text items. */
export async function extractPages(pdfjsLib, data) {
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      const s = (it.str || '').replace(/\s+/g, ' ').trim();
      if (!s) continue;
      items.push({ s, x: it.transform[4], y: it.transform[5], h: it.height });
    }
    pages.push({ number: p, items });
  }
  if (doc.destroy) await doc.destroy(); else if (doc.cleanup) await doc.cleanup();
  return pages;
}

const LINE_TOLERANCE = 3.5; // points; rows are ~18pt apart, wrapped notes ~14pt

/** Group items into visual lines, top to bottom, each sorted left to right. */
function toLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= LINE_TOLERANCE) last.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

const lineText = (l) => l.items.map((i) => i.s).join(' ');
const after = (items, label) => {
  const i = items.findIndex((it) => it.s === label);
  return i >= 0 && items[i + 1] ? items[i + 1].s : null;
};
const isUpperHeading = (s) => /[A-Z]/.test(s) && s === s.toUpperCase() && !/^\d+[A-Z]?$/.test(s);

/** Area is the route code without its number: HOWICK06 -> HOWICK. */
export const areaOf = (route) => route.replace(/\d+$/, '');

/** "Suite 1/ 87" -> "SUITE 1/87", "4c/ 12" -> "4C/12". */
export function normNumber(n) {
  return n.toUpperCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
}

/** Same letterbox, same key, every day: HOWICK|UXBRIDGE ROAD|1/71 */
export function addressKey(route, street, number) {
  return `${areaOf(route)}|${street.toUpperCase().trim()}|${normNumber(number)}`;
}

function parseDate(ddMonYyyy) {
  // 06-Nov-2026 -> 2026-11-06
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(ddMonYyyy || '');
  if (!m) return null;
  const mon = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase()) + 1;
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// ---------- weekday rules in delivery notes ----------

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY = '(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const dayIdx = (w) => DAYS.indexOf(w.slice(0, 3).toLowerCase());

function expandRange(a, b) {
  const out = [];
  let i = dayIdx(a);
  const end = dayIdx(b);
  for (let n = 0; n < 7; n++) { out.push(i); if (i === end) break; i = (i + 1) % 7; }
  return out;
}

/**
 * Returns { days: Set|null, excluded: Set } describing any weekday rule in a note.
 * "FRI only" -> {fri}; "7 days MonSun" -> all; "Friday Saturday only" -> {fri, sat}.
 */
export function weekdayRule(note) {
  const text = ` ${note} `;
  const excluded = new Set();
  for (const m of text.matchAll(new RegExp(`\\b(?:no|not|except)\\s+${DAY}(?![a-z])`, 'gi'))) excluded.add(dayIdx(m[1]));
  if (!/\bonly\b/i.test(text)) return { days: null, excluded };
  const days = new Set();
  if (/\b7\s*days?\b/i.test(text)) DAYS.forEach((_, i) => days.add(i));
  let rest = text;
  for (const re of [new RegExp(`\\b${DAY}\\s*(?:-|–|to)\\s*${DAY}(?![a-z])`, 'gi'), new RegExp(`\\b${DAY}${DAY}(?![a-z])`, 'gi')]) {
    rest = rest.replace(re, (_, a, b) => { expandRange(a, b).forEach((d) => days.add(d)); return ' '; });
  }
  for (const m of rest.matchAll(new RegExp(`\\b${DAY}(?![a-z])`, 'gi'))) days.add(dayIdx(m[1]));
  return { days: days.size ? days : null, excluded };
}

export function weekdayConflict(note, isoDate) {
  if (!note || !isoDate) return null;
  const wd = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  const { days, excluded } = weekdayRule(note);
  if (excluded.has(wd)) return `Note excludes ${DAYS[wd].toUpperCase()}`;
  if (days && !days.has(wd)) return `Note says ${[...days].map((d) => DAYS[d].toUpperCase()).join('/')} only, but this run is a ${DAYS[wd].toUpperCase()}`;
  return null;
}

// ---------- page parsers ----------

function parseKeyReportPage(page, out) {
  const lines = toLines(page.items);
  let route = null;
  let dateText = null;
  for (const l of lines) {
    const r = after(l.items, 'Route Number:');
    if (r) route = r;
    if (l.items.some((i) => i.s === 'Key Report')) dateText = l.items.filter((i) => i.s !== 'Key Report').map((i) => i.s).join(' ');
  }
  if (!route) { out.problems.push(`Page ${page.number}: key report without a route number`); return; }
  const kr = (out.keyReports[route] ||= { route, dateText, pubs: {}, starts: [], stops: [], complaints: [], wraps: [], counts: {} });

  let section = null; // { name, cols: [{name, x}] }
  let current = null;
  let countPub = null;
  const SECTIONS = { Starts: 'starts', Restarts: 'starts', Stops: 'stops', Complaints: 'complaints', Wraps: 'wraps' };

  for (const l of lines) {
    const first = l.items[0].s;
    const text = lineText(l);
    if (l.items.some((i) => i.s === 'Publication:') && l.items.some((i) => i.s === 'DRAW:')) {
      const pub = after(l.items, 'Publication:');
      kr.pubs[pub] = {
        bundles: after(l.items, 'Bundles:'),
        odd: Number(after(l.items, 'ODD:')),
        draw: Number(after(l.items, 'DRAW:')),
      };
      continue;
    }
    if (SECTIONS[first] && l.items.length > 1) {
      section = { name: SECTIONS[first], cols: l.items.map((i, idx) => ({ name: idx === 0 ? 'address' : i.s.toLowerCase(), x: i.x })) };
      current = null;
      continue;
    }
    if (first === 'Total Count') { section = { name: 'counts' }; current = null; continue; }
    if (!section) continue;

    if (section.name === 'counts') {
      const m = /^(Starts\/Restarts|Stops|Wraps|Complaints):$/.exec(first);
      if (!m) continue;
      const pubItem = l.items.find((i) => i.x > 250 && /^[A-Z]{2,6}$/.test(i.s));
      if (pubItem) countPub = pubItem.s;
      const num = l.items.find((i) => /^\d+$/.test(i.s));
      if (countPub && num) (kr.counts[countPub] ||= {})[m[1].toLowerCase().replace('starts/restarts', 'starts')] = Number(num.s);
      continue;
    }

    // A row of a Starts / Stops / Complaints / Wraps table.
    const cell = {};
    for (const it of l.items) {
      let col = section.cols[0];
      for (const c of section.cols) if (it.x >= c.x - 12) col = c;
      cell[col.name] = cell[col.name] ? `${cell[col.name]} ${it.s}` : it.s;
    }
    const onlyAddressOrComment = Object.keys(cell).every((k) => k === 'address' || k === 'comments');
    if (current && onlyAddressOrComment) {
      if (cell.address) current.extra = current.extra ? `${current.extra} ${cell.address}` : cell.address;
      if (cell.comments) current.comments = `${current.comments || ''} ${cell.comments}`.trim();
      continue;
    }
    current = { ...cell };
    if (current.draw != null) current.draw = Number(current.draw);
    kr[section.name].push(current);
    void text;
  }
}

// "MISSED", "0711", "WKLY7" -> "Missed delivery on Sat 7 Nov (NZH, 7-day subscriber)".
// The key report's comment is the date of the problem as DDMM.
const COMPLAINT_TYPES = { MISSED: 'Missed delivery', WET: 'Wet paper', DAMAGED: 'Damaged paper', LATE: 'Late delivery', WRONG: 'Wrong paper', DAMAGE: 'Damaged paper' };
export function complaintText(c, deliveryDate) {
  const type = String(c.type || '').toUpperCase();
  const what = COMPLAINT_TYPES[type] || (type ? `${type[0]}${type.slice(1).toLowerCase()} complaint` : 'Complaint');
  let when = '';
  const raw = String(c.comments || '').trim();
  const m = /^(\d{2})(\d{2})$/.exec(raw);
  if (m) {
    const year = deliveryDate ? Number(String(deliveryDate).slice(0, 4)) : new Date().getFullYear();
    const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1])));
    if (deliveryDate && d > new Date(`${deliveryDate}T00:00:00Z`)) d.setUTCFullYear(year - 1);
    const f = (o) => d.toLocaleDateString('en-NZ', { ...o, timeZone: 'UTC' });
    when = ` on ${f({ weekday: 'short' })} ${d.getUTCDate()} ${f({ month: 'short' })}`;
  } else if (raw) when = ` (${raw})`;
  const svc = /^WKLY(\d)$/i.exec(c.service || '');
  const extra = [c.publication, svc ? `${svc[1]}-day subscriber` : c.service].filter(Boolean).join(', ');
  return `${what}${when}${extra ? ` (${extra})` : ''}`;
}

function parseDeliveryPage(page, out) {
  const lines = toLines(page.items);
  const all = page.items;
  const find = (s) => all.find((i) => i.s === s);
  const routeItem = (() => {
    const r = find('Route:');
    if (!r) return null;
    return all.filter((i) => Math.abs(i.y - r.y) < 4 && i.x > r.x).sort((a, b) => a.x - b.x)[0];
  })();
  if (!routeItem) { out.problems.push(`Page ${page.number}: delivery list without a route`); return; }
  const route = routeItem.s;
  const valueRight = (label) => {
    const l = find(label);
    if (!l) return null;
    return all.filter((i) => Math.abs(i.y - l.y) < 4 && i.x > l.x).sort((a, b) => a.x - b.x).map((i) => i.s).join(' ');
  };
  const title = all.find((i) => i.s.startsWith('Delivery List by Sequence'));
  const r = (out.routes[route] ||= {
    route,
    title: title ? title.s : '',
    weekdayName: title ? title.s.replace(/^Delivery List by Sequence for\s*/, '') : '',
    deliveryDateText: valueRight('Delivery Date:'),
    deliveryDate: parseDate((valueRight('Delivery Date:') || '').split(' ')[0]),
    dataProcessed: valueRight('Data Processed:'),
    reportRequested: valueRight('Report Requested:'),
    lines: [],
    listTotals: { draw: null, byPub: {} },
    unparsed: [],
    _state: { street: null, totals: false },
  });

  // A page can have more than one table: "ADDRESSES NOT ROUTED" (care homes,
  // serviced apartments not yet in the sequence) and the normal "ADDRESS" table.
  // Each heading row sets the column positions for the lines below it.
  const tables = all.filter((i) => (i.s === 'ADDRESS' || i.s === 'ADDRESSES NOT ROUTED') && i.x < 40).map((hd) => {
    const near = (label) => all.find((i) => i.s === label && Math.abs(i.y - hd.y) < 4);
    return { y: hd.y, x: hd.x, unrouted: hd.s !== 'ADDRESS', pub: near('PUB'), qty: near('QTY'), ins: near('DELIVERY INSTRUCTIONS') };
  }).sort((a, b) => b.y - a.y);
  if (!tables.length || tables.some((t) => !t.pub || !t.qty || !t.ins)) { out.problems.push(`Page ${page.number}: column headings not found`); return; }

  const st = r._state;
  for (const l of lines) {
    const t = tables.filter((tb) => l.y < tb.y - 2).pop(); // nearest heading row above this line
    if (!t) continue; // page heading area
    if (tables.some((tb) => Math.abs(l.y - tb.y) < 4)) continue; // a heading row itself
    const text = lineText(l);
    if (/^Page \d+ of \d+$/.test(text)) continue;
    if (readTotalsLine(r, text, l)) continue;

    const bandOf = (x) => (x < t.pub.x - 2 ? 'addr' : x < t.qty.x - 2 ? 'pub' : x < t.ins.x - 10 ? 'qty' : 'note');
    const cells = { addr: [], pub: [], qty: [], note: [] };
    for (const it of l.items) cells[bandOf(it.x)].push(it);
    const addr = cells.addr.map((i) => i.s).join(' ');
    const pub = cells.pub.map((i) => i.s).join(' ');
    const qty = cells.qty.map((i) => i.s).join(' ');
    const note = cells.note.map((i) => i.s).join(' ');
    const last = r.lines[r.lines.length - 1];

    if (addr && pub && /^\d+$/.test(qty)) {
      let street = st.street;
      let number = addr;
      if (t.unrouted) {
        // "145 BRUCE MCLAREN CARE" (+ "CENTRE" on the next line): number and street together.
        const m = /^(\S+(?:\s*\/\s*\S+)?)\s+(.+)$/.exec(addr);
        number = m ? m[1] : addr;
        street = m ? m[2] : '';
      } else if (!street) {
        r.unparsed.push({ page: page.number, text, why: 'delivery before any street heading' });
        continue;
      }
      r.lines.push({
        seq: r.lines.length + 1,
        street,
        number,
        // Odd numbers sit hard left, even numbers are indented: the side of the street.
        column: t.unrouted ? null : cells.addr[0].x - t.x > 30 ? 'indent' : 'left',
        unrouted: t.unrouted,
        pub,
        qty: Number(qty),
        note,
        page: page.number,
      });
      continue;
    }
    if (addr && !pub && !qty && !note && t.unrouted && last?.unrouted && last.page === page.number) {
      last.street = `${last.street} ${addr}`.trim(); // wrapped address
      continue;
    }
    if (addr && !pub && !qty && !note && !t.unrouted && cells.addr[0].x - t.x < 5 && isUpperHeading(addr)) {
      st.street = addr;
      continue;
    }
    if (!addr && !pub && !qty && note && last) {
      last.note = last.note ? `${last.note} ${note}` : note;
      continue;
    }
    r.unparsed.push({ page: page.number, text, why: 'line did not match any known layout' });
  }
}

/** "Total Draw: 132", "TOTAL BY SERVICE:", "NZH 102" at the end of a route. */
function readTotalsLine(r, text, l) {
  const st = r._state;
  if (/^Total Draw:/.test(text)) {
    st.totals = true;
    const n = l.items.find((i) => /^\d+$/.test(i.s));
    r.listTotals.draw = n ? Number(n.s) : null;
    return true;
  }
  if (!st.totals) return false;
  if (text === 'TOTAL BY SERVICE:') return true;
  const m = /^([A-Z]{2,6}) (\d+)$/.exec(text);
  if (m) r.listTotals.byPub[m[1]] = Number(m[2]);
  else r.unparsed.push({ page: '?', text, why: 'unexpected line in totals' });
  return true;
}

/** A page holding only the end-of-route totals that spilled over from the previous page. */
function parseTotalsOnlyPage(page, r) {
  for (const l of toLines(page.items)) {
    const text = lineText(l);
    if (/^Page \d+ of \d+$/.test(text)) continue;
    if (!readTotalsLine(r, text, l)) r.unparsed.push({ page: page.number, text, why: 'unexpected line on totals page' });
  }
}

// ---------- matching and checks ----------

function splitKeyAddress(address, streets) {
  const up = address.toUpperCase().replace(/\s+/g, ' ').trim();
  const match = [...streets].sort((a, b) => b.length - a.length).find((s) => up.endsWith(` ${s}`));
  if (match) return { number: up.slice(0, up.length - match.length).trim(), street: match };
  const m = /^(\S*\d\S*(?:\s*\/\s*\S+)?)\s+(.+)$/.exec(up);
  return m ? { number: m[1], street: m[2] } : { number: '', street: up };
}

function finishRoute(r, kr) {
  delete r._state;
  const checks = [];
  const warnings = [];

  // One tile per address. Every publication for that address becomes a "part"
  // of the tile (NZH 1, WW 1), and the same publication listed more than once
  // is added together (1 + 3 = 4). The tile sits where the address first
  // appears on the sheet and keeps which sheet lines it came from.
  const sheetLines = r.lines.length;
  const byAddress = new Map();
  const kept = [];
  for (const ln of r.lines) {
    ln.addressKey = addressKey(r.route, ln.street, ln.number);
    const src = { seq: ln.seq, page: ln.page, pub: ln.pub, qty: ln.qty };
    let tile = byAddress.get(ln.addressKey);
    if (!tile) {
      tile = { ...ln, parts: [], sources: [], note: '' };
      byAddress.set(ln.addressKey, tile);
      kept.push(tile);
    }
    tile.sources.push(src);
    let part = tile.parts.find((pt) => pt.pub === ln.pub);
    if (!part) { part = { pub: ln.pub, qty: 0, lines: 0 }; tile.parts.push(part); }
    part.qty += ln.qty;
    part.lines += 1;
    if (ln.note && !tile.note.includes(ln.note)) tile.note = tile.note ? `${tile.note} / ${ln.note}` : ln.note;
  }
  for (const t of kept) {
    // NZH first, then the others in the order they appeared.
    t.parts.sort((a, b) => (a.pub === 'NZH' ? -1 : b.pub === 'NZH' ? 1 : 0));
    t.qty = t.parts.reduce((n, pt) => n + pt.qty, 0);
    t.pub = t.parts.map((pt) => pt.pub).join('+');
  }
  r.lines = kept;
  r.lines.forEach((ln, i) => { ln.seq = i + 1; });

  // Street blocks: consecutive lines on the same street, in sheet order.
  let block = 0;
  let prev = null;
  for (const ln of r.lines) {
    if (ln.street !== prev) { block += 1; prev = ln.street; }
    ln.block = block;
  }

  // Keys: same letterbox => same address key, every day.
  for (const ln of r.lines) {
    ln.lineKey = ln.addressKey;
    ln.flags = ln.unrouted ? [{ type: 'unrouted', text: 'Not routed: listed separately on the sheet, not in the delivery sequence' }] : [];
    for (const pt of ln.parts) {
      if (pt.lines < 2) continue;
      const adds = ln.sources.filter((x) => x.pub === pt.pub).map((x) => x.qty).join(' + ');
      ln.flags.push({ type: 'combined', text: `${pt.pub} listed ${pt.lines} times on the sheet (${adds}), combined` });
      warnings.push(`${ln.number} ${ln.street}: ${pt.pub} listed ${pt.lines} times, combined into one tile, ${adds} = ${pt.qty} copies.`);
    }
    const wd = weekdayConflict(ln.note, r.deliveryDate);
    if (wd) {
      ln.flags.push({ type: 'weekday', text: wd });
      warnings.push(`${ln.number} ${ln.street} (${ln.pub}): ${wd}. Kept on the run, check before delivering.`);
    }
  }

  // Totals.
  const byPub = {};
  for (const ln of r.lines) for (const pt of ln.parts) byPub[pt.pub] = (byPub[pt.pub] || 0) + pt.qty;
  const copies = r.lines.reduce((s, l) => s + l.qty, 0);
  r.summary = { lines: r.lines.length, sheetLines, multiPub: r.lines.filter((l) => l.parts.length > 1).length, copies, byPub, streets: new Set(r.lines.map((l) => l.street)).size };

  const pubs = new Set([...Object.keys(byPub), ...Object.keys(r.listTotals.byPub), ...Object.keys(kr?.pubs || {})]);
  for (const p of [...pubs].sort()) {
    const got = byPub[p] || 0;
    const listed = r.listTotals.byPub[p];
    const draw = kr?.pubs?.[p]?.draw;
    if (listed != null) checks.push({ label: `${p}: delivery list total`, expected: listed, got, ok: listed === got });
    if (draw != null) checks.push({ label: `${p}: key report draw`, expected: draw, got, ok: draw === got });
    if (listed == null && draw == null) checks.push({ label: `${p}: not in any report total`, expected: null, got, ok: false });
  }
  if (r.listTotals.draw != null) checks.push({ label: 'Total draw', expected: r.listTotals.draw, got: copies, ok: r.listTotals.draw === copies });
  else checks.push({ label: 'Total draw line found', expected: 'present', got: 'missing', ok: false });
  if (!kr) warnings.push('No key report pages for this route, so starts, stops and complaints could not be checked.');

  // Starts, stops and complaints from the key report, matched to tiles.
  const streets = new Set(r.lines.map((l) => l.street));
  const findLines = (address, pub) => {
    const { number, street } = splitKeyAddress(address, streets);
    const key = addressKey(r.route, street, number);
    return r.lines.filter((l) => l.addressKey === key && (!pub || l.parts.some((pt) => pt.pub === pub)));
  };
  if (kr) {
    for (const s of kr.starts) {
      const hits = findLines(s.address, s.publication);
      if (hits.length) hits.forEach((h) => h.flags.push({ type: 'start', text: `New start: ${s.publication} (${s.service || 'service'})` }));
      else warnings.push(`Start ${s.address} ${s.publication} is not on the delivery list.`);
    }
    for (const s of kr.stops) {
      const hits = findLines(s.address, s.publication);
      if (hits.length) {
        hits.forEach((h) => h.flags.push({ type: 'stop', text: `Key report lists ${s.publication} here as a STOP` }));
        warnings.push(`Stop ${s.address} ${s.publication} is still on the delivery list. Kept, check before delivering.`);
      }
    }
    for (const c of kr.complaints) {
      const hits = findLines(c.address, c.publication);
      const text = complaintText(c, r.deliveryDate);
      if (hits.length) hits.forEach((h) => h.flags.push({ type: 'complaint', text }));
      else warnings.push(`Complaint for ${c.address} ${c.publication} (${c.type || ''}) has no tile on this run.`);
    }
    for (const [p, c] of Object.entries(kr.counts)) {
      if (c.starts != null) {
        const listed = kr.starts.filter((s) => s.publication === p).length;
        if (listed !== c.starts) warnings.push(`${p}: key report counts ${c.starts} start(s) but lists ${listed}.`);
      }
    }
  }
  for (const u of r.unparsed) warnings.push(`Page ${u.page}: could not read "${u.text}" (${u.why || 'unknown'}).`);

  r.keyReport = kr || null;
  r.checks = checks;
  r.warnings = warnings;
  r.ok = checks.every((c) => c.ok) && r.unparsed.length === 0;
  return r;
}

/** Parse all pages of one or more reports. Returns one entry per route. */
export function parseReport(pages) {
  const out = { routes: {}, keyReports: {}, problems: [] };
  let lastRoute = null;
  for (const page of pages) {
    const has = (s) => page.items.some((i) => i.s.startsWith(s));
    if (has('Delivery List by Sequence')) {
      parseDeliveryPage(page, out);
      lastRoute = Object.values(out.routes).find((r) => r.lines.some((l) => l.page === page.number)) || lastRoute;
      const ri = page.items.find((i) => i.s === 'Route:');
      if (ri) lastRoute = out.routes[page.items.filter((i) => Math.abs(i.y - ri.y) < 4 && i.x > ri.x).sort((a, b) => a.x - b.x)[0]?.s] || lastRoute;
    } else if (has('Key Report')) parseKeyReportPage(page, out);
    else if (lastRoute && (has('Total Draw:') || has('TOTAL BY SERVICE:'))) parseTotalsOnlyPage(page, lastRoute);
    else out.problems.push(`Page ${page.number}: not a key report or delivery list, skipped`);
  }
  const routes = Object.values(out.routes).map((r) => finishRoute(r, out.keyReports[r.route]));
  for (const k of Object.keys(out.keyReports)) {
    if (!out.routes[k]) out.problems.push(`Key report for ${k} has no delivery list pages.`);
  }
  return { routes, problems: out.problems };
}
