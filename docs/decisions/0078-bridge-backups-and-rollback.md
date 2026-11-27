# 0078. Voice-to-Laptop Bridge, phase 6: backups and rollback

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026 ("let's phase 6"), building the last phase of the agreed *Voice-to-Laptop Bridge* doc: rollback ("builds go to a branch or have a restore point"), backups ("shared context table backed up regularly … backups hold family data and need the same lockdown") and the audit trail's own expiry ("more data feeds bloat, so logs need their own expiry").

## Context
The Supabase organisation (Zalense) is on the **free plan**: there are no backups to restore from. Checked 28 Nov.

## Decision
1. **Every version of every shared note is kept** (`bridge_notes_history`, by trigger). Any change can be undone: `bridge_note_restore(id)` puts a note back as it was before its latest change (or at a time), and `bridge_note_unmerge(id)` brings back what the tidy-up merged into it.
2. **An off-site copy, on the laptop.** `bridge_backup_export(device, secret)` returns the whole bridge (live notes, notes retired in the last 180 days, 180 days of jobs and their log, the controls) only to a device with its secret. The laptop saves one dated file a day in its own folder and keeps 30. *(Made by Claude on Mike's behalf: the laptop is the only place off Supabase that's already trusted with the bridge, and it costs nothing.)*
3. **Rollback for laptop builds:** jobs in git folders already work on a `bridge/<code>` branch and never push or merge ([0070](0070-laptop-bridge.md)). Jobs in folders that aren't git get a zipped copy of the folder before they start, kept 14 days (laptop side).
4. **Expiry:** job log, note history and retired notes older than 180 days are deleted as jobs finish.
5. Privileges: everything is server-only except the export, which the public key can call only with the device's secret (lesson L-015).

## Not covered here
The rest of Stan's database (runs, ticks, people) has no backup either on the free plan. Raised with Mike separately.

## Consequences
- The laptop side (daily copy, folder snapshots) is a change Mike makes in his *Laptop Bridge* project.
- Tests: `test/sql.mjs` (versions, unmerge, restore, the copy and its secret, expiry).
