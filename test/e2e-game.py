# Browser test of Stan getting bored and Stan's Paper Run (decision 0034), demo mode, phone-sized.
#   python3 -m http.server 8765 &   then   python3 test/e2e-game.py [screenshot-folder]
import sys
from playwright.sync_api import sync_playwright
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
fails = []
def check(name, ok, detail=''):
    print(('✓' if ok else '✗'), name, detail)
    if not ok: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.add_init_script("globalThis.__stbBoredMs = 3200")   # the real wait is 5 seconds
    page.goto('http://localhost:8765/'); page.wait_for_selector('.splash', state='detached', timeout=6000)
    check('Stan is not bored straight away', page.locator('.bored-play').count() == 0)
    page.wait_for_selector('.bored-play', timeout=4000)
    check('with nothing to deliver, Stan gets bored and offers a game', 'Fancy a game' in page.inner_text('.bored-box'))
    if SHOTS: page.screenshot(path=f'{SHOTS}/game-0-bored.png')
    page.click('.bored-play'); page.wait_for_selector('.sg-panel')
    check('the game opens with how to play', 'How to play' in page.inner_text('.sg-panel'))
    page.click('.sg-panel .btn'); page.wait_for_timeout(400)
    check('the game starts: panel gone, score showing', page.locator('.sg-panel').is_hidden() and page.inner_text('.sg-score') == '0')
    for i in range(14):
        page.dispatch_event('.sg-throw' if i % 2 else '.sg-jump', 'pointerdown'); page.wait_for_timeout(180)
    if SHOTS: page.screenshot(path=f'{SHOTS}/game-1-playing.png')
    check('the game fits the phone', page.evaluate("document.querySelector('.sg-c').getBoundingClientRect().right <= innerWidth"))
    page.wait_for_selector('.sg-board', timeout=90000); page.wait_for_timeout(500)
    check('when the run ends the family board shows, with my score', 'Family high scores' in page.inner_text('.sg-panel') and page.locator('.sg-board li.me').count() == 1)
    check('my score is kept', page.evaluate("JSON.parse(localStorage.getItem('stb.scores')||'[]').length") == 1)
    if SHOTS: page.screenshot(path=f'{SHOTS}/game-2-over.png')
    page.click('.sg-x'); check('closing the game goes back to Runs', page.locator('.sg').count() == 0)
    # on duty: no boredom, no game
    page.click('.duty-btn'); page.wait_for_selector('.duty-card.on')
    page.reload(); page.wait_for_selector('.duty-card.on'); page.wait_for_selector('.splash', state='detached', timeout=6000); page.wait_for_timeout(4000)
    check('on duty, Stan never offers the game', page.locator('.bored-play').count() == 0)
    check('no page errors', not errors, str(errors))
    b.close()
print('ALL PASSED' if not fails else f'FAILED: {fails}'); sys.exit(1 if fails else 0)
