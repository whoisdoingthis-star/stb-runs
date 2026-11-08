# 0007. Get Runs button via an Edge Function

- **Date:** 2026-11-08
- **Status:** Accepted

## Context
Late changes are phoned in after the lock-in; the family needed to re-fetch from the app.

## Decision
The app calls a Supabase Edge Function that checks membership and starts the same GitHub job for the chosen date (forced). A fine-grained GitHub token limited to this repository's Actions is kept as a Supabase secret.

## Consequences
No RouteSmart credentials on phones; one code path for scheduled and on-demand fetches. Takes 2 to 3 minutes.
