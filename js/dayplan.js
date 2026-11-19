// Stan's day plan (decision 0040): who takes which runs, in what order, and when they need to start,
// worked out from how long each run has really taken and who is working.
// Pure: history and a crew list in, a plan out. Dispatch builds and sends it; the app shows each person theirs.
//
// A crew is one vehicle: a driver, with or without helpers. Helpers ride along, fold and bag on the way,
// and cover the passenger side, so a helped driver leaves the depot sooner (Mike, 19 Nov 2026).

import { metres } from './insights.js';

export const PREP_S_PER_PAPER = 16;  // a driver on their own folds and bags before leaving: about 30 min for Run 6's 112 papers (Mike, 19 Nov 2026)
export const LOAD_MIN = 5;           // loading the vehicle when a helper does the folding on the way
export const BUFFER_MIN = 10;        // aim to finish this long before the deadline
const KMH = 30;                      // for a hop between runs we have never timed
const NZ = 'Pacific/Auckland';
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const shortRun = (r) => { const m = /(\d+)$/.exec(r || ''); return m ? `Run ${+m[1]}` : r || 'Run'; };
export const clockTime = (t) => new Intl.DateTimeFormat('en-NZ', { timeZone: NZ, hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(/\s/g, ' ');

/**
 * What history says about each run. mornings: from insights.runMornings (each with route, date, ticks, durationMs,
 * drivers, bulk, first, last, list of ticks). Returns { routes: { ROUTE: { minutes, stops, mornings, bulk, byDriver, start, end } }, hops: { 'A>B': minutes } }
 */
export function runStats(mornings) {
  const routes = {}; const byRoute = new Map(); const byDay = new Map();
  for (const m of mornings) {
    if (!(m.ticks >= 5)) continue;
    if (!byRoute.has(m.route)) byRoute.set(m.route, []); byRoute.get(m.route).push(m);
    if (!byDay.has(m.date)) byDay.set(m.date, []); byDay.get(m.date).push(m);
  }
  const pt = (t) => (t && t.lat != null ? { lat: t.lat, lng: t.lng } : null);
  for (const [route, ms] of byRoute) {
    const who = new Map();
    for (const m of ms) { const counts = new Map(); for (const t of m.list) counts.set(t.user_name, (counts.get(t.user_name) || 0) + 1); const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]; if (top && top[1] > m.ticks / 2) { if (!who.has(top[0])) who.set(top[0], []); who.get(top[0]).push(m.durationMs / 60e3); } }
    const first = ms.map((m) => pt(m.list.find((t) => t.lat != null))).filter(Boolean); const last = ms.map((m) => pt([...m.list].reverse().find((t) => t.lat != null))).filter(Boolean);
    const mid = (ps) => (ps.length ? { lat: median(ps.map((p) => p.lat)), lng: median(ps.map((p) => p.lng)) } : null);
    routes[route] = { minutes: Math.round(median(ms.map((m) => m.durationMs / 60e3))), stops: Math.round(median(ms.map((m) => m.ticks))), mornings: ms.length, bulk: ms.filter((m) => m.bulk).length > ms.length / 2,
      byDriver: Object.fromEntries([...who.entries()].filter(([, v]) => v.length >= 3).map(([n, v]) => [n, { minutes: Math.round(median(v)), mornings: v.length }])), start: mid(first), end: mid(last) };
  }
  // hops we have actually driven: one run's last tick to the next run's first, same morning, under half an hour
  const gaps = new Map();
  for (const ms of byDay.values()) {
    const s = ms.filter((m) => !ms.some((o) => o !== m && o.first <= m.first && o.last >= m.last)).sort((a, b) => a.first - b.first);
    for (let i = 0; i < s.length - 1; i++) { const g = (s[i + 1].first - s[i].last) / 60e3; if (g > 0 && g < 30 && s[i].drivers.some((d) => s[i + 1].drivers.includes(d))) { const k = `${s[i].route}>${s[i + 1].route}`; if (!gaps.has(k)) gaps.set(k, []); gaps.get(k).push(g); } }
  }
  const hops = {}; for (const [k, v] of gaps) if (v.length >= 2) hops[k] = Math.round(median(v));
  // a run that is dropped off part-way through another (the village inside Run 10): it rides along, it doesn't add time
  for (const [route, ms] of byRoute) {
    const hosts = new Map();
    for (const m of ms) for (const o of byDay.get(m.date)) if (o !== m && o.first <= m.first && o.last >= m.last) hosts.set(o.route, (hosts.get(o.route) || 0) + 1);
    const top = [...hosts.entries()].sort((x, y) => y[1] - x[1])[0];
    if (top && top[1] >= 2 && top[1] * 2 > ms.length) routes[route].inside = top[0];
  }
  return { routes, hops };
}

/** Minutes to get from one run to the next (or from the depot when `from` is null): timed if we have it, else by distance. */
export function hopMinutes(stats, from, to, depot = null) {
  if (from && stats.hops[`${from}>${to}`] != null) return stats.hops[`${from}>${to}`];
  const a = from ? stats.routes[from]?.end : depot; const b = stats.routes[to]?.start;
  if (!a || !b) return from ? 5 : 3;
  return Math.max(1, Math.round((metres(a, b) * 1.3) / 1000 / KMH * 60) + (from ? 2 : 1));
}

const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

/** The best order for one crew's runs: least driving between them, starting from the depot; ties go to the usual order. */
export function bestOrder(routes, stats, depot, usual = []) {
  if (!routes.length) return { order: [], travel: 0 };
  const rank = (r) => { const i = usual.indexOf(r); return i < 0 ? 99 : i; };
  let best = null;
  for (const p of perms(routes)) {
    let travel = 0; p.forEach((r, i) => { travel += hopMinutes(stats, i ? p[i - 1] : null, r, depot); });
    const tie = p.reduce((s, r, i) => s + Math.abs(rank(r) - i), 0);
    if (!best || travel < best.travel || (travel === best.travel && tie < best.tie)) best = { order: p, travel, tie };
  }
  return { order: best.order, travel: best.travel };
}

/**
 * The plan. runs: [{ route, stops? }] for the day · crews: [{ driver, helpers: [] }] · deadline: ms · depot: { lat, lng } | null
 * usual: the usual order of routes. Returns { crews: [...], assumptions: [...] }, each crew with its runs in order and the
 * times working back from the deadline: depotAt, firstPaperAt, each run's startAt and finishAt, finishAt.
 */
export function buildPlan({ runs = [], crews = [], stats, deadline, depot = null, usual = [] }) {
  const routes = runs.map((r) => r.route); const info = Object.fromEntries(runs.map((r) => [r.route, r]));
  const active = crews.filter((c) => c.driver);
  if (!active.length || !routes.length) return { crews: [], assumptions: [], unknown: [] };
  const unknown = routes.filter((r) => !stats.routes[r]);
  // runs dropped off inside another run go wherever their host goes, and add no time of their own
  const hostOf = (r) => { const x = stats.routes[r]?.inside; return x && routes.includes(x) ? x : null; };
  const riders = routes.filter(hostOf); const main = routes.filter((r) => !hostOf(r));
  const minutesFor = (route, driver) => stats.routes[route]?.byDriver?.[driver]?.minutes ?? stats.routes[route]?.minutes ?? Math.round(((info[route]?.stops || 30) * 45) / 60);
  const stopsOf = (route) => info[route]?.stops || stats.routes[route]?.stops || 0;
  const prepFor = (c, rs0) => { const rs = [...rs0, ...riders.filter((r) => rs0.includes(hostOf(r)))]; return c.helpers?.length ? LOAD_MIN : Math.round(rs.filter((r) => !stats.routes[r]?.bulk).reduce((n, r) => n + stopsOf(r), 0) * PREP_S_PER_PAPER / 60); };
  const cost = (c, rs) => { const o = bestOrder(rs, stats, depot, usual); return { ...o, road: rs.reduce((n, r) => n + minutesFor(r, c.driver), 0), prep: prepFor(c, rs) }; };
  // every way of sharing the runs out between the crews; keep the one whose longest shift is shortest
  let best = null; const n = active.length; const total = n ** main.length;
  for (let code = 0; code < total; code++) {
    const share = active.map(() => []); let x = code;
    for (const r of main) { share[x % n].push(r); x = Math.floor(x / n); }
    if (n > 1 && share.some((s) => !s.length)) continue;
    const costs = share.map((rs, i) => cost(active[i], rs));
    const shifts = costs.map((k) => k.road + k.travel + k.prep);
    const score = [Math.max(...shifts), costs.reduce((s, k) => s + k.travel, 0), shifts.reduce((a, b) => a + b, 0)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { share, costs, score };
  }
  const out = active.map((c, i) => {
    const k = best.costs[i]; const finishAt = deadline - BUFFER_MIN * 60e3; const list = [];
    let t = finishAt;
    for (let j = k.order.length - 1; j >= 0; j--) {
      const r = k.order[j]; const mins = minutesFor(r, c.driver); const hop = hopMinutes(stats, j ? k.order[j - 1] : null, r, depot);
      list.unshift({ route: r, name: shortRun(r), startAt: t - mins * 60e3, finishAt: t, minutes: mins, hopMin: hop, stops: stopsOf(r), own: !!stats.routes[r]?.byDriver?.[c.driver] });
      t -= (mins + hop) * 60e3;
    }
    for (const r of riders) { const i = list.findIndex((x) => x.route === hostOf(r)); if (i >= 0) list.splice(i + 1, 0, { route: r, name: shortRun(r), during: hostOf(r), duringName: shortRun(hostOf(r)), startAt: list[i].startAt, finishAt: list[i].finishAt, minutes: 0, hopMin: 0, stops: stopsOf(r), own: false }); }
    const firstPaperAt = list.length ? list[0].startAt : finishAt;
    return { driver: c.driver, helpers: c.helpers || [], runs: list, prepMin: k.prep, roadMin: k.road, travelMin: k.travel, depotAt: t - k.prep * 60e3, leaveDepotAt: t, firstPaperAt, finishAt, shiftMin: k.road + k.travel + k.prep };
  });
  const solo = out.filter((c) => !c.helpers.length);
  const assumptions = [
    `Aims to finish ${BUFFER_MIN} minutes before the deadline.`,
    'Run times are the middle of what each run has actually taken (the driver’s own mornings where there are three or more).',
    ...(solo.length ? [`${solo.map((c) => c.driver).join(' and ')} on their own: folding and bagging at the depot is taken as ${PREP_S_PER_PAPER} seconds a paper (Mike’s figure of about 30 minutes for Run 6), until there are enough labelled shifts to measure it.`] : []),
    ...(out.some((c) => c.helpers.length) ? [`With a helper folding on the way, ${LOAD_MIN} minutes is allowed at the depot to load. No time is taken off the run itself for the helper yet: that will be measured.`] : []),
    ...(riders.length ? [riders.map((r) => `${shortRun(r)} is dropped off part-way through ${shortRun(hostOf(r))}, as it usually is, so it adds no time of its own.`).join(' ')] : []),
    ...(unknown.length ? [`No history yet for ${unknown.map(shortRun).join(', ')}: guessed at 45 seconds a stop.`] : []),
  ];
  return { crews: out, assumptions, unknown };
}

/** The plan in words, for the pop-up and for copying into a message. */
export function planText(plan, { date, deadline }) {
  const day = new Intl.DateTimeFormat('en-NZ', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  return [`Plan for ${day} (deadline ${clockTime(deadline)})`, ...plan.crews.map((c) => `${c.driver}${c.helpers.length ? ` with ${c.helpers.join(' and ')}` : ' on their own'}: at the depot by ${clockTime(c.depotAt)}, first paper by ${clockTime(c.firstPaperAt)}. ${c.runs.map((r) => (r.during ? `${r.name} on the way through ${r.duringName}` : `${r.name} ${clockTime(r.startAt)}–${clockTime(r.finishAt)}`)).join(', ')}.`)].join('\n');
}

/** What one person needs to know from a saved plan: their crew, or null if they're not in it. */
export function myPart(saved, name) {
  const c = (saved?.crews || []).find((x) => x.driver === name || (x.helpers || []).includes(name));
  return c ? { ...c, role: c.driver === name ? 'driver' : 'helper' } : null;
}
