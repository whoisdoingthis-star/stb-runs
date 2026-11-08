# Changelog

What changed, written for the family first. Newest at the top.
Every change adds a line under *Unreleased* in the same commit ([CONTRIBUTING](CONTRIBUTING.md)).
When a batch has been trialled, its lines move under a dated heading.

## Unreleased
- Totals now say **items** instead of papers or copies ("115 items"), since runs mix newspapers and magazines (WD is Woman's Day). "Papers to collect" is now **Items to collect**.
- **Depot pick** on each run card and in Papers to collect (and the dispatch Overview): bundles and loose copies per paper, straight from the key report, e.g. "NZH 1 bundle of 140 + 5 loose (includes 15 for retail)". Retail copies (NZHR) are combined with NZH, as the depot bundles them together.
- **Complaints register** (dispatch): every complaint from every key report is kept once, with the delivery record (who ticked it, when, photos) and the customer's history (how many complaints, previous date). The **Overview** summarises today's complaints; the new **Complaints** page shows patterns by kind, run, who ticked it, and repeat addresses, and lets you mark each open, disputed, accepted or closed with notes. The parser now records each complaint's kind, date, paper and subscription. (`complaints`, `complaint_register`)
- **Night mode, on by default** (Zaph's call): dark colours before the first paint, with Day and Auto (night 7pm–7am) in settings. Every colour checked for contrast in both themes; tile edges are now clearly visible.
- **Run screen rebuilt**: one slim header (back, run, 🔍, ⋯), the **purple NEXT tile** for the next stop (the list follows as you tick), and a **bottom bar** with what you just ticked, **↶ Undo**, **📷** and **Next ↓** that stays until your next tick. Everything else is in one **⋯ menu** (To do only, order, tiles, text, colours, text a link, door codes, checks, and the destructive options last in red). Unit numbers read naturally ("87 · Suite 1"). Messages no longer follow you to other screens.
- **Today home**: big **Run 6** cards (Start / Continue), the update and change line per day, Papers to collect folded away, older days tucked under **Earlier days**, and **⚙ Settings** for text, colours, tiles, Get Runs, upload, password and sign out.
- **Dispatch is its own site** (`/stb-runs/dispatch/`, and where a dispatcher lands on a laptop): sidebar, **Overview** (sheets, needs attention, progress, papers, photos), **Runs & sheets**, **History**; bulk changes confirm first and offer **Undo**; a click-to-select **map** on Addresses.
- **Design guide** ([docs/design.md](docs/design.md)): tokens, colour meanings, type scale, components and a checklist, so new screens stay consistent.
- **UX review** written ([docs/ux-review.md](docs/ux-review.md)): findings for every screen, accessibility checks and a four-phase plan. Docs only.
- **Fix (dispatch):** after **Assign**, the ticked addresses stayed ticked, so the next assignment also moved the previous batch (all 66 Run 8 addresses ended up on Reception). Ticks now clear after every bulk action, and the bar warns about ticked addresses hidden by filters. Run 8's assignments were restored from the change history to each address's first assignment (Amon 11, Hulme 12, Monaco 16, Austin 4, Reception 23).
- **Dispatch dashboard** (for App + Dispatch access): the **address register** (every address from every run sheet, added automatically, with learned GPS), **locations** (groups → operating locations where the vehicle stops → service locations where the work is done, set on a map and validated), **policies** (entry point, access notes, time windows, speed limits, restrictions, by day), and **users** (add people, App only or App + Dispatch, temporary passwords, switch off). Drivers' screens are unchanged. (`addresses`, `location_groups`, `operating_locations`, `service_locations`, `location_policies`, `dispatch_history`; `members.role`, `members.active`; Edge Function `admin-users`)
- **Change password** on the Runs page.
- **Moving tiles a long way**: while holding a tile or street, drag it to the top or bottom of the screen and the list scrolls by itself (it stopped working upwards once you had scrolled down). No more dropping it at the top and picking it up again.
- Docs as code: documentation now lives in `docs/` and changes with the code; automatic checks (tests, docs links, data model, changelog, version bump, secrets) run on every change. Docs-only change for the phones.

## 2026-11-08 (Sun): ready for the first live trial
- **Photos for complaints**: 📷 button on complaint and watched addresses, and after any tick. Photos are stamped with address, time and driver, saved to the run, and sent on WhatsApp from the share sheet. "Ask for a photo every delivery" keeps an address on a watch list. (`photos`, `photo_watch`, `delivery-photos` bucket)
- **Street banners**: street names are bold capitals on a dark banner with the count; green when finished.
- **Runs last updated** on the Runs page, and **what changed** when a sheet replaces an earlier one ("3 details changed" with the list, or "No details changed"), after Get Runs or a manual upload. (`runs.last_changes`)
- **Tile colours**: shops light blue, other papers light yellow, several papers light orange; delivered is always green.
- **NZHR = NZH to a shop**: counted as NZH in Papers to collect, with a Dockets column; tiles show **NZH + DOCKET**.
- **Papers to collect** table on the Runs page: each run's papers by publication, with totals.
- **Big text** for easier reading: one address per row, solid green DONE tiles. On automatically for Mum.
- Runs page buttons: **Get Runs** (from RouteSmart) first, **Manually upload runsheet** second.
- App updates arrive on the next open; a run in progress offers **Reload** instead of jumping.
- Charcoal grey colour scheme; new yellow **STB Together** icon.
- Complaints show what they were, e.g. "Missed delivery on Sat 7 Nov (NZH, 7-day subscriber)".
- Fetch job moved to Node 22 (a Supabase library update needed it).
- **Re-fetch from RouteSmart** from the app (Supabase Edge Function `refetch`); runs list and open runs update live when a sheet is replaced.
- Evening fetch waits for RouteSmart to finish signing in before asking for the report.
- First version: load and check run sheets, one tile per address with coloured publication chips, tap to complete with GPS and time, share by text link, work a run together live, hold and drag to reorder, floating progress bar, Run 8 village layout with mailbox banks and reception handover, evening fetch from RouteSmart.
