# 0032. Stan's new look

- **Date:** 2026-11-14
- **Status:** Superseded the same day by [0033](0033-brand.md) (rounder head, one drawing for icon, opening and logo). Replaced the drawing in [0021](0021-stan.md); what Stan does is unchanged)

## Context
Mike (14 Nov 2026) proposed a redesign and supplied the reference himself, a design he had made for Stan: a glossy yellow head that is most of his body, a dark screen for a face with glowing cyan eyes, his name signed on the front, a dark collar, short floating limbs with cyan tips, and the map-pin antenna with spark lines. Mike confirmed the design is ours to use.

## Decision
- Stan is redrawn to that design in `js/stan.js`, as a drawing the app can animate (blink, bob, wave with a wink, talk), not a picture file, so he stays sharp at every size and costs nothing to load.
- Same places, same sizes, same behaviour: the Assistant button (head only, without the name), toasts, Chat with Stan, empty screens, Dispatch tips. Settings → Stan still turns him off and "reduce motion" still keeps him still.
- His "voice lights" (blue = turn by turn, amber = pointing at the stop, grey = no GPS) are now small bars on his screen, shown only while he's guiding or talking.
- He wears his name rather than the STB badge.
- **"Stan-tastic!"** is his word for a finished run (Mike, 14 Nov 2026), alongside his "G'day".
- His personality stays his own: earnest, helpful, pleased when a run goes right, in his own words.

## Consequences
The three videos made on 12 to 14 Nov show the earlier Stan until they are re-filmed. `test/stan-look.html` shows every pose and size on dark and light, for checking by eye.
