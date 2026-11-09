# Dispatch guide

The dispatch dashboard is where routes are planned: the register of every address we deliver to, the places the vehicle stops, where the work is done on foot, and the rules that apply there. It is for people with **App + Dispatch** access, and is its own site: **whoisdoingthis-star.github.io/stb-runs/dispatch/**. On a laptop a dispatcher lands there when opening the app; on a phone, use **Dispatch dashboard ›** on the Runs page or ⚙ Settings. **‹ Driver app** (bottom of the sidebar) goes back.

## Overview (the landing page)
- **Sheets** for today (or the next delivery day loaded): each run's stops, items, whether the totals match RouteSmart, when it was updated and from where, and how many details changed. **Get Runs from RouteSmart** and **Upload a sheet** are here.
- **Needs attention**: totals that don't match, changes since the previous sheet, complaints, addresses not tied to a location, new addresses on this sheet, service locations not yet validated. Most lines link straight to the fix.
- **Status** (last column of Sheets, and on Runs & sheets): open (with stops done), **✓ Completed (app)** with who ticked it and the last tick when every stop was dealt with in the app (**Set driver…** records who did it), or **✓ Closed (paper/app)** with the driver and finish time. **Close run…** asks who did it, when it finished and how: *on the paper sheet* ticks every stop not ticked in the app in the driver's name; *in the app* closes it as it is. **Reopen…** unticks only the paper ticks. See [business rules](business-rules.md#closing-a-run).
- **Needs attention** also lists every **couldn't deliver** (address, reason, who) and any **policies that disagree**.
- **Progress**: each run's ticks so far and the last tick (live on delivery mornings).
- **Delivery score (DIFOTIS)** per run: delivered, in full (not short), on time (inside the address's time policies, or on the day), in spec (no wet, damaged or wrong-paper complaint for that day), and couldn't deliver. See [business rules](business-rules.md#delivery-outcomes).
- **Items to collect** and **Recent photos**.

## Complaints
- The **Overview** lists the complaints on today's sheet with a one-line summary: what happened and when ("Missed delivery on Sat 7 Nov"), the delivery record (who ticked it and when, with 📷 if there's a photo, or "Before the app"), and the customer's history ("2nd of 2 from this address · previous Fri 2 Oct").
- The **Complaints** page is the full register: every complaint from every sheet, kept once. Filter by period, run, kind, status, or search an address, driver or note.
- **Patterns** across the top: complaints by kind, by run, by who ticked the delivery, and **repeat addresses**.
- Set each complaint's **status**: Open, Disputed (we delivered), Accepted (our miss), Closed, and add notes (e.g. "Photo sent to the owner on WhatsApp").
- A pattern is a prompt to look closer, not proof: see [Business rules: complaints register](business-rules.md#complaints-register).

## Runs & sheets
Two tabs: **Active** (every run not yet finished or closed, including earlier days: close the paper ones) and **History** (finished in the app, or closed here). Overview's Sheets table also lists only the day's active runs, with a link to the finished ones.

Every loaded day: per run, the totals check, the sheet's notes, when and how it was loaded, and what changed (tap to expand). Open any run from here.

## Change log
(Was called *History*; renamed so it isn't confused with finished runs.)
Every change on the dashboard (people, logins, locations, assignments, policies): when, who, what.

The words used here are defined in [Business rules: locations](business-rules.md#locations-operating-and-service).

## Addresses (the register)
Every address that has ever appeared on a run sheet, added automatically as sheets load. Nothing to type.
- **Filters**: by run, by status (not assigned / assigned but not validated / validated / no GPS yet), or search.
- **GPS** column: how many deliveries have been ticked there with a good GPS fix. Those positions are where the letterbox really is.
- **Map** (above the table, once there's GPS): the shown addresses as dots (orange not assigned, green assigned, purple ticked). Click dots to tick them, then assign.
- **Assign**: tick addresses (or the box at the top to tick all shown), choose an **operating location** and optionally a **service location**, then **Assign**. It asks you to confirm, listing the addresses, and the message afterwards has **Undo**, which puts every one back as it was. Assigning resets validation, since the new assignment hasn't been checked. The ticks clear after every Assign, Mark validated or Unassign, so each batch starts fresh; if some ticked addresses are hidden by the filters, the bar says so before you assign.
- **Mark validated**: once someone has checked on the ground that the assignment is right.
- Click an address to see it on the map (green = where it was delivered, blue = the stop, orange = the service location), add notes, see every policy that applies to it and where each comes from, or add a policy just for that address.

## Locations
A tree on the left: **groups** (bold) → **operating locations** (🅿) → **service locations** (○ not validated, ✓ validated).
- **+ Group**: a village, building, street or area. Groups can sit inside groups (e.g. Monaco building inside Bruce McLaren Village).
- **+ Operating location**: where the vehicle stops. Give it a stop number for its place along the run. Set its GPS by clicking the map, or **Use the middle of N delivered addresses**.
- **+ Service location**: where the work is done from that stop (letterbox, bank, reception, lobby, door). Set GPS the same way; **Mark validated** once checked on site.
- Deleting a location leaves its addresses unassigned; nothing else is lost.

## Policies
Rules attached to a group, an operating location, a service location or one address. A policy applies to everything underneath it (a village's time window applies to every unit in it).

| Policy | For example |
|---|---|
| Entry point from the road | "Enter from Bruce McLaren Road, not the main gate", with its GPS |
| Access note | "Lobby door sticks: push hard" |
| No service before | No deliveries before 5:30 |
| Deliver between | Between 05:00 and 07:00 |
| Speed limit | 10 km/h inside the village |
| Delivery restriction | "Not in the letterbox: leave at the door" |

Each can be limited to certain days (none ticked = every day) and to **dates** (a start, an end, or both: a summer gate time, a road closure), and switched off without deleting it. Ended and not-yet-started ones are greyed but kept. The **Policies** tab lists them all.

**Policies can't contradict each other.** If you add "no service before 6:00" to a Monaco building while the village says 5:30 on the same days and dates, it is refused with the policy it clashes with. Change one, switch one off, or give them different days or dates. Notes and restrictions can stack freely. If moving an address creates a clash, a red banner on Policies (and a line in Needs attention) lists it.

*Today policies are recorded and shown on the dashboard. Showing them on the drivers' run screens, and navigating stop to stop, is the next step ([roadmap](roadmap.md)).*

## People
- **Access**: **App only** (runs, ticks, photos) or **App + Dispatch** (also this dashboard). Changes apply at their next screen.
- **Add a person**: name (it shows on tiles they tick), email, access, and a temporary password you give them in person. They can change it from the Runs page (**Change password**).
- **Set password**: give someone a new temporary password if they forget theirs.
- **Switch off**: stops their access at once (their login and session too). Their past ticks and photos stay. **Switch on** restores it.
- There must always be at least one active dispatcher; the database refuses to remove the last one.

Every change on the dashboard is logged (who, when, what) in `dispatch_history`.
