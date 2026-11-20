# 0042. Spare papers, pinned rules, and the morning on the notice board

- **Date:** 2026-11-20
- **Status:** Accepted

## Context
The morning after the notice board went out ([0041](0041-crew-check-and-notice-board.md)), Lisa used it three ways in one shift: to record that a spare paper went to a family friend, to set a rule for giving spares away, and to report that the last run was done and that there was one more spare than expected, "could be one extra taken at depot".

Mike's test for any screen is "what do I do with this information?". Run through that, a note is the wrong home for all three: a count written as a sentence can't be added up, a rule acknowledged once disappears, and a finish time is something the app already knows. He confirmed (20 Nov 2026) that the friend is a regular, that there are usually 2 to 3 spares before and after on weekdays and many spare Sunday Star-Times on Sundays, and that the count "may not measure anything just yet, but it may down the track, so it's worth capturing".

## Decision
1. **Count the spares, as numbers.**
   - When a driver taps **Leaving the depot now** (or **Prepped: starting the run**), after the run has started, Stan asks **Spares on board?**
   - When a driver goes **Off duty**, after they are off duty, Stan asks **Spares left?** and **Did any spares go to someone?**, with regulars as buttons and **Someone else…** to add one (remembered for everyone, `spare_people`).
   - One row of big − and + buttons per paper: the Herald always, the Sunday Star-Times when it is on the day's sheets. Magazines aren't counted.
   - **Save** or **Skip**. It never stands between a driver and going on or off duty, and a helper is never asked.
   - Answers are kept on the phone first and sent when there is signal (`spare_counts`). Each is a new row; the latest per driver and moment is used.
2. **Pinned rules.** Leaving a note has a third choice, **Pin as a rule**. Pinned notes have no end date and sit first on the board under **How we do things**. They pop up once for each person like any note.
3. **This morning, on the board.** Worked out from the ticks and the spare counts: each started run's finish time, how many minutes after the deadline if it was late, and the spares in a line. Nobody types it.

## What it does not do
- It does not yet compare the count with what the depot issued: the app doesn't know that number. With the start count and the sheets' totals, a miscount at the depot will show as a start count that is unusual for that day of the week.
- The app shows a pinned rule; it does not enforce it.
- There is no spares page in Dispatch yet. The data is being collected; the report comes when there is enough to say something.
- People who get spares are stored by the name the driver types, in the database only. None are named in this repository.

## Also fixed with this
The notice board's **Got it**, typed helper names and the game's high scores were never saved on real phones: the shared store called fallbacks that only the demo store had, and the error was swallowed. The fallbacks now live in the base store, and `test/sql.mjs` fails if the shared store ever calls one that isn't there.

## Consequences
Two more optional questions in a driver's morning. After a few weeks there is a per-day record of spares to look for patterns in, and to take to the run owner if papers are going missing.
