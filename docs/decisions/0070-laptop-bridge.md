# 0070. Voice-to-Laptop Bridge: any Claude session can see the laptop and hand it work

- **Date:** 2026-11-26
- **Status:** Accepted

## Context
Voice mode on Mike's phone can't reach his home laptop or tell whether it's on, scheduled tasks can't hand anything to it,
and Claude Code, chat and voice don't see each other's work. On the drive to work on 26 Nov 2026 Mike asked for a way to
"hand off to code on the laptop" from voice, to know whether the laptop is online, and later for sessions to share what
they know. The design, its risks and controls, and the build order are in the *Voice-to-Laptop Bridge* doc; Mike agreed
it and said "build phase 1 on laptop", then "let's start phase 2".

## Decision
1. **Phase 1, heartbeat.** The laptop stamps `bridge_devices.last_seen` every minute through `bridge_heartbeat`, using
   the public key plus a per-device secret. Only a bcrypt hash of the secret is stored. `bridge_status()` says whether
   it's up (checked in within 3 minutes).
2. **Phase 2, a job queue just for the laptop** (`bridge_jobs`). **Not `build_requests`:** that queue is the GitHub voice
   builds job's ([0065](0065-voice-builds.md)), and two consumers would race. STB code changes keep that reviewed path;
   the bridge is for work that needs the laptop itself. *(Made by Claude on Mike's behalf, because 0065 already owns that table.)*
3. **A listener on the laptop** checks the queue every 5 seconds (not Supabase Realtime, *made by Claude on Mike's behalf*:
   far simpler to keep running unattended; pick-up within seconds), runs **one job at a time**, and writes the result back.
4. **Controls, from the design doc:** job types on an allow-list (`ping`, `claude`); folders on an allow-list kept **on the
   laptop**, so the database can't point it anywhere else; an Allow step for anything iffy (`awaiting_allow` until
   `bridge_allow`); a kill switch (`bridge_pause`, or a `STOP` file on the laptop) that also stops the running job; a
   time and turn limit per job, and the database times out a job whose listener goes quiet; every step logged in
   `bridge_job_log`. Claude Code on the laptop never pushes, merges or deploys, and stops ("held") rather than doing
   anything outside its folder's tool list.
5. **Mike's two exceptions hold here too:** nothing that changes or deletes live database records or spends money is
   queued; those need Mike in the chat.

## Consequences
- The public key can do nothing here without a device's secret; the sessions' functions are server-only.
- These tables live in the STB database for now. If the bridge grows beyond STB and the family's projects, it moves out.
- The laptop's scripts are not in this public repository (they sit beside the laptop's secret).
- Jobs use Mike's own Claude plan's usage. Phase 3 adds chunked builds and caps.
