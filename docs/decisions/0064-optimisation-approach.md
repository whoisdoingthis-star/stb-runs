# 0064. How Stan will optimise: time, learned from ticks, proven before used

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
On the run of 22 Nov 2026 Mike asked how long a single driver would need, and the analysis that followed (his Run 6 against Lisa's, where each finishes, the drive to the next run) was the manual version of what he wants Stan to do. He set the rules by voice that morning: "I need Stan to be able to re-optimise the route sequencing on the fly using the learned ticks to validate", "optimising for the runs that you have selected", "100% time is the optimisable metric", and that the shortest distance between two runs must not lead, "because you could unintentionally make that run longer just to try and shorten the last delivery point and the new delivery point." He asked that, before any build, the travelling salesman problem and the problems next to it be researched, along with products like OptimoRoute. On 23 Nov he said to start.

## Decision
1. **The research and recommendation are in [docs/route-optimisation.md](../route-optimisation.md).** In short: ours is a clustered, open-path routing problem with free run order and free run ends, small at the level of runs and large inside a run, with costs that depend on the crew and can be learned because the same streets are driven every morning.
2. **The measure is total time** for the selected runs and the crew on the day. Kilometres are reported, not optimised. The drive between runs is one part of the total and never a target of its own.
3. **Costs come from ticks first:** the usual seconds between two stops for that kind of crew; the map's drive time plus a usual stop time where a leg hasn't been seen; straight lines last.
4. **Two levels.** The order of runs and which end each starts from is solved exactly by trying every combination. Inside a run, Stan improves the driver's own order with small moves and offers the best as suggestions.
5. **Proven before used.** Stan suggests nothing until his predictor matches past mornings' actual times to within about 5%, and that report is visible on Insights.
6. **Suggest, never impose;** only changes worth about 2 minutes or more; re-sequencing between runs, never mid-street; predicted against actual checked after every morning.
7. **In the app, behind one function,** so the solver can be replaced without touching the rest ([0062](0062-design-principles.md): portability).
8. **First piece built with this decision:** the drives between runs are now measured. For a crew's morning, each hop runs from the last tick of one run to the first tick of the next (a run done inside another has none; a gap over 45 minutes isn't a hop), timed from the ticks and measured along the roads when the map can be reached. *Your morning* shows **Between runs: 14 min · 3.2 km**.

## Consequences
- The build order is in the research page; step 3 (the predictor's report card) is a gate, and steps 4 to 7 wait on it.
- 45 minutes of depot prep is the planning figure for a single driver until measured.
- Solo mornings, side of the road and thin history for some hops are known gaps, listed in the research page.
- Hops are worked out from ticks each time and not stored; the road distance for each is asked of the map when the card is shown.
- Checked by `test/runkm.mjs` and `test/e2e-summary.py`.
