# Route optimisation: what kind of problem ours is, and how Stan should solve it

Research and recommendation, 23 Nov 2026, asked for by Mike before any optimiser is built ([decision 0064](decisions/0064-optimisation-approach.md)). Sources are linked where a claim comes from one; the rest is our own reasoning from the app's records.

## 1. The rules Mike set (22 Nov 2026)
- Stan re-optimises the sequence depending on **who is driving, whether there are helpers, and how many drivers** there are, and **uses the ticks to check himself**.
- He optimises for **the runs the driver has selected**: all of them for a sole driver, or just Run 6 and Run 10 if that's what was picked.
- **Time is 100% the measure.** Not kilometres.
- **The drive between two runs must never be the leading measure**: shortening it by making a run longer is a loss.
- Planning figure: about **45 minutes** of prep at the depot for a single driver.

## 2. What kind of problem it is
It is not the textbook travelling salesman problem (one salesman, one loop through every city, back home). It is a stack of its relatives:

| Feature of our mornings | The textbook name | What it means for us |
|---|---|---|
| Each run's stops are done together, one run after another | **Clustered TSP**: the stops are in groups and each group is visited as a block. Variants differ on whether the order of groups and each group's first and last stop are fixed ([The Ordered Clustered Travelling Salesman Problem](https://core.ac.uk/download/192734181.pdf)) | Ours is the free variant: Stan may choose the order of runs **and** where each run starts and ends. That is exactly the lever Mike found by hand on Run 6. |
| Start at the depot, finish at the last letterbox, no drive back counted | **Open-loop TSP** (a path, not a loop). Still a hard problem, and the best simple improvement moves differ from the loop version ([Which Local Search Operator Works Best for the Open-Loop TSP?](https://mdpi.com/2076-3417/9/19/3985)) | Use moves suited to paths. Where a run ends is free, which is where the saving between runs comes from. |
| More than one car on some mornings | **Vehicle routing**: which vehicle takes which stops, then an order for each | Ours is tiny: five runs, two or three crews. Every way of sharing them out can simply be tried. |
| Run 8 is delivered part-way through Run 10 | A group inside a group | Treat the village as one long stop with its own fixed inside order ([Run 8 village](run8-village.md)). |
| Finish by 6:00 (7:00 at weekends) | A deadline on the whole route | A test the plan must pass, and the reason time is the measure. |
| Lisa and Mike take different times; a helper changes the time at a stop | Costs that depend on the crew | The cost of a leg is **learned per kind of crew**, not looked up from a map. |

Two things make ours easier than the general case. It is **small** at the top level (five runs can be put in 120 orders, each run started from either end: a few thousand combinations, which a phone can check exhaustively, so that level can be solved exactly and needs no cleverness). And it **repeats**: the same streets every morning, so the app can learn what each leg really costs.

One thing makes it harder: inside a run there are up to about 170 stops, far too many to try every order. That level needs a heuristic.

## 3. What the research says about solving it
- **Split it in two levels.** For grouped problems a known approach is to settle the order of the groups and the path through them as two linked problems ([Lin-Kernighan Heuristic Adaptations for the Generalized TSP](https://arxiv.org/pdf/1003.5330)). It fits us naturally: runs first, stops within a run second.
- **Inside a run, improve an existing order with small moves.** Local search starts from an order and keeps making small changes that shorten it: reversing a stretch (2-opt), or lifting a few stops and putting them elsewhere (Or-opt/relocate). These are the standard within-route moves in vehicle routing ([Heuristics for Vehicle Routing Problem: A Survey and Recent Advances](https://arxiv.org/pdf/2303.04147)), and 2-opt alone typically ends within a few per cent of the best possible on real street-like problems ([Worst Case and Probabilistic Analysis of the 2-Opt Algorithm for the TSP](https://arxiv.org/pdf/2302.06889)). For open paths, a move that reconnects the path's ends (link swap) accounted for half of all improvements in one study ([same study](https://mdpi.com/2076-3417/9/19/3985)).
- **Start from what the drivers already do.** Planned routes and driven routes differ a great deal: a year of deliveries at one large company showed three out of four not following the planned order, with drivers relying on what they know of the roads ([Learning from route plan deviations in last-mile delivery](https://www.scmr.com/article/learning_from_route_plan_deviations_in_last_mile_delivery/Supply_Chain)). Amazon ran a research challenge on exactly this gap, giving teams the routes experienced drivers actually took ([Learning from Drivers to Tackle the Amazon Last Mile Routing Research Challenge](https://arxiv.org/pdf/2205.04001)). A method from it sets the order of zones from a mix of history and travel time, then optimises inside each zone ([Learn Global and Optimize Local](https://ar5iv.labs.arxiv.org/html/2112.01937)). The lesson for us: a driver's proven order is the starting point and the benchmark, not noise to be optimised away.
- **What products like OptimoRoute do.** They plan orders that each carry a location, a service time, a time window, skills and load ([OptimoRoute help](https://help.optimoroute.com/hc/en-us/articles/35511474016404)); send the plan to a driver app; show the planned route against the driver's actual breadcrumbs; and allow live routes to be replanned. Their solvers are not published. The parts worth borrowing are the ones around the solver: **a service time per stop, planned against actual, and replanning while the day is under way**. The part that doesn't fit is the core job they are built for (fresh orders with time windows shared across a fleet each day); ours is the same territory every morning, where learned times matter more than a clever solver.

## 4. Recommendation

### The measure
Total minutes from leaving the depot to the last tick, for the runs selected, for this crew. Kilometres are reported, never optimised.

### What a leg costs (the model Stan learns)
For going from stop A to stop B:
1. **Seen before:** the middle value of the seconds between those two ticks on past mornings, for the same kind of crew (solo, or with a helper), once it has been seen at least twice.
2. **Not seen:** the map's drive time between them, plus the usual time at a stop like B (a unit or apartment takes longer than a letterbox).
3. **No map:** straight-line distance at the crew's usual speed.

Pauses are part of the truth: Lisa's Run 6 mornings covered the same distance as Mike's but held 20 to 30 more minutes in gaps of over 90 seconds. A model built on distance would never see that; one built on tick times does.

### The method, in two levels
- **Runs level (exact):** for the selected runs, try every order and every choice of which end each run starts from, cost each with the model, and keep the quickest that meets the deadline. With more than one crew, also try every way of sharing the runs out.
- **Stops level (careful improvement):** start from the driver's own order. Look for small moves (relocate a few stops, reverse a stretch, change which end the run finishes at) that the model says save time. Offer the best few as suggestions, each with its evidence: "moving these four stops saves about 3 minutes; it's how Tuesday's quickest morning went."

### The rule that keeps it honest
**No optimising before the predictor is proven.** Before Stan suggests anything, the model must predict past mornings' actual times to within about 5%. If it can't, he says so and suggests nothing. Garbage in, garbage out applies to him too.

### How it behaves for drivers
- **Suggest, never impose.** A new order is a card with Move it / Leave it, like the address check, and lands in the driver's own order.
- **Only worth a change if it's worth it:** a suggestion must save at least about 2 minutes, or it isn't made. Reordering for seconds costs more in confusion than it saves.
- **Between runs, not mid-street.** Re-sequencing on the fly happens when a run finishes or the crew changes, never under a thumb.
- **Check after.** After the morning, compare predicted with actual for each run and hop; that difference is what the model learns from, and it is shown on Insights.

### Where it runs
In the app, in plain JavaScript: nothing to install, works without signal once the times are on the phone, and at our sizes (170 stops) the moves take well under a second. The optimiser sits behind one function (cost model in, order out), so it can be swapped for a server-side solver if the business outgrows it. That is the portability principle applied.

## 5. Build order
1. **Measure the hops between runs.** Done with this document: timed from the ticks, measured along the roads, shown on *Your morning*.
2. **The time model:** leg times learned from ticks, by kind of crew.
3. **The predictor and its report card:** predicted against actual for past mornings, on Insights. *The gate: nothing below is built until this holds.*
4. **Runs-level optimiser:** best order of the selected runs and which end to start each, with the day plan using it.
5. **Stops-level suggestions,** as Stan's cards.
6. **Crews:** who takes which run when there is more than one car.
7. **The learning loop:** each morning's prediction error feeds the model.

## 5a. Where it stands (23 Nov 2026)
Steps 1 to 3 are built. **The gate at step 3 is not met**, on either test:

- the whole morning: typical miss about 20% against 5% ([decision 0066](decisions/0066-predictor-report-card.md));
- the driving only, which Mike chose as the gate on 23 Nov: about 16% ([decision 0067](decisions/0067-gate-on-the-driving.md)).

The time between two ticks is the drive plus whatever happened at the letterbox, and the second part is what swings. Ticks can't prove a saving of a minute or two a run. Steps 4 to 7 wait. The choices for Mike:

1. **Stop here** and put the effort where the minutes are: the pauses and the time at stops. **Chosen by Mike, 23 Nov 2026**: see [decision 0069](decisions/0069-time-between-stops.md).
2. **Runs level only, proved by trying it**: Stan shows the dispatcher the order of runs with the least driving by the map, the family tries it for a couple of weeks, and the before and after are compared. No learning from ticks is claimed.
3. **Measure the driving itself**: record the car's position while a run is open, which changes the rule that nothing is recorded between ticks, so it needs Mike and the drivers to agree.

## 6. What we don't know yet
- **Solo mornings.** Who was in the car has only been recorded since 19 Nov, and no morning since has been logged as solo. The solo model starts from one-ticker mornings and is weak until real ones exist.
- **Which side of the road.** Tick positions say where, not which side or which way the car faced. A reversed stretch may cost U-turns the model can't see until it has been driven that way.
- **The village.** Its inside order is fixed by the buildings, so only when it is entered is open to change.
- **Thin history for some pairs of runs.** The hop from Run 6 to Run 10 has one like-for-like morning for Mike and six for Lisa.
