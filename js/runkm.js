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
 * for every track. through(points) → metres. Returns { line_km, road_km | null, points } or null if nothing was driven.
 */
export async function runDistance(ticks, through) {
  const tracks = tickTracks(ticks).filter((t) => t.length >= 2); if (!tracks.length) return null;
  const line = +tracks.reduce((n, t) => n + lineKm(t), 0).toFixed(2); let road = 0;
  for (const t of tracks) { const km = road == null ? null : await routeKm(t, through).catch(() => null); road = km == null ? null : +(road + km).toFixed(2); }
  return { line_km: line, road_km: road, points: tracks.reduce((n, t) => n + t.length, 0) };
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
 * Driving kilometres along a path. through(points) → metres, or throws. Returns null if any piece fails, or if the
 * answer is not believable (shorter than the straight line, or more than three times it).
 */
export async function routeKm(path, through) {
  const pts = thin(path); if (pts.length < 2) return null;
  let m = 0;
  for (const piece of chunks(pts)) { const d = await through(piece); if (typeof d !== 'number' || !Number.isFinite(d)) return null; m += d; }
  const km = +(m / 1000).toFixed(2); const line = lineKm(pts);
  return km >= line * 0.98 && km <= Math.max(line * 3, line + 2) ? km : null;
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
