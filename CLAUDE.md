# Notes for Claude (and any other AI assistant) working in this repository

Follow [CONTRIBUTING.md](CONTRIBUTING.md). In short, every change you make must, in the same commit:

1. Update the matching page(s) in `docs/`. If anything on screen changed, update `docs/family-guide.md` in plain words.
2. Add a line to `CHANGELOG.md` under *Unreleased*.
3. Put database changes in `sql/schema.sql` (re-runnable) and describe them in `docs/data-model.md`.
4. Record new business rules (`docs/business-rules.md`, `docs/run8-village.md`) with the date and who stated them, and record design decisions in `docs/decisions/`.
5. Bump `VERSION` in `sw.js` when files the phones load change.
6. Run `npm run check` before pushing. Do not push if it fails.

Never commit secrets, family email addresses, door codes or customer details: the repository is public.
When running SQL by hand in Supabase, apply the same SQL to `sql/schema.sql` before pushing.
Write for the family: they are not programmers. Mum reads the app in big text.
