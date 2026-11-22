# 0068. An address that comes back lands in its usual place, and one letterbox keyed two ways can be one tile

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
Mike, 23 Nov 2026 (in the chat), three things from Run 6:

1. A "new" address (he remembered Mission View; the records show **26 Marine Parade**) appeared away from the rest of its street and cost a drive back after 88 Selwyn Road. He put it back in his own order.
2. It was flagged *New* although the family has delivered there before; he asked what *New* means.
3. On Sunday 22 Nov, 12 Selwyn Road showed two tiles, **Unit 4c** (Herald) and **APT 4C** (Sunday Star-Times): one letterbox. "We should incorporate the logic for the robot to assess them as a single delivery point, and raise it with us for inclusion as an option, or leave separately."

What the records show: 26 Marine Parade was on the sheet 9–19 Nov, off it 20–22 Nov, and back on 23 Nov marked by NZME as *New start*. Mike's own order was made on 21–22 Nov, while it was off the sheet, so his order didn't have it. The rule for an address an order doesn't know was "next to its neighbour on the sheet", which was 27 Luplau Crescent. The rest of Marine Parade (44 to 82) had been delivered eleven minutes earlier. Stan's address check ([0055](0055-stans-address-check.md)) said nothing, because 26 is more than ten house numbers from 44.

## Decision
1. **An address someone's own order doesn't know goes where the usual order has it** (after the nearest address before it that both orders know). Only an address new to both orders goes beside its sheet neighbour. `js/sequence.js` `applySequence`.
2. **Stan's check raises any address the order has never placed** that sits alone away from a block of its street, whatever the house numbers. The ten-number reach still applies to addresses a person has placed, so deliberate choices aren't questioned every morning.
3. ***New* on a tile is NZME's word, not Stan's**: the sheet says *New start* for a subscription that starts or restarts that day. It does not mean the family has never delivered there. Recorded in the business rules and the family guide; nothing changes in the app.
4. **The same letterbox keyed two ways.** Stan looks for two addresses on a run with the same street, the same house number and the same unit once words such as Apt, Flat and Unit are taken off. A dispatcher sees a card: *Yes, one tile* or *No, keep both*. On yes, the pair is saved (setting `address_same`), and **from the next sheet read in** the two are one tile under the plainer address, with both papers, both sheet lines kept as its sources, and a *Combined* note naming the other spelling. **⋯ → Split a combined letterbox…** undoes it. Runs already read in are not changed.

## Consequences
- Records before the change stay under two address keys; history, photos and complaints for the wordier spelling are not moved. From the change on, ticks are recorded under the plainer key. A complaint NZME files under the wordier spelling still matches by the sheet line.
- Only a dispatcher can combine, because it changes what everyone sees. Two cases exist today (12 Selwyn Road on Run 6; 36 Clydesdale Avenue on Run 10).
- The usual order must be on the phone for 1 to work; it is cached whenever orders are loaded.
- Lesson [L-013](../lessons.md). Checked by `test/sequence.mjs`, `test/strays.mjs`, `test/unit.mjs`.
