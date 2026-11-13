// Morning watch (decision 0028): is each run going to make its deadline?
// Deadlines (Mike, 13 Nov 2026): finished by 6:00 am Monday to Friday, 7:00 am on weekends and public holidays.
// Pure, so it can be tested and later reused by a server job that sends alerts.

import { estimateFinish } from './shifts.js';

const NZ = 'Pacific/Auckland';
// Public holidays as kept in New Zealand (Auckland), actual and Monday-ised days. Editable in Dispatch.
export const DEFAULT_DEADLINES = { weekday: '06:00', weekend: '07:00', holidays: [
  '2026-12-25', '2026-12-26', '2026-12-28',
  '2027-01-01', '2027-01-02', '2027-01-04', '2027-02-01', '2027-02-06', '2027-02-08', '2027-03-26', '2027-03-29', '2027-04-25', '2027-04-26',
  '2027-06-07', '2027-06-25', '2027-10-25', '2027-12-25', '2027-12-26', '2027-12-27', '2027-12-28'] };

/** The moment (ms) of HH:MM New Zealand time on a YYYY-MM-DD date, daylight saving included. */
export function nzTime(date, hhmm) {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const shown = (t) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: NZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`); };
  let t = guess - (shown(guess) - guess);
  t -= shown(t) - guess; // settle across a daylight-saving change
  return t;
}
/** { at (ms), kind: 'weekday'|'weekend'|'holiday', label: '6:00 am' } for a delivery date. */
export function deadlineFor(date, settings = DEFAULT_DEADLINES) {
  const s = { ...DEFAULT_DEADLINES, ...(settings || {}) };
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const kind = (s.holidays || []).includes(date) ? 'holiday' : dow === 0 || dow === 6 ? 'weekend' : 'weekday';
  const hhmm = kind === 'weekday' ? s.weekday : s.weekend;
  return { at: nzTime(date, hhmm), kind, hhmm };
}
const mins = (ms) => Math.max(1, Math.round(ms / 60000));

/**
 * One run's standing against its deadline.
 * run: { total, done, complete, finishedAt (ms|null) } · tickTimes: [ms] of app ticks · typicalMs: how long this run usually takes
 * States: done_on_time, done_late, on_track, late (will overrun), not_started, not_started_late (can't make it now), unfinished (deadline long gone)
 */
export function runWatch({ run, tickTimes = [], deadline, typicalMs, now = Date.now() }) {
  // A stray tick the evening before (someone trying the sheet) isn't the run starting: only the five hours up to the deadline count.
  const T = [...tickTimes].filter((x) => Number.isFinite(x) && (run.complete || x >= deadline - 5 * 3600e3)).sort((a, b) => a - b);
  const typical = typicalMs || Math.max(20, run.total || 0) * 40000;
  const base = { deadline, startedAt: T[0] ?? null, typicalMs: typical };
  if (run.complete) {
    const fin = run.finishedAt ?? T.at(-1) ?? null;
    if (fin == null) return { ...base, state: 'done_on_time', finishedAt: null, text: 'Done' };
    const over = fin - deadline;
    return { ...base, state: over > 0 ? 'done_late' : 'done_on_time', finishedAt: fin, overMin: over > 0 ? mins(over) : 0, text: over > 0 ? `Done, ${mins(over)} min late` : 'Done on time' };
  }
  if (now - deadline > 6 * 3600e3) return { ...base, state: 'unfinished', text: 'Not finished in the app' };
  const remaining = Math.max(0, (run.total || 0) - (run.done || 0));
  if (!T.length) {
    const startBy = deadline - typical;
    if (now > startBy) { const over = now + typical - deadline; return { ...base, state: 'not_started_late', startBy, eta: now + typical, overMin: mins(over), text: `Not started. Even starting now, about ${mins(over)} min late` }; }
    return { ...base, state: 'not_started', startBy, text: 'Not started yet' };
  }
  const est = estimateFinish({ tickTimes: T, done: run.done, remaining, now });
  const per = est ? est.per : typical / Math.max(1, run.total || 1);
  const eta = now + per * remaining;
  const over = eta - deadline;
  return { ...base, state: over > 0 ? 'late' : 'on_track', eta, overMin: over > 0 ? mins(over) : 0, spareMin: over > 0 ? 0 : mins(-over), text: over > 0 ? `Running about ${mins(over)} min late` : 'On track' };
}
export const WATCH_LABEL = { done_on_time: 'Done on time', done_late: 'Done late', on_track: 'On track', late: 'Running late', not_started: 'Not started', not_started_late: 'Not started: will be late', unfinished: 'Not finished' };
export const needsAttention = (w) => ['late', 'not_started_late', 'done_late', 'unfinished'].includes(w.state);

/** How long a route usually takes: the middle of its recent app-ticked runs (first tick to last), or null. */
export function typicalDuration(history) {
  const d = history.filter((h) => h.first != null && h.last != null && h.ticks >= 10).map((h) => h.last - h.first).filter((x) => x > 5 * 60000 && x < 5 * 3600e3).sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : null;
}

/** A plain summary of the morning to paste to the run owner. rows: [{ name, watch }] */
export function summaryText(dateLabel, rows, extras = {}, fmt = (t) => new Date(t).toLocaleTimeString('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit' })) {
  if (!rows.length) return `${dateLabel}: no runs loaded.`;
  const dl = fmt(rows[0].watch.deadline);
  const done = rows.filter((r) => r.watch.state.startsWith('done'));
  const late = rows.filter((r) => r.watch.state === 'done_late');
  const head = done.length === rows.length
    ? (late.length ? `${dateLabel}: all ${rows.length} runs delivered, ${late.length} after the ${dl} deadline.` : `${dateLabel}: all ${rows.length} runs delivered by the ${dl} deadline.`)
    : `${dateLabel}: ${done.length} of ${rows.length} runs delivered so far (deadline ${dl}).`;
  const lines = rows.map((r) => {
    const w = r.watch;
    if (w.state.startsWith('done')) return `${r.name}: finished ${w.finishedAt ? fmt(w.finishedAt) : '(paper sheet)'}${w.state === 'done_late' ? `, ${w.overMin} min late` : ''}`;
    const low = w.text.charAt(0).toLowerCase() + w.text.slice(1);
    if (w.state === 'not_started_late') return `${r.name}: not started; even starting now, about ${w.overMin} min late`;
    if (w.eta) return `${r.name}: ${low}, finish about ${fmt(w.eta)}`;
    return `${r.name}: ${low}`;
  });
  const tail = [];
  if (extras.notDelivered?.length) tail.push(`Not delivered (${extras.notDelivered.length}): ${extras.notDelivered.join('; ')}`);
  if (extras.photos) tail.push(`${extras.photos} delivery photo${extras.photos === 1 ? '' : 's'} on file.`);
  return [head, ...lines, ...tail].join('\n');
}
