# Data model

The database is defined entirely in [`sql/schema.sql`](../sql/schema.sql), which can be run again safely at any time. Every table has row-level security: only signed-in users whose email is in `members` can read or write anything. Sign-ups are switched off in Supabase.

| Table | Holds | Notes |
|---|---|---|
| `members` | Family members: email, display name | The display name shows on ticked tiles. Add people here and in Supabase Authentication. |
| `runs` | One row per route per delivery day | `summary` (counts, papers by publication, dockets), `checks`, `warnings`, `key_report`, `source` (`auto` = evening fetch, `upload` = manual), `updated_at`, `last_changes` (what changed when the sheet was last replaced: `{at, count, items[]}`). |
| `run_lines` | The tiles: one per address on a run | `address_key` (same every day), `parts` (papers and quantities), `sources` (original sheet lines), `note`, `flags` (complaint, start, stop, check day…). Replaced whole when a sheet is replaced. |
| `tap_events` | Every tick and untick, never changed or deleted | Who, device time, server time, GPS (`lat`, `lng`, `accuracy_m`, `fix_age_ms`), device. Runs with taps can't be deleted. |
| `route_sequences` | Each route's custom delivery order | Set by hold-and-drag; applied to future sheets. |
| `route_sequence_history` | Every change to a custom order | Who and when. Filled by a trigger. |
| `access_codes` | Run 8 door codes per building | Entered in the app; never in the repository. |
| `access_code_history` | Every door code change | Filled by a trigger. |
| `photos` | Delivery photos: route, address, run, storage path, time, GPS, who | The image is in the private `delivery-photos` storage bucket. Members can add and view; nobody can edit or delete from the app. |
| `photo_watch` | Addresses to photograph on every delivery | Per route and address; added from the photo screen. |

## Views
- `line_status`: latest tick state per tile.
- `address_positions`: average of good GPS fixes per letterbox, for working out delivery order.

## Storage buckets (private)
- `run-sheets`: the PDFs the evening fetch downloads, kept for the record.
- `delivery-photos`: stamped delivery photos, `<date>/<route>/<address>-<time>.jpg`.

## Live updates
`tap_events`, `route_sequences` and `runs` are in the `supabase_realtime` publication.

## Changing the database
Write the change into `sql/schema.sql` in re-runnable form, run it in the Supabase SQL editor, update this page, and commit together. `npm test` runs the whole schema twice in a local Postgres (`test/sql.mjs`) and checks a non-member can see nothing.
