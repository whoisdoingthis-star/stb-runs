# 0027. A delivery report for any dates, to send as a PDF

- **Date:** 2026-11-13
- **Status:** Accepted

## Context
Mike (13 Nov 2026), after two complaints from the run owner in two days: he needs a summary of complaints and their resolutions for chosen dates, with the delivery's time, date, GPS and photos, the notes made in Dispatch, and every photographed delivery even where no complaint was lodged, to send to the run owner as a PDF.

## Decision
- **Dispatch → Complaints → Delivery report (PDF)…** asks for From and To dates (the last 7 days to start with) and opens the report as a page to check.
- **Complaints and resolutions:** every complaint about, or first reported in, those dates: address, run, kind, publication, the day it's about, the status in plain words (open / disputed: our records show it was delivered / accepted: our miss / closed), our notes, whether it's a repeat, and **the delivery record for that day**: who, the time to the second, GPS with accuracy and a map link, or "recorded from the paper run sheet, so no GPS", or plainly "no delivery record for that day in the app".
- **Other photographed deliveries:** every address with a photo in the dates that has no complaint, with the same delivery record.
- Photos are shown with when, who and where. They are fetched with links that last an hour, so they print into the PDF.
- **Save as PDF** uses the browser's own print box; nothing is sent anywhere by the app. Mike sends the PDF himself.
- What goes in the report is decided by `js/report.js` (tested); Dispatch only loads the rows and draws it.

## Consequences
The report names family members (first names) and customers' addresses: it's for the run owner, not for publishing. Nothing before the app held sheets (9 Nov 2026) has a delivery record.
