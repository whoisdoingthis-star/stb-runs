# 0081. STB work runs in the cloud by default; the laptop bridge is for laptop-only work

- **Date:** 2026-11-28
- **Status:** Proposed (the plan is agreed; the database part waits for Mike's go-ahead before it is built)
- **Stated by:** Mike, 28 Nov 2026: "Is there a way to bridge via google drive, so that my laptop doesn't need to be on?", then "Re cloud safe jobs, yes please." His *Laptop Bridge* project then reviewed every job and set bridge decision **B012** ("cloud by default"), and Mike agreed this record should follow it.

## Context
The bridge ([0070](0070-laptop-bridge.md), [0073](0073-bridge-chunked-builds-and-caps.md), [0076](0076-bridge-shared-notes.md)–[0078](0078-bridge-backups-and-rollback.md)) hands work to **one** runner: the listener on Mike's Windows laptop. When the laptop is off, every job waits, even jobs that never needed it.

Google Drive can't run anything: it only stores files. Apps Script runs in Google's cloud ([0079](0079-nightly-backup-to-drive.md)), but only small fixed scripts. What runs Claude without the laptop is a **cloud Claude session**, the kind this project's threads already are, or a **cloud scheduled task** that starts one.

On 28 Nov Mike's *Laptop Bridge* project reviewed all his jobs and recorded **B012**: *cloud by default*. Web checks, connector work (Gmail, Drive, Supabase), repository work and reports run as cloud sessions or cloud scheduled tasks; only laptop-only work (local Windows files, desktop apps, a browser signed in only on the laptop) goes through the bridge listener; and Mike is asked before any live job is disabled or moved. A cloud computer of our own was judged not worth it.

**Where STB stands (checked 28 Nov):** STB has no live job that needs the laptop. Its recurring work already runs in the cloud: the nightly backup and photo copies (Apps Script, [0079](0079-nightly-backup-to-drive.md), [0080](0080-photo-copies-and-size-watch.md)) and voice builds (GitHub, [0065](0065-voice-builds.md)). Every job ever put in the bridge queue was a `sandbox` test. So nothing has to be moved.

## Decision
1. **Cloud by default (B012) for STB.** STB work is done in cloud sessions: this project's threads for typed requests, cloud scheduled tasks for anything recurring, voice builds for app changes. None of it needs the laptop on.
2. **The bridge listener is for laptop-only work.** A job goes to the laptop only if it touches files or apps on the laptop (the `sandbox` and `mods` folders, anything under `Projects\` that isn't a GitHub repository), needs a program only the laptop has, or needs a site signed in only in the laptop's browser. Everything else, including the two repositories, the web, reading the database and Google Drive, Docs, Sheets, Gmail drafts and Calendar, is cloud work.
3. **Unchanged everywhere:** STB app code changes go through voice builds ([0065](0065-voice-builds.md)); nothing that changes or deletes live database records or spends money is queued or scheduled without Mike in the chat; and no live job is disabled or moved without asking Mike (B012).
4. **A cloud lane in the queue, for hand-offs only.** Most cloud work never touches the queue. But voice mode and scheduled tasks can't start a cloud session themselves, and today they can only hand work to the laptop. So the queue gets a second lane, and those hand-offs run with the laptop off:
   - Each job gets `runs_on`: `laptop` or `cloud`, set from its target. Cloud targets are `cloud:stb-runs`, `cloud:planbench`, `cloud:web` and `cloud:google`; laptop targets stay as they are. Voice only has to say "send it to the cloud".
   - The laptop's claim takes only `laptop` jobs (a database change; nothing changes on the laptop). One job at a time **per lane**.
   - Cloud by default applies here too: a job with no clear need for the laptop goes to the cloud. A cloud job that turns out to need the laptop is handed back (`bridge_reroute(code, 'laptop')`) with the reason, not failed. Jobs never switch lanes by themselves the other way.
   - Like the laptop's folder list, the cloud's list of targets lives **outside the database** (in the cloud runner's instructions and its environment's repositories), so the database can't point it anywhere else.
5. **The cloud runner** is a cloud scheduled task in Mike's account that starts a **fresh cloud session** with the two repositories and only the Supabase and Google connectors. Each run it:
   - asks for one cloud job (`bridge_claim_cloud()`) and ends at once if there's none, so an empty run costs almost nothing;
   - works inside the job's target, checks `bridge_cloud_should_stop(job)` between steps, and calls `bridge_checkpoint` after each committed step, as the laptop does;
   - finishes with the same finish function, so the shared note appears by itself ([0076](0076-bridge-shared-notes.md));
   - in a repository, works on a `bridge/<code>` branch and may open a **draft** pull request, never merging, pushing to `main` or deploying (the laptop's rule).
   It runs every hour from 7 am to 10 pm NZ (the hourly minimum scheduled tasks allow), and not overnight, the same quiet hours as voice builds while the paper runs are on. A session that queues a cloud job also starts the runner straight away. *(Hours made by Claude on Mike's behalf: change any time.)*
6. **The same controls as the laptop:**
   - **Kill switch:** `bridge_pause(true)` stops both lanes, and the running cloud job at its next step. The laptop's `STOP` file still stops only the laptop.
   - **Caps:** the daily caps (20 jobs, 300 minutes, kept by Mike on 28 Nov) count both lanes together, because it's one Claude plan.
   - **Allow, time and turns, log, status:** as now. Iffy jobs wait for Allow; big builds need an estimate; the database pauses or times out a cloud job that stops reporting; every step is in `bridge_job_log` with `cloud` as the device; `bridge_status()` shows both lanes.
7. **Sign-in and secrets.** The cloud runner needs **no new secret**. It reaches the database through Mike's Supabase connector, which can call the server-only functions the public key can't (revoked from `anon` and `authenticated` by name, lesson L-015), so the new cloud functions take no device secret. GitHub goes through the Claude GitHub app's existing access; Google through Mike's connectors. No key goes in a prompt, a job, a note or this repository. *(Made by Claude on Mike's behalf: a device secret would have to sit in the scheduled task's prompt, which is weaker than the connector beside it.)*
   - **Said plainly:** the Supabase connector can do anything in the database, so "don't change live records" is a rule the runner follows, not one the database enforces. Every chat session with the connector already works under the same rule. The runner's instructions say so, and any job that asks for it is held for Mike.
8. **Stays on the laptop:** the bridge heartbeat and listener, the laptop's folders and apps, the `sandbox` and `mods` work, the laptop's own copies and snapshots ([0078](0078-bridge-backups-and-rollback.md)), and anything signed in only there. Drive stays storage; Apps Script stays for small fixed jobs like the backup.
9. **Sessions working on shared things claim them first** (Mike's standing rule in the shared notes, 28 Nov): read the bridge notes, write a claim note for the files, the next decision or migration number and any database change, and release it with a handover note when done.

## Not chosen
- **Drive as the queue or runner:** Drive runs nothing; a file-watching script would be a slower, less controlled copy of the queue.
- **A cloud computer of our own:** judged not worth it in the Laptop Bridge review (B012).
- **A GitHub Actions job with a Claude key** (the voice builds way) for the cloud lane: it costs per run and its logs are public. The cloud lane uses Mike's own plan in private sessions.
- **Sending laptop jobs to the cloud when the laptop is off:** a laptop-only job run in the cloud would fail or guess.

## How it is built (each step after Mike's go-ahead, because it changes live bridge functions or his account)
1. Database (`sql/schema.sql`, `docs/data-model.md`, tests in `test/sql.mjs`): `runs_on` on `bridge_jobs`; `bridge_enqueue` sets it from the target; `bridge_claim_job` takes only laptop jobs, one at a time per lane; new server-only `bridge_claim_cloud`, `bridge_cloud_should_stop` and `bridge_reroute`; a `cloud` device with no secret, which can't use the laptop's functions; `bridge_status()` shows both lanes.
2. The cloud scheduled task and its environment in Mike's account, with the runner's instructions in `docs/runbook.md`.
3. The `laptop-bridge` skill learns "send it to the cloud" and the laptop-only test.
4. Tests: a cloud job with the laptop off; a laptop job that stays waiting for the laptop; one handed back; the kill switch stopping a cloud job.

## Consequences
- STB needs no change today: its live work is already cloud and nothing moves.
- Once the lane is built, hand-offs from voice and scheduled tasks no longer wait for the laptop. Laptop jobs are unchanged.
- Each cloud run uses Mike's Claude plan, like laptop jobs. Empty hourly checks take a few seconds. No money is spent.
- The bridge has two runners to watch; `bridge_status()` and the shared notes show both.
