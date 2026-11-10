# UX review: STB Runs app and dispatch dashboard

- **Date:** 8 Nov 2026 (before the first live trial)
- **Asked by:** Mike, because "the app interface is becoming a bit clunky"
- **Method:** walked every screen at phone size (390 px) and laptop size, in normal and big text, using the Mon 9 Nov sheets. Checked against the usual heuristics (Nielsen's ten, Apple/Material touch and reach guidance, WCAG 2.2 AA contrast and target size) and the realities of this job.
- **Status:** all four phases implemented on 9 Nov 2026 (see the [changelog](../CHANGELOG.md)), with night mode as the default at Zaph's suggestion. D3's map-first planning is a click-to-select map on the Addresses page; a fuller drag-to-stop map is still on the [roadmap](roadmap.md).
- **Screenshots:** kept out of the repository, because the repo is public and the screens show customer names and addresses.

## Summary: the five changes that matter most
1. **Split the two products.** Drivers need a "do my run" phone app, and the dispatcher needs a planning tool on a laptop. Today both share one home page, so drivers see admin tools (Get Runs, uploads, change lists) and the dispatcher's tools are squeezed into a phone layout. Give dispatch its own landing page and layout, and give each role the home that fits it ([§4](#4-a-separate-dispatch-landing-page)).
2. **Make the run screen calmer.** About 40% of the first screen is controls before the first address: back link, a cut-off title, •••, Text link, status pills, run tabs, search, To do only. Move secondary controls into one menu, and give the space to the run.
3. **Design for the dark and for movement.** Runs start around 5am, in the dark, in a vehicle, often one-handed. That calls for a proper **night mode** (dark by default during the run), bigger targets at the bottom of the screen where a thumb reaches, and stronger tile edges. The current tile border is barely visible: 1.2:1 contrast against the background, where 3:1 is the minimum.
4. **One meaning per colour.** Charcoal is used for street banners, the main button, the ×2 badge and the DOCKET chip. Orange is used for two different things. Green is mostly "done", but also appears on status text. Settle on a small, fixed set of meanings (§5) so a glance is enough.
5. **The pop-up after a tick needs rework.** It covers the next tiles, the address wraps to four lines, it stays on screen after you leave the run (it appeared over the Runs page), and with two actions it disappears before Mum can read it. Make it a slim bar along the bottom that doesn't cover the list.

## 1. Who uses it, and where
| Person | Device | Situation | Needs |
|---|---|---|---|
| Driver or passenger (Mike, Lisa, the boys) | Phone, often mounted | Dark, early morning, moving, one hand, glare from street lights | One glance, one tap. Next address obvious. Hard to make a mistake, easy to undo |
| Mum | Phone, big text | As above, with reduced vision | Very high contrast, one thing at a time, no small or temporary text |
| Dispatcher (Mike) | Laptop or tablet, at home | Planning, checking sheets, fixing problems | Lots of information at once, tables, maps, bulk actions, no accidental changes |

The current design treats all three the same.

## 2. Findings by screen
Severity: **H** = causes mistakes or slows every run; **M** = friction; **L** = polish.

### Runs (home)
| # | Finding | Sev | Recommendation |
|---|---|---|---|
| R1 | Driver and admin jobs mixed together: Get Runs, upload, last updated, change lists, Papers to collect and Text links all sit next to the run cards | H | Driver home = **Today**: one big card per run ("Run 6 · 98 stops · Start"), with Papers to collect folded in under it. Sheet loading, the change history and re-fetching move to dispatch |
| R2 | Names don't match: cards say HOWICK06, everywhere else says Run 6 | M | Use "Run 6" everywhere; keep HOWICK06 only in dispatch and the docs |
| R3 | Cards are listed 13, 11, 10, 8, 6, but the table above runs 6 → 13 | L | Same order everywhere (by run number, or by the family's usual start order) |
| R4 | "Make text bigger" is a full-width button that competes with the main actions | M | Move it into a small **settings** sheet (text size, night mode, change password, sign out) |
| R5 | Every card has its own Text link button and an empty progress bar | L | Hide the progress bar until something is ticked. Put sharing in the card's menu, or on a long press |
| R6 | The demo-mode banner takes the prime spot | L | Show it once, then shrink it to a small label |

### Run screen
| # | Finding | Sev | Recommendation |
|---|---|---|---|
| U1 | Too much chrome before the first address (8 controls). The title gets cut off ("Run 6 + Run 8 …") | H | One slim header: ‹ back, run name, progress. Search, To do only, order, door codes and sharing go into one ⋯ sheet. Status pills ("GPS off", "On this phone") become a small dot that explains itself when tapped |
| U2 | **Text link** is the darkest, most prominent button on the screen, but ticking is the main job | M | Move sharing into ⋯. Nothing should look more important than the tiles |
| U3 | Tiles in the 2-column grid have ragged heights, because long notes stretch a tile and its neighbour | M | Clamp notes to 2 lines with "more"; equal row heights. Or a **single-column list** for everyone, which also reads straight down (the big-text layout already does this, and is easier to follow) |
| U4 | Tile edges are nearly invisible (1.2:1) and grey note text is light | H | 2 px borders at ≥3:1. Note text at the body colour, not grey: notes are instructions, not decoration |
| U5 | Addresses read awkwardly: "2C/ 12", "Suite 1/ 87", "4c/ 12" | M | Format as the driver says it: **12 · Unit 2C**, **87 · Suite 1**. House number first and large, unit underneath |
| U6 | No obvious "next" | H | Highlight the **next stop** (first not-done tile in order) with a thick outline and a "Next" label, and auto-scroll to it after each tick. This is the biggest speed gain available |
| U7 | The tick pop-up covers tiles, wraps to 4 lines, leaks onto other screens, and vanishes after 6 s | H | A bottom bar 56 px tall: "✓ 87 Picton St · Undo · 📷". It sits under the list, not on top of it, and stays until the next tick. Clear it when leaving the run |
| U8 | Controls sit at the top, out of thumb reach while driving | M | Put the frequent actions (next, photo, undo) in the bottom bar. Keep the top for status only |
| U9 | The floating progress bar repeats the header's information | L | Merge them into one sticky header |
| U10 | No haptic or sound confirmation of a tick | M | A short vibration on tick and a different one on undo (Android). Optional click sound |
| U11 | Street banners are strong, which is good, but the run-name divider ("HOWICK06") above them is weak when several runs are open | L | Make run dividers a distinct full-width band with the run's colour or number |

### Loading a sheet
| # | Finding | Sev | Recommendation |
|---|---|---|---|
| L1 | The sticky "Save 5 runs" button covers a card while scrolling | L | Add bottom padding equal to the button's height |
| L2 | Flagged addresses are shown in raw uppercase from the sheet | L | Title case, and link each one to its tile |
| L3 | Belongs to the dispatcher's job, not the driver's | M | Move to dispatch (see R1). Drivers keep a fallback "Upload sheet" in settings |

### Big text (Mum)
| # | Finding | Sev | Recommendation |
|---|---|---|---|
| B1 | Works well: single column, solid green DONE tiles, big numbers | – | Keep it, and make it the basis of the default run layout (U3) |
| B2 | The header and controls get big too, so even less of the run fits on screen | M | Scale the tiles, not the chrome; with U1 there will be less chrome to scale |
| B3 | Pop-ups and hints are still temporary and small relative to the rest | H | U7, and never put essential information in something that disappears |

### Dispatch dashboard
| # | Finding | Sev | Recommendation |
|---|---|---|---|
| D1 | Reached from a button on the drivers' home, with the phone app's styling | H | Its own landing page and layout (§4) |
| D2 | Bulk assign silently included addresses ticked earlier (fixed 8 Nov, see changelog). Bulk changes have no confirmation and no undo | H | Show "Assign 12 addresses to Monaco?" with the list. Offer **Undo** for the last bulk change: the history table already holds what's needed |
| D3 | Addresses and locations are separate tabs, so assigning means switching between them | M | A **map-first planning view**: the map on the left with addresses as dots (coloured by assigned/unassigned), the stop list on the right. Lasso dots and drop them on a stop |
| D4 | No overview of progress | M | Landing page cards: "Run 8: 66/66 addresses assigned, 0/5 service locations validated, 2 policies", with a link into each |

## 3. Accessibility checks (WCAG 2.2 AA)
| Check | Result |
|---|---|
| Body and grey text contrast | Pass (5.1:1 on the background, 5.6:1 on cards) |
| Green "done" / "totals match" text on white | **Fail**: 3.3:1, needs 4.5:1. Use a darker green (#15803d is 5.0:1) |
| Tile borders against the background | **Fail**: 1.2:1, needs 3:1 for UI component edges |
| White text on the blue and orange chips | Pass (5.2:1) |
| Touch targets | Pass for tiles and main buttons; "Clear", "‹ Runs" and the run tabs are borderline (aim for 44 px) |
| Colour alone carrying meaning | Pass: chips always have text |
| Timed messages (WCAG 2.2.1) | **Fail** in spirit: the Undo pop-up disappears after 6 s. Keep it until the next action |

## 4. A separate dispatch landing page
- **Where:** `…/stb-runs/dispatch` (its own page), also linked from the app's settings for dispatchers. On a laptop, a dispatcher's sign-in lands here. On a phone it lands on Today, with a link across.
- **Layout:** desktop-first. A left sidebar (Overview, Runs & sheets, Addresses, Locations, Policies, People, History, since renamed Change log), with the content to the right. Tables and maps at full width.
- **Overview page (the landing):**
  - **Tonight's sheets:** status of the 7pm fetch, totals check, "No details changed / 3 changed", and a **Get Runs** button.
  - **Live runs** (on delivery mornings): progress per run, who is on it, last tick, a map of today's ticks.
  - **Needs attention:** unassigned addresses, new addresses since the last sheet, complaints and photos, service locations not validated.
  - **Papers to collect:** the same table the drivers see.
- **Runs & sheets:** loading and checking sheets, re-fetch, the change history per day. All moved out of the drivers' app.
- **Look:** same colours and type as the app so it feels like one product, but a denser layout (smaller rows, more columns).

## 5. Design system cleanup
**Colour meanings, one each:**
| Colour | Means | Nothing else |
|---|---|---|
| Green | Delivered / OK | No green text elsewhere |
| Charcoal | Structure: headers, street banners, main buttons | Not used for chips or badges |
| Blue | Shop drop / docket | Not used for links or the "info" banner (use underlined text for links) |
| Yellow | Another paper | – |
| Dark orange | Several papers | – |
| Red | Complaint, problem, delete | – |
| Purple (new) | "Next stop" highlight | – |

- **Type scale:** settle on 4 sizes (14, 17, 22, 34 px; big text ×1.3) instead of the current ad-hoc sizes.
- **Spacing:** a 4/8 px grid.
- **Components to standardise:** tile, chip, banner, bottom bar, sheet (pop-up panel), table, map card. Document them in a short `docs/design.md` with do's and don'ts, so new screens stop drifting (the cause of the "clunky" feel: each feature added its own little style).

## 6. Proposed plan
| Phase | What | Why first |
|---|---|---|
| **1: quick fixes** (before or during the trial week) | U4 tile edges and note contrast; green text contrast; U7 bottom bar replacing the pop-up (and the leak fix); U5 address formatting; R2 "Run 6" everywhere; L1 padding | Small, safe changes that remove mistakes. No new layout to learn mid-trial |
| **2: driver app restructure** | Today home (R1); slim run header with one ⋯ menu (U1/U2); Next stop highlight and auto-scroll (U6); thumb-reach bottom bar (U8); single-column layout option (U3); settings sheet (R4); night mode | The biggest gain in speed and calm. Do it after the trial, using what the family found |
| **3: dispatch as its own product** | Separate landing page and sidebar (§4); Overview; move sheet loading and the change history there; bulk confirm and undo (D2); map-first planning (D3) | Builds on the dispatch foundation; doesn't touch drivers |
| **4: design system** | `docs/design.md`, tokens, components; a review checklist added to CONTRIBUTING | Stops the drift from coming back |

## 7. How to judge it during the trial
The app already records what's needed:
- **Seconds per stop:** time between ticks, from the tap history. Faster after phase 2 means it's working.
- **Undos per run:** a mis-tap rate. It should drop after U4, U6 and U7.
- **Things to watch and ask:** where people hesitate; whether anyone used search; whether Mum can find the next address without help; whether anyone opened ⋯ during a run (if not, those controls can be hidden).
- **Three questions after each run:** What slowed you down? What did you look for and not find? What did you never use?

## 8. Second review: 10 Nov 2026

- **Asked by:** Mike, two days into the family trial ("another UX/UI review").
- **Method:** every driver screen at 390 px and 360 px, in Night, Day and big text, with made-up sheets (3 runs, 136 stops); dispatch at laptop size on the test stand-in. Not checked: dispatch at phone size, Run 8's village layout, and the live data.
- **Status:** everything below implemented the same day (see the [changelog](../CHANGELOG.md)).

### Driver app
| # | Finding | Sev | Done |
|---|---|---|---|
| V1 | The bottom bar cut off what was just ticked and the next stop ("✓ 23 …", "Next: 25…"; on a 360 px phone just "✓…"), because four buttons shared its row | H | Words get two full-width lines above the buttons |
| V2 | Mid-street, no street name on screen: tiles show only numbers and the banner scrolled away | H | Street banners stick under the header |
| V3 | A ticked tile grew by a line (who and when), shifting the tiles below just as the thumb heads for the next one | H | Who and when sit beside the ✓; height unchanged (measured before and after) |
| V4 | "Saved: not delivered" pop-up repeated the tile and the bar, and sat on top of the problem menu, hiding *Other reason…* | M | Pop-up removed; opening any menu clears a message |
| V5 | Run header was three rows because the status wrapped | M | Date moved beside the run name; status stays on one line |
| V6 | Unit and Suite numbers were grey, though they decide the letterbox | M | Body colour, slightly larger |
| V7 | Home said "4 of 73 done" when one was a couldn't-deliver | L | "4 of 73 done · 1 not delivered" |
| V8 | *Other reason…* opened a plain browser box | L | Its own sheet with a text box |
| V9 | Emoji icons (🔍 📷 ⚠) look different on each phone | L | Line icons |

### Dispatch
| # | Finding | Sev | Done |
|---|---|---|---|
| W1 | Delivery score table ran off its card at laptop width ("Not delivered" cut off) | M | Headings wrap; card is wider |
| W2 | Overview cards left large gaps, and Needs attention was not prominent | M | Two columns: the day's work, and what needs a look |
| W3 | Two link styles (bold blue run links, grey underlined everything else) | L | One style |
| W4 | "✓ 1" under Totals and "▸ 1" under Notes didn't say what they counted | L | "✓ match", "1 note" |
| W5 | "+ note" on Complaints was a tiny target; address links sat off-centre in their column | L | A button; left-aligned |
| W6 | "Mclaren" | L | McLaren (and other Mc names) |

### Still open
- Dispatch at phone size has not been reviewed.
- Notes on complaints still use a browser box (dispatch only, laptop).
- The first-visit tip ("hold a tile to move it") still covers two tiles for a few seconds, once per phone.
