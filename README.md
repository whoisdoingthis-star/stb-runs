# Send The Boy · Runs

Load the carrier's run sheet PDF on a phone, share a run by text, tap each
delivery as it's done. Every tap is stamped with who, when and GPS position,
building up the real delivery order for later sequencing.

- Plain static web app: no build step, runs on any phone browser (Android Chrome, iPhone Safari).
- The PDF is read **on the phone**. Totals are checked against the key report before anything is saved.
- Shared live through Supabase, behind a family-only login.
- Works offline once opened; taps queue on the phone and send when there's signal.

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | The page |
| `config.js` | **Your Supabase URL and key go here** (empty = demo mode, phone-only) |
| `js/parser.js` | Reads the PDF by position and checks totals |
| `js/store.js` | Saving runs and taps (Supabase or phone-only) |
| `js/geo.js` | GPS while a run is open |
| `js/sequence.js` | Your own delivery order per route (hold-and-drag) |
| `js/village.js` | Route layouts: Run 8 (Bruce McLaren Village) building order, mailbox banks, reception handover |
| `js/app.js` | Screens |
| `js/rows.js` | Builds database rows from a parsed sheet (shared with the fetcher) |
| `fetcher/` + `.github/workflows/` | Evening fetch of tomorrow's run sheets from RouteSmart |
| `sql/schema.sql` | Database tables and security rules, run once in Supabase |
| `vendor/` | pdf.js and supabase-js, stored locally so nothing loads from other sites |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline + "Add to Home Screen" |
| `test/` | Parser tests (`node test/unit.mjs`, `node test/parse-cli.mjs report.pdf`) |

## Setup (about 20 minutes, once)

### 1. Supabase
You can use your existing STB project or create a separate free one. A separate
one keeps this tool independent until it's folded into STB.

1. **SQL Editor → New query** → paste all of `sql/schema.sql` → **Run**.
2. **Authentication → Sign In / Providers → Email**: keep Email on, turn **"Allow new users to sign up" off**.
   (Turning off "Confirm email" is fine too, since you create the users yourself.)
3. **Authentication → Users → Add user → Create new user**: one for each of you, with a password. Tick "Auto confirm".
4. Back in **SQL Editor**, add the same emails to the family list:
   ```sql
   insert into public.members (email, display_name) values
     ('you@example.com',  'Mike'),
     ('lisa@example.com', 'Lisa'),
     ('mum@example.com',  'Mum');
   ```
   The display name is what shows on ticked tiles ("Lisa 6:42 am").
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key** into `config.js`.
   The anon key is meant to be public; the database rules are what lock it down.

### 2. Hosting (pick one)

**GitHub Pages** (free, fixed address):
1. New repository (e.g. `stb-runs`), upload all files in this folder (not `node_modules`).
2. **Settings → Pages → Deploy from a branch → main / root**.
3. Your app is at `https://<your-username>.github.io/stb-runs/`.

**Vercel or Netlify**: drag the folder onto their dashboard. Same result.

It must be **https**, which all three give you. GPS and offline mode need it.

### 3. On each phone
- Open the address, sign in once, then **Add to Home Screen** (Safari: Share → Add to Home Screen; Chrome: ⋮ → Add to Home screen / Install).
- Allow location when asked.
- **iPhone note:** links tapped in Messages open in Safari, not the home-screen icon, and Safari keeps its own sign-in. Sign in once in Safari too, or just use Safari.

## Using it
- **Load run sheet (PDF)**: pick the report from Files or the email attachment. One PDF can hold several routes. You'll see each route's totals checked against the report, plus anything flagged (new starts, complaints, weekday notes that don't match the delivery day, every address is one tile: all its publications sit on it as coloured chips, and a publication listed more than once is added together and marked "Combined"). Loading the same route and date again replaces the sheet and keeps ticks.
- **Text link**: opens the share sheet (Messages, WhatsApp…) with a link to that run. "Text all" sends every route for that date in one link.
- **Tap a tile**: it turns green, with your name and time. Tap again to undo, or use **Undo** on the pop-up.
- **Hold to move**: hold a tile (or a street name, to move the whole street) for half a second until it lifts, drag it, let go. A blue bar shows where it will land. Each move has **Undo**. The new order is saved for that route and used for every future sheet of the same route, for everyone. New addresses slot in next to their neighbour from the sheet. Use ••• to switch between your order and the sheet's, or to reset to the sheet's order. (Moving is turned off while "To do only" or a search is on, so you can see where things land.)
- **Floating bar** at the top stays put while you scroll: progress, copies, and a running clock from the first tick (anyone's). After a few ticks it estimates time to go; when the run is complete it shows the total time. Tap it to jump back to the top.
- **Working a run together**: anyone who opens the same run (e.g. from the texted link) works the same live list. Ticks appear on every phone within a second or two, the tile flashes, and the bar shows who did what ("Lisa ✓ 22 Selwyn Road"). A "With Lisa" chip shows who else has the run open. If two people tick the same tile it simply stays ticked; the latest tap wins. Ticks made with no signal appear for everyone once that phone is back online.
- **To do only** hides finished ones.
- **Publication colours**: NZH plain; NZHR amber; LIS purple; WW pink; SST blue; SSTR dark teal; TVG bright orange. Any new code gets its own colour automatically. **Find** searches number, street and notes. The screen stays awake while a run is open.
- Chips at the top: GPS accuracy, and whether taps have been sent ("3 to send" means no signal yet, which is fine).

## Evening fetch: run sheets load themselves
A GitHub Actions schedule (`.github/workflows/fetch-run-sheets.yml`) fetches tomorrow's run sheets from RouteSmart Optimize every evening and loads them into the app. Nobody downloads or uploads anything; tomorrow's runs are just there in the morning.

**What it does** (`fetcher/fetch-run-sheets.mjs`):
1. From 19:05 NZ, every 15 minutes until about 21:50, it checks whether tomorrow's runs are already loaded. If so it stops in seconds.
2. Otherwise it signs in to RouteSmart through the real login page in a hidden browser, then asks the report service directly for tomorrow's sheets (workspace 17, `<DAY>_DRAW`, HOWICK06/08/10/11/13, "NZME Daily Activity" + "NZME Delivery List").
3. It reads the PDF with the app's own parser and checks every total, then saves each run (replacing an earlier load of the same route and date, keeping ticks). The PDF is kept in Supabase storage (`run-sheets` bucket).
4. **A run whose totals don't match is never loaded automatically**: the job fails, GitHub emails you, and you load that sheet by hand after checking.
5. Early in the evening, a hiccup (sheet not ready, site slow) just waits for the next attempt. If it still fails after 21:30, GitHub emails you, so you know to load the sheet by hand.

**Setup (once)**, in the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**, add:
| Secret | Value |
|---|---|
| `ROUTESMART_USERNAME` | the RouteSmart username |
| `ROUTESMART_PASSWORD` | the RouteSmart password (**change it first**; the old one was shared in a chat) |
| `SUPABASE_URL` | Project URL (Supabase → Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key (same page). Secret: only ever put it here, never in `config.js`. |

Then **Actions → Fetch tomorrow's run sheets → Run workflow** (tick "Dry run" the first time) to test it straight away. Each run shows a short summary (runs, copies, totals) on its page.

**Things to know**
- To change routes or reports, edit the defaults at the top of `fetch-run-sheets.mjs` (or add `RS_ROUTES` / `RS_REPORTS` as repo variables).
- GitHub pauses scheduled workflows in a repo with no activity for 60 days. It emails a warning first; one click re-enables it.
- If RouteSmart changes their login page, the job fails with a screenshot attached (Actions → the failed run → Artifacts), which shows what changed.
- Failure emails go to the GitHub account that owns the repo: GitHub → Settings → Notifications → Actions.

## Run 8: Bruce McLaren Village
Run 8 (HOWICK08) follows its own rules (Run 8 Operational Rules and Decisions v1.0), applied when the run is shown; the stored run stays exactly as the sheet:
- **Fixed building order**: Amon → Hulme → Monaco → Austin → Reception handover, whatever order the sheet uses. Moving tiles is switched off for this run.
- **Door codes** show on each building header. Enter them once: open Run 8, ••• → **Door codes…**. They're stored in Supabase behind the login (never in the app's files, which are public), shared with the family, and every change is logged in `access_code_history`.
- **Units sorted by number** within each building, prefixes kept (249 then IA/249).
- **Hulme and Monaco mailbox banks** as sub-headings (Hulme Bank 1 = 140–144, 240–254, 340–351; Hulme Bank 2 = 352–354 and 440–450; Monaco Bank 1 = 274–286, 374–386, 474–486, 160–164; Monaco Bank 2 = 165, 260–273, 360–373, 460–473 — all from the 8 Nov photos, which outrank the old range map). Units not on the bank map are listed under **"Not on the bank map: check"** rather than guessed; a unit on the edge of two banks (Hulme 253) is marked **Check bank**.
- **Reception / Care Centre / Serviced Apartments** = one tile, one tap, with the full list of who's in it. The three not-routed items (Rooms 145, 236, SA103) are included and marked. One tap records every paper in the bundle (same time and GPS), so the audit keeps each one.
- Progress counts the handover as one stop; copies count every paper.
- The load screen shows building totals (e.g. Amon 11 · Hulme 13 · Monaco 17 · Austin 4 · Reception 27 = 72) and confirms every sheet line was placed exactly once.
- To change bank maps, building names or order: edit `js/village.js` (no codes in there).

## What gets recorded per tap (`tap_events`)
`run_id, line_key, address_key, route, done, user_name, device_time, server_time, lat, lng, accuracy_m, fix_age_ms, device`

- `address_key` is the same letterbox every day: `HOWICK|UXBRIDGE ROAD|1/71`. Sequence learning groups on this.
- Taps are never changed or deleted, and runs with taps can't be deleted, so history builds up.
- `address_positions` (a database view) already averages good GPS fixes per letterbox.
- `route_sequences` holds each route's current custom order; `route_sequence_history` logs every change (who and when).

## Updating the app later
Change files, bump `VERSION` in `sw.js`, upload. Phones pick it up next time they open it with signal.

## Known limits
- Built for the "Transaction Processing" key report + "Delivery List by Sequence" layout. A different report layout would need parser changes; the totals check will catch it rather than silently getting it wrong.
- GPS is only captured while the app is open on screen (true for any web app).
- No partial delivery on bulk lines yet: one tap = the full quantity.
