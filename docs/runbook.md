# Runbook

## The runs aren't there in the morning
1. Open the app → **Get Runs** (date = today). Wait 3 minutes.
2. Still nothing: GitHub → **Actions → Fetch tomorrow's run sheets** → the latest run. The summary says what happened.
   - *Totals don't match*: the sheet is wrong or the layout changed. Download the PDF from RouteSmart, **Manually upload runsheet**, read the warnings, and save anyway only if you're satisfied.
   - *Sign-in failed*: check the RouteSmart password (see below). A screenshot is attached under **Artifacts**.
   - *Job didn't run at all*: GitHub pauses schedules after 60 days without activity; re-enable the workflow on the Actions page.
3. Fallback always works: download from RouteSmart, **Manually upload runsheet**.

## A change was phoned in after 7pm
**Get Runs** for that date. When the sheets land you get "Run 13: 2 details changed" or "No details changed"; **What changed** on the run card lists them. Ticks are kept.

## Get Runs shows an error
| Message | Fix |
|---|---|
| `GITHUB_DISPATCH_TOKEN is not set` | Add the token in Supabase → Edge Functions → Secrets ([setup](setup.md#4-get-runs-button)). |
| `GitHub refused the request (401/403)` | The token expired or lost access. Make a new one, replace the secret. |
| `Invalid JWT` | Turn off *Verify JWT with legacy secret* on the `refetch` function. |
| `This login is not on the family list` | Add them on the Users tab (or switch them back on). |
| Started, but nothing changed after 5 minutes | Look at the job in GitHub Actions (as above). |

## A phone shows an old version
Close the app fully and reopen (twice if needed). The bottom bar colour on Android is fixed at install: remove and re-add the icon to change it.

## Add a family member, change access, forgotten password
Dispatch dashboard → **Users** ([dispatch guide](dispatch-guide.md#users)). If the dashboard itself is unreachable, the same can be done in Supabase: Authentication → Users (login), and the `members` table (name, role, active).

## Locked out of dispatch
If no dispatcher can sign in: Supabase SQL editor → `update public.members set role = 'dispatcher', active = true where email ilike '<your email>';`

## Change a password or key
| What | Steps |
|---|---|
| RouteSmart password | Change it in RouteSmart, then GitHub **Settings → Secrets → Actions → `ROUTESMART_PASSWORD`** → update. |
| Supabase secret key | Supabase **Project Settings → API Keys** → create a new secret key, update GitHub secret `SUPABASE_SERVICE_ROLE_KEY`, run the fetch once (dry run) to test, then revoke the old key. |
| GitHub dispatch token | Regenerate in GitHub, update Supabase secret `GITHUB_DISPATCH_TOKEN`. |

## Change the database
Edit `sql/schema.sql` (re-runnable), run the new part in the Supabase SQL editor, update [data model](data-model.md), `npm run check`, commit. See [CONTRIBUTING](../CONTRIBUTING.md).

## Find a delivery photo
Supabase **Storage → delivery-photos → date → route**. The `photos` table lists who took each one, when and where.

## Known open items
- Rotate the Supabase secret key: it was shown in a screenshot during setup (8 Nov 2026). Kept for the proof of concept by choice.
- Change the RouteSmart password: it was shared in a chat during setup (8 Nov 2026), and may be a shared login.
- Photos that fail to upload with no signal are only retried while the photo screen is open.
