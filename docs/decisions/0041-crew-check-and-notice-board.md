# 0041. The crew check when going on duty, and the notice board

- **Date:** 2026-11-19
- **Status:** Accepted. Changes the "Who's with you?" step of [0040](0040-day-plan.md), released the same evening.

## Context
Mike, after seeing Stan's plan pop-up (19 Nov 2026), asked for two things:
1. **A shared notice board:** anyone can leave a note for the others; Stan shows it when they next open the app and they acknowledge it to close it. By default to everyone, with the option of picking people.
2. **A firmer crew check:** the driver can't carry on until they've confirmed who is helping, with an "Other" for Serene or Seira that is remembered without making them a login; then "Prepping at depot" or "We're prepped and starting the run"; if prepping, the next step is "Leaving depot now", which starts the run. Helpers pick "Who's driving?", but **the driver's selection is the boss**.

Claude suggested releasing the on-duty change after Friday's runs, as it hadn't been on a real phone. Mike chose to release both that evening and test them himself.

## Decision
**Going on duty**
- **Driver:** On duty opens *Who's with you?*: each helper, **Other…** (type a name, up to 30 letters; it is ticked, and saved in `helper_names` so every driver has it as a button next time), and **Just me**. The two next buttons stay locked until a helper or Just me is chosen. Anyone in today's plan is already ticked.
  - **Prepping at the depot:** on duty, helpers recorded. The duty card then shows **Leaving the depot now**; tapping it records *on the run*.
  - **Prepped: starting the run:** on duty and on the run together.
- **Helper:** *Who's driving?* lists the drivers (the planned one first). One tap goes on duty with that driver recorded (`duty_events.driver`).
- **Which answer counts** (`shiftCrews`, tested): the driver's list. A helper's answer is used only when the driver gave none.
- **Kept as they were:** ticking is never blocked by any of this; the app still switches to *on the run* by itself when the car drives off or the first stop is ticked, so a forgotten "Leaving the depot now" costs a rough depot time, not a stuck screen. If the phone doesn't know the drivers-and-helpers list at all, On duty is one tap as before.

**Notice board**
- A **📌 Notice board** button on the Runs page, with the number of live notes for you.
- **Leave a note:** up to 500 characters; for **Everyone** (default) or chosen people; kept **3 days** (default) or **until I remove it**.
- **Stan's pop-up:** on the Runs page, every note for you that you haven't acknowledged, in one sheet, after the day plan if that is showing too. **Got it** records it (`notice_seen`); closing with ✕ doesn't, so it returns next time. Your own notes never pop up for you.
- **The board** shows each live note with "Seen by …; not yet …". The writer or a dispatcher can take a note down (it is kept in the database, marked removed).
- With no signal, Got it is kept on the phone and sent later.

## What it does not do
- It is not an alarm: nothing reaches a phone until the app is opened. The form says so.
- A note for chosen people is only *shown* to them and its writer; it is not hidden in the database from other family logins.
- A driver who starts ticking without ever tapping On duty is not asked about the crew.
- Dispatch has no notice board page yet; dispatchers use the one in the app.

## Consequences
Depot time, with and without a helper, is now measured (On duty to Leaving the depot), which will replace the two assumptions in the day plan. Drivers have two more taps when going on duty. The Overview shift line in Dispatch shows "with Lenny" or "helping Lisa".
