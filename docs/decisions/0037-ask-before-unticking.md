# 0037. An older tick asks before it's unticked

- **Date:** 2026-11-18
- **Status:** Accepted

## Context
Wed 18 Nov 2026, Run 13: 36 Clifton Road showed as not delivered. The record showed it ticked at 5:48 am (a slip, before the run had started) and unticked at 6:17:41, exactly when the driver reached it. He had delivered the paper and tapped the tile to record it; because the tile was already green, the tap switched it off. Mike confirmed that reading. Tapping a green tile unticked it with no question.

## Decision
- A tap on a ticked tile still unticks straight away when the tick is **under a minute old and your own**: that is a slip being fixed, and the Undo button works as before.
- Otherwise (ticked more than a minute ago, or by someone else) the app asks **"Already ticked"**, says when and by whom, and offers:
  - **✓ Delivered just now**: keeps it ticked and records a new tick with the time and place from now. This is the answer for a driver standing at the letterbox.
  - **Untick it**: it hasn't been delivered yet.
  - **Leave it as it is**.
- Nothing is ever rewritten: each choice adds a new record, so the earlier tick and the correction both stay in the history.

## The 18 Nov record
At Mike's request a correcting record was added for 36 Clifton Road on Run 13: delivered at 6:17:41 am, with the time and position copied from the driver's own tap at that moment, `method = 'correction'`, and a note in `reason` saying what happened and who asked. The 5:48 tick and the 6:17 untick are untouched. The delivery report shows such a record as "Corrected record" with its note. Corrections are added by hand, on a dispatcher's say-so, never by the app.

## Consequences
One extra tap when someone really does want to untick an older stop. A wrong early tick that nobody taps again still stands with its wrong time; Insights' "away from the letterbox" check is what shows those up.
