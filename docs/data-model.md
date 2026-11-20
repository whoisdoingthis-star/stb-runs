# Data model

The database is defined entirely in [`sql/schema.sql`](../sql/schema.sql), which can be run again safely at any time. Every table has row-level security: only signed-in users whose email is in `members` can read or write anything. Sign-ups are switched off in Supabase.

| Table | Holds | Notes |
|---|---|---|
| `members` | Everyone with access: email, display name, `role` (`driver` = app only, `dispatcher` = app + dispatch), `active` | The display name shows on ticked tiles. Managed on the dashboard's Users tab. A trigger keeps at least one active dispatcher. |
| `runs` | One row per route per delivery day | `source_hash` (SHA-256 of the PDF it came from: the sheet's fingerprint), `summary` (counts, papers by publication, dockets), `checks`, `warnings`, `key_report`, `source` (`auto` = evening fetch, `upload` = manual), `updated_at`, `driver`, `closed_at` (null = open), `closed_by`, `close_method` (`paper` or `app`), `close_note`, `last_changes` (what changed when the sheet was last replaced: `{at, count, items[]}`). |
| `run_lines` | The tiles: one per address on a run | `address_key` (same every day), `parts` (papers and quantities), `sources` (original sheet lines: page, row, publication, quantity and the raw printed text), `note`, `flags` (complaint, start, stop, check day…). Replaced whole when a sheet is replaced. |
| `tap_events` | Every tick and untick, never changed or deleted | Who, device time, server time, GPS (`lat`, `lng`, `accuracy_m`, `fix_age_ms`), device, `outcome` (`delivered`, `short`, `futile` = couldn't deliver, `undone`; older entries have none and mean delivered/undone), `reason`, `qty_delivered`, `method` (null = ticked in the app; `paper` = entered in Dispatch when a paper run was closed, dispatchers only; `photo` = recorded afterwards at the time read from the delivery photo, [decision 0030](decisions/0030-photo-time-is-proof.md); `correction` = a correcting record added by hand at a dispatcher's request, with the explanation in `reason` and the originals left in place, first used 18 Nov 2026, [decision 0037](decisions/0037-ask-before-unticking.md)). A problem is a new entry after the tick, never an edit. Runs with taps can't be deleted. |
| `person_sequences` | A driver's own order for a route | `route`, `user_id`, `address_keys`. One per person per route; only its owner can change it. Dispatchers can have one too ([decision 0031](decisions/0031-own-order-for-dispatchers.md)). No row = the usual order (`route_sequences`). |
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

| `duty_events` | Each change of a person's duty: `state` (on_duty, on_run, between, off_duty), `run_id`, `source` (tap, auto = driving, tick, move_on, dispatch), `device_time`, position. Added, never edited. Members add their own; everyone on the list reads. ([decision 0020](decisions/0020-on-duty-and-shifts.md)) |
| `app_settings` | Small settings by `key`, `value` as JSON. `depot` = `{ lat, lng, radius_m }`. `deadlines` = `{ weekday: '06:00', weekend: '07:00', holidays: ['2026-12-25', …] }` ([decision 0028](decisions/0028-morning-watch.md)). Dispatchers write; everyone on the list reads. |

| `ideas` | Chat with Stan: what someone told Stan (`text`, `topic`, `screen`, `app_version`, who, when), plus `status` (new, planned, done, declined) and `note`. Family members add their own; everyone on the list reads; only dispatchers set status and note. ([decision 0024](decisions/0024-chat-with-stan.md)) |

| `avatars` | Each person's icon: `kind` (icon or photo) and `value` (a ready-made icon's name, or a 96×96 JPEG as a data URL made on the phone). One row per person; only they can add or change it; everyone on the list reads. ([decision 0025](decisions/0025-avatars.md)) |
| `day_plans` | Stan's plan for a delivery day ([decision 0040](decisions/0040-day-plan.md)) | One row per `delivery_date`: `plan` (JSON: the crews, each with its driver, helpers, runs in order and times; the deadline; what was assumed), `note`, `updated_by`, `updated_at`. Members read; dispatchers write. |
| `notices` | Notes on the notice board ([decision 0041](decisions/0041-crew-check-and-notice-board.md)) | `from_name`, `body` (up to 500 characters), `to_names` (null = everyone), `created_at`, `expires_at` (null = until removed), `removed_at`, `removed_by`. Members read and add their own; the writer or a dispatcher takes one down. |
| `notice_seen` | Who has tapped Got it on a note | One row per `notice_id` and `user_name`, with `seen_at`. Members read; each person adds only their own. |
| `helper_names` | Helpers with no login, typed under "Other…" | `name`, `added_by`, `added_at`. Members read and add; dispatchers remove (People page). |
| `spare_counts` | Spare papers ([decision 0042](decisions/0042-spares-and-pinned-rules.md)) | One row per answer: `delivery_date`, `user_name`, `moment` (`start` or `end`), `counts` (JSON by paper, e.g. NZH, SST), `given` (JSON list of who got a spare and how many), `device_time`. Added, never changed; each driver's latest answer for a moment is the one used. Members read; each driver adds their own. |
| `spare_people` | People who regularly get a spare, shown as buttons | `name`, `added_by`, `added_at`. Members read and add; dispatchers remove. |
| `stan_lines` | Which of Stan's lines have been recorded ([decision 0043](decisions/0043-stan-recorded-voice.md)) | `key` (also the clip's file name), `text` (the words as recorded), `voice_id`, `model`, `bytes`, `recorded_by`, `recorded_at`. Members read; only the `stan-voice` function writes. The clips themselves are in the public `stan-voice` storage bucket. |
| `run_km` | How far a run was ([decision 0045](decisions/0045-kilometres.md)) | One row per run: `line_km` (straight lines between the places it was ticked, in order), `road_km` (the same path along the roads; empty if the map didn't answer), `points`, `computed_by`, `computed_at`. Members read and write; worked out once, the first time someone opens that morning's summary. |
| `game_scores` | Scores from Stan's Paper Run ([decision 0034](decisions/0034-stans-paper-run.md)) | One row per finished game: `user_name`, `score`, `streets`, `delivered`, `best_streak`, `ended` (complaints, battery, quit). Everyone on the list reads; you can only add a score under your own name. Nothing to do with runs or ticks. |

| `pings` | Dispatch asking where an on-duty driver is: `target_name`, `asked_by`, `asked_at`, then the phone's answer (`state` answered / off_duty / no_gps, position, `answered_at`). Dispatchers add; only the pinged person's phone answers; kept as a record. ([decision 0026](decisions/0026-run-map-and-ping.md)) |

## Views
- `line_status`: latest tick state per tile, with its outcome, reason, quantity delivered and method.
- `address_positions`: where each letterbox is, learned from real delivery ticks: the average of the ticks that agree (within 30 m of the middle of them), only when at least two agree and they are at least half of the ticks there. Stan guides to it when Dispatch has set no stop ([decision 0039](decisions/0039-learned-letterbox.md)).
- `complaint_register`: complaints with who ticked that delivery (time, GPS accuracy, outcome and reason), photos that day, and the address's complaint count, order and previous date.
- `policy_clashes`: pairs of active policies that disagree (can appear after an address moves to a different stop).
- `run_times`: per run, the first and last app tick and how many (paper ticks left out). How long a route usually takes, and whether it made its deadline.
- `run_progress`: per run, stops done, not delivered, paper ticks, the last tick and who ticked. Decides when a run is complete and moves to History.
- `address_destinations`: where Google Maps goes for each address: the Dispatch stop's GPS, else the learned letterbox position.
- `current_policies`: policies in force today (active, inside their dates).
- `address_register`: the register with learned GPS and location names, as the dashboard shows it.

## Who can change what
Everything is readable by active members. Runs, tiles, taps, photos, custom orders and door codes can be written by any active member. Locations, policies, the register's assignments, complaint status, people, closing runs, run drivers and paper ticks can only be changed by dispatchers (`is_dispatcher()`).

## Storage buckets (private)
- `run-sheets`: the PDFs the evening fetch downloads, kept for the record.
- `delivery-photos`: stamped delivery photos, `<date>/<route>/<address>-<time>.jpg`.

## Live updates
`tap_events`, `route_sequences` and `runs` are in the `supabase_realtime` publication.

## Changing the database
Write the change into `sql/schema.sql` in re-runnable form, run it in the Supabase SQL editor, update this page, and commit together. `npm test` runs the whole schema twice in a local Postgres (`test/sql.mjs`) and checks a non-member can see nothing.


**Drivers and helpers (19 Nov 2026):** `members.crew` is `driver` or `helper` (default `driver`), separate from `role` (access). `duty_events.helpers` is the list of helpers' names a driver gave when going on duty (empty when on their own; null when not asked, as for a helper's own shift).

**Who's driving (19 Nov 2026):** `duty_events.driver` is the driver a helper named when going on duty. Read crews with `shiftCrews` in `js/shifts.js`: the driver's `helpers` wins over a helper's `driver`.

**Pinned rules (20 Nov 2026):** `notices.pinned` marks a standing rule: no end date, listed first on the board.

**Odometer (21 Nov 2026):** `spare_counts.odometer_km` is the driver's odometer reading given with the spare count: `start` when leaving the depot, `end` when going off duty. Optional.
