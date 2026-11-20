// What Stan says out loud in his recorded voice (decision 0043). Every line is his own: no catchphrases borrowed from
// other characters. key → { say, when }. The key is the clip's file name, so never reuse a key for different words:
// add a new one (hello.4) and retire the old.
//
// "say" is exactly what is sent to the voice service. Record them from Dispatch → Stan's voice.

const G = (when, lines) => Object.fromEntries(Object.entries(lines).map(([k, say]) => [k, { say, when }]));

export const STAN_LINES = {
  ...G('Opening the app', {
    'hello.1': 'Oh! Hello. It’s Stan.',
    'hello.2': 'Morning. I’ve been waiting. Not long. Well. A bit.',
    'hello.3': 'You’re up early. So am I. I’m always up.',
  }),
  ...G('Good morning, by name', {
    'name.mike': 'Morning, Mike.', 'name.lisa': 'Morning, Lisa.', 'name.moana': 'Morning, Mum.',
    'name.lenny': 'Morning, Lenny.', 'name.zaph': 'Morning, Zaph.', 'name.serene': 'Morning, Serene.',
  }),
  ...G('The plan', {
    'plan.1': 'I made a plan. I think it’s a good one.',
    'plan.2': 'Depot first. Then papers. I wrote it down.',
    'plan.follow': 'Okay. Follow me.',
  }),
  ...G('Going on duty', {
    'duty.who': 'Who’s coming with us today?',
    'duty.alone': 'Just you and me? Okay. I like those ones.',
    'duty.fold': 'Folding time. I’d help, but. No hands.',
  }),
  ...G('Leaving the depot', {
    'leave.1': 'Off we go. Drive safe.',
    'leave.2': 'Papers on board. I counted. Roughly.',
  }),
  ...G('A run finished', {
    'run.1': 'Run done. That’s one.',
    'run.2': 'Another one done. We’re good at this.',
  }),
  ...G('Everything finished', {
    'done.1': 'All done. Stan-tastic!',
    'done.2': 'Every paper. Every letterbox. Stan-tastic.',
    'done.3': 'We did it. Before six. I’m a bit proud.',
    'done.4': 'We did it! We actually did it! Goo-doo!',
  }),
  ...G('Running late', {
    'late.1': 'Um. We might be late. Just saying.',
    'late.2': 'The clock’s being mean today.',
    'late.3': 'Uh-oh. We’re a little late.',
    'late.safe': 'Drive safely. Better to be late than sorry.',
  }),
  ...G('Notes, unticking, spares', {
    'note.1': 'Someone left you a note. I didn’t read it. I did read it.',
    'untick.1': 'Are you sure? It was ticked a while ago.',
    'spares.1': 'Any papers left over?',
  }),
  ...G('Off duty', {
    'off.1': 'Good work today. Go have a cuppa.',
    'off.2': 'Off duty. I’ll keep an eye on things.',
  }),
  ...G('The end-of-shift summary', {
    'sum.great': 'On time. Every stop ticked. Goo-doo!',
    'sum.ontime': 'All in before the deadline. Nice one.',
    'sum.late': 'A bit late today. That’s okay. Tomorrow’s a new one.',
    'sum.faster': 'Quicker than your usual. I noticed.',
    'sum.same': 'Right on your usual. Steady.',
    'sum.slower': 'Slower than usual today. That’s fine. Safe is good.',
    'sum.ticks.good': 'Nearly every tick, right at the letterbox. Tidy.',
    'sum.ticks.low': 'Some ticks were a long way from the letterbox. Tick as you drop.',
    'sum.nogps': 'I couldn’t see where some ticks were. Is location switched on?',
    'sum.streak': 'Three clean mornings in a row. Stan-tastic.',
    'sum.intro': 'Here’s how we went.',
  }),
  ...G('Bored', {
    'bored.1': 'Still here.',
    'bored.2': 'I could count letterboxes. One. Two. No, that’s a tree.',
    'bored.3': 'Want to play my game? No pressure. Some pressure.',
  }),
  ...G('The game', {
    'game.dog': 'Mind the dog!',
    'game.high': 'Ooh. New high score.',
    'game.box': 'That was a letterbox. It wasn’t going to move.',
  }),
  ...G('When something goes wrong', {
    'oops.retry': 'Hmm. That didn’t work. Try again?',
    'oops.signal': 'No signal. It’s okay. I’ll remember it for later.',
  }),
  ...G('His own words', {
    'word.stantastic': 'Stan-tastic!',
    'word.goodoo': 'Goo-doo!',
    'word.okidoo': 'Oki-doo!',
    'word.hey': 'Hey!',
  }),
  ...G('Little noises', {
    'noise.uhhuh': 'Uh-huh.',
    'noise.mmhmm': 'Mm-hmm.',
    'noise.oopsie': 'Oopsie daisy.',
    'noise.ouch': 'Ouch!',
    'noise.umm': 'Ummm.',
    'noise.hmm': 'Hmm.',
    'noise.ooh': 'Ooh!',
    'noise.phew': 'Phew.',
    'noise.aha': 'Aha!',
    'noise.tada': 'Ta-da!',
    'noise.huh': 'Huh?',
    'noise.yay': 'Yay!',
  }),
};

/** Where a recorded clip lives. base is the project's Supabase URL. */
export const clipUrl = (base, key, stamp = '') => `${String(base).replace(/\/$/, '')}/storage/v1/object/public/stan-voice/${key}.mp3${stamp ? `?v=${encodeURIComponent(stamp)}` : ''}`;

/** What still needs recording, or recording again because the words changed. recorded: rows from stan_lines. */
export function linesToRecord(recorded = [], lines = STAN_LINES) {
  const have = new Map(recorded.map((r) => [r.key, r.text]));
  return Object.entries(lines).filter(([k, l]) => have.get(k) !== l.say).map(([key, l]) => ({ key, say: l.say, why: have.has(key) ? 'changed' : 'new' }));
}
