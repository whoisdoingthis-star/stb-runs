# 0026. A run on the map in Dispatch, and Ping

- **Date:** 2026-11-13
- **Status:** Accepted

## Context
Mike, through Chat with Stan (13 Nov 2026): on the dispatch screen each run should show a map with a pin for every delivery address, blue until done and green once completed; a trail linking the delivery path, blue for not yet travelled and green for travelled; and a **Ping** button to get the on-duty driver's current GPS position.

## Decision
- **Runs & sheets → Map** opens the run on a map (Leaflet and OpenStreetMap, already used for Locations). One pin per address at its known position (`address_destinations`): hollow blue = to do, solid green = done, red = couldn't deliver. Shape as well as colour, so it reads without colour.
- **The trail** joins the stops in delivery order (the route's saved order, else the sheet's). A piece turns green once the stop it leads to has been dealt with; the rest is dashed blue. It is straight lines between stops, not the roads driven.
- The map refreshes every 20 seconds while it's open. Addresses with no position yet are counted and named, never dropped silently.
- **Ping asks, once.** Mike chose *ask when pinged* over phones sharing their position all the time. Dispatch adds a row to `pings`; the driver's phone hears it only while STB is open, answers only **while on duty**, and always tells the driver ("Mike checked where you are"). Off duty, nothing is shared and both sides are told. No answer in 20 seconds means the app isn't open: Dispatch then shows that person's last tick instead.
- Only dispatchers can ping; only the pinged person's phone can answer; every ping is kept.

Not chosen: continuous sharing while on duty (more battery, and being watched all morning is a bigger ask of the family); a web app can't answer from a locked phone, so "always answers" isn't possible anyway.

## Consequences
The phone answers with a position only if location is already allowed for STB. Map tiles come from OpenStreetMap's public server, fine for one dispatcher.
