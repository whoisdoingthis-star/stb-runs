# 0028. Morning watch, proof on demand and first-day photos: what a run owner needs to see

- **Date:** 2026-11-13
- **Status:** Accepted

## Context
Mike (13 Nov 2026), thinking as the person who owns the delivery contract: the first questions are "which run is about to be late?" and "can we prove we delivered?". He asked for an early warning for runs that haven't started, and a finish estimate with the overrun, so the publisher can be told about a delay and how long it will be. The deadlines he gave: finished by **6:00 am Monday to Friday, 7:00 am on weekends and public holidays**.

## Decision
- **Deadlines are a setting** (`app_settings.deadlines`: weekday time, weekend time, list of public holidays), edited in Dispatch. Public holidays use the weekend time. The list ships with New Zealand's (Auckland) holidays to the end of 2027, actual and Monday-ised days, and must be checked each year.
- **Morning watch** (Dispatch Overview, top) gives every run of the day one of: *Not started* (with the time it needs to start by), *Not started: will be late* (even starting now it can't finish in time, with the minutes), *On track*, *Running late* (minutes over, finish time), *Done on time*, *Done late* (minutes), *Not finished in the app* (an old day). Each has an icon and words; colour is only a helper.
- **The finish estimate** is the pace of the app ticks so far times what's left. Before 5 stops, and for "needs to start by", it uses how long that route usually takes: the middle of its recent app-ticked runs (`run_times` view), or 40 seconds a stop if there's no history yet.
- A run done on paper has no ticks: it shows *Not started* until it's closed, then *Done* at the finish time entered. The card says so.
- **The Overview refreshes itself every minute** while a run is under way.
- **Copy the morning summary** makes a few plain lines (each run's finish time, any late, anything not delivered and why, photos on file) to paste to the run owner.
- **On-time record**: how many finished runs made the deadline in the last two weeks.
- **Find a delivery** (Overview and Complaints): type an address, see every delivery day with who, the time, GPS, complaints and photos.
- **New starts ask for a photo** on the day they first appear, like complaint addresses and the watch list.
- All of this logic is in `js/watch.js` and `js/report.js`, separate from the screen, so a server job can reuse it to send alerts.

Not in this change: alerts when nobody has Dispatch open (needs a scheduled server job and a way to send texts or emails); a read-only login for the run owner (see the roadmap).

## Consequences
"Not started" can be a false alarm for a paper run: close paper runs promptly, or read it as "not in the app yet".
