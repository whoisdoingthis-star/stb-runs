# 0056. The opening: Stan runs in with his satchel and jumps, "Stan-tastic!"

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
The opening since [0033](0033-brand.md) had Stan pop up, wink, spin and cheer, with a soft note per beat ([0016](0016-opening-animation.md)); it plays each time the app is opened ([0018](0018-opening-every-open.md)). Mike (21 Nov 2026): "can we create a new animation at login screen. Stan runs into screen, satchel in hand, little footsteps can be the tones, then he jumps up pumping his fist into the air saying stantastic."

## Decision
1. **What plays.** Stan, whole body, runs in from the left with his newspaper satchel in his hand: four steps, his legs and free arm swinging. He stops in the middle, jumps, and pumps his fist in the air with happy eyes and a burst of sparks, and **Stan-tastic!** appears under him. About two and a quarter seconds; a tap skips it. It replaces the pop-wink-spin opening.
2. **The footsteps are the tones.** Each step is a short soft note, each a step higher than the last (C, D, E, G), then three quick notes up as he jumps. They follow **Settings → Opening → Chimes / Silent**, as before.
3. **He says it.** As he jumps, his own recorded "Stan-tastic!" plays, if **Stan talks** is on. Phones only allow sound after a touch, so when the app is opened cold it is usually silent and the word on the screen stands in; after signing in, or from **Settings → Play the opening**, he is heard.
4. **When it plays** is unchanged: every time the app is opened or brought back, and after signing in; never while a run is on screen. With the phone's *reduce motion* setting on, nothing moves and one soft note plays.
5. **Our own drawing**: the same Stan, with the satchel from the run screen ([0052](0052-walking-stan.md)).

## Consequences
- It is about half a second longer than the old opening. It still never holds the app up: the app loads underneath.
- Stan's arms are short, so the fist pump lifts and stretches his arm for the jump. If it looks odd on a real phone, that is the first thing to redraw.
- Checked by `test/sfx.mjs` (the beats) and by eye from frames of the animation; the browser tests all wait for it to finish.
