# 0015. Closing a paper run adds paper ticks, it doesn't mark the run done

- **Date:** 2026-11-09
- **Status:** Accepted

## Context
During the trial some runs are done on the paper sheet (Mike, 9 Nov 2026). Dispatch needs to close those runs and record who did them, so progress, complaints and DIFOTIS aren't left showing an untouched run.

## Decision
Closing is a property of the run (`driver`, `closed_at`, `closed_by`, `close_method`, `close_note`), and a paper run's unticked stops get ticks entered by Dispatch in the driver's name at the finish time, marked `method = 'paper'`. The alternative, a "closed = everything delivered" flag on the run, was rejected: every report and the complaint register would need to know about it, and a tick per stop is how everything else already works. Ticks are never edited ([0014](0014-governance-baseline.md)); reopening adds `undone` entries for the paper ticks only. Only dispatchers can do any of it, enforced in the database.

## Consequences
Paper ticks carry no GPS, so learned positions and delivery order ignore them. A complaint against a paper run shows the driver's name with "paper", which is weaker evidence than an app tick with GPS; the complaint page says so.
