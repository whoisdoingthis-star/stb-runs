# 0019. Driver Assistant: our own voice guidance, routed by OpenRouteService through a server function

- **Date:** 2026-11-12
- **Status:** Accepted

## Context
Mike (12 Nov 2026): rather than popping up Google Maps, give the driver simple arrows, text and spoken directions to the next stop, alongside the next address, "particularly if it's a new run for them". Someone covering a run needs to know which street is next and where to turn, plus the notes on the sheet; regulars mostly don't.

## Decision
- **Our own guidance in the run screen** (`js/assistant.js`): a panel above the bottom bar and spoken prompts. Voice first, nothing to touch while moving; it never ticks.
- **Turn-by-turn from OpenRouteService** (free Standard plan, 2,000 directions a day; about 100 legs a run, five runs a day fits easily), asked for one leg at a time, from where the driver is to the next stop, and again if they leave the route.
- **Through a Supabase server function `route`**, which checks the caller is on the family list and only routes inside New Zealand, so the ORS key stays out of the public repository.
- **Falls back to an arrow and the distance** (bearing from the direction of travel) when routing isn't set up, fails or is offline. The rest (arrival, side of the road, notes, voice) works either way.
- **Positions:** the Dispatch stop, else the learned letterbox (`address_destinations`), else looked up once through the same function and remembered on the phone.
- **Turns on by itself** on a run that is new to that person on that phone (fewer than 10 of their ticks), once; after that it remembers whether they left it on.
- Google Maps stays one tap away inside the panel.

Not chosen: the FOSSGIS community routing server (run by volunteers for OpenStreetMap itself, asks apps not to hard-code it); Google or Mapbox directions (paid, and more than this needs); working out every leg when the sheet loads (needs a database column and a server job; may come later).

## Consequences
Until Mike adds the ORS key and deploys `route` ([setup](../setup.md#7-driver-assistant-routing)), the Assistant points at the stop instead of giving turns. Each request sends the phone's position and the stop's to OpenRouteService (HeiGIT, Germany). Spoken prompts use the phone's own voices; on iPhone a tap is needed before the first one.
