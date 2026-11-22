import assert from 'node:assert/strict';
import { outcome, quietNow, nzHour } from '../tools/build-queue.mjs';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
t('a voice build is published only when it was built, the checks passed and the reviewer said publish', () => {
  assert.equal(outcome({ built: true, checks: 'success', verdict: 'publish' }), 'done');
  assert.equal(outcome({ built: true, checks: 'success', verdict: 'hold' }), 'held');
  assert.equal(outcome({ built: true, checks: 'success', verdict: undefined }), 'held');
  assert.equal(outcome({ built: true, checks: 'failure', verdict: 'publish' }), 'failed');
  assert.equal(outcome({ built: false, checks: 'success', verdict: 'publish' }), 'failed');
});
t('a builder that stops for one of Mike’s exceptions is held, whatever else happened', () => assert.equal(outcome({ held: true, built: true, checks: 'success', verdict: 'publish' }), 'held'));
t('nothing is built or published while the runs are on, 1 am to 8 am New Zealand time, summer or winter', () => {
  assert.equal(nzHour(new Date('2026-11-22T18:30:00Z')), 7); assert.equal(quietNow(new Date('2026-11-22T18:30:00Z')), true);     // 7:30 am NZDT
  assert.equal(quietNow(new Date('2026-11-22T19:05:00Z')), false);                                                              // 8:05 am NZDT
  assert.equal(quietNow(new Date('2026-11-22T11:30:00Z')), false);                                                              // 12:30 am NZDT
  assert.equal(quietNow(new Date('2026-11-22T12:10:00Z')), true);                                                               // 1:10 am NZDT
  assert.equal(nzHour(new Date('2026-07-01T14:30:00Z')), 2); assert.equal(quietNow(new Date('2026-07-01T14:30:00Z')), true);     // 2:30 am NZST
});
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
