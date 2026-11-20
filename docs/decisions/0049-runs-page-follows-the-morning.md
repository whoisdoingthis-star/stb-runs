# 0049. The Runs page follows the morning

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
The driver's Runs page had grown in the order its features were built: the duty card, Stan's plan, the ideas button, the notice board, then the runs. Looked at on a phone on 21 Nov 2026 (after Dispatch, [0048](0048-dispatch-on-a-phone.md)):

- the first run was below the bottom of the screen, on duty or off;
- the run tiles were in number order (6, 8, 10, 11, 13) while My runs and Stan's plan gave the real order (13, 11, 10, 8, 6), so the run you were on was the last tile;
- what to collect at the depot, the first thing needed, was at the very bottom, and every tile kept its pick list all morning.

Mike's test for a screen is "ok, what do I do with this information?" The page should answer "what do I do now?" at each point in the morning. Mike agreed the direction ("Cool let's go") and, asked about Run 8, said (21 Nov 2026): "They normally are nested 8 in 10, but can rare instances have someone do the 8 independently."

## Decision
The page keeps the same parts, and arranges them by where the morning is up to.

1. **The tiles are in my order.** Today's runs are listed with My runs first, in that order, then any others by number. Other days stay in number order.
2. **Before the shift.** *To collect* sits above the runs, closed. Each tile has its pick list and, when there is a plan, the time the plan has that run done by. The order has a small **Change** beside it; **Continue** only shows once something is ticked.
3. **At the depot** (on duty, not yet on the run). *To load* is open at the top, listing the runs in my order. The tiles drop their own pick lists so nothing is said twice.
4. **On the run.** The top card shows the run I am on: "Now · run 2 of 5", the run's name, stops done, a progress bar and one big button to carry on. The order stays underneath as a small trail with ticks. Pick lists are put away and *To collect* moves below the runs. Stan's plan shrinks to one line.
5. **Against the plan.** Once the run has a tick and the plan has times for it, the top card says **On plan** (within 3 minutes), **N min ahead** or **N min behind**. It compares now with where the plan would be for the stops done so far. Behind is stated plainly, in minutes, with no colour of alarm and no comment: facts, not scores ([0044](0044-end-of-shift-summary.md)).
6. **A run inside another.** When the plan has a run dropped off part-way through another (Run 8 in Run 10), its tile sits straight under its host's, marked, with **Open both**. If someone has that run in My runs without its host, it is shown on its own like any other run.
7. **The board and the ideas button** share one row (one each per row in big text).

## Consequences
- Nothing was removed. *Change my runs*, *Open all*, History and the plan card are where they were.
- The tiles need the plan to know about nesting and times, so the list is drawn once straight away and again when the plan arrives.
- The progress bar on the top card is where a moving Stan would go if that idea is built.
- Not done: naming the next stop on the top card (it would mean loading the run's stops on this page).
- Checked by `test/e2e-runs-page.py` and `test/dayplan.mjs`.
