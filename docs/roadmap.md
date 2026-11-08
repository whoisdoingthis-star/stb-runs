# Roadmap

Planned, in order. Each item, when built, moves into the changelog and the relevant docs.

## Done: dispatch foundation (8 Nov 2026)
Roles (App only / App + Dispatch) and user management; the address register filled from every run sheet; location groups, operating locations, service locations; policies; dispatch dashboard. See the [dispatch guide](dispatch-guide.md).

## Done: UX overhaul (9 Nov 2026)
All four phases of the [UX review](ux-review.md): night mode by default, the run screen (NEXT stop, bottom bar, one menu), the Today home and settings, dispatch as its own site with an Overview, and the [design guide](design.md).

## Next
1. **Drivers see the plan**: the run grouped by operating location ("Park at Monaco car park") with its service locations, and the policies that apply (entry point, time windows, speed limits, access notes) shown on the stop.
2. **Navigate** (bottom right on a run): send the next 3 operating locations to Google Maps (or the next one to Waze), from the driver's position. Works with Android split screen (STB on top, Maps below); iPhone switches between apps. A compact "next stops" view for half a screen. Discussed 8 Nov 2026: navigation goes stop to stop, never letterbox to letterbox.
3. **Run 8 from data**: move Run 8's building order and mailbox banks from code (`js/village.js`) into groups, operating and service locations on the dashboard, so they're edited without code.
4. **Map planning**: lasso addresses on the map and drop them on a stop (the map currently selects by clicking dots).
5. **Smart sequencing** (Mike, 9 Nov 2026): learn each driver's preferred order from the time and place of their ticks, and offer "Lisa's order" alongside Our order and Sheet order. Needs a few weeks of ticks per run; orders would be stored per person as well as per route.
6. **Suggested stops**: use tap GPS and timing (walking vs driving gaps) to suggest operating locations and which addresses belong to each.
7. **Live operations**: allocate runs to drivers, a live map of progress, complaints and photos reviewed in one place.

## Before relying on it
- Rotate the Supabase secret key and change the RouteSmart password ([decision 0011](decisions/0011-known-security-shortcuts.md)).
- Protect `main`: changes through pull requests approved by Mike ([decision 0009](decisions/0009-docs-as-code.md)).
- A proper email sender, so users can be invited by email and reset their own passwords.
