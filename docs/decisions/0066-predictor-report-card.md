# 0066. Stan's time model and report card: built, and it does not pass the gate

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
[0064](0064-optimisation-approach.md) set the build order for route optimisation and a gate: Stan suggests nothing until his predictor matches past mornings' real times to within about 5%. Mike said to build steps two and three (23 Nov 2026, by voice, then "Go" in the chat): the time model, and the report card on Insights.

## Decision
1. **The time model** (`js/timemodel.js`). A leg is the time from one tick to the next *in the same car* (two cars on one run are kept apart by where their ticks are; two phones in one car are one car). A leg costs:
   - the average of what that same leg took on other mornings, once it has been driven at least twice, with any one leg counted as ten minutes at most;
   - otherwise its distance, through a straight-line fit of seconds on metres for that run;
   - otherwise the run's average leg.
   The total is then scaled by how that crew ("Lisa", "Lisa with others") usually compares with the sum of its legs, because pauses and walk-ins are real time that no single leg explains.
2. **The report card** (Insights → Stan's report card). Every usable run-morning in the dates chosen is predicted from the **other** days only and compared with what it took: typical miss, the share within 5, 10 and 20 per cent, a line per run, and every morning tested. It says plainly whether Stan is good enough. Run 8 is left out (its order is fixed), as are runs ticked in one go, of fewer than 15 legs, or spread over more than four hours. The headline is saved in settings (`predictor_report`) each time a dispatcher opens Insights.
3. **The result.** A first version of the model was run against the live records for 9–23 Nov in the database (55 run-mornings; this version read each run as one car):
   - using only the usual time of each leg, it **under-predicted by about a quarter** on most mornings: the middle value of a leg's times ignores the slow days, and the legs not seen before were the long ones;
   - with averages, the distance fallback and the crew scaling, the lean went away (about 0%) but the **typical miss was about 20%**: 9% of mornings within 5%, 20% within 10%, 47% within 20%. By run: Run 6 20%, Run 10 21%, Run 11 27%, Run 13 15%.
   **The gate is not met. Stan suggests nothing.**
4. **Why.** The same driver on the same run swings by that much from day to day (Mike alone on Run 6: 51 to 76 minutes), and most of the swing is not in the order of stops: it is pauses, how many papers and which paper (Sunday's are heavy), who is in the car, and two cars sharing a run. Who was in the car has only been recorded since 19 Nov.

## Consequences
- Steps 4 to 7 of the build order do not start. That is the gate doing its job.
- The 5% test asks more than the optimiser needs. Choosing between two orders for the same crew on the same morning depends on the **difference** between them, and the day's swing is the same for both. The part of a morning an order can change is the driving between stops, not the time at them. A fairer gate tests that part: how well the model predicts the driving legs (say, those over 150 m) and the hops between runs. Whether to change the gate is Mike's decision; it is put to him with this record and nothing is changed until he says.
- More and better data will narrow it regardless: crew recorded on every shift (since 19 Nov), the odometer and counted spares (since 22 Nov), and the number of papers per day, which the model does not use yet.
- The figures in 3 are from a database query, not from the app's own card, which also splits two cars apart and may score a little better. The first real card is whatever Insights shows when a dispatcher next opens it.
- Checked by `test/timemodel.mjs`.
