// Stan's Paper Run (decision 0034): a small game for when there are no runs to do.
// Stan runs down a street. Jump the dogs and locked gates, throw a paper into every letterbox,
// don't throw into a sprinkler (wet paper), and grab batteries before the phone dies.
// Three complaints, or a flat phone, and the run's over. Our own characters, streets and jokes.
//
// The rules are in step(): pure, no screen, tested (test/stangame.mjs). openStanGame() draws them.

import { stanHead, STAN_DEFS } from './stan.js';

// ---------- the rules ----------
export const W = 360; export const H = 200; export const GROUND = 162; // the street, in game units
export const STAN_X = 60; export const STAN_W = 36; export const STAN_H = 46;
const GRAVITY = 1500; const JUMP = 470; const PAPER_VX = 210; const PAPER_VY = -250; const PAPER_G = 900;
export const MAX_COMPLAINTS = 3; export const BATTERY_S = 32; // seconds a full battery lasts
export const PER_STREET = 8;                                  // letterboxes in a street
const STREETS = ['Kowhai Street', 'Tui Terrace', 'Harbour Road', 'Kereru Lane', 'Nikau Place', 'Pukeko Street', 'Rata Road', 'Weka Way'];

/** A small repeatable random-number maker, so a game can be replayed exactly (and tested). */
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function newGame(seed = 1) {
  return { seed, rand: rng(seed), t: 0, speed: 96, y: 0, vy: 0, score: 0, streak: 0, best: 0, delivered: 0, complaints: 0, battery: 1,
    street: 1, inStreet: 0, things: [], papers: [], nextAt: 220, x: 0, over: null, said: null, saidAt: -9, events: [] };
}
export const streetName = (n) => STREETS[(n - 1) % STREETS.length];
/** The clock on the game screen: starts 4:30 am, a street takes about 12 minutes. */
export const clockText = (g) => { const m = 270 + Math.floor((g.street - 1) * 12 + (g.inStreet / PER_STREET) * 12); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} am`; };

const say = (g, text, kind = 'info') => { g.said = text; g.saidAt = g.t; g.events.push({ kind, text }); };
function complain(g, why) {
  g.complaints += 1; g.streak = 0; say(g, why, 'bad');
  if (g.complaints >= MAX_COMPLAINTS) { g.over = 'complaints'; g.events.push({ kind: 'over', text: 'Three complaints. The run owner is on the phone.' }); }
}

/** What comes down the street next. Later streets are faster and busier. */
function spawn(g) {
  const r = g.rand(); const hard = Math.min(1, (g.street - 1) / 6);
  const at = g.x + W + 20;
  if (r < 0.46) g.things.push({ kind: 'box', x: at, sprinkler: g.rand() < 0.18 + hard * 0.3, phase: g.rand() * 2 });
  else if (r < 0.70) g.things.push({ kind: 'dog', x: at });
  else if (r < 0.86) g.things.push({ kind: 'gate', x: at });
  else g.things.push({ kind: 'battery', x: at, y: 62 + g.rand() * 18 });
  g.nextAt = at + 150 + g.rand() * (150 - hard * 70);
}

/**
 * Move the game on by dt seconds. input: { jump, throw } (true on the moment the button went down).
 * Changes and returns g. g.events collects what just happened (for sounds and words); the caller empties it.
 */
export function step(g, dt, input = {}) {
  if (g.over) return g;
  dt = Math.min(dt, 0.05);
  g.t += dt; g.speed = Math.min(230, 96 + (g.street - 1) * 14 + g.t * 0.6);
  g.x += g.speed * dt;
  // Stan
  if (input.jump && g.y === 0) { g.vy = JUMP; g.events.push({ kind: 'jump' }); }
  if (g.y > 0 || g.vy > 0) { g.y += g.vy * dt; g.vy -= GRAVITY * dt; if (g.y <= 0) { g.y = 0; g.vy = 0; } }
  if (input.throw && g.papers.length < 2) { g.papers.push({ x: g.x + STAN_X + 18, y: GROUND - STAN_H - g.y + 8, vy: PAPER_VY }); g.events.push({ kind: 'throw' }); }
  // the phone's battery
  g.battery -= dt / BATTERY_S;
  if (g.battery <= 0) { g.battery = 0; g.over = 'battery'; g.events.push({ kind: 'over', text: 'Phone died mid-run.' }); return g; }
  if (g.x + W > g.nextAt - 20) spawn(g);
  const sx = g.x + STAN_X; // Stan's left edge in street units
  for (const th of g.things) {
    if (th.gone) continue;
    if (th.kind === 'box') {
      th.phase += dt;
      if (!th.done && th.x + 14 < sx - 6) { th.done = 'missed'; g.inStreet += 1; complain(g, 'Missed delivery!'); }
    } else if (th.kind === 'dog' || th.kind === 'gate') {
      const w = th.kind === 'dog' ? 26 : 16; const hgt = th.kind === 'dog' ? 20 : 30;
      if (!th.hit && sx + STAN_W - 12 > th.x + 4 && sx + 12 < th.x + w - 4 && g.y < hgt - 8) // forgiving: only a square-on bump counts
        { th.hit = true; complain(g, th.kind === 'dog' ? 'Dog!' : 'Gate locked!'); }
    } else if (th.kind === 'battery') {
      const sy = GROUND - STAN_H - g.y;
      if (sx + STAN_W > th.x && sx < th.x + 16 && sy < th.y + 18 && sy + STAN_H > th.y) { th.gone = true; g.battery = Math.min(1, g.battery + 0.45); g.score += 5; say(g, 'Battery!', 'good'); }
    }
    if (th.x < g.x - 60) th.gone = true;
  }
  // papers in the air
  for (const p of g.papers) {
    p.x += (g.speed + PAPER_VX) * dt; p.y += p.vy * dt; p.vy += PAPER_G * dt;
    for (const th of g.things) {
      if (th.kind !== 'box' || th.done || p.gone) continue;
      if (p.x > th.x - 4 && p.x < th.x + 22 && p.y > GROUND - 40 && p.y < GROUND - 4) {
        p.gone = true; g.inStreet += 1;
        if (th.sprinkler && sprinklerOn(th)) { th.done = 'wet'; complain(g, 'Wet paper!'); }
        else { th.done = 'ok'; g.streak += 1; g.best = Math.max(g.best, g.streak); g.delivered += 1; g.score += 10 * Math.min(5, g.streak); g.events.push({ kind: 'deliver', streak: g.streak }); if (g.streak > 1 && g.streak % 5 === 0) say(g, `${g.streak} in a row!`, 'good'); }
      }
    }
    if (p.y > GROUND || p.x > g.x + W + 40) p.gone = true;
  }
  if (g.inStreet >= PER_STREET && !g.over) { g.inStreet = 0; g.score += 25; say(g, `${streetName(g.street)} done. Stan-tastic!`, 'street'); g.street += 1; if (g.complaints > 0) g.complaints -= 1; } // a finished street wins one complaint back
  g.things = g.things.filter((t) => !t.gone); g.papers = g.papers.filter((p) => !p.gone);
  return g;
}
/** A sprinkler sprays for the first 0.9 s of every 1.8 s. */
export const sprinklerOn = (th) => th.phase % 1.8 < 0.9;

/** The family board: each person's best, highest first. rows: [{ user_name, score, streets, delivered }] */
export function leaderboard(rows, limit = 8) {
  const best = new Map();
  for (const r of rows || []) { if (!r?.user_name || !(r.score >= 0)) continue; const b = best.get(r.user_name); if (!b || r.score > b.score) best.set(r.user_name, r); }
  return [...best.values()].sort((a, b) => b.score - a.score || String(a.user_name).localeCompare(String(b.user_name))).slice(0, limit);
}
/** What the game hands to the store when a run ends. */
export const scoreRow = (g) => ({ score: Math.round(g.score), streets: g.street - 1, delivered: g.delivered, best_streak: g.best, ended: g.over || 'quit' });

// ---------- the screen ----------
const SPRITE = (extra) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 -22 172 196" width="172" height="196">${STAN_DEFS}<style>.st-mouth,${extra}{display:none}</style>${stanHead('none')}</svg>`)}`;
const img = (src) => { const i = new Image(); i.src = src; return i; };

/**
 * Open the game over the app. store: saveScore(row), loadScores(); me: { name }; sound(freq) plays a blip (or nothing).
 */
export function openStanGame({ store, me, sound = () => {}, onClose = () => {} } = {}) {
  const el = document.createElement('div'); el.className = 'sg';
  el.innerHTML = `<div class="sg-top"><b>Stan’s Paper Run</b><button class="sg-x" aria-label="Close the game">✕</button></div>
    <div class="sg-hud" aria-live="off"><span class="sg-score">0</span><span class="sg-street"></span><span class="sg-life"></span></div>
    <canvas class="sg-c" width="${W * 2}" height="${H * 2}" aria-label="Game screen"></canvas>
    <div class="sg-pad"><button class="sg-btn sg-jump">Jump</button><button class="sg-btn sg-throw">Throw</button></div>
    <div class="sg-panel"></div>`;
  document.body.append(el);
  const c = el.querySelector('canvas'); const x = c.getContext('2d'); const panel = el.querySelector('.sg-panel');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sprites = { run: img(SPRITE('.st-eye-wink,.st-eye-happy')), up: img(SPRITE('.st-eye-l,.st-eye-open,.st-eye-wink')), oops: img(SPRITE('.st-eye-open,.st-eye-happy')) };
  let g = null; let raf = 0; let last = 0; let input = {}; let closed = false; let flash = 0;
  const hud = () => {
    el.querySelector('.sg-score').textContent = `${Math.round(g.score)}`;
    el.querySelector('.sg-street').textContent = `${streetName(g.street)} · ${clockText(g)}`;
    el.querySelector('.sg-life').textContent = `${'⚠'.repeat(g.complaints)}${'·'.repeat(MAX_COMPLAINTS - g.complaints)}`;
    el.querySelector('.sg-life').setAttribute('aria-label', `${g.complaints} of ${MAX_COMPLAINTS} complaints`);
  };
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.roundRect(X, Y, w, h, r); x.fill(); };
  function draw() {
    x.setTransform(2, 0, 0, 2, 0, 0); x.imageSmoothingEnabled = true;
    // dawn sky, hills, road
    const sky = x.createLinearGradient(0, 0, 0, GROUND); sky.addColorStop(0, '#0d1b3a'); sky.addColorStop(.7, '#3b3470'); sky.addColorStop(1, '#f59e6b'); x.fillStyle = sky; x.fillRect(0, 0, W, GROUND);
    x.fillStyle = '#fff'; for (let i = 0; i < 14; i++) x.fillRect((i * 67 + 13 - g.x * 0.03) % W + (i * 67 + 13 - g.x * 0.03 < 0 ? W : 0), (i * 29) % 70 + 6, 1.5, 1.5);
    x.fillStyle = '#1f2a4d'; for (let i = -1; i < 5; i++) { const hx = i * 110 - (g.x * 0.15) % 110; x.beginPath(); x.ellipse(hx + 55, GROUND, 70, 34, 0, Math.PI, 0); x.fill(); }
    // houses behind the fence
    for (let i = -1; i < 5; i++) { const hx = i * 96 - (g.x * 0.5) % 96; x.fillStyle = ['#51407a', '#3f5a86', '#7a4a5a'][((Math.floor(g.x * 0.5 / 96) + i) % 3 + 3) % 3]; x.fillRect(hx + 12, GROUND - 58, 60, 58); x.fillStyle = '#2b2440'; x.beginPath(); x.moveTo(hx + 6, GROUND - 58); x.lineTo(hx + 42, GROUND - 82); x.lineTo(hx + 78, GROUND - 58); x.fill(); x.fillStyle = '#fde68a'; x.fillRect(hx + 22, GROUND - 44, 12, 12); }
    x.fillStyle = '#2f3440'; x.fillRect(0, GROUND, W, H - GROUND); x.fillStyle = '#4b5263'; x.fillRect(0, GROUND, W, 3);
    x.fillStyle = '#fbbf24'; for (let i = 0; i < 8; i++) x.fillRect(i * 56 - (g.x % 56), GROUND + 20, 26, 3);
    for (const th of g.things) {
      const X = th.x - g.x;
      if (th.kind === 'box') {
        x.fillStyle = '#8b6b4a'; x.fillRect(X + 7, GROUND - 22, 4, 22);
        x.fillStyle = th.done === 'ok' ? '#22c55e' : th.done ? '#ef4444' : '#e5e7eb'; rr(X, GROUND - 36, 18, 14, 3);
        x.fillStyle = '#111'; x.fillRect(X + 3, GROUND - 31, 12, 2);
        if (th.done === 'ok') { x.fillStyle = '#fff'; x.font = 'bold 10px system-ui'; x.fillText('✓', X + 5, GROUND - 40); }
        if (th.sprinkler) { x.fillStyle = '#64748b'; x.fillRect(X - 14, GROUND - 6, 6, 6); if (sprinklerOn(th)) { x.strokeStyle = '#7dd3fc'; x.lineWidth = 1.5; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(X - 11, GROUND - 6); x.quadraticCurveTo(X - 2 + k * 5, GROUND - 52 + k * 3, X + 6 + k * 6, GROUND - 22); x.stroke(); } } }
      } else if (th.kind === 'dog') {
        x.fillStyle = '#a16207'; rr(X, GROUND - 14, 22, 12, 5); rr(X + 16, GROUND - 22, 11, 11, 4); x.fillRect(X + 3, GROUND - 4, 3, 4); x.fillRect(X + 15, GROUND - 4, 3, 4);
        x.fillStyle = '#713f12'; x.fillRect(X + 17, GROUND - 25, 3, 5); x.fillStyle = '#111'; x.fillRect(X + 23, GROUND - 18, 2, 2);
      } else if (th.kind === 'gate') {
        x.fillStyle = '#9ca3af'; for (let k = 0; k < 4; k++) x.fillRect(X + k * 5, GROUND - 30, 2.5, 30); x.fillRect(X - 1, GROUND - 26, 19, 2.5); x.fillRect(X - 1, GROUND - 10, 19, 2.5);
        x.fillStyle = '#fbbf24'; rr(X + 5, GROUND - 21, 7, 7, 2);
      } else if (th.kind === 'battery') {
        x.fillStyle = '#22c55e'; rr(X, th.y, 16, 10, 2); x.fillRect(X + 16, th.y + 3, 2, 4); x.fillStyle = '#052e16'; x.font = 'bold 8px system-ui'; x.fillText('+', X + 5, th.y + 8);
      }
    }
    x.fillStyle = '#f8fafc'; for (const p of g.papers) { x.save(); x.translate(p.x - g.x, p.y); x.rotate(g.t * 12); x.fillRect(-5, -2, 10, 4); x.restore(); }
    // Stan: legs drawn here so they can run, head from his own drawing
    const sy = GROUND - STAN_H - g.y; const swing = g.y > 0 ? 0.5 : Math.sin(g.t * 16) * 0.6;
    for (const [lx, s] of [[STAN_X + 12, swing], [STAN_X + 24, -swing]]) { x.save(); x.translate(lx, sy + 33); x.rotate(s); x.fillStyle = '#26282c'; rr(-3.5, 0, 7, 14, 3.5); x.fillStyle = '#22e6f2'; rr(-3.5, 10, 7, 4, 2); x.restore(); }
    const sp = flash > 0 ? sprites.oops : g.y > 0 ? sprites.up : sprites.run;
    if (sp.complete && sp.naturalWidth) x.drawImage(sp, STAN_X - 4, sy - 10, 44, 50); else { x.fillStyle = '#ffc400'; rr(STAN_X, sy, STAN_W, 36, 12); }
    if (flash > 0 && Math.floor(flash * 16) % 2) { x.fillStyle = 'rgba(239,68,68,.25)'; x.fillRect(0, 0, W, H); }
    // battery meter and what Stan just said
    x.fillStyle = '#111827'; rr(W - 62, 8, 52, 12, 3); x.fillStyle = g.battery > 0.3 ? '#22c55e' : '#ef4444'; rr(W - 60, 10, 48 * g.battery, 8, 2); x.fillStyle = '#111827'; x.fillRect(W - 10, 11, 2, 6);
    if (g.said && g.t - g.saidAt < 1.4) { x.font = 'bold 13px system-ui'; const w = x.measureText(g.said).width + 14; x.fillStyle = '#ffc400'; rr(STAN_X + 30, Math.max(6, sy - 26), w, 20, 8); x.fillStyle = '#17130a'; x.fillText(g.said, STAN_X + 37, Math.max(6, sy - 26) + 14); }
  }
  function frame(ts) {
    if (closed) return;
    const dt = last ? (ts - last) / 1000 : 0; last = ts;
    step(g, dt, input); input = {}; flash = Math.max(0, flash - dt);
    for (const e of g.events) {
      if (e.kind === 'jump') sound(660); else if (e.kind === 'throw') sound(520); else if (e.kind === 'deliver') sound(880 + Math.min(5, e.streak) * 90);
      else if (e.kind === 'bad') { sound(180); flash = 0.5; navigator.vibrate?.(60); } else if (e.kind === 'street') sound(1320); else if (e.kind === 'good') sound(990);
    }
    g.events.length = 0; draw(); hud();
    if (g.over) return finish();
    raf = requestAnimationFrame(frame);
  }
  async function finish() {
    const row = scoreRow(g);
    const why = g.over === 'battery' ? 'Phone died mid-run.' : 'Three complaints. The run owner is on the phone.';
    panel.innerHTML = ''; panel.hidden = false;
    const hEl = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
    panel.append(hEl('h3', why), hEl('p', `${row.score} points · ${row.delivered} delivered · ${row.streets} street${row.streets === 1 ? '' : 's'} · best streak ${row.best_streak}`, 'sg-sum'));
    const board = hEl('div', 'Saving your score…', 'sg-board'); panel.append(board);
    const again = hEl('button', 'Play again', 'btn primary big'); again.onclick = start; panel.append(again);
    let rows = [];
    try { await store?.saveScore?.(row); } catch { /* kept for later, or not: it's a game */ }
    try { rows = (await store?.loadScores?.()) || []; } catch { rows = []; }
    if (closed) return;
    const top = leaderboard([...rows, { user_name: me?.name || 'Me', ...row }]);
    board.textContent = ''; board.append(hEl('b', 'Family high scores'));
    const ol = document.createElement('ol'); top.forEach((r) => { const li = hEl('li', `${r.user_name}  ${r.score}`); if (r.user_name === (me?.name || 'Me')) li.className = 'me'; ol.append(li); }); board.append(ol);
    if (top[0]?.user_name === (me?.name || 'Me') && top[0].score === row.score && row.score > 0) board.append(hEl('p', 'Top of the board. Stan-tastic!', 'sg-top-msg'));
  }
  function start() { panel.hidden = true; g = newGame((Date.now() % 2147483647) || 1); last = 0; flash = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
  function intro() {
    g = newGame(1); draw(); hud(); panel.hidden = false;
    panel.innerHTML = `<h3>How to play</h3><ul class="sg-how"><li><b>Throw</b> a paper into every letterbox. Miss one and it’s a complaint.</li><li><b>Jump</b> the dogs and the locked gates.</li><li>Don’t throw while a sprinkler is on: wet paper.</li><li>Grab the green batteries before the phone dies.</li><li>Three complaints and the run’s over. Finish a street to clear one.</li></ul>`;
    const go = document.createElement('button'); go.className = 'btn primary big'; go.textContent = reduce ? 'Start (it moves quickly)' : 'Start'; go.onclick = start; panel.append(go);
  }
  const press = (k) => (e) => { e.preventDefault(); if (!panel.hidden) return; input[k] = true; };
  el.querySelector('.sg-jump').addEventListener('pointerdown', press('jump')); el.querySelector('.sg-throw').addEventListener('pointerdown', press('throw'));
  c.addEventListener('pointerdown', (e) => press(e.offsetX < c.clientWidth / 2 ? 'jump' : 'throw')(e));
  const key = (e) => { if (e.key === ' ' || e.key === 'ArrowUp') press('jump')(e); else if (e.key === 'Enter' || e.key === 'ArrowRight') press('throw')(e); else if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  const hide = () => { if (document.visibilityState !== 'visible' && g && !g.over && panel.hidden) { cancelAnimationFrame(raf); last = 0; panel.hidden = false; panel.innerHTML = '<h3>Paused</h3>'; const b = document.createElement('button'); b.className = 'btn primary big'; b.textContent = 'Carry on'; b.onclick = () => { panel.hidden = true; last = 0; raf = requestAnimationFrame(frame); }; panel.append(b); } };
  document.addEventListener('visibilitychange', hide);
  function close() { if (closed) return; closed = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', hide); el.remove(); onClose(); }
  el.querySelector('.sg-x').onclick = close;
  intro();
  return { close, get game() { return g; }, start };
}
