# 0029. The delivery report keeps the complaint and our record apart

- **Date:** 2026-11-14
- **Status:** Accepted (changes the layout in [0027](0027-delivery-report.md))

## Context
Mike (14 Nov 2026), after sending the first reports: the complaint details could be read as us confirming a miss; the tap that proves the delivery wasn't prominent; the layout, the file name and the footer needed work, and the footer shouldn't suggest we follow where the phone is.

Looking at that report also showed a fault: when the run sheet gave no date for a complaint, the report showed the delivery record for the day the complaint *arrived* (usually the redelivery), not the morning complained about.

## Decision
- **Each complaint has two separate parts.** *Complaint received (as reported by the publisher, not verified)*: what it was reported as, in plain words, for which delivery, when it came onto our run sheet, the publisher's own wording, and any history. Then *Our delivery record for that day*, outlined, with a badge: **Delivered · time and GPS recorded**, **Delivered · paper run sheet**, **Could not deliver**, **No app record** or **No date given**.
- **The tap is the headline of our record:** the time (large), who, how it was recorded, and the position with its accuracy and a map link. Photos are larger.
- **The right morning.** If the sheet gives no date, the day is read from the day and month at the start of the publisher's reference ("1211 NSNA" is 12 Nov), only when that is a real date in the three weeks before the sheet, and the report says it was read that way. If there's no date at all, the complaint is not matched to any morning; the deliveries on record in the dates are listed instead.
- **Deliveries since:** later deliveries and photos at a complaint address sit under that complaint, not in the appendix.
- **Page 1 is a summary:** counts and a table with one row per complaint (address, what was reported, for which day, our record, photo, status).
- **Status wording:** "Under review" for an open complaint. **Our response** is the Dispatch note; each can be left out on screen before saving.
- **Appendix: other photographed deliveries**, grouped by address.
- **Paper and file:** A4, "Page 2 of 6", a reference on every page (ZDR-from-to-time), and the saved PDF is named `Zalense-Delivery-Report_HOWICK_<from>_to_<to>`.
- **Footer:** says each position was recorded once, at the delivery address, when the delivery was recorded, and at no other time.

## Consequences
The publisher's reference format is our reading of their sheets, not something they've told us; the report says when a date came from it. The Complaints list in Dispatch still shows "Date of the problem not given" for those complaints.
