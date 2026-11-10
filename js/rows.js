// Turn a parsed route (parser.js) into database rows. Shared by the app
// (store.js) and the evening fetcher (fetcher/fetch-run-sheets.mjs).

export function runRow(r, filename) {
  return {
    route: r.route, delivery_date: r.deliveryDate, weekday_name: r.weekdayName, data_processed: r.dataProcessed,
    report_requested: r.reportRequested, source_filename: filename, summary: r.summary, checks: r.checks,
    warnings: r.warnings, key_report: r.keyReport,
    ...(r.sourceHash ? { source_hash: r.sourceHash } : {}),
  };
}

/** SHA-256 of the PDF's bytes, as hex: the sheet's fingerprint (runs.source_hash). */
export async function sha256Hex(bytes) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function lineRows(runId, r) {
  return r.lines.map((l) => ({
    run_id: runId, line_key: l.lineKey, seq: l.seq, block: l.block, street: l.street, number: l.number,
    side: l.column, pub: l.pub, qty: l.qty, note: l.note || null, flags: l.flags, address_key: l.addressKey,
    sources: l.sources || [], parts: l.parts || [],
  }));
}

// What changed between the sheet already loaded and the new one for the same
// route and day: addresses added or removed, papers or quantities changed,
// delivery notes changed. Returns short lines a driver can read, e.g.
//   "Added 12 Smith Road (NZH ×1)", "45 Uxbridge Road: NZH 1 → 2".
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => `Mc${c.toUpperCase()}`);
const label = (l) => `${l.number} ${titleCase(l.street)}`;
const papers = (l) => (l.parts?.length ? l.parts : [{ pub: l.pub, qty: l.qty }])
  .map((p) => `${p.pub} ×${p.qty}`).sort().join(', ');

export function diffLines(oldLines, newLines) {
  const before = new Map(oldLines.map((l) => [l.address_key || l.line_key, l]));
  const after = new Map(newLines.map((l) => [l.address_key || l.line_key, l]));
  const out = [];
  for (const [k, l] of after) {
    const o = before.get(k);
    if (!o) { out.push(`Added ${label(l)} (${papers(l)})`); continue; }
    if (papers(o) !== papers(l)) out.push(`${label(l)}: ${papers(o)} → ${papers(l)}`);
    if ((o.note || '') !== (l.note || '')) out.push(`${label(l)}: note ${l.note ? `now "${l.note}"` : 'removed'}`);
  }
  for (const [k, o] of before) if (!after.has(k)) out.push(`Removed ${label(o)} (${papers(o)})`);
  return out;
}

/** The record kept on the run row: when the sheet was last replaced and what changed. */
export function changeRecord(oldLines, newLines) {
  const items = diffLines(oldLines, newLines);
  return { at: new Date().toISOString(), count: items.length, items: items.slice(0, 50) };
}

/**
 * Depot pick for all of a day's runs together (Mike, 10 Nov 2026): take the day's total for each
 * paper and work out whole bundles and loose copies from that day's bundle size. The size is not
 * fixed: it comes from that day's key reports ("Bundles: 1 with 80"), so it can change every day.
 * `items` are the per-run pick lines ({ pub, size, bundles, loose, draw, retailQty }).
 * - one bundle size on the day's sheets: bundles = whole multiples of it, the rest loose;
 * - no size on any sheet (no run had a full bundle): everything is loose, `sizeUnknown`;
 * - sheets disagree on the size: can't re-bundle, so add up run by run and say so (`mixed`).
 */
export function rebundle(items) {
  const t = {};
  for (const x of items) {
    const o = (t[x.pub] ||= { pub: x.pub, draw: 0, retailQty: 0, sizes: new Set(), sumBundles: 0, sumLoose: 0 });
    o.draw += x.draw || 0; o.retailQty += x.retailQty || 0; o.sumBundles += x.bundles || 0; o.sumLoose += x.loose || 0;
    if (x.size > 0) o.sizes.add(x.size);
  }
  return Object.values(t).map(({ sizes, sumBundles, sumLoose, ...o }) => {
    const list = [...sizes].sort((a, b) => a - b);
    if (list.length === 1) { const size = list[0]; const bundles = Math.floor(o.draw / size); return { ...o, size, bundles, loose: o.draw - bundles * size, total: true }; }
    if (!list.length) return { ...o, size: null, bundles: 0, loose: o.draw, total: true, sizeUnknown: true };
    return { ...o, size: null, bundles: sumBundles, loose: sumLoose, total: true, mixed: list };
  }).sort((a, b) => (a.pub === 'NZH' ? -1 : b.pub === 'NZH' ? 1 : a.pub.localeCompare(b.pub)));
}

/** A run is complete (moves to History) when it is closed in Dispatch or every stop has been dealt with. */
export const runComplete = (r) => !!r.closed_at || (r.summary?.lines > 0 && (r.done || 0) >= r.summary.lines);
