# Roadmap

Planned, in order. Each item, when built, moves into the changelog and the relevant docs.

## Done: dispatch foundation (8 Nov 2026)
Roles (App only / App + Dispatch) and user management; the address register filled from every run sheet; location groups, operating locations, service locations; policies; dispatch dashboard. See the [dispatch guide](dispatch-guide.md).

## Done: UX overhaul (9 Nov 2026)
All four phases of the [UX review](ux-review.md): night mode by default, the run screen (NEXT stop, bottom bar, one menu), the Today home and settings, dispatch as its own site with an Overview, and the [design guide](design.md).

## Done: governance baseline v0.5 adopted (9 Nov 2026)
Policy dates and clash refusal, couldn't deliver / short, DIFOTIS, sheet fingerprints and line provenance, numbered requirements, glossary, append-only decision records, Run 8 banks in Dispatch ([decision 0014](decisions/0014-governance-baseline.md)).

## Next
1. **Drivers see the plan**: the run grouped by operating location ("Park at Monaco car park") with its service locations, and the policies that apply (entry point, time windows, speed limits, access notes) shown on the stop.
2. **Navigate**: *Driver Assistant added 12 Nov 2026* (voice turn-by-turn in the app, [decision 0019](decisions/0019-driver-assistant.md)); later: work out every leg when the sheet loads and store it, so it works with no signal. *Started 10 Nov 2026*: the arrow sends the **next stop** to Google Maps on demand (Mike chose Google Maps over Waze, one stop at a time). Still to come: several stops at once as waypoints, and a floating mini-map in the app (most useful on iPhone, where Google Maps can't float). Works with Android split screen (STB on top, Maps below); iPhone switches between apps. A compact "next stops" view for half a screen. Discussed 8 Nov 2026: navigation goes stop to stop, never letterbox to letterbox.
3. **Run 8 from data**: move Run 8's building order and mailbox banks from code (`js/village.js`) into groups, operating and service locations on the dashboard, so they're edited without code.
4. **Map planning**: lasso addresses on the map and drop them on a stop (the map currently selects by clicking dots).
5. **Smart sequencing** (Mike, 9 Nov 2026): learn each driver's preferred order from the time and place of their ticks, and offer "Lisa's order" alongside Our order and Sheet order. Needs a few weeks of ticks per run; orders would be stored per person as well as per route.
6. **Suggested stops**: use tap GPS and timing (walking vs driving gaps) to suggest operating locations and which addresses belong to each.
7. **Live operations**: allocate runs to drivers, a live map of progress, complaints and photos reviewed in one place.

Later, from the governance baseline (for STB proper): several companies on one system (tenants), published route versions that freeze once a run starts, vehicle limits and optimisation.

## Towards a product for run owners (review, 13 Nov 2026)
Where the app stands after its first week in use, looked at from the seat of someone who owns delivery contracts and has several contractors.

**Already there**
- Proof of delivery: every tick has who, when and where; photos; a complaint register matched to the delivery; a PDF report for any dates; Find a delivery.
- Seeing the morning: Morning watch against deadlines, runs on a map, Ping, shifts, the morning summary.
- Covering a run: the order, notes and Stan's directions stay with the run, not in one driver's head.
- Sheets load themselves; totals are checked; stops and new starts are flagged.

**Gaps, in the order they matter**
1. **Alerts when nobody is looking.** A job on the server every few minutes, using the same rules as Morning watch, sending a text or email for "not started: will be late" and "running late". Needs a sender (email is free to start; texts cost per message).
2. **A login for the run owner.** Read-only: Morning watch, Find a delivery, reports, the run map. No Ping, shifts, ideas book or people's icons, which are the contractor's own business.
3. **Each contractor's data kept apart** (tenants). Today everyone on the list can read everything. Before a second contractor joins, every table needs to know which contractor it belongs to, and the rules must enforce it. This is the big one: plan it, test it on a copy, then move.
4. **Getting sheets in without us.** Each contractor's sheets arriving by their own login to the source system, or by upload (the customer-portal idea of 9 Nov).
5. **Numbers over time**: on-time rate and complaints per thousand deliveries by run and month, for the owner's meetings with the publisher.
6. **Looking after it**: the secret key rotated and the source-system password changed (below), a proper email sender, backups checked, and somewhere to see errors from phones.
7. **Paper runs**: until every driver uses the app, a paper run has no times or GPS. The watch and the report say so plainly; the fix is adoption, not code.

**Order of work proposed**: 1 and 2 next (they are what the owner would use daily), then 3 before anyone else's data comes in, then 4 and 5.

## Before relying on it
- Rotate the Supabase secret key and change the RouteSmart password ([decision 0011](decisions/0011-known-security-shortcuts.md)).
- Protect `main`: changes through pull requests approved by Mike ([decision 0009](decisions/0009-docs-as-code.md)).
- A proper email sender, so users can be invited by email and reset their own passwords.
