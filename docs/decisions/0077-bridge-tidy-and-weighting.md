# 0077. Voice-to-Laptop Bridge, phase 5: tidy-up and weighting

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026, choosing it as the next build; the rules are his, from the *Voice-to-Laptop Bridge* doc ("Regular consolidation", "Weighting", "Conflicting entries"): merge duplicates and near-duplicate versions of the same context into one entry, keeping the newest and noting what it replaced; weight what keeps coming back; count repeats across separate sessions and days, not within one; weight fades unless reinforced; stated decisions stay put outside the weighting; when two decisions clash, flag it for Mike rather than pick.

## Decision
- **Merged as each note is written, not by a nightly job.** *(Made by Claude on Mike's behalf: one less moving part, and the notes are never untidy waiting for a sweep.)* A new result, status or fact on an overlapping topic that shares at least 60% of its meaningful words with a live one replaces it; the older one is retired with "merged into …" and counted in `merged_count`. `bridge_tidy()` sweeps everything on demand.
- **Weight:** a merged repeat adds its weight only when it came on another New Zealand day or from another kind of session; a burst within one session the same day adds nothing. Weight halves every 14 days unless repeated again.
- **Decisions** are never merged or weighted. A session that sees two decisions that clash calls `bridge_note_flag(a, b, why)`; both are flagged and read first, until Mike settles it (supersede one, or `bridge_note_unflag`). Spotting a clash needs understanding, so sessions do it as they read and write, not the database.
- **Reading** (`bridge_notes_for`): flagged first, then decisions and facts, then by faded weight, newest first; each note shows its weight and how many repeats it absorbed.
- *(Made by Claude on Mike's behalf: the 60% word overlap, the 14-day half-life.)*

## Consequences
- Phase 6 (backups and rollback polish) is the last in the doc's build order.
- Tests: `test/sql.mjs` (merge, weight across days, no weight within a burst, decisions untouched, flags, fade).
