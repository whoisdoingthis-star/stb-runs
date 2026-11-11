// On Duty and the shift timeline (docs/decisions/0020-on-duty-and-shifts.md).
//
// A shift is every minute from going On duty to going Off duty, with no holes:
//   depot      on duty until you drive off (or your first tick): sorting, loading
//   travel     getting to a run: from the end of the last thing you did (or the
//              moment you moved on to the run) to its first tick
//   run        delivering your own run: its first tick to its last
//   help       the same, on someone else's run (Mike helping Mum on Run 11)
//   pause      a gap of 10+ minutes between ticks inside a run
//   between    you finished a run and didn't move on to the next straight away
//   wrap       last tick to Off duty (driving home, returning bundles)
// Pure functions: the app and Dispatch both use them; test/shifts.mjs checks them.

export const DUTY_LABEL = { on_duty: 'On duty', depot: 'At the depot', on_run: 'On the run', between: 'Between runs', off_duty: 'Off duty' };
export const PAUSE_MS = 10 * 60 * 1000;
export const FORGOT_MS = 12 * 3600 * 1000;
const ms = (t) => (typeof t === 'number' ? t : new Date(t).getTime());

/** The latest duty state from a person's duty events (null = never went on duty). */
export function currentDuty(events) {
  const last = [...(events || [])].sort((a, b) => ms(a.device_time) - ms(b.device_time)).at(-1);
  return last ? { ...last, onDuty: last.state !== 'off_duty' } : null;
}

/** Since when the current shift has been running (the On duty that started it), or null. */
export function shiftStart(events) {
  const ev = [...(events || [])].sort((a, b) => ms(a.device_time) - ms(b.device_time));
  let start = null;
  for (const e of ev) {
    if (e.state === 'off_duty') start = null;
    else if (start == null) start = ms(e.device_time);
  }
  return start;
}

/** "1:05" or "0:18" style. */
export const clock = (d) => { const m = Math.max(0, Math.floor(d / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/**
 * One person's day as continuous segments.
 * duty:   their duty events [{ state, run_id?, device_time }]
 * ticks:  their delivered ticks [{ run_id, device_time }] (not paper ticks: those have no real time)
 * owners: { run_id: name } who the run belongs to (closed-with driver, or who ticked most of it)
 * me:     this person's name; now: for a shift still going
 */
export function shiftSegments({ duty = [], ticks = [], owners = {}, me = '', now = Date.now() }) {
  const D = [...duty].map((e) => ({ ...e, t: ms(e.device_time) })).sort((a, b) => a.t - b.t);
  const onAt = D.find((e) => e.state !== 'off_duty');
  // Ticks after going Off duty (fixing a mistake that evening) aren't part of the shift.
  const offFirst = onAt && D.find((e) => e.state === 'off_duty' && e.t > onAt.t);
  const K = [...ticks].map((e) => ({ ...e, t: ms(e.device_time) })).filter((e) => !offFirst || e.t <= offFirst.t).sort((a, b) => a.t - b.t);
  const start = onAt ? Math.min(onAt.t, K[0]?.t ?? Infinity) : K[0]?.t;
  if (start == null) return { start: null, end: null, segments: [], totals: {} };
  const offAt = [...D].reverse().find((e) => e.state === 'off_duty' && e.t >= start);
  const lastTick = K.at(-1)?.t ?? start;
  // Still on duty: the shift runs to now, unless nothing has happened for 12 hours (forgot Off duty): then it
  // ends at the last thing they did, and `forgot` says so.
  const lastAct = Math.max(lastTick, D.at(-1)?.t ?? start);
  const still = !offAt && !!currentDuty(D)?.onDuty;
  const forgot = still && now - lastAct > FORGOT_MS;
  const end = offAt ? Math.max(offAt.t, lastTick) : still && !forgot ? Math.max(now, lastTick) : lastAct;

  // Runs in the order you worked them: consecutive ticks on the same run make one block.
  const blocks = [];
  for (const k of K) {
    const b = blocks.at(-1);
    if (b && b.run_id === k.run_id) { b.last = k.t; b.ticks.push(k.t); } else blocks.push({ run_id: k.run_id, first: k.t, last: k.t, ticks: [k.t] });
  }
  const starts = D.filter((e) => e.state === 'on_run'); // "moved on to" moments (motion, or the next run)
  const seg = [];
  const push = (kind, a, b, run_id) => { if (b > a) seg.push({ kind, start: a, end: b, ...(run_id ? { run_id } : {}) }); };

  // Depot: until you drive off (first On the run) or your first tick.
  const firstMove = starts.find((e) => e.t >= start && (!blocks.length || e.t <= blocks[0].first));
  let prev = Math.min(firstMove ? firstMove.t : blocks[0]?.first ?? end, blocks[0]?.first ?? end);
  push('depot', start, prev);

  for (const b of blocks) {
    // Moved on to this run explicitly after finishing the last? The wait before that is "between".
    const moved = starts.find((e) => e.run_id === b.run_id && e.t > prev && e.t <= b.first);
    if (moved && seg.length && seg.at(-1).kind !== 'depot') { push('between', prev, moved.t); prev = moved.t; }
    push('travel', prev, b.first, b.run_id);
    const kind = owners[b.run_id] && me && owners[b.run_id] !== me ? 'help' : 'run';
    let a = b.first;
    for (let i = 1; i < b.ticks.length; i++) {
      if (b.ticks[i] - b.ticks[i - 1] >= PAUSE_MS) { push(kind, a, b.ticks[i - 1], b.run_id); push('pause', b.ticks[i - 1], b.ticks[i], b.run_id); a = b.ticks[i]; }
    }
    push(kind, a, b.last, b.run_id);
    prev = b.last;
  }
  push('wrap', prev, end);

  const totals = { shift: end - start };
  for (const s of seg) totals[s.kind] = (totals[s.kind] || 0) + (s.end - s.start);
  const perRun = {};
  for (const s of seg) if (s.run_id && s.kind !== 'pause') perRun[s.run_id] = (perRun[s.run_id] || 0) + (s.end - s.start);
  return { start, end, segments: seg, totals, perRun, open: still && !forgot, forgot };
}

/** Who a run belongs to: the driver it was closed with, else whoever ticked most of it in the app. */
export function runOwners(runs, ticks) {
  const out = {};
  for (const r of runs) {
    if (r.driver) { out[r.id] = r.driver; continue; }
    const n = {};
    for (const t of ticks) if (t.run_id === r.id && t.user_name && t.method !== 'paper') n[t.user_name] = (n[t.user_name] || 0) + 1;
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    if (top) out[r.id] = top[0];
  }
  return out;
}

/** Is the phone moving at driving speed? Needs about 30 s above 15 km/h. */
export class MotionWatch {
  constructor({ speed = 4.2, hold = 30000 } = {}) { this.speed = speed; this.hold = hold; this.since = null; this.prev = null; }
  update(fix) {
    let v = fix.speed;
    if (!(v >= 0) && this.prev) { const dt = (fix.t - this.prev.t) / 1000; if (dt > 0) v = metres(this.prev, fix) / dt; }
    this.prev = fix;
    if (v >= this.speed && (fix.acc ?? 0) < 60) { this.since ??= fix.t; return fix.t - this.since >= this.hold; }
    this.since = null;
    return false;
  }
}
function metres(a, b) {
  const R = 6371000; const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const distanceM = metres;

/**
 * A place from what someone pasted: a full Google Maps link (…/@-36.89,174.93,17z or …!3d-36.89!4d174.93
 * or ?q=-36.89,174.93) or plain "-36.89, 174.93". Short links (maps.app.goo.gl, goo.gl/maps) can't be
 * opened from the app, so they return { short: true }: open them, then paste the long link.
 */
export function parseLatLng(text) {
  const s = String(text || '').trim();
  const pair = (a, b) => {
    const lat = Number(a); const lng = Number(b);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  };
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  for (const re of [new RegExp(`!3d${num}!4d${num}`), new RegExp(`@${num},${num}`), new RegExp(`[?&](?:q|query|ll|destination)=${num}(?:,|%2C)\\s*${num}`, 'i'), new RegExp(`^${num}\\s*,\\s*${num}$`)]) {
    const m = s.match(re);
    if (m) { const p = pair(m[1], m[2]); if (p) return p; }
  }
  if (/goo\.gl\/|maps\.app\.goo\.gl/i.test(s)) return { short: true };
  return null;
}

export const SEGMENT_LABEL = { depot: 'Depot', travel: 'Driving to a run', run: 'Own runs', help: 'Helping', pause: 'Stopped', between: 'Between runs', wrap: 'After the last stop' };
