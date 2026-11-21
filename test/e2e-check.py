# Stan's check of a run's addresses before it is driven (decision 0055), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-check.py /path/to/Report.pdf [screenshot-folder]
import sys
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None; failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000); page.locator('.stickybar button').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
    says = lambda: page.locator('.check-say').all_inner_texts()
    swap = page.locator('.check-card', has_text='Is it really')
    check('Stan asks about a unit and number that look the wrong way round', swap.count() == 1 and '5/7 Cook Street' in swap.inner_text() and 'Unit 7 at number 5' in swap.inner_text(), str(says()))
    stray = page.locator('.check-card', has_text='stops away from the rest of')
    check('Stan points out an address away from the rest of its street', stray.count() >= 1, str(says()))
    if SHOTS: page.screenshot(path=f'{SHOTS}/check.png')
    tile = page.locator('.tile[data-addr="HOWICK|COOK STREET|5/7"]')
    check('until someone says so, the tile reads as the sheet has it', tile.locator('.num').inner_text().startswith('7') and 'Unit 5' in tile.inner_text())
    swap.locator('button', has_text='Yes, show').click(); page.wait_for_timeout(500)
    t = tile.inner_text()
    check('after Yes, the tile reads 5, Unit 7, with the sheet’s version in small print', tile.locator('.num').inner_text().startswith('5') and 'Unit 7' in t and 'Sheet says 5/7' in t, t)
    check('and Stan stops asking', page.locator('.check-card', has_text='Is it really').count() == 0)
    page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
    check('the correction is still there next time the run is opened', 'Sheet says 5/7' in page.locator('.tile[data-addr="HOWICK|COOK STREET|5/7"]').inner_text())
    # a stray: Move it
    first = page.locator('.check-card', has_text='stops away from the rest of').first; said = first.locator('.check-say').inner_text()
    first.locator('button', has_text='Move it').click(); page.wait_for_timeout(600)
    check('Move it puts the address with its street, and that suggestion goes', said not in says() and 'Moved' in page.inner_text('#toast'), page.inner_text('#toast'))
    # another: Leave it stays left
    rest = page.locator('.check-card', has_text='stops away from the rest of')
    if rest.count():
        said2 = rest.first.locator('.check-say').inner_text(); rest.first.locator('button', has_text='Leave it').click(); page.wait_for_timeout(300)
        page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
        check('Leave it is remembered: Stan doesn’t ask about that one again', said2 not in says(), str(says()))
    # once the run is under way he keeps quiet
    page.evaluate("localStorage.removeItem('stb.check.ok')"); page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
    n0 = page.locator('.check-card').count()
    for key in page.evaluate("[...new Set([...document.querySelectorAll('.tile')].map((t) => t.dataset.run))].map((r) => document.querySelector(`.tile[data-run=\"${r}\"]:not(.done)`)?.dataset.key).filter(Boolean)"):
        page.locator(f'.tile[data-key="{key}"]').click(); page.wait_for_timeout(250)
    check('once a run has a tick, Stan’s check for that run is put away', page.locator('.check-card').count() == 0, f'{n0} -> {page.locator(".check-card").count()}')
    page.locator('button[aria-label="Run options"]').click(); page.wait_for_timeout(300)
    check('a correction can be undone from the run’s menu', page.locator('.sheet', has_text='Undo an address correction').count() == 1)
    check('no page errors', not errors, str(errors[:2]))
print('all passed' if not failed else f'{len(failed)} FAILED'); sys.exit(1 if failed else 0)
