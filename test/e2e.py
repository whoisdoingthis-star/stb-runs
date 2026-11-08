import json, sys
from playwright.sync_api import sync_playwright
PDF = '/home/claude/src/report.pdf'
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], geolocation={'latitude': -36.8985, 'longitude': 174.9312, 'accuracy': 9}, permissions=['geolocation'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('http://localhost:8765/')
    page.wait_for_selector('text=Load run sheet')
    page.screenshot(path='test/01-home.png')
    page.set_input_files('#pdf', PDF)
    page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.screenshot(path='test/02-load.png', full_page=True)
    print('load text:', page.locator('.card').all_inner_texts())
    page.click('text=Save 2 runs and open')
    page.wait_for_selector('.tile')
    page.wait_for_timeout(1500)
    print('tiles:', page.locator('.tile').count(), '| stats:', page.locator('.fb-prog').inner_text(), '| gps:', page.locator('.runhead .chip:visible').nth(0).inner_text())
    page.screenshot(path='test/03-run.png')
    # tap first three tiles of HOWICK06 and the bulk Paper Plus line
    tiles = page.locator('.tile')
    for i in [0, 1, 4]:
        tiles.nth(i).click()
    page.wait_for_timeout(300)
    print('after taps:', page.locator('.fb-prog').inner_text(), '| done tiles:', page.locator('.tile.done').count())
    page.screenshot(path='test/04-tapped.png')
    # undo the last via second tap
    page.locator('.tile').nth(4).click()
    print('after untap:', page.locator('.fb-prog').inner_text())
    # switch to Run 13
    page.click('.seg button:has-text("Run 13")')
    print('run13 view:', page.locator('.fb-prog').inner_text(), page.locator('.tile').count())
    page.click('.seg button:has-text("All")')
    # to-do filter + search
    page.click('text=To do only')
    print('todo tiles:', page.locator('.tile').count())
    page.click('text=To do only')
    page.fill('.search', 'uxbridge')
    print('search uxbridge tiles:', page.locator('.tile').count())
    page.fill('.search', '')
    # flagged tiles
    print('flags:', page.locator('.flag').all_inner_texts())
    # reload: ticks persist
    page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    print('after reload:', page.locator('.fb-prog').inner_text())
    ev = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('stb.events.')).flatMap(k=>JSON.parse(localStorage.getItem(k)))")
    print('events stored:', len(ev)); print(json.dumps(ev[0], indent=1))
    url = page.url
    # home list
    page.goto('http://localhost:8765/#/'); page.wait_for_selector('.run-card')
    print('home:', page.locator('.run-card').all_inner_texts())
    page.screenshot(path='test/05-home-after.png')
    print('URL of run:', url)
    print('errors:', errors)
    b.close()
