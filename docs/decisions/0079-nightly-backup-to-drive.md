# 0079. Nightly backup of the whole database to Google Drive

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026: "Could we roll into a google drive? Evening backups so that it doesn't need my laptop on?"

## Context
The Supabase organisation is on the free plan: no backups to restore from ([0078](0078-bridge-backups-and-rollback.md)). The database is small (about 8 MB, 28 Nov). Phase 6 had the laptop pulling a copy of the bridge; Mike wants it off his laptop and in Google Drive, and it should cover everything.

## Decision
- **A Google Apps Script in Mike's Google account** (`tools/gdrive-backup.gs`) runs at 10 pm NZ every night in Google's cloud, calls `stb_backup_export` and saves the copy, gzipped, in the Drive folder *STB backups*. Keeps 30 nightly copies and the 1st of each month for a year. *(Made by Claude on Mike's behalf: Apps Script needs no Google Cloud project, no OAuth app and no server; it's free and already trusted with Mike's Drive. A GitHub job was the alternative, but it would need Google credentials and its logs are public.)*
- **Least privilege:** the script is a bridge device (`gdrive-backup`) with its own secret; the secret can only fetch the backup. **It makes the secret itself** and enrols it once with `bridge_enrol`, inside a window a Claude session opens with `bridge_open_enrolment` (30 minutes, one device, once), so no person or chat ever sees it; only a bcrypt hash is stored. No master key leaves Supabase.
- **Everything:** every table in the app's schema (runs, ticks, people, orders, notes, the bridge) and the names of stored files. The photos themselves stay in Supabase Storage (not copied yet).
- **Watching it:** the device's `last_seen` shows in `bridge_status()`, so any Claude session can say when it last ran; Apps Script emails Mike when a run fails.
- The laptop's daily bridge copy ([0078](0078-bridge-backups-and-rollback.md) step 2) isn't needed: this covers the bridge too. Its export function stays for a restore point the laptop may want.

## Consequences
- The copy holds family and customer details, including door codes; it lives only in Mike's Drive and the folder isn't shared.
- Restoring is done by a Claude session with Mike in the chat (it changes live records). See the runbook.
- Not yet: copying the delivery photos.
- Tests: `test/sql.mjs` (enrolment window, once only, the copy and its secret).
