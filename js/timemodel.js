// What a morning's order costs in time, learned from ticks (decisions 0064 and 0066), and the report card that says
// whether the learning is good enough to act on. Nothing here suggests an order: it only predicts, and marks itself.
//
// A leg is the time from one tick to the next in the same car. Its cost is what that leg has usually taken on other
// mornings; a leg never driven before is costed from its distance; and the total is scaled by how that crew usually
// compares with the sum of their legs (pauses, walk-ins, a slow start: real time that no single leg explains).

import { metres } from './insights.js';

export const LEG_CAP_S = 600;        // one leg counts for at most this: a 20-minute stop is a break, not a delivery
export const MIN_LEGS = 15;          // a run-morning needs this many legs to be learned from or tested
export const MIN_SEEN = 2;           // times a leg must have been driven on other mornings before its own history is used
export const MAX_SPEED = 25;         // m/s: faster than this between two ticks and they weren't made from the same car
export const TARGET_PCT = 5;         // the gate: the typical miss must be within this (decision 0064)
export const MIN_MORNINGS = 10;      // …over at least this many mornings
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** One run-morning's ticks split by car, in time order: [[tick, …], …]. Two phones in one car stay together; two cars don't. */
export function carTracks(list = []) {
  const ticks = [...list].filter((t) => t.done !== false).sort((a, b) => Date.parse(a.device_time) - Date.parse(b.device_time));
  const tracks = [];
  for (const t of ticks) {
    const at = Date.parse(t.device_time); let home = null;
    if (t.lat != null) {
      for (const tr of tracks) { const last = [...tr].reverse().find((x) => x.lat != null); if (!last) { home ||= tr; continue; }
        const dt = Math.max(1, (at - Date.parse(last.device_time)) / 1000); if (metres(last, t) / dt <= MAX_SPEED) { home = tr; break; } }
    } else home = tracks.find((tr) => tr.some((x) => x.user_name === t.user_name)) || tracks[tracks.length - 1] || null;
    if (home) home.push(t); else tracks.push([t]);
  }
  return tracks;
}
/** The legs of a run-morning: [{ from, to, secs, m }] (m = metres between where the two addresses are usually ticked, or null). */
export function legsOf(list, home) {
  const legs = [];
  for (const tr of carTracks(list)) for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1]; const b = tr[i]; if (a.address_key === b.address_key) continue;
    const secs = (Date.parse(b.device_time) - Date.parse(a.device_time)) / 1000; if (!(secs >= 0)) continue;
    const ha = home?.get(a.address_key); const hb = home?.get(b.address_key);
    legs.push({ from: a.address_key, to: b.address_key, secs, cs: Math.min(secs, LEG_CAP_S), m: ha && hb ? metres(ha, hb) : null });
  }
  return legs;
}
/** Where each address is usually ticked: Map(address_key → { lat, lng }). */
export function homes(ticks = []) {
  const by = new Map();
  for (const t of ticks) if (t.lat != null && (t.accuracy_m ?? 0) <= 50) { if (!by.has(t.address_key)) by.set(t.address_key, []); by.get(t.address_key).push(t); }
  return new Map([...by].map(([k, v]) => [k, { lat: median(v.map((x) => x.lat)), lng: median(v.map((x) => x.lng)) }]));
}
/**
 * mornings: [{ run_id, route, date, list (ticks), bulk }] (from insights.runMornings). crewKind(m) → a label such as
 * "Lisa" or "Lisa+" (with others). Returns the learned material: per-morning legs, leg history, and a distance fit per route.
 */
export function learn(mornings = [], { crewKind = (m) => (m.drivers?.[0] || '?') + ((m.drivers?.length || 0) > 1 ? '+' : ''), skip = () => false } = {}) {
  const home = homes(mornings.flatMap((m) => m.list));
  const used = [];
  for (const m of mornings) {
    if (m.bulk || skip(m.route)) continue;
    const legs = legsOf(m.list, home); const actual = legs.reduce((s, l) => s + l.secs, 0);
    if (legs.length < MIN_LEGS || actual < legs.length * 8 || actual > 4 * 3600) continue;   // too thin, ticked in a rush afterwards, or spread over hours
    used.push({ run_id: m.run_id, route: m.route, date: m.date, kind: crewKind(m), legs, actual });
  }
  const hist = new Map();   // route|from>to → [{ date, cs }]
  const fitAcc = new Map(); // route → sums for a straight-line fit of seconds on metres
  for (const u of used) for (const l of u.legs) {
    const k = `${u.route}|${l.from}>${l.to}`; if (!hist.has(k)) hist.set(k, []); hist.get(k).push({ date: u.date, cs: l.cs });
    const f = fitAcc.get(u.route) || { n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0, all: 0, sum: 0 }; f.all += 1; f.sum += l.cs;
    if (l.m != null) { f.n += 1; f.sx += l.m; f.sy += l.cs; f.sxx += l.m * l.m; f.sxy += l.m * l.cs; } fitAcc.set(u.route, f);
  }
  const fit = new Map([...fitAcc].map(([route, f]) => { const den = f.n * f.sxx - f.sx * f.sx; const ok = f.n >= 20 && den / (f.n * f.n) > 25;   // the legs must differ in length (by more than a few metres) for distance to say anything
    const b = ok ? Math.max(0, (f.n * f.sxy - f.sx * f.sy) / den) : 0; const a = ok ? (f.sy - b * f.sx) / f.n : f.sum / Math.max(1, f.all); return [route, { a, b, mean: f.sum / Math.max(1, f.all) }]; }));
  return { used, hist, fit, home };
}
/** Seconds for one leg, not using anything from `notDate` (so a morning is never predicted from itself). Also says how it was costed. */
export function legCost(model, route, leg, notDate = null) {
  const seen = (model.hist.get(`${route}|${leg.from}>${leg.to}`) || []).filter((s) => s.date !== notDate);
  if (seen.length >= MIN_SEEN) return { secs: mean(seen.map((s) => s.cs)), how: 'seen' };
  const f = model.fit.get(route) || { a: 30, b: 0, mean: 30 };
  return leg.m != null ? { secs: Math.max(5, f.a + f.b * leg.m), how: 'distance' } : { secs: f.mean, how: 'average' };
}
/** The sum of a morning's legs as the model costs them, before the crew's scaling. */
export function rawSeconds(model, u, notDate = null) { let s = 0; let seen = 0; for (const l of u.legs) { const c = legCost(model, u.route, l, notDate); s += c.secs; if (c.how === 'seen') seen += 1; } return { secs: s, coverage: u.legs.length ? seen / u.legs.length : 0 }; }

/**
 * The report card: every usable morning is predicted from all the *other* days and compared with what it took.
 * Returns { n, typicalMissPct, biasPct, within5, within10, within20, byRun, rows, pass }.
 */
export function reportCard(mornings, opts = {}) {
  const model = learn(mornings, opts);
  const raws = model.used.map((u) => ({ u, ...rawSeconds(model, u, u.date) })).map((r) => ({ ...r, ratio: r.u.actual / r.secs }));
  const rows = raws.map((r) => {
    const same = raws.filter((o) => o !== r && o.u.date !== r.u.date && o.u.kind === r.u.kind).map((o) => o.ratio);
    const any = raws.filter((o) => o !== r && o.u.date !== r.u.date).map((o) => o.ratio);
    const scale = same.length >= 2 ? median(same) : any.length ? median(any) : 1;
    const predicted = r.secs * scale;
    return { run_id: r.u.run_id, route: r.u.route, date: r.u.date, kind: r.u.kind, legs: r.u.legs.length, coverage: Math.round(r.coverage * 100), actualMin: Math.round(r.u.actual / 60), predictedMin: Math.round(predicted / 60), errPct: Math.round(((predicted - r.u.actual) / r.u.actual) * 1000) / 10 };
  });
  const abs = rows.map((r) => Math.abs(r.errPct)); const share = (lim) => (rows.length ? Math.round((100 * abs.filter((e) => e <= lim).length) / rows.length) : 0);
  const routes = [...new Set(rows.map((r) => r.route))].sort();
  const typical = rows.length ? Math.round(median(abs) * 10) / 10 : null;
  return { n: rows.length, typicalMissPct: typical, biasPct: rows.length ? Math.round(median(rows.map((r) => r.errPct)) * 10) / 10 : null, within5: share(5), within10: share(10), within20: share(20),
    byRun: routes.map((route) => { const rs = rows.filter((r) => r.route === route); return { route, n: rs.length, typicalMissPct: Math.round(median(rs.map((r) => Math.abs(r.errPct))) * 10) / 10 }; }),
    rows, pass: rows.length >= MIN_MORNINGS && typical != null && typical <= TARGET_PCT };
}
