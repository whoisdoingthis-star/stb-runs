// The delivery report (decision 0027): complaints and how each was resolved, with the delivery
// evidence (who, when, GPS, photos), plus every photographed delivery even with no complaint.
// Pure: Dispatch loads the rows, this decides what goes in the report, Dispatch draws and prints it.

const NZ = 'Pacific/Auckland';
export const nzDate = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: NZ }).format(new Date(t));
export const STATUS_TEXT = { open: 'Open: being looked into', disputed: 'Disputed: our records show it was delivered', accepted: 'Accepted: our miss', closed: 'Closed' };
const addr = (number, street) => `${String(number || '').replace(/\s+/g, '')} ${String(street || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())}`.trim();
const addrFromKey = (key) => { const [, street, number] = String(key || '').split('|'); return addr(number, street); };

/**
 * from, to: 'YYYY-MM-DD' (inclusive, NZ dates)
 * complaints: complaint_register rows · photos: photos rows (+ url) · ticks: tap_events rows (latest wins per address and day)
 * Returns { from, to, summary, complaints: [...], photographed: [...] }
 */
export function buildReport({ from, to, complaints = [], photos = [], ticks = [] }) {
  const inRange = (d) => !!d && d >= from && d <= to;
  // The latest tick per address per NZ day is the delivery record for that day.
  const tickBy = new Map();
  for (const t of [...ticks].sort((a, b) => String(a.device_time).localeCompare(String(b.device_time)))) tickBy.set(`${t.address_key}|${nzDate(t.device_time)}`, t);
  const photosBy = new Map();
  for (const p of photos) { const k = `${p.address_key}|${nzDate(p.taken_at)}`; if (!photosBy.has(k)) photosBy.set(k, []); photosBy.get(k).push(p); }
  const evidence = (address_key, day) => {
    const t = tickBy.get(`${address_key}|${day}`);
    if (!t) return null;
    const outcome = t.outcome || (t.done ? 'delivered' : 'undone');
    return { by: t.user_name || null, at: t.device_time, outcome, reason: t.reason || null, method: t.method === 'paper' ? 'paper' : 'app',
      lat: t.lat ?? null, lng: t.lng ?? null, accuracy_m: t.accuracy_m ?? null };
  };
  const used = new Set();
  const cs = complaints.filter((c) => inRange(c.happened_on || c.reported_on) || inRange(c.reported_on))
    .sort((a, b) => String(b.happened_on || b.reported_on).localeCompare(String(a.happened_on || a.reported_on)) || addr(a.number, a.street).localeCompare(addr(b.number, b.street)))
    .map((c) => {
      const day = c.happened_on || c.reported_on; const k = `${c.address_key}|${day}`; used.add(k);
      return { address: addr(c.number, c.street), route: c.route || '', kind: c.kind || 'Complaint', publication: c.publication || '', about: c.happened_on || null, reported: c.reported_on,
        description: c.description || '', status: c.status || 'open', statusText: STATUS_TEXT[c.status] || c.status, notes: c.notes || '',
        repeat: c.customer_complaints > 1 ? `Complaint ${c.customer_complaint_no} of ${c.customer_complaints} from this address` : '',
        delivery: evidence(c.address_key, day), photos: photosBy.get(k) || [] };
    });
  const photographed = [...photosBy.entries()].filter(([k]) => !used.has(k) && inRange(k.split('|').pop()))
    .map(([k, ps]) => { const key = k.slice(0, k.lastIndexOf('|')); const day = k.split('|').pop(); return { address: addrFromKey(key), route: ps[0].route || '', day, delivery: evidence(key, day), photos: ps }; })
    .sort((a, b) => b.day.localeCompare(a.day) || a.address.localeCompare(b.address));
  const count = (s) => cs.filter((c) => c.status === s).length;
  return { from, to, complaints: cs, photographed,
    summary: { complaints: cs.length, open: count('open'), disputed: count('disputed'), accepted: count('accepted'), closed: count('closed'),
      withProof: cs.filter((c) => c.delivery?.outcome === 'delivered').length, withPhoto: cs.filter((c) => c.photos.length).length,
      photographed: photographed.length, photos: photos.filter((p) => inRange(nzDate(p.taken_at))).length } };
}

/** "Delivered by Lisa at 5:19 am (in the app) · GPS -36.90147, 174.93534, to about 4 m" */
export function evidenceText(d, fmtTime = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit', second: '2-digit' })) {
  if (!d) return 'No delivery record for that day in the app.';
  const what = d.outcome === 'delivered' ? 'Delivered' : d.outcome === 'futile' ? `Not delivered${d.reason ? ` (${d.reason})` : ''}` : d.outcome === 'short' ? 'Delivered short' : 'Tick undone';
  const how = d.method === 'paper' ? 'recorded from the paper run sheet, so no GPS' : 'ticked in the app';
  const gps = d.method !== 'paper' && d.lat != null ? ` · GPS ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}${d.accuracy_m ? `, to about ${Math.round(d.accuracy_m)} m` : ''}` : d.method !== 'paper' ? ' · no GPS fix' : '';
  return `${what}${d.by ? ` by ${d.by}` : ''}${d.method === 'paper' ? '' : ` at ${fmtTime(d.at)}`} (${how})${gps}`;
}
