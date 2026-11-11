# 0020. On Duty, My runs and a shift timeline with no gaps

- **Date:** 2026-11-12
- **Status:** Accepted

## Context
Mike (12 Nov 2026): drivers should tap **On duty** when they reach the depot, so the time counts sorting and loading too; a sensor should switch them to **On the run** when they drive off; a driver should be able to group the runs they're doing so the app moves on to the next one by itself. That morning Mike finished Run 6, Mum rang for help with the last 4 stops of Run 11, then he went on to Run 13. Run 13's clock only started at its first tick, so the minutes between the last Run 11 tick and the first Run 13 tick belonged to nothing.

## Decision
- **Duty changes are their own record** (`duty_events`): on_duty, on_run (with the run, and whether it came from a tap, driving, the first tick or moving on), off_duty. Added, never edited, like ticks; saved on the phone first and sent when there's signal.
- **On the run is automatic**: about 30 seconds above 15 km/h with a good GPS fix while a run is open, or the first tick, whichever comes first. Walking letterboxes never trips it. No background tracking: only while the app is open.
- **My runs** is a per-phone list for the day, in the order tapped. They open together; when one is finished the list moves to the next and that moment is recorded as *moved on*. Finishing someone else's run (helping) offers to go to your next one.
- **Every minute of a shift belongs somewhere** (`js/shifts.js`): depot, driving to a run, own runs, helping, stopped (10+ minutes with no tick inside a run), between runs, after the last stop. The gap after helping counts as *driving to* the next run, so it shows against that run.
- **Helping counts for the helper** (shown as Helping, with whose run it was); the run's own time still comes from its ticks, so the owner's figures aren't changed.
- **The depot is a setting** (`app_settings`), set in Dispatch by pasting a long Google Maps link or standing there and using the phone's location. Short links can't be read from the app (they redirect through Google), so it asks for the long one.
- A shift with no Off duty ends at the last tick after 12 hours; ticks after Off duty (an evening correction) aren't part of the shift.

Not chosen: a geofence that puts people on duty by itself (needs background location, which a web app can't do reliably and which we don't want); per-run timers that run while you're elsewhere.

## Consequences
Run times now include getting to the run. People who never tap On duty still get a shift from first to last tick, marked as such. The Runs page asks for GPS only once it's already been allowed for a run.
