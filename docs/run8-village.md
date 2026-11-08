# Run 8: Bruce McLaren Village

Run 8 (HOWICK08) follows its own rules, from *Run 8 Operational Rules and Decisions v1.0* (Mike, 7 Nov 2026) and Mike's letterbox photos (8 Nov 2026). They are applied when the run is shown; the stored run stays exactly as the sheet. Implemented in `js/village.js`; acceptance tests AT-01 to AT-10 are in `test/village.mjs`.

## Building order
Amon → Hulme → Monaco → Austin → Reception handover, whatever order the sheet uses. Moving tiles is switched off for this run.

## Door codes
Shown on each building banner. Entered in the app (**••• → Door codes…**) and stored in the database behind the family login, never in the repository (it is public). Every change is logged in `access_code_history`.

## Units
Sorted by unit number within each building, prefixes kept (249 then IA/249).

## Mailbox banks (from the 8 Nov 2026 photos, which outrank the old range map)
| Building | Bank 1 | Bank 2 |
|---|---|---|
| Hulme | 140–144, 240–254, 340–351 | 352–354, 440–450 |
| Monaco | 274–286, 374–386, 474–486, 160–164 (44 boxes) | 165, 260–273, 360–373, 460–473 |

- Units not on the bank map are listed under **"Not on the bank map: check"** rather than guessed.
- A unit on the edge of two banks (Hulme 253) is marked **Check bank**.
- AT-05: Monaco 379 is Bank 1 (corrected from 79); Monaco 462 is Bank 2.

## Reception / Care Centre / Serviced Apartments
One tile, one tap, listing everyone in the bundle. The not-routed items (Rooms 145, 236, SA103) are included and marked. One tap records every paper in the bundle with the same time and GPS, so the audit keeps each one. Progress counts the handover as one stop; copies count every paper.

## Load screen
Shows building totals (e.g. Amon 11 · Hulme 13 · Monaco 17 · Austin 4 · Reception 27 = 72) and confirms every sheet line was placed exactly once.

## Changing it
Bank maps, building names and order are in `js/village.js` (no codes there). Update this page and the tests in `test/village.mjs` in the same commit.
