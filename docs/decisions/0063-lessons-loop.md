# 0063. Fix it twice: a miss changes the standard

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
The standard for this project lives in the repository ([0062](0062-design-principles.md)), so that an agent or platform handed a job is held to it without being briefed each time. Mike (22 Nov 2026): "how can we ensure that any output created that falls outside of spec, or an unintended output or outcome, updates or adjusts the standard so that future outputs are better aligned to standard intention?"

It had been happening informally, and the strongest checks came from it: the test for the live store's fallbacks came from "Got it" not saving; gating a publish on the checks came from overwriting Stan's voice file. But those lessons were in working notes and commit history, where a fresh agent wouldn't read them, and whether a miss led to a change depended on someone remembering to make one.

## Decision
1. **A miss is fixed twice:** once in the output, and once in whatever let it through. The second fix is recorded in [docs/lessons.md](../lessons.md), in the same commit as the first.
2. **Each lesson says** what happened and what was meant, how it was noticed, what let it through (the standard didn't say · the standard said but nothing checked · the check was there and was skipped), and what changed in the standard.
3. **The order of preference for the change:** a **check** that would have caught it (it can't be forgotten); then a **rule** (the contributing guide, a decision, a business rule) where a machine can't check; then a **note** for whoever does this next, where it is judgement.
4. **Or nothing, said out loud.** A one-off that deserves no rule says `[no-lesson]` in the commit message. Not every miss earns a rule: a standard nobody can hold in their head stops being followed.
5. **Enforced like the docs.** The publish checks fail when a commit says it fixes something and the lessons page didn't change and `[no-lesson]` isn't there. They also fail if lessons are misnumbered or one goes missing.
6. **Read first.** The notes for AI assistants now say to read the lessons before starting work, so an agent begins with what has already gone wrong here.
7. **Seeded with twelve real ones** from 19–22 Nov 2026. Three of them changed the standard in this same commit: every decision must be in the index (L-005), every store method the app calls must exist in the live app (L-011), and `npm run check:push` applies before pushing the commit-range rules that GitHub applies after (L-012).

## Consequences
- The check goes by how a commit describes itself. A fix described as something else passes unnoticed; that is a matter of habit, and of whoever reviews.
- This loop only catches misses somebody notices. Misses nobody has noticed need a different tool: an independent look at work already published, now and then.
- Process misses count as much as code ones: two of the first twelve are about people not knowing a rule or a feature, and their fix was to the way changes are told, not to the code.
- The page will grow. Lessons are never deleted; when the list is long, older ones whose check has held can be folded into a short summary with a link to the history.
