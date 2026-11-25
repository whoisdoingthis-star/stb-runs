# Voice builds

Mike can ask for a change on a voice call, while driving, and have it built without typing ([decision 0065](decisions/0065-voice-builds.md)).

Work that needs Mike's laptop itself (its folders, projects not on GitHub) goes to the laptop's own queue instead ([decision 0070](decisions/0070-laptop-bridge.md)).

## How it works
1. **On the call,** Claude takes down what Mike asked for and adds it to a queue in the database (`build_requests`).
2. **Every ten minutes** a job on GitHub looks at the queue. If something is waiting, and it is not between **1 am and 8 am** New Zealand time (the runs are on), it starts.
3. **A builder** (a Claude agent) reads the project's rules, the lessons and the request, makes the change with its docs and tests, and commits it. It cannot publish, and it has no key to the database.
4. **The checks run.** The same ones as every other change.
5. **A reviewer** (a second Claude that hasn't seen the work being done) reads the request and the change cold and says **publish** or **hold**.
6. **Publish** only if the checks passed and the reviewer said publish. Otherwise nothing reaches the phones: the work is kept on a branch named `voice-build/<request>` and the reason is written to the queue.
7. **The result goes back to the queue:** what was built, the decisions made on Mike's behalf, and anything not proven. Claude reads it out on the next call, or it can be read in the chat.

## What it will not do
- **Change or delete live records, or change the live database at all.** The agents have no database key. A request that needs a new table or column is held with the exact change needed, for Claude to do with Mike in the chat.
- **Spend beyond the caps already set,** add a paid service, or add a secret.
- **Guess.** If the request doesn't say enough, it is held with the question.
- **Publish while the runs are on.** Requests made at 6 am start at 8.

## What it can't check
- **Screens.** The builder can't open the app in a browser there (the sample run sheet holds real addresses and isn't in the public repository), so a change to a screen is published on the strength of its tests and the review, and says so. Changes like that are worth a look in the chat afterwards.
- **Sound, and real phones.** As always.

## Mike's one-off set-up
The agents need a Claude key in this repository's secrets on GitHub. Either:
- **An Anthropic API key** (pay as you go): create one at console.anthropic.com → API keys, set a monthly spending limit there, and add it on GitHub as a repository secret named `ANTHROPIC_API_KEY`; or
- **A token from a Claude Pro or Max plan:** on a computer with Claude Code installed, run `claude setup-token`, and add the result as a repository secret named `CLAUDE_CODE_OAUTH_TOKEN`.

GitHub → the repository → Settings → Secrets and variables → Actions → New repository secret. Until one of them is there, requests simply wait in the queue. Never paste the key into a chat.

## Looking at the queue
In the Supabase table editor, `build_requests`: `status` is `queued`, `running`, `done`, `held` or `failed`; `summary` and `held_reason` say what happened; `run_url` is the job on GitHub. To run the job now, GitHub → Actions → Voice builds → Run workflow.

## Costs and limits
- Each build is capped at 150 steps for the builder and 40 for the reviewer, and an hour in all. One build runs at a time.
- What a build costs depends on its size; the monthly limit on the key is the backstop.
- A change published this way that adds one of Stan's lines is recorded in his voice by the usual job, under its usual cap.
