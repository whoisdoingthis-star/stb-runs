# 0067. The gate tests the driving, and the driving doesn't pass either

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
[0066](0066-predictor-report-card.md) found Stan's whole-morning predictions about 20% out against the 5% gate of [0064](0064-optimisation-approach.md), and put a question to Mike: keep the gate, or test only the part an order can change, the driving between stops. Mike chose the second (23 Nov 2026, in the chat: "yes agree let's go with your recommendation"), on the condition already given that the result is shown to him before step four starts.

## Decision
1. **The gate is the driving part.** A drive is a leg of 150 m or more between where two addresses are usually ticked. A run-morning with at least five drives is tested: its drives are predicted from the other days (the leg's own history, else its distance, scaled by crew as before) and their total compared with what they took. The target stays 5% typical miss over at least ten mornings. The whole-morning figures stay on the report card for comparison, and no longer decide anything.
2. **The result** (database query on 9–23 Nov, 55 run-mornings, about 20 drives and 22 minutes of driving per run-morning): typical miss **about 16%**; 15% of mornings within 5%, 29% within 10%, 51% within 20%. **The gate is not met. Stan suggests nothing.**
3. **Why, which is the useful part.** The time from one tick to the next is not mostly driving, even on the long legs. It is the drive *plus whatever happened at the letterbox at the end of it*, and that second part is what swings:
   - Across single mornings, distance explains almost none of a drive's time on Runs 10, 11 and 13, and about a third on Run 6.
   - A leg's **usual** time (the middle of several mornings) does follow distance reasonably (302 pairs of addresses seen four or more times), so the model's picture of the roads is sound; it is the single morning that can't be predicted.
   - Hops between runs are the same: Run 11 to Run 13 has taken from 6 to 32 minutes for the same 3 km.
4. **What follows.** Ticks cannot prove a small saving. The driving an order can touch is about 22 minutes a run; a good re-ordering of driving usually trims a few per cent of it (an assumption from the research in `docs/route-optimisation.md`, not measured here), so a minute or two a run, against a day-to-day swing in that same driving of three to four minutes, and of ten or more in the whole morning. The larger and more certain minutes are in the pauses and the time at stops, not in the order.

## Consequences
- Steps 4 to 7 of the build order stay stopped.
- The gate is not moved again to make it pass. The next step is Mike's to choose; the choices put to him are recorded in `docs/route-optimisation.md` §5a.
- The figures in 2 and 3 are from database queries (one car per run); the app's report card separates two cars and is the standing measure from here on.
- Checked by `test/timemodel.mjs`.
