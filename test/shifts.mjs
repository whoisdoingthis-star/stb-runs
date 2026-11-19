// On Duty and the shift timeline (decision 0020): every minute accounted for.
import assert from 'node:assert/strict';
import { shiftSegments, runOwners, currentDuty, shiftStart, MotionWatch, clock, parseLatLng, estimateFinish, autoOffAt, shiftCrews } from '../js/shifts.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.log(`✗ ${name}\n  ${e.message}`); } };
const at = (hm) => new Date(`2026-11-12T${hm}:00+13:00`).getTime();
const ticks = (run_id, from, to, every = 1) => { const out = []; for (let x = at(from); x <= at(to); x += every * 60000) out.push({ run_id, device_time: x }); return out; };

// Mike, 12 Nov: depot 4:40, drives off 4:58, Run 6 to 5:35, helps Mum with Run 11 5:38–5:41,
// then Run 13 from 5:52 (the 11 minutes between had no tick), off duty 6:25.
const day = {
  me: 'Mike',
  owners: { r6: 'Mike', r11: 'Moana', r13: 'Mike' },
  duty: [{ state: 'on_duty', device_time: at('04:40') }, { state: 'on_run', run_id: 'r6', device_time: at('04:58') }, { state: 'off_duty', device_time: at('06:25') }],
  ticks: [...ticks('r6', '05:02', '05:35'), ...ticks('r11', '05:38', '05:41'), ...ticks('r13', '05:52', '06:20')],
};

t('every minute from On duty to Off duty is in a segment, with no holes', () => {
  const s = shiftSegments(day);
  assert.equal(s.start, at('04:40')); assert.equal(s.end, at('06:25'));
  for (let i = 1; i < s.segments.length; i++) assert.equal(s.segments[i].start, s.segments[i - 1].end, `hole before ${s.segments[i].kind}`);
  assert.equal(s.segments.reduce((n, x) => n + x.end - x.start, 0), s.end - s.start);
});
t('depot time runs until driving off', () => assert.equal(shiftSegments(day).totals.depot, 18 * 60000));
t('the gap between Run 11 and Run 13 counts as getting to Run 13', () => {
  const tr = shiftSegments(day).segments.find((x) => x.kind === 'travel' && x.run_id === 'r13');
  assert.equal(tr.start, at('05:41')); assert.equal(tr.end, at('05:52'));
});
t('helping on Mum’s Run 11 shows as helping', () => {
  const s = shiftSegments(day);
  assert.ok(s.segments.some((x) => x.kind === 'help' && x.run_id === 'r11'));
  assert.equal(s.totals.help, 3 * 60000);
});
t('time per run includes getting there', () => assert.equal(shiftSegments(day).perRun.r13, 28 * 60000 + 11 * 60000));
t('a 10-minute gap inside a run is a pause', () => {
  const s = shiftSegments({ ...day, ticks: [...ticks('r6', '05:02', '05:10'), ...ticks('r6', '05:25', '05:35')] });
  assert.ok(s.segments.some((x) => x.kind === 'pause' && x.start === at('05:10') && x.end === at('05:25')));
});
t('moving on to the next run later than finishing: the wait is "between"', () => {
  const s = shiftSegments({ ...day, duty: [...day.duty, { state: 'on_run', run_id: 'r13', device_time: at('05:47') }] });
  const b = s.segments.find((x) => x.kind === 'between');
  assert.equal(b.start, at('05:41')); assert.equal(b.end, at('05:47'));
});
t('a shift still going ends now', () => {
  const s = shiftSegments({ ...day, duty: day.duty.slice(0, 2), now: at('06:40') });
  assert.equal(s.end, at('06:40')); assert.equal(s.segments.at(-1).kind, 'wrap');
});
t('who a run belongs to: closed-with driver, else most ticks', () => {
  const o = runOwners([{ id: 'r11' }, { id: 'r6', driver: 'Lisa' }], [{ run_id: 'r11', user_name: 'Moana' }, { run_id: 'r11', user_name: 'Moana' }, { run_id: 'r11', user_name: 'Mike' }]);
  assert.deepEqual(o, { r11: 'Moana', r6: 'Lisa' });
});
t('current duty and shift start', () => {
  assert.equal(currentDuty(day.duty.slice(0, 2)).onDuty, true); assert.equal(currentDuty(day.duty).onDuty, false);
  assert.equal(shiftStart(day.duty.slice(0, 2)), at('04:40')); assert.equal(shiftStart(day.duty), null);
  assert.equal(clock(65 * 60000), '1:05');
});
t('driving is 30 s above 15 km/h; walking letterboxes is not', () => {
  const m = new MotionWatch(); let on = false;
  for (let s = 0; s <= 40; s += 5) on = m.update({ t: s * 1000, speed: 1.4, lat: 0, lng: 0, acc: 5 }) || on;
  assert.equal(on, false);
  for (let s = 45; s <= 80; s += 5) on = m.update({ t: s * 1000, speed: 9, lat: 0, lng: 0, acc: 5 }) || on;
  assert.equal(on, true);
});
t('forgot Off duty: the shift ends at the last thing they did, not days later', () => {
  const x = shiftSegments({ ...day, duty: day.duty.slice(0, 2), now: at('06:25') + 3 * 864e5 });
  assert.equal(x.end, at('06:20')); assert.equal(x.forgot, true); assert.equal(x.open, false);
  const y = shiftSegments({ ...day, duty: day.duty.slice(0, 2), now: at('06:30') });
  assert.equal(y.end, at('06:30')); assert.equal(y.open, true);
});
t('a tick after Off duty (fixing a mistake that evening) doesn\u2019t stretch the shift', () => {
  const x = shiftSegments({ ...day, ticks: [...day.ticks, { run_id: 'r6', device_time: at('18:10') }] });
  assert.equal(x.end, at('06:25'));
});
// ---- about when will it all be done? ----
t('finish time: pace so far times the stops left', () => {
  const T = []; for (let i = 0; i < 11; i++) T.push(at('05:00') + i * 60000); // 11 stops, one a minute
  const e = estimateFinish({ tickTimes: T, done: 11, remaining: 30, now: at('05:10') });
  assert.equal(e.at, at('05:40'));
});
t('finish time: a long stop (10+ min) doesn\u2019t slow the pace, and each run not started adds 5 minutes', () => {
  const T = [0, 1, 2, 3, 4, 5].map((i) => at('05:00') + i * 60000).concat([at('05:30'), at('05:31')]);
  const e = estimateFinish({ tickTimes: T, done: 8, remaining: 14, unstarted: 2, now: at('05:31') });
  assert.equal(Math.round((e.at - at('05:31')) / 60000), 22); // 6 min of work over 7 gaps -> 12 min for 14 stops, + 10
});
t('finish time: no guess before 5 stops, or when nothing is left', () => {
  assert.equal(estimateFinish({ tickTimes: [1, 2, 3], done: 3, remaining: 10 }), null);
  assert.equal(estimateFinish({ tickTimes: [1, 2, 3, 4, 5, 6], done: 6, remaining: 0 }), null);
});
// ---- pasting the depot's location (Dispatch) ----
const near = (p, lat, lng) => p && Math.abs(p.lat - lat) < 1e-6 && Math.abs(p.lng - lng) < 1e-6;
t('a long Maps link with @lat,lng', () => assert.ok(near(parseLatLng('https://www.google.com/maps/place/Depot/@-36.9101,174.9302,17z/data=x'), -36.9101, 174.9302)));
t('the pin itself (!3d…!4d…) wins over the view', () => assert.ok(near(parseLatLng('https://www.google.com/maps/place/X/@-36.0,174.0,17z/data=!3m1!4b1!4m6!3m5!8m2!3d-36.9105!4d174.9311'), -36.9105, 174.9311)));
t('a ?q= link', () => assert.ok(near(parseLatLng('https://maps.google.com/?q=-36.91,174.93'), -36.91, 174.93)));
t('plain numbers', () => assert.ok(near(parseLatLng(' -36.91 , 174.93 '), -36.91, 174.93)));
t('a short link asks for the long one', () => assert.ok(parseLatLng('https://goo.gl/maps/MeVfNr2m4MDgvYGj8?g_st=ac')?.short === true));
t('nonsense is nothing', () => assert.ok(parseLatLng('the depot') === null));

// Left on duty after the runs are closed (decision 0038)
{ const on = [{ state: 'on_duty', device_time: at('04:30') }, { state: 'on_run', device_time: at('04:55') }];
  const iso = (hm) => new Date(at(hm)).toISOString();
  const closedAll = [{ delivery_date: '2026-11-12', closed_at: iso('05:40') }, { delivery_date: '2026-11-12', closed_at: iso('06:35') }, { delivery_date: '2026-11-13', closed_at: null }];
  t('when every run for the day is closed, someone still on duty is put off duty at the time the last run closed', () => assert.equal(autoOffAt(on, closedAll), at('06:35')));
  t('while any of the day’s runs is still open, nobody is put off duty', () => assert.equal(autoOffAt(on, [{ delivery_date: '2026-11-12', closed_at: iso('05:40') }, { delivery_date: '2026-11-12', closed_at: null }]), null));
  t('someone already off duty is left alone', () => assert.equal(autoOffAt([...on, { state: 'off_duty', device_time: at('06:10') }], closedAll), null));
  t('someone who went on duty after the runs had closed is left alone', () => assert.equal(autoOffAt([{ state: 'on_duty', device_time: at('07:30') }], closedAll), null));
  const tickedAll = [{ delivery_date: '2026-11-12', done: 30, summary: { lines: 30 }, lastTick: iso('05:50') }, { delivery_date: '2026-11-12', done: 32, summary: { lines: 32 }, lastTick: iso('06:32') }];
  t('a run with every stop ticked counts as finished, at its last tick, even if nobody closed it', () => assert.equal(autoOffAt(on, tickedAll), at('06:32')));
  t('one stop left unticked on an unclosed run keeps people on duty', () => assert.equal(autoOffAt(on, [tickedAll[0], { ...tickedAll[1], done: 31 }]), null));
  t('a day with no runs puts nobody off duty', () => assert.equal(autoOffAt(on, [{ delivery_date: '2026-11-13', closed_at: iso('06:00') }]), null));
  t('the automatic off-duty time is never before their own last change', () => assert.equal(autoOffAt([...on, { state: 'between', device_time: at('06:50') }], closedAll), at('06:50') + 1000));
}

{
  const e = (user_name, state, time, extra = {}) => ({ user_name, state, device_time: `2026-11-20T0${time}:00+13:00`, ...extra });
  t('the driver says who is helping, and that is the crew', () => assert.deepEqual(shiftCrews([e('Lisa', 'on_duty', '2:30', { helpers: ['Lenny', 'Seira'] }), e('Lisa', 'on_run', '2:40')]), [{ driver: 'Lisa', helpers: ['Lenny', 'Seira'], from: 'driver' }]));
  t('the driver’s answer is the boss when a helper says something different', () => assert.deepEqual(shiftCrews([e('Lisa', 'on_duty', '2:30', { helpers: ['Lenny'] }), e('Mike', 'on_duty', '2:31', { helpers: [] }), e('Lenny', 'on_duty', '2:32', { driver: 'Mike' })]), [{ driver: 'Lisa', helpers: ['Lenny'], from: 'driver' }, { driver: 'Mike', helpers: [], from: 'driver' }]));
  t('a helper’s answer counts when the driver gave none', () => assert.deepEqual(shiftCrews([e('Moana', 'on_duty', '2:30'), e('Zaph', 'on_duty', '2:31', { driver: 'Moana' }), e('Lenny', 'on_duty', '2:33', { driver: 'Moana' })]), [{ driver: 'Moana', helpers: ['Zaph', 'Lenny'], from: 'helpers' }]));
  t('nobody asked, no crews', () => assert.deepEqual(shiftCrews([e('Lisa', 'on_duty', '2:30')]), []));
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
