# Decisions

One short record per decision. Never deleted; a reversed decision gets a new record that supersedes it.

| # | Decision | Date | Status |
|---|---|---|---|
| 0001 | [Static web app, no build step](0001-static-web-app.md) | 2026-11-06 | Accepted |
| 0002 | [Read the PDF by text position and check every total](0002-parse-by-position.md) | 2026-11-06 | Accepted |
| 0003 | [One tile per address](0003-one-tile-per-address.md) | 2026-11-07 | Accepted |
| 0004 | [GPS per tap is for sequencing, not proof of delivery](0004-gps-for-sequencing.md) | 2026-11-07 | Accepted |
| 0005 | [Supabase for data, login and live updates](0005-supabase.md) | 2026-11-07 | Accepted |
| 0006 | [Evening fetch on GitHub Actions](0006-evening-fetch-github-actions.md) | 2026-11-08 | Accepted |
| 0007 | [Get Runs button via an Edge Function](0007-get-runs-edge-function.md) | 2026-11-08 | Accepted |
| 0008 | [Delivery photos for disputed complaints](0008-delivery-photos.md) | 2026-11-08 | Accepted |
| 0009 | [Docs as code](0009-docs-as-code.md) | 2026-11-08 | Accepted |
| 0010 | [Public repository, no secrets in it](0010-public-repository.md) | 2026-11-08 | Accepted (revisit for STB) |
| 0011 | [Known security shortcuts during the PoC](0011-known-security-shortcuts.md) | 2026-11-08 | Accepted (temporary) |
| 0012 | [Locations: groups, operating locations, service locations](0012-dispatch-location-model.md) | 2026-11-08 | Accepted |
| 0013 | [Roles enforced by the database; temporary passwords instead of email invites](0013-roles-enforced-by-database.md) | 2026-11-08 | Accepted (revisit for STB) |
| 0014 | [Adopt parts of the STB governance baseline v0.5](0014-governance-baseline.md) | 2026-11-09 | Accepted |
| 0015 | [Closing a paper run adds paper ticks, it doesn't mark the run done](0015-closing-paper-runs.md) | 2026-11-09 | Accepted |
| 0016 | [Opening animation: once a day, silent unless switched on](0016-opening-animation.md) | 2026-11-10 | Accepted (partly superseded by 0017, 0018) |
| 0017 | [Opening: a soft note and a twinkle for each stop](0017-opening-notes-per-stop.md) | 2026-11-10 | Accepted |
| 0018 | [Opening plays every time the app is opened, except on a run](0018-opening-every-open.md) | 2026-11-10 | Accepted |
| 0019 | [Driver Assistant: our own voice guidance, routed by OpenRouteService](0019-driver-assistant.md) | 2026-11-12 | Accepted |
| 0020 | [On Duty, My runs and a shift timeline with no gaps](0020-on-duty-and-shifts.md) | 2026-11-12 | Accepted |
| 0021 | [Stan in the app: the face of help and good news, used sparingly](0021-stan.md) | 2026-11-12 | Accepted |
| 0022 | [Stan on empty screens and in Dispatch](0022-stan-empty-screens.md) | 2026-11-12 | Accepted |
| 0023 | [Stan's own voice, made on the phone](0023-stan-voice.md) | 2026-11-12 | Accepted |
| 0024 | [Chat with Stan: an ideas register the family fills by talking to him](0024-chat-with-stan.md) | 2026-11-12 | Accepted |
| 0025 | [People's icons: pick a robot or upload a photo](0025-avatars.md) | 2026-11-13 | Accepted |
| 0026 | [A run on the map in Dispatch, and Ping](0026-run-map-and-ping.md) | 2026-11-13 | Accepted |
| 0027 | [A delivery report for any dates, to send as a PDF](0027-delivery-report.md) | 2026-11-13 | Accepted |
| 0028 | [Morning watch, proof on demand and first-day photos: what a run owner needs to see](0028-morning-watch.md) | 2026-11-13 | Accepted |
| 0029 | [The delivery report keeps the complaint and our record apart](0029-clearer-delivery-report.md) | 2026-11-14 | Accepted (changes the layout in [0027](0027-delivery-report.md)) |
| 0030 | [A photo's own time can stand as the delivery record](0030-photo-time-is-proof.md) | 2026-11-14 | Accepted |
| 0031 | [A dispatcher can keep their own order too](0031-own-order-for-dispatchers.md) | 2026-11-14 | Accepted (extends the own-order rule of 11 Nov 2026) |
| 0032 | [Stan's new look](0032-stan-new-look.md) | 2026-11-14 | Superseded the same day by [0033](0033-brand.md) (rounder head, one drawing for icon, opening and logo). Replaced the drawing in [0021](0021-stan.md); what Stan does is unchanged) |
| 0033 | [Stan is the face of Send The Boy: icon, opening and logo](0033-brand.md) | 2026-11-14 | Accepted (replaces the drawing in [0032](0032-stan-new-look.md), the opening in [0016](0016-opening-animation.md) and the yellow "STB Together" badge) |
| 0034 | [Stan gets bored, and Stan's Paper Run](0034-stans-paper-run.md) | 2026-11-14 | Accepted |
| 0035 | [Insights: what the collected data says](0035-insights.md) | 2026-11-17 | Accepted (first part: the Dispatch page. Stan's "Did you know" cards for drivers follow.) |
| 0036 | [Stan's "Did you know…" cards for drivers](0036-stan-did-you-know.md) | 2026-11-17 | Accepted (the second part of [0035](0035-insights.md)) |
| 0037 | [An older tick asks before it's unticked](0037-ask-before-unticking.md) | 2026-11-18 | Accepted |
| 0038 | [Off duty automatically once all the day's runs are finished](0038-auto-off-duty.md) | 2026-11-18 | Accepted (adds to On Duty, [0020](0020-on-duty-and-shifts.md)) |
| 0039 | [The learned letterbox: only where real ticks agree](0039-learned-letterbox.md) | 2026-11-19 | Accepted (tightens the learned position used since [0019](0019-driver-assistant.md)) |
| 0040 | [Stan's day plan, and drivers and helpers](0040-day-plan.md) | 2026-11-19 | Accepted (stage 1). Stage 2, mixing parts of runs together, is not built. |
| 0041 | [The crew check when going on duty, and the notice board](0041-crew-check-and-notice-board.md) | 2026-11-19 | Accepted. Changes the "Who's with you?" step of [0040](0040-day-plan.md), released the same evening. |
| 0042 | [Spare papers, pinned rules, and the morning on the notice board](0042-spares-and-pinned-rules.md) | 2026-11-20 | Accepted |
| 0043 | [Stan's recorded voice](0043-stan-recorded-voice.md) | 2026-11-21 | Accepted for recording. Playing the lines on the phones is the next step and not done yet. |
| 0044 | [Your morning: Stan's end-of-shift summary](0044-end-of-shift-summary.md) | 2026-11-21 | Accepted |
| 0045 | [Kilometres: from the ticks, and from the odometer](0045-kilometres.md) | 2026-11-21 | Accepted |
| 0046 | [The route as delivered, traced on the map](0046-route-as-delivered.md) | 2026-11-21 | Accepted (steps 1 and 2). Step 3, pricing a different order, is not built. |
| 0047 | [Stan talks: his recorded voice in the app](0047-stan-talks.md) | 2026-11-21 | Accepted |
| 0048 | [Dispatch on a phone: sections along the bottom, pages as pills, tables as cards](0048-dispatch-on-a-phone.md) | 2026-11-21 | Accepted |
| 0049 | [The Runs page follows the morning](0049-runs-page-follows-the-morning.md) | 2026-11-21 | Accepted |
| 0050 | [On the run, Stan's plan line steps aside once the top card says ahead or behind](0050-plan-line-steps-aside.md) | 2026-11-21 | Accepted |
| 0051 | [Sounds on a run, a nudge at stops that aren't routine, and Stan over the phone's music](0051-run-sounds-and-music.md) | 2026-11-21 | Accepted |
| 0052 | [Stan walks the street along the top of a run](0052-walking-stan.md) | 2026-11-21 | Accepted |
| 0053 | [Clean mornings in a row, with one let-off a week, and the family's week](0053-clean-mornings.md) | 2026-11-21 | Accepted |
| 0054 | [Everyone's moves make their own order; the usual order changes only on purpose](0054-own-order-for-everyone.md) | 2026-11-21 | Accepted |
| 0055 | [Stan checks a run's addresses before it's driven](0055-stans-address-check.md) | 2026-11-21 | Accepted |
| 0056 | [The opening: Stan runs in with his satchel and jumps, "Stan-tastic!"](0056-opening-run-and-jump.md) | 2026-11-21 | Accepted |
| 0057 | [Duty hard lines: odometer before the first stop, the last delivery ends the shift, and no walking off a run](0057-duty-hard-lines.md) | 2026-11-22 | Accepted |
| 0058 | [Hardening the data: location on before a run, spares actually counted, damaged papers kept apart](0058-location-and-counted-spares.md) | 2026-11-22 | Accepted |
| 0059 | [What's new: Stan walks each person through changes, with why](0059-whats-new.md) | 2026-11-22 | Accepted |
| 0060 | [What's new goes back to the first live trial, and Stan reads it aloud](0060-whats-new-read-aloud.md) | 2026-11-22 | Accepted |
| 0061 | [Stan records his own new lines when a change is published](0061-stan-records-himself.md) | 2026-11-22 | Accepted |
| 0062 | [The design principles, said out loud](0062-design-principles.md) | 2026-11-22 | Accepted |
| 0063 | [Fix it twice: a miss changes the standard](0063-lessons-loop.md) | 2026-11-22 | Accepted |
| 0064 | [How Stan will optimise: time, learned from ticks, proven before used](0064-optimisation-approach.md) | 2026-11-23 | Accepted |
| 0065 | [Voice builds: asked for on a call, built by one Claude, reviewed by another](0065-voice-builds.md) | 2026-11-23 | Accepted |
| 0066 | [Stan's time model and report card: built, and it does not pass the gate](0066-predictor-report-card.md) | 2026-11-23 | Accepted |
| 0067 | [The gate tests the driving, and the driving doesn't pass either](0067-gate-on-the-driving.md) | 2026-11-23 | Accepted |
| 0068 | [An address that comes back lands in its usual place, and one letterbox keyed two ways can be one tile](0068-returning-addresses-and-one-letterbox.md) | 2026-11-23 | Accepted |
| 0069 | [Time between stops: the same legs, two drivers, side by side](0069-time-between-stops.md) | 2026-11-23 | Accepted |
| 0070 | [Voice-to-Laptop Bridge: any Claude session can see the laptop and hand it work](0070-laptop-bridge.md) | 2026-11-26 | Accepted |
| 0071 | [Ping from the driver screen](0071-ping-from-the-driver-screen.md) | 2026-11-28 | Accepted |
| 0065 | [Stan's School and Sandbox Stan: training that can't go out of date](0065-stans-school.md) | 2026-11-23 | Accepted |

Records are append-only: CI refuses a change to an existing record other than its Status line. To reverse a decision, write a new one that supersedes it.

New decision: copy the latest file, take the next number, add it to this table.
