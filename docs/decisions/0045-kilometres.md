# 0045. Kilometres: from the ticks, and from the odometer

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike asked whether the actual kilometres travelled on a run can be captured. Three ways were put to him: estimate from the ticks, ask for the odometer, or track the phone continuously. He chose the first two together, and added why (21 Nov 2026): the distance between each tick is a way to see how "actual sequence delivered" distances can be continually improved by Stan; and the odometer is the most accurate figure, which the estimate can improve on.

Continuous tracking was not chosen. A web app loses location when the screen is off or another app is in front, so it would have gaps while driving, and it would undo the rule that Stan never tracks anyone continuously ([0026](0026-run-map-and-ping.md)).

## Decision
1. **Kilometres on a run, from its ticks** (`js/runkm.js`, tested). The run's path is its delivered ticks that have a good location, in the order they were made, with ticks at one spot (within 15 m) merged. Two figures are kept per run in `run_km`:
   - `line_km`: straight lines along that path. Always available.
   - `road_km`: the same path driven along the roads, asked of the mapping service the co-driver already uses, in pieces of 40 points (at most 240 points a run). Kept only if believable: not shorter than the straight line, not more than three times it.
   It is worked out once per run, by whichever phone first opens that morning's summary.
2. **On the card.** *Km on the runs* adds the crew's runs. If any run has no road figure, the straight line is stretched by 1.3 and the box says "roughly".
3. **The odometer.** The spares sheets gain one optional box: the odometer when **leaving the depot**, and again when going **off duty**. *Km on the clock* is the difference, shown when both are there and it makes sense (more than 0, under 600). Only drivers are asked; a helper's card shows their driver's.
4. **Why both are kept.** Per-run kilometres, in the order actually delivered, are the yardstick for sequencing: a new order that is really shorter shows as fewer kilometres on the same run. The odometer covers everything between leaving the depot and going off duty, so the gap between the two is the driving that isn't on a run, and their ratio over time says how far to trust (and how to correct) the estimate.

## What it does not do yet
- It doesn't yet estimate the driving between runs or to the first stop, so the two figures aren't directly comparable on one morning.
- It doesn't correct the estimate from the odometer automatically. That needs a few weeks of both.
- Earlier runs have no kilometres until someone works them out; nothing has been back-filled.
- Runs ticked in a batch afterwards, or with no location, give a short or missing figure.

## Consequences
One more optional box in a driver's morning, twice. A few requests to the mapping service per run per day, well inside its free allowance. The mapping function gained a "through these points" mode; its directions and address look-up are unchanged.
