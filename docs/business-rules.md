# Business rules

How the run sheets are read and what the app does with them. Each rule says
where it came from. Code references point at where the rule is implemented.

## The run sheets
- **Source**: RouteSmart Optimize, workspace 17, service day `<DAY>_DRAW`, routes HOWICK06, 08, 10, 11, 13; reports "NZME Daily Activity" (the *Key Report*) and "NZME Delivery List" (*Delivery List by Sequence*). (Mike, 8 Nov 2026)
- **Lock-in**: the next day's sheets are final at **19:00 NZ**. Changes after that are phoned through. (Mike, 8 Nov 2026)
- **Run numbers**: HOWICK06 is "Run 6", and so on.

## One tile per address
- Every line on the delivery list with the same route, street and number is one tile, with all its papers on it and quantities added together. (Mike, 7 Nov 2026) — `js/parser.js` `finishRoute`
- An address is identified by `AREA|STREET|NUMBER` (e.g. `HOWICK|UXBRIDGE ROAD|1/71`), the same every day. This is what custom orders, photos and GPS history attach to.

## Totals must match
Before a run is saved, the parser checks its totals against the delivery list's own totals and the Key Report's DRAW for each publication. A run that doesn't add up is **never loaded automatically**; the evening fetch fails and says why, and a manual upload asks "Save anyway?". — `js/parser.js`, `fetcher/fetch-run-sheets.mjs`

## Publications
| Code | What it is |
|---|---|
| NZH | NZ Herald |
| **NZHR** | **The same NZ Herald, delivered to a retailer (shop). Needs a delivery docket.** (Mike, 8 Nov 2026) |
| Any code ending in **R** | Treated the same way: that paper to a retailer, plus a docket (e.g. SSTR = SST to a shop). (Assumed from the NZHR rule, 8 Nov 2026) |
| WD, LIS, WW, SST, TVG… | Other publications |

- **Papers to collect** counts retail copies in their paper's column (NZHR counts as NZH) and shows a **Dockets** column: one docket per retail address, not per copy. — `js/app.js` `paperSummary`, `js/parser.js` `summary.dockets`
- Tiles show retail papers as **NZH ×n + DOCKET**.

## Tile colours (Mike, 8 Nov 2026)
| Tile | Rule |
|---|---|
| Plain white | NZH only |
| Light blue, blue chip | Any retail paper (shop drop). Takes priority over the others, so the docket is never missed |
| Light yellow, yellow/orange chip | One paper other than NZH |
| Light orange, dark orange chips | More than one different paper at the address (not retail) |
| Green | Delivered, whatever it was before |

No other greens are used anywhere: green always means delivered. — `js/app.js` `COLORS`, `tileKind`

## Key Report items
- **Complaints** are matched to their tile and shown as a red **COMPLAINT** chip with a plain description. The report gives a type, a date as DDMM and the subscription, e.g. `MISSED 0711 WKLY7` → "Missed delivery on Sat 7 Nov (NZH, 7-day subscriber)". The customer's own words are not in the report. (Mike, 8 Nov 2026) — `js/parser.js` `complaintText`
- **Starts/Restarts** show as **NEW**; **Stops** still on the delivery list show as **STOP?** and are kept, with a warning to check.
- A complaint, start or stop with no matching tile becomes a warning on the load screen.

## Complaints register
(Mike, 9 Nov 2026.) Complaints are kept as a register to spot repeat problems, customers who complain often, and patterns by run or by who delivered. — `sql/schema.sql` (`complaints`, `complaint_register`), dispatch **Complaints** page
- **Filled automatically** whenever a sheet loads: each complaint on the Key Report that matches a tile becomes one entry, identified by address, paper, kind and the date it happened. The same complaint listed on several sheets stays one entry (first and last sheet are recorded).
- **Recorded:** address and run, kind (missed, wet, damaged, late, wrong paper), the date it happened (from the report's DDMM), paper and subscription, the report's description.
- **Delivery record:** who ticked that address on that date, at what time, with the GPS accuracy and any photos that day. Complaints about deliveries before the app (before 9 Nov 2026) show "Before the app".
- **Customer history:** how many complaints this address has made, which number this one is, and the date of the previous one.
- **Status**, set by a dispatcher: **open**, **disputed** (we delivered: the tick, GPS and photo back it up), **accepted** (our miss), **closed**, with notes. Changes are logged.
- **Patterns** on the Complaints page: counts by kind, by run, by who ticked the delivery, and repeat addresses, over the last 30/90/365 days or all time.
- **"Who ticked it" is a record, not a verdict.** A tick with good GPS and a photo is evidence the paper was delivered; a pattern for one person or run is a prompt to look closer, not proof.

## Delivery-day notes
A delivery instruction that names days ("FRI only", "Mon-Fri", "No Sat") is checked against the delivery day. If they conflict the tile is marked **CHECK DAY** and kept on the run: the driver decides. — `js/parser.js` `weekdayConflict`

## Photos for disputed complaints (Mike, 8 Nov 2026)
Some customers report non-delivery when the paper was delivered. Practice: photograph later deliveries to that address and send them on WhatsApp to the owner of the Howick runs.
- Complaint tiles, and addresses on the **photo watch list**, show a camera button; any tile can be photographed from the tick pop-up.
- Photos are stamped with address, run, date and time, driver and GPS (if fresh), stored privately, and recorded against the address.
- Taking a photo also records the delivery.
- The watch list is per route and address and shared by everyone until someone removes it.

## Delivery order
- The sheet's order is the starting point. A driver can hold and drag tiles or whole streets; the new order is saved per route for everyone and re-applied to future sheets. New addresses go next to their neighbour from the sheet. — `js/sequence.js`
- Tiles are read left to right, then down. (Mike, 8 Nov 2026)
- GPS on each tap is for working out a better order later, **not** proof of delivery. (Mike, 7 Nov 2026)

## Which day "Get Runs" means
Before midday NZ: today's runs (being delivered this morning). After midday: tomorrow's. The date can be changed. (Decided 8 Nov 2026)

## What counts as "a detail changed"
When a sheet replaces an earlier one for the same run and day, these are compared address by address: address added, address removed, papers or quantities changed, delivery note changed. Changes to order or flags alone are not counted. — `js/rows.js` `diffLines`

## Locations: operating and service
(Mike, 8 Nov 2026.) Three levels, so navigation goes where the vehicle stops and the work is planned where it's done:

| Level | Meaning | Run 8 example | Street example |
|---|---|---|---|
| **Location group** | A village, building, street or area. Groups can sit inside groups. Policies set on a group apply to everything in it | Bruce McLaren Village | Uxbridge Road |
| **Operating location** | Where the vehicle stops: a GPS point with a stop number along the run | Monaco car park | Outside 41 Uxbridge Road |
| **Service location** | Where the driver does the work from that stop, on foot | Monaco Bank 1, Bank 2, Reception | The letterboxes at 35–49B |
| **Address** | What the sheet lists (one tile) | Unit 379 | 38B Uxbridge Road |

- **The address register** holds every address ever seen on a run sheet, filled automatically when any sheet loads (app or evening fetch), with the runs it's on and when it was first and last seen. Addresses are identified by the same key as the tiles, so an assignment carries over to every future sheet.
- Each address can be assigned to an operating location and a service location, and the assignment **validated** once checked on the ground. Re-assigning clears validation.
- Service locations can be **validated** themselves (the bank or letterbox is where we think it is).
- **Learned GPS**: deliveries ticked with an accurate fix (40 m or better) are averaged per address; that is the best guess of where the letterbox is, and can set a stop's GPS ("the middle of the delivered addresses").

## Policies
Rules attached to exactly one group, operating location, service location or address, applying to everything beneath it (an address inherits from its service location, its operating location and every group above). Kinds: **entry point** from the road (note and/or GPS), **access note**, **no service before** a time, **deliver between** two times, **speed limit**, **delivery restriction**. Optional days of the week (none = every day); can be switched off without deleting. (Mike, 8 Nov 2026)

## People and access
- **App only** (`driver`): runs, ticks, photos, reordering.
- **App + Dispatch** (`dispatcher`): also the dispatch dashboard: the register, locations, policies and users. Mike is the first dispatcher. (Mike, 8 Nov 2026)
- Enforced by the database, not just the screens: only dispatchers can change locations, policies, assignments or people.
- There must always be at least one active dispatcher. Switching someone off locks them out immediately; their history stays.
- New people get a temporary password from a dispatcher, in person, and can change it in the app.
