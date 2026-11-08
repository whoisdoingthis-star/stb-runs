// Evening fetch: gets tomorrow's run sheets from RouteSmart Optimize and loads
// them into the app, so nobody has to download or upload a PDF.
//
// How it works (mapped from the live site, 8 Nov 2026):
//   1. Sign in through the real login page in a hidden browser (username,
//      Next, password). The site then keeps an access token in sessionStorage.
//   2. POST /api/reports/Reports with that token. The reply is the PDF:
//      { WorkspaceID: 17, ServiceDay: "MON_DRAW", Routes: "HOWICK06,...",
//        Reports: "NZME Daily Activity.rpt,NZME Delivery List.rpt", Collate: false }
//   3. Read it with the app's own parser and check every total.
//   4. Save the runs to Supabase (replacing an earlier load of the same
//      route + date, which keeps any ticks) and keep the PDF for the record.
//
// Run modes (environment variables):
//   CHECK_ONLY=1   just decide whether a fetch is needed now (cheap; no browser)
//   DRY_RUN=1      do everything except save to Supabase
//   PDF_FILE=path  use a PDF on disk instead of downloading (testing)
//   TARGET_DATE=YYYY-MM-DD  fetch a specific delivery date (default: tomorrow, NZ time)
//   FORCE=1        ignore the 19:00-22:00 window and "already fetched"

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appJs = (f) => path.join(here, '..', 'js', f);
const { extractPages, parseReport } = await import(appJs('parser.js'));
const { runRow, lineRows, changeRecord } = await import(appJs('rows.js'));

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const BASE = env('RS_BASE_URL', 'https://optimize.routesmart.com');
const ROUTES = env('RS_ROUTES', 'HOWICK06,HOWICK08,HOWICK10,HOWICK11,HOWICK13').split(',').map((s) => s.trim()).filter(Boolean);
const WORKSPACE = Number(env('RS_WORKSPACE', '17'));
const REPORTS = env('RS_REPORTS', 'NZME Daily Activity.rpt,NZME Delivery List.rpt');
const TZ = 'Pacific/Auckland';
const WINDOW = { from: 19, to: 22 };         // NZ hours the schedule acts in
const LAST_CHANCE = { h: 21, m: 30 };        // after this, a failure emails you
const OUT = path.join(here, 'out');
const flag = (k) => /^(1|true|yes)$/i.test(env(k));

// ---------------------------------------------------------------- dates

function nzParts(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, dow: p.weekday.slice(0, 3).toUpperCase(), h: Number(p.hour), m: Number(p.minute) };
}
function targetDate() {
  const t = env('TARGET_DATE');
  if (t) {
    const d = new Date(`${t}T12:00:00Z`);
    return { iso: t, dow: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3).toUpperCase() };
  }
  const now = nzParts();
  const tomorrow = new Date(Date.parse(`${now.iso}T12:00:00Z`) + 864e5);
  return { iso: tomorrow.toISOString().slice(0, 10), dow: tomorrow.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).slice(0, 3).toUpperCase() };
}

// ---------------------------------------------------------------- output

const summary = [];
const log = (...a) => { console.log(...a); summary.push(a.join(' ')); };
function finish(code, headline) {
  if (headline) log(headline);
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) fs.appendFileSync(f, `### Run sheets\n\n${summary.map((l) => `- ${l}`).join('\n')}\n`);
  process.exit(code);
}
function setOutput(k, v) { const f = process.env.GITHUB_OUTPUT; if (f) fs.appendFileSync(f, `${k}=${v}\n`); }

// ---------------------------------------------------------------- supabase

async function supabase() {
  const url = env('SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function alreadyFetched(sb, iso) {
  if (!sb) return false;
  const { data, error } = await sb.from('runs').select('route').eq('delivery_date', iso).eq('source', 'auto').in('route', ROUTES);
  if (error) throw new Error(`Supabase check failed: ${error.message}`);
  return new Set(data.map((r) => r.route)).size === ROUTES.length;
}

async function saveRun(sb, r, filename) {
  const row = { ...runRow(r, filename), source: 'auto', updated_at: new Date().toISOString() };
  const { data: existing, error: e0 } = await sb.from('runs').select('id').eq('route', r.route).eq('delivery_date', r.deliveryDate).maybeSingle();
  if (e0) throw e0;
  if (existing?.id) {
    // Swap the addresses first and touch the run row last: phones watching the
    // run reload when the row changes, so the new addresses are already there.
    const id = existing.id;
    const { data: oldLines } = await sb.from('run_lines').select('line_key, address_key, street, number, pub, qty, note, parts').eq('run_id', id);
    const rows = lineRows(id, r);
    const { error: e2 } = await sb.from('run_lines').delete().eq('run_id', id);
    if (e2) throw e2;
    const { error: e3 } = await sb.from('run_lines').insert(rows);
    if (e3) throw e3;
    const changes = changeRecord(oldLines || [], rows);
    console.log(`${r.route}: ${changes.count ? `${changes.count} detail(s) changed${changes.items.map((x) => `\n   - ${x}`).join('')}` : 'no details changed'}`);
    const { error } = await sb.from('runs').update({ ...row, last_changes: changes }).eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await sb.from('runs').insert(row).select('id').single();
  if (error) throw error;
  const { error: e3 } = await sb.from('run_lines').insert(lineRows(data.id, r));
  if (e3) throw e3;
  return data.id;
}

// ---------------------------------------------------------------- routesmart

async function downloadPdf(day) {
  const user = env('ROUTESMART_USERNAME'); const pass = env('ROUTESMART_PASSWORD');
  if (!user || !pass) throw new Error('ROUTESMART_USERNAME / ROUTESMART_PASSWORD are not set');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const userBox = page.getByLabel(/user\s*name/i).or(page.locator('input[name*="user" i], input[type="text"]').first());
    await userBox.first().fill(user, { timeout: 30000 });
    await page.getByRole('button', { name: /next/i }).click();
    const pw = page.locator('input[type="password"]');
    await pw.waitFor({ timeout: 30000 });
    await pw.fill(pass);
    await pw.press('Enter');
    const signedIn = () => page.waitForFunction(() => {
      try { return !!JSON.parse(sessionStorage.getItem('userInfo') || '{}').accessToken; } catch { return false; }
    }, null, { timeout: 20000 });
    try { await signedIn(); } catch {
      // Enter didn't submit: press the sign-in button instead.
      await page.getByRole('button', { name: /log\s*in|sign\s*in|submit|continue/i }).first().click({ timeout: 10000 });
      await signedIn();
    }
    log('Signed in to RouteSmart');
    // After sign-in the site moves from /login to its home page. Let that finish
    // before asking for the report, or the request is cut off mid-navigation.
    await page.waitForURL((u) => !/\/login/i.test(u.pathname), { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    const body = { WorkspaceID: WORKSPACE, ServiceDay: `${day.dow}_DRAW`, Routes: ROUTES.join(','), Reports: REPORTS, Collate: false };
    // Make the request from inside the signed-in page, exactly as the site does.
    // If the page is still changing, wait and try again (up to 3 times).
    let res;
    for (let attempt = 1; ; attempt++) {
      try { res = await requestReport(page, body); break; } catch (e) {
        if (attempt >= 3 || !/context was destroyed|navigation|Target closed/i.test(e.message)) throw e;
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
    const pdf = Buffer.from(res.b64, 'base64');
    if (res.status !== 200 || pdf.subarray(0, 5).toString() !== '%PDF-') {
      throw new Error(`Report request returned ${res.status} ${res.type}, not a PDF${pdf.length < 500 ? `: ${pdf.toString().slice(0, 300)}` : ''}`);
    }
    log(`Downloaded report for ${body.ServiceDay}: ${Math.round(pdf.length / 1024)} KB`);
    return pdf;
  } catch (e) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
}

function requestReport(page, body) {
  return page.evaluate(async (b) => {
      const token = JSON.parse(sessionStorage.getItem('userInfo')).accessToken;
      const r = await fetch('/api/reports/Reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/pdf', 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      });
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { status: r.status, type: r.headers.get('content-type'), b64: btoa(bin) };
  }, body);
}

// ---------------------------------------------------------------- main

const now = nzParts();
const day = targetDate();
const force = flag('FORCE');
const inWindow = now.h >= WINDOW.from && now.h < WINDOW.to;
const lastChance = force || now.h > LAST_CHANCE.h || (now.h === LAST_CHANCE.h && now.m >= LAST_CHANCE.m);
const sb = flag('DRY_RUN') ? null : await supabase();
if (!flag('DRY_RUN') && !sb) finish(1, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');

log(`NZ time ${now.iso} ${String(now.h).padStart(2, '0')}:${String(now.m).padStart(2, '0')}; fetching for ${day.iso} (${day.dow})`);

if (!force && !env('TARGET_DATE') && !env('PDF_FILE') && !inWindow) { setOutput('needed', 'false'); finish(0, `Outside ${WINDOW.from}:00-${WINDOW.to}:00 NZ, nothing to do`); }
if (!force && await alreadyFetched(sb, day.iso)) { setOutput('needed', 'false'); finish(0, `Already fetched all ${ROUTES.length} runs for ${day.iso}`); }
setOutput('needed', 'true');
if (flag('CHECK_ONLY')) finish(0, 'A fetch is needed');

try {
  const pdf = env('PDF_FILE') ? fs.readFileSync(env('PDF_FILE')) : await downloadPdf(day);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = parseReport(await extractPages(pdfjs, new Uint8Array(pdf)));
  const filename = `RouteSmart-${day.iso}.pdf`;

  const byRoute = Object.fromEntries(parsed.routes.map((r) => [r.route, r]));
  const missing = ROUTES.filter((rt) => !byRoute[rt]);
  const wrongDate = parsed.routes.filter((r) => r.deliveryDate !== day.iso);
  if (wrongDate.length) throw Object.assign(new Error(`Sheet is for ${wrongDate[0].deliveryDate}, not ${day.iso} yet`), { retry: true });
  if (missing.length) throw Object.assign(new Error(`No delivery list for ${missing.join(', ')}`), { retry: true });

  const bad = parsed.routes.filter((r) => !r.ok);
  for (const r of parsed.routes) {
    log(`${r.route}: ${r.summary.lines} addresses, ${r.summary.copies} copies, ${r.ok ? 'totals match' : 'TOTALS DO NOT MATCH'}${r.warnings.length ? `, ${r.warnings.length} note(s)` : ''}`);
  }

  if (sb) {
    await sb.storage.from('run-sheets').upload(`${day.iso}/${filename}`, pdf, { contentType: 'application/pdf', upsert: true })
      .then(({ error }) => error && log(`(PDF not kept: ${error.message})`));
    for (const r of parsed.routes.filter((x) => x.ok)) log(`Saved ${r.route} (run ${await saveRun(sb, r, filename)})`);
  } else {
    log(`Dry run: would save ${parsed.routes.filter((x) => x.ok).length} run(s)`);
  }

  // A run whose totals don't match is never loaded automatically: load it by hand after checking.
  if (bad.length) finish(1, `Not loaded, check by hand: ${bad.map((r) => `${r.route} (${r.checks.filter((c) => !c.ok).map((c) => `${c.label}: report ${c.expected}, sheet ${c.got}`).join('; ')})`).join(', ')}`);
  finish(0, `Done: ${parsed.routes.length - bad.length} run(s) ready for ${day.iso}`);
} catch (e) {
  // Early in the evening a hiccup just waits for the next attempt; at the last attempt it fails, and GitHub emails you.
  if (!lastChance) { log(`Will retry at the next attempt: ${e.message}`); finish(0); }
  finish(1, `Failed: ${e.message}`);
}
