# 0017. Opening: a soft note and a twinkle for each stop

- **Date:** 2026-11-10
- **Status:** Accepted

## Context
After seeing the opening on his phone, Mike asked for a ding as each pin appears and a light fairy-light twinkle at each one (10 Nov 2026). [0016](0016-opening-animation.md) had one run of five notes when the logo arrived.

## Decision
The sound follows the picture: one soft bell note as each of the three stops ticks, rising (C, E, G), and the C above as the pin lands. Nothing extra plays when the logo appears. Each stop and the pin also gets a small star twinkle, with or without sound. This replaces the five-note run in 0016; everything else in 0016 stands (once a day, a tap skips it, silent unless switched on in Settings).

## Consequences
If a phone is slow to allow sound, notes that would arrive after their stop are left out rather than played late. The timings live in one place (`STOPS_AT`, `PIN_AT` in `js/splash.js`) so picture and sound can't drift apart.
