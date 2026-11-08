# Data model

The database is defined entirely in [`sql/schema.sql`](../sql/schema.sql), which can be run again safely at any time. Every table has row-level security: only signed-in users whose email is in `members` can read or write anything. Sign-ups are switched off in Supabase.

| Table | Holds | Notes |
|---|---|---|
| `members` | Everyone with access: email, display name, `role` (`driver` = app only, `dispatcher` = app + dispatch), `active` | The display name shows on ticked tiles. Managed on the dashboard's Users tab. A trigger keeps at least one active dispatcher. |
| `runs` | One row per route per delivery day | `source_hash` (SHA-256 of the PDF it came from: the sheet's fingerprint), `summary` (counts, papers by publication, dockets), `checks`, `warnings`, `key_report`, `source` (`auto` = evening fetch, `upload` = manual), `updated_at`, `last_changes` (what changed when the sheet was last replaced: `{at, count, items[]}`). |
| `run_lines` | The tiles: one per address on a run | `address_key` (same every day), `parts` (papers and quantities), `sources` (original sheet lines: page, row, publication, quantity and the raw printed text), `note`, `flags` (complaint, start, stop, check day…). Replaced whole when a sheet is replaced. |
| `tap_events` | Every tick and untick, never changed or deleted | Who, device time, server time, GPS (`lat`, `lng`, `accuracy_m`, `fix_age_ms`), device, `outcome` (`delivered`, `short`, `futile` = couldn't deliver, `undone`; older entries have none and mean delivered/undone), `reason`, `qty_delivered`. A problem is a new entry after the tick, never an edit. Runs with taps can't be deleted. |
| `route_sequences` | Each route's custom delivery order | Set by hold-and-drag; applied to future sheets. |
| `route_sequence_history` | Every change to a custom order | Who and when. Filled by a trigger. |
| `access_codes` | Run 8 door codes per building | Entered in the app; never in the repository. |
| `access_code_history` | Every door code change | Filled by a trigger. |
| `photos` | Delivery photos: route, address, run, storage path, time, GPS, who | The image is in the private `delivery-photos` storage bucket. Members can add and view; nobody can edit or delete from the app. |
| `photo_watch` | Addresses to photograph on every delivery | Per route and address; added from the photo screen. |
| `addresses` | The address register: every address seen on a run sheet | Filled by a trigger on `run_lines` (runs, first/last seen). Dispatchers set `operating_location_id`, `service_location_id`, validation and notes. |
| `location_groups` | Villages, buildings, streets, areas | Can nest (`parent_id`). Optional run. |
| `operating_locations` | Where the vehicle stops | Group, run, stop number (`seq`), GPS. |
| `service_locations` | Where the work is done from a stop | Kind (letterbox, bank, reception, lobby, door, other), order, GPS, validation. Deleted with their operating location. |
| `location_policies` | Rules on a group, stop, service location or address | Exactly one target. Kind, note, GPS (entry point), times, speed, days, active, `valid_from`/`valid_to`. A trigger refuses a policy that clashes with another ([business rules](business-rules.md#policies)). |
| `complaints` | The complaints register: one entry per complaint (address, paper, kind, date it happened) | Filled by a trigger on `run_lines` from complaint flags; first and last sheet that listed it; status (open, disputed, accepted, closed) and notes set by dispatchers. |
| `dispatch_history` | Every change to people, locations, assignments and policies | Who, when, what (the row as JSON). Filled by triggers; the register filling itself isn't logged. |

## Views
- `line_status`: latest tick state per tile, with its outcome, reason and quantity delivered.
- `address_positions`: average of good GPS fixes per letterbox, for working out delivery order.
- `complaint_register`: complaints with who ticked that delivery (time, GPS accuracy, outcome and reason), photos that day, and the address's complaint count, order and previous date.
- `policy_clashes`: pairs of active policies that disagree (can appear after an address moves to a different stop).
- `current_policies`: policies in force today (active, inside their dates).
- `address_register`: the register with learned GPS and location names, as the dashboard shows it.

## Who can change what
Everything is readable by active members. Runs, tiles, taps, photos, custom orders and door codes can be written by any active member. Locations, policies, the register's assignments, complaint status and people can only be changed by dispatchers (`is_dispatcher()`).

## Storage buckets (private)
- `run-sheets`: the PDFs the evening fetch downloads, kept for the record.
- `delivery-photos`: stamped delivery photos, `<date>/<route>/<address>-<time>.jpg`.

## Live updates
`tap_events`, `route_sequences` and `runs` are in the `supabase_realtime` publication.

## Changing the database
Write the change into `sql/schema.sql` in re-runnable form, run it in the Supabase SQL editor, update this page, and commit together. `npm test` runs the whole schema twice in a local Postgres (`test/sql.mjs`) and checks a non-member can see nothing.
