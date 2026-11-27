# 0072. Where's everyone? Ping from the driver screen

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, by voice, 28 Nov 2026
- **Supersedes:** [0071](0071-ping-from-the-driver-screen.md) (one person at a time, from the ⋯ menu), the same morning

## Context
Mike's phone battery was running down quickly, and Life360 was near the top of the battery list. He'd like to put Life360 on battery-saving settings and use Stan to see where the family are during runs. Ping ([0026](0026-run-map-and-ping.md)) already did that, but only from Dispatch, one person at a time.

Mike: "From the driver screen, just a little button that can ping. You hit that button and it should come back with a message showing where everybody who has Stan open is, and a bit of context around it, relating to the deliveries they've just done. Combined: for example, Zaph is assisting me and Lenny's assisting Lisa, it combines both of their GPS coordinates, and uses their taps to get a history of where they've just been, where they are now with the ping GPS, and where it's likely they're heading to next. So we can understand where they are in case we need their assistance, and then we can coordinate."

## Decision
- A **📍 button** in the run's top bar (and **⋯ → Where's everyone?**) shows while you're on duty. One tap pings **everyone else on duty** at once, and waits up to 20 seconds for answers.
- The answer is **one card per crew**: a driver and their helpers are combined (who's with whom comes from going on duty, [0041](0041-crew-check-and-notice-board.md) rules: the driver's answer is the boss). Your own crew is left out.
- Each card says:
  - **Now:** the crew's most exact phone answer, when it was found and how far from you, with a **Show on Google Maps** button;
  - **Just done:** the crew's last three ticks today (from any of them), with times;
  - **Heading to:** on the run they last ticked, the first stop still to do after their last tick, in the run's order, and how many are left.
- If nobody in a crew answers, the card says Stan isn't open on their phone and suggests a call; the ticks still show where they've been.
- **Same rules as Dispatch's Ping:** each phone answers once, only while on duty with Stan open, and each person is told who asked. **You must be on duty to ping**: the database enforces it (`on_duty_now()`), and the ask is always in your own name, about someone else. Dispatchers can still ping as before. The asker can read the answers to their own pings; nobody else's.

Not chosen: continuous sharing (more battery on every phone, and the family agreed to *ask when pinged* in 0026). A web app can't answer from a locked phone or a closed app, so Stan can't replace Life360 outside runs. "Heading to" is the next stop in their order, not a prediction from the road: honest and simple until Stan can predict better.

## Consequences
- Life360 can go on Optimised for battery, relying on Stan during runs. Outside runs, Life360 is still the way to find each other.
- Every ping is kept in `pings` with who asked. One tap makes one row per person on duty.
