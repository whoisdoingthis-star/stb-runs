# 0011. Known security shortcuts during the PoC

- **Date:** 2026-11-08
- **Status:** Accepted (temporary)

## Context
During setup the Supabase secret key was shown in a screenshot and the RouteSmart password was shared in a chat.

## Decision
Mike chose to keep both for the proof of concept ("Remember this is a PoC").

## Consequences
Both must be rotated before the app is relied on ([runbook](../runbook.md#change-a-password-or-key)).
