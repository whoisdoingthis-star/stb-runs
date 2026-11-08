# Roadmap

Planned, in order. Each item, when built, moves into the changelog and the relevant docs.

## Done: dispatch foundation (8 Nov 2026)
Roles (App only / App + Dispatch) and user management; the address register filled from every run sheet; location groups, operating locations, service locations; policies; dispatch dashboard. See the [dispatch guide](dispatch-guide.md).

## Next
0. **UX improvements** in four phases, from the [UX review](ux-review.md): quick contrast and pop-up fixes, then the driver app restructure (Today home, Next stop, slim header, night mode), then dispatch as its own product, then a design system.
1. **Drivers see the plan**: the run grouped by operating location ("Park at Monaco car park") with its service locations, and the policies that apply (entry point, time windows, speed limits, access notes) shown on the stop.
2. **Navigate** (bottom right on a run): send the next 3 operating locations to Google Maps (or the next one to Waze), from the driver's position. Works with Android split screen (STB on top, Maps below); iPhone switches between apps. A compact "next stops" view for half a screen. Discussed 8 Nov 2026: navigation goes stop to stop, never letterbox to letterbox.
3. **Run 8 from data**: move Run 8's building order and mailbox banks from code (`js/village.js`) into groups, operating and service locations on the dashboard, so they're edited without code.
4. **Suggested stops**: use tap GPS and timing (walking vs driving gaps) to suggest operating locations and which addresses belong to each.
5. **Live operations**: allocate runs to drivers, a live map of progress, complaints and photos reviewed in one place.

## Before relying on it
- Rotate the Supabase secret key and change the RouteSmart password ([decision 0011](decisions/0011-known-security-shortcuts.md)).
- Protect `main`: changes through pull requests approved by Mike ([decision 0009](decisions/0009-docs-as-code.md)).
- A proper email sender, so users can be invited by email and reset their own passwords.
