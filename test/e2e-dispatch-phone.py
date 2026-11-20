"""Dispatch at phone size (decision 0048). Needs: python3 -m http.server 8766 in the repo root.
Checks every page fits the screen width, the bottom bar and pills work, and a pop-up opens full width with a way to close it."""
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8766/test/dispatch-mock.html'
PAGES = ['overview', 'insights', 'plan', 'runs', 'complaints', 'addresses', 'locations', 'policies', 'users', 'voice', 'history']
fails = []
def check(ok, what):
    print(('ok   ' if ok else 'FAIL ') + what)
    if not ok: fails.append(what)
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 412, 'height': 839}, device_scale_factor=2, has_touch=True, is_mobile=True)
    ctx.route('**/test/vendor/**', lambda r: r.continue_(url=r.request.url.replace('/test/vendor/', '/vendor/')))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    for t in PAGES:
        pg.goto(f'{BASE}#{t}'); pg.reload(); pg.wait_for_function('window.ready === true'); pg.wait_for_timeout(400)
        w = pg.evaluate('document.documentElement.scrollWidth')
        check(w <= 412, f'{t}: fits the phone width ({w}px)')
        if len(sys.argv) > 1: pg.screenshot(path=f'{sys.argv[1]}/{t}.png')
    pg.goto(f'{BASE}#overview'); pg.reload(); pg.wait_for_function('window.ready === true'); pg.wait_for_timeout(400)
    check(pg.locator('.dz-bottom a').count() == 4, 'four sections along the bottom')
    check(pg.locator('.dz-subnav a').all_inner_texts() == ['Now', 'Plan', 'Runs'], 'Today shows Now, Plan, Runs')
    pg.locator('.dz-bottom a', has_text='Set-up').click(); pg.wait_for_timeout(300)
    pg.locator('.dz-subnav a', has_text='Locations').click(); pg.wait_for_timeout(300)
    pg.locator('.dz-bottom a', has_text='Today').click(); pg.wait_for_timeout(300)
    pg.locator('.dz-bottom a', has_text='Set-up').click(); pg.wait_for_timeout(300)
    check(pg.inner_text('.dz-title') == 'Locations', 'a section reopens on the page you last used')
    pg.locator('.dz-bottom a', has_text='Insights').click(); pg.wait_for_timeout(300)
    check(not pg.locator('.dz-subnav').is_visible(), 'a section with one page shows no pills')
    pg.locator('.dz-bottom a', has_text='Today').click(); pg.wait_for_timeout(300)
    pg.locator('.dz-subnav a', has_text='Now').click(); pg.wait_for_timeout(300)
    m = pg.locator('button', has_text='Map').first; m.scroll_into_view_if_needed(); m.click(timeout=5000); pg.wait_for_timeout(800)
    r = pg.evaluate("(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return [r.left | 0, r.width | 0, r.bottom | 0]; })()")
    check(r[0] == 0 and r[1] == 412 and r[2] >= 838, 'a pop-up fills the width from the bottom of the screen')
    x = pg.locator('.sheet .sheet-head [aria-label=Close]'); pg.locator('.sheet').evaluate('s => s.scrollTo(0, 9999)'); pg.wait_for_timeout(200)
    check(x.count() == 1 and x.is_visible() and x.bounding_box()['y'] < 400, 'the close button stays in view when the pop-up is scrolled')
    x.click(); pg.wait_for_timeout(300); check(pg.locator('.sheet').count() == 0, 'the close button closes it')
    check(not errs, f'no page errors {errs[:2]}')
print('ALL PASSED' if not fails else f'{len(fails)} FAILED'); sys.exit(1 if fails else 0)
