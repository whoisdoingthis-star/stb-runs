// Spare papers (decision 0042): how many were on board at the start, how many were left, and who any went to.
// Pure: the app, the notice board's morning card and the tests all use these.

export const PAPERS = { NZH: 'Herald', SST: 'Sunday Star-Times' };   // the papers we count spares of; magazines come in exact numbers

/** Papers on today's sheets, retail copies counted with their paper: { NZH: 311, SST: 0 }. */
export function papersNeeded(runs) {
  const out = {};
  for (const r of runs || []) for (const [pub, n] of Object.entries(r.summary?.byPub || {})) {
    const base = PAPERS[pub] ? pub : (pub.endsWith('R') && PAPERS[pub.slice(0, -1)] ? pub.slice(0, -1) : null);
    if (base) out[base] = (out[base] || 0) + (Number(n) || 0);
  }
  return out;
}
/** Which papers to ask about today: the Herald always, the others when they are on the sheets. */
export function papersToday(runs) {
  const need = papersNeeded(runs);
  return ['NZH', ...Object.keys(PAPERS).filter((p) => p !== 'NZH' && need[p] > 0)];
}
/** A tidy row to save. counts: { NZH: 3 } · given: [{ to: 'A friend', n: 1 }]. */
export function spareRow({ date, moment, counts, damaged = {}, given = [], odometer = null, now = Date.now() }) {
  const tidy = (o) => { const c = {}; for (const [k, v] of Object.entries(o || {})) if (PAPERS[k]) c[k] = Math.max(0, Math.min(999, Math.round(Number(v) || 0))); return c; };
  // counts = spares good enough to deliver; damaged = extras put aside for damage or poor quality, never counted as spares (Mike, 22 Nov 2026)
  const c = tidy(counts); const d = Object.fromEntries(Object.entries(tidy(damaged)).filter(([, v]) => v > 0));
  const g = (given || []).map((x) => ({ to: String(x.to || '').trim().slice(0, 30), n: Math.max(0, Math.min(99, Math.round(Number(x.n) || 0))) })).filter((x) => x.to && x.n > 0);
  const odo = Math.round(Number(String(odometer ?? '').replace(/[^0-9.]/g, '')));
  return { delivery_date: date, moment: moment === 'start' ? 'start' : 'end', counts: c, damaged: d, given: moment === 'start' ? [] : g, odometer_km: odometer != null && odometer !== '' && odo > 0 && odo < 2000000 ? odo : null, device_time: new Date(now).toISOString() };
}
/**
 * One day's spares across every driver: each driver's latest start and latest end count, added up.
 * Returns null if nobody answered, else { start: { NZH } | null, end: { NZH } | null, given: [{ to, n }], by: [names] }.
 */
export function spareDay(rows, date) {
  const mine = (rows || []).filter((r) => r.delivery_date === date).sort((a, b) => Date.parse(a.device_time) - Date.parse(b.device_time));
  if (!mine.length) return null;
  const latest = new Map(); for (const r of mine) latest.set(`${r.user_name}|${r.moment}`, r);
  const sum = (moment) => { const rs = [...latest.values()].filter((r) => r.moment === moment); if (!rs.length) return null; const o = {}; for (const r of rs) for (const [k, v] of Object.entries(r.counts || {})) o[k] = (o[k] || 0) + v; return o; };
  const sumD = (moment) => { const o = {}; for (const r of latest.values()) if (r.moment === moment) for (const [k, v] of Object.entries(r.damaged || {})) o[k] = (o[k] || 0) + v; return o; };
  const given = new Map(); for (const r of latest.values()) if (r.moment === 'end') for (const g of r.given || []) given.set(g.to, (given.get(g.to) || 0) + g.n);
  return { start: sum('start'), end: sum('end'), damaged: { start: sumD('start'), end: sumD('end') }, given: [...given.entries()].map(([to, n]) => ({ to, n })), by: [...new Set(mine.map((r) => r.user_name))] };
}
/** The day's spares in a sentence, or null. */
export function spareText(day) {
  if (!day) return null;
  const pubs = [...new Set([...Object.keys(day.start || {}), ...Object.keys(day.end || {})])].sort((a, b) => (a === 'NZH' ? -1 : b === 'NZH' ? 1 : a.localeCompare(b)));
  const parts = pubs.map((p) => `${PAPERS[p] || p}: ${[day.start?.[p] != null ? `${day.start[p]} at the start` : null, day.end?.[p] != null ? `${day.end[p]} left` : null].filter(Boolean).join(', ')}`);
  const gave = day.given.length ? `${day.given.map((g) => `${g.n} to ${g.to}`).join(', ')}` : null;
  // damaged or poor papers are their own line: the most seen at either count, since the same ones are usually still aboard at the end
  const dm = Object.keys(PAPERS).map((p) => [p, Math.max(day.damaged?.start?.[p] || 0, day.damaged?.end?.[p] || 0)]).filter(([, n]) => n > 0).map(([p, n]) => `${n} ${PAPERS[p]} damaged or poor, set aside`);
  return [...parts, gave, ...dm].filter(Boolean).join(' · ') || null;
}
/** The morning in lines for the notice board: each run's finish against the deadline. runs need route, done/total (or complete), finishedAt (ms | null). */
export function morningLines(runs, deadlineAt, clock) {
  return (runs || []).map((r) => {
    const name = `Run ${Number(/(\d+)$/.exec(r.route || '')?.[1] || 0) || r.route}`;
    if (r.finishedAt == null) return { name, text: 'not finished yet', late: false, done: false };
    const late = deadlineAt ? Math.round((r.finishedAt - deadlineAt) / 60e3) : 0;
    return { name, text: `done ${clock(r.finishedAt)}${late > 0 ? ` (${late} min after the deadline)` : ''}`, late: late > 0, done: true };
  });
}

/** One driver's odometer readings for a day: their latest at the start and at the end. */
export function odometerDay(rows, date, driver) {
  const mine = (rows || []).filter((r) => r.delivery_date === date && r.user_name === driver && r.odometer_km != null).sort((a, b) => Date.parse(a.device_time) - Date.parse(b.device_time));
  const last = (moment) => mine.filter((r) => r.moment === moment).pop()?.odometer_km ?? null;
  return { start: last('start'), end: last('end') };
}
