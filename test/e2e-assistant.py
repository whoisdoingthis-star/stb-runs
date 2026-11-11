# Driver Assistant, end to end in demo mode: fake GPS, stop positions and a route; follow the
# panel and what it says while "driving" to the next stop. Usage: python3 test/e2e-assistant.py report.pdf
import sys
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
fails = []
def check(name, ok, info=''):
    print(('✓ ' if ok else '✗ ') + name, info if not ok else '')
    if not ok: fails.append(name)

LAT0, LNG0 = -36.9000, 174.9300
INIT = """
(() => {
  const m = 111320, k = Math.cos(%(lat)f * Math.PI / 180);
  const pt = (n, w) => ({ lat: %(lat)f + n / m, lng: %(lng)f - w / (m * k) });
  // every address gets a letterbox on the left of a westbound street, 400 m north then 200 m west
  globalThis.__stbFakeDest = (keys) => Object.fromEntries(keys.map((key) => [key, { address_key: key, ...pt(392, 200), source: 'learned' }]));
  globalThis.__stbFakeRoute = async (from) => {
    const c = pt(400, 0), e = pt(400, 200);
    return { features: [{ geometry: { coordinates: [[from.lng, from.lat], [c.lng, c.lat], [e.lng, e.lat]] }, properties: { summary: { distance: 600 }, segments: [{ steps: [
      { type: 11, instruction: 'Head north', name: 'Selwyn Road', way_points: [0, 1], distance: 400 },
      { type: 0, instruction: 'Turn left onto Masefield Avenue', name: 'Masefield Avenue', way_points: [1, 2], distance: 200 },
      { type: 10, instruction: 'Arrive', name: '-', way_points: [2, 2], distance: 0 }] }] } }] };
  };
  globalThis.__said = [];
  globalThis.SpeechSynthesisUtterance = function (t) { this.text = t; };
  Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u) => u.text && __said.push(u.text), cancel() {}, getVoices: () => [] } });
})();
""" % {'lat': LAT0, 'lng': LNG0}

def at(n, w):
    return {'latitude': LAT0 + n / 111320, 'longitude': LNG0 - w / (111320 * 0.79968)}

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], permissions=['geolocation'], geolocation={**at(0, 0), 'accuracy': 5})
    ctx.add_init_script(INIT)
    page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('#pdf', state='attached')
    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(800)
    check('turns on by itself on a run that is new to you', page.locator('.da').is_visible())
    nxt = page.locator('.tile.next').get_attribute('data-label')
    def drive(n, w, wait=700):
        ctx.set_geolocation({**at(n, w), 'accuracy': 5}); page.wait_for_timeout(wait)
    drive(5, 0); drive(20, 0, 2800); drive(40, 0)
    said = page.evaluate('__said')
    check('names the next stop and the first turn', any(s.startswith(f'Next stop, {nxt}.') and 'turn left onto Masefield Avenue' in s for s in said), str(said))
    check('panel shows the turn and the distance', 'Turn left onto Masefield Avenue' in page.locator('.da-text').inner_text() and 'm' in page.locator('.da-dist').inner_text(), page.locator('.da').inner_text())
    drive(250, 0); drive(370, 0)
    said = page.evaluate('__said')
    check('warns before the turn, then at the turn', any(s.startswith('In ') and 'turn left onto Masefield' in s for s in said[1:]) and 'Turn left onto Masefield Avenue.' in said, str(said))
    drive(400, 120); drive(400, 175); drive(400, 190)
    said = page.evaluate('__said')
    check('arriving: says the stop and the side', any(s.startswith(f'Arriving. {nxt}, on your left') for s in said), str(said[-2:]))
    check('it never ticks for you', page.locator('.tile.done').count() == 0)
    page.locator('.tile.next').click(); page.wait_for_timeout(300); drive(392, 195)
    said = page.evaluate('__said')
    nxt2 = page.locator('.tile.next').get_attribute('data-label')
    check('after a tick it moves on to the new next stop', any(s.startswith(f'Next stop, {nxt2}.') for s in said), str(said[-2:]))
    page.screenshot(path='/tmp/da.png')
    page.click('[aria-label="Close the Driver Assistant"]'); page.wait_for_timeout(200)
    check('closes', not page.locator('.da').is_visible())
    page.reload(); page.wait_for_selector('.tile'); page.wait_for_timeout(600)
    check('stays closed once you close it', not page.locator('.da').is_visible())
    check('no page errors', not errors, str(errors))
    b.close()
print('ALL PASSED' if not fails else f'FAILED {fails}')
sys.exit(1 if fails else 0)
