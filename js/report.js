// The delivery report (decision 0027): complaints and how each was resolved, with the delivery
// evidence (who, when, GPS, photos), plus every photographed delivery even with no complaint.
// Pure: Dispatch loads the rows, this decides what goes in the report, Dispatch draws and prints it.

const NZ = 'Pacific/Auckland';
export const nzDate = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: NZ }).format(new Date(t));
export const STATUS_TEXT = { open: 'Under review', disputed: 'Disputed: our record shows it was delivered', accepted: 'Accepted: our miss', closed: 'Closed' };
const addr = (number, street) => `${String(number || '').replace(/\s+/g, '')} ${String(street || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())}`.trim();
const addrFromKey = (key) => { const [, street, number] = String(key || '').split('|'); return addr(number, street); };

export const KIND_TEXT = { MISSED: 'Missed delivery', WET: 'Wet paper', DAMAGED: 'Damaged paper', WRONG: 'Wrong paper', LATE: 'Late delivery', NSTNA: 'New start not actioned', NSNA: 'New start not actioned' };
const dayBefore = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);

/**
 * The publisher's reference often starts with the day and month ("1211 NSNA" = 12 Nov, "711NZME" = 7 Nov).
 * When the sheet gives no date, read it from there: only a real date in the 3 weeks up to the sheet day counts.
 */
export function refDate(description, reported_on) {
  if (!reported_on) return null;
  for (const m of String(description || '').matchAll(/(?:^|[\s(])(\d{1,2})(0[1-9]|1[0-2])(?=[\s)A-Za-z]|$)/g)) {
    const dd = m[1].padStart(2, '0'); if (dd < '01' || dd > '31') continue;
    for (const y of [reported_on.slice(0, 4), String(reported_on.slice(0, 4) - 1)]) {
      const d = `${y}-${m[2]}-${dd}`;
      if (!Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).getUTCDate() === Number(dd) && d <= reported_on && d >= dayBefore(reported_on, 21)) return d;
    }
  }
  return null;
}

/** What our record for a day amounts to, in a word and a sentence. */
export function recordState(d) {
  if (!d) return { state: 'none', label: 'No app record', good: false };
  if (d.outcome === 'futile') return { state: 'futile', label: 'Could not deliver', good: false };
  if (d.outcome === 'undone') return { state: 'none', label: 'No app record', good: false };
  if (d.method === 'paper') return { state: 'paper', label: 'Delivered · paper run sheet', good: true };
  const what = d.outcome === 'short' ? 'Delivered short' : 'Delivered';
  if (d.method === 'photo') return { state: 'photo', label: 'Delivered · time from the delivery photo', good: true };
  return d.lat != null ? { state: 'app', label: `${what} · time and GPS recorded`, good: true } : { state: 'app_nogps', label: `${what} · time recorded`, good: true };
}

/**
 * from, to: 'YYYY-MM-DD' (inclusive, NZ dates)
 * complaints: complaint_register rows · photos: photos rows (+ url) · ticks: tap_events rows (latest wins per address and day)
 * Returns { from, to, summary, complaints: [...], photographed: [{ address, route, days: [...] }] }
 * Each complaint: what the publisher reported (kept apart from) our delivery record for that day, then the deliveries since.
 */
export function buildReport({ from, to, complaints = [], photos = [], ticks = [] }) {
  const inRange = (d) => !!d && d >= from && d <= to;
  // The latest tick per address per NZ day is the delivery record for that day.
  const tickBy = new Map(); const daysBy = new Map();
  const note = (key, day) => { if (!daysBy.has(key)) daysBy.set(key, new Set()); daysBy.get(key).add(day); };
  for (const t of [...ticks].sort((a, b) => String(a.device_time).localeCompare(String(b.device_time)))) { const d = nzDate(t.device_time); tickBy.set(`${t.address_key}|${d}`, t); note(t.address_key, d); }
  const photosBy = new Map();
  for (const p of photos) { const d = nzDate(p.taken_at); const k = `${p.address_key}|${d}`; if (!photosBy.has(k)) photosBy.set(k, []); photosBy.get(k).push(p); note(p.address_key, d); }
  const evidence = (address_key, day) => {
    const t = tickBy.get(`${address_key}|${day}`);
    if (!t) return null;
    const outcome = t.outcome || (t.done ? 'delivered' : 'undone');
    return { by: t.user_name || null, at: t.device_time, outcome, reason: t.reason || null, method: t.method === 'paper' ? 'paper' : t.method === 'photo' ? 'photo' : 'app',
      lat: t.lat ?? null, lng: t.lng ?? null, accuracy_m: t.accuracy_m ?? null };
  };
  const used = new Set();
  const dayOf = (c) => c.happened_on || refDate(c.description, c.reported_on);
  const cs = complaints.filter((c) => inRange(dayOf(c)) || inRange(c.reported_on))
    .sort((a, b) => String(b.reported_on).localeCompare(String(a.reported_on)) || addr(a.number, a.street).localeCompare(addr(b.number, b.street)))
    .map((c, i) => {
      const day = dayOf(c); const k = `${c.address_key}|${day}`; if (day) used.add(k);
      // Deliveries on record at this address after the complained-about day (all of them in the dates when no day is known).
      const since = [...(daysBy.get(c.address_key) || [])].filter((d) => inRange(d) && (!day || d > day)).sort()
        .map((d) => { used.add(`${c.address_key}|${d}`); return { day: d, delivery: evidence(c.address_key, d), photos: photosBy.get(`${c.address_key}|${d}`) || [] }; });
      const delivery = day ? evidence(c.address_key, day) : null;
      return { no: i + 1, address: addr(c.number, c.street), route: c.route || '', kind: c.kind || 'Complaint', kindText: KIND_TEXT[c.kind] || c.kind || 'Complaint', publication: c.publication || '',
        about: c.happened_on || null, day, dayFrom: c.happened_on ? 'publisher' : day ? 'reference' : null, reported: c.reported_on,
        description: c.description || '', status: c.status || 'open', statusText: STATUS_TEXT[c.status] || c.status, notes: c.notes || '',
        repeat: c.customer_complaints > 1 ? `Complaint ${c.customer_complaint_no} of ${c.customer_complaints} from this address` : '',
        delivery, record: day ? recordState(delivery) : { state: 'undated', label: 'No date given', good: false }, photos: day ? photosBy.get(k) || [] : [], since };
    });
  const groups = new Map();
  for (const [k, ps] of photosBy) {
    const key = k.slice(0, k.lastIndexOf('|')); const day = k.split('|').pop();
    if (used.has(k) || !inRange(day)) continue;
    if (!groups.has(key)) groups.set(key, { address: addrFromKey(key), route: ps[0].route || '', days: [] });
    groups.get(key).days.push({ day, delivery: evidence(key, day), photos: ps });
  }
  const photographed = [...groups.values()].map((g) => ({ ...g, days: g.days.sort((a, b) => b.day.localeCompare(a.day)) })).sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }));
  const count = (s) => cs.filter((c) => c.status === s).length; const rec = (s) => cs.filter((c) => c.record.state === s).length;
  return { from, to, complaints: cs, photographed,
    summary: { complaints: cs.length, open: count('open'), disputed: count('disputed'), accepted: count('accepted'), closed: count('closed'),
      withProof: cs.filter((c) => c.record.good).length, timed: rec('app') + rec('app_nogps') + rec('photo'), paper: rec('paper'), noRecord: rec('none') + rec('futile') + rec('undated'),
      withPhoto: cs.filter((c) => c.photos.length).length, followedUp: cs.filter((c) => c.since.some((x) => x.photos.length)).length,
      photographed: photographed.reduce((n, g) => n + g.days.length, 0), photos: photos.filter((p) => inRange(nzDate(p.taken_at))).length } };
}

/** "Zalense-Delivery-Report_HOWICK_2026-11-08_to_2026-11-14" (the name the saved PDF gets) */
export const reportFileName = (from, to) => `Zalense-Delivery-Report_HOWICK_${from}${to !== from ? `_to_${to}` : ''}`;
/** A short reference to quote: "ZDR-261108-261114-0701" */
export const reportRef = (from, to, made = Date.now()) => `ZDR-${from.slice(2).replace(/-/g, '')}-${to.slice(2).replace(/-/g, '')}-${new Intl.DateTimeFormat('en-GB', { timeZone: NZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(made)).replace(':', '')}`;

/** "Delivered by Lisa at 5:19 am (in the app) · GPS -36.90147, 174.93534, to about 4 m" */
export function evidenceText(d, fmtTime = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit', second: '2-digit' })) {
  if (!d) return 'No delivery record for that day in the app.';
  const what = d.outcome === 'delivered' ? 'Delivered' : d.outcome === 'futile' ? `Not delivered${d.reason ? ` (${d.reason})` : ''}` : d.outcome === 'short' ? 'Delivered short' : 'Tick undone';
  const how = d.method === 'paper' ? 'recorded from the paper run sheet, so no GPS' : d.method === 'photo' ? 'time from the delivery photo, added afterwards' : 'ticked in the app';
  const gps = d.method !== 'paper' && d.lat != null ? ` · GPS ${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}${d.accuracy_m ? `, to about ${Math.round(d.accuracy_m)} m` : ''}` : d.method !== 'paper' ? ' · no GPS fix' : '';
  return `${what}${d.by ? ` by ${d.by}` : ''}${d.method === 'paper' ? '' : ` at ${fmtTime(d.at)}`} (${how})${gps}`;
}
