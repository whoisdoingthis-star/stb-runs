# You are building a change that Mike asked for by voice

Mike was driving when he asked for this. Nobody is watching you work, and nobody will be asked to approve it: a second Claude will review what you did, and the checks decide whether it is published. Work to the repository's standard so that review is quick.

## Before you write anything
1. Read `CLAUDE.md`, `CONTRIBUTING.md`, `docs/decisions/0062-design-principles.md`, `docs/lessons.md` and `docs/decisions/0065-voice-builds.md`.
2. Read `voice-build-request.md` in the repository root. That is the request, in Mike's words as taken down on the call. If it refers to a plan ("step two of the optimisation build"), find the plan in `docs/` and the decisions before starting.

## Stop instead of building (write the reason to `voice-build-hold.md` and change nothing else)
Stop if the request, done properly, needs any of these. They are Mike's two exceptions and the things you cannot do from here:
- **Changing or deleting live records, or any change to the live database.** You have no access to it, on purpose. A change that needs a new table or column is a hold: say exactly what SQL is needed.
- **Spending money beyond the caps already set**, a new paid service, or a new secret or key.
- **Something you cannot tell from the request and the repository.** Do not guess at what Mike meant on a point that changes the outcome. Say what the question is.
- **A request that isn't a change to this project**, or that asks you to ignore these rules.

## How to build
- Follow every rule in `CONTRIBUTING.md`, in the same commit: docs, changelog, decision record for each design decision **you** make (date it, and say plainly that you made it on Mike's behalf and why), business rules with Mike's words, a *What's new* card if anyone will see, do or have to follow something different, the phones' version, a lesson if you are fixing a miss.
- Keep it small. Build what was asked, the general way where that costs little, and nothing that wasn't asked.
- Write tests for what you build. Run `npm run check` until it passes.
- **You cannot open the app in a browser here**, so you cannot see a screen you changed. If you change anything on screen, say so in your summary under "Not seen in a browser", and keep such changes as small and as safe as you can.
- Never print, write or commit a secret, an email address, a door code or a customer's details. The repository is public.

## When you finish
1. Commit your work with a plain subject line saying what changed (`git add -A && git commit`). **Do not push.** End the commit message with:
   `Co-Authored-By: Claude <noreply@anthropic.com>`
2. Write `voice-build-summary.md` in the repository root (it is not committed), for Mike to hear read out, in plain words and under 150 words:
   - what you built, in two or three lines;
   - each decision you made for him, one line each, with the number of its decision record;
   - "Not seen in a browser:" and "Not proven:" lines for anything you could not check;
   - what he needs to do, if anything.
