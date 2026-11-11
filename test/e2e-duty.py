# On Duty, My runs and moving on to the next run (decision 0020), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-duty.py /path/to/Report.pdf [screenshot-folder]
import json, sys
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], geolocation={'latitude': -36.8985, 'longitude': 174.9312, 'accuracy': 9}, permissions=['geolocation'])
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
    # Make the sheet today's, so its runs are "Runs to do".
    page.evaluate("""() => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
      const runs = JSON.parse(localStorage.getItem('stb.demo.runs')).map((r) => ({ ...r, delivery_date: today }));
      localStorage.setItem('stb.demo.runs', JSON.stringify(runs));
      for (const k of Object.keys(localStorage)) if (k.startsWith('stb.run.')) { const v = JSON.parse(localStorage.getItem(k)); v.run.delivery_date = today; localStorage.setItem(k, JSON.stringify(v)); }
    }""")
    page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=5000)
    duty = lambda: page.evaluate("JSON.parse(localStorage.getItem('stb.duty') || '[]')")

    check('the first time, Stan says hello on the duty card', page.locator('.duty-card .stan.st-wave').count() == 1 and 'Stan' in page.inner_text('.duty-card'))
    if SHOTS: page.locator('.duty-card').screenshot(path=f'{SHOTS}/duty-hello.png')
    check('the Runs page starts Off duty, with an On duty button', 'Off duty' in page.inner_text('.duty-card') and page.locator('.duty-btn').is_visible())
    page.click('.duty-btn'); page.wait_for_selector('.duty-card.on')
    check('On duty starts the shift timer at 0:00', page.inner_text('.duty-timer') == '0:00', page.inner_text('.duty-card'))
    check('going on duty is saved, with where we were', duty()[-1]['state'] == 'on_duty' and 'lat' in duty()[-1], json.dumps(duty()))
    if SHOTS: page.locator('.duty-card').screenshot(path=f'{SHOTS}/duty-on.png')

    page.click('text=Choose my runs'); page.wait_for_selector('.myruns-pick')
    page.click('.myrun:has-text("Run 11")'); page.click('.myrun:has-text("Run 6")')
    check('picked runs are numbered in the order tapped', page.inner_text('.myrun:has-text("Run 11") .myrun-n') == '1' and page.inner_text('.myrun:has-text("Run 6") .myrun-n') == '2')
    if SHOTS: page.locator('.sheet').screenshot(path=f'{SHOTS}/my-runs.png')
    page.click('text=Start my runs'); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    ids = page.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids")
    check('Start my runs opens them together, in that order', page.url.endswith('#/r/' + '+'.join(ids)) and len(ids) == 2, page.url)
    check('the run list follows my order (Run 11 first)', page.locator('.seg:not(.order-seg) button').nth(1).inner_text() == 'Run 11', page.locator('.seg:not(.order-seg)').inner_text())

    # Deliver all of Run 11.
    page.locator('.seg:not(.order-seg) button', has_text='Run 11').click(); page.wait_for_timeout(200)
    first = True
    for _ in range(200):
        t = page.locator('.tile:not(.done)')
        if t.count() == 0: break
        t.first.click(); page.wait_for_timeout(60)
        if first:
            check('the first tick switches to On the run', duty()[-1]['state'] == 'on_run' and duty()[-1]['source'] == 'tick', json.dumps(duty()[-1]))
            first = False
    page.wait_for_selector('#toast .stan', timeout=3000)
    if SHOTS: page.screenshot(path=f'{SHOTS}/toast-stan.png')
    toast = page.inner_text('#toast') if page.locator('#toast').is_visible() else ''
    check('Stan hops in the run-done message', page.locator('#toast .stan.st-hop').count() == 1)
    check('finishing Run 11 moves on to Run 6 by itself', 'Run 11 done' in toast and 'Run 6' in toast, toast)
    last = duty()[-1]
    check('the move-on is recorded, so the gap is counted', last['state'] == 'on_run' and last['source'] == 'move_on' and last['run_id'] == ids[1], json.dumps(last))
    check('the list switched to Run 6', page.locator('.seg:not(.order-seg) button[aria-pressed="true"]').inner_text() == 'Run 6')

    page.goto('http://localhost:8765/#/'); page.wait_for_selector('.duty-card.on')
    card = page.inner_text('.duty-card')
    check('the Runs page says On the run: Run 6, and Run 11 is ticked off', 'On the run: Run 6' in card and '✓ Run 11 → Run 6' in card, card)
    page.evaluate("localStorage.setItem('stb-big', '1')"); page.reload(); page.wait_for_selector('.duty-card.on'); page.wait_for_selector('.splash', state='detached', timeout=5000)
    check('big text: the card still fits the screen', page.evaluate("document.querySelector('.duty-card').scrollWidth <= document.querySelector('.duty-card').clientWidth + 1"))
    if SHOTS: page.locator('.duty-card').screenshot(path=f'{SHOTS}/duty-big.png')
    page.click('.duty-actions >> text=Off duty'); page.wait_for_selector('.sheet')
    page.locator('.sheet').get_by_role('button', name='Off duty', exact=True).click(); page.wait_for_selector('.duty-card.off')
    check('after the first shift Stan steps back from the duty card', page.locator('.duty-card .stan').count() == 0)
    check('Off duty ends the shift', duty()[-1]['state'] == 'off_duty' and page.locator('.duty-btn').is_visible())
    check('no page errors', not errors, errors)
    b.close()

print('ALL PASSED' if not failed else f'FAILED {failed}')
sys.exit(1 if failed else 0)
