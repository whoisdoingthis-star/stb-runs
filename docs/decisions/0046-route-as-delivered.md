# 0046. The route as delivered, traced on the map

- **Date:** 2026-11-21
- **Status:** Accepted (steps 1 and 2). Step 3, pricing a different order, is not built.

## Context
Kilometres per run ([0045](0045-kilometres.md)) are measured by asking the mapping service for the road between each pair of ticks. It answers with the line it took as well as the distance, and the line was being thrown away. Mike (21 Nov 2026) asked whether a likely route could be traced between each tick location, for two outcomes: a more accurate kilometre estimate, and better sequence suggestions.

## Decision
1. **Keep the line.** Each time a run is measured, the road taken is kept with it (`run_km.trace`): one line per vehicle, thinned to the points that give it its shape (within 4 m) so it stays small. It costs no extra requests.
2. **Draw it on the run map** in Dispatch:
   - the route as delivered in **orange**, replacing the green "done" trail while it is shown (a tick box turns it off);
   - any stretch **driven more than once in red**, with the kilometres it adds up to. A stretch counts when a vehicle goes along road it has already been along, in either direction (`doubledBack` in `js/runkm.js`: steps of about 15 m on a 20 m grid; each vehicle against its own path only);
   - each stop's label says when it was delivered (3rd, 14th…), beside its place in the planned order;
   - a run with no trace yet has a **Trace the route as delivered** button.
3. **Say what it is.** The map always carries the line: "It is the map's likely route between ticks, not a recording of the drive."

## Why it helps
- **The estimate becomes checkable.** A tick snapped to the wrong street or a detour nobody drove is obvious as a line and invisible as a number.
- **Sequencing gets evidence.** Red stretches are road driven twice: the first place to look for a better order. Some doubling back is unavoidable (a cul-de-sac is driven in and out), so red is a prompt to look, not a fault.

## What it does not do
- It cannot know a deliberate long way round: the map draws the shortest sensible road between two ticks.
- It does not yet price an alternative order ("Stan's order would be 1.6 km shorter"). That is step 3, and it is what would let the day plan and any mixed runs be scored before anyone drives them.
- The odometer ([0045](0045-kilometres.md)) remains the check on all of it.

## Consequences
The mapping function's "through these points" mode now also returns the road line. Traces hold the streets a run covers, in the family's private database; none are in this repository.
