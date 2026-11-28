# 0081. STB work runs in the cloud by default; the laptop bridge is for laptop-only work

- **Date:** 2026-11-28
- **Status:** Accepted (built and live 28 Nov 2026)
- **Stated by:** Mike, 28 Nov 2026: "Is there a way to bridge via google drive, so that my laptop doesn't need to be on?", then "Re cloud safe jobs, yes please." His *Laptop Bridge* project then reviewed every job and set bridge decision **B012** ("cloud by default"), and Mike agreed this record should follow it, and then: "I'm keen to merge and build the cloud lane", "maybe less frequent checks, but able to be triggered by an event or on demand".

## Context
The bridge ([0070](0070-laptop-bridge.md), [0073](0073-bridge-chunked-builds-and-caps.md), [0076](0076-bridge-shared-notes.md)–[0078](0078-bridge-backups-and-rollback.md)) hands work to **one** runner: the listener on Mike's Windows laptop. When the laptop is off, every job waits, even jobs that never needed it.

Google Drive can't run anything: it only stores files. Apps Script runs in Google's cloud ([0079](0079-nightly-backup-to-drive.md)), but only small fixed scripts. What runs Claude without the laptop is a **cloud Claude session**, the kind this project's threads already are, or a **cloud scheduled task** that starts one.

On 28 Nov Mike's *Laptop Bridge* project reviewed all his jobs and recorded **B012**: *cloud by default*. Web checks, connector work (Gmail, Drive, Supabase), repository work and reports run as cloud sessions or cloud scheduled tasks; only laptop-only work (local Windows files, desktop apps, a browser signed in only on the laptop) goes through the bridge listener; and Mike is asked before any live job is disabled or moved. A cloud computer of our own was judged not worth it.

**Where STB stands (checked 28 Nov):** STB has no live job that needs the laptop. Its recurring work already runs in the cloud: the nightly backup and photo copies (Apps Script, [0079](0079-nightly-backup-to-drive.md), [0080](0080-photo-copies-and-size-watch.md)) and voice builds (GitHub, [0065](0065-voice-builds.md)). Every job ever put in the bridge queue was a `sandbox` test. So nothing has to be moved.

## Decision
1. **Cloud by default (B012) for STB.** STB work is done in cloud sessions: this project's threads for typed requests, cloud scheduled tasks for anything recurring, voice builds for app changes. None of it needs the laptop on.
2. **The bridge listener is for laptop-only work.** A job goes to the laptop only if it touches files or apps on the laptop (the `sandbox` and `mods` folders, anything under `Projects\` that isn't a GitHub repository), needs a program only the laptop has, or needs a site signed in only in the laptop's browser. Everything else, including the two repositories, the web, reading the database and Google Drive, Docs, Sheets, Gmail drafts and Calendar, is cloud work (Gmail in a chat session with Mike, not through the cloud runner: see 5).
3. **Unchanged everywhere:** STB app code changes go through voice builds ([0065](0065-voice-builds.md)); nothing that changes or deletes live database records or spends money is queued or scheduled without Mike in the chat; and no live job is disabled or moved without asking Mike (B012).
4. **A cloud lane in the queue, for hand-offs only.** Most cloud work never touches the queue. But voice mode and scheduled tasks can't start a cloud session themselves, and today they can only hand work to the laptop. So the queue gets a second lane, and those hand-offs run with the laptop off:
   - Each job gets `runs_on`: `laptop` or `cloud`, set from its target. Cloud targets are `cloud:stb-runs`, `cloud:planbench`, `cloud:web` and `cloud:google`; laptop targets stay as they are. Voice only has to say "send it to the cloud".
   - The laptop's claim takes only `laptop` jobs (a database change; nothing changes on the laptop). One job at a time **per lane**.
   - Cloud by default applies here too: a job with no clear need for the laptop goes to the cloud. A cloud job that turns out to need the laptop is handed back (`bridge_reroute(code, 'laptop')`) with the reason, not failed. Jobs never switch lanes by themselves the other way.
   - Like the laptop's folder list, the cloud's list of targets lives **outside the database** (in the cloud runner's instructions and its environment's repositories), so the database can't point it anywhere else.
5. **The cloud runner** is a cloud scheduled task in Mike's account, *STB bridge cloud lane*, that starts a **fresh session** (a new thread in this project, with the project's repositories and connectors). Its instructions allow only the Supabase connector, Google Drive, Docs, Sheets and Calendar, the two repositories and the web: no Gmail, no messaging. Each run it:
   - asks for one cloud job (`bridge_claim_cloud()`) and ends at once if there's none, so an empty run costs almost nothing;
   - works inside the job's target, checks `bridge_cloud_should_stop(job)` between steps, and calls `bridge_checkpoint` after each committed step, as the laptop does;
   - finishes with the same finish function, so the shared note appears by itself ([0076](0076-bridge-shared-notes.md));
   - in a repository, works on a `bridge/<code>` branch and may open a **draft** pull request, never merging, pushing to `main` or deploying (the laptop's rule).
   - takes at most 3 jobs a run.
   **When it runs (Mike: "less frequent checks, but able to be triggered by an event or on demand"):** three checks a day, at 8:41 am, 12:41 pm and 5:41 pm NZ, none overnight while the paper runs are on. **On demand:** any chat or Claude Code session that queues a cloud job starts the runner straight away (it fires the scheduled task), and Mike can say "run the cloud lane now" in any session or press *Run now* on it in Scheduled. A job queued from voice mode waits for the next check, or until any session starts it. *(Times made by Claude on Mike's behalf: change any time.)*
   **Not yet: starting it from the database itself** when a job is queued. That needs a key that can start the scheduled task stored in Supabase, and this kind of scheduled task can't take one today; on-demand from sessions covers it meanwhile.
6. **The same controls as the laptop:**
   - **Kill switch:** `bridge_pause(true)` stops both lanes, and the running cloud job at its next step. The laptop's `STOP` file still stops only the laptop.
   - **Caps, to protect Mike's Claude usage:** the daily caps (20 jobs, 300 minutes, kept by Mike on 28 Nov) count both lanes together, because it's one Claude plan, and the cloud lane has its own smaller limit inside them: **8 jobs and 120 minutes a day** (`bridge_cloud_caps(jobs, minutes)`). A run with nothing waiting ends after one database call. *(The cloud limit was picked by Claude on Mike's behalf.)*
   - **Allow, time and turns, log, status:** as now. Iffy jobs wait for Allow; big builds need an estimate; the database pauses or times out a cloud job that stops reporting; every step is in `bridge_job_log` with `cloud` as the device; `bridge_status()` shows both lanes.
7. **Sign-in and secrets.** The cloud runner needs **no new secret**. It reaches the database through Mike's Supabase connector, which can call the server-only functions the public key can't (revoked from `anon` and `authenticated` by name, lesson L-015), so the new cloud functions take no device secret. GitHub goes through the Claude GitHub app's existing access; Google through Mike's connectors. No key goes in a prompt, a job, a note or this repository. *(Made by Claude on Mike's behalf: a device secret would have to sit in the scheduled task's prompt, which is weaker than the connector beside it.)*
   - **Read-only on the database:** apart from its own bridge functions, the runner may only run SQL inside `begin transaction read only; … commit;`, which the database refuses to let write anything (checked live 28 Nov). A job that needs a live record changed is held for Mike. Said plainly: the connector itself could write, so this is a rule the runner follows and the database enforces only inside that wrapper, the same footing as every chat session.
8. **Stays on the laptop:** the bridge heartbeat and listener, the laptop's folders and apps, the `sandbox` and `mods` work, the laptop's own copies and snapshots ([0078](0078-bridge-backups-and-rollback.md)), and anything signed in only there. Drive stays storage; Apps Script stays for small fixed jobs like the backup.
9. **Sessions working on shared things claim them first** (Mike's standing rule in the shared notes, 28 Nov): read the bridge notes, write a claim note for the files, the next decision or migration number and any database change, and release it with a handover note when done.

## Not chosen
- **Drive as the queue or runner:** Drive runs nothing; a file-watching script would be a slower, less controlled copy of the queue.
- **A cloud computer of our own:** judged not worth it in the Laptop Bridge review (B012).
- **A GitHub Actions job with a Claude key** (the voice builds way) for the cloud lane: it costs per run and its logs are public. The cloud lane uses Mike's own plan in private sessions.
- **Sending laptop jobs to the cloud when the laptop is off:** a laptop-only job run in the cloud would fail or guess.

## How it was built (28 Nov 2026)
1. Database (`sql/schema.sql`, `docs/data-model.md`, tests in `test/sql.mjs`), applied live: `runs_on` on `bridge_jobs`; `bridge_enqueue` sets it from the target (same arguments); `bridge_claim_job` takes only laptop jobs, one at a time per lane (same arguments, so the laptop needed no change; a ping straight after came back from the laptop); new server-only `bridge_claim_cloud`, `bridge_cloud_should_stop`, `bridge_cloud_checkpoint`, `bridge_cloud_finish`, `bridge_reroute` and `bridge_cloud_caps`, none callable with the public key (checked live, lesson L-015); a `cloud` device whose secret can't be matched; `bridge_status()` counts each lane on its own row.
2. The scheduled task *STB bridge cloud lane* in Mike's account; how to use and check it is in `docs/runbook.md`.
3. Still to do: the `laptop-bridge` skill learns "send it to the cloud" and the laptop-only test (an edit Mike saves from a card).
4. Tests (`test/sql.mjs`): lanes kept apart, one at a time per lane, the kill switch, checkpoints, results as notes, a job handed back to the laptop, the cloud limit. Live: the kill switch held a queued cloud job, then a ping and a small web job ran through the scheduled task.

## Consequences
- STB's live work was already cloud and nothing moved.
- Hand-offs from voice and scheduled tasks no longer wait for the laptop. Laptop jobs are unchanged.
- Each cloud run uses Mike's Claude plan, like laptop jobs: three short checks a day when nothing is waiting, and at most 8 jobs a day. No money is spent.
- The bridge has two runners to watch; `bridge_status()` and the shared notes show both.
