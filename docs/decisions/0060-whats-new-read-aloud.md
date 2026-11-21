# 0060. What's new goes back to the first live trial, and Stan reads it aloud

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
What's new ([0059](0059-whats-new.md)) started with the changes of 21 and 22 Nov. Mike (22 Nov 2026): "apply what's new from beginning of month for all functionality updates that are still relevant today. If possible, can we have Stan talk us through it like we do with Ollie's walk through?"

## Decision
1. **Back-filled.** Nineteen more cards cover what was built from the first live trial (8 Nov) that still applies today: ticking, photos, couldn't-deliver, what to load, the co-driver and Maps, On duty and My runs, the finish time, ideas, Ping, new-start photos, the game, "Did you know", asking before an untick, the day plan, the crew check, the notice board, Your morning, and for dispatchers the morning watch, Find a delivery, the report and Insights. Things since replaced (the old order switch, the first openings) are left out. Each carries its original date, so the walk-through reads as the story of the month.
2. **The window is a month and forty cards** (it was two weeks and twelve), so the back-fill reaches everyone. That makes a first walk-through long: 29 cards for a driver, 25 for a helper, 32 for a dispatcher who drives. It can be closed at any card and picks up where it stopped.
3. **Stan reads the cards aloud.** Every card has a spoken version of 300 characters or fewer, written for the ear (`say` in `js/whatsnew.js`), which becomes one of Stan's lines (`news.<card id>`) and is recorded like any other on **Dispatch → Set-up → Stan's voice**. On a card, **🔊 Stan, read it to me** plays it; after that each next card is read too, until **🔇 Stop reading**. Phones only allow sound after a tap, so he can't start by himself.
4. **Fetched when asked for.** A read-aloud clip is about ten times the size of a normal line, so phones don't download them all in advance like his short lines: a clip is fetched the first time someone taps the speaker for that card, then kept. It needs signal that first time.
5. **Words first.** If a card hasn't been recorded, there's no signal, or the phone won't make sound, he says so in a line and the card's words are all still there. Stan hidden: no speaker button.

## Consequences
- Recording the 32 spoken cards uses about 6,000 of the ElevenLabs credits (5,947 characters) (one press of **Record the 32 that are missing**), from the key capped at 20,000.
- A new card means a new line to record, or that card is silent until someone records it. The Stan's voice page shows what's missing.
- The spoken version is separate text from the written one, so the two can drift. The test checks every card has both and that the spoken one has no symbols; it can't check they say the same thing.
- A month's window means someone joining in mid-December would be walked through late November. Bring it back down once the family has been through the back-fill.
- Checked by `test/whatsnew.mjs`, `test/stanlines.mjs` and `test/e2e-whatsnew.py`. Not yet heard on a phone.
