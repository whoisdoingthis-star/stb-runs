# 0057. Duty hard lines: odometer before the first stop, the last delivery ends the shift, and no walking off a run

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
Until now nothing ever stood between a driver and a tick: the odometer and spares questions had a Skip button ([0042](0042-spares-and-pinned-rules.md), [0045](0045-kilometres.md)), and Off duty was always allowed. After the run of Sunday 22 Nov 2026, Mike set three hard lines:

> "Drivers: they mustn't be able to start a run until they have entered the odo. When the last delivery is made, it must put them off duty, including any helpers. Lisa and I shared a run on 13 this morning, there were still some addresses left for her part, but I clicked off duty, and it allowed me to enter the odo, spares etc."

Asked about the edges, he chose: ticking is blocked too until the odometer is in; going off duty with stops left is allowed only as a hand-over; and the driver must enter the end odometer and spares.

## Decision
These apply to **drivers** (`members.crew = 'driver'`) and to **today's** runs. Helpers are never locked.

1. **Odometer before the first stop.**
   - *Leaving the depot now* and *Prepped: starting the run* open the spares and odometer sheet first. There is no Skip. The run only starts (the `on_run` record) once the odometer is saved. *Not leaving yet* leaves the driver on duty at the depot.
   - A driver who is not on duty, or is on duty without today's start odometer, **cannot tick** a stop on today's runs. The tap explains why and offers the way through on the spot: *Go to On duty*, or the odometer sheet itself. Unticking, yesterday's runs and everything a helper does are untouched.
   - This reverses the earlier rule that ticking is never blocked by a prompt, for drivers only.
2. **The last delivery ends the shift.**
   - When the last stop of a person's last run is ticked, they are put off duty at that moment (`source = auto`). With no runs picked, it is when all of today's runs are done, as before ([0038](0038-auto-off-duty.md)).
   - **Helpers go off with their driver.** The database does it, so it holds even if a helper's phone is in a pocket: when a driver's `off_duty` is added, an `off_duty` is added for each helper the driver named and for anyone who said they were helping that driver, unless they have since gone on duty with someone else. The helper's phone catches up the next time it is opened.
   - The **driver is then asked for the end odometer and spares**, with no Skip. The end reading can't be lower than the morning's. If the sheet is closed it comes back on the Runs page until it is entered. The morning's card follows.
3. **No walking off a run.** If any of a person's runs still has stops to do, *Off duty* becomes a hand-over: they must say **who is finishing them**, or that they **can't carry on** (unwell, car trouble, something else). It is recorded (`handover_to` or `reason`) and shown on the dispatch board. *Not yet: keep delivering* is the main button. A driver handing over still enters their own car's end odometer.

## Consequences
- A shared run (two cars on Run 13) now ends in one of two ways: the first car hands over to the second and goes off duty, or stays on duty until the run's last stop is ticked and is put off duty with it.
- The start odometer is remembered on the phone for the day. A driver who changes phone mid-shift is asked for it once more on the new one.
- The lock goes by the crew list. If a phone has never loaded it (first sign-in, opened straight onto a run, no signal), nobody is locked: a wrong lock at 3 am is worse than a missed reading.
- If the odometer sheet itself fails to open, the app carries on as if it had been answered. The lock must never trap anyone.
- Helpers without a login have no duty records, so there is nothing to end for them.
- Dispatch corrections are not affected.
- Checked by `test/e2e-hardlines.py`, `test/e2e-plan.py`, `test/e2e-duty.py`; the database rule was checked against the duty records of 21 and 22 Nov (Mike's off-duty would have ended Zaph's shift and left Lisa's crew alone).
