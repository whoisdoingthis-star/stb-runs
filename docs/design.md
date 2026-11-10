# Design guide

How screens in STB look and behave, so new features fit in instead of each adding its own style (the cause of the "clunky" feel in the [UX review](ux-review.md)). Tokens live at the top of `styles.css`; use them, never raw colours.

## Principles
1. **One glance, one tap.** A driver in the dark, in a moving vehicle, must see the next stop and tick it without reading anything else.
2. **Nothing essential disappears.** Information that matters (what you just ticked, Undo) stays on screen until the next action. Pop-up messages are only for "done" confirmations.
3. **Thumb reach for actions, top for status.** Frequent actions go in the bottom bar; the header shows where you are and how far along.
4. **One menu.** Anything that isn't ticking goes in the ⋯ menu (run screen) or ⚙ Settings (home). Don't add buttons to headers.
5. **Big text is a first-class layout,** not a zoom: one tile per row, solid DONE tiles, bigger targets.
6. **Drivers and dispatch are different products.** The phone app is for doing runs; planning, sheets and people live in the dispatch dashboard.

## Themes
- **Night is the default** (runs start around 5am; Zaph's recommendation, 8 Nov 2026). Day and Auto (night 7pm–7am NZ) are in Settings and the run's ⋯ menu, remembered per phone.
- Night mode is `html.dark`, set before the first paint (`index.html`) so there's no white flash.
- Every colour must be checked in both themes. Text ≥ 4.5:1, edges of tappable things ≥ 3:1 (WCAG 2.2 AA).

## Colour: one meaning each
| Token | Means | Use for |
|---|---|---|
| `--done` / `--done-bg` / `--done-line` | Delivered, OK | Ticked tiles, finished streets, "totals match" |
| `--brand` / `--brand-ink` | Structure | Street banners, main buttons, table headers |
| `--next` / `--next-bg` | The next stop | The NEXT tile, the Next button. Nothing else |
| `--retail*` | Shop drop (paper + docket) | Retail tiles and chips |
| `--other*` | A paper other than NZH | Those tiles and chips |
| `--multi*` | Several papers at one address | Those tiles and chips |
| `--bad` / `--bad-bg` | Problem, complaint, destructive | Complaints, failed checks, delete |
| `--warn` / `--warn-bg` | Needs a look | Changes since the last sheet, unsent ticks, GPS off |
| `--info` / `--info-bg` | Links, live helpers | "with Lisa", links |
| `--edge` | Edge of anything you tap | Tile and card borders |
| `--muted` | Secondary text | Never for instructions (delivery notes use body text) |

## Type scale
`--t-s` 14px (secondary), `--t-m` 17px (body, titles in bars), `--t-l` 22px (page titles, run names), `--t-xl` 34px (rare). House numbers on tiles are 22px (44px in big text). Big text multiplies by about 1.3.

## Components
| Component | Where | Rules |
|---|---|---|
| **Run header** (`.rh`) | Run screen | Sticky. Back, run name with the date beside it, search, ⋯; status dots (GPS, sending, who's here) on one line underneath, never wrapping; progress line and a 4px progress fill. Nothing else |
| **Bottom bar** (`.actionbar`) | Run screen | Before the first tick: next stop and Next ↓ on one row. After a tick: two full-width lines of words (last tick, next stop), never cut short by the buttons, then a row of 48px buttons: Undo, problem, camera, Next ↓. Stays until the next action |
| **Tile** (`.tile`) | Run screen | House number first and large, unit underneath in body colour ("Unit 2C", "Suite 1"), chips, notes (3 lines max in two-across), flags. **A tile keeps its height when ticked:** who and when go beside the ✓ on the number row, not on a new line. 2px `--edge` border, 3px in big text. States: normal, `.next`, `.done`, kind colours |
| **Street banner** | Run screen | Full-width `--brand` band, bold capitals, count on the right; green when finished. Sticks under the run header (`--rh-h`, set from the header's real height) so the street is always in view |
| **Run card** (`.run-tile`) | Home | Whole card is the button: Run N, stops · items · dockets, progress if started, Start / Continue / View |
| **Sheet** (`openSheet`) | Menus, settings, forms | Slides up from the bottom, title and ✕, Escape closes. Choices as segmented rows (`choiceRow`), actions as full-width rows (`menuItem`), destructive ones last and red |
| **Toast** | Anywhere | Short confirmations only, one or two lines, never essential, cleared when the screen changes or a sheet opens. Never repeat what a tile or the bottom bar already shows |
| **Icons** (`icon()`) | Buttons | Line drawings (search, camera, warning, undo), not emoji, so they look the same on every phone. Icon-only buttons need an `aria-label` |
| **Dashboard card** (`.dz-card`) | Dispatch | Title in capitals, one job per card. Tables scroll inside the card |

## Spacing and targets
- 4/8px grid. Touch targets at least 44px (48px in bars, 56px in big text).
- Screens: phone first for the driver app (390px), laptop first for dispatch (sidebar at ≥900px, top tabs below).

## Words
- "Run 6", never "HOWICK06", on driver screens. Route codes appear only in dispatch tables and the docs.
- Addresses as said aloud: "87 Picton Street (Suite 1)".
- Buttons say what happens: "Get Runs", "Upload a run sheet", "Put back in the sheet's order…". An ellipsis means more questions follow.

## Before adding a screen or feature
- [ ] Uses tokens only; checked in Night, Day and big text
- [ ] Works one-handed on a phone if drivers use it; nothing new in the run header
- [ ] Destructive or bulk actions confirm, and offer Undo where possible
- [ ] Ticking doesn't move anything under the thumb; no browser pop-up boxes (`prompt`) on driver screens
- [ ] Dispatch links are all the one style (`--info`, underlined)
- [ ] The family guide or dispatch guide is updated (CONTRIBUTING rule 1)
