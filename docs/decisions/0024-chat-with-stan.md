# 0024. Chat with Stan: an ideas register the family fills by talking to him

- **Date:** 2026-11-12
- **Status:** Accepted

## Context
Mike (12 Nov 2026): the family should be able to tell Stan about improvements and tweaks; he should answer in his own voice, witty but adorable; and behind the scenes we keep a register to review and work through. Ideas come up on the run and get forgotten by the time anyone is at a laptop.

## Decision
- **Chat with Stan** opens from the Runs page (**Got an idea? Tell Stan**) and from a run's ⋯ menu. Type a few words, **Send**.
- **Each message is saved** in the `ideas` table (who, when, which screen, app version), on the phone first and sent when there's signal, like ticks.
- **Stan answers** with a short line, out loud in his own voice (the phone's if his isn't loaded). The lines are his own, chosen by what the message is about (voice, directions, something broken, looks, the runs, a thank-you). He is not an AI chat: he doesn't pretend to understand more than that, and **never promises** an idea will be built. He says it's written down and that Mike reads them all.
- **Dispatch → Overview → Stan's ideas book** is the register: each idea with a status (New, Planned, Done, Not now) and a note on what was decided. Only dispatchers change those.

Not chosen: a real AI conversation (cost, needs signal, and replies we can't check before the family hears them); free-form voice notes (typing with the phone's own dictation does the job).

## Consequences
Ideas may mention customers or addresses: they live in the database, never in the repository. Everyone on the family list can read the register.
