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
**Totals are "items", not "papers"** (Mike, 9 Nov 2026): a run's total mixes newspapers and magazines (WD is Woman's Day), so the app says "115 items", and each publication is listed by name.

| Code | What it is |
|---|---|
| NZH | NZ Herald |
| **NZHR** | **The same NZ Herald, delivered to a retailer (shop). Needs a delivery docket.** (Mike, 8 Nov 2026) |
| Any code ending in **R** | Treated the same way: that paper to a retailer, plus a docket (e.g. SSTR = SST to a shop). (Assumed from the NZHR rule, 8 Nov 2026) |
| WD | Woman's Day (a magazine) (Mike, 9 Nov 2026) |
| LIS, WW, SST, TVG… | Other publications |

- **Items to collect** counts retail copies in their paper's column (NZHR counts as NZH) and shows a **Dockets** column: one docket per retail address, not per copy. — `js/app.js` `paperSummary`, `js/parser.js` `summary.dockets`
- Tiles show retail papers as **NZH ×n + DOCKET**.

## Depot pick: bundles and loose copies
(Mike, 9 Nov 2026.) Papers come from the depot in bundles (e.g. NZH in bundles of 100 or 140). The Key Report states, per run and publication, `Bundles: N with S`, `ODD` (loose copies) and `DRAW` (the total). The app shows that as the run's **pick**: "NZH 1 bundle of 100 + 5 loose", on each run card and in the Papers to collect panel (also on the dispatch Overview). **Retail copies are combined with their paper** (Mike, 9 Nov 2026: the depot bundles NZH and NZHR together): the pick shows one NZH line with the combined total in whole bundles of the bundle size plus the rest loose, and a note "(includes 13 for retail)". Other papers use the report's figures as they are; if the ODD figure is missing, loose = draw − bundles × size. — `js/app.js` `pickList`

**All runs** total (asked for by Lisa, 9 Nov 2026; clarified by Mike, 10 Nov 2026): for each paper, take the **total for all the day's runs** and work out whole bundles and loose copies from **that day's bundle size**: "NZH 3 bundles of 80 + 79 loose = 319". The bundle size is not fixed and changes from day to day, so it is read from that day's Key Reports (`Bundles: N with S`), never assumed. If no sheet that day states a size (no run had a full bundle), the total is shown as loose with "no bundle size on today's sheets". If the day's sheets state different sizes for the same paper, the app does not guess: it adds up run by run and says which sizes it saw. This replaces the 9 Nov version, which added each run's bundles and loose copies together without re-bundling. — `js/rows.js` `rebundle`, `js/app.js` `pickTotals`

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

## Temporary stops printed as complaints
(21 Gillett Place, 11 Nov 2026.) NZME sometimes lists a temporary stop in the key report's **Complaints** table: type `STOPNA`, comment `1011 stop till 18112026` (stopped from 10 Nov until 18 Nov). That is not a complaint. The tile shows a red **STOP** with **"STOP until Wed 18 Nov: don't deliver"**, and it never enters the complaints register. Once the date has passed it shows **Restart: deliver again**. If the address isn't on the delivery list (NZME already left it off), nothing is shown: that's what a stop should look like. Any complaint-table row of type `STOP…` or with "stop till DDMMYYYY" is treated this way. — `js/parser.js` `temporaryStop`

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
- **Added later** (Lisa, 11 Nov 2026): ⋯ → *Add a photo to an address…* attaches a photo from the camera or the phone's gallery to any address on the run. It doesn't tick, has no GPS, keeps the photo's own time (if within two days) and is marked `added_later`.
- The watch list is per route and address and shared by everyone until someone removes it.

## Delivery order
- **Each person can have their own order** (Mike, 11 Nov 2026: Lisa does Run 6 differently; the usual order is optimised for Mike). A dispatcher's drags change the **usual order** for the route (`route_sequences`); anyone else's drags save **their own order** (`person_sequences`), used only on their phone, starting from the usual one. No own order = the usual order. Dropping your own order goes back to the usual one. If their own order can't be saved yet, it waits on the phone; it never changes the usual order.
- The sheet's order is the starting point. A driver can hold and drag tiles or whole streets; the new order is re-applied to future sheets. New addresses go next to their neighbour from the sheet. — `js/sequence.js`
- Tiles are read left to right, then down. (Mike, 8 Nov 2026)
- The sheet's original order is always kept. When a run has a custom order, an **Our order / Sheet order** switch sits under the run header so a driver can flip between them at any time; it changes only that phone's view. (Mike, 9 Nov 2026)
- Later: **smart sequencing** that learns each driver's preferred order from when and where they tick ([roadmap](roadmap.md)). (Mike, 9 Nov 2026)
- GPS on each tap is for working out a better order later, **not** proof of delivery. (Mike, 7 Nov 2026)

## Which day "Get Runs" means
Before midday NZ: today's runs (being delivered this morning). After midday: tomorrow's. The date can be changed. (Decided 8 Nov 2026)

## What counts as "a detail changed"
When a sheet replaces an earlier one for the same run and day, these are compared address by address: address added, address removed, papers or quantities changed, delivery note changed. Changes to order or flags alone are not counted. — `js/rows.js` `diffLines`

## Delivery outcomes
(Governance baseline v0.5, adopted 9 Nov 2026.) A tick says the stop has been dealt with; the **outcome** says how:

| Outcome | How it's recorded | Counts as |
|---|---|---|
| Delivered | Tap the tile | Delivered |
| Short | Tick, then ⚠ in the bottom bar → how many were delivered | Delivered, not in full |
| Couldn't deliver | Tick, then ⚠ → reason (gate locked, dog, no letterbox, door code, not safe, ran out, other) | Not delivered. Not closed either: Dispatch sees it under Needs attention |
| Undone | Tap again, or Undo | Not dealt with |

- Nothing is edited: the problem is a new entry after the tick, so the history shows both. A later complaint is its own record and never rewrites what was recorded at the time.
- **DIFOTIS** (Dispatch Overview, per run, per address on the sheet): **Delivered**; **In full** = not short; **On time** = inside the address's time policies in force that day, or on the delivery day if it has none; **In spec** = no wet, damaged or wrong-paper complaint for that day.
- Bundles (Run 8 reception) record the outcome for every paper in the handover.

## Current and history
(Mike, 9 Nov 2026.) A run is **complete** when it has been closed in Dispatch, or every stop on it has been dealt with in the app (ticked, short or couldn't deliver). Complete runs move to **History** on both screens, so they stay clean:

- **Phones, Runs to do**: today's and upcoming runs that aren't complete. Everything else (complete runs and earlier days) is under **History**.
- **Dispatch, Runs & sheets → Active**: every run that isn't complete, *including earlier days*, so a run done on paper is never forgotten until it's closed. Earlier runs not complete are also listed under **Needs attention**. **History**: complete runs; reopening one brings it back.
- Progress is counted in the database (`run_progress`), not on the phone.

## Driver Assistant
(Mike, 12 Nov 2026: "for the driver to navigate to the next stop, particularly if it's a new run for them".) The **Assistant** button in the bottom bar opens a panel above it. — `js/assistant.js`, [decision 0019](decisions/0019-driver-assistant.md)
- **Voice first:** "Next stop, 27 Luplau Crescent. In 300 metres, turn left onto Masefield Avenue." / "In 150 metres, turn left…" / "Turn left onto Masefield Avenue." / "Arriving. 27 Luplau Crescent, on your left. 2 papers. Don't throw, put it in the Herald box." Each said once. The 🔊 button turns the voice off and on.
- **On screen:** a big arrow (the next turn, or straight at the stop when close), the distance, the instruction, which side, and the sheet's notes (papers if not just one Herald, notes, temporary stops, complaints, Run 8 bank).
- **Where it goes:** same as Directions below (Dispatch stop, then learned letterbox, then the address, looked up once).
- **Turns:** from OpenRouteService, one leg at a time from where you are; worked out again if you leave the route. Without routing (not set up, offline) it shows an arrow straight at the stop and the distance.
- **Never ticks.** It moves to the next stop when you tick.
- **Turns on by itself** the first time you open a run that's new to you on your phone (you haven't ticked 10 of its stops there); after that it stays as you left it. **Maps** in the panel still hands over to Google Maps.

## Directions
(Mike, 10 Nov 2026.) **Google Maps, one stop at a time, only when asked.** The arrow in the bottom bar opens Google Maps driving directions to the next stop. Waze isn't used. The destination is, in order:
1. the stop (operating location) set in Dispatch, if it has GPS: where the vehicle parks, so the Bruce McLaren buildings go to their car parks, not each letterbox (navigation goes stop to stop: 8 Nov 2026);
2. otherwise the letterbox position learned from good GPS ticks (`address_positions`);
3. otherwise the street address ("18 Moore Street, Howick, Auckland").

A Navigate for several stops at once (Google Maps waypoints) and our own floating mini-map remain on the [roadmap](roadmap.md). — `js/app.js` `directions`, view `address_destinations`

## Closing a run
(Mike, 9 Nov 2026.) While drivers are getting used to the app, some runs are still done on the paper sheet. A dispatcher can **close** a run in Dispatch (Overview or Runs & sheets → *Close run…*):

- **Driver**: who did the run (a family member, or someone else by name). **Finished at**: defaults to 7:00 on the delivery day.
- **On the paper sheet**: every stop not ticked in the app gets a tick from Dispatch, in the driver's name, at the finish time, marked *paper*. Stops already ticked (including couldn't-deliver and short) are left as they are.
- **In the app**: the run is closed as it is; unticked stops stay unticked.
- Closing never edits a tick. **Reopen** adds *undone* entries for the paper ticks only; app ticks stay. Every close and reopen is in the dispatch history.
- Only dispatchers can close or reopen a run, set its driver, or enter paper ticks (enforced by the database).
- Paper ticks have no GPS, so they never feed learned letterbox positions or delivery order; they do count in DIFOTIS (on time = the finish time entered).

## Run map and Ping (Mike, 13 Nov 2026, via Chat with Stan)
- Dispatch can see each run on a map: a pin per address (to do / done / couldn't deliver) and the trail in delivery order. ([decision 0026](decisions/0026-run-map-and-ping.md))
- **Ping** shows where a driver is only when a dispatcher asks, only while that driver is on duty with the app open, and the driver is always told. Off duty, nothing is shared. No continuous tracking.

## People's icons (Mike, 13 Nov 2026, via Chat with Stan)
- Everyone chooses their own icon (a ready-made robot or a photo); only they can change it. ([decision 0025](decisions/0025-avatars.md))

## Photos and problems from the bar (Mike, 12 Nov 2026)
- **Photo** and **Problem** are always in a run's bottom bar, named, and apply to the stop just done or the next stop (the app asks which when there are both). A stop can be marked *not delivered* or photographed without being ticked first, and a photo can be taken for a stop with several papers.

## Chat with Stan and the ideas register (Mike, 12 Nov 2026)
- Anyone in the family can tell Stan an idea, a tweak or a niggle. Every one is kept in the ideas register; Stan answers but never promises it will be built. ([decision 0024](decisions/0024-chat-with-stan.md))
- Dispatchers review the register and give each idea a status (New, Planned, Done, Not now) and a note on what was decided.

## On duty and shifts (Mike, 12 Nov 2026)
- **On duty** is tapped at the depot, so sorting and loading count. **On the run** happens by itself: about 30 seconds of driving (above 15 km/h) with the run open, or the first tick. **Off duty** at the end. ([decision 0020](decisions/0020-on-duty-and-shifts.md))
- **My runs**: the runs you're doing today, in your order. When one is finished the app moves on to the next and notes the time.
- **No minute goes missing.** A shift is split into depot, driving to a run, own runs, helping, stopped (10 minutes or more with no tick), between runs and after the last stop. The gap after helping someone counts as driving to your next run.
- **Helping** shows on the helper's shift as *Helping (Moana)*; it doesn't change the run owner's figures. A run belongs to the driver it was closed with, else whoever ticked most of it.
- Forgot Off duty: the shift ends at the last tick (after 12 hours). Ticks after Off duty aren't part of the shift.
- **Finish time** (Mike, 12 Nov 2026): the run screen shows *finish about 6:35 am* for everything you have open (all of My runs), so you know early if you should ring someone for help. It's your pace so far (stops of 10+ minutes don't count) times the stops left, plus 5 minutes to get to each run not started. No guess before 5 stops.
- **The depot** is set in Dispatch; within 150 m (changeable) counts as at the depot.

## Tracing a tile back to the sheet
Every run keeps the SHA-256 fingerprint of the PDF it was read from (`runs.source_hash`), and every tile keeps each sheet line it came from: page, row, publication, quantity and the text exactly as printed. Lines are combined into one tile for the driver, never lost. (Governance baseline v0.5, adopted 9 Nov 2026)

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

- **Dates:** each policy can have a start and an end date. Ended and not-yet-started policies stay for the record but are not in force; drivers will only see policies in force. (Governance baseline v0.5, adopted 9 Nov 2026)
- **No hidden precedence:** two policies of the same kind that set different values, cover at least one address in common and overlap in days and dates are **refused**, wherever they sit (5:30 on the village and 6:00 on one building is a clash, not "the building wins"). Change one, switch one off, or give them different days or dates. A second rule of the same kind on the same target is also refused. Notes and restrictions add up and never clash. If a clash appears later (an address moved under a stop with a different rule) Dispatch lists it under Needs attention. — `sql/schema.sql` `policies_clash`

## People and access
- **App only** (`driver`): runs, ticks, photos, reordering.
- **App + Dispatch** (`dispatcher`): also the dispatch dashboard: the register, locations, policies and users. Mike is the first dispatcher. (Mike, 8 Nov 2026)
- Enforced by the database, not just the screens: only dispatchers can change locations, policies, assignments or people.
- There must always be at least one active dispatcher. Switching someone off locks them out immediately; their history stays.
- New people get a temporary password from a dispatcher, in person, and can change it in the app.
