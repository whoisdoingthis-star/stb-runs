# 0054. Everyone's moves make their own order; the usual order changes only on purpose

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Since 11 Nov 2026 a dispatcher's drags changed the **usual order** everyone sees, and anyone else's drags saved their own. [0031](0031-own-order-for-dispatchers.md) let a dispatcher opt in to an order of their own. Mike and Lisa are both dispatchers, and both drive Run 6 differently, so each one's moves rearranged the other's run. Mike (21 Nov 2026): "When I change the run sequence, it resets that order on Lisa and other drivers… I do it one way which feels more efficient, she does it another way… so I've left her version of the sequence, but it's annoying." Asked whether to turn the rule round, he said: "Yes, let drivers keep their own sequence."

## Decision
1. **Everyone's moves save their own order**, dispatchers included. Nobody's drag changes what anyone else sees. This reverses the 11 Nov rule and makes the choice in 0031 the only behaviour, so its *Keep my own order* menu item is retired.
2. **The usual order** is what people see until they move something. It changes only when a dispatcher taps **⋯ → Make my order the usual order…** and confirms. People who already have their own order keep theirs.
3. **Nothing moved on the day of the change.** The usual order for each run stayed as it was; nobody's screen changed until they next moved a tile.
4. **⋯ → Use the usual order again** still drops your own order. *Put back in the sheet's order* is gone from the shared app: it used to wipe the usual order for everyone, and the **Sheet order** switch already shows the sheet's order whenever it's wanted.

## Consequences
- A dispatcher who liked "my moves fix it for everyone" now has one extra tap, and a question to answer, to do that.
- Orders can drift apart without anyone noticing. Stan's address check ([0055](0055-stans-address-check.md)) runs on each person's own order, so a new address lands sensibly in all of them.
- In demo mode (one person on one phone) nothing changes.
- Checked by `test/sequence.mjs` (where a change is saved) and by hand against the live database rules: a member may write only their own row in `person_sequences`.
