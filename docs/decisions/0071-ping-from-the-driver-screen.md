# 0071. Ping from the driver screen

- **Date:** 2026-11-28
- **Status:** Superseded by [0072](0072-wheres-everyone.md)
- **Stated by:** Mike, by voice, 28 Nov 2026

## Context
Mike's phone battery was running down quickly, and Life360 was near the top of the battery list. He'd like to put Life360 on battery-saving settings and use Stan to see where the family are during runs. Ping ([0026](0026-run-map-and-ping.md)) already did that, but only from Dispatch. Mike: "we should widen ping so it can sit on the driver screen as well."

## Decision
- In a run, **⋯ → Ping someone…** lists everyone else on duty today. Tapping a name pings them, exactly as Dispatch does: their phone answers once, only while they're on duty with Stan open, and they're told who asked.
- The driver screen has no map, so the answer is in words: when they were found and how far from you ("about 650 m from you"), with a button that opens the spot in Google Maps. No answer in 20 seconds says Stan isn't open on their phone and suggests a call.
- **You must be on duty to ping.** The database enforces it (`on_duty_now()`), and the ask is always in your own name, about someone else. Dispatchers can still ping as before.
- The asker can read the answers to their own pings; nobody else's.

Not chosen: a live "where's everyone" map with continuous sharing (more battery on every phone, and the family agreed to *ask when pinged* in 0026). A web app can't answer from a locked phone or a closed app, so Stan can't replace Life360 outside runs.

## Consequences
- Life360 can go on Optimised for battery, relying on Stan's Ping during runs. Outside runs, Life360 is still the way to find each other.
- Every ping, from Dispatch or a driver, is kept in `pings` with who asked.
