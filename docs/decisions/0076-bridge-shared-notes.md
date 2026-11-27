# 0076. Voice-to-Laptop Bridge, phase 4: shared notes

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026, choosing it as the next build ("Bridge phase 4: shared notes"), building on the agreed *Voice-to-Laptop Bridge* doc ("Shared context table" and "Guarding against context bloat").

## Context
Voice, chat, Claude Code, the laptop and scheduled tasks don't see each other's work. Mike asked today to "use the bridge to check across all sessions", and it couldn't: there was nowhere they all write. Mike sees context bloat as the biggest risk.

## Decision
- **One table, `bridge_notes`, in the STB database next to the rest of the bridge.** Every session with the Supabase connector reads and writes it through three server-only functions: `bridge_note(kind, topics, body, source, …)`, `bridge_notes_for(topics)` and `bridge_note_retire(id)`.
- **Against bloat (the doc's rules):** typed entries only (`decision`, `result`, `status`, `fact`); 1 to 5 topic words; at most 1,000 characters; status notes expire after 3 days and results after 14, decisions and facts stay; a newer note can **supersede** an older one, which retires it. Reading is by topic, decisions and facts first.
- **The laptop writes in by itself:** when a laptop job finishes, is held, fails or pauses, its result becomes a `result` note under `bridge` and its folder's name, with the job's code.
- Scheduled tasks write with `source => 'schedule'` (the car watch list, the Ollie workshop) when their prompts are next updated.
- *(Made by Claude on Mike's behalf: the expiry times, the 1,000-character limit and the topic words.)*
- Mike's memory, the one he already has, stays where it is: it is about him; these notes are about the work.

## Not yet
Phase 5: the consolidation pass (merging near-duplicates, weighting what keeps coming back across sessions, flagging clashes for Mike).

## Consequences
- Any session can answer "what did the others decide or do about X?" by reading `bridge_notes_for(array['x'])`.
- Privileges are revoked from the public key and signed-in app users by name (lesson L-015).
