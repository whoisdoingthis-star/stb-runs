# 0003. One tile per address

- **Date:** 2026-11-07
- **Status:** Accepted

## Context
The sheet lists an address once per publication and sometimes twice for the same one (25 Uxbridge Road).

## Decision
Combine every line for the same address into one tile with all papers as chips and quantities added (Mike, 7 Nov 2026).

## Consequences
One tap per letterbox. The original lines are kept in `sources` for the audit.
