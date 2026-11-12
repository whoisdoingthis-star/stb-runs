// Chat with Stan (decision 0024): tell Stan an idea, a tweak or a niggle. He answers with a bit of
// cheek and writes it in the ideas register for Dispatch to review. He doesn't pretend to understand
// more than he does: replies are picked from his own lines by what the message is about.

const pick = (list, seed) => list[Math.abs(seed) % list.length];
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; };

const TOPICS = [
  { key: 'thanks', re: /\b(thanks|thank you|cheers|love (it|you|this)|awesome|great job|good job|well done|legend)\b/i, lines: [
    'Aww. My circuits have gone all warm. Thank you!',
    'You’re making my antenna wobble. Cheers!',
    'High five! Well, I’ve only got little arms. But high five!' ] },
  { key: 'voice', re: /\b(voice|talk|speak|sound|loud|quiet|volume|accent|say|pronounc)/i, lines: [
    'A note about my voice? I’m all ears. Well, all antenna. Written down!',
    'Testing, testing. Got it. I’ll pass that on to Mike.',
    'I’ve been practising my street names, I promise. Noted!' ] },
  { key: 'nav', re: /\b(map|direction|turn|route|navigat|gps|street|lost|wrong way|arrow)/i, lines: [
    'Directions, eh? I do love a good left turn. It’s on the list!',
    'Noted! I’ll try not to send anyone into the harbour.',
    'Good spotting. I’ve pinned it to the list. Get it? Pinned?' ] },
  { key: 'bug', re: /\b(bug|broke|broken|crash|wrong|doesn.?t work|not working|stuck|error|glitch|fail|froze|freez)/i, lines: [
    'Uh oh. That one’s on me. I’ve written it down so Mike can fix me up.',
    'Oops! Even robots have off days. It’s in the book.',
    'Yikes. Thanks for telling me. Straight to the top of the list.' ] },
  { key: 'slow', re: /\b(slow|lag|wait|takes ages|faster|quick|speed)/i, lines: [
    'Too slow? I’ll do some stretches. Noted!',
    'Vroom vroom. Message received. I’ll ask Mike for a tune-up.' ] },
  { key: 'look', re: /\b(colou?r|big|small|text|font|button|screen|tile|read|see|dark|bright|size|look)/i, lines: [
    'Ooh, a makeover idea. I do like looking sharp. Written down!',
    'Easier on the eyes? Yes please. It’s on the list.' ] },
  { key: 'runs', re: /\b(run|order|sequence|stop|deliver|paper|bundle|sheet|depot|duty|shift|time|finish)/i, lines: [
    'Now that’s run wisdom. You do the miles, I take the notes. Got it!',
    'Good thinking! That could save some steps. In the book it goes.',
    'Only someone who’s done the run would think of that. Noted!' ] },
  { key: 'stan', re: /\b(stan|robot|you|your)\b/i, lines: [
    'Talking about me? I’m blushing. Do robots blush? Anyway, noted!',
    'Me? Improve? Impossible. Kidding! It’s on the list.' ] },
];
const ANY = [
  'Ooh, I like that one! It’s in the ideas book for Mike.',
  'Beep boop. That means: great idea. Written down!',
  'Got it! I can’t promise, but I can pester Mike. And I’m very good at pestering.',
  'Clever! I wish I’d thought of that. It’s on the list.',
  'Noted, with a little gold star next to it.',
];
export const STAN_HELLO = 'G’day! Got an idea to make me better? Or something bugging you? Tell me, and I’ll put it in the ideas book.';
export const STAN_EMPTY = 'I’m listening! Type a few words first.';

/** Stan's reply to a message. `n` = how many this person has sent before (varies the line). */
export function stanReply(text, n = 0) {
  const t = String(text || '').trim();
  if (!t) return { topic: 'empty', text: STAN_EMPTY };
  const topic = TOPICS.find((x) => x.re.test(t));
  const lines = topic ? topic.lines : ANY;
  return { topic: topic?.key || 'idea', text: pick(lines, hash(t) + n) };
}
export const IDEA_STATUS = { new: 'New', planned: 'Planned', done: 'Done', declined: 'Not now' };
