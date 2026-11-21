import assert from 'node:assert/strict';
import { UPDATES, updatesFor, unseenFor, unreadCount, rolesOf, whoText, NEWS_DAYS, NEWS_MAX } from '../js/whatsnew.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
t('every card has an id that is its own, a date, who it is for, a short title, what changed and why', () => {
  const ids = new Set();
  for (const u of UPDATES) { assert.match(u.id, /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/, u.id); assert.ok(!ids.has(u.id), `twice: ${u.id}`); ids.add(u.id); assert.equal(u.id.slice(0, 10), u.date, u.id);
    assert.ok(u.for.length && u.for.every((r) => ['driver', 'helper', 'dispatcher', 'all'].includes(r)), u.id); assert.ok(u.title.length >= 8 && u.title.length <= 60, u.id); assert.ok(u.what.length >= 40 && u.what.length <= 360, `${u.id} what ${u.what.length}`); assert.ok(u.why.length >= 20 && u.why.length <= 200, `${u.id} why`); }
});
t('the newest are at the top of the list, so new ones are added there', () => { for (let i = 1; i < UPDATES.length; i++) assert.ok(UPDATES[i - 1].date >= UPDATES[i].date, UPDATES[i].id); });
const L = [
  { id: '2026-11-22-b', date: '2026-11-22', for: ['driver'], title: 't', what: 'w', why: 'y' },
  { id: '2026-11-22-c', date: '2026-11-22', for: ['all'], title: 't', what: 'w', why: 'y' },
  { id: '2026-11-21-a', date: '2026-11-21', for: ['driver', 'helper'], title: 't', what: 'w', why: 'y' },
  { id: '2026-11-21-d', date: '2026-11-21', for: ['dispatcher'], title: 't', what: 'w', why: 'y' },
  { id: '2026-11-01-old', date: '2026-11-01', for: ['all'], title: 't', what: 'w', why: 'y' },
];
t('people get the cards for what they do: a helper isn’t shown drivers’ rules, a dispatcher who drives gets both', () => {
  assert.deepEqual(updatesFor(rolesOf({}), L).map((u) => u.id), ['2026-11-22-c', '2026-11-21-a', '2026-11-01-old']);
  assert.deepEqual(updatesFor(rolesOf({ driver: true, dispatcher: true }), L).map((u) => u.id), ['2026-11-22-b', '2026-11-22-c', '2026-11-21-a', '2026-11-21-d', '2026-11-01-old']);
});
t('the walk-through is the unseen ones from the last two weeks, oldest first', () => {
  const ids = unseenFor(['driver'], [], '2026-11-22', L).map((u) => u.id); assert.equal(ids[0], '2026-11-21-a'); assert.ok(!ids.includes('2026-11-01-old')); assert.equal(ids.length, 3);
  assert.deepEqual(unseenFor(['driver'], ['2026-11-21-a', '2026-11-22-b'], '2026-11-22', L).map((u) => u.id), ['2026-11-22-c']);
  assert.equal(unreadCount(['driver'], ids, '2026-11-22', L), 0);
  assert.ok(NEWS_DAYS >= 7 && NEWS_MAX >= 5);
});
t('a card dated tomorrow isn’t shown early, and each says who it is for', () => { assert.deepEqual(unseenFor(['driver'], [], '2026-11-20', L), []); assert.equal(whoText(L[1]), 'Everyone'); assert.equal(whoText(L[2]), 'Drivers and Helpers'); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
