// Stan's check of a run's addresses before it's driven (decision 0055).
//  - strays: an address sitting on its own in the order, away from the rest of its street (3 Hartles Place, 21 Nov 2026:
//    the other Hartles Place stops were done together and number 3 was 30 stops later, a drive back).
//  - swaps: a unit and house number that look keyed the wrong way round on the sheet ("5/ 7" for unit 7 at number 5).
// It only suggests. Nothing moves or changes unless someone taps.

export const NUMBER_REACH = 10;    // a stray's house number is within this of its street's block
export const MIN_GAP = 2;          // at least this many other stops between the stray and the block
export const NEAR_M = 150;         // where we know both places from past ticks: within this is "the same bit of street"
export const FAR_M = 300;          // …and beyond this it is not a stray, whatever the numbers say

/** "5/ 7" → { unit: '5', n: 7 } · "74C" → { unit: null, n: 74 } · "Shop 2/ 10" → { unit: 'Shop 2', n: 10 } */
export function numOf(number) {
  const s = String(number || '').trim(); const m = /^(.+?)\/\s*(.+)$/.exec(s);
  const base = m ? m[2] : s; const n = parseInt(/\d+/.exec(base)?.[0] ?? '', 10);
  return { unit: m ? m[1].trim() : null, n: Number.isFinite(n) ? n : null };
}
const metres = (a, b) => { const r = Math.PI / 180; const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r); const y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371000; };

/**
 * lines: the run in the order it will be driven, [{ address_key, street, number }].
 * home: Map(address_key → { lat, lng }) where each address is usually ticked, if known.
 * unplaced: Set of address keys the driver's order doesn't have (they were dropped in by a rule, not put there by a person):
 *   for these the house number doesn't have to be close to the block's (26 Marine Parade beside 44–82, lesson L-013).
 * Returns [{ key, street, number, anchorKey, anchorNumber, after, gap }]: put `key` before/after `anchorKey`.
 */
export function findStrays(lines = [], { home, unplaced } = {}) {
  const segs = [];   // runs of the same street, in order
  lines.forEach((l, i) => { const last = segs[segs.length - 1]; if (last && last.street === l.street) { last.to = i; last.items.push(l); } else segs.push({ street: l.street, from: i, to: i, items: [l] }); });
  const out = [];
  for (const s of segs) {
    if (s.items.length !== 1) continue;
    const a = s.items[0]; const an = numOf(a.number).n; if (an == null) continue;
    const blocks = segs.filter((b) => b !== s && b.street === s.street && b.items.length >= 2);
    let best = null;
    for (const b of blocks) {
      const gap = b.from > s.to ? b.from - s.to - 1 : s.from - b.to - 1; if (gap < MIN_GAP) continue;
      const nums = b.items.map((x) => numOf(x.number).n).filter((x) => x != null); if (!nums.length) continue;
      const ha = home?.get(a.address_key); const hb = b.items.map((x) => home?.get(x.address_key)).filter(Boolean);
      const dist = ha && hb.length ? Math.min(...hb.map((p) => metres(ha, p))) : null;
      if (dist != null && dist > FAR_M) continue;                                        // a long road visited twice: leave it
      const byNumber = an >= Math.min(...nums) - NUMBER_REACH && an <= Math.max(...nums) + NUMBER_REACH;
      if (!byNumber && !(dist != null && dist <= NEAR_M) && !unplaced?.has(a.address_key)) continue;
      // beside the house with the nearest number, on the side that keeps the block running the way it runs
      const anchor = b.items.reduce((p, x) => (Math.abs((numOf(x.number).n ?? 1e9) - an) < Math.abs((numOf(p.number).n ?? 1e9) - an) ? x : p));
      const first = numOf(b.items[0].number).n; const last = numOf(b.items[b.items.length - 1].number).n; const rising = (last ?? 0) >= (first ?? 0);
      const after = rising ? an > numOf(anchor.number).n : an < numOf(anchor.number).n;
      if (!best || gap < best.gap) best = { key: a.address_key, street: a.street, number: a.number, anchorKey: anchor.address_key, anchorNumber: anchor.number, after, gap };
    }
    if (best) out.push(best);
  }
  return out;
}

/**
 * Units that look keyed the wrong way round: "u/ n" where nothing else on the street is at number n, but something is at
 * number u ("2/ 5" and "5/ 7" on Cook Street: both are at number 5). Returns [{ key, street, number, suggest }].
 */
export function findSwaps(lines = []) {
  const out = []; const byStreet = new Map();
  for (const l of lines) { if (!byStreet.has(l.street)) byStreet.set(l.street, []); byStreet.get(l.street).push(l); }
  for (const [street, ls] of byStreet) {
    for (const l of ls) {
      const m = /^(\d+)\/\s*(\d+)$/.exec(String(l.number || '').trim()); if (!m) continue;
      const u = Number(m[1]); const n = Number(m[2]); if (u === n) continue;
      const others = ls.filter((x) => x !== l).map((x) => numOf(x.number));
      if (others.some((o) => o.n === n)) continue;                     // number n is a real house here: nothing odd
      if (!others.some((o) => o.n === u && o.unit != null)) continue;   // nobody else has a unit at number u: no reason to think so
      out.push({ key: l.address_key, street, number: l.number, suggest: `${n}/ ${u}` });
    }
  }
  return out;
}

const UNIT_WORDS = /\b(unit|apt|apartment|flat|shop|suite|villa|room|no)\b\.?/gi;
/**
 * The same letterbox keyed two ways on the sheet ("4c/ 12" and "APT 4C/ 12" Selwyn Road, 22 Nov 2026): same street, same
 * house number, and the same unit once words like Apt and Flat are taken off. Returns [{ key, number, intoKey, intoNumber, street }]:
 * `key` is the wordier one, to be shown inside `intoKey`'s tile.
 */
export function findTwins(lines = []) {
  const out = []; const seen = new Map();
  const part = (l) => { const m = /^(.+?)\/\s*(.+)$/.exec(String(l.number || '').trim()); if (!m) return null; const u = m[1].replace(UNIT_WORDS, '').replace(/[^a-z0-9]/gi, '').toUpperCase(); const b = m[2].replace(/\s+/g, '').toUpperCase(); return u ? `${l.street}|${b}|${u}` : null; };
  for (const l of lines) {
    const k = part(l); if (!k) continue; const first = seen.get(k);
    if (!first) { seen.set(k, l); continue; } if (first.address_key === l.address_key) continue;
    const [into, twin] = String(first.number).length <= String(l.number).length ? [first, l] : [l, first];
    out.push({ key: twin.address_key, number: twin.number, intoKey: into.address_key, intoNumber: into.number, street: l.street });
  }
  return out;
}
