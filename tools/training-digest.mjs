// The end-of-day email from Stan (decision 0065): each person gets the What's new cards for them from the last week that
// they haven't already read in the app, each linked to its lesson in Stan's School. Never the same card twice.
// Run by GitHub every evening (.github/workflows/training-digest.yml). By hand: node tools/training-digest.mjs [--dry-run]
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (to read the people list), RESEND_API_KEY and EMAIL_FROM (to send).
// Without the email settings it says what it would send and stops: nothing is lost, the cards wait for the next run.

import { rolesOf } from '../js/whatsnew.js';
import { emailCards, emailFor } from '../js/training.js';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''); const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND = process.env.RESEND_API_KEY || ''; const FROM = process.env.EMAIL_FROM || '';
const SITE = (process.env.SITE_URL || 'https://whoisdoingthis-star.github.io/stb-runs/').replace(/\/?$/, '/');
const dry = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true' || !RESEND || !FROM;
if (!URL_ || !KEY) { console.log('No Supabase details here, so nothing to do. (On GitHub they come from the repository secrets.)'); process.exit(0); }
if (!RESEND || !FROM) console.log('Email isn’t set up yet (RESEND_API_KEY and EMAIL_FROM in the repository secrets), so this is a dry run.');

const rest = async (path, init = {}) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
};
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
const [members, seen, emailed] = await Promise.all([
  rest('members?select=email,display_name,role,crew,active&active=eq.true'),
  rest('update_seen?select=update_id,user_name&limit=10000'),
  rest('training_emails?select=email,update_id&limit=10000'),
]);
let sent = 0; let failed = 0;
for (const m of members) {
  const roles = rolesOf({ driver: (m.crew || 'driver') === 'driver', dispatcher: m.role === 'dispatcher' });
  const cards = emailCards(roles, { today, seen: seen.filter((r) => r.user_name === m.display_name).map((r) => r.update_id), emailed: emailed.filter((r) => r.email.toLowerCase() === m.email.toLowerCase()).map((r) => r.update_id) });
  if (!cards.length) { console.log(`  ${m.display_name}: nothing new`); continue; }
  const mail = emailFor(m.display_name, cards, SITE);
  if (dry) { console.log(`  ${m.display_name}: would send “${mail.subject}” (${cards.map((u) => u.id).join(', ')})`); continue; }
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, to: [m.email], subject: mail.subject, html: mail.html, text: mail.text }) });
  if (!r.ok) { failed += 1; console.log(`  ✗ ${m.display_name}: ${r.status} ${(await r.text()).slice(0, 200)}`); continue; }
  await rest('training_emails', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(cards.map((u) => ({ email: m.email, update_id: u.id }))) });
  sent += 1; console.log(`  ✓ ${m.display_name}: ${cards.length} card${cards.length > 1 ? 's' : ''}`);
}
console.log(dry ? 'Dry run: nothing sent.' : `Sent ${sent}${failed ? `, ${failed} failed (they'll be tried again tomorrow)` : ''}.`);
process.exit(failed && !sent ? 1 : 0);
