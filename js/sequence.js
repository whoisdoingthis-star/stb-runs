// Custom delivery order for a route.
//
// The order is a list of address keys for the route. It carries forward: when
// tomorrow's sheet for the same route is opened, addresses are shown in this
// order. An address the list doesn't know goes where the usual order has it
// (someone's own order made while the address was off the sheet: 26 Marine
// Parade, 23 Nov 2026, lesson L-013); one that is new to both stays next to
// the address it follows on the sheet.

/** Lines in custom order. `lines` must be in sheet order and carry address_key. `usual` = the usual order's keys, if `keys` is someone's own. */
export function applySequence(lines, keys, usual = null) {
  if (!keys || !keys.length) return lines;
  const pos = new Map(keys.map((k, i) => [k, i]));
  // Where the usual order puts an address this order doesn't have. Its own street wins (22 Marine Parade, 28 Nov 2026,
  // lesson L-016): the usual order's neighbour before it may be on another street that this order drives at another time.
  const viaUsual = new Map();
  if (usual?.length) {
    const known = usual.map((k) => (pos.has(k) ? pos.get(k) : null));
    for (let i = 0; i < usual.length; i++) {
      const k = usual[i]; if (known[i] !== null || viaUsual.has(k)) continue;
      viaUsual.set(k, placeFor(k, i, usual, known, keys, pos));
    }
  }
  let anchor = -1;
  const sortKeys = lines.map((l, i) => {
    const p = pos.get(l.address_key);
    if (p !== undefined) { anchor = p; return [p, 0, i]; }
    if (viaUsual.has(l.address_key)) return [viaUsual.get(l.address_key), 1, i]; // its place in the usual order
    return [anchor, 2, i]; // unknown to both: right after the previous known sheet address
  });
  return lines
    .map((l, i) => [sortKeys[i], l])
    .sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1] || a[0][2] - b[0][2])
    .map((x) => x[1]);
}

/** Move `moving` keys (keeping their own order) before or after `anchor`. */
export function moveKeys(order, moving, anchor, after) {
  const m = new Set(moving);
  if (m.has(anchor)) return order;
  const rest = order.filter((k) => !m.has(k));
  let i = rest.indexOf(anchor);
  if (i < 0) return order;
  if (after) i += 1;
  rest.splice(i, 0, ...order.filter((k) => m.has(k)));
  return rest;
}

/**
 * Today's new order for the route, merged with the stored one so addresses
 * that aren't on today's sheet (e.g. Friday-only papers) keep their place.
 */
export function mergeOrder(stored, today) {
  if (!stored || !stored.length) return [...today];
  const out = [...today];
  const seen = new Set(out);
  let prev = null;
  for (const k of stored) {
    if (seen.has(k)) { prev = k; continue; }
    const at = prev === null ? 0 : out.indexOf(prev) + 1;
    out.splice(at, 0, k);
    seen.add(k);
    prev = k;
  }
  return out;
}

/**
 * Where a waiting order change is saved (decision 0031). `v` is what's waiting on the phone:
 * an order ({ keys, mine }), null (drop it), or { dropOwn: true } (a dispatcher going back to the usual order).
 * A driver's changes are always their own. A dispatcher's change the usual order everyone sees,
 * unless they've chosen to keep their own. Returns { own, drop }.
 */
export function seqTarget(v, personal) {
  if (v?.dropOwn) return { own: true, drop: true };
  if (!v) return { own: !!personal, drop: true };
  return { own: !!personal || !!v.mine, drop: false };
}

const streetOf = (k) => { const p = String(k).split('|'); return p.length >= 3 ? p[1] : null; };
const houseOf = (k) => { const p = String(k).split('|'); const m = /^(.+?)\/\s*(.+)$/.exec(p[p.length - 1] || ''); const n = parseInt(/\d+/.exec(m ? m[2] : p[p.length - 1] || '')?.[0] ?? '', 10); return Number.isFinite(n) ? n : null; };
/**
 * Position (a sort number) for an address this order doesn't have, at index `i` of the usual order.
 * 1. after the nearest address before it in the usual order that this order knows, if that is on the same street;
 * 2. else before the nearest one after it, if that is on the same street;
 * 3. else beside the house on its street (in this order) with the nearest number, keeping the block's direction;
 * 4. else after the nearest one before it (no street to go by).
 */
function placeFor(k, i, usual, known, keys, pos) {
  let p = i - 1; while (p >= 0 && known[p] === null) p--;
  let n = i + 1; while (n < usual.length && known[n] === null) n++;
  const st = streetOf(k); const before = p >= 0 ? known[p] : -1;
  if (st && p >= 0 && streetOf(usual[p]) === st) return before;
  if (st && n < usual.length && streetOf(usual[n]) === st) return known[n] - 0.5;
  const mine = st ? keys.filter((x) => streetOf(x) === st && houseOf(x) != null) : [];
  const h = houseOf(k);
  if (mine.length && h != null) {
    const anchor = mine.reduce((a, b) => (Math.abs(houseOf(b) - h) < Math.abs(houseOf(a) - h) ? b : a));
    const rising = houseOf(mine[mine.length - 1]) >= houseOf(mine[0]);
    const after = rising ? h > houseOf(anchor) : h < houseOf(anchor);
    return pos.get(anchor) + (after ? 0 : -0.5);
  }
  return before;
}
