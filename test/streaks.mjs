import assert from 'node:assert/strict';
import { crewMornings, personDays, streak, familyWeek, weekOf, streakText } from '../js/streaks.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const D = (d, clean, why) => ({ date: d, clean, why: clean ? null : why || 'away' });
t('weeks run Monday to Sunday', () => { assert.equal(weekOf('2026-11-16'), '2026-11-16'); assert.equal(weekOf('2026-11-22'), '2026-11-16'); assert.equal(weekOf('2026-11-23'), '2026-11-23'); });
t('clean mornings count up, and days not worked don’t break the run', () => { const s = streak([D('2026-11-09', true), D('2026-11-11', true), D('2026-11-14', true)]); assert.equal(s.count, 3); assert.equal(s.best, 3); assert.equal(s.last.clean, true); assert.equal(s.letOffLeft, true); });
t('one let-off a week: the first morning that isn’t clean is let go, without being counted', () => { const s = streak([D('2026-11-16', true), D('2026-11-17', true), D('2026-11-18', false, 'bulk')]); assert.equal(s.count, 2); assert.equal(s.last.letOff, true); assert.equal(s.letOffLeft, false); });
t('a second one in the same week starts the count again', () => { const s = streak([D('2026-11-16', true), D('2026-11-17', false), D('2026-11-18', true), D('2026-11-19', false)]); assert.equal(s.count, 0); assert.equal(s.best, 2); assert.equal(s.last.letOff, false); });
t('a new week brings a new let-off', () => { const s = streak([D('2026-11-19', false), D('2026-11-20', true), D('2026-11-23', false), D('2026-11-24', true)]); assert.equal(s.count, 2); assert.equal(s.letOffLeft, false); });
t('the words say what happened and why, and never mention speed', () => {
  const a = streakText(streak([D('2026-11-16', true), D('2026-11-17', true), D('2026-11-18', true)])).join(' '); assert.match(a, /3 clean mornings in a row/); assert.match(a, /your best/);
  const b = streakText(streak([D('2026-11-16', true), D('2026-11-17', false, 'bulk')])).join(' '); assert.match(b, /ticked in one go afterwards/); assert.match(b, /let it go/); assert.match(b, /keep your 1 clean morning/);
  const c = streakText(streak([D('2026-11-16', false), D('2026-11-17', false, 'away')])).join(' '); assert.match(c, /away from the address/); assert.match(c, /starts again tomorrow/);
  for (const x of [a, b, c]) assert.doesNotMatch(x, /fast|quick|slow|late|time/i); assert.deepEqual(streakText(streak([])), []);
});
// ---- from runs and ticks ----
const nz = (d, mins) => new Date(Date.parse(`${d}T00:00:00+13:00`) + mins * 60e3).toISOString();
const runs = []; const ticks = []; const crewEvents = [];
const lay = (id, route, d, who, { gap = 60, off = 0, n = 20 } = {}) => { runs.push({ id, route, delivery_date: d }); for (let i = 0; i < n; i++) ticks.push({ run_id: id, address_key: `H|${route}|${i}`, done: true, user_name: who, device_time: new Date(Date.parse(nz(d, 180)) + i * gap * 1000).toISOString(), lat: -36.9 + i * 0.001 + off, lng: 174.9, accuracy_m: 10 }); };
const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
days.forEach((d, i) => { lay(`a${i}`, 'HOWICK06', d, 'Lisa'); crewEvents.push({ user_name: 'Lisa', device_time: nz(d, 170), state: 'on_duty', helpers: ['Lenny'] }); });
days.slice(0, 4).forEach((d, i) => lay(`b${i}`, 'HOWICK13', d, 'Mike'));
lay('b4', 'HOWICK13', '2026-11-20', 'Mike', { off: 0.01 });        // Friday: Mike's ticks are a kilometre from where that run is usually ticked
lay('c0', 'HOWICK11', '2026-11-19', 'Moana', { gap: 2 });          // Thursday: Mum's run ticked in one go
const M = crewMornings({ runs, ticks, crewEvents });
t('each crew’s morning is judged on its own: ticked as you go, at the address', () => {
  const of = (d, who) => M.find((m) => m.date === d && m.driver === who);
  assert.equal(of('2026-11-18', 'Lisa').clean, true); assert.deepEqual(of('2026-11-18', 'Lisa').crew, ['Lisa', 'Lenny']);
  assert.equal(of('2026-11-20', 'Mike').clean, false); assert.equal(of('2026-11-20', 'Mike').why, 'away'); assert.equal(of('2026-11-20', 'Mike').atPct, 0);
  assert.equal(of('2026-11-19', 'Moana').clean, false); assert.equal(of('2026-11-19', 'Moana').why, 'bulk');
});
t('a helper’s mornings are those of the driver they were with', () => { const d = personDays(M, 'Lenny'); assert.equal(d.length, 5); assert.ok(d.every((x) => x.driver === 'Lisa' && x.clean)); assert.equal(streak(d).count, 5); });
t('a morning with too few checkable ticks isn’t marked down', () => { const m = crewMornings({ runs: [{ id: 'x', route: 'HOWICK10', delivery_date: '2026-11-20' }], ticks: Array.from({ length: 12 }, (_, i) => ({ run_id: 'x', address_key: `k${i}`, done: true, user_name: 'Zaph', device_time: new Date(Date.parse(nz('2026-11-20', 200)) + i * 60e3).toISOString() })) }); assert.equal(m.length, 1); assert.equal(m[0].atPct, null); assert.equal(m[0].clean, true); });
t('the family’s week is a count with no names: clean crew-mornings out of all of them', () => { const w = familyWeek(M, '2026-11-20'); assert.deepEqual(w, { week: '2026-11-16', total: 11, clean: 9 }); assert.deepEqual(Object.keys(w), ['week', 'total', 'clean']); assert.equal(familyWeek(M, '2026-11-18').total, 6); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
