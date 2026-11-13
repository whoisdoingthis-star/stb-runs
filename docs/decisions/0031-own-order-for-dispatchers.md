# 0031. A dispatcher can keep their own order too

- **Date:** 2026-11-14
- **Status:** Accepted (extends the own-order rule of 11 Nov 2026)

## Context
Mike, through Chat with Stan (14 Nov 2026): "When Lisa or someone else resequences a run, it changes my preferred sequence. It would be good to be able to toggle back to my preferred sequence if I wanted to." Drivers' drags have made their own order since 11 Nov, but Mike and Lisa are both dispatchers, and a dispatcher's drags change the usual order for everyone, including each other.

## Decision
- A dispatcher gets **⋯ → Keep my own order…** on a run. For each run it offers **keep the order as it is now**, and, when someone else has changed the usual order since, **go back to my last order** (the last usual order they saved, from the order history).
- While they have their own order, their drags change only their own, and nobody else's changes move their tiles. **⋯ → Use the usual order again (drop my own)** switches back; the usual order was never touched.
- To change the usual order for everyone, a dispatcher drops their own order first.
- Their own order is a `person_sequences` row, exactly as for drivers. No database change.

## Consequences
With their own order on, a dispatcher no longer sees improvements others make to the usual order until they switch back.
