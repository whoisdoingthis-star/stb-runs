# Duty hard lines (decision 0057), in demo mode: a driver can't tick until on duty with the odometer in; the last
# delivery ends the shift and the end odometer keeps coming back until entered; helpers are never locked.
#   python3 -m http.server 8765 &   then   python3 test/e2e-hardlines.py /path/to/Report.pdf
import sys, json
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)
SEED = """([me, helpers, dayOffset, driver]) => {
  const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(Date.now() + n * 864e5));
  const today = day(0);
  const runs = JSON.parse(localStorage.getItem('stb.demo.runs')).map((r) => ({ ...r, delivery_date: today }));
  localStorage.setItem('stb.demo.runs', JSON.stringify(runs));
  for (const k of Object.keys(localStorage)) if (k.startsWith('stb.run.')) { const v = JSON.parse(localStorage.getItem(k)); v.run.delivery_date = today; localStorage.setItem(k, JSON.stringify(v)); }
  const routes = [...runs].sort((a, b) => b.route.localeCompare(a.route)).map((r) => r.route);   // the plan's order: last route first
  const now = Date.now(); const m = 60e3; let t = now + 20 * m;
  const list = routes.map((route) => { const x = { route, name: 'Run ' + Number(/(\\d+)$/.exec(route)[1]), startAt: t, finishAt: t + 30 * m, minutes: 30, hopMin: 5, stops: 20 }; t += 35 * m; return x; });
  const plan = { date: day(dayOffset), deadline: t + 5 * m, crews: [{ driver, helpers, runs: list, prepMin: 5, roadMin: 30 * list.length, travelMin: 5 * list.length, depotAt: now + 14 * m, leaveDepotAt: now + 19 * m, firstPaperAt: now + 20 * m, finishAt: t - 5 * m, shiftMin: 35 * list.length + 5 }], assumptions: [], news: ['New: I now know who drives and who helps.'] };
  localStorage.setItem('stb.dayplans', JSON.stringify([{ delivery_date: day(dayOffset), plan, note: 'Papers are due at 2:15.', updated_by: 'Mike', updated_at: '2026-11-19T07:00:00Z' }]));
  localStorage.setItem('stb.crew', JSON.stringify([{ name: 'Me', crew: me }, { name: 'Lenny', crew: 'helper' }, { name: 'Zaph', crew: 'helper' }, { name: 'Lisa', crew: 'driver' }]));
  localStorage.removeItem('stb.plan.seen.Me'); localStorage.removeItem('stb.spares'); localStorage.setItem('stb.sparepeople', JSON.stringify(['Aunty Pat'])); localStorage.removeItem('stb.notices'); localStorage.removeItem('stb.noticeseen'); localStorage.removeItem('stb.myruns'); localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending');
  return routes;
}"""
TODAY = "new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000); page.locator('.stickybar button').click(); page.wait_for_selector('.tile')
    duty = lambda: page.evaluate("JSON.parse(localStorage.getItem('stb.duty') || '[]')")
    def home():
        page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=5000); page.wait_for_timeout(1000)
        g = page.locator('.sheet button', has_text='Got it')
        if g.count(): g.first.click(); page.wait_for_timeout(300)
    # the smallest ordinary run is "my run" for today
    page.evaluate(SEED, ['driver', [], 0, 'Me'])
    rid = page.evaluate("""() => { const rs = JSON.parse(localStorage.getItem('stb.demo.runs')).filter((r) => !r.route.endsWith('08')).sort((a, b) => (a.summary?.lines || 0) - (b.summary?.lines || 0)); return rs[0].id; }""")
    page.evaluate(f"(id) => localStorage.setItem('stb.myruns', JSON.stringify({{ date: {TODAY}, ids: [id] }}))", rid)
    home()
    done = lambda: page.locator('.tile.done').count()

    # ---- a driver, not on duty ----
    page.goto(f'http://localhost:8765/#/r/{rid}'); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    page.locator('.tile').first.click(); page.wait_for_timeout(400)
    check('a driver who is not on duty can’t tick: the stop stays unticked and the app says what to do', done() == 0 and 'Go on duty first' in page.inner_text('.sheet'), page.inner_text('body')[:200])
    page.locator('.sheet button', has_text='Go to On duty').click(); page.wait_for_selector('.duty-card'); page.wait_for_timeout(600)

    # ---- on duty at the depot, odometer not in yet ----
    page.locator('.duty-btn').click(); page.wait_for_timeout(300); page.locator('.who-btn', has_text='Just me').click(); page.locator('.sheet button', has_text='Prepping at the depot').click(); page.wait_for_timeout(600)
    page.goto(f'http://localhost:8765/#/r/{rid}'); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    page.locator('.tile').first.click(); page.wait_for_timeout(700)
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('on duty but no odometer yet: a tap asks for the odometer, and still doesn’t tick', done() == 0 and 'odometer' in sheet.lower() and 'Skip' not in sheet, sheet[:200])
    page.fill('.odo-input', '90100'); page.locator('.sheet button', has_text='Save').click(); page.wait_for_timeout(1000)
    check('with the odometer in, the run is under way', duty()[-1]['state'] == 'on_run', json.dumps(duty()[-1]))
    page.locator('.tile').first.click(); page.wait_for_timeout(400)
    check('and now the stop ticks', done() == 1)

    # ---- the last delivery ends the shift ----
    for _ in range(400):
        t = page.locator('.tile:not(.done)')
        if not t.count() or page.locator('.sheet').count(): break
        t.first.click(); page.wait_for_timeout(60)
    page.wait_for_timeout(1800)
    d = duty()[-1]; sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('the last delivery puts the driver off duty by itself', d['state'] == 'off_duty' and d.get('source') == 'auto', json.dumps(d))
    check('and asks for the end odometer and spares, with no way to skip', 'Spares left?' in sheet and 'Skip' not in sheet and 'Not leaving' not in sheet and page.locator('.odo-input').count() == 1, sheet[:200])
    page.locator('.sheet [aria-label=Close]').click(); page.wait_for_timeout(600)
    home(); page.wait_for_timeout(800)
    check('closed without the odometer, it comes back on the Runs page', page.locator('.sheet .odo-input').count() == 1 and 'Spares left?' in page.inner_text('.sheet'))
    page.fill('.odo-input', '90112'); page.locator('.sheet button', has_text='Save').click(); page.wait_for_timeout(2500)
    sp = page.evaluate("JSON.parse(localStorage.getItem('stb.spares') || '[]')")
    check('once entered it is saved, and it doesn’t ask again', sp[-1]['moment'] == 'end' and sp[-1]['odometer_km'] == 90112 and page.locator('.sheet .odo-input').count() == 0, json.dumps(sp[-1]))
    home(); page.wait_for_timeout(600)
    check('…not on the next visit either', page.locator('.sheet .odo-input').count() == 0)

    # ---- a helper is never locked ----
    page.evaluate("localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending'); localStorage.removeItem('stb.odo.start')")
    page.evaluate(SEED, ['helper', [], 0, 'Me']); home()
    rid2 = page.evaluate("(not) => JSON.parse(localStorage.getItem('stb.demo.runs')).find((r) => r.id !== not && !r.route.endsWith('08')).id", rid)
    page.goto(f'http://localhost:8765/#/r/{rid2}'); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    n0 = done(); page.locator('.tile:not(.done)').first.click(); page.wait_for_timeout(400)
    check('a helper can tick without going on duty or entering anything', done() == n0 + 1 and page.locator('.sheet').count() == 0)
    check('no page errors', not errors, str(errors[:2]))
print('all passed' if not failed else f'{len(failed)} FAILED'); sys.exit(1 if failed else 0)
