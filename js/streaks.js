// Clean mornings in a row (decision 0053). A clean morning is one where the record can be trusted: stops ticked as the
// papers went in, at the address. It has nothing to do with speed, and couldn't-deliver stops recorded properly don't count
// against it. Everything here is worked out from the same runs and ticks as the end-of-shift card; nothing is stored.

import { runMornings, metres } from './insights.js';
import { crewsByDay, AWAY_M } from './shiftsummary.js';

export const CLEAN_AT_PCT = 90;    // this share of the ticks we can check were made at the address
export const MIN_CHECKED = 10;     // fewer checkable ticks than this: nothing to judge by, so the morning isn't marked down
export const MIN_TICKS = 10;       // a crew's morning needs at least this many ticks to count at all
const USUAL = 3;                   // times an address has been ticked before we know where "at the address" is
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** Monday of the week a day falls in, as YYYY-MM-DD. Weeks run Monday to Sunday. */
export function weekOf(date) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }

/**
 * Every crew's morning in the period: [{ date, driver, crew, runs, ticks, bulk, checked, atPct, clean, why }].
 * A run belongs to the crew whose people made at least a third of its ticks; otherwise to whoever ticked most.
 */
export function crewMornings({ runs = [], ticks = [], crewEvents = [], deadlines } = {}) {
  const byDay = crewsByDay(crewEvents);
  const mornings = runMornings(runs, ticks, deadlines).filter((m) => m.ticks > 0);
  const pts = new Map();
  for (const m of mornings) if (!m.bulk) for (const t of m.list) if (t.lat != null && (t.accuracy_m ?? 0) <= 50) { if (!pts.has(t.address_key)) pts.set(t.address_key, []); pts.get(t.address_key).push(t); }
  const home = new Map([...pts].filter(([, v]) => v.length >= USUAL).map(([k, v]) => [k, { lat: median(v.map((x) => x.lat)), lng: median(v.map((x) => x.lng)), n: v.length }]));
  const groups = new Map();
  for (const m of mornings) {
    const made = new Map(); for (const t of m.list) made.set(t.user_name, (made.get(t.user_name) || 0) + 1);
    const crews = (byDay.get(m.date) || []).map((c) => ({ driver: c.driver, crew: [c.driver, ...c.helpers] }));
    let own = crews.map((c) => ({ ...c, n: c.crew.reduce((n, who) => n + (made.get(who) || 0), 0) })).filter((c) => c.n * 3 >= m.ticks).sort((a, b) => b.n - a.n)[0];
    if (!own) { const top = [...made].filter(([who]) => who).sort((a, b) => b[1] - a[1])[0]; if (!top) continue; own = { driver: top[0], crew: [top[0]] }; }
    const key = `${m.date}|${own.driver}`;
    if (!groups.has(key)) groups.set(key, { date: m.date, driver: own.driver, crew: own.crew, runs: [], ticks: 0, bulk: false, checked: 0, at: 0 });
    const g = groups.get(key); g.runs.push(m.route); g.ticks += m.ticks; if (m.bulk) g.bulk = true;
    if (!m.bulk) for (const t of m.list) {
      const h = home.get(t.address_key); if (t.lat == null || (t.accuracy_m ?? 0) > 50 || !h || h.n <= USUAL) continue;   // needs other mornings to compare with
      g.checked += 1; if (metres(h, t) <= AWAY_M) g.at += 1;
    }
  }
  return [...groups.values()].filter((g) => g.ticks >= MIN_TICKS).map((g) => {
    const atPct = g.checked >= MIN_CHECKED ? Math.round((g.at / g.checked) * 100) : null;
    const why = g.bulk ? 'bulk' : atPct != null && atPct < CLEAN_AT_PCT ? 'away' : null;
    return { date: g.date, driver: g.driver, crew: g.crew, runs: g.runs.sort(), ticks: g.ticks, bulk: g.bulk, checked: g.checked, atPct, clean: !why, why };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.driver.localeCompare(b.driver));
}

/** One person's mornings, oldest first: a helper's are those of whichever driver they were with each day. */
export const personDays = (mornings, name) => mornings.filter((m) => m.crew.includes(name)).map((m) => ({ date: m.date, clean: m.clean, why: m.why, driver: m.driver }));

/**
 * The run of clean mornings up to the last day given. Days not worked don't break it. One let-off a week (Monday to
 * Sunday): the first morning that isn't clean is let go and the count carries on, without counting that day.
 * Returns { count, best, last: { date, clean, why, letOff } | null, letOffLeft }.
 */
export function streak(days = []) {
  let count = 0; let best = 0; let used = null; let last = null;
  for (const d of days) {
    let letOff = false;
    if (d.clean) count += 1; else if (weekOf(d.date) !== used) { used = weekOf(d.date); letOff = true; } else count = 0;
    best = Math.max(best, count); last = { date: d.date, clean: d.clean, why: d.why || null, letOff };
  }
  return { count, best, last, letOffLeft: !last || weekOf(last.date) !== used };
}

/** The whole family's week so far: how many crew-mornings, and how many were clean. No names. */
export function familyWeek(mornings, today) {
  const wk = weekOf(today); const ms = mornings.filter((m) => weekOf(m.date) === wk && m.date <= today);
  return { week: wk, total: ms.length, clean: ms.filter((m) => m.clean).length };
}

/** Plain words for the card. */
export const WHY = { bulk: 'a run was ticked in one go afterwards, not as the papers went in', away: 'too many ticks were made away from the address' };
export function streakText(s) {
  if (!s.last) return [];
  const n = s.count; const row = n === 1 ? '1 clean morning' : `${n} clean mornings in a row`;
  if (s.last.clean) return [n > 0 ? `${row}.` : '', n === s.best && n >= 2 ? 'That’s your best in the last four weeks.' : ''].filter(Boolean);
  if (s.last.letOff) return [`Today wasn’t a clean one: ${WHY[s.last.why] || 'the record had gaps'}.`, n > 0 ? `I’ve let it go, so you keep your ${row}. One let-off a week.` : 'I’ve let it go. One let-off a week.'];
  return [`Today wasn’t a clean one: ${WHY[s.last.why] || 'the record had gaps'}.`, 'The count starts again tomorrow.'];
}
