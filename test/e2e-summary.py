# The end-of-shift summary (decision 0044), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-summary.py /path/to/Report.pdf [screenshot-folder]
import json, sys
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)

# Makes the first run today's, ticks every stop this morning (finishing 5:20 am), and adds four earlier mornings that took longer.
SEED = """([todayMin, skip]) => {
  const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(Date.now() + n * 864e5));
  const all = JSON.parse(localStorage.getItem('stb.demo.runs')); const run = all.find((r) => !/^p\\d$/.test(r.id)); const today = day(0);
  const cache = JSON.parse(localStorage.getItem('stb.run.' + run.id)); const lines = cache.lines;
  run.delivery_date = today; cache.run.delivery_date = today; localStorage.setItem('stb.run.' + run.id, JSON.stringify(cache));
  const mk = (id, date, total, n) => lines.slice(0, n).map((l, i) => ({ id: id + '-' + i, run_id: id, line_key: l.line_key, address_key: l.address_key, done: true, user_name: 'Me', device_time: new Date(Date.parse(date + 'T04:00:00+13:00') + (i * total * 60000) / (lines.length - 1)).toISOString(), lat: -36.9 + i * 0.0004, lng: 174.93, accuracy_m: 6 }));
  const runs = [run];
  for (let d = 1; d <= 4; d++) { const id = 'p' + d; runs.push({ ...run, id, delivery_date: day(-d) }); localStorage.setItem('stb.run.' + id, JSON.stringify({ ...cache, run: { ...cache.run, id, delivery_date: day(-d) } })); localStorage.setItem('stb.events.' + id, JSON.stringify(mk(id, day(-d), 100, lines.length))); }
  localStorage.setItem('stb.events.' + run.id, JSON.stringify(mk(run.id, today, todayMin, lines.length - skip)));
  localStorage.setItem('stb.demo.runs', JSON.stringify(runs));
  for (const k of Object.keys(localStorage)) if (k.startsWith('stb.summary.') || k.startsWith('stb.card.')) localStorage.removeItem(k);
  localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending');
  return lines.length;
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/')
    page.wait_for_selector('#pdf', state='attached')
    page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF)
    page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click()
    page.wait_for_selector('.tile')
    home = lambda wait=3200: (page.goto('http://localhost:8765/#/'), page.reload(), page.wait_for_selector('.duty-card'), page.wait_for_selector('.splash', state='detached', timeout=5000), page.wait_for_timeout(wait))
    sheet = lambda: page.inner_text('.sheet') if page.locator('.sheet').count() else ''

    # ---- a clean morning, quicker than usual, seen the next time the app is opened ----
    n = page.evaluate(SEED, [80, 0])
    home()
    s = sheet()
    check('Stan shows the morning the next time the app is opened, once the runs are done', 'Your morning' in s, s[:200])
    check('it leads with the outcome against the deadline', 'in by 5:20 am' in s and 'min before the deadline' in s, s[:300])
    check('Stan says his lines for a clean, quicker morning', 'Every stop ticked. Goo-doo!' in s and 'Quicker than your usual. I noticed.' in s, s[:300])
    check('it shows the shift: time on the run and stops', '1:20' in s and str(n) in s and 'On the run' in s and 'Stops' in s, s)
    check('pace is against my own usual, in minutes', '20 min quicker than your usual' in s and '80 min against 100' in s, s)
    check('there is a line graph of my last mornings, with a description', page.locator('.sum-trend svg polyline').count() == 1 and page.locator('.sum-trend circle').count() == 5 and 'last 5 mornings' in s)
    check('quality: every stop ticked and ticks at the address', 'Every stop ticked.' in s and '100% of ticks made at the address.' in s and page.locator('.sum-quality li.sq-ok').count() == 2, s)
    check('the card fits the phone', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    if SHOTS: page.screenshot(path=f'{SHOTS}/summary-good.png')
    page.locator('.sheet button', has_text='Done').click(); page.wait_for_timeout(300)
    check('after that there is a Your morning button on the Runs page', page.locator('.summary-slot button').count() == 1)
    home()
    check('it pops up once a day only', page.locator('.sheet').count() == 0 and page.locator('.summary-slot button').count() == 1)
    page.locator('.summary-slot button').click(); page.wait_for_timeout(1200)
    check('the button opens it again', 'Your morning' in sheet())
    page.locator('.sheet button', has_text='Done').click()

    # ---- a slower morning with two stops unticked: not shown by itself while a run is unfinished, shown on going off duty ----
    page.evaluate(SEED, [125, 2])
    home()
    check('while a run still has stops unticked, it does not pop up by itself', page.locator('.sheet').count() == 0)
    page.locator('.duty-btn').click(); page.wait_for_timeout(700)
    check('going on duty hides the Your morning button', page.locator('.summary-slot button').count() == 0 and page.locator('.duty-card.on').count() == 1)
    page.locator('.duty-card button', has_text='Off duty').click(); page.wait_for_timeout(300)
    page.locator('.sheet button', has_text='Off duty').click(); page.wait_for_timeout(2500)
    s = sheet()
    check('going off duty brings up the morning', 'Your morning' in s, s[:200])
    check('a slower morning says so plainly and kindly', 'min slower than your usual for Run' in s and 'min against 100' in s and 'Slower than usual today. That’s fine. Safe is good.' in s, s)
    check('unticked stops are flagged', f'{n - 2} of {n} stops ticked.' in s and page.locator('.sum-quality li.sq-flag').count() >= 1, s)
    if SHOTS: page.screenshot(path=f'{SHOTS}/summary-slow.png')
    page.locator('.sheet button', has_text='Done').click(); page.wait_for_timeout(300)
    check('and the Your morning button is back', page.locator('.summary-slot button').count() == 1)
    check('no page errors', not errors, str(errors))
    b.close()

print('\n' + ('FAILED: ' + ', '.join(failed) if failed else 'all passed'))
sys.exit(1 if failed else 0)
