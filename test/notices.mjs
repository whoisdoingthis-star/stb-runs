import assert from 'node:assert/strict';
import { cleanNotice, expiryFor, isLive, audience, unreadFor, boardFor, seenBy, NOTICE_MAX } from '../js/notices.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const now = Date.parse('2026-11-20T02:00:00Z'); const people = ['Mike', 'Lisa', 'Moana', 'Lenny'];
const N = [
  { id: 'a', from_name: 'Mike', body: 'Papers are late', to_names: null, created_at: '2026-11-19T08:00:00Z', expires_at: '2026-11-22T08:00:00Z' },
  { id: 'b', from_name: 'Lisa', body: 'Lenny: bring the trolley', to_names: ['Lenny'], created_at: '2026-11-19T09:00:00Z', expires_at: null },
  { id: 'c', from_name: 'Mike', body: 'old', to_names: null, created_at: '2026-11-10T08:00:00Z', expires_at: '2026-11-13T08:00:00Z' },
  { id: 'd', from_name: 'Mike', body: 'taken down', to_names: null, created_at: '2026-11-19T10:00:00Z', expires_at: null, removed_at: '2026-11-19T11:00:00Z' }];
const S = [{ notice_id: 'a', user_name: 'Lisa' }];
t('a note is tidied, and an empty one is not sent', () => { assert.equal(cleanNotice('  Gate   code changed \n\n\n\n see Mike '), 'Gate code changed \n\n see Mike'); assert.equal(cleanNotice('   '), null); assert.equal(cleanNotice('x'.repeat(900)).length, NOTICE_MAX); });
t('a note lasts three days unless it is kept until removed', () => { assert.equal(expiryFor('days', now), '2026-11-23T02:00:00.000Z'); assert.equal(expiryFor('forever', now), null); });
t('expired and removed notes are no longer live', () => assert.deepEqual(N.filter((n) => isLive(n, now)).map((n) => n.id), ['a', 'b']));
t('a note goes to everyone but its writer, or only to the people picked', () => { assert.deepEqual(audience(N[0], people), ['Lisa', 'Moana', 'Lenny']); assert.deepEqual(audience(N[1], people), ['Lenny']); });
t('Stan shows each person the notes for them that they haven’t acknowledged, oldest first', () => {
  assert.deepEqual(unreadFor(N, S, 'Lenny', now).map((n) => n.id), ['a', 'b']); assert.deepEqual(unreadFor(N, S, 'Moana', now).map((n) => n.id), ['a']);
  assert.deepEqual(unreadFor(N, S, 'Lisa', now), []); assert.deepEqual(unreadFor(N, S, 'Mike', now), []);
});
t('once acknowledged, a note does not pop up again', () => assert.deepEqual(unreadFor(N, [...S, { notice_id: 'a', user_name: 'Lenny' }, { notice_id: 'b', user_name: 'Lenny' }], 'Lenny', now), []));
t('the board shows a person the live notes for them and from them, newest first', () => { assert.deepEqual(boardFor(N, 'Lisa', now).map((n) => n.id), ['b', 'a']); assert.deepEqual(boardFor(N, 'Moana', now).map((n) => n.id), ['a']); });
t('a note shows who has seen it and who hasn’t yet', () => assert.deepEqual(seenBy(N[0], S, people), { seen: ['Lisa'], waiting: ['Moana', 'Lenny'] }));
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
