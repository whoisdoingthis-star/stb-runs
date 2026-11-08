# 0014. Adopt parts of the STB governance baseline v0.5

- **Date:** 2026-11-09
- **Status:** Accepted

## Context
Mike shared *STB Consolidated Product, Architecture & Delivery-Run Governance Baseline v0.5* (8 Nov 2026), written for STB proper. It predates this app: it describes the earlier hand-built offline HTML file, and several of its open items are already answered here (stable tick identity by address key, cloud sync, roles). It also refers to the Bruce McLaren building order as Run 11; Mike confirmed it is **Run 8** (9 Nov 2026). Its Hulme and Monaco bank ranges are older than the bank photos of 8 Nov, which the app already uses (253 is in Hulme Bank 1 only). Its door codes are not copied anywhere in this repository ([0010](0010-public-repository.md)).

## Decision
Adopt, with Mike's go-ahead on 9 Nov 2026:
1. **Policies have start and end dates, and clashing policies are refused** rather than resolved by hidden precedence.
2. **Delivery outcomes**: couldn't deliver (with reason) and short (with quantity) as new tap entries after the tick; never an edit. DIFOTIS on the Dispatch Overview.
3. **Partial delivery** is recorded as "short", from the ⚠ button, not as a separate tap per copy.
4. **Provenance**: SHA-256 fingerprint of each PDF, and page, row and raw text for every sheet line behind a tile.
5. **Requirements with IDs** traced to tests ([requirements](../requirements.md)), and **append-only decision records** checked by CI.
6. A **glossary** mapping the baseline's terms to ours; code names are not changed.
7. Run 8's **letterbox banks as service locations** in Dispatch, from the photographed bank lists.

Not adopted now (kept for STB proper): tenants, route versions, vehicle constraints and optimisation, the MOD change-record form (pull requests and these records do that job at this size).

## Consequences
The database grows three columns on `tap_events`, two on `location_policies`, one on `runs`, and three views. The baseline document stays a review artifact outside the repository; this record and the pages it links are what is in force.
