# 0012. Locations: groups, operating locations, service locations

- **Date:** 2026-11-08
- **Status:** Accepted

## Context
Navigating letterbox to letterbox is useless on a paper run, and Run 8's layout (buildings, mailbox banks) is hard-coded. Mike wants a register of every address, tied to where the vehicle stops and where the work is done, with rules such as entry points and delivery windows.

## Decision
Four levels: location group (nestable) → operating location (vehicle stop, GPS, stop number) → service location (letterbox, bank, reception…, GPS, validated) → address (the register, keyed like the tiles). Policies attach to exactly one level and are inherited downwards. The register is filled by a database trigger whenever run lines are written, so every way of loading a sheet feeds it. Maps use OpenStreetMap through Leaflet (free, no key).

## Consequences
Assignments survive every new sheet. Run 8 can later move from code to data, and navigation can go stop to stop. Drivers' screens don't use it yet ([roadmap](../roadmap.md)).
