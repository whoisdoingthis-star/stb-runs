// Custom delivery order for a route.
//
// The order is a list of address keys for the route. It carries forward: when
// tomorrow's sheet for the same route is opened, addresses are shown in this
// order. Addresses the list doesn't know yet (new starts) stay next to the
// address they follow on the sheet.

/** Lines in custom order. `lines` must be in sheet order and carry address_key. */
export function applySequence(lines, keys) {
  if (!keys || !keys.length) return lines;
  const pos = new Map(keys.map((k, i) => [k, i]));
  let anchor = -1;
  const sortKeys = lines.map((l, i) => {
    const p = pos.get(l.address_key);
    if (p !== undefined) { anchor = p; return [p, 0, i]; }
    return [anchor, 1, i]; // unknown: right after the previous known sheet address
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
