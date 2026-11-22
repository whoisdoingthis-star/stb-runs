# Stan's School and Sandbox Stan (decision 0065), in a phone-sized browser. No run sheets or sign-in needed.
#   python3 -m http.server 8765 &   then   python3 test/e2e-school.py
from playwright.sync_api import sync_playwright
U = 'http://localhost:8765'; failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7'], permissions=['geolocation'], geolocation={'latitude': -36.8935, 'longitude': 174.9310}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    bar = lambda: pg.inner_text('#sbx-bar')
    # ---- the real app's things on this phone must survive practice ----
    pg.goto(U + '/'); pg.wait_for_timeout(1200)
    pg.evaluate("localStorage.setItem('stb.duty', JSON.stringify([{ state: 'REAL' }])); localStorage.setItem('stb.odo.start', 'REAL'); localStorage.removeItem('stb.training')")
    # ---- STB-081 Sandbox Stan: practice runs, and each task ticks itself off from what the app saved ----
    pg.goto(U + '/sandbox/?task=go-on-duty'); pg.wait_for_selector('.duty-btn'); pg.wait_for_timeout(1500)
    check('STB-081 the sandbox opens the real app on two made-up practice runs, with the practice bar on top', 'Run 1' in pg.inner_text('#app') and 'Run 2' in pg.inner_text('#app') and 'Go on duty' in bar())
    pg.locator('.duty-btn').click(); pg.wait_for_timeout(400); pg.locator('.who-btn', has_text='Just me').click(); pg.locator('.sheet button', has_text='Prepped').click(); pg.wait_for_timeout(1500)
    pg.fill('.odo-input', '12345'); pg.evaluate("document.querySelectorAll('.sheet .step-row.good').forEach((r) => { if (r.querySelector('.step-n').textContent === '?') r.querySelector('.step-btn').click(); })")
    pg.locator('.sheet button', has_text='Save').click(); pg.wait_for_timeout(2500)
    check('STB-080 going on duty with the odometer ticks off the first task by itself', 'Done: Go on duty' in bar(), bar()[:200])
    ids = pg.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids")
    for rid in ids:
        pg.goto(U + f'/sandbox/#/r/{rid}'); pg.wait_for_selector('.tile'); pg.wait_for_timeout(1000)
        first = True
        while pg.locator('.tile:not(.done)').count():
            if pg.locator('.sheet').count(): break
            pg.evaluate("document.querySelector('.tile:not(.done)').click()"); pg.wait_for_timeout(350)
            if first and rid == ids[0]:
                first = False; pg.locator('button[aria-label="Problem with this delivery"]').click(); pg.wait_for_timeout(400)
                if not pg.locator('.sheet button', has_text='Gate locked').count() and pg.locator('.sheet button', has_text='just done').count(): pg.locator('.sheet button', has_text='just done').first.click(); pg.wait_for_timeout(400)
                opt = pg.locator('.sheet button').filter(has_text='Gate locked')
                if opt.count(): opt.first.click(); pg.wait_for_timeout(400)
    pg.wait_for_timeout(1500)
    if pg.locator('.odo-input').count():
        pg.fill('.odo-input', '12399'); pg.evaluate("document.querySelectorAll('.sheet .step-row.good').forEach((r) => { if (r.querySelector('.step-n').textContent === '?') r.querySelector('.step-btn').click(); })")
        pg.locator('.sheet button', has_text='Save').click(); pg.wait_for_timeout(2500)
    pg.goto(U + '/'); pg.wait_for_timeout(1200)
    real = pg.evaluate("[localStorage.getItem('stb.duty'), localStorage.getItem('stb.odo.start'), JSON.parse(localStorage.getItem('stb.training') || '[]').map((x) => x.item)]")
    check('STB-080 all four driver practice tasks were checked off from the practice morning', all(f'task:{t}' in real[2] for t in ['go-on-duty', 'tick', 'cant-deliver', 'finish']), str(real[2]))
    check('STB-081 practice never touched the real app on the same phone', real[0] == '[{"state":"REAL"}]' and real[1] == 'REAL', str(real[:2]))
    # ---- STB-082 Stan's School ----
    pg.goto(U + '/learn/'); pg.wait_for_selector('.sc-course'); pg.wait_for_timeout(800)
    t = pg.inner_text('#school')
    check('STB-082 the school lists the courses, the practice tasks (with what is done) and what’s new', all(x in t for x in ['New driver', 'New helper', 'Dispatch', 'Practise in Sandbox Stan', 'What’s new lately']) and pg.locator('.sc-task.fin').count() >= 4, t[:300])
    pg.goto(U + '/learn/#/c/driver/0'); pg.wait_for_selector('.sc-card'); n = int(pg.inner_text('.topbar').split(' of ')[1].split()[0])
    check('a course step shows the words, the why and Stan’s read-aloud button', 'Why:' in pg.inner_text('.sc-card') and pg.locator('.sc-say').count() == 1)
    pg.goto(U + '/learn/#card-2026-11-22-odometer'); pg.wait_for_selector('.sc-card'); pg.wait_for_timeout(300)
    check('STB-082 a card link (as in the email) opens its lesson at that card', 'Odometer before the first stop' in pg.inner_text('.sc-card'), pg.url)
    pg.goto(U + f'/learn/#/c/driver/{n}'); pg.wait_for_timeout(1200)
    check('finishing a course says so and offers its practice', 'done!' in pg.inner_text('#school') and 'Open Sandbox Stan' in pg.inner_text('#school'))
    check('and it is kept as progress', 'course:driver' in pg.evaluate("localStorage.getItem('stb.training')"))
    pg.screenshot(path='/tmp/school-done.png')
    check('no page errors', not errs, str(errs[:3]))
    b.close()
# ---- STB-079 a new driver: trained first, or along as a helper (decision 0065) ----
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7'], permissions=['geolocation'], geolocation={'latitude': -36.8935, 'longitude': 174.9310}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(U + '/sandbox/'); pg.wait_for_selector('.duty-btn'); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.clear(); localStorage.removeItem('sbx.seed')"); pg.reload(); pg.wait_for_selector('.duty-btn'); pg.wait_for_timeout(1200)
    pg.evaluate("globalThis.__stbTraining = { needs: true, left: ['course:driver', 'task:tick'] }")
    pg.locator('.duty-btn').click(); pg.wait_for_timeout(500)
    sheet = pg.inner_text('.sheet') if pg.locator('.sheet').count() else ''
    check('STB-079 a driver who still needs training is stopped at On duty, told what is left, and offered the school', 'Driver training first' in sheet and 'driver course' in sheet and 'Open Stan’s School' in sheet, sheet[:200])
    pg.locator('.sheet button', has_text='Come along as a helper').click(); pg.wait_for_timeout(500)
    check('STB-079 they can come along as a helper: asked who is driving', 'Who’s driving?' in pg.inner_text('.sheet'))
    pg.locator('.sheet .who-btn', has_text='Jo (practice)').click(); pg.wait_for_timeout(800)
    last = pg.evaluate("JSON.parse(localStorage.getItem('stb.duty')).at(-1)")
    check('and they are on duty as Jo’s helper', last['state'] == 'on_duty' and last.get('driver') == 'Jo (practice)', str(last))
    rid = pg.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids[0]")
    pg.goto(U + f'/sandbox/#/r/{rid}'); pg.wait_for_selector('.tile'); pg.wait_for_timeout(1000)
    pg.evaluate("document.querySelector('.tile:not(.done)').click()"); pg.wait_for_timeout(600)
    check('as a helper they tick without being asked for the odometer', pg.locator('.tile.done').count() == 1 and pg.locator('.odo-input').count() == 0)
    pg.goto(U + '/sandbox/'); pg.wait_for_selector('.duty-card'); pg.wait_for_timeout(800)
    pg.evaluate("globalThis.__stbTraining = { needs: true, left: [] }")
    check('no page errors (gate)', not errs, str(errs[:3]))
    b.close()
print('\n' + ('All passed.' if not failed else f'{len(failed)} failed: {failed}'))
exit(1 if failed else 0)
