# 0047. Stan talks: his recorded voice in the app

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Stan's new voice was designed and all 112 lines recorded on 21 Nov 2026 ([0043](0043-stan-recorded-voice.md)). Mike listened and approved it ("He sounds great!"). The rules for using lines were agreed the same day: shared between moments, varied, matched to the mood, and not on every occasion.

## Decision
1. **Where he speaks.** `stanMoment(moment)` in the app picks a line by those rules, plays it, and hands back the words, which go on the screen wherever there is a message to put them in:
   - going on duty (his greeting by name, then his question), leaving the depot, a run done, everything done, going off duty;
   - the end-of-shift summary (he says the same lines the card shows);
   - a new note or pinned rule, the day plan's first showing, the spares and odometer sheets, the "already ticked" question, and when he gets bored.
2. **His clips live on the phone.** A few seconds after the app opens with signal, it fetches any clip it doesn't hold, or that has been recorded again, into the phone's own store (about 4 MB in all). After that he speaks with no signal.
3. **The robot finish** is added as each clip plays ([0043](0043-stan-recorded-voice.md)).
4. **Never in the way.**
   - Sound can only start after a tap, so he says nothing out loud when the app is merely opened.
   - He never talks over the Driver Assistant reading directions.
   - A rough morning (past the deadline, within five hours of it, with ticks made) gets no celebration lines.
   - If a clip isn't on the phone, or anything fails, he is quiet and the words still show.
5. **A switch.** *Settings → Stan talks*: **Out loud** (the default) or **Quiet**. Quiet keeps his words on screen. Switching Stan off altogether still switches everything off.
6. **Two voices, for now.** The Driver Assistant's directions and "Chat with Stan" keep his original on-phone voice ([0023](0023-stan-voice.md)), because they say things that can't be recorded in advance.

7. **Sounds default to on** (Mike, 21 Nov 2026: "I'd prefer default option is voice and sounds on, then select off if wanted"). Stan's voice was already on by default; the opening chimes now are too. This reverses the "off unless switched on" part of [0016](0016-opening-animation.md), which was chosen because runs start before dawn. Each is still switched off per phone in Settings, and a phone that had chosen Silent stays silent.

## What it does not do
- He doesn't yet say which run finished ("Run six. Done." is recorded but not wired), or speak in the game, or use the route and kilometre lines: those wait for the features they belong to.
- He doesn't read out numbers or anything that changes.

## Consequences
The phones make one small request for the list of clips when they open, and download the clips once. A line re-recorded in Dispatch reaches each phone the next time it opens with signal.
