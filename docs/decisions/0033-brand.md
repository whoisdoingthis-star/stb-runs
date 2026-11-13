# 0033. Stan is the face of Send The Boy: icon, opening and logo

- **Date:** 2026-11-14
- **Status:** Accepted (replaces the drawing in [0032](0032-stan-new-look.md), the opening in [0016](0016-opening-animation.md) and the yellow "STB Together" badge)

## Context
The family had started calling the app "Stan". Mike (14 Nov 2026) supplied his own brand ideas as animations: Stan's head as the app icon, with "Send The Boy" on a black band across the lower half, winking, spinning and cheering; and Stan beside the name as a logo. He reviewed a sheet of options and chose: the **rounder head** (option B), **keep "Stan" signed on him**, and left the "Together" tagline to us.

## Decision
- **One Stan everywhere.** A rounded yellow head with a black lower band, a screen face with cyan eyes, the map-pin antenna, short dark limbs with cyan tips. Drawn once in `js/stan.js` (`stanHead`), and the app, the icon, the opening and the logo all use that drawing.
- **What the band says:** his own name, **Stan**, in the app and on the logo; **Send The Boy** on the opening; nothing on the small button and the icon.
- **Home-screen icon:** his head on black, no words (they can't be read at that size; the phone prints the name underneath). The "maskable" icon keeps him inside the middle 60% so round and squircle crops never cut the antenna. Made by `tools/make-icons.py` from the same drawing.
- **Opening:** Stan pops up, winks, spins once on a cyan swoosh and cheers with a burst of sparks, on black. Same length, same rules and the same four rising notes as before (sound off unless switched on; a tap skips it; nothing at all with "reduce motion").
- **Logo:** Stan beside "Send The Boy" with a yellow swoosh (`stbLogo`). On the sign-in page and at the top of the delivery report.
- **"Together" is retired** from the logo: the name and Stan say enough, and three things in one mark was one too many.
- When he cheers (run finished) his eyes go happy; when he waves he winks.

## Consequences
The three videos made 12 to 14 Nov show the earlier Stan and the old badge until re-filmed. "Stan" is also the name of an Australian streaming service; that is noted for any future trade-mark advice, and the business name stays Send The Boy. The ™ in Mike's drafts is not used in the app.
