# 0005. Supabase for data, login and live updates

- **Date:** 2026-11-07
- **Status:** Accepted

## Context
Several people work a run at once and runs are shared by text link; only the family may see anything.

## Decision
Supabase Postgres with row-level security on a `members` list, email logins with sign-up disabled, Realtime for live ticks, Storage for PDFs and photos.

## Consequences
The publishable key is public by design; the rules protect the data. Same stack as STB proper.
