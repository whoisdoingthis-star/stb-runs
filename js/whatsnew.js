// What's new (Lisa's and Mike's idea, 22 Nov 2026; decision 0059): every change the family will see, do or must follow gets
// an entry here, in plain words, with why. The next time someone opens the app (off duty), Stan walks them through the
// ones they haven't seen. Add to the TOP of the list in the same commit as the change (CONTRIBUTING.md).
//
//   id     never changes once published (it's how "seen" is remembered)
//   date   the day it went out (NZ)
//   for    who it matters to: 'driver', 'helper', 'dispatcher', or 'all'
//   title  a few words
//   what   what changed, as you'd say it to Mum
//   why    one line: the reason

export const UPDATES = [
  { id: '2026-11-22-whatsnew', date: '2026-11-22', for: ['all'], title: 'Stan tells you what’s new',
    what: 'When something in the app changes, Stan shows you a short card like this one the next time you open it: what changed, and why. You can read them again any time from ⚙ Settings → What’s new.',
    why: 'So nobody has to find out about a change by accident, or from someone else.' },
  { id: '2026-11-22-not-your-run', date: '2026-11-22', for: ['driver', 'helper'], title: 'Don’t tick a run you didn’t deliver',
    what: 'If someone outside the app delivered a run (like Gagan on Run 8 at the weekend), leave its stops unticked. Mike or Lisa closes it on the dispatch board with Close run…, which records who really did it and when.',
    why: 'A tick says “I put this paper in this box”. If a complaint comes in, the record has to name the person who was actually there.' },
  { id: '2026-11-22-spares', date: '2026-11-22', for: ['driver'], title: 'Spares are counted, and damaged papers are separate',
    what: 'A spare is an extra paper good enough to deliver. The count now starts as “?” and has to be answered: + for each spare, − if there are none. Damaged or poor-quality extras go on their own line and are not spares.',
    why: 'A zero nobody counted looks the same as a real zero. And a damaged paper isn’t one you could use to fix a missed delivery.' },
  { id: '2026-11-22-location', date: '2026-11-22', for: ['driver'], title: 'Location must be on to start a run',
    what: 'If your phone isn’t letting the app use location, you can’t start the run. The app shows how to switch it on and has a “check again” button. No signal or slow GPS is fine: only “off” stops you.',
    why: 'Where each tick was made is our proof of delivery, and how the kilometres and routes are worked out.' },
  { id: '2026-11-22-odometer', date: '2026-11-22', for: ['driver'], title: 'Odometer before the first stop',
    what: 'You can’t start a run, or tick a stop on today’s runs, until you’re on duty and the odometer is typed in. There’s no Skip any more. Tap a stop too early and the app takes you to what’s needed.',
    why: 'Without the start reading we can’t know how far the morning really was.' },
  { id: '2026-11-22-last-delivery', date: '2026-11-22', for: ['driver', 'helper'], title: 'Your last delivery ends the shift',
    what: 'When the last stop of your last run is ticked, you’re put off duty by itself, and so are the driver’s helpers. The driver is then asked for the end odometer and spares, and it keeps asking until they’re in.',
    why: 'Shift times were only as good as people remembering to tap Off duty.' },
  { id: '2026-11-22-handover', date: '2026-11-22', for: ['driver'], title: 'No going off duty with stops left',
    what: 'If one of your runs still has stops to do, Off duty asks who is finishing them (tap their name) or why you can’t carry on. Sharing a run in two cars? The first to finish hands over to the other, or stays on until the last stop is ticked.',
    why: 'So a run is never left half done with nobody down as responsible for the rest.' },
  { id: '2026-11-21-own-order', date: '2026-11-21', for: ['driver', 'helper'], title: 'Your order is yours',
    what: 'When you move tiles, it’s saved as your own order for that run. Nobody else’s run changes, Mike’s and Lisa’s included. ⋯ → Use the usual order again drops yours.',
    why: 'People drive the same run different ways, and one person’s change kept rearranging everyone else’s.' },
  { id: '2026-11-21-address-check', date: '2026-11-21', for: ['driver', 'helper'], title: 'Stan checks the addresses before you start',
    what: 'On a run that hasn’t been started, Stan may show a yellow card: an address sitting away from the rest of its street. Tap Move it or Leave it.',
    why: 'A new address once landed 30 stops from its street, and cost a drive back.' },
  { id: '2026-11-21-sounds', date: '2026-11-21', for: ['driver', 'helper'], title: 'Sounds on a run, and a heads-up',
    what: 'Each tick plays a soft note. Three quick high notes, a double buzz and a flashing tile mean the next stop is not the usual: two papers, a stop or restart, a complaint. Turn sounds off in ⚙ Settings → Run sounds.',
    why: 'After two hundred identical taps, the one stop that’s different is the easy one to get wrong.' },
  { id: '2026-11-21-runs-page', date: '2026-11-21', for: ['driver', 'helper'], title: 'The Runs page follows your morning',
    what: 'Today’s runs are listed in your order. What to load opens at the depot. On the run, the top card is the run you’re on, with one Continue button and how you’re going against the plan.',
    why: 'The top of the screen should always answer “what do I do now?”' },
  { id: '2026-11-21-clean-mornings', date: '2026-11-21', for: ['driver', 'helper'], title: 'Clean mornings in a row',
    what: 'Your morning card counts clean mornings in a row: ticked as the papers go in, at the address. Nothing to do with speed. One let-off a week.',
    why: 'A record we can trust is what answers a complaint. That’s what’s worth a pat on the back.' },
  { id: '2026-11-21-dispatch-phone', date: '2026-11-21', for: ['dispatcher'], title: 'Dispatch works on a phone',
    what: 'On a phone, Dispatch has four buttons along the bottom (Today, Proof, Insights, Set-up), tables show as cards, and pop-ups keep their ✕ in view.',
    why: 'It was built for a laptop and was hard work on a phone.' },
];

export const NEWS_DAYS = 14;   // older than this is history: read it in Settings, it doesn't pop up
export const NEWS_MAX = 12;

/** Who someone is, for choosing their cards: any of 'driver' | 'helper' | 'dispatcher'. */
export const rolesOf = ({ driver = false, dispatcher = false } = {}) => [driver ? 'driver' : 'helper', ...(dispatcher ? ['dispatcher'] : [])];
const forMe = (u, roles) => u.for.includes('all') || u.for.some((r) => roles.includes(r));
const daysAgo = (date, today) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 864e5);

/** Everything published for these roles, newest day first, and within a day in the order written. */
export function updatesFor(roles, list = UPDATES) {
  return list.filter((u) => forMe(u, roles)).map((u, i) => ({ u, i })).sort((a, b) => b.u.date.localeCompare(a.u.date) || a.i - b.i).map((x) => x.u);
}
/** The ones to walk someone through now: theirs, not yet seen, from the last two weeks, oldest first so the story reads in order. */
export function unseenFor(roles, seen = [], today, list = UPDATES) {
  const got = new Set(seen);
  return updatesFor(roles, list).filter((u) => !got.has(u.id) && daysAgo(u.date, today) <= NEWS_DAYS && daysAgo(u.date, today) >= 0).slice(0, NEWS_MAX).reverse();
}
/** For the dispatch board: how many of someone's current cards they haven't seen. */
export const unreadCount = (roles, seen, today, list = UPDATES) => unseenFor(roles, seen, today, list).length;
export const WHO = { driver: 'Drivers', helper: 'Helpers', dispatcher: 'Dispatch', all: 'Everyone' };
export const whoText = (u) => (u.for.includes('all') ? WHO.all : u.for.map((r) => WHO[r]).join(' and '));
