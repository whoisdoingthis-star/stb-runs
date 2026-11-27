# 0081. Voice-to-Laptop Bridge: a cloud lane, so cloud-safe jobs run with the laptop off

- **Date:** 2026-11-28
- **Status:** Proposed (waiting for Mike's yes before anything is built)
- **Stated by:** Mike, 28 Nov 2026: "Is there a way to bridge via google drive, so that my laptop doesn't need to be on?", then, on the suggestion to send cloud-safe jobs to a cloud session and keep laptop-only jobs on the laptop: "Re cloud safe jobs, yes please."

## Context
The bridge ([0070](0070-laptop-bridge.md), [0073](0073-bridge-chunked-builds-and-caps.md), [0076](0076-bridge-shared-notes.md)–[0078](0078-bridge-backups-and-rollback.md)) hands work to **one** runner: the listener on Mike's Windows laptop. When the laptop is off or asleep, every job waits, even jobs that never needed the laptop: reading a repository, research on the web, a draft in Drive, a look at the database.

Google Drive can't be the runner: it only stores files and runs nothing. Apps Script runs in Google's cloud ([0079](0079-nightly-backup-to-drive.md)), but only small fixed scripts, not open-ended Claude work. What does run Claude without the laptop is a **cloud Claude Code session**, the same kind this project's threads already are, started by a **scheduled task** in Mike's account.

Today `bridge_claim_job` hands any queued job to whichever device asks, and only one job runs at a time across the whole bridge. So a second runner needs the queue to know where each job may run.

## Decision
1. **Two lanes, one queue.** Each job gets `runs_on`: `laptop` or `cloud`. Same table, same codes, same Allow, cancel, caps, notes and log; only who may pick a job up changes. The laptop's claim only takes `laptop` jobs (a change on the database side, nothing to change on the laptop); the cloud runner only takes `cloud` jobs. One job at a time **per lane**, so a long laptop build doesn't hold up a cloud lookup.
2. **What is cloud-safe** (the test the session that queues the job applies, in this order):
   - **Laptop only** if it touches files or apps on the laptop (the `sandbox` and `mods` folders, anything under `Projects\` that isn't a GitHub repository), needs a program only the laptop has, or needs a site signed in only in the laptop's browser.
   - **Cloud** if all it needs is: the two GitHub repositories (`stb-runs`, `planbench`), the web, reading the STB database, Google Drive, Docs, Sheets, Gmail drafts or Calendar through Mike's connectors.
   - **Not either:** STB app code changes still go through voice builds ([0065](0065-voice-builds.md)), which owns that path; and Mike's two exceptions hold everywhere: nothing that changes or deletes live database records or spends money is queued.
   - In doubt, it goes to the laptop. A cloud job that turns out to need the laptop is handed back (`bridge_reroute(code, 'laptop')`), not failed, and says why.
3. **Targets say the lane.** Cloud targets are named `cloud:<what>`: `cloud:stb-runs`, `cloud:planbench`, `cloud:web`, `cloud:google`. Laptop targets stay as they are. `bridge_enqueue` sets `runs_on` from the target, so voice only has to say "send it to the cloud" or name the target. Like the laptop's folder list, the cloud's list of targets is kept **outside the database** (in the cloud runner's instructions and its environment's repositories), so the database can't point it anywhere else.
4. **The cloud runner** is a scheduled task in Mike's Claude account that starts a **fresh cloud session** in an environment holding the two repositories, with the Supabase connector and the Google connectors only. Each time it runs it:
   - asks the database for one cloud job (`bridge_claim_cloud()`); if there's none, it ends straight away, so an empty run costs almost nothing;
   - works the job inside its target, checking `bridge_cloud_should_stop(job)` between steps (cancel or the kill switch stops it), and calling `bridge_checkpoint` after each committed step as the laptop does;
   - writes the result back with the same finish function, so the shared note appears by itself ([0076](0076-bridge-shared-notes.md));
   - in a repository, works on a `bridge/<code>` branch and may open a **draft** pull request; never merges, pushes to `main` or deploys (the same rule as the laptop).
5. **When it runs.** Every hour from 7 am to 10 pm NZ (16 runs a day, the hourly minimum scheduled tasks allow). Nothing overnight, the same quiet window as voice builds, while the paper runs are on. Any chat or Claude Code session that queues a cloud job also **starts the runner straight away**, so typed requests are picked up within a minute or two; a request from voice mode waits for the next hourly run. *(Hours made by Claude on Mike's behalf: change any time.)*
6. **Same controls as the laptop (parity):**
   - **Kill switch:** `bridge_pause(true)` stops both lanes and the running cloud job at its next step. The laptop's `STOP` file still only stops the laptop.
   - **Caps:** the daily caps (20 jobs, 300 minutes) count both lanes together: it's one Claude plan.
   - **Allow:** anything iffy waits in `awaiting_allow` as now; big builds need an estimate and Mike's Allow.
   - **Time and turns:** the same limits per job; the database pauses or times out a cloud job that stops reporting, as it does for the laptop.
   - **Log:** every step in `bridge_job_log`, with `cloud` as the device.
   - **Status:** `bridge_status()` shows the cloud lane beside the laptop (last run, anything waiting, `over_cap`).
7. **Auth and secrets.** The cloud runner needs **no new secret**. It reaches the database through Mike's Supabase connector, which calls server-only functions the public key can't (revoked from `anon` and `authenticated` by name, lesson L-015), so `bridge_claim_cloud` and `bridge_cloud_should_stop` don't take a device secret. GitHub goes through the Claude GitHub app's existing access to the two repositories; Google through Mike's connectors. No key is put in a prompt, a job, a note or this repository. *(Made by Claude on Mike's behalf: a device secret would have to live in the scheduled task's prompt, which is less safe than the connector it would sit beside.)*
   - **The trade-off, said plainly:** the Supabase connector can do anything in the database, so "don't change live records" is a rule the runner follows, not one the database enforces. It is the same rule every chat session with the connector already follows. The runner's instructions say it outright, and any job asking for it is held for Mike.
8. **What stays laptop-only:** the laptop's folders and apps, the `sandbox` and `mods` work, the daily bridge copy and folder snapshots ([0078](0078-bridge-backups-and-rollback.md)), anything signed in only on the laptop. Drive remains storage, and Apps Script stays for small fixed jobs like the nightly backup.

## Not chosen
- **Drive as the queue or runner:** Drive can't run anything; a file-watching script would just be a slower, less controlled copy of the queue we already have.
- **A GitHub Actions job with a Claude key** (the voice builds way): spends money per run and its logs are public; this lane uses Mike's own plan and private sessions.
- **Sending every job to the cloud when the laptop is off:** a laptop-only job run in the cloud would fail or, worse, guess. Jobs never switch lanes by themselves; a session may offer Mike to re-queue one.

## How it would be built (after Mike's yes)
1. Database (`sql/schema.sql`, `docs/data-model.md`, tests in `test/sql.mjs`): `runs_on` on `bridge_jobs`; `bridge_enqueue` sets it from the target; `bridge_claim_job` takes only laptop jobs and one at a time per lane; new server-only `bridge_claim_cloud`, `bridge_cloud_should_stop`, `bridge_reroute`; a `cloud` row in `bridge_devices` with no secret (it can't use the laptop's functions); `bridge_status()` shows both lanes. This changes live bridge functions, so it is applied with Mike's go-ahead.
2. The scheduled task and its environment, set up in Mike's account, with the runner's instructions in `docs/runbook.md`.
3. The `laptop-bridge` skill learns "send it to the cloud" and the cloud-safe test.
4. A test job each way: a cloud job with the laptop off, a laptop job that stays waiting for the laptop, one handed back, and the kill switch stopping a cloud job.

## Consequences
- Cloud-safe jobs no longer wait for the laptop; laptop jobs are unchanged.
- Each cloud run uses Mike's Claude plan, like laptop jobs. Empty hourly checks are a few seconds each. No money is spent.
- The bridge now has two runners to watch; `bridge_status()` and the shared notes show both.
