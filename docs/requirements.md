# Requirements

Numbered requirements and the evidence for each ([decision 0014](decisions/0014-governance-baseline.md)). IDs never change or get reused: a dropped requirement stays here marked *Withdrawn*. **RB-** are run-builder and driver-app requirements (IDs from the governance baseline v0.5); **STB-** are platform requirements.

Each test reference is written as `` `file: test name` ``, and `npm run docs:check` fails if that test no longer exists, so this table can't quietly drift from the tests. *Sheet* tests run only with a real run sheet (`npm run test:sheets`), because sheets hold customer addresses and stay out of the repository.

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| RB-001 | Every sheet line is represented, including repeats and different publications at the same address; each can be traced to its page, row and printed text | Met | `test/unit.mjs: RB-001 every sheet line is traceable`, `test/unit.mjs: Two rows at 25 combined into one tile of 4`, `test/unit.mjs: Different publications at one address share a tile` |
| RB-002 | Item totals reconcile by run and publication; a sheet that doesn't is never loaded automatically | Met | `test/unit.mjs: Totals reconcile`, *sheet* `test/village.mjs: AT-07 totals reconcile to the sheet` |
| RB-003 | The sheet's order is kept, and only an order the family set changes what's shown; the sheet order is always one tap away | Met | `test/sequence.mjs: no custom order = sheet order`, `test/sequence.mjs: new address stays after its sheet neighbour` |
| RB-004 | No street heading is invented (TIMES at Uxbridge Road stays in the note) | Met | `test/unit.mjs: TIMES stays in the note, not a street` |
| RB-005 | Every tile ticks and unticks on its own, and shows its publications | Met | `test/e2e.py: bottom bar shows the tick with Undo`, `test/e2e.py: undo unticks` |
| RB-006 | Non-NZH tiles stand out (yellow/orange; retail blue; several papers dark orange: Mike, 8 Nov 2026) | Met, checked by eye | No automated test yet ([design guide](design.md)) |
| RB-007 | Run 8: building order Amon, Hulme, Monaco, Austin, Reception; letterbox banks from the photos; door codes behind the login only | Met | *sheet* `test/village.mjs: AT-01 order Amon>Hulme>Monaco>Austin>Reception`, `test/village.mjs: Hulme Bank 1 photo`, `test/village.mjs: AT-05 Monaco 462 is in Bank 2` |
| RB-008 | Run 8 reception is one handover without losing each paper's own record | Met | *sheet* `test/village.mjs: AT-04 reception is one handover`, *sheet* `test/village.mjs: AT-09 every source line placed exactly once` |
| RB-009 | Ticks belong to one run and day, survive a reload, and stay on the right address when a sheet is replaced | Met | `test/e2e.py: ticks survive a reload` |
| RB-010 | Conflicting notes and doubtful rows are flagged for a person, not silently fixed | Met | `test/unit.mjs: Weekday conflict flagged but kept`, `test/unit.mjs: FRI only on Saturday conflicts` |
| RB-011 | A stop can be recorded as couldn't deliver (with a reason) or short (with how many); the tick stays in the history | Met | `test/e2e.py: couldn't deliver shows on the tile`, `test/e2e.py: tick and problem both kept`, `test/sql.mjs: the original tick is still in the history` |
| RB-012 | Each run keeps the fingerprint of the PDF it came from | Met | `test/rows.mjs: sha256 of "abc"`, `test/rows.mjs: the run row carries the fingerprint` |
| RB-013 | A dispatcher can close a run with its driver and finish time; a run done on paper gets paper ticks for its unticked stops, never edits; reopening reverses only those | Met | `test/sql.mjs: a dispatcher closes a run on paper, ticks show as paper`, `test/sql.mjs: a driver cannot close a run or set its driver`, `test/sql.mjs: a driver cannot enter paper ticks`, `test/sql.mjs: reopening is in the dispatch history` |
| RB-014 | Finished runs and earlier days leave the phone's Runs to do list for History; Dispatch keeps unfinished runs active until they are closed | Met | `test/e2e.py: earlier days are not under Runs to do`, `test/e2e.py: earlier days are under History`, `test/sql.mjs: run progress counts done stops in the database` |
| STB-001 | Recorded deliveries are never changed: corrections are new entries | Met | `test/sql.mjs: update blocked`, `test/sql.mjs: unknown outcomes are refused` |
| STB-002 | Routing consolidates services by operating location | Future | Roadmap: suggested stops, smart sequencing |
| STB-003 | Conflicting policies are refused, at any level, rather than one quietly winning; policies have dates | Met | `test/sql.mjs: a different rule on an address inside the group is refused`, `test/sql.mjs: non-overlapping dates do not clash`, `test/sql.mjs: notes never clash` |
| STB-005 | Every field a phone records reaches the database (nothing dropped by the sync) | Met | `test/sql.mjs: every field the app sends is a tap_events column`, `test/sql.mjs: every tap_events column (bar user and server time) is sent by the app` |
| STB-004 | DIFOTIS can be reported per run per day | Met, checked by eye | Dispatch Overview ([business rules](business-rules.md#delivery-outcomes)) |
