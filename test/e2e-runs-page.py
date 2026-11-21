# The Runs page follows the morning (decision 0049), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-runs-page.py /path/to/Report.pdf [screenshot-folder]
import sys
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
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
  localStorage.removeItem('stb.plan.seen.Me'); localStorage.removeItem('stb.spares'); localStorage.setItem('stb.sparepeople', JSON.stringify(['Aunty Pat'])); localStorage.removeItem('stb.notices'); localStorage.removeItem('stb.noticeseen'); localStorage.removeItem('stb.myruns'); localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending');
  return routes;
}"""
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000); page.locator('.stickybar button').click(); page.wait_for_selector('.tile')
    def home():
        page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=5000); page.wait_for_timeout(1200)
        for _ in range(4):
            if not page.locator('.sheet').count(): break
            g = page.locator('.sheet button', has_text='Got it'); s = page.locator('.sheet button', has_text='Skip')
            (g.first if g.count() else s.first if s.count() else page.locator('.sheet [aria-label=Close]').first).click(); page.wait_for_timeout(400)
    names = lambda: [x.strip() for x in page.locator('.run-tile .rt-name').all_inner_texts()]
    top = lambda sel: page.locator(sel).first.bounding_box()['y']
    routes = page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Me'])
    order = ['Run ' + str(int(r[-2:])) for r in routes]

    # ---- before the shift ----
    home()
    check('the run tiles are in my order, not number order', names() == order, str(names()))
    check('the first run is on the first screen', top('.run-tile') < 839, str(top('.run-tile')))
    check('what to collect is above the runs, closed', top('details.papers') < top('.run-tile') and page.locator('details.papers[open]').count() == 0 and 'To collect' in page.inner_text('details.papers summary'))
    check('each tile says when the plan has it done by', ' · by ' in page.locator('.run-tile .rt-sub').first.inner_text())
    check('the board and the ideas button share one row', abs(top('.notice-slot') - top('.stan-chat-btn')) < 4 if page.locator('.notice-slot button').count() else True)
    check('before the shift the order has a small Change beside it', page.locator('.duty-card .my-runs button', has_text='Change').count() == 1 and page.locator('.run-tile .rt-pick').count() >= 1)
    if SHOTS: page.screenshot(path=f'{SHOTS}/runs-1-before.png', full_page=True)

    # ---- at the depot ----
    page.locator('.duty-btn').click(); page.wait_for_timeout(300); page.locator('.sheet button', has_text='Prepping at the depot').click(); page.wait_for_timeout(900)
    check('at the depot, what to load is open at the top', page.locator('details.papers[open]').count() == 1 and 'To load' in page.inner_text('details.papers summary') and top('details.papers') < top('.run-tile'))
    check('at the depot, the pick lists are in the open list, in my order, not repeated on each tile', page.locator('.run-tile .rt-pick').count() == 0 and order[0] in page.locator('details.papers tbody tr').first.inner_text(), page.locator('details.papers').inner_text()[:120])
    check('no run is shown as under way yet', page.locator('.hero-now').count() == 0)
    if SHOTS: page.screenshot(path=f'{SHOTS}/runs-2-depot.png', full_page=True)

    # ---- on the run ----
    page.locator('.leave-btn').click(); page.wait_for_timeout(700)
    page.fill('.odo-input', '84512'); page.locator('.sheet button', has_text='Save').click(); page.wait_for_timeout(900)
    hero = page.inner_text('.hero-now') if page.locator('.hero-now').count() else ''
    check('on the run, the top card is the run I am on', 'run 1 of ' + str(len(order)) in hero.lower() and order[0] in hero and 'Start ' + order[0] in hero, hero)
    check('nothing is said about the plan before the first tick, so Stan’s plan line is still there', page.locator('.hero-pace').count() == 0 and page.locator('.plan-card').is_visible())
    check('the order is still there as a trail', 'My runs: ' + ' → '.join(order) in page.inner_text('.duty-card'))
    check('pick lists are put away once I have left the depot', page.locator('.run-tile .rt-pick').count() == 0)
    check('what was collected moves below the runs', top('details.papers') > top('.run-tile') and page.locator('details.papers[open]').count() == 0)
    check('the first run is on the first screen while on the run', top('.run-tile') < 839, str(top('.run-tile')))
    if SHOTS: page.screenshot(path=f'{SHOTS}/runs-3-on-run.png', full_page=True)

    # ---- a run dropped off inside another ----
    page.evaluate("""() => { const d = JSON.parse(localStorage.getItem('stb.dayplans')); const rs = d[0].plan.crews[0].runs; const r8 = rs.find((r) => r.route.endsWith('08')); const r10 = rs.find((r) => r.route.endsWith('10')); r8.during = r10.route; delete r8.startAt; delete r8.finishAt; localStorage.setItem('stb.dayplans', JSON.stringify(d)); }""")
    home()
    n = names(); i = n.index('Run 10')
    check('a run dropped off inside another sits straight under it, marked', n[i + 1] == 'Run 8' and page.locator('.nest-rider').count() == 1 and 'part-way through Run 10' in page.inner_text('.nest-rider'), str(n))
    page.locator('.nest-rider button', has_text='Open both').click(); page.wait_for_timeout(500)
    ids = page.evaluate("Object.fromEntries(JSON.parse(localStorage.getItem('stb.demo.runs')).map((r) => [r.route.slice(-2), r.id]))")
    check('Open both opens the two together, host first', page.evaluate('location.hash') == f"#/r/{ids['10']}+{ids['08']}", page.evaluate('location.hash'))
    page.evaluate("(id) => localStorage.setItem('stb.myruns', JSON.stringify({ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date()), ids: [id] }))", ids['08'])
    home()
    check('someone doing that run on its own sees it on its own, first', names()[0] == 'Run 8' and page.locator('.nest-rider').count() == 0, str(names()))

    # ---- ahead of or behind the plan ----
    page.evaluate("""() => { const rs = JSON.parse(localStorage.getItem('stb.demo.runs')); localStorage.setItem('stb.myruns', JSON.stringify({ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date()), ids: rs.map((r) => r.id).reverse() }));
      const d = JSON.parse(localStorage.getItem('stb.dayplans')); const first = d[0].plan.crews[0].runs[0]; first.startAt = Date.now() - 50 * 60e3; first.finishAt = Date.now() - 20 * 60e3; localStorage.setItem('stb.dayplans', JSON.stringify(d)); }""")
    home()
    page.locator('.hero-go').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
    page.locator('.tile').first.click(); page.wait_for_timeout(900)
    home()
    pace = page.inner_text('.hero-pace') if page.locator('.hero-pace').count() else ''
    check('after a tick, the card says how far behind the plan the run is, in minutes', 'min behind' in pace and page.locator('.hero-pace.late').count() == 1 and 'Continue ' + order[0] in page.inner_text('.hero-now'), pace + ' | ' + (page.inner_text('.hero-now') if page.locator('.hero-now').count() else 'no hero'))
    check('once it says ahead or behind, Stan’s plan line steps aside', not page.locator('.plan-card').is_visible())
    if SHOTS: page.screenshot(path=f'{SHOTS}/runs-4-behind.png')
    check('no page errors', not errors, str(errors[:2]))
print('all passed' if not failed else f'{len(failed)} FAILED'); sys.exit(1 if failed else 0)
