# 0035. Insights: what the collected data says

- **Date:** 2026-11-17
- **Status:** Accepted (first part: the Dispatch page. Stan's "Did you know" cards for drivers follow.)

## Context
Mike (17 Nov 2026): after the first weeks of use, start analysing what's been collected, report findings and propose improvements, on the dispatch board; and later have Stan pass the relevant ones to each driver. At the time there were 9 delivery days: about 2,900 ticks, 45 runs, 12 complaints, 26 photos.

## Decision
- **Dispatch → Insights.** Pick the dates (the last four weeks to start with). Each finding is a card: a plain title, what was found, **a suggestion**, any table, and **what it's based on**. Cards are sorted: *Do something*, *Keep an eye on*, *Working well*, *For interest*. **Copy as text** makes a version to paste into a message.
- **Fixed sums, not guesswork** (`js/insights.js`, tested in `test/insights.mjs`): the same dates always give the same findings, and every number can be explained.
- **What it looks at**
  - **Deadlines:** each run's last app tick of the morning against 6 am (weekdays) or 7 am (weekends and holidays). A run late on half its mornings or more is a *Do something*, with how late, when it usually starts, and how much earlier it needs to begin.
  - **Time on the road:** time street by street (gaps between ticks; breaks over 10 minutes left out), short streets that cost over 2 minutes a stop, and streets a run leaves and comes back to on most mornings.
  - **Proof:** share of app ticks with GPS, by person, so a phone with Location switched off shows up; deliveries signed off on paper; and ticks made **away from the letterbox**: more than 60 m from where that address is usually ticked.
  - **Complaints:** per thousand deliveries, by type and run, how many our own records can answer, addresses that complain more than once, and complaint addresses with no photo.
- **Three headline numbers at the top** (Mike, 17 Nov 2026), each as a percentage or time with the count beside it:
  - **DIFOT:** stops delivered in full, on time, out of the stops that can be measured. *In full* = ticked delivered, not short and not "couldn't deliver". *On time* = ticked by that morning's deadline (6 am weekdays, 7 am weekends and holidays). Stops never ticked count against. Stops signed off from the paper sheet have no time, so they are counted beside the figure, not in it. (The Overview's daily DIFOTIS table is a different measure: its "on time" is the address's own time rules.)
  - **Complaints:** complaints about or received in the dates, as a share of every delivery recorded.
  - **Runs finished on time:** runs whose last stop was ticked by the deadline, out of the runs with times.
- **Run by run, underneath** (Mike, 17 Nov 2026, replacing a single average across all runs): a tile for each run with its **average completion time** (first tick to last tick of the morning), and beneath it: time **per delivery**, stops, when it usually starts and is usually done by, mornings on time, its own DIFOT, quickest and slowest morning, complaints, and mornings done on paper. A run delivered in one drop is shown and tagged.
- **Enough evidence first.** A pattern needs 3 mornings. With under 14 delivery days the page says the findings are early: pointers, not verdicts.
- **A run delivered in one drop** (ticks seconds apart at one spot, like Run 8's village) is recognised and left out of street times and the letterbox check: that is how it's meant to be done.
- **A stray tick isn't the run:** only ticks within 5 hours before and 4 hours after the deadline count as that morning.
- **People:** tables by person appear only here, for dispatchers. Drivers will see only their own numbers (Mike, 17 Nov). Findings state facts and suggest; nothing gives a person a score.

## Consequences
"Away from the letterbox" compares each tick with that address's own usual spot, so if an address is ticked from the wrong place most mornings, that becomes its usual spot and is not flagged. Runs done from the paper sheet have no times, so they are missing from the deadline and street findings and counted only under Proof. The page reads every tick for the dates each time it's opened (tens of thousands a month); if that gets slow, the sums move into the database.
