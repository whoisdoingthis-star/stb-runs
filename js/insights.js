// Insights (decision 0035): what the collected ticks, photos and complaints say, in plain words, with a suggestion each.
// Pure: rows in, findings out. Dispatch shows them (js/dispatch.js); Stan's "Did you know" cards will draw on the same numbers.
//
// Rules kept throughout:
//  - Fixed sums, no guessing: the same data always gives the same findings, and each says what it's based on.
//  - A finding needs enough days behind it (MIN_DAYS), and everything is marked "early" until there are EARLY_DAYS of data.
//  - Facts and suggestions, never marks out of ten for a person.

import { deadlineFor, DEFAULT_DEADLINES } from './watch.js';
import { buildReport } from './report.js';

const NZ = 'Pacific/Auckland';
export const MIN_DAYS = 3;       // fewer run-days than this and a pattern isn't reported
export const EARLY_DAYS = 14;    // fewer delivery days than this and the page says the findings are early
const WINDOW_BEFORE = 5 * 3600e3; const WINDOW_AFTER = 4 * 3600e3; // ticks this far around the deadline belong to the morning
const PAUSE_MS = 10 * 60e3;      // a gap longer than this is a break, not delivering
const AWAY_M = 60;               // a tick this far from where that address is usually ticked was made "away from the letterbox"
const BULK_GAP_S = 6;            // a run whose ticks are mostly this close together is delivered in one drop (a village, a building)

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mins = (ms) => Math.round(ms / 60e3);
const hm = (t) => new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(/\s/g, ' ');
const shortRoute = (r) => { const m = /(\d+)$/.exec(r || ''); return m ? `Run ${+m[1]}` : r || 'Run'; };
const streetOf = (key) => { const p = String(key || '').split('|'); return (p[1] || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()); };
const addrOf = (key) => { const p = String(key || '').split('|'); return `${(p[2] || '').replace(/\s+/g, '')} ${streetOf(key)}`.trim(); };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const perStop = (sec) => (sec >= 90 ? `${+(sec / 60).toFixed(1)} min` : `${sec} s`);
export function metres(a, b) {
  const R = 6371000; const r = Math.PI / 180; const dLat = (b.lat - a.lat) * r; const dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Each run's morning, from its ticks: when it started and finished, against its deadline.
 * Only delivered ticks made in the app, in the hours around the deadline (a stray evening tick isn't the run).
 * Returns [{ run_id, route, date, kind, deadline, first, last, ticks, lateMin, durationMs, drivers, bulk, paper }]
 */
export function runMornings(runs, ticks, deadlines = DEFAULT_DEADLINES) {
  const by = new Map(); for (const t of ticks) { if (!by.has(t.run_id)) by.set(t.run_id, []); by.get(t.run_id).push(t); }
  return runs.map((r) => {
    const dl = deadlineFor(r.delivery_date, deadlines);
    const all = by.get(r.id) || [];
    const paper = all.filter((t) => t.done && t.method === 'paper').length;
    const mine = all.filter((t) => t.done && t.method !== 'paper').map((t) => ({ ...t, ms: Date.parse(t.device_time) }))
      .filter((t) => t.ms >= dl.at - WINDOW_BEFORE && t.ms <= dl.at + WINDOW_AFTER).sort((a, b) => a.ms - b.ms);
    if (!mine.length) return { run_id: r.id, route: r.route, date: r.delivery_date, kind: dl.kind, deadline: dl.at, ticks: 0, paper, list: [] };
    const gaps = mine.slice(1).map((t, i) => (t.ms - mine[i].ms) / 1000);
    const first = mine[0].ms; const last = mine[mine.length - 1].ms;
    return { run_id: r.id, route: r.route, date: r.delivery_date, kind: dl.kind, deadline: dl.at, first, last, ticks: mine.length, paper,
      lateMin: Math.max(0, Math.round((last - dl.at) / 60e3)), durationMs: last - first, drivers: [...new Set(mine.map((t) => t.user_name).filter(Boolean))],
      bulk: gaps.length >= 10 && median(gaps) <= BULK_GAP_S, list: mine };
  });
}

/** How each route does against its deadline, weekdays and weekends apart. */
export function deadlineRecord(mornings) {
  const groups = new Map();
  for (const m of mornings) { if (!m.ticks) continue; const k = `${m.route}|${m.kind === 'weekday' ? 'weekday' : 'weekend'}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  return [...groups.entries()].map(([k, ms]) => {
    const [route, kind] = k.split('|'); const late = ms.filter((m) => m.lateMin > 0);
    const fin = median(ms.map((m) => m.last - m.deadline)); // ms after (+) or before (-) the deadline
    return { route, kind, days: ms.length, late: late.length, typicalFinishOffsetMin: Math.round(fin / 60e3), typicalLateMin: late.length ? Math.round(median(late.map((m) => m.lateMin))) : 0,
      worstLateMin: Math.max(0, ...ms.map((m) => m.lateMin)), typicalStartOffsetMin: Math.round(median(ms.map((m) => m.first - m.deadline)) / 60e3), typicalDurationMin: mins(median(ms.map((m) => m.durationMs))) };
  }).sort((a, b) => b.late / b.days - a.late / a.days || b.typicalLateMin - a.typicalLateMin || a.route.localeCompare(b.route));
}

/** Time spent street by street: the gaps between ticks (breaks left out), added up per street per morning. */
export function streetTimes(mornings) {
  const acc = new Map(); // route|street -> [{ secs, stops }]
  for (const m of mornings) {
    if (!m.ticks || m.bulk) continue;
    const day = new Map();
    m.list.forEach((t, i) => {
      if (!i) return; const gap = t.ms - m.list[i - 1].ms; if (gap > PAUSE_MS) return;
      const k = `${m.route}|${streetOf(t.address_key)}`; const d = day.get(k) || { secs: 0, stops: 0 }; d.secs += gap / 1000; d.stops += 1; day.set(k, d);
    });
    for (const [k, d] of day) { if (!acc.has(k)) acc.set(k, []); acc.get(k).push(d); }
  }
  return [...acc.entries()].filter(([, ds]) => ds.length >= MIN_DAYS).map(([k, ds]) => {
    const [route, street] = k.split('|');
    return { route, street, days: ds.length, typicalMin: +(median(ds.map((d) => d.secs)) / 60).toFixed(1), stops: Math.round(median(ds.map((d) => d.stops))), perStopSec: Math.round(median(ds.map((d) => d.secs / d.stops))) };
  }).sort((a, b) => b.typicalMin - a.typicalMin);
}

/** Streets a run leaves and comes back to, on most mornings: a hint that the order could be better. */
export function doubleBacks(mornings) {
  const acc = new Map(); const daysBy = new Map();
  for (const m of mornings) {
    if (!m.ticks || m.bulk) continue;
    daysBy.set(m.route, (daysBy.get(m.route) || 0) + 1);
    const visits = new Map(); let prev = null;
    for (const t of m.list) { const s = streetOf(t.address_key); if (s !== prev) { visits.set(s, (visits.get(s) || 0) + 1); prev = s; } }
    for (const [s, n] of visits) if (n > 1) { const k = `${m.route}|${s}`; if (!acc.has(k)) acc.set(k, []); acc.get(k).push(n); }
  }
  return [...acc.entries()].map(([k, ns]) => { const [route, street] = k.split('|'); return { route, street, days: ns.length, of: daysBy.get(route), visits: Math.round(median(ns)) }; })
    .filter((x) => x.of >= MIN_DAYS && x.days >= Math.ceil(x.of * 0.6)).sort((a, b) => b.days / b.of - a.days / a.of || b.visits - a.visits);
}

/**
 * How strong the proof is: GPS on ticks, paper runs, and ticks made away from where that address is usually ticked
 * (ticked from the car, or caught up later). Bulk-drop runs are left out of the "away" count: one drop is how they're done.
 */
export function proofStrength(mornings) {
  const usual = new Map(); // address -> usual position (median of its ticks)
  const pts = new Map();
  for (const m of mornings) for (const t of m.list || []) if (t.lat != null && (t.accuracy_m ?? 0) <= 50) { if (!pts.has(t.address_key)) pts.set(t.address_key, []); pts.get(t.address_key).push(t); }
  for (const [k, ts] of pts) if (ts.length >= MIN_DAYS) usual.set(k, { lat: median(ts.map((t) => t.lat)), lng: median(ts.map((t) => t.lng)) });
  const people = new Map(); const P = (n) => { if (!people.has(n)) people.set(n, { name: n, ticks: 0, gps: 0, checked: 0, away: 0, lastNoGps: null }); return people.get(n); };
  let app = 0; let gps = 0; let paper = 0; let checked = 0; let away = 0; const paperRuns = []; const awayList = [];
  for (const m of mornings) {
    paper += m.paper || 0; if ((m.paper || 0) > (m.ticks || 0)) paperRuns.push({ route: m.route, date: m.date });
    for (const t of m.list || []) {
      const p = P(t.user_name || 'Someone'); app += 1; p.ticks += 1;
      if (t.lat == null) { if (!p.lastNoGps || m.date > p.lastNoGps) p.lastNoGps = m.date; continue; }
      gps += 1; p.gps += 1;
      const u = usual.get(t.address_key); if (!u || m.bulk || (t.accuracy_m ?? 0) > 50) continue;
      checked += 1; p.checked += 1;
      if (metres(u, t) > AWAY_M) { away += 1; p.away += 1; awayList.push({ address: addrOf(t.address_key), route: m.route, date: m.date, by: t.user_name, m: Math.round(metres(u, t)) }); }
    }
  }
  return { app, gps, paper, gpsPct: app ? Math.round((gps / app) * 100) : null, paperPct: app + paper ? Math.round((paper / (app + paper)) * 100) : null, paperRuns,
    checked, away, awayPct: checked ? Math.round((away / checked) * 100) : null, awayList: awayList.sort((a, b) => b.date.localeCompare(a.date) || b.m - a.m),
    people: [...people.values()].map((p) => ({ ...p, gpsPct: p.ticks ? Math.round((p.gps / p.ticks) * 100) : null, awayPct: p.checked ? Math.round((p.away / p.checked) * 100) : null })).sort((a, b) => b.ticks - a.ticks) };
}

/** Complaints against deliveries: how many, what kind, where they repeat, and how many we can answer with a record. */
export function complaintPicture({ from, to, complaints, photos, ticks, delivered }) {
  const R = buildReport({ from, to, complaints, photos, ticks });
  const cs = R.complaints; const byKind = new Map(); const byAddr = new Map(); const byRoute = new Map();
  for (const c of cs) { byKind.set(c.kindText, (byKind.get(c.kindText) || 0) + 1); byRoute.set(c.route, (byRoute.get(c.route) || 0) + 1); const a = byAddr.get(c.address) || { address: c.address, route: c.route, n: 0, photo: false }; a.n += 1; a.photo = a.photo || c.photos.length > 0 || c.since.some((x) => x.photos.length); byAddr.set(c.address, a); }
  return { total: cs.length, per1000: delivered ? +((cs.length / delivered) * 1000).toFixed(1) : null, answered: cs.filter((c) => c.record.good).length, timed: cs.filter((c) => ['app', 'app_nogps', 'photo'].includes(c.record.state)).length,
    noRecord: cs.filter((c) => !c.record.good).length, kinds: [...byKind.entries()].sort((a, b) => b[1] - a[1]), routes: [...byRoute.entries()].sort((a, b) => b[1] - a[1]),
    repeats: [...byAddr.values()].filter((a) => a.n > 1).sort((a, b) => b.n - a.n), noPhoto: [...byAddr.values()].filter((a) => !a.photo).sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true })) };
}

/**
 * The three headline numbers (Mike, 17 Nov 2026):
 *  - DIFOT: of the stops on the sheets, how many were Delivered In Full, On Time: ticked delivered (not short,
 *    not "couldn't deliver") by that morning's deadline. Stops signed off from the paper sheet have no time,
 *    so they can't be measured and are counted apart, not against.
 *  - Complaints as a share of deliveries.
 *  - Average completion time per run: first tick to last tick of the morning, averaged over the run's mornings.
 * lines: [{ run_id, line_key }] (every stop on every sheet); ticks carry line_key.
 */
export function keyMetrics({ runs = [], lines = [], ticks = [], mornings = null, deadlines = DEFAULT_DEADLINES, complaintCount = 0, complaintsByRoute = [] }) {
  const ms = mornings || runMornings(runs, ticks, deadlines);
  const dl = new Map(runs.map((r) => [r.id, deadlineFor(r.delivery_date, deadlines).at]));
  const latest = new Map(); // run|line -> its latest tick (ticks are only ever added; the last one is how the stop stands)
  for (const t of ticks) { if (!dl.has(t.run_id)) continue; const k = `${t.run_id}|${t.line_key}`; const cur = latest.get(k); if (!cur || String(t.device_time) > String(cur.device_time)) latest.set(k, t); }
  let due = 0; let paper = 0; let difot = 0; let late = 0; let short = 0; let futile = 0; let none = 0;
  const routeOf = new Map(runs.map((r) => [r.id, r.route])); const rd = new Map(); // route -> [in full on time, measured]
  const bump = (id, ok) => { const k = routeOf.get(id); const v = rd.get(k) || [0, 0]; v[1] += 1; if (ok) v[0] += 1; rd.set(k, v); };
  for (const l of lines) {
    if (!dl.has(l.run_id)) continue; due += 1;
    const e = latest.get(`${l.run_id}|${l.line_key}`);
    if (!e || !e.done) { none += 1; bump(l.run_id, false); continue; }
    if (e.method === 'paper') { paper += 1; continue; }
    if (e.outcome === 'futile') { futile += 1; bump(l.run_id, false); continue; }
    if (e.outcome === 'short') { short += 1; bump(l.run_id, false); continue; }
    const ok = Date.parse(e.device_time) <= dl.get(l.run_id); if (ok) difot += 1; else late += 1; bump(l.run_id, ok);
  }
  const measured = due - paper; const delivered = difot + late + short + paper;
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const clockMin = (t) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: NZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)); return +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value; };
  const asClock = (min) => (min == null ? null : `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(Math.round(min) % 60).padStart(2, '0')} ${min >= 720 ? 'pm' : 'am'}`);
  const cBy = new Map(complaintsByRoute);
  // one tile per run: how long it takes, how fast each delivery is, when it starts and finishes, and how it does against the deadline
  const groups = new Map(); for (const m of ms) { if (!groups.has(m.route)) groups.set(m.route, []); groups.get(m.route).push(m); }
  const perRun = [...groups.entries()].map(([route, all]) => {
    const t = all.filter((m) => m.ticks >= 2); const paperMornings = all.filter((m) => !m.ticks && m.paper).length;
    const dur = t.map((m) => m.durationMs); const [ok, of] = rd.get(route) || [0, 0];
    const stops = t.length ? Math.round(mean(t.map((m) => m.ticks))) : null;
    return { route, name: shortRoute(route), mornings: t.length, paperMornings, bulk: t.length > 0 && t.filter((m) => m.bulk).length > t.length / 2,
      avgMin: t.length ? Math.round(mean(dur) / 60e3) : null, fastestMin: t.length ? Math.round(Math.min(...dur) / 60e3) : null, slowestMin: t.length ? Math.round(Math.max(...dur) / 60e3) : null,
      stops, perDeliverySec: t.length ? Math.round(mean(t.map((m) => m.durationMs / Math.max(1, m.ticks - 1))) / 1000) : null,
      usualStart: asClock(median(t.map((m) => clockMin(m.first)))), usualFinish: asClock(median(t.map((m) => clockMin(m.last)))),
      onTime: t.filter((m) => m.lateMin === 0).length, difotPct: of ? Math.round((ok / of) * 100) : null, difotN: ok, difotOf: of, complaints: cBy.get(route) || 0 };
  }).filter((r) => r.mornings || r.paperMornings).sort((a, b) => a.route.localeCompare(b.route, 'en', { numeric: true }));
  const timedAll = ms.filter((m) => m.ticks >= 2);
  return {
    difot: { pct: measured ? +((difot / measured) * 100).toFixed(1) : null, n: difot, of: measured, late, short, futile, notRecorded: none, paper, due },
    complaints: { n: complaintCount, of: delivered, pct: delivered ? +((complaintCount / delivered) * 100).toFixed(2) : null },
    onTime: { n: timedAll.filter((m) => m.lateMin === 0).length, of: timedAll.length, pct: timedAll.length ? Math.round((timedAll.filter((m) => m.lateMin === 0).length / timedAll.length) * 100) : null },
    perRun,
  };
}
/** "1 h 05" or "48 min" */
export const duration = (min) => (min == null ? '–' : min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`);

const offset = (min) => (min === 0 ? 'right on the deadline' : `${Math.abs(min)} min ${min > 0 ? 'after' : 'before'} the deadline`);
const round5 = (n) => Math.max(5, Math.ceil(n / 5) * 5);

/**
 * Everything, as findings to read. Each: { id, area, level, title, text, basis, suggestion?, cols?, rows? }
 * level: act (do something), watch (keep an eye on), good (working), info.
 */
export function buildInsights({ runs = [], ticks = [], lines = [], complaints = [], photos = [], deadlines = DEFAULT_DEADLINES, from, to } = {}) {
  const inRange = runs.filter((r) => (!from || r.delivery_date >= from) && (!to || r.delivery_date <= to));
  const mornings = runMornings(inRange, ticks, deadlines);
  const days = new Set(mornings.filter((m) => m.ticks || m.paper).map((m) => m.date)).size;
  const lo = from || inRange.map((r) => r.delivery_date).sort()[0] || null; const hi = to || inRange.map((r) => r.delivery_date).sort().pop() || null;
  const delivered = mornings.reduce((n, m) => n + (m.ticks || 0) + (m.paper || 0), 0);
  const F = []; const add = (f) => F.push(f);
  const dlText = (kind) => (kind === 'weekday' ? `${deadlines.weekday || DEFAULT_DEADLINES.weekday} am weekday deadline` : `${deadlines.weekend || DEFAULT_DEADLINES.weekend} am weekend deadline`).replace(/\b0(\d):/, '$1:');

  // 1. deadlines
  const rec = deadlineRecord(mornings);
  for (const r of rec.filter((x) => x.days >= MIN_DAYS && x.late >= Math.ceil(x.days / 2))) {
    const name = shortRoute(r.route); const earlier = round5(r.typicalLateMin);
    add({ id: `late-${r.route}-${r.kind}`, area: 'Deadlines', level: 'act', title: `${name} is finishing after the ${dlText(r.kind)}`,
      text: `Late on ${r.late} of ${plural(r.days, r.kind === 'weekday' ? 'weekday' : 'weekend day')}, typically by ${r.typicalLateMin} min (worst ${r.worstLateMin} min). It usually starts ${offset(r.typicalStartOffsetMin)} and takes about ${r.typicalDurationMin} min.`,
      suggestion: r.typicalStartOffsetMin > -r.typicalDurationMin
        ? `It starts too late to finish in time: ${name} needs to begin about ${earlier} min earlier, or go to someone who's free sooner.`
        : `Start ${name} about ${earlier} min earlier, or move its slowest street to another run.`,
      basis: `${plural(r.days, 'morning')} of app ticks` });
  }
  const onTime = rec.filter((x) => x.days >= MIN_DAYS && x.late === 0);
  if (onTime.length) add({ id: 'on-time', area: 'Deadlines', level: 'good', title: `${onTime.map((x) => shortRoute(x.route)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}: on time every morning`,
    text: onTime.map((x) => `${shortRoute(x.route)} (${x.kind}s): typically done ${offset(x.typicalFinishOffsetMin)}`).join('. ') + '.', basis: `${plural(Math.max(...onTime.map((x) => x.days)), 'morning')} at most per run` });
  if (rec.length) add({ id: 'deadline-table', area: 'Deadlines', level: 'info', title: 'Every run against its deadline', text: 'Finish times come from the last app tick of the morning. Runs done from the paper sheet have no times and are left out.',
    cols: ['Run', 'Days', 'Mornings', 'Late', 'Usually finishes', 'Usually takes'], rows: rec.map((r) => [shortRoute(r.route), r.kind === 'weekday' ? 'Mon to Fri' : 'Weekend', r.days, r.late ? `${r.late} (typically ${r.typicalLateMin} min)` : 'Never', offset(r.typicalFinishOffsetMin), `${r.typicalDurationMin} min`]), basis: `${plural(days, 'delivery day')}` });

  // 2. slow spots and order
  const st = streetTimes(mornings);
  if (st.length) add({ id: 'slow-streets', area: 'Time on the road', level: 'info', title: 'Where the time goes, street by street',
    text: `The five streets that take longest, from the gaps between ticks (breaks over 10 minutes left out). "Per stop" shows up the hard-to-reach ones.`,
    cols: ['Street', 'Run', 'Typical time', 'Stops', 'Per stop'], rows: st.slice(0, 5).map((s) => [s.street, shortRoute(s.route), `${s.typicalMin} min`, s.stops, perStop(s.perStopSec)]), basis: `streets seen on ${MIN_DAYS} or more mornings` });
  const slowStops = st.filter((s) => s.stops <= 3 && s.perStopSec >= 120);
  if (slowStops.length) add({ id: 'slow-stops', area: 'Time on the road', level: 'watch', title: `${plural(slowStops.length, 'short street')} ${slowStops.length === 1 ? 'costs' : 'cost'} over 2 minutes a stop`,
    text: slowStops.slice(0, 5).map((s) => `${s.street} (${shortRoute(s.route)}): ${perStop(s.perStopSec)} a stop for ${plural(s.stops, 'stop')}`).join('. ') + '.',
    suggestion: 'Worth a look: a long drive for one or two papers, a gate or code, or a stop that would sit better on another run.', basis: `${MIN_DAYS} or more mornings each` });
  const back = doubleBacks(mornings);
  if (back.length) add({ id: 'double-back', area: 'Time on the road', level: 'watch', title: `${plural(back.length, 'street')} ${back.length === 1 ? 'gets' : 'get'} visited more than once in a run`,
    text: back.slice(0, 6).map((b) => `${b.street} (${shortRoute(b.route)}): left and come back to on ${b.days} of ${b.of} mornings`).join('. ') + '.',
    suggestion: 'If it isn’t on purpose (both sides of a busy road, say), dragging those tiles together in the run would save the trip back.', basis: 'the order stops were ticked in' });

  // 3. proof
  const pr = proofStrength(mornings);
  if (pr.app) {
    const noGps = pr.people.filter((p) => p.ticks >= 10 && p.gpsPct < 80);
    for (const p of noGps) add({ id: `gps-${p.name}`, area: 'Proof', level: 'act', title: `${p.name}’s phone isn’t recording GPS on most ticks`,
      text: `${p.gps} of ${p.ticks} of ${p.name}’s ticks have a position (${p.gpsPct}%). Without it a tick proves the time but not the place.`,
      suggestion: `On ${p.name}’s phone: allow Location for the app (“Precise”, “While using”), then check the GPS dot in a run goes green.`, basis: `last seen ${p.lastNoGps}` });
    add({ id: 'proof', area: 'Proof', level: pr.gpsPct >= 95 && !noGps.length ? 'good' : 'watch', title: `${pr.gpsPct}% of app ticks carry GPS`,
      text: `${pr.gps} of ${pr.app} ticks made in the app have a position.${pr.paper ? ` Another ${pr.paper} deliveries (${pr.paperPct}%) were signed off from the paper sheet, with no time or place for each stop.` : ''}`,
      suggestion: pr.paperRuns.length ? `Runs done on paper: ${pr.paperRuns.slice(0, 6).map((x) => `${shortRoute(x.route)} on ${x.date.slice(5).split('-').reverse().join('/')}`).join(', ')}. Each is a morning with no proof if a complaint comes in.` : undefined,
      cols: ['Who', 'App ticks', 'With GPS'], rows: pr.people.map((p) => [p.name, p.ticks, `${p.gpsPct}%`]), basis: `${plural(days, 'delivery day')}` });
    if (pr.checked >= 50) add({ id: 'away', area: 'Proof', level: pr.awayPct >= 5 ? 'watch' : 'good', title: `${pr.awayPct}% of ticks were made away from the letterbox`,
      text: `${pr.away} of ${pr.checked} ticks were more than ${AWAY_M} m from where that address is usually ticked: most likely ticked from the car further on, or caught up later. The time is still recorded, but the position no longer backs it up.`,
      suggestion: pr.away ? 'Tick at the letterbox, as each paper goes in. Catching up a street at a time from the car is what this picks up.' : undefined,
      cols: pr.away ? ['Who', 'Ticks checked', 'Away from the letterbox'] : undefined, rows: pr.away ? pr.people.filter((p) => p.checked >= 10).map((p) => [p.name, p.checked, `${p.away} (${p.awayPct}%)`]) : undefined,
      basis: `addresses ticked on ${MIN_DAYS} or more mornings, compared with their own usual spot; runs delivered in one drop left out` });
  }
  const bulk = [...new Set(mornings.filter((m) => m.bulk).map((m) => shortRoute(m.route)))];
  if (bulk.length) add({ id: 'bulk', area: 'Proof', level: 'info', title: `${bulk.join(', ')}: ticked in one go`, text: `Most ticks on ${bulk.join(' and ')} are seconds apart at one spot, which is right for a run delivered in one drop. It’s left out of the street times and the letterbox check.`, basis: 'gaps between ticks' });

  // 4. complaints
  let complaintCount = 0; let complaintsByRoute = [];
  if (lo && hi) {
    const cp = complaintPicture({ from: lo, to: hi, complaints, photos, ticks, delivered });
    complaintCount = cp.total; complaintsByRoute = cp.routes;
    if (cp.total) {
      add({ id: 'complaints', area: 'Complaints', level: cp.noRecord > cp.answered ? 'watch' : 'info', title: `${plural(cp.total, 'complaint')} for ${delivered.toLocaleString('en-NZ')} deliveries${cp.per1000 != null ? ` (${cp.per1000} per thousand)` : ''}`,
        text: `${cp.answered} can be answered with our own delivery record for that morning (${cp.timed} with a time). ${cp.noRecord} ${cp.noRecord === 1 ? 'has' : 'have'} no record to answer with. By type: ${cp.kinds.map(([k, n]) => `${k} ${n}`).join(', ')}.`,
        cols: ['Run', 'Complaints'], rows: cp.routes.map(([r, n]) => [shortRoute(r), n]), basis: `complaints about or received ${lo} to ${hi}` });
      if (cp.repeats.length) add({ id: 'repeats', area: 'Complaints', level: 'act', title: `${plural(cp.repeats.length, 'address', 'addresses')} ${cp.repeats.length === 1 ? 'has' : 'have'} complained more than once`,
        text: cp.repeats.map((a) => `${a.address} (${shortRoute(a.route)}): ${a.n} complaints`).join('. ') + '.', suggestion: 'Photograph these every morning for the next two weeks, and check the delivery note for where the customer wants it left.', basis: 'the complaints list' });
      if (cp.noPhoto.length) add({ id: 'no-photo', area: 'Complaints', level: 'watch', title: `${plural(cp.noPhoto.length, 'complaint address', 'complaint addresses')} with no photo yet`,
        text: `${cp.noPhoto.slice(0, 8).map((a) => a.address).join(', ')}${cp.noPhoto.length > 8 ? ' and more' : ''}.`, suggestion: 'The app asks for a photo at complaint addresses; one photo each closes the gap.', basis: 'photos on the complaint day or since' });
    }
  }
  const order = { act: 0, watch: 1, good: 2, info: 3 };
  return { from: lo, to: hi, days, early: days < EARLY_DAYS, delivered, runs: mornings.filter((m) => m.ticks || m.paper).length,
    metrics: keyMetrics({ runs: inRange, lines, ticks, mornings, deadlines, complaintCount, complaintsByRoute }),
    counts: { act: F.filter((f) => f.level === 'act').length, watch: F.filter((f) => f.level === 'watch').length, good: F.filter((f) => f.level === 'good').length },
    findings: F.sort((a, b) => order[a.level] - order[b.level]) };
}

// ---------- Stan's "Did you know…" cards for a driver (decision 0036) ----------
// The same sums, turned to face one person: only ever their own numbers, and the runs they drive.
// A card is a fact or a tip, never a mark. topic groups cards for "more like this / less like this".

const dayName = (date) => new Intl.DateTimeFormat('en-NZ', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const oneIn = (pct) => (pct >= 45 ? 'About half' : pct >= 29 ? 'About 1 in 3' : pct >= 22 ? 'About 1 in 4' : pct >= 17 ? 'About 1 in 5' : pct >= 12 ? 'About 1 in 8' : 'About 1 in 10');

/**
 * Every card that could be shown to `name` from the data. Returns [{ id, kind: 'tip' | 'fact', topic, text }], tips first.
 * A run counts as theirs on a morning when they made most of its ticks.
 */
export function driverCards({ name, runs = [], ticks = [], complaints = [], deadlines = DEFAULT_DEADLINES } = {}) {
  if (!name) return [];
  const all = runMornings(runs, ticks, deadlines).filter((m) => m.ticks);
  const mine = all.filter((m) => m.list.filter((t) => t.user_name === name).length > m.ticks / 2);
  const myTicks = all.flatMap((m) => m.list.filter((t) => t.user_name === name).map((t) => ({ ...t, date: m.date })));
  if (!myTicks.length) return [];
  const cards = []; const tip = (id, topic, text) => cards.push({ id, kind: 'tip', topic, text }); const fact = (id, topic, text) => cards.push({ id, kind: 'fact', topic, text });
  const lastDate = myTicks.map((t) => t.date).sort().pop();

  // tips
  const recent = myTicks.filter((t) => t.date === lastDate);
  if (recent.length >= 5 && recent.filter((t) => t.lat != null).length / recent.length < 0.8) tip('gps', 'proof',
    `Your phone didn’t record where you were on ${recent.filter((t) => t.lat == null).length} of your ${recent.length} ticks on ${dayName(lastDate)}. Allow Location for the app and I can back you up with the place as well as the time.`);
  const me = proofStrength(all).people.find((p) => p.name === name);
  if (me && me.checked >= 30 && me.awayPct >= 10) tip('away', 'proof',
    `${oneIn(me.awayPct)} of your ticks were made away from the letterbox. Tick as the paper goes in and the GPS proves the delivery if anyone asks.`);
  for (const r of deadlineRecord(mine)) {
    if (r.days < MIN_DAYS || r.late < Math.ceil(r.days / 2)) continue;
    tip(`late-${r.route}-${r.kind}`, 'time', `${shortRoute(r.route)} has finished after the deadline on ${r.late} of your last ${r.days} ${r.kind === 'weekday' ? 'weekday' : 'weekend'} mornings, usually by about ${r.typicalLateMin} minutes. Starting ${round5(r.typicalLateMin)} minutes earlier would bring it home in time.`);
  }
  const myRoutes = new Set(mine.map((m) => m.route)); const byAddr = new Map();
  for (const c of complaints) { if (!myRoutes.has(c.route)) continue; const a = byAddr.get(c.address_key) || { n: 0, c }; a.n += 1; byAddr.set(c.address_key, a); }
  const rep = [...byAddr.values()].filter((a) => a.n > 1).sort((a, b) => b.n - a.n)[0];
  if (rep) tip(`repeat-${rep.c.address_key}`, 'complaints', `${addrOf(rep.c.address_key)} on ${shortRoute(rep.c.route)} has complained ${rep.n} times. A photo there each morning is the best answer we can give.`);

  // facts
  fact('total', 'fun', `You’ve delivered ${myTicks.length.toLocaleString('en-NZ')} papers with me over ${plural(new Set(myTicks.map((t) => t.date)).size, 'morning')}.`);
  const byRoute = new Map(); for (const m of mine) { if (m.bulk || m.ticks < 5) continue; if (!byRoute.has(m.route)) byRoute.set(m.route, []); byRoute.get(m.route).push(m); }
  for (const [route, ms] of byRoute) {
    const n = shortRoute(route);
    if (ms.length >= 2) { const best = [...ms].sort((a, b) => a.durationMs - b.durationMs)[0]; fact(`quickest-${route}`, 'time', `Your quickest ${n} was ${dayName(best.date)}: ${duration(mins(best.durationMs))}, first tick to last.`); }
    if (ms.length >= MIN_DAYS) fact(`pace-${route}`, 'time', `On ${n} you average ${perStop(Math.round(median(ms.map((m) => m.durationMs / Math.max(1, m.ticks - 1))) / 1000))} a delivery, driving included.`);
    const sorted = [...ms].sort((a, b) => b.date.localeCompare(a.date)); let streak = 0; for (const m of sorted) { if (m.lateMin === 0) streak += 1; else break; }
    if (streak >= 3) fact(`streak-${route}`, 'fun', `${n} has made its deadline ${streak} mornings running with you driving. Stan-tastic!`);
  }
  const st = streetTimes(mine)[0];
  if (st) fact(`street-${st.route}-${st.street}`, 'streets', `${st.street} is where ${shortRoute(st.route)} takes you longest: about ${Math.round(st.typicalMin)} minutes for ${plural(st.stops, 'stop')}.`);
  const early = [...mine].sort((a, b) => (a.first - a.deadline) - (b.first - b.deadline))[0];
  if (early && mine.length >= MIN_DAYS) fact('earliest', 'fun', `Your earliest start was ${dayName(early.date)}: first paper out at ${hm(early.first)}.`);
  return cards;
}

/**
 * Which card to show today. One a day at most. A card isn't repeated within a week (a fortnight for facts), topics the
 * person asked for less of rest for a month, tips and facts take turns so it doesn't nag, and "more like this" goes first.
 * seen: { id: 'YYYY-MM-DD' last shown } · prefs: { topic: { v: 1 | -1, date } } · returns a card or null.
 */
export function pickCard(cards, { today, seen = {}, prefs = {} } = {}) {
  const daysSince = (d) => (d ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 864e5) : Infinity);
  const ok = cards.filter((c) => daysSince(seen[c.id]) >= (c.kind === 'tip' ? 7 : 14) && !(prefs[c.topic]?.v === -1 && daysSince(prefs[c.topic].date) < 30));
  if (!ok.length) return null;
  const dayNo = Math.floor(Date.parse(`${today}T12:00:00Z`) / 864e5);
  const want = dayNo % 2 === 0 ? 'tip' : 'fact';
  const score = (c) => (prefs[c.topic]?.v === 1 ? 0 : 1) * 10 + (c.kind === want ? 0 : 1);
  const best = Math.min(...ok.map(score)); const pool = ok.filter((c) => score(c) === best);
  return pool[dayNo % pool.length];
}
