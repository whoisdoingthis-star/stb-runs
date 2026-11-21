# 0052. Stan walks the street along the top of a run

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike (21 Nov 2026) asked for animation in the app: Stan walking with a small newspaper satchel and throwing papers, staying in one place on the screen while the backdrop moves. Part of the plan he agreed the same day, alongside the sounds ([0051](0051-run-sounds-and-music.md)).

## Decision
1. **Where.** A thin strip (36 px) along the top of the run screen, just above the progress line. Stan stands at the left with his satchel; a little street of letterboxes, fences and trees is behind him.
2. **It only moves when a stop is ticked.** Each tick, the street slides on by that stop's share of the run, Stan takes a step, and a paper flies from his satchel. Between ticks nothing moves: no looping animation to pull the eye while driving, and nothing using the battery. When every stop is done he does a little bounce.
3. **For show only.** It can't be tapped, screen readers skip it, and nothing waits for it. With the phone's *reduce motion* setting on, the street still moves along but nothing slides, steps or flies.
4. **A switch.** **Settings → Walking Stan → Hide**. Hiding Stan altogether hides it too.
5. **Our own drawing.** Stan, the satchel, the paper and the street are drawn for this app (`js/stanwalk.js`), not based on any existing character or cartoon.

## Consequences
- The sticky header on a run is 36 px taller. If that costs too much room for Mum's big tiles, Hide gives it back.
- Whistling was left out: a looping tune would fight with the tick notes and with music. The tick notes already play in time with the papers.
- The top card on the Runs page keeps its plain progress bar for now.
- Checked by `test/e2e-sounds.py` and `test/sfx.mjs`.
