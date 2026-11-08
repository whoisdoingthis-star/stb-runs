# Glossary

Our words, and the names the STB governance baseline v0.5 uses for the same thing ([decision 0014](decisions/0014-governance-baseline.md)). Code and database names stay as they are.

| Our word | Baseline term | Meaning | Where |
|---|---|---|---|
| Run sheet / key report | Source document | The RouteSmart PDF for a delivery day. Its fingerprint is kept | `runs.source_hash` |
| Sheet line | Source record | One printed row: address, publication, quantity, instruction. Kept word for word | `run_lines.sources` |
| Run | Source run | One route on one delivery day | `runs` |
| Tile | Presentation grouping | What the driver taps: every sheet line for one address | `run_lines` |
| Part | Line item (per publication) | One publication and its quantity on a tile | `run_lines.parts` |
| Address key | Nominal address | The address as the same letterbox every day (`HOWICK|UXBRIDGE ROAD|1/71`) | `addresses` |
| Operating location | Operational location | Where the vehicle stops | `operating_locations` |
| Service location | Service location / delivery point | Where the work is done on foot: letterbox, bank, reception | `service_locations` |
| Location group | Group | A village, building, street or area | `location_groups` |
| Policy | Group policy / operational note | A rule on a group, stop, service location or address, with days and dates | `location_policies` |
| Tick | Service event | A tap, with time, GPS and outcome; never edited | `tap_events` |
| Couldn't deliver | Futile attempt | Went there, could not deliver; has a reason | `tap_events.outcome = 'futile'` |
| Short | Partial completion | Delivered fewer than the sheet says | `tap_events.outcome = 'short'` |
| Our order | Accepted route profile ordering | The family's order for a run, applied to future sheets | `route_sequences` |
| Sheet order | Source sequence | The order printed on the sheet, always kept | `run_lines.seq` |
| Complaint | Subsequent claim | A key-report complaint; its own record, never changes the tick | `complaints` |
| DIFOTIS | DIFOTIS | Delivered, In Full, On Time, In Specification | Dispatch Overview |
| Dispatcher | Operations | App + Dispatch access | `members.role` |
