# 0034. Stan gets bored, and Stan's Paper Run

- **Date:** 2026-11-14
- **Status:** Accepted

## Context
Mike (14 Nov 2026): when there's nothing on the run and you stay on the screen, Stan could get bored, and there could be a little game with Stan as the hero, in the spirit of 1980s side-scrolling platform games. He said yes to a family high-score board, and asked that Stan gets bored after 5 seconds.

## Decision
- **Bored after 5 seconds.** On the Runs page, with **no runs to do** and **off duty**, Stan yawns, sways, and asks "Fancy a game while we wait?" with a **Play Stan's Paper Run** button. Nothing starts by itself.
- **Never on duty.** No boredom and no game while anyone is on duty, so it can't tempt a driver mid-run. Switching Stan off in Settings switches this off too.
- **The game** (`js/stangame.js`) is our own: Stan runs down a street at dawn. **Throw** a paper into every letterbox (a miss is a complaint), **jump** dogs and locked gates, don't throw while a sprinkler is on (wet paper), and grab batteries before the phone dies. Three complaints or a flat phone ends the run. A street is eight letterboxes; finishing one says "Stan-tastic!", clears one complaint and speeds things up. Streaks multiply the points, up to five times.
- Two big buttons (Jump, Throw), or tap the left and right of the picture, or the keyboard. It pauses if you leave the app.
- **Family high scores:** each finished game is saved (`game_scores`) under your own name; the board shows each person's best. Offline, your score is kept on the phone and the board shows only yours.
- The rules are a pure function (`step`), tested in `test/stangame.mjs`, with a repeatable random seed so a game can be replayed exactly. `test/e2e-game.py` checks it in a browser.
- Sounds use the app's own soft notes and only play if the opening's sound is switched on.
- Nothing in the game touches runs, ticks, shifts or reports.

## Consequences
All characters, streets and artwork are our own; the game borrows only the general feel of the era, not any other game's characters, levels, art or music. The game moves quickly, so with "reduce motion" on it says so before starting rather than starting silently. A first version: one endless street type; levels and more hazards can follow if the family plays it.
