# 0022. Stan on empty screens and in Dispatch

- **Date:** 2026-11-12
- **Status:** Accepted

## Context
Step two of [0021](0021-stan.md), agreed with Mike on 12 Nov 2026: Stan on the screens where there's nothing to do, and in Dispatch, without putting him on the data.

## Decision
- **Phones:** Stan stands beside the words on empty screens: no runs yet (waving), all done (hopping), nothing in History yet, and the end of a run's list ("Run complete. Nice work!").
- **Dispatch:** Stan beside "✓ Nothing waiting", "Nothing active", "No finished runs yet" and an empty Shifts card; and a **Stan's tip** card on the Overview with one tip a day (the same all day, NZ time) and a link to the Dispatch guide.
- Never on tables, figures, complaints or the map. Same Settings switch as the phones (on the same browser).

## Consequences
Tips are a fixed list in `js/stan.js`; adding one is a one-line change. The link goes to the guide on GitHub.
