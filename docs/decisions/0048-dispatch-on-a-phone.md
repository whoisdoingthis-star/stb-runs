# 0048. Dispatch on a phone: sections along the bottom, pages as pills, tables as cards

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Dispatch was designed for a laptop ([UX review](../ux-review.md)). Mike now opens it from his phone more and more, and said (21 Nov 2026): "I scroll left right up down and pop ups are a search and rescue exercise."

Measured at a phone's width (412 px) before this change: pages laid out about 1,210 px wide, tables up to 1,186 px, the list of eleven pages ran off the side, the side column sat on top of the main one (it blocked a tap on **Map**), and Stan's voice page had 116 buttons too small for a thumb.

Mike suggested sticky tabs along the top with sub-tabs down the side. We agreed the two levels but placed them differently, because a side strip takes width from every page, and width is what a phone is shortest of. Mike saw the mock-up and said "Yeah this is awesome. Should we push?"

## Decision
1. **Four sections, each with its pages.** Nothing was removed or renamed on the laptop.
   - **Today:** Overview (called **Now** on a phone), Day plan, Runs & sheets
   - **Proof:** Complaints (with Find a delivery and the Delivery report)
   - **Insights**
   - **Set-up:** People, Addresses, Locations, Policies, Stan's voice, Change log
2. **On a phone (900 px wide or less):**
   - the four sections are a bar along the bottom, where a thumb reaches;
   - the section's pages are a row of pills under the header that stays put as the page scrolls. A section with one page shows no pills;
   - tapping a section reopens the page you last used in it. Tapping the section you are already in goes to its first page;
   - the bar carries the counts that need a look: open complaints on **Proof**, addresses without a location on **Set-up**;
   - never more than two levels.
3. **Tables become cards on a phone.** Each row is a card, each value has its column's name beside it, and nothing scrolls sideways.
4. **Pop-ups** open full width from the bottom, and the title and **✕** stay at the top while the rest scrolls. This applies to the driver app's pop-ups too.
5. **Thumb-sized** buttons, links, selects and tick boxes on Dispatch pages on a phone.
6. **On a laptop** the side list is the same pages in the same order, now under the four section headings.

## Consequences
- The layout is done with styles and one small piece of code that copies each column's name onto its cells, so every table, present and future, gets the card treatment without being rewritten.
- A very long table (the address register) is a long list of cards on a phone. Search and the filters are the way through it; the laptop is still the better tool for bulk work.
- Checked in a browser by `test/e2e-dispatch-phone.py`: every page fits the width, the bar and pills work, a pop-up can always be closed.
- Still to come from the wider review: the driver's Runs page, and where sounds, streaks and the walking-Stan progress bar go.
