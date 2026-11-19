# 0040. Stan's day plan, and drivers and helpers

- **Date:** 2026-11-19
- **Status:** Accepted (stage 1). Stage 2, mixing parts of runs together, is not built.

## Context
Mike (19 Nov 2026): Lisa and Lenny are doing every run on Friday 20 Nov by themselves. When fewer people are working, the order of the runs and the start time matter most, and until now that was worked out in people's heads. He asked for Stan to plan the day from who is working and what the runs normally take, and added how the family really works:
- **Drivers** are Mike, Lisa and Mum. **Helpers** (Lenny, Zaph, Serene) only ever ride with a driver. They fold, bag the "throw" papers and get papers ready on the way, which saves about 30 minutes on Run 6 because a driver alone does that at the depot before leaving; and they sit on the far side of the car, which saves the driver running round it.
- Lisa needs to be told by Stan, when she next opens the app, what to do and what has been set up.

The Insights times (first tick to last tick) leave out the depot work, so a plan built only on those would send a lone driver out too late.

## Decision
1. **Everyone is a driver or a helper** (`members.crew`), set on the People page. It is separate from access (App only / App + Dispatch).
2. **Dispatch has a Day plan page.** Tick who is driving and who is with them; Stan works out (`js/dayplan.js`, tested):
   - how long each run takes: the middle of the last four weeks of real mornings, and the driver's own mornings where they have three or more;
   - a run that is normally dropped off part-way through another (Run 8 inside Run 10) rides along and adds no time;
   - the driving between runs: what it has actually taken where we have it, otherwise from the distance;
   - who takes which runs so that the longest shift is as short as possible, then the order with the least driving, starting from the depot;
   - the times, working back from **10 minutes before the deadline**: at the depot, first paper, each run, all done.
   - **At the depot:** with a helper, 5 minutes to load. On their own, 16 seconds a paper to fold and bag (Mike's 30 minutes for Run 6). No time is taken off the run itself for a helper yet.
   - If it is already past the depot time, the card goes red and says when the last paper would land.
3. **Sending the plan** saves it for that day (`day_plans`). On the phone, everyone named in it gets **one pop-up from Stan** the next time they open the app (again only if the plan changes): who they are with, the three times, the runs in order, the dispatcher's note, and what Stan has set up. The plan stays as a card on the Runs page until their runs are done. On the day, **My runs is filled in** in the plan's order if it is empty.
4. **"Who's with you?"** A driver tapping On duty picks their helpers (the planned ones are already ticked) and taps Start my shift. Helpers, and anyone when the list isn't known, go on duty with one tap as before. The answer is kept on the duty record (`duty_events.helpers`).

## What it does not do
- It does not change any run's stop order, and it does not mix stops from different runs (stage 2: needs to know whether papers for different runs can be worked together, and which addresses are "throw").
- It never puts anyone on duty, and nothing in it is shown as a score.
- The helper's saving on the road is not guessed. Once a few weeks of shifts say who was helping, the plan can use measured figures in place of the two assumptions above.

## Consequences
The first plans are cautious: Lisa's own Run 6 mornings include ones without a helper, so her start time may be earlier than she needs. The plan lists what it assumed, so it can be argued with. The plan is only as good as the ticks: runs ticked in a batch afterwards look quicker than they were.
