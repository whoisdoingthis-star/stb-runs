# 0055. Stan checks a run's addresses before it's driven

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike (21 Nov 2026): "before Stan commits the run, can he analyse delivery addresses. I've found addresses can float away from their natural place. 3 Hartles Place from today's Run 6 is a good example." And, with a screenshot of two Cook Street tiles: "they're both actually deliveries to number 5, unit 2 and unit 7, but the way they're keyed from NZME make it confusing."

What the records show for Run 6 on 21 Nov:
- Hartles Place 7, 15 and 12 were ticked together at 6:19. Number 3, new on that day's sheet, was ticked at 6:35, straight after the last Mellons Bay Road stop, back at Hartles Place: a drive back of about two and a half minutes. In one saved order number 3 still sits after Glenfern Road, apart from 7 and 12. Mike moved it beside number 7 by hand at 7:01.
- The sheet has Cook Street "2/ 5" and "5/ 7". The app reads the second as unit 5 at number 7. There is no other number 7 on the sheet's Cook Street, and there is a unit at number 5.

## Decision
When a run is opened and nothing on it has been ticked yet, Stan looks at it and shows up to three suggestions above the stops. He only suggests: nothing moves or changes without a tap, and each suggestion can be left.

1. **An address away from its street.** If one address sits on its own in the order, at least two stops away from a group of two or more on the same street, and its house number is within 10 of that group's numbers, Stan says so and offers **Move it**: beside the house with the nearest number, on the side that keeps the street running the way it already runs. The move is saved in the person's own order ([0054](0054-own-order-for-everyone.md)). **Leave it** is remembered on that phone for that address and place.
   - A long road visited twice (Cook Street 5–35, then 110–112 later) is left alone: the numbers are nowhere near.
   - The village (Run 8) has its own fixed order and is not checked.
2. **A unit and number that look the wrong way round** (dispatchers only). If the sheet has "u/ n", nothing else on that street is at number n, and something else has a unit at number u, Stan asks whether it is really unit n at number u. **Yes** saves a *shown as* correction for everyone: the tile reads the corrected way, with "Sheet says 5/7" in small print. The sheet's own key is untouched, so ticks, photos, complaints and history still match. It can be undone from **⋯ → Undo an address correction…**.
3. **Once a run has a tick**, its suggestions are put away. Ticking is never held up.

Corrections live in the `address_labels` setting (`app_settings`): `{ address_key: { number, by, at } }`. Everyone can read it; only dispatchers can change it.

## Consequences
- It goes by street names and house numbers only. Where each address is usually ticked could sharpen it (the code accepts those positions) but the run screen doesn't load them yet.
- It checks the order as it stands. It does not yet look at the order people actually ticked in ("the route as delivered", [0046](0046-route-as-delivered.md)) to spot a drive back after the fact; that is the natural next step.
- NZME's keying is not fixed at the source: the correction has to be made once per address, and a new mis-keyed address will be asked about when it first appears.
- Checked by `test/strays.mjs` and `test/e2e-check.py`.
