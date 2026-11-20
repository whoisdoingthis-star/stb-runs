// The end-of-shift summary (decision 0044): what Stan shows a driver or helper when their morning is done.
// Pure: history in, one card out. The person only ever sees their own crew's numbers, measured against their own usual.

import { runMornings, metres } from './insights.js';

export const AWAY_M = 60;        // a tick this far from where that address is usually ticked wasn't made at the letterbox (as on Insights)
export const USUAL_MIN = 3;      // mornings on a run before there is a "usual" to compare with
export const SAME_PCT = 3;       // within this of the usual is "right on your usual"
export const TREND_DAYS = 14;
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const runName = (r) => { const m = /(\d+)$/.exec(r || ''); return m ? `Run ${+m[1]}` : r || 'Run'; };
const names = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '');

/** A crew's share of a morning: did they do this run? (They made at least a third of its ticks.) */
const crewDid = (m, crew) => m.ticks > 0 && m.list.filter((t) => crew.includes(t.user_name)).length * 3 >= m.ticks;

/**
 * name: who is looking · crew: everyone in their car, them included · date: the delivery day
 * runs, ticks: the last few weeks, today included (store.loadCardRows) · todayRuns: today's runs with summary, done, notDelivered
 * duty: this person's duty events · deadlines: the settings
 * Returns null if the crew did no run today, else the card.
 */
export function buildShiftSummary({ name, crew = [name], date, runs = [], ticks = [], todayRuns = [], duty = [], deadlines } = {}) {
  const mornings = runMornings(runs, ticks, deadlines).filter((m) => m.ticks > 0);
  const today = mornings.filter((m) => m.date === date && crewDid(m, crew)).sort((a, b) => a.first - b.first);
  if (!today.length) return null;
  const info = new Map(todayRuns.map((r) => [r.id, r]));

  // ---- the outcome: against the deadline ----
  const first = Math.min(...today.map((m) => m.first)); const last = Math.max(...today.map((m) => m.last)); const deadline = today[0].deadline;
  const total = today.reduce((n, m) => n + (info.get(m.run_id)?.summary?.lines || m.ticks), 0);
  const done = today.reduce((n, m) => n + Math.min(info.get(m.run_id)?.done ?? m.ticks, info.get(m.run_id)?.summary?.lines || Infinity), 0);
  const notDelivered = today.reduce((n, m) => n + (info.get(m.run_id)?.notDelivered || 0), 0);
  const allTicked = done >= total;
  const marginMin = Math.round((deadline - last) / 60e3);       // + before the deadline, − after
  const outcome = { finishedAt: last, deadline, marginMin, onTime: marginMin >= 0, allTicked, runs: today.map((m) => runName(m.route)) };

  // ---- the shift: depot, on the run, stops, papers ----
  const onDuty = [...duty].filter((e) => e.state === 'on_duty' && Date.parse(e.device_time) <= first && Date.parse(e.device_time) >= first - 6 * 3600e3).sort((a, b) => Date.parse(b.device_time) - Date.parse(a.device_time))[0];
  const left = onDuty ? [...duty].filter((e) => e.state === 'on_run' && Date.parse(e.device_time) > Date.parse(onDuty.device_time)).map((e) => Date.parse(e.device_time)).sort((a, b) => a - b)[0] : null;
  const depotMin = onDuty ? Math.max(0, Math.round((Math.min(left ?? first, first) - Date.parse(onDuty.device_time)) / 60e3)) : null;
  const shift = { depotMin, runMin: Math.round((last - first) / 60e3), stops: done, papers: today.reduce((n, m) => n + (info.get(m.run_id)?.summary?.copies || 0), 0) || null };

  // ---- pace: today against this crew's own usual for the same runs ----
  const mine = mornings.filter((m) => crewDid(m, crew) && !m.bulk && m.ticks >= 5);
  const byRoute = new Map(); for (const m of mine) { if (!byRoute.has(m.route)) byRoute.set(m.route, []); byRoute.get(m.route).push(m); }
  const usual = new Map(); for (const [route, ms] of byRoute) { const past = ms.filter((m) => m.date < date); if (past.length >= USUAL_MIN) usual.set(route, median(past.map((m) => m.durationMs / 60e3))); }
  const paceOf = (day) => { const ms = day.filter((m) => usual.has(m.route) && !m.bulk && m.ticks >= 5); if (!ms.length) return null;
    const u = ms.reduce((n, m) => n + usual.get(m.route), 0); const a = ms.reduce((n, m) => n + m.durationMs / 60e3, 0);
    return { usualMin: Math.round(u), actualMin: Math.round(a), diffMin: Math.round(u - a), pct: Math.round(((u - a) / u) * 100), runs: ms.map((m) => runName(m.route)) }; };
  const p = paceOf(today);
  const unmeasured = today.filter((m) => m.bulk).map((m) => runName(m.route));
  const pace = p ? { ...p, word: Math.abs(p.pct) <= SAME_PCT ? 'same' : p.pct > 0 ? 'quicker' : 'slower', unmeasured } : { word: 'none', unmeasured, why: today.every((m) => m.bulk) ? 'bulk' : 'new' };
  const days = [...new Set(mine.map((m) => m.date))].sort();
  const trend = days.map((d) => ({ date: d, p: paceOf(mine.filter((m) => m.date === d)) })).filter((x) => x.p).map((x) => ({ date: x.date, pct: x.p.pct })).slice(-TREND_DAYS);

  // ---- quality: ticks made at the letterbox ----
  const pts = new Map(); for (const m of mornings) if (m.date < date && !m.bulk) for (const t of m.list) if (t.lat != null && (t.accuracy_m ?? 0) <= 50) { if (!pts.has(t.address_key)) pts.set(t.address_key, []); pts.get(t.address_key).push(t); }
  let checked = 0; let at = 0; let noGps = 0; let ticksMade = 0;
  for (const m of today) for (const t of m.list) {
    if (!crew.includes(t.user_name)) continue;
    ticksMade += 1;
    if (t.lat == null) { noGps += 1; continue; }
    const seen = pts.get(t.address_key); if (m.bulk || !seen || seen.length < USUAL_MIN || (t.accuracy_m ?? 0) > 50) continue;
    checked += 1; if (metres({ lat: median(seen.map((x) => x.lat)), lng: median(seen.map((x) => x.lng)) }, t) <= AWAY_M) at += 1;
  }
  const quality = { allTicked, done, total, notDelivered, ticks: ticksMade, checked, atPct: checked >= 10 ? Math.round((at / checked) * 100) : null, noGps };

  // ---- what Stan says: one line about the outcome, one about the pace, one about the ticks (keys into js/stanlines.js) ----
  const say = [];
  say.push(outcome.onTime && allTicked && !notDelivered ? 'sum.great' : outcome.onTime ? 'sum.ontime' : 'sum.late');
  if (pace.word === 'quicker') say.push('sum.faster'); else if (pace.word === 'same') say.push('sum.same'); else if (pace.word === 'slower') say.push('sum.slower');
  if (noGps >= 5 && noGps * 10 >= ticksMade) say.push('sum.nogps'); else if (quality.atPct != null && quality.atPct >= 90) say.push('sum.ticks.good'); else if (quality.atPct != null && quality.atPct < 70) say.push('sum.ticks.low');

  const others = crew.filter((n) => n !== name);
  return { name, date, crew, with: others.length ? names(others) : null, outcome, shift, pace, trend, quality, say };
}

/** The pace line in words. */
export function paceText(pace) {
  if (pace.word === 'none') return pace.why === 'bulk' ? 'Couldn’t measure the pace today: the stops were ticked together.' : `No usual to compare with yet. I need ${USUAL_MIN} mornings on a run first.`;
  const on = `for ${names(pace.runs)}`;
  const base = pace.word === 'same' ? `Right on your usual ${on} (${pace.actualMin} min).` : `${Math.abs(pace.diffMin)} min ${pace.word} than your usual ${on}: ${pace.actualMin} min against ${pace.usualMin}.`;
  return pace.unmeasured.length ? `${base} ${names(pace.unmeasured)} not counted (ticked together).` : base;
}
/** The headline: when the last paper went out against the deadline. clock(ms) → '5:48 am'. */
export function outcomeText(o, clock) {
  const what = o.runs.length > 1 ? `All ${o.runs.length} runs` : o.runs[0];
  return o.onTime ? `${what} in by ${clock(o.finishedAt)}, ${o.marginMin} min before the deadline.` : `${what} in by ${clock(o.finishedAt)}, ${-o.marginMin} min after the ${clock(o.deadline)} deadline.`;
}
/** Points for a little line graph of the trend: [{ x, y, pct, date }] in a w × h box, zero line at y0. Higher is quicker. */
export function trendPoints(trend, w = 280, h = 70, pad = 8) {
  if (!trend.length) return { pts: [], y0: h / 2, max: 0 };
  const max = Math.max(10, ...trend.map((t) => Math.abs(t.pct))); const y = (pct) => pad + ((max - pct) / (2 * max)) * (h - 2 * pad);
  const x = (i) => (trend.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (trend.length - 1));
  return { pts: trend.map((t, i) => ({ x: +x(i).toFixed(1), y: +y(t.pct).toFixed(1), pct: t.pct, date: t.date })), y0: +y(0).toFixed(1), max };
}
