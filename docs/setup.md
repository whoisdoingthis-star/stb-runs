# Setup from nothing

About an hour, once. The live system is already set up this way (8 Nov 2026); use this to rebuild it or to fold it into STB proper.

## 1. Supabase
1. Create a project (free tier is fine). **SQL Editor → New query** → paste all of `sql/schema.sql` → **Run**.
2. **Authentication → Sign In / Providers → Email**: keep Email on, turn **Allow new users to sign up** off.
3. **Authentication → Users → Add user**: one per family member, with a password, auto-confirmed.
4. Add the same emails to the family list in the SQL editor (real emails stay out of the repository):
   ```sql
   insert into public.members (email, display_name) values ('someone@example.com', 'Lisa');
   ```
5. **Project Settings → API**: copy the Project URL and the publishable key into `config.js`.

## 2. Hosting (GitHub Pages)
Repository **Settings → Pages → Deploy from a branch → main / root**. The app is at `https://<user>.github.io/<repo>/`. It must be https (GPS and offline need it).

## 3. Evening fetch
Repository **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `ROUTESMART_USERNAME` | RouteSmart username |
| `ROUTESMART_PASSWORD` | RouteSmart password |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key (Project Settings → API Keys). Only ever here, never in `config.js`. |

Test: **Actions → Fetch tomorrow's run sheets → Run workflow** with *Dry run* ticked. Routes and reports are set at the top of `fetcher/fetch-run-sheets.mjs` (or repo variables `RS_ROUTES`, `RS_REPORTS`).

## 4. Get Runs button
1. Supabase **Edge Functions → Deploy a new function → Via editor**, name `refetch`, paste `supabase/functions/refetch/index.ts`, deploy.
2. GitHub **Settings → Developer settings → Fine-grained tokens**: repository = this repo only, permission **Actions: Read and write**.
3. Supabase **Edge Functions → Secrets**: add `GITHUB_DISPATCH_TOKEN` = that token.
4. If the button reports "Invalid JWT", turn off *Verify JWT with legacy secret* on the function (it checks membership itself).

## 5. Phones
See the [family guide](family-guide.md#first-time-on-a-phone).

## Developing
```sh
npm install
npm run check          # tests + documentation checks (same as CI)
python3 -m http.server 8765   # then open http://localhost:8765 with an empty config.js for demo mode
```
Browser tests (`test/e2e*.py`, Playwright) and real-sheet tests (`node test/village.mjs <sheet.pdf>…`) need sample run sheets, which contain customer addresses and are therefore kept out of the repository.
