# 0069. Time between stops: the same legs, two drivers, side by side

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
[0067](0067-gate-on-the-driving.md) found that the minutes in a morning are in the time at stops and the pauses, not in the order. Mike (23 Nov 2026, in the chat) described two ways of delivering Run 6: he throws from the road and drives on; Lisa prefers to deliver by hand and pulls into driveways. She feels the difference is negligible at one stop; he feels it adds up. A first look at the records: on the 44 legs both had driven alone, Lisa's usual time was about six seconds a leg longer, six and a half minutes in all; on Run 13 she was the quicker one on the eight legs they share. He said "Let's build it", and that he is content for the two of them to do it differently.

## Decision
1. **Insights → Time between stops** (dispatch board only). Per run, the two drivers with the most mornings alone (at least two each). Per street, each one's usual time over the legs both have driven at least twice, either way round, and the difference; the complaints on that street in the same dates sit beside it.
2. **Same legs only.** The order of the run and a slow day cancel out. Mornings with a helper are left out; a leg of more than ten minutes is a break and is left out.
3. **It says where two ways differ, not which is better**, and says so on the screen. With fewer than four mornings alone for either driver it is marked as a pointer, not a finding.

## Consequences
- This keeps the standing rules: comparisons between people stay on the dispatch board, facts not scores, accuracy and clean mornings are rewarded and speed never is. Drivers and helpers do not see it.
- It cannot tell a driveway pull-in from a walk to the door or a pause; it only shows where to ask.
- Route optimisation stays stopped at the gate; this is where the effort goes instead (choice 1 in `docs/route-optimisation.md` §5a).
- Checked by `test/timemodel.mjs`.
