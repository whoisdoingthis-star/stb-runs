# 0016. Opening animation: once a day, silent unless switched on

- **Date:** 2026-11-10
- **Status:** Accepted; the once-a-day rule is superseded by [0018](0018-opening-every-open.md), the sound by [0017](0017-opening-notes-per-stop.md)

## Context
Mike asked for an opening moment when someone opens the app or signs in: the logo assembling itself, with a sound (10 Nov 2026). After trying sketches he chose a delivery-themed one over a logo-only one, because STB is heading towards general deliveries, and a soft "fairy chimes" sound over a single ding, which he found jarring.

## Decision
- **The animation** is the Route: a run line draws across the screen, three stops tick green, a pin drops at the end and becomes the STB logo (`js/splash.js`). It says what the app does and stays true for papers or parcels.
- **It never holds the app up.** It plays over the top while the app loads underneath, lasts about a second and a half, and a tap skips it. With "reduce motion" switched on in the phone, it doesn't play.
- **Once a day per phone** (first open of the day, New Zealand date) and after signing in. Not on every return to the app: a driver hopping in and out during a run would see it dozens of times.
- **Sound is off unless switched on** (Settings → Opening → Chimes, remembered per phone). Runs start around 5am, and an installed Android app is allowed to play sound the moment it opens. iPhones only allow sound after a touch, so on a cold open there the chimes may stay silent even when switched on; they play after Sign in and from **Play the opening**.
- The sound is made in the app (five quiet high notes), so there is no sound file to download or licence.

## Consequences
Someone who wants the chimes has to switch them on once on their own phone. The animation is drawn with fixed shapes and the app icon, so a new logo means updating `icons/` only; a new animation means editing `js/splash.js`.
