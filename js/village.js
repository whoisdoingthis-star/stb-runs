// Route layouts: operational rules that change how a run is shown, without
// changing what the sheet says. Today only HOWICK08 (Bruce McLaren Village)
// has one, from "Run 8 Operational Rules and Decisions v1.0".
//
// Access codes are NOT kept here: this file ends up on a public website.
// Codes live behind the family login (see store.loadAccessCodes).

export const LAYOUTS = {
  HOWICK08: {
    name: 'Bruce McLaren Village',
    // Mandatory building order (rule 3). Source order never changes this.
    sections: [
      { id: 'AMON', label: 'Amon Apartments', streets: ['BRUCE MCLAREN AMON APARTMENTS'] },
      {
        id: 'HULME', label: 'Hulme Apartments', streets: ['BRUCE MCLAREN HULME APARTMENTS'],
        banks: [
          // Both banks photographed 8 Nov 2026, listed row by row as they appear.
          // Bank 1: 4x8 grid, 32 boxes. Bank 2: 3x5 grid, 14 boxes plus one unlabelled.
          // They replace the older range map (which had 352-353 in Bank 1 and 253-273 in Bank 2).
          { id: '1', label: 'Bank 1 (main)', ranges: [], units: [140, 141, 142, 143, 144, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351] },
          { id: '2', label: 'Bank 2', ranges: [], units: [352, 353, 354, 440, 441, 442, 443, 444, 445, 446, 447, 448, 449, 450] },
        ],
        overrides: {},
      },
      {
        id: 'MONACO', label: 'Monaco Apartments', streets: ['BRUCE MCLAREN MONACO APTS', 'BRUCE MCLAREN MONACO APARTMENTS'],
        // Both banks photographed 8 Nov 2026: 4x11 grids, listed row by row as they appear
        // (Bank 1: 44 boxes; Bank 2: 43 plus one unlabelled). They replace the older range
        // map, which had 165 in the wrong bank and listed units (166-199, 200-259) that
        // aren't on either bank.
        banks: [
          { id: '1', label: 'Bank 1', ranges: [], units: [274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 374, 375, 376, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386, 474, 475, 476, 477, 478, 479, 480, 481, 482, 483, 484, 485, 486, 160, 161, 162, 163, 164] },
          { id: '2', label: 'Bank 2', ranges: [], units: [165, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 460, 461, 462, 463, 464, 465, 466, 467, 468, 469, 470, 471, 472, 473] },
        ],
        overrides: {}, // 462 -> Bank 2 is now confirmed by the photo
      },
      { id: 'AUSTIN', label: 'Austin Apartments', streets: ['BRUCE MCLAREN AUSTIN APTS', 'BRUCE MCLAREN AUSTIN APARTMENTS'] },
      {
        id: 'RECEPTION', label: 'Reception handover', bundle: true,
        // One physical bundle at reception; these are its parts.
        streets: ['BRUCE MCLAREN RECEPTION', 'BRUCE MCLAREN CARE CENTRE', 'BRUCE MCLAREN SERVICED APTS', 'BRUCE MCLAREN SERVICED APARTMENTS'],
        partLabels: {
          'BRUCE MCLAREN RECEPTION': 'Reception',
          'BRUCE MCLAREN CARE CENTRE': 'Care Centre',
          'BRUCE MCLAREN SERVICED APTS': 'Serviced Apartments',
          'BRUCE MCLAREN SERVICED APARTMENTS': 'Serviced Apartments',
        },
      },
    ],
    // Any other street that looks like it belongs to the village can't be
    // placed with confidence: it goes to a review section (rule 7).
    reviewIf: /BRUCE\s+MCLAREN/i,
  },
};

export const layoutFor = (route) => LAYOUTS[route] || null;

const keyOf = (l) => l.address_key ?? l.addressKey;
const isUnrouted = (l) => !!(l.unrouted || (l.flags || []).some((f) => f.type === 'unrouted'));

/** "IA/ 249" -> 249, "267IA" -> 267, "Level 2/ 238" -> 238, "401A" -> 401. */
export function unitNumber(number) {
  const tail = String(number).split('/').pop();
  const m = /\d+/.exec(tail);
  return m ? Number(m[0]) : null;
}
const hasPrefix = (number) => /\//.test(number) || /^\d+\D/.test(String(number).trim());

/** Numeric order; plain "249" before "IA/249"; otherwise as written. */
export function unitCompare(a, b) {
  const na = unitNumber(a.number); const nb = unitNumber(b.number);
  if (na !== nb) return (na ?? 1e9) - (nb ?? 1e9);
  const pa = hasPrefix(a.number) ? 1 : 0; const pb = hasPrefix(b.number) ? 1 : 0;
  if (pa !== pb) return pa - pb;
  return String(a.number).localeCompare(String(b.number));
}

/** Bank for a unit: explicit override > photographed bank > range map > not mapped. */
export function bankFor(section, number) {
  const n = unitNumber(number);
  if (n == null) return { bank: null, why: 'no unit number' };
  if (section.overrides && section.overrides[n]) return { bank: section.overrides[n], why: 'override' };
  const seen = section.banks.find((b) => (b.units || []).includes(n));
  if (seen) return { bank: seen.id, why: 'photo' };
  const hits = section.banks.filter((b) => b.ranges.some(([lo, hi]) => n >= lo && n <= hi)).map((b) => b.id);
  if (hits.length === 1) return { bank: hits[0], why: 'map' };
  if (hits.length > 1) return { bank: hits[0], why: 'overlap', candidates: hits };
  return { bank: null, why: 'not on map' };
}

/**
 * Arrange one run's lines (sheet order) by its layout.
 * Returns { groups, exceptions, totals, mappedOnce } where groups are, in order:
 *   { type: 'section', section, banks: [{ id, label, lines }], lines }   letterbox buildings
 *   { type: 'bundle', section, lines, parts: [{ label, lines, qty }] }   one handover
 *   { type: 'review', lines }                                            can't place: check
 *   { type: 'street', street, lines }                                    anything else, sheet order
 */
export function arrange(layout, lines) {
  const bySection = new Map(layout.sections.map((s) => [s.id, []]));
  const streetToSection = new Map();
  for (const s of layout.sections) for (const st of s.streets) streetToSection.set(st, s);
  const review = [];
  const others = [];
  for (const l of lines) {
    const s = streetToSection.get(String(l.street).toUpperCase().trim());
    if (s) bySection.get(s.id).push(l);
    else if (layout.reviewIf && layout.reviewIf.test(l.street)) review.push(l);
    else others.push(l);
  }

  const groups = [];
  const exceptions = [];
  const totals = [];
  for (const s of layout.sections) {
    const ls = bySection.get(s.id);
    if (!ls.length) continue;
    const qty = ls.reduce((n, l) => n + l.qty, 0);
    totals.push({ id: s.id, label: s.label, qty, lines: ls.length });
    if (s.bundle) {
      const parts = [];
      for (const st of s.streets) {
        const pl = ls.filter((l) => String(l.street).toUpperCase().trim() === st).sort(unitCompare);
        if (!pl.length) continue;
        const label = s.partLabels?.[st] || st;
        const existing = parts.find((p) => p.label === label);
        if (existing) existing.lines.push(...pl); else parts.push({ label, lines: pl });
      }
      parts.forEach((p) => { p.qty = p.lines.reduce((n, l) => n + l.qty, 0); });
      groups.push({ type: 'bundle', section: s, lines: parts.flatMap((p) => p.lines), parts, qty });
      continue;
    }
    if (!s.banks) {
      groups.push({ type: 'section', section: s, banks: [{ id: null, label: null, lines: [...ls].sort(unitCompare) }], lines: ls, qty });
      continue;
    }
    const banks = s.banks.map((b) => ({ id: b.id, label: b.label, lines: [] }));
    const unmapped = { id: '?', label: 'Not on the bank map: check', lines: [] };
    for (const l of ls) {
      const r = bankFor(s, l.number);
      l.bankNote = null;
      if (r.bank) {
        banks.find((b) => b.id === r.bank).lines.push(l);
        if (r.why === 'overlap') {
          l.bankNote = `On the edge of ${r.candidates.map((c) => `bank ${c}`).join(' and ')}: check`;
          exceptions.push(`${s.label} ${l.number}: unit ${unitNumber(l.number)} is in both bank ${r.candidates.join(' and ')} on the map; shown in bank ${r.bank}.`);
        }
      } else {
        unmapped.lines.push(l);
        exceptions.push(`${s.label} ${l.number}: not on the bank map, shown under "check".`);
      }
    }
    for (const b of [...banks, unmapped]) b.lines.sort(unitCompare);
    groups.push({ type: 'section', section: s, banks: [...banks, unmapped].filter((b) => b.lines.length), lines: ls, qty });
  }
  if (review.length) {
    groups.push({ type: 'review', lines: review });
    for (const l of review) exceptions.push(`${l.number} ${l.street}: not a known village building, put under "Needs review".`);
  }
  // Non-village streets keep their sheet order and street blocks.
  for (const l of others) {
    const last = groups[groups.length - 1];
    if (last && last.type === 'street' && last.street === l.street) last.lines.push(l);
    else groups.push({ type: 'street', street: l.street, lines: [l] });
  }

  // Every source line placed exactly once (rule 9 / AT-09).
  const placed = groups.flatMap((g) => g.lines.map(keyOf));
  const mappedOnce = placed.length === lines.length && new Set(placed).size === new Set(lines.map(keyOf)).size;
  return { groups, exceptions, totals, mappedOnce, unrouted: lines.filter(isUnrouted).map((l) => `${l.number} ${l.street}`) };
}
