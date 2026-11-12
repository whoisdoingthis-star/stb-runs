# Browser test of the driver app in demo mode (empty config.js), on a phone-sized screen.
# Needs a real run sheet (kept out of the repo: it has customer addresses):
#   python3 -m http.server 8765 &   then   python3 test/e2e.py /path/to/Report.pdf
import json, sys
from playwright.sync_api import sync_playwright

PDF = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/src/report.pdf'
fails = []
def check(name, ok, detail=''):
    print(('✓' if ok else '✗'), name, detail)
    if not ok: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], geolocation={'latitude': -36.8985, 'longitude': 174.9312, 'accuracy': 9}, permissions=['geolocation'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('http://localhost:8765/')
    page.wait_for_selector('#pdf', state='attached')
    check('opening animation plays when the app opens', page.locator('.splash').count() == 1)
    page.wait_for_selector('.splash', state='detached', timeout=4000)
    check('opening is silent unless switched on', page.evaluate("localStorage.getItem('stb-sound')") != 'on')
    check('night mode is the default', page.evaluate("document.documentElement.classList.contains('dark')"))
    page.set_input_files('#pdf', PDF)
    page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click()
    page.wait_for_selector('.tile'); page.wait_for_timeout(800)
    check('one slim header, no Text link button in it', page.locator('.rh').count() == 1 and page.locator('.rh >> text=Text link').count() == 0)
    nxt = page.locator('.tile.next')
    check('exactly one next stop', nxt.count() == 1)
    first_label = nxt.get_attribute('data-label')
    nxt.click(); page.wait_for_timeout(300)
    check('bottom bar shows the tick with Undo', first_label in page.inner_text('.ab-main') and page.locator('.actionbar >> text=Undo').is_visible(), page.inner_text('.ab-main'))
    check('bottom bar words are not cut off', page.evaluate("[...document.querySelectorAll('.ab-main, .ab-sub')].every(e => e.scrollWidth <= e.clientWidth)"))
    check('next stop moved on', page.locator('.tile.next').get_attribute('data-label') != first_label)
    check('progress counts it', page.inner_text('.fb-prog').startswith('1/'), page.inner_text('.fb-prog'))
    page.click('.actionbar >> text=Undo'); page.wait_for_timeout(300)
    check('undo unticks', page.locator('.tile.done').count() == 0 and page.inner_text('.fb-prog').startswith('0/'))
    # directions: Google Maps to the next stop, only when asked
    page.evaluate("window.open = (u) => { window.__opened = u; return null; }")
    nxt = page.locator('.tile.next').get_attribute('aria-label') or ''
    page.click('[aria-label="Directions to the next stop in Google Maps"]'); page.wait_for_timeout(150)
    opened = page.evaluate('window.__opened') or ''
    from urllib.parse import unquote_plus
    check('Maps opens Google Maps directions to the next stop', opened.startswith('https://www.google.com/maps/dir/?api=1&destination=') and 'dir_action=navigate' in opened and unquote_plus(opened).split('destination=')[1].split(',')[0].split(' ')[0] in nxt, f'{unquote_plus(opened)[:120]} | {nxt[:60]}')
    # a photo added later, from the gallery, to an address that isn't the last tick: no tick, marked as added later
    done_before = page.locator('.tile.done').count()
    target = page.locator('.tile:not(.done)').nth(3)
    tnum = target.locator('.num').inner_text().split()[0]
    page.click('[aria-label="Run options"]'); page.wait_for_selector('.sheet')
    page.click('.sheet >> text=Add a photo to an address'); page.wait_for_selector('.pick-search')
    page.fill('.pick-search', tnum); page.wait_for_timeout(150)
    page.locator('.pick-list .menu-item').first.click()
    with page.expect_file_chooser() as fc:
        page.click('.sheet >> text=Choose from my photos')
    import base64, tempfile, os
    jpg = os.path.join(tempfile.gettempdir(), 'stb-test.jpg')
    open(jpg, 'wb').write(base64.b64decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='))
    fc.value.set_files(jpg); page.wait_for_selector('.photo-sheet'); page.wait_for_timeout(500)
    saved = page.evaluate("JSON.parse(localStorage.getItem('stb.demo.photos')||'[]')")
    check('a photo can be added later from the gallery, marked as added later, without ticking', bool(saved) and saved[-1].get('added_later') is True and page.locator('.tile.done').count() == done_before, f'{saved[-1:]} done {done_before}->{page.locator(".tile.done").count()}')
    page.keyboard.press('Escape'); page.evaluate("document.querySelectorAll('.sheet-backdrop').forEach(e=>e.remove())")
    # couldn't deliver: tick, then the warning button in the bottom bar; the tick stays in the history
    key = page.locator('.tile.next').get_attribute('data-key')
    page.locator('.tile.next').click(); page.wait_for_timeout(200)
    page.click('[aria-label="Problem with this delivery"]'); page.wait_for_selector('.sheet')
    page.click('.sheet >> text=(just done)'); page.wait_for_timeout(300)  # it asks which stop: the one just ticked, or the next
    page.click('.sheet >> text=Gate locked'); page.wait_for_timeout(300)
    tl = page.locator(f'.tile[data-key="{key}"]')
    check("couldn't deliver shows on the tile", 'futile' in (tl.get_attribute('class') or '') and 'Gate locked' in tl.inner_text(), tl.inner_text().replace('\n', ' | '))
    evs = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('stb.')).flatMap(k=>{try{const v=JSON.parse(localStorage.getItem(k));return Array.isArray(v)?v:[]}catch{return []}}).filter(e=>e&&e.outcome)")
    outs = sorted(e['outcome'] for e in evs if f"{e['run_id']}::{e['line_key']}" == key)
    check('tick and problem both kept', outs[:2] == ['delivered', 'futile'] or 'futile' in outs and 'delivered' in outs, str(outs))
    page.click('.actionbar >> text=Undo'); page.wait_for_timeout(300)
    check('undo clears it', page.locator('.tile.done').count() == 0)
    check('units read naturally', all('/' not in t for t in page.locator('.tile .num').all_inner_texts()))
    # menu: To do only, layout, colours
    page.click('[aria-label="Run options"]'); page.wait_for_selector('.sheet')
    page.click('.sheet >> text=One per row'); page.wait_for_timeout(200)
    check('one per row layout', page.evaluate("document.querySelector('.runbody').classList.contains('as-list')"))
    page.click('.sheet >> text=Day'); page.wait_for_timeout(200)
    check('day colours on request', not page.evaluate("document.documentElement.classList.contains('dark')"))
    page.click('.sheet >> text=Night'); page.click('.sheet >> text=Two across'); page.keyboard.press('Escape')
    # search
    page.click('[aria-label="Find an address"]'); page.fill('.search', 'uxbridge'); page.wait_for_timeout(200)
    n = page.locator('.tile').count()
    check('search finds a street', 0 < n < 20, str(n))
    page.click('.rh >> text=Done'); page.wait_for_timeout(200)
    # tick three, reload, still ticked
    for _ in range(3):
        page.locator('.tile.next').click(); page.wait_for_timeout(150)
    page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    check('ticks survive a reload', page.locator('.tile.done').count() == 3)
    ev = page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('stb.events.')).flatMap(k=>JSON.parse(localStorage.getItem(k)))")
    check('ticks carry GPS', all(e.get('lat') for e in ev if e['done']), json.dumps(ev[0])[:120])
    # leaving the run: no stray message, Today home lists runs as Run N
    page.goto('http://localhost:8765/#/'); page.wait_for_selector('.home-tabs')
    check('earlier days are not under Runs to do', page.locator('.run-tile').count() == 0, page.locator('.home').inner_text()[:200])
    page.click('.home-tabs >> text=History'); page.wait_for_selector('.run-tile')
    check('earlier days are under History', page.locator('.run-tile').count() >= 1)
    page.click('details.papers > summary')
    tot = page.locator('.pick-table tfoot').inner_text() if page.locator('.pick-table tfoot').count() else ''
    check('depot pick has an All runs total of bundles and loose', 'All runs' in tot and ('bundle' in tot or 'loose' in tot), tot.replace('\n', ' | '))
    check('toast does not follow to home', page.locator('#toast').is_hidden())
    names = page.locator('.rt-name').all_inner_texts()
    check('home uses Run N names, in order', names == sorted(names, key=lambda x: int(x.split()[-1])) and all(x.startswith('Run ') for x in names), str(names))
    page.click('[aria-label=Settings]'); page.wait_for_selector('.sheet')
    check('settings has upload and colours', page.locator('.sheet >> text=Upload a run sheet').count() == 1 and page.locator('.sheet >> text=Colours').count() == 1)
    check('no page errors', not errors, str(errors))
    b.close()
print('FAILED:' if fails else 'ALL PASSED', fails)
sys.exit(1 if fails else 0)
