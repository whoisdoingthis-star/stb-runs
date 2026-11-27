import { applySequence, moveKeys, mergeOrder, seqTarget } from '../js/sequence.js';
import assert from 'assert';
const t = (n, f) => { try { f(); console.log('✓', n); } catch (e) { console.log('✗', n, e.message); process.exitCode = 1; } };
const L = (...ks) => ks.map((k) => ({ address_key: k }));
const keys = (ls) => ls.map((l) => l.address_key).join(',');
t('no custom order = sheet order', () => assert.equal(keys(applySequence(L('a', 'b', 'c'), null)), 'a,b,c'));
t('custom order applied', () => assert.equal(keys(applySequence(L('a', 'b', 'c'), ['c', 'a', 'b'])), 'c,a,b'));
t('new address stays after its sheet neighbour', () => assert.equal(keys(applySequence(L('a', 'n', 'b', 'c'), ['c', 'a', 'b'])), 'c,a,n,b'));
t('new address at top of sheet goes first', () => assert.equal(keys(applySequence(L('n', 'a', 'b'), ['b', 'a'])), 'n,b,a'));
// Run 6, 23 Nov 2026: 26 Marine Parade came back on the sheet; Mike's own order was made while it was away.
t('an address missing from my own order goes where the usual order has it, not beside its sheet neighbour', () => assert.equal(keys(applySequence(L('x', 'n', 'a', 'b'), ['a', 'b', 'x'], ['a', 'n', 'b', 'x'])), 'a,n,b,x'));
t('…and first, if the usual order has it before everything I know; new to both still follows the sheet', () => { assert.equal(keys(applySequence(L('a', 'n', 'b'), ['b', 'a'], ['n', 'a', 'b'])), 'n,b,a'); assert.equal(keys(applySequence(L('a', 'n', 'b'), ['b', 'a'], ['a', 'b'])), 'b,a,n'); });
t('move one before', () => assert.deepEqual(moveKeys(['a', 'b', 'c', 'd'], ['d'], 'b', false), ['a', 'd', 'b', 'c']));
t('move one after', () => assert.deepEqual(moveKeys(['a', 'b', 'c', 'd'], ['a'], 'c', true), ['b', 'c', 'a', 'd']));
t('move block keeps inner order', () => assert.deepEqual(moveKeys(['a', 'b', 'c', 'd', 'e'], ['d', 'e'], 'a', false), ['d', 'e', 'a', 'b', 'c']));
t('drop on itself is no change', () => assert.deepEqual(moveKeys(['a', 'b'], ['a'], 'a', true), ['a', 'b']));
t('merge keeps addresses not on today\'s sheet', () => assert.deepEqual(mergeOrder(['a', 'x', 'b', 'c'], ['c', 'a', 'b']), ['c', 'a', 'x', 'b']));
t('merge with nothing stored', () => assert.deepEqual(mergeOrder(null, ['b', 'a']), ['b', 'a']));
// Own order for dispatchers too (decision 0031)
t('a driver’s order is always their own', () => { assert.deepEqual(seqTarget({ keys: ['a'], mine: true }, true), { own: true, drop: false }); assert.deepEqual(seqTarget(null, true), { own: true, drop: true }); });
// Run 6, 28 Nov 2026 (lesson L-016): 22 Marine Parade, on Saturday sheets only. Mike drives Marine Parade before Masefield
// Street; the usual order has it after 40 Masefield, so it landed among Masefield, 13 stops from its street.
{
  const K = (s, n) => `HOWICK|${s}|${n}`; const LL = (...ks) => ks.map((k) => ({ address_key: k }));
  const mp22 = K('MARINE PARADE', '22'), mp44 = K('MARINE PARADE', '44'), mp54 = K('MARINE PARADE', '54'), m36 = K('MASEFIELD STREET', '36'), m40 = K('MASEFIELD STREET', '40'), s59 = K('SALE STREET', '59');
  const sheet = LL(m36, m40, mp22, mp44, mp54, s59);
  const mine = [mp44, mp54, m36, m40, s59];
  const usual = [m36, m40, mp22, mp44, mp54, s59];
  t('a missing address goes next to its own street, not after another street’s house the usual order has before it', () => assert.equal(keys(applySequence(sheet, mine, usual)), [mp22, mp44, mp54, m36, m40, s59].join(',')));
  const mp30 = K('MARINE PARADE', '30');
  t('…and with no neighbour on its street in the usual order, beside the house with the nearest number on its street', () => assert.equal(keys(applySequence(LL(m40, mp30, mp44, mp54, s59), mine, [m36, m40, mp30, s59, mp44, mp54])), [mp30, mp44, mp54, m40, s59].join(',')));
  t('…the same street before it in the usual order still wins (as before)', () => assert.equal(keys(applySequence(LL(mp44, mp22, mp54), [mp54, mp44], [mp44, mp22, mp54])), [mp54, mp44, mp22].join(',')));
}
t('a dispatcher’s drags change the usual order', () => { assert.deepEqual(seqTarget({ keys: ['a'], mine: false }, false), { own: false, drop: false }); assert.deepEqual(seqTarget(null, false), { own: false, drop: true }); });
t('a dispatcher who keeps their own order changes only their own', () => assert.deepEqual(seqTarget({ keys: ['a'], mine: true }, false), { own: true, drop: false }));
t('a dispatcher dropping their own order leaves the usual order alone', () => assert.deepEqual(seqTarget({ dropOwn: true }, false), { own: true, drop: true }));
