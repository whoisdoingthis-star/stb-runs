# 0044. Your morning: Stan's end-of-shift summary

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike (21 Nov 2026): when the runs are finished, Stan should pop up with a quick summary of that person's shift: time on the run, papers, stops, an efficiency figure, and a line graph of that figure over time. Until now a driver got nothing back for a morning of ticking.

Discussed and agreed the same day:
- **Efficiency is against your own usual**, not stops per hour. Stops per hour flatters whoever does the village (68 stops in 9 minutes) and can't compare a morning with a helper to one without.
- **Speed alone shouldn't be cheered**, so quality sits beside pace. Mike added tick quality: where the tick was made against where that address is expected.
- The earlier rules stand: a person sees only their own numbers, and nothing is a score or a ranking ([0036](0036-stan-did-you-know.md)).

## Decision
**When it shows**
- After **Off duty** (once the spares question is answered or skipped).
- Or the next time the app is opened while off duty, once a day, if every run that has been started is finished. So someone logged off automatically still gets it, and nobody gets it while a crew is still out.
- A **📈 Your morning** button on the Runs page brings it back that day. Never while on duty.

**Whose morning** (corrected by Mike the same day) The numbers belong to the **driver**.
- A driver's card covers the runs their crew did: the driver plus the helpers they named going on duty. A run counts as theirs if that crew made at least a third of its ticks.
- A **helper inherits the stats of the driver they were with that day**, and the card says whose numbers they are. Their pace is against that driver's usual.
- A helper's **history** is each day's driver: if they help Lisa on Monday and Mike on Tuesday, their graph shows Lisa's Monday and Mike's Tuesday. A driver's history is all their own mornings, whoever helped.
- Who was with whom comes from the on-duty answers ([0041](0041-crew-check-and-notice-board.md)); the driver's answer is the boss. These only exist from 20 Nov 2026, so a helper's history starts there, and a helper who was with nobody that day has no card.

**What it shows** (`js/shiftsummary.js`, tested)
1. **The outcome first:** when the last paper went out, and how many minutes before or after the deadline.
2. **The shift:** time at the depot (On duty to leaving, when they went on duty), time on the run (first tick to last), stops ticked, papers on those runs' sheets.
3. **Pace:** minutes quicker or slower than the middle of the crew's own earlier mornings on the same runs (three mornings on a run are needed first; within 3% is "right on your usual"). A run ticked all together can't be timed: it is left out and the card says so.
4. **A line graph** of that pace over the crew's last 14 mornings: above the dotted line is quicker than usual; today is the big dot. It has a text description for screen readers.
5. **Quality:** every stop ticked, or how many of how many; any marked not delivered; the share of ticks made **at the address** (within 60 m of where that address has usually been ticked, the same test as Insights; needs ten checkable ticks); and ticks with **no location**, shown separately with "check location is switched on".
6. **Stan's reaction**, up to three lines chosen from his recorded lines ([0043](0043-stan-recorded-voice.md)): one for the outcome, one for the pace, one for the ticks. For now they are shown as words; he'll say them when the new voice is wired into the app.

## What it does not do
- No comparison between people on the phone, and no points. Comparisons stay on the Dispatch Insights page.
- It doesn't include complaints for the day: those arrive days later.
- It needs signal (it reads the last four weeks of ticks). With none, the button says to try again later.

## Consequences
The pace figure is only as honest as the ticking: ticking late or in a batch changes both the time and the tick-quality figure, which is why they are shown together. A crew's "usual" mixes mornings with and without a helper until there are enough labelled shifts to separate them.
