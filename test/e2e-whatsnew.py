# What's new (decision 0059), in demo mode with the pop-up switched on for the test.
#   python3 -m http.server 8765 &   then   python3 test/e2e-whatsnew.py /path/to/Report.pdf [screenshot-folder]
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
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000); page.locator('.stickybar button').click(); page.wait_for_selector('.tile')
    def home(news=True):
        page.goto('http://localhost:8765/#/'); 
        if news: page.add_init_script("globalThis.__stbNews = true;")
        page.reload(); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=5000); page.wait_for_timeout(1500)
    home(news=False)
    check('trying the app out in demo mode, it doesn’t pop up by itself', page.locator('.news').count() == 0)
    home()
    n = page.evaluate("import('./js/whatsnew.js').then((m) => m.unseenFor(m.rolesOf({}), [], new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date())).length)")
    txt = page.inner_text('.sheet') if page.locator('.news').count() else ''
    check('next time the app is opened, Stan shows what’s new: one card, with what changed and why', page.locator('.news').count() == 1 and f'1 of {n}' in txt.lower().replace('1 OF', '1 of') and 'Why:' in txt and page.locator('.news-title').count() == 1 and n >= 3, txt[:300])
    check('a helper isn’t shown the drivers’ rules', all('Odometer before' not in t for t in page.evaluate("import('./js/whatsnew.js').then((m) => m.unseenFor(m.rolesOf({}), [], '2026-11-22').map((u) => u.title))")))
    if SHOTS: page.screenshot(path=f'{SHOTS}/whatsnew.png')
    page.add_init_script("globalThis.__stbStanLog = [];"); page.evaluate("globalThis.__stbStanLog = []")
    page.locator('.news-read').click(); page.wait_for_timeout(900)
    log = page.evaluate("globalThis.__stbStanLog")
    check('the speaker asks Stan to read this card aloud; with nothing recorded yet he says so and the words are still there', any(k[0].startswith('news.') for k in log) and 'recorded' in page.inner_text('#toast') and page.locator('.news-what').is_visible(), str(log) + page.inner_text('#toast'))
    first = page.inner_text('.news-title')
    page.locator('.news button', has_text='Next').click(); page.wait_for_timeout(200)
    check('Next moves on, Back goes back', page.inner_text('.news-title') != first and page.locator('.news button', has_text='Back').count() == 1)
    page.locator('.sheet [aria-label=Close]').click(); page.wait_for_timeout(600)
    seen = page.evaluate("JSON.parse(localStorage.getItem('stb.updateseen') || '[]')")
    check('closed part-way: the two cards reached are remembered', len(seen) == 2, str(seen))
    home()
    txt = page.inner_text('.sheet') if page.locator('.news').count() else ''
    check('the rest come back next time', f'1 of {n - 2}' in txt.lower().replace('1 OF', '1 of'), txt[:120])
    for _ in range(n): 
        nx = page.locator('.news button', has_text='Next')
        if nx.count(): nx.click(); page.wait_for_timeout(120)
    page.locator('.news button', has_text='Got it').click(); page.wait_for_timeout(600)
    home()
    check('after Got it on the last card, it doesn’t come back', page.locator('.news').count() == 0)
    page.locator('.settings-btn').click(); page.wait_for_timeout(300); page.locator('.sheet button', has_text='What’s new').click(); page.wait_for_timeout(900)
    check('Settings → What’s new shows them all again', page.locator('.news').count() == 1 and f'1 of {n}' in page.inner_text('.sheet').lower())
    page.locator('.sheet [aria-label=Close]').click(); page.wait_for_timeout(400)
    # on duty: it waits
    page.evaluate("localStorage.removeItem('stb.updateseen')")
    page.locator('.duty-btn').click(); page.wait_for_timeout(400)
    b2 = page.locator('.sheet button', has_text='Prepping at the depot')
    if b2.count():
        j = page.locator('.who-btn', has_text='Just me')
        if j.count(): j.click()
        b2.click(); page.wait_for_timeout(500)
    home()
    check('on duty, it waits: nothing pops up', page.locator('.duty-card.on').count() == 1 and page.locator('.news').count() == 0)
    check('no page errors', not errors, str(errors[:2]))
print('all passed' if not failed else f'{len(failed)} FAILED'); sys.exit(1 if failed else 0)
