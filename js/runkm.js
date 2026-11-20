// Kilometres on a run (decision 0045): worked out from where the ticks were made, in the order they were made.
// Pure, apart from routeKm, which is handed the function that asks the mapping service.

import { metres } from './insights.js';

export const SAME_SPOT_M = 15;     // ticks this close together are one stop (a block of flats, a row of boxes)
export const MAX_POINTS = 240;     // the most points we route for one run
export const CHUNK = 40;           // points per request to the mapping service (it takes up to 50)
export const MAX_SPEED = 25;        // metres a second (90 km/h): faster than this between two ticks and they weren't made from the same car
export const ROAD_FACTOR = 1.3;    // roads are about this much longer than straight lines between letterboxes, when we can't route

/**
 * The tracks a run took: its delivered ticks with a good location, in time order, split by vehicle.
 * Two cars working one run tick in turn from different places; read as one path that zig-zags between them and adds
 * kilometres nobody drove (found in the back-fill, 21 Nov 2026: 64 km for an 18 km run). So each tick joins the track it
 * could have been driven to from that track's last tick, or starts a new one. A lone stray point drives nowhere.
 * Ticks at the same spot are merged. Returns [[{ lat, lng }, ...], ...].
 */
export function tickTracks(ticks = []) {
  const good = ticks.filter((t) => t.done && t.method !== 'paper' && t.lat != null && t.lng != null && (t.accuracy_m ?? 0) <= 50)
    .map((t) => ({ lat: t.lat, lng: t.lng, ms: Date.parse(t.device_time) })).sort((a, b) => a.ms - b.ms);
  const tracks = [];
  for (const p of good) {
    let best = null;
    for (const tr of tracks) { const d = metres(tr.last, p); if (d <= 60 + MAX_SPEED * Math.max(0, (p.ms - tr.last.ms) / 1000) && (!best || d < best.d)) best = { tr, d }; }
    if (!best) { tracks.push({ pts: [{ lat: p.lat, lng: p.lng }], last: p }); continue; }
    if (best.d > SAME_SPOT_M) best.tr.pts.push({ lat: p.lat, lng: p.lng });
    best.tr.last = best.d > SAME_SPOT_M ? p : { ...best.tr.last, ms: p.ms };
  }
  return tracks.map((t) => t.pts);
}
/** One car's path (the longest track): kept for when a single path is wanted. */
export function tickPath(ticks = []) { return tickTracks(ticks).sort((a, b) => b.length - a.length)[0] || []; }
/**
 * A run's kilometres: every track's straight-line distance added up, and the same along the roads if the map answers
 * for every track, with the road it took (trace: one line per vehicle) when the map hands that back.
 * Returns { line_km, road_km | null, points, trace | null } or null if nothing was driven.
 */
export async function runDistance(ticks, through) {
  const tracks = tickTracks(ticks).filter((t) => t.length >= 2); if (!tracks.length) return null;
  const line = +tracks.reduce((n, t) => n + lineKm(t), 0).toFixed(2); let road = 0; let trace = [];
  for (const t of tracks) {
    const r = road == null ? { km: null, line: null } : await routeTrack(t, through).catch(() => ({ km: null, line: null }));
    road = r.km == null ? null : +(road + r.km).toFixed(2);
    if (trace && r.line) trace.push(r.line); else trace = null;
  }
  return { line_km: line, road_km: road, points: tracks.reduce((n, t) => n + t.length, 0), trace: road == null ? null : trace };
}
/** Straight-line kilometres along a path. */
export const lineKm = (path) => +(path.slice(1).reduce((n, p, i) => n + metres(path[i], p), 0) / 1000).toFixed(2);

/** If there are too many points to route, keep every nth so the first and last stay. */
export function thin(path, max = MAX_POINTS) {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)]);
}
/** Split a path into pieces for the mapping service; each piece starts where the last one ended. */
export function chunks(path, size = CHUNK) {
  const out = [];
  for (let i = 0; i < path.length - 1; i += size - 1) out.push(path.slice(i, i + size));
  return out;
}
/**
 * One track driven along the roads. through(points) → metres, or { metres, line: [[lng, lat], ...] } when the map also
 * hands back the road it took. Returns { km, line } where line is [[lat, lng], ...] (or null if the map gave none);
 * km is null if any piece fails or the answer is not believable (shorter than the straight line, or over three times it).
 */
export async function routeTrack(path, through) {
  const pts = thin(path); if (pts.length < 2) return { km: null, line: null };
  let m = 0; let line = [];
  for (const piece of chunks(pts)) {
    const d = await through(piece); const metresHere = typeof d === 'number' ? d : d?.metres;
    if (typeof metresHere !== 'number' || !Number.isFinite(metresHere)) return { km: null, line: null };
    m += metresHere;
    if (line && Array.isArray(d?.line) && d.line.length >= 2) line.push(...d.line.map(([lng, lat]) => [lat, lng])); else line = null;
  }
  const km = +(m / 1000).toFixed(2); const straight = lineKm(pts);
  if (!(km >= straight * 0.98 && km <= Math.max(straight * 3, straight + 2))) return { km: null, line: null };
  return { km, line: line ? simplify(line) : null };
}
export async function routeKm(path, through) { return (await routeTrack(path, through)).km; }

const toXY = (p, lat0) => [(p[1]) * 111320 * Math.cos((lat0 * Math.PI) / 180), p[0] * 110540];
/** Thins a road line to the points that give it its shape (within tol metres), and rounds them, so it is small to keep. */
export function simplify(line, tol = 4) {
  if (line.length <= 2) return line.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
  const lat0 = line[0][0]; const xy = line.map((p) => toXY(p, lat0)); const keep = new Uint8Array(line.length); keep[0] = 1; keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let far = -1; let best = tol;
    const [ax, ay] = xy[a]; const [bx, by] = xy[b]; const dx = bx - ax; const dy = by - ay; const len2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) { const [px, py] = xy[i]; const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0; const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); if (d > best) { best = d; far = i; } }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return line.filter((_, i) => keep[i]).map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)]);
}
/**
 * Where a traced run goes over the same road more than once. trace: [[[lat, lng], ...], ...] (one line per vehicle).
 * The lines are walked in steps of about 15 m on a 20 m grid; a step along a stretch already walked (either way) is
 * doubled back. Each vehicle is judged against its own path. Returns { metres, totalMetres, pieces: [[[lat, lng], ...], ...] } with the doubled stretches to draw.
 */
export function doubledBack(trace = [], step = 15, cell = 20) {
  const pieces = []; let metresBack = 0; let total = 0;
  for (const line of trace || []) {
    if (!line || line.length < 2) continue;
    const seen = new Set();   // each vehicle against its own path: two cars sharing a street is not doubling back
    const lat0 = line[0][0]; const pts = [];
    for (let i = 1; i < line.length; i++) { const a = line[i - 1]; const b = line[i]; const d = metres({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }); const n = Math.max(1, Math.round(d / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); }
    const key = (p) => { const [x, y] = toXY(p, lat0); return `${Math.round(x / cell)},${Math.round(y / cell)}`; };
    let cur = null; let prevKey = key(pts[0]); let acc = 0; let from = pts[0];
    for (let i = 1; i < pts.length; i++) {
      const k = key(pts[i]); const d = metres({ lat: pts[i - 1][0], lng: pts[i - 1][1] }, { lat: pts[i][0], lng: pts[i][1] }); total += d; acc += d;
      if (k === prevKey) continue;
      const edge = prevKey < k ? `${prevKey}|${k}` : `${k}|${prevKey}`;
      if (seen.has(edge)) { metresBack += acc; if (!cur) { cur = [from]; pieces.push(cur); } cur.push(pts[i]); } else { seen.add(edge); cur = null; }
      prevKey = k; acc = 0; from = pts[i];
    }
  }
  return { metres: Math.round(metresBack), totalMetres: Math.round(total), pieces: pieces.filter((p) => p.length >= 2).map((p) => p.map(([a, b]) => [+a.toFixed(5), +b.toFixed(5)])) };
}
/** The number to show for a run or a morning: routed if we have it, otherwise the straight line stretched to roads. */
export function bestKm(rows = []) {
  if (!rows.length) return null;
  const routed = rows.every((r) => r.road_km != null);
  const km = rows.reduce((n, r) => n + Number(r.road_km ?? r.line_km * ROAD_FACTOR), 0);
  return { km: Math.round(km * 10) / 10, routed, runs: rows.length };
}
/** Kilometres on the clock between two odometer readings, if they make sense. */
export function clockKm(start, end) {
  if (start == null || end == null) return null;
  const d = end - start;
  return d > 0 && d < 600 ? d : null;
}
