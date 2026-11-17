# Browser test: tapping a tile that was ticked a while ago asks before unticking (decision 0037), demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-untick.py <report.pdf>
import sys
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; fails = []
def check(name, ok, detail=''):
    print(('✓' if ok else '✗'), name, detail)
    if not ok: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=6000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    t = page.locator('.tile:not(.done)').nth(2); key = t.get_attribute('data-key'); tile = page.locator(f'.tile[data-key="{key}"]')
    events = lambda: page.evaluate("Object.keys(localStorage).filter(k => k.startsWith('stb.events.')).flatMap(k => JSON.parse(localStorage.getItem(k)))")
    tile.click(); page.wait_for_timeout(300); tile.click(); page.wait_for_timeout(300)
    check('a tick made a moment ago still unticks with one tap', 'done' not in tile.get_attribute('class') and page.locator('.sheet').count() == 0)
    tile.click(); page.wait_for_timeout(300)
    page.evaluate("globalThis.__stbUntickAskMs = -1")   # as if the tick were more than a minute old
    n0 = len(events()); tile.click(); page.wait_for_selector('.sheet')
    check('an older tick asks before unticking', 'Already ticked' in page.inner_text('.sheet') and 'done' in tile.get_attribute('class') and len(events()) == n0, page.inner_text('.sheet')[:120])
    page.click('.sheet >> text=Leave it as it is'); page.wait_for_timeout(300)
    check('“Leave it” changes nothing', 'done' in tile.get_attribute('class') and len(events()) == n0)
    tile.click(); page.wait_for_selector('.sheet'); page.click('.sheet >> text=Delivered just now'); page.wait_for_timeout(400)
    ev = events(); mine = sorted([e for e in ev if f"{e['run_id']}::{e['line_key']}" == key], key=lambda e: e['device_time'])
    check('“Delivered just now” keeps it ticked with a new time', 'done' in tile.get_attribute('class') and len(ev) == n0 + 1 and mine[-1]['done'] and mine[-1]['device_time'] > mine[-2]['device_time'])
    tile.click(); page.wait_for_selector('.sheet'); page.click('.sheet >> text=Untick it'); page.wait_for_timeout(400)
    check('“Untick it” unticks', 'done' not in tile.get_attribute('class'))
    check('no page errors', not errors, str(errors))
    b.close()
print('ALL PASSED' if not fails else f'FAILED: {fails}'); sys.exit(1 if fails else 0)
