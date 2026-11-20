# 0050. On the run, Stan's plan line steps aside once the top card says ahead or behind

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
After [0049](0049-runs-page-follows-the-morning.md) the top card on the run grew, and the list of runs started at the very bottom of the first screen. Stan's plan line ("Depot by… first paper by…") was still shown under it, although by then both times are in the past and the top card already says how the run is going against the plan. Asked which way to go, Mike left the choice to Claude (21 Nov 2026: "I'll defer to your choice").

## Decision
While the top card shows **On plan**, **N min ahead** or **N min behind**, the plan card is hidden. It is there before the first tick, between runs until the next run's first tick, and whenever there is nothing to compare. The whole plan is still one tap away at any time from the pop-up Stan showed, and comes back by itself.

## Consequences
- The list of runs moves up by about one card while a run is under way.
- Done in styles only: the plan card is still on the page, so nothing else changes.
- Checked by `test/e2e-runs-page.py`.
