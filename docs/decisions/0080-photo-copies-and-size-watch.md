# 0080. Photos copied to Drive each night, and a size watch

- **Date:** 2026-11-28
- **Status:** Accepted
- **Stated by:** Mike, 28 Nov 2026. He asked whether to keep only two days of data in the app and the rest in Drive, then whether photos should go to Drive by default. On Claude's advice he chose the hybrid: "Yes, build 1 and 2 now": a nightly photo copy to Drive and the size watch, with clearing old photos from the app built when the watch first warns.

## Context
On 28 Nov the database was 22 MB of the free plan's 500 MB and photos 54 MB of 1 GB, growing about 18 MB a week: photos reach the limit in about a year, the database in years. The nightly backup ([0079](0079-nightly-backup-to-drive.md)) listed photo names but held no photos. Stan's learning (own orders, report card, time between stops, efficiency, complaints) needs weeks of history, so the app keeps it.

## Decision
- **New photos stay in Supabase**: phones save them offline and upload later, they stay private, and the app, Dispatch and Puneet's reports show them directly. Not chosen: Drive as the default home (each phone would need Drive access or a relay, and showing them means sharing links to photos of people's letterboxes).
- **Each night the backup script copies photos it hasn't copied yet** into *STB backups/photos* in Mike's Drive. The edge function `backup-photos` gives only the enrolled device 30-minute links; the script records each copy (`photo_backups`) and stops before Apps Script's 6-minute limit, carrying on the next night.
- **The size watch**: a red banner in Dispatch, only at 70% of the database or photo storage limit, saying how full and what to do. Any Claude session can ask `stb_usage()`.
- **Later, when the watch first warns**: clear photos older than 60 days from Supabase once Drive has them, with Dispatch linking to the Drive copy.

## Consequences
- Mike pastes the updated script over the old one in his "STB backup" Apps Script project once; no new setup.
- Tests: `test/sql.mjs` (copies recorded, device secret, usage figures), `test/unit.mjs` (the banner).
