# 0058. Hardening the data: location on before a run, spares actually counted, damaged papers kept apart

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
After the duty hard lines ([0057](0057-duty-hard-lines.md)), Mike (22 Nov 2026): "We need to ensure we have quality data for analysis, so enforcing capturing of critical data is boss. GIGO as they say." Two soft spots were left: a phone with location switched off still ticked (those ticks are no use for kilometres, the route trace or the clean-morning check), and the spare count saved as zero without anyone counting. Offered both, he said "yes let's harden it", and added:

> "We need to capture 'spares' to mean 'spares, can be used to deliver', from extra papers that are either damaged or have a quality issue which we put those ones aside, and don't necessarily include them in our before and/or after counts. Hardened process should account for this."

## Decision
For **drivers**, on top of 0057:

1. **Location on before a run.**
   - Leaving the depot checks whether the phone lets the app use location. If it has never been asked, the phone asks then. If it is refused, the run can't start: the app says how to turn it on for an iPhone and for a Samsung/Android phone, with **I've turned it on: check again**.
   - If location is switched off part-way through, the next tick is held with the same message.
   - Only a clear refusal counts. No signal, a slow fix, a poor fix or a phone too old to say are never held against the driver. Where a tick was made is still for kilometres, routes and checking the record, alongside the time; it is not continuous tracking, and nothing is recorded between ticks.
2. **Spares are counted, not assumed.** On the start and end sheets each paper's spare count starts as **?**. It has to be answered: **+** for each spare, or **−** for none. A blank is refused; a zero has to be a counted zero.
3. **What a spare is.** A **spare** is an extra paper good enough to deliver. Extras that are **damaged or of poor quality** are put aside and counted on their own line (**damaged or poor**), which starts at 0. They are never added to the spares. Both sheets have both lines.
   - Saved as `spare_counts.counts` (good spares) and `spare_counts.damaged`.
   - The day's summary says them apart: "Herald: 3 at the start, 1 left · 2 Herald damaged or poor, set aside".

## Consequences
- Two more taps at the depot and at the end, at least.
- The damaged line is trusted at zero: it is the exception, and making it a required answer as well would be four required answers before leaving.
- Counts before 22 Nov 2026 may include damaged papers in the spares and may be uncounted zeros; treat them as rough.
- The damaged count is not yet reported anywhere beyond the day's line. If damaged papers become a pattern worth raising with the supplier, a count by day is one query away.
- Checked by `test/spares.mjs`, `test/e2e-plan.py` and `test/e2e-hardlines.py`. The phone's own location question can't be driven from a test, so the refusal is simulated; the real prompt needs trying on an iPhone and a Samsung.
