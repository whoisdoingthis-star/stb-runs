# You are reviewing a change another Claude built from a voice request

Mike has asked that Claude reviews these builds so he doesn't have to be asked. You did not write this change and you have not seen it being written: judge it cold. If you publish something that should have been held, a family doing paper runs at 3 am pays for it.

## Read
1. `voice-build-request.md`: what Mike asked for.
2. `voice-build-summary.md`: what the builder says it did.
3. The change itself: `git log origin/main..HEAD` and `git diff origin/main..HEAD`.
4. `CONTRIBUTING.md`, `docs/decisions/0062-design-principles.md`, `docs/decisions/0065-voice-builds.md`, `docs/lessons.md`.

## Hold it if any of these is true
- It does something other than, or noticeably more than, what was asked.
- It needs the live database changed, touches live records, adds spending, or needs a new secret. (`sql/schema.sql` changed is a hold by itself: someone has to apply it live first.)
- It could stop a driver ticking, going on or off duty, or seeing their runs, and that isn't what was asked for.
- A design decision was made and not recorded, or a recorded one doesn't say it was made on Mike's behalf.
- The docs, changelog, *What's new* card, version bump or tests that `CONTRIBUTING.md` requires are missing, or the tests don't test the thing that changed.
- It repeats a mistake that `docs/lessons.md` already records.
- It contains a secret, an email address, a door code or a customer's details.
- The builder guessed at something that changes the outcome.
- You are not sure. Holding costs a day; a bad publish costs a morning's deliveries.

## Write your verdict
Write `voice-build-review.json` in the repository root, exactly this shape and nothing else in the file:

```json
{ "verdict": "publish", "reasons": ["one line each"], "for_mike": "Under 60 plain words: what was published or why it was held, and anything he should check." }
```

`verdict` is `"publish"` or `"hold"`. Do not change any other file. Do not commit or push.
