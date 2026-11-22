# Pictures of the real app for Stan's School (decision 0065), taken in Sandbox Stan on the made-up practice runs, so no
# customer is ever in them. GitHub runs this after every publish that changes the app (.github/workflows/training-shots.yml)
# and saves any picture that changed, so the lessons always show the app as it is today.
#   python3 -m http.server 8765 &   then   python3 tools/training-shots.py [http://localhost:8765]
# A card or course step uses a picture by naming it: shot: 'odometer' → learn/shots/odometer.png.
import sys, os
from playwright.sync_api import sync_playwright
U = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765').rstrip('/')
OUT = os.path.join(os.path.dirname(__file__), '..', 'learn', 'shots')
os.makedirs(OUT, exist_ok=True)
SHOTS = ['runs-page', 'depot-pick', 'crew', 'odometer', 'run', 'problem']   # test/training.mjs checks every shot named in a lesson is here
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 760}, device_scale_factor=1, is_mobile=True, has_touch=True, color_scheme='dark',
                        permissions=['geolocation'], geolocation={'latitude': -36.8935, 'longitude': 174.9310}, timezone_id='Pacific/Auckland', reduced_motion='reduce')
    # A fixed morning, so the pictures only change when the app does (not because the clock moved).
    ctx.clock.set_fixed_time('2026-11-23T05:12:00+13:00')
    pg = ctx.new_page()
    def shot(name):
        pg.wait_for_timeout(700)
        pg.screenshot(path=os.path.join(OUT, f'{name}.png'))
        print('  ', name)
    def hide_bar(): pg.add_style_tag(content='#sbx-bar,#toast{display:none !important} *,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}')
    pg.goto(U + '/sandbox/'); pg.wait_for_selector('.duty-btn'); pg.wait_for_timeout(2500); hide_bar()
    shot('runs-page')
    pick = pg.locator('summary', has_text='To collect')
    if pick.count(): pick.first.click(); pick.first.scroll_into_view_if_needed(); shot('depot-pick')
    pg.evaluate('window.scrollTo(0, 0)')
    pg.locator('.duty-btn').click(); pg.wait_for_selector('.sheet'); shot('crew')
    pg.locator('.who-btn', has_text='Just me').click(); pg.locator('.sheet button', has_text='Prepped').click(); pg.wait_for_selector('.odo-input'); shot('odometer')
    pg.fill('.odo-input', '45210'); pg.evaluate("document.querySelectorAll('.sheet .step-row.good').forEach((r) => { if (r.querySelector('.step-n').textContent === '?') r.querySelector('.step-btn').click(); })")
    pg.locator('.sheet button', has_text='Save').click(); pg.wait_for_timeout(1500)
    rid = pg.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids[1]")
    pg.goto(U + f'/sandbox/#/r/{rid}'); pg.wait_for_selector('.tile'); pg.wait_for_timeout(1500); hide_bar()
    for _ in range(3): pg.evaluate("document.querySelector('.tile:not(.done)').click()"); pg.wait_for_timeout(400)
    if pg.locator('.da').count(): pg.evaluate("document.querySelector('.da button[aria-label*=\"lose\" i]')?.click()")
    shot('run')
    pg.locator('button[aria-label="Problem with this delivery"]').click(); pg.wait_for_timeout(400)
    if pg.locator('.sheet button', has_text='just done').count(): pg.locator('.sheet button', has_text='just done').first.click()
    pg.wait_for_selector('.sheet'); shot('problem')
    b.close()
missing = [s for s in SHOTS if not os.path.exists(os.path.join(OUT, f'{s}.png'))]
if missing: print('Missing pictures:', missing); sys.exit(1)
