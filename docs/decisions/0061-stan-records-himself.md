# 0061. Stan records his own new lines when a change is published

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
Stan's lines are written in the code and recorded in his voice by pressing a button on **Dispatch → Set-up → Stan's voice** ([0043](0043-stans-recorded-voice.md)). With *What's new* read aloud ([0060](0060-whats-new-read-aloud.md)) every change now brings a new line, and each would wait for Mike to press the button. Mike (22 Nov 2026): "I need a way for us to use Stan's new voice, which can download from ElevenLabs, without me needing to approve or stage the file then upload… this functionality is critical for where we are developing towards, having Stan become more and more customisable."

## Decision
1. **A job on GitHub records what's missing after each publish** that touches Stan's lines or the *What's new* cards (`.github/workflows/record-stan.yml`, running `tools/record-stan.mjs`). It compares the lines in the code with the ones already recorded and asks the existing `stan-voice` function to record each new or reworded one. A few minutes after a publish, Stan can say it. It can also be run by hand from GitHub's Actions tab, with a dry run that only lists what it would do.
2. **No new keys.** The job uses the Supabase server key GitHub already holds for the evening run-sheet fetch. The ElevenLabs key stays where it was, in Supabase; the job never sees it.
3. **The function has a second way in.** `stan-voice` still accepts a signed-in dispatcher (the button stays as the fallback). It now also accepts the project's server key in an `x-server-key` header, and proves the key by using it for something only a server key can do. Such recordings are noted as made by "Stan (auto)". The function is deployed with the gateway's own sign-in check off, because it checks for itself in both cases.
4. **A cap on every run:** at most 60 lines and 9,000 characters, new lines before reworded ones. Anything held back is done on the next run. Three failures in a row stop the run. Behind that is the ElevenLabs key's own cap of 20,000 credits.

## Consequences
- Credits are spent without anyone clicking. Rewording a line costs its characters again.
- If the ElevenLabs key's cap is reached, recordings fail quietly: the job shows red on GitHub, the Stan's voice page shows what's missing, and the phones show the words without the voice. Raising the cap is Mike's to do in ElevenLabs.
- The server key can already do anything in the database, so accepting it here adds no new exposure; but it is one more reason to rotate it before anyone outside the family has access (already on the list).
- This is the piece that lets Stan's voice follow the code. Per-person or per-run custom lines would need the text to live in the database rather than the code; the function already takes any text, so that is a later step, not a rebuild.
- Checked by `test/stanlines.mjs` (what a run would record, and the caps). The job itself can only be proven on GitHub: the first publish after this is the test.
