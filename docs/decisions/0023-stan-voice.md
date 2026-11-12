# 0023. Stan's own voice, made on the phone

- **Date:** 2026-11-12
- **Status:** Accepted

## Context
Stan spoke with each phone's built-in voice, pitched up. Mike (12 Nov 2026): he rushes over punctuation, sounds tinny, and differs from phone to phone; he should have his own voice, loaded when the app opens so it's smooth.

## Decision
- **Stan's voice is made on the phone** with Piper (open-source text-to-speech) running in the browser (`js/stanvoice.js`, `js/stanvoice-worker.js`). No server, no cost per line, works with no signal once downloaded, and he sounds the same on every phone.
- **The voice** was chosen by Mike by ear in the voice lab (`test/voice-lab.html`): VCTK speaker **p316**, pitch 1.35, pace 1.2, warmth 8, robot 0.4. VCTK is CC BY 4.0, so it's fine for business use with a credit ([credits](../credits.md)). The video's "Ryan" voice is non-commercial and is not used.
- **Pauses:** a line is split where a person would pause (commas, colons, full stops followed by a space) and each piece is made separately with a real gap between: longer after a full stop. Abbreviations are said in full (m, km, Rd, St, Cres…).
- **Sound:** pitch comes from making the speech slower and playing it faster (no chipmunk gabble); a low boost and a high cut take the tinny edge off; a quiet wobbling echo is the robot.
- **Loading:** about 100 MB, once, kept in the phone's own cache. When the app opens it loads by itself if it's already on the phone, or downloads by itself on Wi-Fi (Android tells us; iPhones don't). Otherwise Stan offers it once a day ("best on Wi-Fi"), and Settings has **Get it**.
- **Ready before he's needed:** while you drive to a stop, the lines he'll probably say there are made in the background; a line needed now jumps the queue.
- **Never silent:** until his voice is ready, or if it fails, he uses the phone's voice as before. **Settings → Voice: Stan's / Phone's**.

Not chosen: a paid cloud voice (needs signal at 5am, costs per line, adds delay); recorded clips (can't say street names or sheet notes).

## Consequences
The pronunciation and speech files come from pinned versions on public CDNs (jsDelivr, Hugging Face) the first time. Slow phones may take a few seconds to make a line: pre-making covers most of it, and the phone's voice is one tap away if not.
