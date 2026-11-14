import assert from 'node:assert/strict';
// The rules only (no screen): stangame.js imports Stan's drawing, which needs nothing from the browser to load.
import { newGame, step, leaderboard, scoreRow, sprinklerOn, clockText, streetName, GROUND, STAN_X, MAX_COMPLAINTS, PER_STREET, BATTERY_S } from '../js/stangame.js';
let failed = 0;
const t = (name, fn) => { try { fn(); console.log('✓', name); } catch (e) { failed++; console.log('✗', name, '\n ', e.message); } };
const quiet = (g) => { g.nextAt = Infinity; g.battery = 1; return g; };           // an empty street
const run = (g, secs, input = () => ({})) => { for (let i = 0; i < Math.round(secs * 60) && !g.over; i++) { g.battery = Math.max(g.battery, 0.5); step(g, 1 / 60, input(g, i)); } return g; };
const put = (g, thing) => { g.things.push({ phase: 1, ...thing }); return g; };

t('a paper thrown at the right moment lands in the letterbox and scores', () => {
  const g = quiet(newGame(3)); put(g, { kind: 'box', x: g.x + STAN_X + 188 });
  run(g, 1.5, (gg, i) => ({ throw: i === 5 }));
  assert.equal(g.delivered, 1); assert.equal(g.score, 10); assert.equal(g.complaints, 0);
});
t('a letterbox Stan runs past without a paper is a missed delivery', () => {
  const g = quiet(newGame(3)); put(g, { kind: 'box', x: g.x + STAN_X + 60 });
  run(g, 2); assert.equal(g.complaints, 1); assert.equal(g.delivered, 0); assert.equal(g.streak, 0);
});
t('a streak makes each delivery worth more, up to five times', () => {
  const g = quiet(newGame(3)); g.streak = 6; put(g, { kind: 'box', x: g.x + STAN_X + 188 });
  run(g, 1.5, (gg, i) => ({ throw: i === 5 })); assert.equal(g.score, 50); assert.equal(g.streak, 7);
});
t('running into a dog is a complaint; jumping it is not', () => {
  const a = quiet(newGame(3)); put(a, { kind: 'dog', x: a.x + STAN_X + 60 }); run(a, 1.5); assert.equal(a.complaints, 1);
  const b = quiet(newGame(3)); put(b, { kind: 'dog', x: b.x + STAN_X + 60 });
  run(b, 1.5, (g) => ({ jump: g.things[0] && g.things[0].x - (g.x + STAN_X) < 44 && g.y === 0 })); assert.equal(b.complaints, 0);
});
t('a locked gate has to be jumped too', () => {
  const a = quiet(newGame(3)); put(a, { kind: 'gate', x: a.x + STAN_X + 60 }); run(a, 1.5); assert.equal(a.complaints, 1); assert.match(a.said, /Gate locked/);
});
t('a paper thrown into a running sprinkler is a wet paper', () => {
  const g = quiet(newGame(3)); put(g, { kind: 'box', x: g.x + STAN_X + 188, sprinkler: true, phase: 0 });
  assert.ok(sprinklerOn(g.things[0]));
  run(g, 0.8, (gg, i) => ({ throw: i === 5 })); assert.equal(g.complaints, 1); assert.equal(g.delivered, 0); assert.match(g.said, /Wet paper/);
});
t('the same throw with the sprinkler off is a clean delivery', () => {
  const g = quiet(newGame(3)); put(g, { kind: 'box', x: g.x + STAN_X + 188, sprinkler: true, phase: 0.95 });
  run(g, 0.8, (gg, i) => ({ throw: i === 5 })); assert.equal(g.delivered, 1); assert.equal(g.complaints, 0);
});
t('three complaints ends the run', () => {
  const g = quiet(newGame(3)); for (let i = 0; i < MAX_COMPLAINTS; i++) put(g, { kind: 'dog', x: g.x + STAN_X + 60 + i * 80 });
  run(g, 5); assert.equal(g.over, 'complaints');
});
t('the phone dies if no battery is collected, and a battery tops it up', () => {
  const g = quiet(newGame(3)); for (let i = 0; i < (BATTERY_S + 2) * 60 && !g.over; i++) { g.nextAt = Infinity; step(g, 1 / 60); }
  assert.equal(g.over, 'battery');
  const b = quiet(newGame(3)); b.battery = 0.3; put(b, { kind: 'battery', x: b.x + STAN_X + 30, y: GROUND - 30 });
  for (let i = 0; i < 60; i++) step(b, 1 / 60); assert.ok(b.battery > 0.6);
});
t('a street is eight letterboxes; finishing one moves on and clears a complaint', () => {
  const g = quiet(newGame(3)); g.inStreet = PER_STREET - 1; g.complaints = 2; put(g, { kind: 'box', x: g.x + STAN_X + 188 });
  run(g, 1.5, (gg, i) => ({ throw: i === 5 })); assert.equal(g.street, 2); assert.match(g.said, /Stan-tastic/); assert.equal(g.complaints, 1); assert.equal(streetName(1), 'Kowhai Street'); assert.match(clockText(newGame(1)), /^4:30 am$/);
});
t('the same seed plays the same street (so a game can be replayed)', () => {
  const a = newGame(42); const b = newGame(42); for (let i = 0; i < 600; i++) { step(a, 1 / 60); step(b, 1 / 60); }
  assert.deepEqual(a.things.map((x) => [x.kind, Math.round(x.x)]), b.things.map((x) => [x.kind, Math.round(x.x)])); assert.equal(a.complaints, b.complaints);
});
t('the family board shows each person’s best, highest first', () => {
  const top = leaderboard([{ user_name: 'Lisa', score: 120 }, { user_name: 'Mike', score: 90 }, { user_name: 'Lisa', score: 60 }, { user_name: 'Zaph', score: 300 }, { user_name: '', score: 999 }]);
  assert.deepEqual(top.map((r) => [r.user_name, r.score]), [['Zaph', 300], ['Lisa', 120], ['Mike', 90]]);
});
t('the score saved is whole numbers the board can trust', () => { const g = newGame(1); g.score = 41.6; g.street = 3; g.delivered = 4; g.best = 2; g.over = 'battery'; assert.deepEqual(scoreRow(g), { score: 42, streets: 2, delivered: 4, best_streak: 2, ended: 'battery' }); });
console.log(failed ? `${failed} failed` : 'all passed'); process.exit(failed ? 1 : 0);
