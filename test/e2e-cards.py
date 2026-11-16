# Browser test of Stan's "Did you know" card (decision 0036), demo mode, phone-sized.
#   python3 -m http.server 8765 &   then   python3 test/e2e-cards.py <report.pdf> [screenshot-folder]
import sys
from playwright.sync_api import sync_playwright
PDF = sys.argv[1]; SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
fails = []
def check(name, ok, detail=''):
    print(('✓' if ok else '✗'), name, detail)
    if not ok: fails.append(name)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(**p.devices['Pixel 7']); page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached'); page.wait_for_selector('.splash', state='detached', timeout=6000)
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    page.locator('.tile:not(.done)').first.click(); page.wait_for_timeout(400)   # one real tick, to learn the name the app uses
    # give this run a morning's worth of ticks at the right time of day (the sheet's own delivery date, 5 am NZ)
    n = page.evaluate("""() => { const run = JSON.parse(localStorage.getItem('stb.demo.runs'))[0]; const k = 'stb.events.' + run.id; const evs = JSON.parse(localStorage.getItem(k));
      const me = evs[0].user_name; const base = Date.parse(run.delivery_date + 'T05:00:00+13:00'); const out = [];
      for (let i = 0; i < 12; i++) out.push({ ...evs[0], id: 'seed' + i, line_key: 'seed' + i, address_key: 'HOWICK|SEED STREET|' + (i + 1), device_time: new Date(base + i * 60000).toISOString(), lat: -36.9, lng: 174.93, accuracy_m: 5 });
      localStorage.setItem(k, JSON.stringify(out)); Object.keys(localStorage).filter((x) => x.startsWith('stb.card.')).forEach((x) => localStorage.removeItem(x)); return me; }""")
    page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.splash', state='detached', timeout=6000)
    page.wait_for_selector('.stan-card', timeout=6000)
    text = page.inner_text('.stan-card')
    check('Stan shows one card on the Runs page, about my own deliveries', ('did you know' in text.lower() or 'tip' in text.lower()) and 'You’ve delivered 12 papers with me' in text, text[:160])
    check('the card fits the phone', page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
    if SHOTS: page.screenshot(path=f'{SHOTS}/card.png')
    page.click('.stan-card >> text=More'); page.wait_for_timeout(300)
    check('answering the card puts it away', page.locator('.stan-card').count() == 0)
    check('“more like this” is remembered', 'fun' in page.evaluate("Object.keys(localStorage).filter((x) => x.endsWith('.prefs')).map((x) => localStorage.getItem(x)).join()"))
    page.reload(); page.wait_for_selector('.splash', state='detached', timeout=6000); page.wait_for_timeout(1200)
    check('one card a day: it does not come back after a reload', page.locator('.stan-card').count() == 0)
    # on duty: no card, even on a new day
    page.evaluate("Object.keys(localStorage).filter((x) => x.startsWith('stb.card.') && !x.endsWith('.prefs')).forEach((x) => localStorage.removeItem(x))")
    page.click('.duty-btn'); page.wait_for_selector('.duty-card.on'); page.goto('http://localhost:8765/#/'); page.reload(); page.wait_for_selector('.splash', state='detached', timeout=6000); page.wait_for_timeout(1500)
    check('on duty, no card', page.locator('.stan-card').count() == 0)
    check('no page errors', not errors, str(errors))
    b.close()
print('ALL PASSED' if not fails else f'FAILED: {fails}'); sys.exit(1 if fails else 0)
