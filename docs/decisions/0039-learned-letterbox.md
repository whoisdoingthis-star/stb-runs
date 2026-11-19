# 0039. The learned letterbox: only where real ticks agree

- **Date:** 2026-11-19
- **Status:** Accepted (tightens the learned position used since [0019](0019-driver-assistant.md))

## Context
Mike (19 Nov 2026) asked whether Stan can use the GPS from actual ticks to work out where the next delivery point is. He already did: when Dispatch hasn't set a stop for an address, Stan guides to a position learned from past ticks (`address_positions`), and only looks the street address up when there is none. But that position was a plain **average of every tick**, one tick was enough, and Insights had just shown that about 18% of ticks are made away from the letterbox, a few of them kilometres away. A single stray tick could pull an address's point well off.

## Decision
`address_positions` now learns a point only where real ticks agree:
- **Which ticks count:** made in the app at the time (not paper, photo or corrected records), delivered, with GPS good to 40 m.
- **How the point is found:** the middle (median) of the address's ticks first, then the average of only the ticks **within 30 m** of that middle. A stray tick is ignored instead of averaged in.
- **Enough agreement:** at least **two** ticks must agree, and they must be at least **half** of all the ticks at that address. If not, there is no learned point and Stan falls back to looking the street address up, as before.
- The order is unchanged: the stop set in Dispatch, then the learned letterbox, then the looked-up address.
- A phone no longer keeps an old learned point for offline use once the database has withdrawn it.

On the day (449 addresses had a learned point): 312 kept one; 59 of those moved more than 30 m, 17 more than 100 m and 2 more than 500 m (the worst by 1.8 km). 137 lost theirs until more ticks come in: 79 had only one tick, 58 had ticks that didn't agree.

## Consequences
A new address needs two mornings of ticks before Stan has a learned point for it. Every tick made at the letterbox makes the points better, which is one more reason to tick there. The point is where the phone was when the tile was tapped, which is usually the vehicle beside the letterbox: where the driver needs to stop.
