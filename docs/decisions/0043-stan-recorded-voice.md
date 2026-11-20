# 0043. Stan's recorded voice

- **Date:** 2026-11-21
- **Status:** Accepted for recording. Playing the lines on the phones is the next step and not done yet.

## Context
Stan already speaks ([0023](0023-stan-voice.md)): a voice that runs on the phone, so he can read out any address with no signal. Mike (21 Nov 2026) wanted his voice upgraded now that a voice generator (ElevenLabs) is connected to his account, as it was for Ollie, the family helper he calls Stan's sister.

By ear, over several rounds, Mike settled the character: an English accent to match Ollie; young; slightly robotic; and in the end not a butler but a small, earnest, slightly goofy underdog. He picked the third preview of a designed voice, then a lower-pitched version of it, and asked for a light robot finish with a touch of reverb.

A generated voice can only say what has been recorded in advance, unless every phone calls the voice service live (needs signal at 3 am, a delay, credits every morning, and customer addresses sent to another company).

## Decision
1. **A designed voice of his own.** "Stan v2 (Send The Boy)" in Mike's ElevenLabs voice library. Described, not cloned: it copies no person and no character.
2. **Fixed lines only, for now.** Greetings (one per family member by name), the plan, going on duty, leaving, runs done, late warnings, notes, the end-of-shift summary's reactions, bored lines, the game, his own words ("Stan-tastic!", "Goo-doo!", "Oki-doo!") and little noises ("Uh-huh", "Oopsie daisy"). They are listed in `js/stanlines.js`. **Reading out directions stays with his on-phone voice** until Mike decides otherwise, so for now Stan has two voices.
3. **His lines are his own.** No catchphrases from other characters; a test fails if one of the known ones is added. Two of Mike's suggestions were swapped for that reason.
4. **A small server piece records them** (`supabase/functions/stan-voice`): a dispatcher asks for a line; the function has the voice service say it, keeps the clip in a public storage bucket and notes it in `stan_lines`. The voice service's key is a secret set by hand in Supabase; it is never in this repository.
5. **Dispatch → Stan's voice** lists every line, plays it, and records the missing ones. If a line's words are changed in the code, it shows as needing recording again.
6. **The robot finish is added when a clip is played**, not recorded in (`js/stanfx.js`): a little reverb, a tight metallic ring, and optionally a slightly lower pitch. It is four numbers (currently "Light": 12-35-15-100), tuned by ear on `tools/voice.html`.

7. **How lines are used** (Mike, 21 Nov 2026, the same day: "the phrases can be recycled across other events, and we can use different phrases for the same event to keep him interesting"). Built as `STAN_MOMENTS` and `stanLine` in `js/stanlines.js`, tested:
   - **Lines belong to moments.** Each moment in the app (a run finishing, a new note, a shorter route) has a pool of lines, and a line can sit in as many pools as it suits.
   - **He doesn't repeat himself.** A moment's pool is used up before any line comes round again.
   - **Mood has to match.** Celebrations are marked; on a rough morning (late, slow, something went wrong) they are never used.
   - **He doesn't always speak.** Routine moments speak some of the time; big ones (everything done, running late, a new note) always do.
   The catalogue grew to 112 lines the same day.

## What it does not do yet
- The phones don't play these clips: wiring each line to its moment, and keeping the clips on the phone for when there's no signal, comes next.
- The clips are public files (anyone with the address can hear "Morning, Lisa"). They contain first names only.

## Consequences
The same clips can be used in videos and walkthroughs. Each recording spends credits on Mike's voice account (the first full set is under 2,000 characters). Before the voice is used outside the family, the plan's commercial-use terms need checking (see `docs/credits.md`).
