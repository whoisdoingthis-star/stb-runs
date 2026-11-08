// Turn a parsed route (parser.js) into database rows. Shared by the app
// (store.js) and the evening fetcher (fetcher/fetch-run-sheets.mjs).

export function runRow(r, filename) {
  return {
    route: r.route, delivery_date: r.deliveryDate, weekday_name: r.weekdayName, data_processed: r.dataProcessed,
    report_requested: r.reportRequested, source_filename: filename, summary: r.summary, checks: r.checks,
    warnings: r.warnings, key_report: r.keyReport,
  };
}

export function lineRows(runId, r) {
  return r.lines.map((l) => ({
    run_id: runId, line_key: l.lineKey, seq: l.seq, block: l.block, street: l.street, number: l.number,
    side: l.column, pub: l.pub, qty: l.qty, note: l.note || null, flags: l.flags, address_key: l.addressKey,
    sources: l.sources || [], parts: l.parts || [],
  }));
}
