# Contributing: docs as code

Documentation that lives somewhere else goes stale within a day. Here it lives in
the same repository as the code, changes in the same commit as the code, and is
checked automatically like the code. These rules apply to every change, whoever
(or whatever) makes it: Mike, a developer, or Claude.

## The rules

1. **Docs change with the code, in the same commit.** If a change alters what
   someone sees, does, or relies on, the matching page in `docs/` changes too.
   A change is not done until its documentation is.
2. **Every change gets a line in [CHANGELOG.md](CHANGELOG.md)** under
   *Unreleased*, written for the family, not for programmers ("Street names
   are now bold banners"), with the technical detail after it if useful.
3. **Business rules are written down before they are coded.** Anything Mike or
   the family tells us about how the runs work (NZHR = NZH to a shop plus a
   docket, Run 8's banks, complaint codes) goes into
   [docs/business-rules.md](docs/business-rules.md) or
   [docs/run8-village.md](docs/run8-village.md), with the date and who said it.
4. **Decisions get a record.** A choice someone might later question (a design
   trade-off, a tool, a security shortcut) gets a short file in
   [docs/decisions/](docs/decisions/), numbered, never deleted, never
   rewritten (only its Status line may change). If it is reversed, write a new
   one that supersedes it.
4b. **Requirements have IDs.** A new requirement gets the next ID in
   [docs/requirements.md](docs/requirements.md) with the test that proves it;
   IDs are never reused. Naming the test after its ID (`RB-011 …`) helps.
5. **The database is defined in one place.** Every database change goes into
   `sql/schema.sql` (re-runnable: `if not exists`, `drop policy if exists`) in
   the same commit, and [docs/data-model.md](docs/data-model.md) is updated.
   A change run by hand in the Supabase SQL editor must be copied into
   `schema.sql` before the commit is pushed.
6. **No secrets or personal details in the repository.** It is public (GitHub
   Pages needs that on the free plan). No passwords, keys other than the
   publishable key, family email addresses, door codes or customer details.
   Secrets live in GitHub Actions secrets and Supabase secrets; door codes live
   in the database.
7. **Ship a version bump.** Any change to files the phones load means bumping
   `VERSION` in `sw.js`, so phones pick up the new copy.

## What the checks enforce

`npm run check` locally, and [CI](.github/workflows/ci.yml) on every push and pull request:

| Check | Fails when |
|---|---|
| Tests (`npm test`) | Parser, sequencing, Run 8 layout, change detection or database security tests fail |
| Docs links | A relative link in any Markdown file points at a file that does not exist |
| Data model | A table in `sql/schema.sql` is not described in `docs/data-model.md` |
| Requirements | An ID is used twice, or a test named as evidence in `docs/requirements.md` no longer exists |
| Decisions | An existing record in `docs/decisions/` is deleted or rewritten beyond its Status line (`[decision-fix]` in the commit message allows a typo fix) |
| Changelog | `CHANGELOG.md` has no *Unreleased* section |
| Docs gate | Code changed (`js/`, `sql/`, `fetcher/`, `supabase/`, `index.html`, `styles.css`, `sw.js`, workflows) but neither `docs/` nor `CHANGELOG.md` did |
| Version bump | Files the phones load changed but `VERSION` in `sw.js` did not |
| Secrets scan | Something that looks like a secret key, a GitHub token or a password assignment is committed |

A change that genuinely needs no documentation (a typo fix in a comment, say)
can say so by including `[no-docs]` in the commit message; the docs gate then
lets it through. Use it rarely.

## Definition of done

- [ ] Works on a phone (or demo mode) and `npm run check` passes
- [ ] Follows the [design guide](docs/design.md): tokens only, checked in Night, Day and big text
- [ ] The affected docs pages are updated, and the family guide if anything on screen changed
- [ ] CHANGELOG.md has a line under *Unreleased*
- [ ] Database changes are in `sql/schema.sql` and `docs/data-model.md`
- [ ] New business rules or decisions are written down
- [ ] `VERSION` in `sw.js` bumped if phone files changed
- [ ] Nothing secret or personal in the diff

## Releasing

Pushing to `main` publishes the app (GitHub Pages) within about a minute. When a
batch of changes has been trialled, move the *Unreleased* changelog entries under
a dated heading. Once the trial is over, the plan is to protect `main` and make
changes through pull requests that Mike approves (see
[decision 0009](docs/decisions/0009-docs-as-code.md)).
