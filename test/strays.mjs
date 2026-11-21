import assert from 'node:assert/strict';
import { findStrays, findSwaps, numOf } from '../js/strays.js';
import { moveKeys } from '../js/sequence.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const L = (street, ...nums) => nums.map((n) => ({ address_key: `H|${street}|${String(n).replace(/\s/g, '')}`, street, number: String(n) }));
t('house numbers are read from units and letters', () => { assert.deepEqual(numOf('5/ 7'), { unit: '5', n: 7 }); assert.deepEqual(numOf('74C'), { unit: null, n: 74 }); assert.deepEqual(numOf('Shop 2/ 10'), { unit: 'Shop 2', n: 10 }); assert.equal(numOf('').n, null); });
// Run 6, 21 Nov 2026: Hartles Place 7, 12, 15 together; number 3 off on its own after other streets.
const run = [...L('MELLONS BAY ROAD', 164, 167), ...L('HARTLES PLACE', 7, 12, 15), ...L('GLENFERN ROAD', 38, 40), ...L('HARTLES PLACE', 3), ...L('PARKHILL ROAD', 39)];
t('an address on its own, away from the rest of its street, is found, with where it belongs', () => { const s = findStrays(run); assert.equal(s.length, 1); assert.equal(s[0].key, 'H|HARTLES PLACE|3'); assert.equal(s[0].anchorKey, 'H|HARTLES PLACE|7'); assert.equal(s[0].after, false); assert.equal(s[0].gap, 2); });
t('putting it where Stan says leaves the street in one piece, and then there is nothing to find', () => { const s = findStrays(run)[0]; const keys = moveKeys(run.map((l) => l.address_key), [s.key], s.anchorKey, s.after); const by = new Map(run.map((l) => [l.address_key, l])); const next = keys.map((k) => by.get(k)); assert.deepEqual(next.filter((l) => l.street === 'HARTLES PLACE').map((l) => l.number), ['3', '7', '12', '15']); assert.equal(keys.indexOf('H|HARTLES PLACE|3') + 1, keys.indexOf('H|HARTLES PLACE|7')); assert.deepEqual(findStrays(next), []); });
t('a block that runs downhill gets the stray on the right side', () => { const r = [...L('COOK STREET', 112, 110, 108), ...L('A ROAD', 1, 2, 3), ...L('COOK STREET', 114)]; const s = findStrays(r)[0]; assert.equal(s.anchorKey, 'H|COOK STREET|112'); assert.equal(s.after, false); });
t('a long road visited twice is left alone: the numbers are nowhere near', () => assert.deepEqual(findStrays([...L('COOK STREET', 5, 9, 13, 35), ...L('B ROAD', 1, 2, 3), ...L('COOK STREET', 112)]), []));
t('next door in the order is not a stray, and nor is a street with no block', () => { assert.deepEqual(findStrays([...L('HARTLES PLACE', 7, 12), ...L('X ROAD', 1), ...L('HARTLES PLACE', 3)]), []); assert.deepEqual(findStrays([...L('HARTLES PLACE', 7), ...L('X ROAD', 1, 2, 3), ...L('HARTLES PLACE', 3)]), []); });
t('where past ticks say the two places are far apart, it is not a stray whatever the numbers say', () => { const home = new Map([['H|HARTLES PLACE|3', { lat: -36.80, lng: 174.93 }], ['H|HARTLES PLACE|7', { lat: -36.89, lng: 174.93 }]]); assert.deepEqual(findStrays(run, { home }), []); const near = new Map([['H|HARTLES PLACE|3', { lat: -36.89097, lng: 174.93579 }], ['H|HARTLES PLACE|7', { lat: -36.89107, lng: 174.93586 }]]); assert.equal(findStrays(run, { home: near }).length, 1); });
// Cook Street, Run 6: the sheet has "2/ 5" and "5/ 7"; both are units at number 5.
const cook = L('COOK STREET', '5/ 7', '2/ 5', 9, 13, 35, '2/ 34');
t('a unit and number keyed the wrong way round is spotted from its neighbour', () => { const s = findSwaps(cook); assert.equal(s.length, 1); assert.equal(s[0].key, 'H|COOK STREET|5/7'); assert.equal(s[0].suggest, '7/ 5'); });
t('no suggestion when that number is a real house on the street, or nobody else has a unit there', () => { assert.deepEqual(findSwaps(L('COOK STREET', '5/ 7', '2/ 5', 7)), []); assert.deepEqual(findSwaps(L('COOK STREET', '5/ 7', 5, 9)), []); assert.deepEqual(findSwaps(L('COOK STREET', '2/ 34', 35, 42)), []); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
