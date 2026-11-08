# 0013. Roles enforced by the database; temporary passwords instead of email invites

- **Date:** 2026-11-08
- **Status:** Accepted (revisit for STB)

## Context
Mike's login should run the dispatch dashboard and manage who can use the app and the dashboard.

## Decision
Two roles on `members`: `driver` (app only) and `dispatcher` (app + dashboard), plus `active`. Row-level security uses `is_dispatcher()` for every planning table and for changing people, so hiding buttons is not the protection. A trigger keeps at least one active dispatcher. Logins are created by a dispatcher-only Edge Function (`admin-users`) with a temporary password given in person, because Supabase's built-in email sender only delivers to the project team; switching someone off also bans the login so an open session can't refresh.

## Consequences
Works today with no email setup. For STB proper, connect an email sender and switch to email invites and self-service password resets.
