# 0074. A returning address goes with its own street; Stan's costliest cards first

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, by voice, 28 Nov 2026: 22 Marine Parade "ended up in a weird place again" on Run 6; he'd dragged it back last week and "it should have remembered the sequencing for us"; Stan showed cards that morning, "but not for 22 Marine Parade".

## Context
22 Marine Parade is on Run 6's Saturday sheets only. Mike's own order doesn't hold it, so it was placed by [0068](0068-returning-addresses-and-one-letterbox.md): after the nearest address before it in the usual order that his order knows. That is 40 Masefield Street. Mike drives Marine Parade *before* Masefield, so it landed between 40 Masefield and 59 Sale Street, 13 stops from its street. Stan's check found it, but showed only the first three cards, and it was fourth.

## Decision
- An address someone's own order doesn't have is placed, in this order of preference: after the usual order's neighbour before it **if that is on its street**; else before the usual order's neighbour after it **if that is on its street**; else beside the house on its street (in that person's order) with the nearest number, keeping the block's direction; else as before. Replayed on this morning's sheet and Mike's order, it lands before 44 Marine Parade, where he dragged it.
- Stan's check cards are ranked: an address far from its street first (the furthest first), then the rest. Three show; if there are more, a **Stan has N more to check** button shows them. A card is never hidden without saying so.

## Consequences
- Mike's own order now holds 22 Marine Parade (his drag this morning), so next Saturday it is placed from his order; this rule covers everyone else's orders and any other part-week address.
- Tests: `test/sequence.mjs` (the 22 Marine Parade case and its two fallbacks).
