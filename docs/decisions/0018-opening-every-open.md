# 0018. Opening plays every time the app is opened, except on a run

- **Date:** 2026-11-10
- **Status:** Accepted

## Context
[0016](0016-opening-animation.md) played the opening once a day per phone. After using it, Mike asked for the full chimes any time someone reopens the app (10 Nov 2026).

## Decision
The opening (picture, and the chimes if switched on) plays every time the app is opened, every time it is brought back to the front after at least three seconds away, and after signing in. It does **not** play while a run is on screen, or when a link opens straight into a run: a driver coming back from Maps, WhatsApp or the camera mid-run must be able to tick straight away, and the opening would cover the tiles for a second and a half each time. This supersedes the once-a-day rule in 0016; the rest of 0016 stands (a tap skips it, silent unless switched on, never holds the app up).

The chimes were also damped twice the same day at Mike's request: a softer start, a shorter ring (about 0.4 s) and less brightness.

## Consequences
With Chimes on, the phone plays them on every return to the Runs page, including at 5am; that is the owner's choice per phone. Phones that only allow sound after a touch (iPhones) may stay silent on some returns. If the family finds it too much on the Runs page, the three-second gap is one number in `js/app.js`.
