# Dispatch guide

The dispatch dashboard is where routes are planned: the register of every address we deliver to, the places the vehicle stops, where the work is done on foot, and the rules that apply there. It is for people with **App + Dispatch** access. Open it from the **Dispatch dashboard** button on the Runs page (best on a laptop or tablet; it works on a phone too).

The words used here are defined in [Business rules: locations](business-rules.md#locations-operating-and-service).

## Addresses (the register)
Every address that has ever appeared on a run sheet, added automatically as sheets load. Nothing to type.
- **Filters**: by run, by status (not assigned / assigned but not validated / validated / no GPS yet), or search.
- **GPS** column: how many deliveries have been ticked there with a good GPS fix. Those positions are where the letterbox really is.
- **Assign**: tick addresses (or the box at the top to tick all shown), choose an **operating location** and optionally a **service location**, then **Assign**. Assigning resets validation, since the new assignment hasn't been checked.
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

Each can be limited to certain days (none ticked = every day) and switched off without deleting it. The **Policies** tab lists them all.

*Today policies are recorded and shown on the dashboard. Showing them on the drivers' run screens, and navigating stop to stop, is the next step ([roadmap](roadmap.md)).*

## Users
- **Access**: **App only** (runs, ticks, photos) or **App + Dispatch** (also this dashboard). Changes apply at their next screen.
- **Add a person**: name (it shows on tiles they tick), email, access, and a temporary password you give them in person. They can change it from the Runs page (**Change password**).
- **Set password**: give someone a new temporary password if they forget theirs.
- **Switch off**: stops their access at once (their login and session too). Their past ticks and photos stay. **Switch on** restores it.
- There must always be at least one active dispatcher; the database refuses to remove the last one.

Every change on the dashboard is logged (who, when, what) in `dispatch_history`.
