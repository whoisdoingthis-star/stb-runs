# 0036. Stan's "Did you know…" cards for drivers

- **Date:** 2026-11-17
- **Status:** Accepted (the second part of [0035](0035-insights.md))

## Context
Mike (17 Nov 2026): have Stan pass the findings on to each driver in the app, as a recommendation or simply a "Did you know…" they can take on board or just find interesting. After seeing the Insights page: "Let's start publishing them to the driver."

## Decision
- **One card a day at most**, on the Runs page, **never while on duty**, and not at all with Stan switched off. Nothing pops up over a run.
- **Only your own numbers**, from your own ticks and the runs you drove (a run is yours on a morning when you made most of its ticks). A card never names anyone else. Comparisons between people stay on the dispatch board.
- **Two kinds, taking turns** so it doesn't nag:
  - **Stan's tip** (yellow edge): your phone isn't recording GPS; a share of your ticks were made away from the letterbox; a run you drive keeps finishing after its deadline, and how much earlier to start; an address on your run has complained more than once.
  - **Did you know…** (blue edge): papers delivered, your quickest morning on a run, your time per delivery, the street that takes you longest, a run of on-time mornings, your earliest start.
- **Three answers:** *Got it*, *👍 More*, *👎 Less*. "Less" rests that kind of card for a month; "More" brings that kind forward. A card isn't repeated within a week (a fortnight for the just-interesting ones).
- **Same sums as Insights** (`driverCards` and `pickCard` in `js/insights.js`, tested), over the last 14 days, with the same rule that a pattern needs three mornings.
- Worked out **once a day** on the phone and kept there; answers and what's been shown are kept on the phone too. No new table.
- Wording: facts and a suggestion in Stan's voice. No scores, no percentages against other people ("about 1 in 5 of your ticks", not a league).

## Consequences
Working the cards out reads the last two weeks of ticks once a day (a few hundred kilobytes); with no signal there's simply no card until next time. Because answers live on the phone, a new phone starts fresh. The card is shown silently: Stan doesn't read it aloud.
