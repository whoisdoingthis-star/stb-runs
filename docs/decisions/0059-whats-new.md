# 0059. What's new: Stan walks each person through changes, with why

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
Changes have been going out several times a day, and the family finds out by bumping into them. On the weekend of 21–22 Nov 2026 Lisa ticked off Run 8 herself, although another driver, Gagan, delivers it on Saturdays and Sundays; Mike had been closing it from the dispatch board with Gagan's name, and Lisa didn't know that existed. Mike (22 Nov 2026), inspired by the kids' work on Ollie: "I propose that every change we incorporate, we generate an end of day walk through or summary that drivers will see when they next open Stan, so that all changes, functionality and rules are shown to them, as well as a quick understanding of why."

## Decision
1. **Every change that alters what anyone sees, does or must follow gets a card**, written in the same commit, at the top of `js/whatsnew.js`: who it is for (drivers, helpers, dispatch, or everyone), a short title, what changed in plain words, and one line of **why**. This is now rule 8 in CONTRIBUTING.md and in the notes for AI assistants. Things nobody would notice don't get one.
2. **Stan shows them when the app is next opened.** On the Runs page, after the day's plan and before the notice board: "What's new since last time", one card at a time, oldest first so the day reads in order, with **Next**, **Back** and **Got it**. A day's changes arrive together, which is the end-of-day walk-through Mike asked for.
3. **Only what's yours.** A helper isn't shown drivers' rules; a dispatcher who drives sees both.
4. **Never in the way of work.** It doesn't pop up while on duty; it waits for the next time off duty. It can be closed at any card: the ones reached are marked seen, the rest come back next time.
5. **Two weeks, twelve cards.** Older cards don't pop up, so a new phone or a new person isn't walked through history. Everything recent can be read again from **⚙ Settings → What's new**.
6. **Seen is remembered per person**, not per phone (`update_seen`), and the People page on the dispatch board shows **✓ Up to date** or **3 to read** for each person, so a rule isn't assumed to be known.
7. A card's `id` never changes once it has gone out.

The first set covers 21 and 22 Nov, including one that isn't a change at all but the thing that prompted this: *don't tick a run you didn't deliver; it is closed from the dispatch board*.

## Consequences
- Writing the card is part of the change, like the changelog line. The changelog stays the full record; the cards are the short version for the people doing the runs.
- Reading a card isn't the same as agreeing with or remembering it: the dispatch column says who has seen a rule, not who follows it.
- In demo mode it doesn't pop up by itself (there is no family to tell); it is still in Settings.
- Not done: Stan reading the cards aloud (each would need recording), and pictures on the cards.
- Checked by `test/whatsnew.mjs` and `test/e2e-whatsnew.py`.
