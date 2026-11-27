# 0075. Four from the ideas book, each credited to whoever sent it

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026, who picked all four from Stan's ideas book and added: "Where builds in Stan are done based on users' feedback, the new functionality should highlight that it is their mod brought to life. I think this encourages user feedback when there's a visible feedback loop."

## Context
Four ideas had been waiting in the ideas book (Tell Stan an idea): two from Zaph (17 Nov), two from Lisa (19 and 22 Nov).

## Decision
1. **An undone tick doesn't start the clock** (Zaph: "Timer reset for runs accidentally ticked"). A tick followed by an untick of the same stop is left out of timing everywhere: the run screen's clock and finish estimate, Your morning and the shift summary (`keptTicks` in `js/rows.js`), and the dispatch board's `run_times`.
2. **Named route setups** (Zaph: "custom run configurations… e.g. Mum's Route, Dad's Route"). In My runs, *Save these as a named route…* keeps the runs in their order under a name (`route_setups`); one tap on the name picks them. Shared with the family, because the examples are other people's routes. *(Made by Claude on Mike's behalf: shared rather than per person, and a run that isn't on today is just skipped.)*
3. **Notes on tiles** (Lisa: "specific notes option for each tile"). One family note per address (`tile_notes`), shown on the tile with 📝, added from ⋯ → Note on a stop… or Problem → Add a note to this tile. *(Made by Claude on Mike's behalf: one shared note per address, not one per person, so what one person learns helps the next; 200 characters fits a tile.)*
4. **Bags** (Lisa: "No bags go to waste. Collect old ones from property, reuse. Don't deliver bags to boxes!!!"). A business rule, shown as a standing line on the On duty card.
5. **Credit:** a *What's new* card has an optional `idea` field; the card shows "💡 Zaph's idea, brought to life", and Stan's spoken version says whose idea it was. The rule applies to every future build from the ideas book.

## Consequences
- The ideas themselves stay marked *new* in the ideas book until Mike or a dispatcher marks them done (that is a change to live records).
- Tests: `test/rows.mjs` (kept ticks), `test/sql.mjs` (named routes, tile notes, the timer view).
