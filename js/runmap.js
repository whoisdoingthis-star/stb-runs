// A run on the map (decision 0026): stops in delivery order with a state, and the trail between them.
// Pure, so it can be tested: Dispatch draws what this returns.

/**
 * lines: [{ line_key, address_key, number, street, seq }]   the run's sheet lines
 * status: [{ line_key, done, outcome, user_name, device_time }]   latest tick per line
 * dests: { address_key: { lat, lng } }   where each address is
 * order: [address_key] | null   the saved order for the route (else sheet order)
 * Returns { stops: [{ key, label, lat, lng, state: 'todo'|'done'|'failed', by, at }], trail: [{ from, to, travelled }], missing: [label], counts }
 */
export function runMapData({ lines = [], status = [], dests = {}, order = null }) {
  const st = Object.fromEntries(status.map((s) => [s.line_key, s]));
  const by = new Map();
  for (const l of lines) {
    if (!by.has(l.address_key)) by.set(l.address_key, { key: l.address_key, label: `${String(l.number).replace(/\s+/g, '')} ${title(l.street)}`, seq: l.seq ?? 0, lines: [] });
    const g = by.get(l.address_key); g.lines.push(l); g.seq = Math.min(g.seq, l.seq ?? 0);
  }
  const rank = order ? Object.fromEntries(order.map((k, i) => [k, i])) : null;
  const all = [...by.values()].sort((a, b) => (rank ? (rank[a.key] ?? 1e6 + a.seq) - (rank[b.key] ?? 1e6 + b.seq) : a.seq - b.seq));
  const stops = []; const missing = [];
  for (const g of all) {
    const ticks = g.lines.map((l) => st[l.line_key]).filter((s) => s?.done);
    const failed = ticks.some((s) => s.outcome === 'futile');
    const done = ticks.length === g.lines.length;
    const last = ticks.sort((a, b) => String(b.device_time).localeCompare(String(a.device_time)))[0];
    const d = dests[g.key];
    const stop = { key: g.key, label: g.label, state: failed ? 'failed' : done ? 'done' : 'todo', by: last?.user_name || null, at: last?.device_time || null };
    if (d?.lat != null && d?.lng != null) stops.push({ ...stop, lat: d.lat, lng: d.lng }); else missing.push(g.label);
  }
  // The trail joins the stops in order; a piece counts as travelled once the stop it leads to has been dealt with.
  const trail = stops.slice(1).map((s, i) => ({ from: [stops[i].lat, stops[i].lng], to: [s.lat, s.lng], travelled: s.state !== 'todo' }));
  const counts = { total: all.length, done: stops.filter((s) => s.state === 'done').length, failed: stops.filter((s) => s.state === 'failed').length, todo: stops.filter((s) => s.state === 'todo').length, missing: missing.length };
  return { stops, trail, missing, counts };
}
const title = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** What to say when a ping comes back (or doesn't). `last` = that person's latest tick on the run, if any. */
export function pingText(name, ping, last, fmt = (t) => new Date(t).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })) {
  const lastBit = last ? ` Last tick: ${fmt(last.at)}, ${last.label}.` : '';
  if (ping?.state === 'answered') return `${name} is here (as of ${fmt(ping.answered_at)}${ping.accuracy_m ? `, to about ${Math.round(ping.accuracy_m)} m` : ''}).`;
  if (ping?.state === 'off_duty') return `${name} is off duty, so their phone didn’t share where it is.${lastBit}`;
  if (ping?.state === 'no_gps') return `${name}’s phone got the ping but couldn’t find its position.${lastBit}`;
  return `No answer: STB isn’t open on ${name}’s phone.${lastBit}`;
}
