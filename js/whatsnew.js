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
//   say    Stan's spoken version, 300 characters at most, written for the ear (he reads it when the speaker is tapped;
//          record new ones on Dispatch → Set-up → Stan's voice)

export const UPDATES = [
  { id: '2026-11-22-whatsnew', date: '2026-11-22', for: ['all'], title: 'Stan tells you what’s new',
    what: 'When something in the app changes, Stan shows you a short card like this one the next time you open it: what changed, and why. Tap 🔊 and Stan reads it to you. You can go through them again any time from ⚙ Settings → What’s new.',
    why: 'So nobody has to find out about a change by accident, or from someone else.',
    say: "Hello. Stan here. When something in the app changes, I'll show you a card like this the next time you open it. What changed, and why. Tap the speaker and I'll read it to you." },
  { id: '2026-11-22-not-your-run', date: '2026-11-22', for: ['driver', 'helper'], title: 'Don’t tick a run you didn’t deliver',
    what: 'If someone outside the app delivered a run (like Gagan on Run 8 at the weekend), leave its stops unticked. Mike or Lisa closes it on the dispatch board with Close run…, which records who really did it and when.',
    why: 'A tick says “I put this paper in this box”. If a complaint comes in, the record has to name the person who was actually there.',
    say: "Don't tick a run you didn't deliver. If someone outside the app did it, like Gagan on Run 8 at the weekend, leave it. Mike or Lisa closes it on the dispatch board, with the name of who really did it. A tick means, I put this paper in this box." },
  { id: '2026-11-22-spares', date: '2026-11-22', for: ['driver'], title: 'Spares are counted, and damaged papers are separate',
    what: 'A spare is an extra paper good enough to deliver. The count now starts as “?” and has to be answered: + for each spare, − if there are none. Damaged or poor-quality extras go on their own line and are not spares.',
    why: 'A zero nobody counted looks the same as a real zero. And a damaged paper isn’t one you could use to fix a missed delivery.',
    say: "Spares have to be counted now. A spare is an extra paper good enough to deliver. Tap plus for each one, or minus if there are none. Damaged or poor ones go on their own line. They are not spares." },
  { id: '2026-11-22-location', date: '2026-11-22', for: ['driver'], title: 'Location must be on to start a run',
    what: 'If your phone isn’t letting the app use location, you can’t start the run. The app shows how to switch it on and has a “check again” button. No signal or slow GPS is fine: only “off” stops you.',
    why: 'Where each tick was made is our proof of delivery, and how the kilometres and routes are worked out.',
    say: "Location must be on before you start a run. If it's off, I'll show you how to switch it on. No signal is fine. Only off stops you. Where each tick was made is our proof of delivery." },
  { id: '2026-11-22-odometer', date: '2026-11-22', for: ['driver'], title: 'Odometer before the first stop',
    what: 'You can’t start a run, or tick a stop on today’s runs, until you’re on duty and the odometer is typed in. There’s no Skip any more. Tap a stop too early and the app takes you to what’s needed.',
    why: 'Without the start reading we can’t know how far the morning really was.',
    say: "Odometer first. You can't start a run, or tick a stop, until you're on duty and the odometer is typed in. There's no skip any more. Without it, we can't know how far the morning really was." },
  { id: '2026-11-22-last-delivery', date: '2026-11-22', for: ['driver', 'helper'], title: 'Your last delivery ends the shift',
    what: 'When the last stop of your last run is ticked, you’re put off duty by itself, and so are the driver’s helpers. The driver is then asked for the end odometer and spares, and it keeps asking until they’re in.',
    why: 'Shift times were only as good as people remembering to tap Off duty.',
    say: "Your last delivery ends your shift. When the last stop is ticked, you're off duty by itself, and so are your helpers. Drivers, I'll then ask for the odometer and spares. I'll keep asking until they're in." },
  { id: '2026-11-22-handover', date: '2026-11-22', for: ['driver'], title: 'No going off duty with stops left',
    what: 'If one of your runs still has stops to do, Off duty asks who is finishing them (tap their name) or why you can’t carry on. Sharing a run in two cars? The first to finish hands over to the other, or stays on until the last stop is ticked.',
    why: 'So a run is never left half done with nobody down as responsible for the rest.',
    say: "No going off duty with stops still to do. If you tap off duty early, tell me who is finishing them, or why you can't carry on. That way a run is never left half done with nobody down for the rest." },
  { id: '2026-11-21-own-order', date: '2026-11-21', for: ['driver', 'helper'], title: 'Your order is yours',
    what: 'When you move tiles, it’s saved as your own order for that run. Nobody else’s run changes, Mike’s and Lisa’s included. ⋯ → Use the usual order again drops yours.',
    why: 'People drive the same run different ways, and one person’s change kept rearranging everyone else’s.',
    say: "Your order is yours. When you move tiles, it's saved as your own order for that run. Nobody else's run changes. People drive the same run different ways, and that's fine." },
  { id: '2026-11-21-address-check', date: '2026-11-21', for: ['driver', 'helper'], title: 'Stan checks the addresses before you start',
    what: 'On a run that hasn’t been started, Stan may show a yellow card: an address sitting away from the rest of its street. Tap Move it or Leave it.',
    why: 'A new address once landed 30 stops from its street, and cost a drive back.',
    say: "Before you start a run, I check the addresses. If one is sitting away from the rest of its street, I'll show a yellow card. Tap move it, or leave it. It saves a drive back." },
  { id: '2026-11-21-sounds', date: '2026-11-21', for: ['driver', 'helper'], title: 'Sounds on a run, and a heads-up',
    what: 'Each tick plays a soft note. Three quick high notes, a double buzz and a flashing tile mean the next stop is not the usual: two papers, a stop or restart, a complaint. Turn sounds off in ⚙ Settings → Run sounds.',
    why: 'After two hundred identical taps, the one stop that’s different is the easy one to get wrong.',
    say: "Each tick plays a soft note. Three quick high notes, a double buzz and a flashing tile mean the next stop is not the usual. Two papers, a stop, or a complaint. Have a look before you tap." },
  { id: '2026-11-21-runs-page', date: '2026-11-21', for: ['driver', 'helper'], title: 'The Runs page follows your morning',
    what: 'Today’s runs are listed in your order. What to load opens at the depot. On the run, the top card is the run you’re on, with one Continue button and how you’re going against the plan.',
    why: 'The top of the screen should always answer “what do I do now?”',
    say: "The runs page follows your morning. Your runs are in your order. What to load opens at the depot. On the run, the top card is the run you're on, with one big continue button." },
  { id: '2026-11-21-clean-mornings', date: '2026-11-21', for: ['driver', 'helper'], title: 'Clean mornings in a row',
    what: 'Your morning card counts clean mornings in a row: ticked as the papers go in, at the address. Nothing to do with speed. One let-off a week.',
    why: 'A record we can trust is what answers a complaint. That’s what’s worth a pat on the back.',
    say: "I count your clean mornings in a row. A clean morning is ticked as the papers go in, at the address. It has nothing to do with speed. And you get one let-off a week." },
  { id: '2026-11-21-dispatch-phone', date: '2026-11-21', for: ['dispatcher'], title: 'Dispatch works on a phone',
    what: 'On a phone, Dispatch has four buttons along the bottom (Today, Proof, Insights, Set-up), tables show as cards, and pop-ups keep their ✕ in view.',
    why: 'It was built for a laptop and was hard work on a phone.',
    say: "Dispatch works on a phone now. Four buttons along the bottom. Today, proof, insights and set-up. Tables show as cards, so you only scroll up and down." },
  // ---- Back-filled 22 Nov 2026 at Mike's request: what was built from the first live trial (8 Nov) that still applies ----
  { id: '2026-11-21-your-morning', date: '2026-11-21', for: ["driver", "helper"], title: "Your morning, after the shift",
    what: "When your runs are done, Stan shows Your morning: time at the depot and on the run, stops and papers, kilometres, how the pace compared with your own usual, and how well the record was kept. Helpers see their driver’s.",
    why: "So each person can see their own morning in facts, without anyone having to add it up.",
    say: "After your shift I show you your morning. Time at the depot and on the run, stops, papers and kilometres, and how it compared with your own usual. Helpers see their driver's. It's facts, not a score." },
  { id: '2026-11-19-notice-board', date: '2026-11-19', for: ["all"], title: "The notice board, and pinned rules",
    what: "📌 Notice board on the Runs page: leave a note for everyone, or for the people you pick. It pops up for them and they tap Got it. Notes last three days. Pinned rules stay at the top under How we do things, and This morning shows each run’s finish time.",
    why: "One place for “heads up” messages, where you can see who has read them.",
    say: "The notice board is on the runs page. Leave a note for everyone, or just the people you pick. It pops up for them, and they tap got it. Pinned rules stay at the top. And it shows when each run finished this morning." },
  { id: '2026-11-19-crew', date: '2026-11-19', for: ["driver", "helper"], title: "Going on duty: who’s with you?",
    what: "Everyone is a driver or a helper. A driver going on duty taps who is helping (Other… for someone new, or Just me), then Prepping at the depot or Prepped: starting the run. A helper taps who they’re helping.",
    why: "The morning’s numbers belong to the crew that did the work, so we need to know who was in which car.",
    say: "When a driver goes on duty, I ask who's with you. Tap their names, or just me. Then prepping at the depot, or prepped and starting. Helpers tap who they're helping. That's how I know who was in which car." },
  { id: '2026-11-19-plan', date: '2026-11-19', for: ["driver", "helper"], title: "Stan’s plan for the day",
    what: "When Mike or Lisa sets the day’s plan, it pops up when you open the app: who you’re with, your runs in order, when to be at the depot and when the first paper should go out. It stays on the Runs page as a card.",
    why: "So everyone starts the morning knowing their runs and their times, without a round of messages.",
    say: "When there's a plan for the day, I show it when you open the app. Who you're with, your runs in order, when to be at the depot, and when the first paper should go out. No round of messages needed." },
  { id: '2026-11-18-untick', date: '2026-11-18', for: ["driver", "helper"], title: "An older tick asks before it’s unticked",
    what: "Tap a green tile that was ticked more than a minute ago, or by someone else, and the app asks before it unticks. A tick you’ve only just made still unticks straight away.",
    why: "A stray thumb was quietly undoing real deliveries.",
    say: "If you tap a green tile that was ticked a while ago, or by someone else, I'll ask before I untick it. A tick you've only just made still comes off straight away. A stray thumb was undoing real deliveries." },
  { id: '2026-11-17-insights', date: '2026-11-17', for: ["dispatcher"], title: "Insights on the dispatch board",
    what: "Insights reads the ticks, photos and complaints for the dates you pick: delivered in full and on time, complaints, runs finished late, kilometres per run, and what each finding suggests.",
    why: "To run the business on what actually happened, not on how the morning felt.",
    say: "Insights, on the dispatch board, reads the ticks, photos and complaints for the dates you pick. Delivered in full and on time, complaints, late runs, and kilometres. Each finding comes with a suggestion." },
  { id: '2026-11-17-did-you-know', date: '2026-11-17', for: ["driver", "helper"], title: "Stan’s “Did you know…” cards",
    what: "Once a day on the Runs page, when you’re off duty, Stan shows one card about your own deliveries: a tip, a pattern, or something that went well.",
    why: "The records are only useful if what they show gets back to the person who made them.",
    say: "Once a day, when you're off duty, I show one did you know card about your own deliveries. A tip, a pattern, or something that went well. Only yours. Nobody else's." },
  { id: '2026-11-14-game', date: '2026-11-14', for: ["all"], title: "Stan’s Paper Run, the game",
    what: "With no runs to do and off duty, Stan gets bored after a few seconds and offers a game: throw papers into letterboxes. Never while you’re on duty.",
    why: "Because waiting for the sheets is boring, and Stan thinks so too.",
    say: "When there are no runs and you're off duty, I get a bit bored. So there's a game. Stan's paper run. Throw papers into letterboxes. Never while you're on duty, though. Work first." },
  { id: '2026-11-13-new-start-photo', date: '2026-11-13', for: ["driver", "helper"], title: "New starts ask for a photo",
    what: "The first day an address is on the sheet, the app asks for a photo of the paper where you left it.",
    why: "A first delivery is where a customer is most likely to say it never came, and where we’re least sure of the spot.",
    say: "On the first day an address is on the sheet, I'll ask for a photo of the paper where you left it. A first delivery is when a customer is most likely to say it never came." },
  { id: '2026-11-13-dispatch-tools', date: '2026-11-13', for: ["dispatcher"], title: "Dispatch: morning watch, find a delivery, the report",
    what: "Overview opens with every run against its deadline. Find a delivery shows every delivery to an address with who, when, where and photos. Complaints → Delivery report (PDF) makes the report for any dates. Runs & sheets → Map shows every stop.",
    why: "So a complaint or a late run can be answered from the record in a minute.",
    say: "On the dispatch board, the overview shows every run against its deadline. Find a delivery shows who delivered to an address, when, and where. And the delivery report makes a P D F for any dates." },
  { id: '2026-11-13-ping', date: '2026-11-13', for: ["driver", "helper"], title: "Ping: where are you?",
    what: "Mike or Lisa can ping your phone from the dispatch board to see where you are on the map. It only works while you’re on duty, only when they ask, and your phone always tells you it happened.",
    why: "To help when someone’s running late or stuck, without anyone being tracked.",
    say: "Mike or Lisa can ping your phone to see where you are. Only while you're on duty. Only when they ask. And I always tell you it happened. Nobody is tracked." },
  { id: '2026-11-12-ideas', date: '2026-11-12', for: ["all"], title: "Got an idea? Tell Stan",
    what: "The Idea button on the Runs page (and in a run’s ⋯ menu): type an idea, a tweak or a niggle. Stan answers, and it goes on the list for Mike.",
    why: "The best ideas so far have come from doing the runs. Spares, the notice board and this very feature started that way.",
    say: "Got an idea? Tell me. Tap the idea button on the runs page and type it in. It goes on the list for Mike. The best ideas so far came from doing the runs." },
  { id: '2026-11-12-finish-time', date: '2026-11-12', for: ["driver", "helper"], title: "Finish about…",
    what: "The run screen and the On duty card show “finish about 6:35 am” for the runs you have open, worked out from your pace so far.",
    why: "So you know early if the morning is running late, while there’s still time to ask for help.",
    say: "The run screen shows finish about, with a time, worked out from your pace so far. So you know early if the morning is running late, while there's still time to ask for help." },
  { id: '2026-11-12-on-duty', date: '2026-11-12', for: ["driver", "helper"], title: "On duty, and My runs",
    what: "Tap On duty at the depot and your clock starts; sorting and loading count. Change my runs sets which runs are yours today and in what order. Off duty ends it.",
    why: "Shift times and who did which run come from here, and it’s what switches on Ping, the plan and your morning card.",
    say: "Tap on duty at the depot and your clock starts. Sorting and loading count. Change my runs sets which runs are yours today, and in what order. Everything else hangs off that." },
  { id: '2026-11-12-assistant', date: '2026-11-12', for: ["driver", "helper"], title: "Stan the co-driver, and Maps",
    what: "On a run, tap Stan’s head and he talks you to the next stop, turn by turn when there’s GPS. The arrow in the bottom bar opens Google Maps to the next stop.",
    why: "For new runs, new addresses and dark streets, when reading the screen isn’t safe.",
    say: "On a run, tap my head and I'll talk you to the next stop. Turn by turn, when there's G P S. The arrow in the bottom bar opens maps to the next stop. Handy on a new run, or a dark street." },
  { id: '2026-11-10-depot-pick', date: '2026-11-10', for: ["driver", "helper"], title: "What to load: bundles and loose",
    what: "Before you leave, To collect lists each run’s papers as whole bundles plus loose copies, with an All runs line for the day’s total.",
    why: "So the car is loaded right the first time, straight from the sheet.",
    say: "Before you leave, to collect lists each run's papers as whole bundles plus loose copies, with a total for all your runs. So the car is loaded right the first time." },
  { id: '2026-11-09-problem', date: '2026-11-09', for: ["driver", "helper"], title: "Couldn’t deliver, or short",
    what: "Tick the stop as usual, then tap ⚠ in the bottom bar and pick why: gate locked, dog, no letterbox, short of papers and so on. Mike and Lisa see it straight away.",
    why: "A stop we couldn’t do is fine. A stop we couldn’t do and didn’t record is a complaint with no answer.",
    say: "If you can't deliver, tick the stop, then tap the warning button in the bottom bar and pick why. Gate locked, dog, short of papers. A stop we couldn't do is fine. One we didn't record is a complaint with no answer." },
  { id: '2026-11-08-photos', date: '2026-11-08', for: ["driver", "helper"], title: "Photos of a delivery",
    what: "📷 in the bottom bar takes a photo for the stop you just ticked, stamped with the address, time and your name. Forgot? ⋯ → Add a photo to an address… adds one later, even from your gallery.",
    why: "A photo of the paper in the box ends an argument faster than anything else we have.",
    say: "The camera button in the bottom bar takes a photo for the stop you just ticked, stamped with the address and time. Forgot? You can add one later from the menu. A photo ends an argument faster than anything." },
  { id: '2026-11-08-ticking', date: '2026-11-08', for: ["all"], title: "The basics: tap to tick",
    what: "Each address is a tile. Tap it when the paper’s in the box: it turns green and saves who, when and where. The purple tile is your next stop. Mum has big text; anyone can turn it on in ⚙ Settings.",
    why: "That tap is the delivery record everything else is built on.",
    say: "The basics. Each address is a tile. Tap it when the paper's in the box. It turns green, and saves who, when and where. The purple tile is your next stop. That tap is what everything else is built on." },
];

export const NEWS_DAYS = 31;   // older than this is history: read it in Settings, it doesn't pop up
export const NEWS_MAX = 40;    // (two weeks and twelve cards until 22 Nov 2026, when Mike asked for everything since the start of the month)

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
/** The name of a card's recorded line in Stan's voice. */
export const sayKey = (u) => `news.${u.id}`;
