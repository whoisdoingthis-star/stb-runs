# Send The Boy · Runs

A phone web app for the family's newspaper delivery runs (Howick 06, 08, 10, 11, 13).
Each evening the run sheets load themselves from RouteSmart, every total is checked,
and on the morning the drivers tap each delivery as it's done. Every tap is stamped
with who, when and GPS, which builds up the real delivery order for later sequencing.

This is the proof of concept for Send The Boy (STB). It is built to be folded into
the full project, so the documentation lives here with the code and changes with it.

## Documentation

| Read this | When |
|---|---|
| [Family guide](docs/family-guide.md) | Using the app on a run: plain words, no tech |
| [Business rules](docs/business-rules.md) | How the sheets are read: publications, retail and dockets, complaints, colours, what counts as a change |
| [Run 8: Bruce McLaren Village](docs/run8-village.md) | Run 8's own rules: building order, mailbox banks, reception handover, door codes |
| [Architecture](docs/architecture.md) | How the pieces fit: RouteSmart → GitHub Actions → Supabase → phones |
| [Data model](docs/data-model.md) | Every table, what it holds, who can see it |
| [Setup](docs/setup.md) | Building it from nothing: Supabase, hosting, secrets, phones |
| [Runbook](docs/runbook.md) | When something goes wrong, and routine jobs (keys, new family member, schema changes) |
| [Decisions](docs/decisions/) | Why things are the way they are (one short record per decision) |
| [Changelog](CHANGELOG.md) | What changed, when |
| [Contributing](CONTRIBUTING.md) | **The docs-as-code rules every change follows** |

## Quick facts
- Plain static web app, no build step: `index.html`, `styles.css`, `js/`. Hosted on GitHub Pages: <https://whoisdoingthis-star.github.io/stb-runs/>
- Data, logins and live updates: Supabase (project `stb-runs`, Sydney). Family-only: sign-ups are off and every table is locked to the members list.
- Evening fetch: `.github/workflows/fetch-run-sheets.yml` runs `fetcher/fetch-run-sheets.mjs`.
- In-app **Get Runs** button: Supabase Edge Function `supabase/functions/refetch` starts that same job.
- Checks: `npm install && npm run check` runs the tests and the documentation checks. GitHub runs the same on every change ([ci.yml](.github/workflows/ci.yml)).

## Files

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | The page |
| `config.js` | Supabase URL and publishable key (empty = demo mode, phone-only) |
| `js/app.js` | Screens |
| `js/parser.js` | Reads the PDF by position, checks totals, flags complaints/starts/stops |
| `js/rows.js` | Database rows from a parsed sheet, and what-changed detection (shared with the fetcher) |
| `js/store.js` | Saving runs, taps, photos (Supabase, or phone-only in demo mode) |
| `js/geo.js` | GPS while a run is open |
| `js/sequence.js` | Your own delivery order per route (hold and drag) |
| `js/village.js` | Run 8 layout: building order, mailbox banks, reception bundle |
| `fetcher/` | Evening fetch from RouteSmart (runs on GitHub Actions) |
| `supabase/functions/refetch/` | Edge Function behind the Get Runs button |
| `sql/schema.sql` | The whole database, re-runnable. The source of truth for tables and security |
| `vendor/` | pdf.js and supabase-js, stored locally |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline and home-screen install |
| `test/` | Automated tests (`npm test`), plus browser tests and sheet tests that need real PDFs |
| `tools/check-docs.mjs` | Documentation checks (`npm run docs:check`) |
| `docs/` | Documentation |
