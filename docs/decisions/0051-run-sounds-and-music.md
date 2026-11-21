# 0051. Sounds on a run, a nudge at stops that aren't routine, and Stan over the phone's music

- **Date:** 2026-11-21
- **Status:** Accepted

## Context
Mike (21 Nov 2026) asked for sound effects on events, for the design to keep people out of "autopilot mode errors", and for Stan's voice and sounds to "override any music" on the phone, "exclude this rule when on a phone call". He then agreed the plan and asked for each step to be built and published once its tests pass.

Autopilot is the real risk on a paper run: two hundred identical taps, and the one stop that is different (two papers, a stop, a complaint) gets the same tap as the rest.

## Decision
1. **Sounds are made on the phone**, a few soft notes each, with no sound files and no tune taken from anywhere (`js/sfx.js`):
   - **a tick**: one short note. Ticks climb a five-note scale, one step per stop, and start again after 45 seconds without a tick (a drive, a new street). A row of ticks sounds like getting somewhere, and a break in the pattern is something the ear notices;
   - **an untick**: two notes falling;
   - **a problem at a stop** (couldn't deliver, short): two low notes and a longer buzz. It is nothing like a tick, on purpose;
   - **a run done** and **all runs done**: a short rising phrase.
2. **The nudge.** When the stop you have just ticked is followed by one that isn't a plain paper in the box, the app plays three quick high notes, buzzes twice and pulses that tile's edge. "Not plain" means: more than one paper, a stop or restart, a new start, a complaint, or a bank to check. Everyday delivery notes don't count: about a third of tiles carry one, and a nudge that goes off that often teaches people to ignore it. On the sample sheets that is about 8 stops in 281.
3. **Never in the way.** Sounds never play over the Driver Assistant's directions, never before the first tap (phones don't allow it), and nothing waits for a sound. **Settings → Run sounds → Off** silences them; the buzzes and the tile's pulse stay.
4. **Stan and the music.**
   - A web app can only ask the phone to hold other sound on iPhones (the Audio Session setting, iOS 16.4 on). Android gives a web app no way to do it, and no web app can tell that a phone call is under way: the phone itself decides what plays during a call.
   - So on iPhones there is a setting, **Music while Stan talks: Keeps playing / Pauses**. *Pauses* asks the phone to hold the music while a recorded line plays and hands it back after. It is **off to begin with**, not on as Mike asked, because iPhones have had a fault where this setting silences a web app's own sound. It needs trying on Lisa's phone first; if Stan is still heard, it can become the default.
   - Run sounds are short and play along with music on every phone.

## Consequences
- Nothing here has been heard on a real phone yet: the notes' loudness and the nudge's timing are first guesses to tune by ear.
- Samsung/Android: no way to duck music from the app. If Stan is hard to hear over music there, the fix is his own loudness, not the music's.
- Checked by `test/sfx.mjs` and `test/e2e-sounds.py`.
