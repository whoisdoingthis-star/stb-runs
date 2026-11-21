# 0053. Clean mornings in a row, with one let-off a week, and the family's week

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike (21 Nov 2026) asked for "gamification psychology" to keep people "engaged, motivated, and avoiding autopilot mode errors". The standing rules ([0044](0044-end-of-shift-summary.md)) still apply: reward accuracy and clean mornings, never speed; people see only their own crew's numbers; findings state facts and don't score people; nothing game-like while on duty.

What the business needs from a morning, beyond papers in boxes, is a record that can be trusted when a complaint comes in: each stop ticked as the paper went in, at the address.

## Decision
1. **A clean morning** is a crew's morning where
   - no run was ticked in one go afterwards (the same test Insights uses for "ticked in a burst"), and
   - at least 90% of the ticks that can be checked were made within 60 m of where that address is usually ticked. With fewer than 10 checkable ticks there is nothing to judge by, and the morning is not marked down.
   Time plays no part. A stop that couldn't be delivered and was recorded properly doesn't count against it: recording it is the right thing to do.
2. **The count** is clean mornings in a row. Days not worked don't break it. A helper's mornings are those of the driver they were with that day ([0044](0044-end-of-shift-summary.md)).
3. **One let-off a week** (Monday to Sunday). The first morning in a week that isn't clean is let go: it isn't counted, and the run carries on. A second in the same week starts the count again. A streak that can be lost to one bad morning makes people give up on it, or worse, tick to protect it.
4. **Best so far** is kept on the phone, so it survives past the four weeks the count is worked out from.
5. **The family's week.** One line: how many crew-mornings this week were clean, out of how many. No names, no ranking.
6. **Where it shows.** On the **Your morning** card after the shift, with the plain reason when a morning wasn't clean, and as one small line under **On duty** before the next shift (from the last card shown on that phone: nothing is fetched for it). Never while on duty.
7. **Stan.** His "Three clean mornings in a row" line is said on the third. A short rising phrase plays when the count is two or more and today was clean.

## Consequences
- Nothing is stored in the database: the count is worked out each time from the same runs and ticks as the card, so changing the rule changes everyone's count from the next card.
- A phone with location switched off has few checkable ticks, so its mornings are not marked down for position (the card already flags missing location separately).
- If the rule ever starts shaping ticks in a bad way (ticking early to stay near the usual spot, say), change the rule here before anything else.
- Not built: a shared weekly goal with a target, badges, or anything comparing people.
- Checked by `test/streaks.mjs` and `test/e2e-summary.py`.
