# 0038. Off duty automatically once all the day's runs are finished

- **Date:** 2026-11-18
- **Status:** Accepted (adds to On Duty, [0020](0020-on-duty-and-shifts.md))

## Context
Mike (18 Nov 2026): Lisa's app still showed her on duty the day after. People forget to tap Off duty. He asked that everyone still showing on duty is logged off automatically when all runs are closed.

## Decision
- **The rule** (`autoOffAt` in `js/shifts.js`, tested): if someone is still on duty and **every run for their shift's delivery day is finished**, their shift ends **at the moment the last run finished**, not at the moment it's noticed, so the hours stay true. A run is finished when it's **closed**, or when **every stop on it has been ticked** (the same rule that moves a run to History); its finish time is when it was closed, or its last tick. Mike asked for "closed"; the data showed runs are almost never closed by hand (none on 16 to 18 Nov), only fully ticked, so closed alone would never have fired.
- **On their phone:** the next time the Runs page opens, the app records that Off duty itself (marked *auto*, with that earlier time) and Stan says so.
- **In Dispatch:** the Shifts panel and the "on duty now" list apply the same rule straight away, so nobody shows as on duty after the runs are finished even if their phone hasn't been opened since. When the phone's own record arrives it carries the same time.
- **Left alone:** anyone already off duty; a day with any run unfinished; a day with no runs; someone who went on duty *after* the runs had finished.
- The earlier safety net stays: a shift left running over 12 hours is still cut at the last activity.

## Consequences
A run with one stop left unticked (like Run 13 on 18 Nov until it was corrected) keeps people on duty until that stop is dealt with or the run is closed in Dispatch. The duty history is still only ever added to.
