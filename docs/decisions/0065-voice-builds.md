# 0065. Voice builds: asked for on a call, built by one Claude, reviewed by another

- **Date:** 2026-11-23
- **Status:** Accepted

## Context
Mike's ideas come while he is driving the runs, and a voice call with Claude can talk but cannot change code. On 23 Nov 2026 he asked: "can we create a solution that can allow us to build from code, from voice". Offered a design where risky things stop for his approval, he said: "I would actually defer to you to review rather than prompting me because you understand the framework and the plan and the context and what it is I'm trying to achieve… just keeping the decisions that you've made in the decision log so that we can review it later… we're preserving the source of truth and the change logs and the decision logs and the docs as code governance. It's a fairly robust system that we can wind back if we ever hit a snag." He agreed two exceptions where Claude still stops for him: anything that changes or deletes live records in the database, and anything that spends money beyond the caps already set.

## Decision
1. **A queue in the database** (`build_requests`). On a call, Claude writes the request there. Only the server can add or change rows.
2. **A job on GitHub** checks the queue every ten minutes ([how it works](../voice-builds.md)). One build at a time.
3. **Two agents, with different jobs.** A **builder** makes the change to the project's standard and commits it. A **reviewer**, a second Claude with no sight of the work being done, judges the request and the change cold and says publish or hold. This is how "Claude reviews" is kept honest when nobody is watching: the work is not marked by whoever did it.
4. **Three locks before anything reaches the phones:** the builder finished without stopping, the checks pass when the job runs them itself, and the reviewer says publish. Anything less and the work is kept on a branch, unpublished, with the reason in the queue.
5. **Mike's two exceptions are built into what the agents can reach, not left to their judgement.** They have no database key, so they cannot touch live records or the live database; a request that needs either is held with the exact change needed. They cannot add secrets or services. Spending is bounded by step limits, an hour's limit, one build at a time, and the limit Mike sets on the key.
6. **Every decision an agent makes for Mike is a decision record,** dated, saying it was made on his behalf and why. The result written back to the queue lists them.
7. **Not while the runs are on.** Nothing is built or published between 1 am and 8 am New Zealand time.
8. **The instructions the agents follow are in the repository** (`tools/voice-build/`), so they change the way everything else does, and a lesson can change them ([0063](0063-lessons-loop.md)).

## Consequences
- The gate is weaker than a build done in the chat in one way: the agents can't open the app in a browser, so changes to screens are published on tests and review alone, and say so. If that bites, the fix is a made-up run sheet the browser tests can use in public.
- A second way to publish exists. It is bounded by what the agents can reach, and everything it does is a commit that can be reverted.
- The reviewer can be wrong. Its instruction is to hold when unsure: a hold costs a day, a bad publish costs a morning.
- It needs a Claude key in GitHub's secrets, which is Mike's to add; until then requests wait.
- Unproven until the first real request: that the agents run as configured on GitHub, and that a publish from this job reaches the phones the way an ordinary one does.
- Checked by `test/buildqueue.mjs` (when a build may publish; the quiet hours).
