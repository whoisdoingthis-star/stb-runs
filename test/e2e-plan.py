# Stan's day plan on the phone, and "Who's with you?" (decision 0040), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-plan.py /path/to/Report.pdf [screenshot-folder]
import json, sys, time
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
failed = []
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
  localStorage.removeItem('stb.plan.seen.Me'); localStorage.removeItem('stb.myruns'); localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending');
  return routes;
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
    home = lambda: (page.goto('http://localhost:8765/#/'), page.reload(), page.wait_for_selector('.duty-card'), page.wait_for_selector('.splash', state='detached', timeout=5000), page.wait_for_timeout(500))
    duty = lambda: page.evaluate("JSON.parse(localStorage.getItem('stb.duty') || '[]')")

    # ---- a driver, with a plan for today ----
    routes = page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Me'])
    home()
    check('the plan pops up the first time the driver opens the app', page.locator('.sheet .plan-pop').count() == 1)
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('Stan says who is driving and who is helping', 'here’s the plan for today' in pop and 'You’re driving, with Lenny helping.' in pop, pop[:200])
    check('it gives the depot time, the first paper and the finish', all(x in pop for x in ['At the depot by', 'First paper by', 'All done by', 'The deadline is']))
    check('it lists the runs in the plan’s order, with times', page.locator('.plan-runs li').count() == len(routes) and page.locator('.plan-runs li b').first.inner_text() == 'Run ' + str(int(routes[0][-2:])))
    check('it shows the dispatcher’s note', 'Mike says: Papers are due at 2:15.' in pop)
    check('it says what has been set up: the runs lined up, and who is ticked', 'Your runs are lined up in this order' in pop and 'Lenny is already ticked' in pop and 'New: I now know who drives and who helps.' in pop, pop[-400:])
    if SHOTS: page.screenshot(path=f'{SHOTS}/plan-popup.png')
    page.locator('.sheet button', has_text='Got it').click(); page.wait_for_timeout(200)
    mine = page.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids.length")
    check('My runs is filled in from the plan, in its order', mine == len(routes) and 'My runs: ' + ' → '.join('Run ' + str(int(r[-2:])) for r in routes) in page.inner_text('.duty-card'), page.inner_text('.duty-card'))
    check('the plan stays on the Runs page as a card', page.locator('.plan-card').count() == 1 and 'stan’s plan for today' in page.inner_text('.plan-card').lower() and 'Depot by' in page.inner_text('.plan-card'))
    if SHOTS: page.screenshot(path=f'{SHOTS}/plan-card.png')
    home()
    check('it pops up once only', page.locator('.sheet').count() == 0 and page.locator('.plan-card').count() == 1)
    page.locator('.plan-card').click(); page.wait_for_timeout(200)
    check('tapping the card opens the plan again', page.locator('.sheet .plan-pop').count() == 1)
    page.locator('.sheet button', has_text='Got it').click()

    # ---- going on duty: who's with you? ----
    page.locator('.duty-btn').click(); page.wait_for_timeout(300)
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('On duty asks a driver who is with them, listing the helpers only', 'Who’s with you?' in sheet and page.locator('.who-btn').count() == 2 and 'Lisa' not in sheet, sheet)
    check('the planned helper is already ticked', page.locator('.who-btn.on').count() == 1 and 'Lenny' in page.locator('.who-btn.on').inner_text())
    check('nothing is recorded until the shift is started', len(duty()) == 0)
    if SHOTS: page.screenshot(path=f'{SHOTS}/who-with-you.png')
    page.locator('.who-btn', has_text='Zaph').click(); page.locator('.who-btn', has_text='Zaph').click(); page.locator('.who-btn', has_text='Zaph').click()
    page.locator('.sheet button', has_text='Start my shift').click(); page.wait_for_timeout(600)
    d = duty()
    check('starting the shift records on duty with the helpers', len(d) == 1 and d[0]['state'] == 'on_duty' and d[0].get('helpers') == ['Lenny', 'Zaph'], json.dumps(d))
    check('the duty card shows on duty', 'On duty' in page.inner_text('.duty-card') and page.locator('.duty-card.on').count() == 1)

    # ---- on their own ----
    page.evaluate(SEED, ['driver', [], 0, 'Me']); page.evaluate("localStorage.setItem('stb.dayplans', JSON.stringify(JSON.parse(localStorage.getItem('stb.dayplans')).map((p) => ({ ...p, updated_at: '2026-11-19T08:00:00Z' }))))")
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('a changed plan pops up again; on their own, Stan says so and allows for folding', 'You’re driving on your own.' in pop and 'folding and bagging' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    page.locator('.duty-btn').click(); page.wait_for_timeout(300)
    check('on their own: nobody is ticked, and one tap starts the shift', page.locator('.who-btn.on').count() == 0)
    page.locator('.sheet button', has_text='Start my shift').click(); page.wait_for_timeout(600)
    d = duty(); check('on their own: on duty with no helpers', len(d) == 1 and d[0].get('helpers') == [], json.dumps(d))

    # ---- a helper ----
    page.evaluate(SEED, ['helper', ['Me'], 0, 'Lisa'])
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('a helper gets the plan too: who they are helping and what to do', 'You’re helping Lisa.' in pop and 'Lisa drives. You fold and bag on the way' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    check('the helper’s card says who they are helping', 'Helping Lisa' in page.inner_text('.plan-card'))
    page.locator('.duty-btn').click(); page.wait_for_timeout(600)
    d = duty(); check('a helper goes on duty with one tap, no question', page.locator('.sheet').count() == 0 and len(d) == 1 and 'helpers' not in d[0], json.dumps(d))

    # ---- tomorrow's plan, seen the evening before ----
    page.evaluate(SEED, ['driver', ['Lenny'], 1, 'Me'])
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('tomorrow’s plan pops up the evening before, and says the runs will be lined up in the morning', 'here’s the plan for tomorrow' in pop and 'In the morning, your runs will be lined up' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    check('tomorrow’s plan does not touch today’s My runs', page.evaluate("localStorage.getItem('stb.myruns')") is None and 'stan’s plan for tomorrow' in page.inner_text('.plan-card').lower())

    # ---- not in the plan; no plan; no crew list ----
    page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Lisa'])
    home()
    check('someone who is not in the plan sees no pop-up and no card', page.locator('.sheet').count() == 0 and page.locator('.plan-card').count() == 0)
    page.evaluate("localStorage.removeItem('stb.dayplans'); localStorage.removeItem('stb.crew')")
    home()
    page.locator('.duty-btn').click(); page.wait_for_timeout(600)
    d = duty(); check('with no drivers-and-helpers list, On duty works as before: one tap', page.locator('.sheet').count() == 0 and len(d) == 1 and d[0]['state'] == 'on_duty', json.dumps(d))
    check('no page errors', not errors, str(errors))
    b.close()

print('\n' + ('FAILED: ' + ', '.join(failed) if failed else 'all passed'))
sys.exit(1 if failed else 0)
