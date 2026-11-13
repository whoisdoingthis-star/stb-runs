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

    page.locator('.home-tabs button', has_text='History').click(); page.wait_for_timeout(200)
    check('an empty History tab: Stan says finished runs will show here', page.locator('.empty .stan-says .stan').count() == 1 and 'Finished runs will show here' in page.inner_text('.empty'))
    if SHOTS: page.locator('.empty').screenshot(path=f'{SHOTS}/empty-history.png')
    page.locator('.home-tabs button', has_text='Runs to do').click(); page.wait_for_timeout(200)
    # My icon: initials until one is picked; pick a robot; it shows on the Runs page.
    check('before choosing, my icon is my initials', page.locator('.who-me .avatar.av-initials').count() == 1)
    page.locator('[aria-label="Settings"]').click(); page.wait_for_selector('.avatar-row'); page.locator('.avatar-row button').click(); page.wait_for_selector('.avatar-grid')
    if SHOTS: page.locator('.sheet').screenshot(path=f'{SHOTS}/avatar-pick.png')
    page.locator('.avatar-pick').nth(3).click(); page.wait_for_selector('.avatar-row .avatar svg')
    check('picking a robot saves it as my icon', page.evaluate("Object.values(JSON.parse(localStorage.getItem('stb.avatars')))[0].kind") == 'icon')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.locator('.sheet').count(): page.locator('.sheet button:has-text("✕")').first.click(); page.wait_for_timeout(300)
    check('my new icon shows straight away, without reopening the app', page.locator('.who-me .avatar svg').is_visible())
    page.reload(); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=5000)
    check('my icon shows on the Runs page', page.locator('.who-me .avatar svg').count() == 1)
    page.click('.stan-chat-btn'); page.wait_for_selector('.chat-log')
    check('Chat with Stan opens with his hello', 'ideas book' in page.inner_text('.chat-log'))
    page.fill('.chat-input', 'Colour the tiles when it rains'); page.locator('.chat-send button').click(); page.wait_for_timeout(700)
    ideas = page.evaluate("JSON.parse(localStorage.getItem('stb.ideas') || '[]')")
    check('telling Stan an idea saves it for the register and he answers', len(ideas) == 1 and ideas[0]['text'] == 'Colour the tiles when it rains' and page.locator('.chat-bubble.from-stan').count() >= 2 and page.locator('.chat-bubble.from-me').count() == 1, str(ideas))
    if SHOTS: page.locator('.sheet').screenshot(path=f'{SHOTS}/chat.png')
    page.locator('.sheet [aria-label="Close"], .sheet .sheet-x, .sheet button:has-text("✕")').first.click(); page.wait_for_timeout(300)
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
    # Photo and Problem are there before any tick, with their names, and work for the next stop.
    check('Photo and Problem show before the first tick, with words', page.locator('[aria-label="Take a delivery photo"]').is_visible() and 'Photo' in page.inner_text('[aria-label="Take a delivery photo"]') and 'Problem' in page.inner_text('[aria-label="Problem with this delivery"]'))
    check('the bar still fits the phone', page.evaluate('document.documentElement.scrollWidth - innerWidth') <= 0)
    if SHOTS: page.locator('.actionbar').screenshot(path=f'{SHOTS}/bar-before.png')
    nxt = page.locator('.tile.next').get_attribute('data-label')
    page.click('[aria-label="Problem with this delivery"]'); page.wait_for_selector('.sheet')
    check('Problem before a tick is about the next stop', nxt in page.inner_text('.sheet'), page.inner_text('.sheet')[:80])
    page.click('.sheet >> text=Gate locked'); page.wait_for_timeout(400)
    check('a stop can be marked not delivered without ticking it first', 'Not delivered' in page.inner_text('.actionbar') and page.locator('.tile.next').get_attribute('data-label') != nxt, page.inner_text('.actionbar'))
    page.click('[aria-label="Take a delivery photo"]'); page.wait_for_selector('.sheet')
    check('with a stop just done and a next stop, Photo asks which one', 'just done' in page.inner_text('.sheet') and 'next stop' in page.inner_text('.sheet'), page.inner_text('.sheet')[:120])
    if SHOTS: page.screenshot(path=f'{SHOTS}/which-stop.png')
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    if page.locator('.sheet').count(): page.locator('.sheet button:has-text("✕")').first.click(); page.wait_for_timeout(300)
    check('the run list follows my order (Run 11 first)', page.locator('.seg:not(.order-seg) button').nth(1).inner_text() == 'Run 11', page.locator('.seg:not(.order-seg)').inner_text())

    # Deliver all of Run 11.
    page.locator('.seg:not(.order-seg) button', has_text='Run 11').click(); page.wait_for_timeout(200)
    first = True; eta = ''
    for n in range(200):
        t = page.locator('.tile:not(.done)')
        if t.count() == 0: break
        t.first.click(); page.wait_for_timeout(60)
        if n == 8: page.wait_for_timeout(1100); eta = page.inner_text('.fb-time'); wide = page.evaluate('document.documentElement.scrollWidth - innerWidth')
        if first:
            check('the first tick switches to On the run', duty()[-1]['state'] == 'on_run' and duty()[-1]['source'] == 'tick', json.dumps(duty()[-1]))
            first = False
    check('the run screen says about when all my runs will be finished', 'finish about' in eta, eta)
    check('the finish time fits the phone (the page never gets wider than the screen)', wide <= 0, str(wide))
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
