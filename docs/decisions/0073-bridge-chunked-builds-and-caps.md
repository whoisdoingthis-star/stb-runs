# 0073. Voice-to-Laptop Bridge, phase 3: chunked builds and caps

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, by voice, 28 Nov 2026 ("can we move to the next build"), building phase 3 of the agreed *Voice-to-Laptop Bridge* doc ("Handling big builds" and "Usage caps")

## Context
Phases 1 and 2 ([0070](0070-laptop-bridge.md)) gave the laptop a heartbeat and a job queue. The doc's next phase: a usage cap so a runaway loop can't burn Mike's plan overnight, without stopping a genuine big build halfway. Its three controls: **build in chunks** (each step commits, so a pause loses nothing), **pause, don't kill** (a build that hits its limit stops at a clean checkpoint and waits for Allow), and **declare it upfront** (a big build gives an estimate and Mike approves a bigger budget for that job only).

## Decision (database side, live 28 Nov)
- **Daily caps** in `bridge_control`: 20 jobs and 300 minutes a day (NZ day), set with `bridge_caps(jobs, minutes)`. *(The numbers were picked by Claude on Mike's behalf: well above a busy day so far, low enough to stop a loop. Change them any time.)* Each claim, a resume included, counts as a job and reserves its time budget. Over the cap, queued jobs wait; `bridge_status()` says `over_cap`.
- **Checkpoints:** the laptop calls `bridge_checkpoint(job, step, note, commit)` after each committed step. The job keeps the last one.
- **Pause, don't kill:** a job that runs out of time or turns after a checkpoint becomes `paused`, not `timed_out`, with the step it reached. One with no checkpoint still times out as before.
- **Allow carries on:** `bridge_allow(code, minutes)` re-queues a paused job from its checkpoint (`resume_count` goes up), optionally with more minutes for that job only (up to 240).
- **Big builds:** `bridge_enqueue(..., p_big => true, p_estimate_minutes => n)` waits for Allow, with the estimate as its budget and up to 300 turns. A big build Mike has allowed still runs over the daily cap: it's his call.
- Mike's two exceptions are unchanged: nothing that changes live records or spends money is queued.

## Not yet (needs the laptop)
The listener on the laptop isn't in this repository and can't be changed from a phone. Until it's updated, everything above works from the database side, but jobs make no checkpoints, so a job that runs out of time is still timed out, not paused. The listener change: when a job has `resume_count > 0`, give Claude Code the checkpoint and the earlier summary and ask it to carry on; ask it to commit after each step and report the step; call `bridge_checkpoint` for each; report running out of time as `paused`. Needs Mike at the laptop, or his say-so to add the bridge's own folder as a target.

## Consequences
- A runaway loop stops at 20 jobs or 300 reserved minutes a day; a declared big build doesn't.
- Older listeners keep working unchanged (same function names, extra parameters have defaults).
