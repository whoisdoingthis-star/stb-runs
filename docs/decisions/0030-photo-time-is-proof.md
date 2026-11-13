# 0030. A photo's own time can stand as the delivery record

- **Date:** 2026-11-14
- **Status:** Accepted

## Context
Sat 14 Nov 2026: Lisa's phone died partway through Run 10. Lenny photographed the remaining complaint addresses on his own phone. The photos could be added afterwards (**⋯ → Add a photo to an address**), but that never ticked the stop, and the photo's time came from the file's date, which changes when a picture is copied or sent. Mike: if we can pull the real date and time from the photo, he's comfortable carrying that through to the delivery tap, because the photo is the proof.

## Decision
- When a photo is **chosen from the phone's gallery**, the app reads **when it was taken** (and where, if the phone saved that) from the photo file itself: the details every camera writes into a JPEG. `js/exif.js`, tested.
- That time is the photo's time in the app and in the report, wherever it's from.
- **If the stop has no tick, the delivery is recorded at the photo's time**, as a new kind of tick: `method = 'photo'`. Only when the photo says when it was taken, that was on the run's delivery day (NZ), and it isn't in the future. A stop that's already ticked keeps its tick; a stop unticked after the photo's time stays unticked.
- A camera that doesn't state its time zone is taken to be on New Zealand time.
- If the photo carries no time (pictures sent through WhatsApp or Messenger lose it), the photo is still saved, nothing is ticked, and the app says why. The file's own date is still used for the photo if it's from the last two days, as before.
- **Take a photo now** in the same menu still doesn't tick: that photo is being taken afterwards, not at the delivery.
- The report says so plainly: **Delivered · time from the delivery photo**, "added to the run afterwards by …", and a line in the footer.
- Anyone on the list can add a photo tick (the database policy allows `method = 'photo'`); paper ticks stay dispatcher-only.

## Consequences
The tick's time is as trustworthy as the clock on the phone that took the photo, the same as any other tick. The name on a photo tick is who added it, which is why the photo should be added from the phone that took it. Phones usually don't hand the photo's GPS to a web page, so most photo ticks have a time and no position. iPhone HEIC photos aren't read (the family's phones save JPEG).
