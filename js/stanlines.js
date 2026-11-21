// What Stan says out loud in his recorded voice (decision 0043). Every line is his own: no catchphrases borrowed from
// other characters. key → { say, when }. The key is the clip's file name, so never reuse a key for different words:
// add a new one (hello.4) and retire the old.
//
// "say" is exactly what is sent to the voice service. Record them from Dispatch → Stan's voice.

const G = (when, lines) => Object.fromEntries(Object.entries(lines).map(([k, say]) => [k, { say, when }]));

import { UPDATES } from './whatsnew.js';

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
  ...G('Kilometres and the odometer', {
    'km.odo.1': 'What’s the odometer say?',
    'km.odo.2': 'Big number on the dash, please.',
    'km.shorter': 'Shorter than usual today. Nice.',
    'km.further': 'Further than usual today. Scenic route?',
  }),
  ...G('The route and the order', {
    'route.twice': 'We drove that bit twice. Just saying.',
    'route.idea': 'I think there’s a shorter way. Want to see?',
    'route.new': 'New order today. Trust me. Mostly.',
    'route.won': 'That was shorter. Goo-doo!',
    'route.lost': 'Hmm. That wasn’t shorter. My mistake.',
  }),
  ...G('The crew', {
    'crew.who': 'Who’s driving today?',
    'crew.helper': 'Helper on board. Folding power.',
    'crew.thanks': 'Thanks for helping today.',
    'crew.with.lisa': 'You’re with Lisa today.', 'crew.with.mike': 'You’re with Mike today.', 'crew.with.moana': 'You’re with Mum today.',
  }),
  ...G('The depot and the board', {
    'board.short': 'Papers short? Put it on the board.',
    'board.note': 'New note on the board.',
    'board.rule': 'There’s a new rule. Have a read.',
    'plan.changed': 'Plan’s changed. Have a look.',
    'plan.early': 'Early one tomorrow. Sorry.',
  }),
  ...G('Each run, by name', {
    'runname.6': 'Run six. Done.', 'runname.8': 'Run eight. Done.', 'runname.10': 'Run ten. Done.', 'runname.11': 'Run eleven. Done.', 'runname.13': 'Run thirteen. Done.',
  }),
  ...G('Milestones', {
    'mile.first': 'First paper of the day. Here we go.',
    'mile.half': 'Halfway. Keep going.',
    'mile.last': 'Last run. Nearly there.',
    'mile.week': 'A whole week on time. Stan-tastic.',
    'mile.weekend': 'Weekend. Seven o’clock deadline. Luxury.',
  }),
  ...G('Walkthroughs and videos', {
    'tour.hi': 'Hi, I’m Stan. Let me show you around.',
    'tour.tick': 'This is where you tick.',
    'tour.end': 'And that’s the tour.',
  }),
  ...G('Short reactions', {
    're.nice': 'Nice one.', 're.tidy': 'Tidy.', 're.easy': 'Easy.', 're.there': 'There we go.', 're.nearly': 'Nearly.', 're.whoops': 'Whoops.',
    're.hang': 'Hang on.', 're.think': 'Let me think.', 're.back': 'Back in a tick.', 're.thanks': 'Thanks.', 're.done': 'Done.', 're.gold': 'Good as gold.',
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
// What's new cards, read aloud (decision 0060): each card's spoken version is one of his lines, so it is recorded the same way.
for (const u of UPDATES) if (u.say) STAN_LINES[`news.${u.id}`] = { say: u.say, when: 'What’s new, read aloud' };

export function linesToRecord(recorded = [], lines = STAN_LINES) {
  const have = new Map(recorded.map((r) => [r.key, r.text]));
  return Object.entries(lines).filter(([k, l]) => have.get(k) !== l.say).map(([key, l]) => ({ key, say: l.say, why: have.has(key) ? 'changed' : 'new' }));
}

// ---- Which lines suit which moment (Mike, 21 Nov 2026) ----
// 1. Lines belong to moments: each moment has a pool, and a line can sit in as many pools as it suits.
// 2. He doesn't repeat himself: a moment's pool is used up before any line comes round again.
// 3. Mood has to match: on a rough morning (late, slow, something went wrong) he never uses a cheerful line.
// 4. He doesn't always speak: routine moments speak some of the time (say), big ones always.

/** Lines that are celebrations. Never used when the mood is rough. Everything else is safe any time. */
export const CHEERFUL = new Set(['done.1', 'done.2', 'done.3', 'done.4', 'run.2', 'sum.great', 'sum.streak', 'word.stantastic', 'word.goodoo', 'route.won', 'mile.week', 'mile.weekend', 'game.high',
  'noise.yay', 'noise.tada', 're.nice', 're.easy', 're.gold', 'km.shorter', 'sum.faster', 'sum.ontime', 'sum.ticks.good', 'bored.3', 'duty.fold', 'hello.2', 'crew.helper']);

/** moment → { lines: the pool, say: how often he speaks (1 = always) }. Add a line to a pool to recycle it. */
export const STAN_MOMENTS = {
  'open':            { say: 0.6, lines: ['hello.1', 'hello.2', 'hello.3', 'word.hey'] },
  'plan.show':       { say: 1,   lines: ['plan.1', 'plan.2', 'plan.follow'] },
  'plan.changed':    { say: 1,   lines: ['plan.changed', 'plan.early', 're.hang'] },
  'duty.on':         { say: 0.7, lines: ['duty.who', 'crew.who', 'word.okidoo'] },
  'duty.alone':      { say: 0.7, lines: ['duty.alone', 'word.okidoo', 'noise.uhhuh'] },
  'duty.helper':     { say: 0.7, lines: ['crew.helper', 'duty.fold', 'word.okidoo'] },
  'depot.prep':      { say: 0.5, lines: ['duty.fold', 'noise.mmhmm', 're.back'] },
  'depot.leave':     { say: 1,   lines: ['leave.1', 'leave.2', 'plan.follow', 'mile.first'] },
  'odometer':        { say: 0.5, lines: ['km.odo.1', 'km.odo.2'] },
  'spares':          { say: 0.4, lines: ['spares.1', 'board.short'] },
  'run.done':        { say: 0.5, lines: ['run.1', 'run.2', 're.done', 're.nice', 're.tidy', 're.there', 'word.goodoo', 'noise.phew'] },
  'run.last':        { say: 0.6, lines: ['mile.last', 're.nearly', 'mile.half'] },
  'all.done':        { say: 1,   lines: ['done.1', 'done.2', 'done.3', 'done.4', 'word.stantastic', 'noise.tada', 're.done', 'noise.phew'] },
  'late.warn':       { say: 1,   lines: ['late.1', 'late.2', 'late.3', 'late.safe'] },
  'duty.off':        { say: 0.8, lines: ['off.1', 'off.2', 'crew.thanks', 're.thanks'] },
  'summary':         { say: 1,   lines: ['sum.intro', 're.think'] },
  'note.new':        { say: 1,   lines: ['note.1', 'board.note', 'word.hey'] },
  'note.rule':       { say: 1,   lines: ['board.rule', 'word.hey'] },
  'untick':          { say: 1,   lines: ['untick.1', 're.hang', 'noise.huh'] },
  'oops':            { say: 0.8, lines: ['oops.retry', 'noise.oopsie', 're.whoops', 'noise.hmm'] },
  'offline':         { say: 0.5, lines: ['oops.signal'] },
  'route.doubled':   { say: 0.6, lines: ['route.twice', 'noise.hmm'] },
  'route.suggest':   { say: 1,   lines: ['route.idea', 'route.new', 'noise.aha'] },
  'route.shorter':   { say: 1,   lines: ['route.won', 'km.shorter', 'word.goodoo', 're.gold'] },
  'route.longer':    { say: 1,   lines: ['route.lost', 'km.further', 'noise.oopsie'] },
  'bored':           { say: 1,   lines: ['bored.1', 'bored.2', 'bored.3', 'noise.umm', 'noise.hmm'] },
  'game.hit':        { say: 0.5, lines: ['game.dog', 'game.box', 'noise.ouch', 're.whoops', 'noise.oopsie'] },
  'game.best':       { say: 1,   lines: ['game.high', 'word.goodoo', 'noise.yay', 'word.stantastic'] },
  'tour':            { say: 1,   lines: ['tour.hi', 'tour.tick', 'tour.end'] },
  'ok':              { say: 0.3, lines: ['noise.uhhuh', 'noise.mmhmm', 'word.okidoo', 're.done', 're.thanks'] },
};

/**
 * What Stan says for a moment, or null if he keeps quiet this time.
 * mood: 'rough' on a late or bad morning (no cheerful lines) · heard: { moment: [keys already used] }, handed back updated
 * rand: a 0–1 number source (Math.random), so tests can steer it · force: speak even if it's a sometimes-moment
 * Returns { key, say, heard }.
 */
export function stanLine(moment, { mood = 'fine', heard = {}, rand = Math.random, force = false, lines = STAN_LINES, moments = STAN_MOMENTS } = {}) {
  const m = moments[moment]; if (!m) return { key: null, say: null, heard };
  if (!force && m.say < 1 && rand() >= m.say) return { key: null, say: null, heard };
  const pool = m.lines.filter((k) => lines[k] && !(mood === 'rough' && CHEERFUL.has(k)));
  if (!pool.length) return { key: null, say: null, heard };
  let used = (heard[moment] || []).filter((k) => pool.includes(k));
  if (used.length >= pool.length) used = used.slice(-1);          // been through them all: start again, but not with the one just said
  const fresh = pool.filter((k) => !used.includes(k)); const from = fresh.length ? fresh : pool;
  const key = from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
  return { key, say: lines[key].say, heard: { ...heard, [moment]: [...used, key] } };
}
