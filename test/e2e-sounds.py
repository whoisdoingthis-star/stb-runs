# Run sounds and the nudge at a stop that isn't routine (decision 0051), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-sounds.py /path/to/Report.pdf
import sys
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    page.add_init_script("globalThis.__stbSfxLog = [];")
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000); page.locator('.stickybar button').click(); page.wait_for_selector('.tile')
    log = lambda: page.evaluate("globalThis.__stbSfxLog")
    clear = lambda: page.evaluate("globalThis.__stbSfxLog.length = 0")
    plain = page.locator('.tile:not(.done):not([data-heads])')
    clear(); plain.nth(0).click(); page.wait_for_timeout(500); plain.nth(0).click(); page.wait_for_timeout(500); plain.nth(0).click(); page.wait_for_timeout(500)
    ticks = [x for x in log() if x[0] == 'tick']
    check('each tick makes its sound, one step up the scale from the last', [x[1] for x in ticks] == [0, 1, 2], str(log()))
    key = page.locator('.tile.done').last.get_attribute('data-key')
    clear(); page.locator(f'.tile[data-key="{key}"]').click(); page.wait_for_timeout(500)
    check('unticking straight away has its own sound', ['untick', 0] in log(), str(log()))
    heads = page.locator('.tile[data-heads]')
    check('stops that are not routine are marked for a nudge', heads.count() >= 1)
    # tick the stop just before a marked one, when it is the next stop
    did = page.evaluate("""() => { const tiles = [...document.querySelectorAll('.tile')]; const i = tiles.findIndex((t, k) => k > 0 && t.dataset.heads && !tiles[k - 1].classList.contains('done')); if (i < 1) return null;
      for (const t of tiles.slice(0, i - 1)) if (!t.classList.contains('done')) return 'earlier'; return tiles[i - 1].dataset.key; }""")
    if did and did != 'earlier':
        clear(); page.locator(f'.tile[data-key="{did}"]').click(); page.wait_for_timeout(900)
        check('ticking the stop before one sounds the nudge and lights its tile', ['headsup', 0] in log() and page.locator('.tile.heads-up').count() == 1, str(log()))
    page.evaluate("localStorage.setItem('stb-sfx', 'off')")
    page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.splash', state='detached', timeout=6000); page.locator('.settings-btn').click(); page.wait_for_timeout(300)
    txt = page.inner_text('.sheet')
    check('Settings has Run sounds, showing Off once switched off', 'Run sounds' in txt and page.locator('.sheet button[aria-pressed=true]', has_text='Off').count() >= 1, txt[:300])
    check('no page errors', not errors, str(errors[:2]))
print('all passed' if not failed else f'{len(failed)} FAILED'); sys.exit(1 if failed else 0)
