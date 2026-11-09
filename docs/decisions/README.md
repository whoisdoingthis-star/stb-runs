# Decisions

One short record per decision. Never deleted; a reversed decision gets a new record that supersedes it.

| # | Decision | Date | Status |
|---|---|---|---|
| 0001 | [Static web app, no build step](0001-static-web-app.md) | 2026-11-06 | Accepted |
| 0002 | [Read the PDF by text position and check every total](0002-parse-by-position.md) | 2026-11-06 | Accepted |
| 0003 | [One tile per address](0003-one-tile-per-address.md) | 2026-11-07 | Accepted |
| 0004 | [GPS per tap is for sequencing, not proof of delivery](0004-gps-for-sequencing.md) | 2026-11-07 | Accepted |
| 0005 | [Supabase for data, login and live updates](0005-supabase.md) | 2026-11-07 | Accepted |
| 0006 | [Evening fetch on GitHub Actions](0006-evening-fetch-github-actions.md) | 2026-11-08 | Accepted |
| 0007 | [Get Runs button via an Edge Function](0007-get-runs-edge-function.md) | 2026-11-08 | Accepted |
| 0008 | [Delivery photos for disputed complaints](0008-delivery-photos.md) | 2026-11-08 | Accepted |
| 0009 | [Docs as code](0009-docs-as-code.md) | 2026-11-08 | Accepted |
| 0010 | [Public repository, no secrets in it](0010-public-repository.md) | 2026-11-08 | Accepted (revisit for STB) |
| 0011 | [Known security shortcuts during the PoC](0011-known-security-shortcuts.md) | 2026-11-08 | Accepted (temporary) |
| 0012 | [Locations: groups, operating locations, service locations](0012-dispatch-location-model.md) | 2026-11-08 | Accepted |
| 0013 | [Roles enforced by the database; temporary passwords instead of email invites](0013-roles-enforced-by-database.md) | 2026-11-08 | Accepted (revisit for STB) |
| 0014 | [Adopt parts of the STB governance baseline v0.5](0014-governance-baseline.md) | 2026-11-09 | Accepted |
| 0015 | [Closing a paper run adds paper ticks, it doesn't mark the run done](0015-closing-paper-runs.md) | 2026-11-09 | Accepted |

Records are append-only: CI refuses a change to an existing record other than its Status line. To reverse a decision, write a new one that supersedes it.

New decision: copy the latest file, take the next number, add it to this table.
