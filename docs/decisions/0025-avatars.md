# 0025. People's icons: pick a robot or upload a photo

- **Date:** 2026-11-13
- **Status:** Accepted

## Context
Mike, through Chat with Stan (13 Nov 2026, the first idea in the ideas book): "It would be cool to have user icons / avatars that we can select, or upload." In Dispatch, names alone make it slow to see who did what.

## Decision
- **Each person chooses their own icon** in ⚙ Settings → My icon: one of twelve ready-made robots (Stan's cousins, original drawings in different colours) or a photo. Until they choose, it's their initials on a colour.
- **A photo is shrunk on the phone** to a 96×96 square (about 5 KB) and saved in the `avatars` table itself, so there's nothing extra to download and no storage links to manage. The database only accepts that kind of small image.
- **Only you can change yours** (not even a dispatcher can). Everyone on the family list can see them; nobody else.
- **Where they show:** beside your name on the Runs page, in Settings, on your messages in Chat with Stan; in Dispatch on each person's Shifts bar and in the ideas book.
- Icons are decoration: the name is always written next to them.

## Consequences
Icons are matched to people by name, like ticks are. Photos of the family live in the database, never in the repository.
