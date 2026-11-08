# Changelog

What changed, written for the family first. Newest at the top.
Every change adds a line under *Unreleased* in the same commit ([CONTRIBUTING](CONTRIBUTING.md)).
When a batch has been trialled, its lines move under a dated heading.

## Unreleased
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
