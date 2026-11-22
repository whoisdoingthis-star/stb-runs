# 0062. The design principles, said out loud

- **Date:** 2026-11-22
- **Status:** Accepted

## Context
Over the weekend of 21–22 Nov 2026 Mike named the principles he wants every build to follow, here and on anything else we build. Some were already habits in this repository; none were written down in one place. On the last of them he said: "It's still good to capture this approach as something we say out loud so that it's there as an optimisation approach should we ever get to a point where deploying tasks to specialist platforms to perform makes sense."

## Decision
These are the principles. Each is in Mike's words or agreed with him on the date shown.

1. **Docs as code.** Documentation lives with the code and changes in the same commit; checks refuse a publish without it. ([CONTRIBUTING.md](../../CONTRIBUTING.md); in place since 8 Nov, reaffirmed 22 Nov.)
2. **A decisions register.** Every design decision is recorded with its date, who stated it, the context and what follows from it. (This folder; reaffirmed 22 Nov.)
3. **Tell people what changed, and why.** Any change to what people see, do or must follow gets a plain-words card for the people affected. ([0059](0059-whats-new.md), 22 Nov.)
4. **"OK, what do I do with this information?"** Every screen and feature has to answer that for the person looking at it. (Mike, 20 Nov.)
5. **Quality data in.** "We need to ensure we have quality data for analysis, so enforcing capturing of critical data is boss. GIGO." Critical data is required, not optional. ([0057](0057-duty-hard-lines.md), [0058](0058-location-and-counted-spares.md), 22 Nov.)
6. **Scalability.** What is built for five runs and one family should still work for fifty runs, more crews and other run owners without a rebuild. (22 Nov.)
7. **Portability.** Nothing should be welded to one supplier, one customer or one device, so it can move to another host, another publisher's sheets or another business. (22 Nov.)
8. **Efficiency.** "Everything should be built for a purpose, processes should be designed for maximum efficiency, minimising use of resources." (22 Nov.)
9. **Design first, then the right hands for each job.** Mike sees the AI assistant's first job as strategic design and configuration, and its second as balancing the work: what it does itself, and what it hands to another platform or agent to build, directing it and checking the result against what was expected. Part of that is asking, now and then, whether the platforms in use are the best ones for each job. (22 Nov.)

### How principle 9 is applied
- **It is an optimisation, used where it pays.** Handing work off costs a clear brief and a real check of what comes back. Small jobs are done directly. It pays for work that is slow, repetitive or specialised, and for work that can run alongside something else.
- **The standard travels in the repository.** A fresh agent or an outside platform knows nothing of how we work; the contributing guide, this register and the checks are what hold its work to the same standard.
- **Check what can be checked, and say what can't.** Text, data and still images can be verified. Sound can't be heard by the assistant and video only frame by frame, so those need a person's ear or eye before they are called done.
- **Stan stays Stan.** Before any generator draws or animates him there must be a fixed reference for his look, and he remains Mike's own design ([0033](0033-brand.md)).
- **Credits are a resource.** Paid generation is weighed against doing the same in code.
- **First example:** Stan's read-aloud cards. The scripts were written by the assistant; a job on GitHub and ElevenLabs recorded all 32 with nobody pressing anything, and the result was checked from the database ([0061](0061-stan-records-himself.md)).

## Consequences
- These are how a change is judged, alongside the rules in CONTRIBUTING.md. Where two pull against each other (required data against the fewest taps, say), the decision record for that change says which won and why.
- Where the app falls short of scalability and portability today (it is built around the Howick runs, one sheet format and one family) is known and deliberately not listed or planned here: Mike asked to hold that for later.
- A comparison of platforms (voice, image, video, agents) has been offered and not yet asked for.
- Docs only: nothing on the phones changes.
