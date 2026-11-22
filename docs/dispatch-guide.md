# Dispatch guide

The dispatch dashboard is where routes are planned: the register of every address we deliver to, the places the vehicle stops, where the work is done on foot, and the rules that apply there. It is for people with **App + Dispatch** access, and is its own site: **whoisdoingthis-star.github.io/stb-runs/dispatch/**. On a laptop a dispatcher lands there when opening the app; on a phone, use **Dispatch dashboard ›** on the Runs page or ⚙ Settings. **‹ Driver app** (bottom of the sidebar) goes back.

## Finding your way around
The pages are in four sections:

| Section | Pages |
|---|---|
| **Today** | Overview, Day plan, Runs & sheets |
| **Proof** | Complaints (with Find a delivery and the Delivery report) |
| **Insights** | Insights |
| **Set-up** | People, Addresses, Locations, Policies, Stan's voice, Change log |

**On a laptop** they are listed down the left side under those headings.

**On a phone** the four sections are buttons along the bottom of the screen. Tap one and its pages show as a row of buttons at the top (Overview is called **Now** there, to save room). A section opens on the page you last used in it. The little numbers on **Proof** and **Set-up** are open complaints and addresses not yet tied to a location. Tables show as cards, one per row, so you only ever scroll up and down. Pop-ups open from the bottom, and the **✕** to close them stays at the top.

## Stan records himself
You don't need to record Stan's lines any more. When a change that adds or rewords a line is published, a job on GitHub records it in his voice within a few minutes ([decision 0061](decisions/0061-stan-records-himself.md)). On **Set-up → Stan's voice** those show as recorded by **Stan (auto)**. If a line stays missing there, press the **Record…** button as before; if that fails too, the ElevenLabs key has probably reached its limit (raise it in ElevenLabs → Developers → API keys).

Every *What's new* card has a spoken version. They show on **Set-up → Stan's voice** under **What's new, read aloud**, and are recorded with the same **Record the … that are missing** button as his other lines. A card that hasn't been recorded is silent on the phones (the words still show).

**Set-up → People** has a **What's new** column: **✓ Up to date**, or how many of Stan's change cards that person still has to read. The cards themselves are written with each change (see [decision 0059](decisions/0059-whats-new.md)).

## Overview (the landing page)

On a laptop the Overview has two columns: the day's work on the left (**Sheets**, **Progress**, **Items to collect**, **Delivery score**) and what needs a look on the right (**Needs attention**, **Complaints on this sheet**, **Recent photos**). On a narrow screen the right-hand column comes first.
- **Sheets** for today (or the next delivery day loaded): each run's stops, items, whether the totals match RouteSmart, when it was updated and from where, and how many details changed. **Get Runs from RouteSmart** and **Upload a sheet** are here.
- **Needs attention**: totals that don't match, changes since the previous sheet, complaints, addresses not tied to a location, new addresses on this sheet, service locations not yet validated. Most lines link straight to the fix.
- **Status** (last column of Sheets, and on Runs & sheets): open (with stops done), **✓ Completed (app)** with who ticked it and the last tick when every stop was dealt with in the app (**Set driver…** records who did it), or **✓ Closed (paper/app)** with the driver and finish time. **Close run…** asks who did it, when it finished and how: *on the paper sheet* ticks every stop not ticked in the app in the driver's name; *in the app* closes it as it is. **Reopen…** unticks only the paper ticks. See [business rules](business-rules.md#closing-a-run).
- **Needs attention** also lists every **couldn't deliver** (address, reason, who) and any **policies that disagree**.
- **Progress**: each run's ticks so far and the last tick (live on delivery mornings).
- **Delivery score (DIFOTIS)** per run: delivered, in full (not short), on time (inside the address's time policies, or on the day), in spec (no wet, damaged or wrong-paper complaint for that day), and couldn't deliver. See [business rules](business-rules.md#delivery-outcomes).
- **Items to collect** and **Recent photos**.

### Stan
Stan shows up when there's nothing to do ("✓ Nothing waiting", "Nothing active"), and the **Stan's tip** card on the Overview has one tip a day with a link to this guide. He's never on the figures. Hide him in the app's **⚙ Settings → Stan** (same browser).

### Morning watch (Overview)
The first card on the Overview. Each run of the day shows where it stands against the deadline (6 am Monday to Friday, 7 am weekends and public holidays):
- ○ **Not started**, with the time it needs to start by.
- ⚠ **Not started: will be late**, or **Running late**, with the minutes and the finish time. That's when to ring the driver or warn the run owner.
- ▶ **On track**, with the finish time.
- ✓ **Done on time**, or **Done, 12 min late**.

It refreshes itself every minute while a run is under way. A run done on paper shows *Not started* until you close it. **Copy the morning summary** puts a few plain lines on the clipboard to paste into a message. **Deadlines…** changes the times and the public-holiday list (check it each year).

### Find a delivery
**Find a delivery…** (Overview and Complaints): type part of an address and pick it. You see every day it was delivered: who, the time, GPS with a map link, any complaint, and photos.

### Delivery report (PDF)
**Insights** (second in the menu): what the data we've collected is telling us. It opens on the last four weeks; change the dates and tap **Update**. Across the top are three headline numbers: **DIFOT** (stops delivered in full by the 6 am or 7 am deadline, as a percentage and a count; paper-sheet stops have no times so they sit beside it), **Complaints** (as a share of deliveries) and **Runs finished on time**. Under those is a tile for each run: its **average completion time** (first tick to last), then time per delivery, stops, when it usually starts and finishes, how many mornings it was on time, its own DIFOT, its quickest and slowest morning, and its complaints. Each card below says what was found, gives a **suggestion**, and says what it's based on. Red cards (**Do something**) come first: a run that keeps finishing after its deadline, a phone that isn't recording GPS, an address that has complained twice. Orange (**Keep an eye on**) covers things like stops ticked away from the letterbox or a street the run keeps coming back to. Green is what's working. **Copy as text** gives you a version to paste into a message. While there are fewer than 14 delivery days it says the findings are early. The tables by person are only on this page; drivers don't see each other's numbers. ([decision 0035](decisions/0035-insights.md))

**Complaints → Delivery report (PDF)…**: pick the From and To dates and tap **Make the report**. Page 1 is a summary with one row per complaint. Then each complaint has two parts: **Complaint received** (what the publisher reported, in grey, marked "not verified") and **Our delivery record** for that morning (the time in large print, who, how it was recorded, GPS and photos, with a green **Delivered** badge when we have it). Later deliveries at the same address are listed under **Deliveries since**. Other photographed deliveries are in an appendix at the back. Your Dispatch note prints as **Our response**: read each one, and tap **Leave this note out** for any that are only for us. Then tap **Save as PDF / Print**, choose *Save as PDF* and paper size A4. The file names itself, e.g. `Zalense-Delivery-Report_HOWICK_2026-11-08_to_2026-11-14`. If the sheet gave no date for a complaint, the report reads it from the publisher's reference and says so. ([decision 0029](decisions/0029-clearer-delivery-report.md))

### A run on the map, and Ping
**Runs & sheets → Map** shows the run's stops as pins: hollow blue = to do, solid green = done, red = couldn't deliver. The line joins them in delivery order and turns green as it's travelled (straight lines between stops, not the actual roads). It updates every 20 seconds; hover a pin for the address and who ticked it.

**Ping Lisa** (under the map) asks her phone where it is. It answers within a few seconds if STB is open on her phone and she's on duty, and she's told you checked. If there's no answer, you see her last tick instead. Off duty, nothing is shared.

### People's icons
Each person's icon (chosen on their phone, ⚙ Settings → My icon) shows on their Shifts bar and beside their ideas. No icon chosen yet = their initials.

### Stan's ideas book (Overview)
Everything the family tells Stan (Chat with Stan on the phones): who, when, from which screen. Set each one to **New**, **Planned**, **Done** or **Not now**, and add a note on what was decided. Dealt-with ideas fold away under *Done or not now*.

### Shifts and the depot (Overview)
- **Shifts**: one bar per person for the day: depot (grey), driving to a run (striped), own runs (green), helping (purple), between runs (orange), stopped (pale yellow), after the last stop. Hover a piece for its times. Under it: the totals, and each run's time including getting there.
- People who didn't tap On duty show from first to last tick; a shift with no Off duty says so.
- **Depot**: *Set the depot…* takes a long Google Maps link (open a short goo.gl link first, then copy the address bar) or **Use my location** while standing there. Phones use it to say "You're at the depot".

### The route as delivered (on a run's map)
Open a run's **Map**. If the run has been measured, an **orange line** shows the road the map says was driven between the ticks, in the order they were made, and the line above the map gives the kilometres. **Red** marks road that was driven more than once, with how far that was: the first place to look when thinking about a better order (a cul-de-sac will always show red). Hover a stop to see when it was delivered (3rd, 14th…). Untick **Show the route as delivered** to go back to the planned-order trail. If there's no orange line yet, press **Trace the route as delivered**. It is the map's likely route, not a recording.

### Kilometres per run (on Insights)
Under the headline numbers. For the dates chosen it shows each run's kilometres: the middle morning, and the shortest and longest. A **~** means a rough figure. Press **Work out … along the roads** to have the map measure the runs that haven't been done yet; it takes several minutes for a month, so leave the page open. Watch the middle morning when the order of a run is changed: if the new order really is shorter, it comes down.

## Stan's report card
**Insights → Stan's report card** shows whether Stan is good enough at predicting how long a morning takes to be trusted with suggesting a quicker order. Each run-morning in the dates you chose is predicted from the *other* days and compared with what it took. **Typical miss on the driving** is the headline (the target is 5%): the test is on the drives between stops, the only part an order can change ([decision 0067](decisions/0067-gate-on-the-driving.md)), with the whole morning underneath for comparison; the table gives a line per run, and **Every morning tested** shows each one. Until it says *Good enough*, Stan suggests no change of order ([decision 0066](decisions/0066-predictor-report-card.md)).

## Day plan
For when you know who is working tomorrow (or today).
1. Pick the **delivery day**. Its run sheets need to be loaded (they arrive from RouteSmart after 7pm).
2. Tick each **driver** who is working, and tick the **helper(s)** riding with them.
3. Press **Work out the plan**. For each driver you get: when to be at the depot, when the first paper should go out, each run with its times, and when they're all done (10 minutes before the deadline). Underneath is what Stan assumed.
4. Add a note if you like, then **Send to the phones**. Everyone in the plan sees it from Stan the next time they open the app. **Copy as a message** gives the same plan as text for a group chat.

Change who's working and send again, and the new plan replaces the old one and pops up again. A card goes **red** if it is already too late to make the deadline, and says by how much.

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

**Helpers without a login:** names a driver typed under "Other…" when going on duty (Serene, Seira). Remove one here if it was a typo.

**Driver or Helper** (the *On the run* column): drivers take runs; helpers ride with a driver. Stan's day plan and the "Who's with you?" question use it. It doesn't change what anyone can see or do in the app.

**Training** (Stan's School, [decision 0065](decisions/0065-stans-school.md)): each person's finished courses and practice tasks. **Needs training** (drivers only) means they can go on duty as a helper but not as a driver until the New driver course and its four practice tasks in Sandbox Stan are done; the column says how many are left. New people start with it ticked; everyone who was already on the list started with it off. Untick it for someone who already knows the job. The **What's new** column says who hasn't read the latest cards; each evening Stan also emails people the cards they haven't read (once email is set up: see the [runbook](runbook.md#stans-end-of-day-email)).

## Stan's voice
Everything Stan says out loud in his recorded voice, grouped by when he says it.
- **▶** plays a line as the phones will hear it, with his light robot finish. **plain** plays the recording with nothing added.
- **Record the ones that are missing** records every new line, one after another. **Record again** re-does one that came out wrong. Each recording uses a few credits from the voice service.
- "Words changed" means the line was reworded after it was recorded, so it needs recording again.
- If it says the voice key isn't set, the key needs adding in Supabase (Edge Functions → Secrets, `ELEVENLABS_API_KEY`). Never put the key in a message or in the code.

