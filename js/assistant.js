// Driver Assistant: voice-first guidance to the next stop (docs/decisions/0019-driver-assistant.md).
//
// Pure functions (tested in test/assistant.mjs) plus a small engine the run screen drives:
// give it the next stop and every GPS fix; it says what to show and what to speak.
//
// Two modes:
//   route    turn-by-turn from OpenRouteService (through our `route` server function),
//            e.g. "In 200 metres, turn left onto Masefield Avenue".
//   bearing  no route available (not set up yet, offline, or a short hop): an arrow and
//            the distance straight to the stop, from the direction you're moving.
// Either way it announces the arrival, which side the letterbox is on, and the sheet's notes.
// It never ticks anything: the tick is the proof of delivery.

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Metres between two { lat, lng }. */
export function distance(a, b) {
  const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b, 0–360 (0 = north). */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Angle from the way you're heading to the target, -180..180 (negative = to your left). */
export const relativeAngle = (course, target) => ((target - course + 540) % 360) - 180;

// Local flat x/y in metres around a point (fine over a few kilometres).
const flat = (o, p) => ({ x: rad(p.lng - o.lng) * R * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * R });

/** Which side of a road going from `from` to `to` the point is on: 'left' or 'right'. */
export function sideOf(from, to, point) {
  const d = flat(from, to); const q = flat(from, point);
  return d.x * q.y - d.y * q.x > 0 ? 'left' : 'right';
}

/** Shortest distance in metres from p to a line through [[lat,lng], ...]. */
export function distToLine(p, coords) {
  if (!coords?.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0], lng: coords[i][1] }; const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const B = flat(a, b); const P = flat(a, p);
    const len = B.x * B.x + B.y * B.y;
    const t = len ? Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len)) : 0;
    best = Math.min(best, Math.hypot(P.x - t * B.x, P.y - t * B.y));
  }
  return coords.length === 1 ? distance(p, { lat: coords[0][0], lng: coords[0][1] }) : best;
}

/** Index i of the stretch [i, i+1] of the line nearest p. */
function nearestSegment(p, coords) {
  let best = 0; let bd = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distToLine(p, [coords[i], coords[i + 1]]);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Index of the line point nearest p. */
function nearestIndex(p, coords) {
  let best = 0; let bd = Infinity;
  coords.forEach(([lat, lng], i) => { const d = distance(p, { lat, lng }); if (d < bd) { bd = d; best = i; } });
  return best;
}

// OpenRouteService step types (https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/instruction-types)
const TURN = { 0: -90, 1: 90, 2: -135, 3: 135, 4: -45, 5: 45, 6: 0, 7: 'roundabout', 8: 'roundabout', 9: 180, 10: 'goal', 11: 0, 12: -20, 13: 20 };

/** ORS GeoJSON directions → { coords: [[lat,lng]], steps: [{ type, angle, text, name, at: {lat,lng}, from }], distance }. */
export function parseOrs(geo) {
  const f = geo?.features?.[0];
  if (!f) return null;
  const coords = f.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const steps = (f.properties.segments || []).flatMap((s) => s.steps || []).map((st) => {
    const [lat, lng] = coords[st.way_points[0]] || coords[0];
    return { type: st.type, angle: TURN[st.type] ?? 0, text: tidy(st.instruction), name: st.name && st.name !== '-' ? st.name : '', at: { lat, lng }, from: st.way_points[0], distance: st.distance };
  });
  return { coords, steps, distance: f.properties.summary?.distance ?? 0 };
}
const tidy = (s) => String(s || '').replace(/\s+/g, ' ').replace(/ onto -$/, '').trim();

/** Distances read out loud, rounded the way people say them. */
export function sayDistance(m) {
  if (m >= 950) return `${(Math.round(m / 100) / 10).toString().replace(/\.0$/, '')} kilometres`;
  if (m >= 300) return `${Math.round(m / 100) * 100} metres`;
  if (m >= 30) return `${Math.round(m / 50) * 50 || 50} metres`;
  return 'a few metres';
}
/** Distances on screen. */
export const showDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m >= 100 ? `${Math.round(m / 10) * 10} m` : `${Math.max(0, Math.round(m))} m`);

// When to speak, in metres before a turn: earlier when moving faster.
const PRE_TURN = 220;
const nowTurn = (speed) => Math.max(35, (speed || 0) * 5);
export const ARRIVE_M = 40;     // "Arriving"
const CLOSE_M = 120;            // switch the display to the stop itself
const OFF_ROUTE_M = 50;         // this far from the route twice running = work out a new one
const REROUTE_GAP_MS = 15000;

/**
 * The engine. `stop` = { key, label, at: {lat,lng} | null, notes: [..] }.
 * update(fix) returns { view, say[] }: what to show and anything to speak now.
 */
export class Guide {
  constructor({ route } = {}) {
    this.route = route || (async () => null); // async (from, to) => parsed route or null
    this.leg = null;
    this.course = null;
    this.prev = null;
  }

  setStop(stop) {
    if ((this.leg?.stop.key ?? null) === (stop?.key ?? null)) { if (this.leg && stop) this.leg.stop = stop; return; } // same stop (key includes its position)
    this.leg = stop ? { stop, route: null, routing: false, routedAt: 0, said: new Set(), off: 0, startedAt: Date.now() } : null;
  }

  /** Lines this leg will probably say, so Stan's voice can get them ready before they're needed. */
  likelyLines() {
    const L = this.leg; if (!L) return [];
    const s = L.stop; const name = s.spoken || s.label;
    const notes = s.notes?.length ? ` ${s.notes.join('. ')}.` : '';
    return [`Next stop, ${name}.`, ...['', ', on your left', ', on your right'].map((side) => `Arriving. ${name}${side}.${notes}`),
      ...(L.route?.steps || []).slice(0, 6).map((st) => `${st.text}.`)];
  }

  courseFrom(fix) {
    if (fix.heading != null && (fix.speed ?? 0) > 2) this.course = fix.heading;
    else if (this.prev && distance(this.prev, fix) > 8) this.course = bearing(this.prev, fix);
    if (!this.prev || distance(this.prev, fix) > 8) this.prev = fix;
    return this.course;
  }

  async maybeRoute(fix) {
    const L = this.leg;
    if (!L?.stop.at || L.routing || Date.now() - L.routedAt < REROUTE_GAP_MS) return;
    if (distance(fix, L.stop.at) < CLOSE_M * 1.5) return; // close enough to just point at it
    L.routing = true; L.routedAt = Date.now();
    try { const r = await this.route(fix, L.stop.at); if (this.leg === L) { L.route = r; L.off = 0; } } catch { /* stay in bearing mode */ }
    L.routing = false;
  }

  update(fix) {
    const L = this.leg;
    const say = [];
    if (!L) return { view: { mode: 'none' }, say };
    const course = this.courseFrom(fix);
    const s = L.stop;
    if (!s.at) {
      if (!L.said.has('leg')) { L.said.add('leg'); say.push(`Next stop, ${s.spoken || s.label}.`); }
      return { view: { mode: 'nopos', label: s.label, notes: s.notes }, say };
    }
    const dDest = distance(fix, s.at);
    if (L.route && distToLine(fix, L.route.coords) > OFF_ROUTE_M) { L.off += 1; if (L.off >= 2) L.route = null; } else L.off = 0;
    if (!L.route) this.maybeRoute(fix);
    const side = this.sideFor(fix, course);

    // Arriving: once, with the side and the notes.
    if (dDest <= ARRIVE_M && !L.said.has('arrive')) {
      L.said.add('arrive');
      say.push(`Arriving. ${s.spoken || s.label}${side ? `, on your ${side}` : ''}.${s.notes.length ? ` ${s.notes.join('. ')}.` : ''}`);
    }
    // Next turn on the route, if any before the stop.
    const step = L.route ? this.nextStep(fix, L.route) : null;
    const dStep = step ? distance(fix, step.at) : Infinity;
    // Give the route a moment to arrive so the first announcement can name the first turn.
    const waiting = !L.route && L.routing && Date.now() - L.startedAt < 2500;
    if (!L.said.has('leg') && !waiting) {
      L.said.add('leg');
      const first = step && dStep < 600 ? ` ${dStep > 60 ? `In ${sayDistance(dStep)}, ` : ''}${lower(step.text)}.` : dDest > ARRIVE_M ? ` ${sayDistance(dDest)}.` : '';
      say.unshift(`Next stop, ${s.spoken || s.label}.${first}`);
      if (step && dStep <= PRE_TURN) L.said.add(`pre${step.from}`);
      if (step && dStep <= nowTurn(fix.speed)) L.said.add(`now${step.from}`);
    } else if (step) {
      if (dStep <= nowTurn(fix.speed) && !L.said.has(`now${step.from}`)) { L.said.add(`now${step.from}`); L.said.add(`pre${step.from}`); say.push(`${step.text}.`); }
      else if (dStep <= PRE_TURN && dStep > nowTurn(fix.speed) + 40 && !L.said.has(`pre${step.from}`)) { L.said.add(`pre${step.from}`); say.push(`In ${sayDistance(dStep)}, ${lower(step.text)}.`); }
    }

    // What to show: the next turn while it's further than the stop is close, otherwise the stop.
    const towards = step && dDest > CLOSE_M ? step.at : s.at;
    const angle = step && dDest > CLOSE_M && typeof step.angle === 'number' ? step.angle
      : course != null ? relativeAngle(course, bearing(fix, towards)) : null;
    return {
      view: {
        mode: step && dDest > CLOSE_M ? 'turn' : 'stop',
        angle, roundabout: step?.angle === 'roundabout' && dDest > CLOSE_M,
        distance: step && dDest > CLOSE_M ? dStep : dDest,
        text: step && dDest > CLOSE_M ? step.text : dDest <= ARRIVE_M ? `Arriving: ${s.label}` : s.label,
        label: s.label, side, notes: s.notes, routed: !!L.route, arrived: dDest <= ARRIVE_M,
      },
      say,
    };
  }

  // Next manoeuvre ahead of where we are (skips the start and the arrival).
  nextStep(fix, route) {
    const here = nearestSegment(fix, route.coords); // we're between point `here` and the one after

    return route.steps.find((st) => st.from > here && st.type !== 10 && st.type !== 11) || null;
  }

  // Which side the stop is on: from the end of the route, or the way you're moving when close.
  sideFor(fix, course) {
    const L = this.leg; const at = L.stop.at;
    const c = L.route?.coords;
    if (c?.length >= 2) {
      const i = nearestIndex(at, c); const a = c[Math.max(0, i - 1)]; const b = c[Math.min(c.length - 1, Math.max(1, i))];
      if (a !== b) return sideOf({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }, at);
    }
    if (course == null || distance(fix, at) > CLOSE_M) return null;
    const rel = relativeAngle(course, bearing(fix, at));
    return Math.abs(rel) < 15 || Math.abs(rel) > 165 ? null : rel < 0 ? 'left' : 'right';
  }
}
const lower = (t) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/** What to say about a stop on arrival, from the sheet: notes, stops, bank, papers. */
export function stopNotes(lines, { bankNote } = {}) {
  const out = [];
  const parts = lines.flatMap((l) => l.parts?.length ? l.parts : [{ pub: l.pub, qty: l.qty }]);
  const nzhOnly = parts.every((p) => p.pub === 'NZH');
  const total = parts.reduce((n, p) => n + (p.qty || 0), 0);
  if (!nzhOnly) out.push(parts.map((p) => `${p.qty} ${PUB_SPOKEN[p.pub] || p.pub}`).join(' and '));
  else if (total > 1) out.push(`${total} papers`);
  for (const l of lines) {
    for (const f of l.flags || []) if ((f.type === 'stop' && f.until !== undefined) || f.type === 'complaint') out.push(f.text.replace(/^Complaint:\s*/, 'Complaint: '));
    if (l.note) out.push(l.note);
  }
  if (bankNote) out.push(bankNote);
  return [...new Set(out)];
}
const PUB_SPOKEN = { NZH: 'Herald', NZHR: 'Herald, retail', WD: "Woman's Day", LIS: 'Listener' };
