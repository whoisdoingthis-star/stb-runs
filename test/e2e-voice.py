# Stan's own voice in the app (decision 0023), end to end in demo mode with LOCAL copies of the voice files:
# offer -> download -> ready -> he speaks the Assistant's lines himself (not the phone's voice) -> Settings switch.
#   Serve a folder holding: demo/ (the app with an empty config.js), ptw/ (onnxruntime-web + piper wasm), voice/ (a Piper voice)
#   python3 test/e2e-voice.py report.pdf [http://localhost:8790]
import sys
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8790'
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

VOICE = """
globalThis.__stbVoiceOpts = { voice: 'local', speaker: 0, urls: {
  ort: '%(b)s/ptw/ort/package/dist/esm/ort.wasm.min.js', ortWasm: '%(b)s/ptw/ort/package/dist/ort-wasm-simd.wasm',
  phonemizeJs: '%(b)s/ptw/package/dist/piper-o91UDS6e.js', phonemizeWasm: '%(b)s/ptw/pw/package/build/piper_phonemize.wasm', phonemizeData: '%(b)s/ptw/pw/package/build/piper_phonemize.data' },
  voices: { local: { model: '%(b)s/voice/en-us-lessac-medium/en-us-lessac-medium.onnx', config: '%(b)s/voice/en-us-lessac-medium/en-us-lessac-medium.onnx.json' } } };
""" % {'b': BASE}
STATE = "(async () => { const v = (await import('%s/demo/js/stanvoice.js')).stanVoice(); return { state: v.state, lines: v.lines.size, played: v.played || 0 }; })()" % BASE

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    ctx = b.new_context(**p.devices['Pixel 7'], permissions=['geolocation'], geolocation={**at(0, 0), 'accuracy': 5})
    ctx.add_init_script(INIT); ctx.add_init_script(VOICE)
    page = ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/demo/'); page.wait_for_selector('#pdf', state='attached')
    page.wait_for_selector('#toast .stan', timeout=8000)
    check('first open, not on Wi-Fi: Stan offers his voice (100 MB) instead of just downloading', '100 MB' in page.inner_text('#toast') and page.evaluate(STATE)['state'] == 'off', page.inner_text('#toast'))
    page.locator('#toast button', has_text='Get it').click()
    page.wait_for_function("document.getElementById('toast').innerText.includes('voice is ready')", timeout=90000)
    check('after the download his voice is ready', page.evaluate(STATE)['state'] == 'ready')
    page.reload(); page.wait_for_selector('#pdf', state='attached')
    page.wait_for_function(STATE.replace('return {', 'return v.state === "ready" && {'), timeout=30000)
    check('next time the app opens it loads by itself, with no question', not page.locator('#toast:has-text("100 MB")').is_visible())

    page.set_input_files('#pdf', PDF); page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click(); page.wait_for_selector('.tile'); page.wait_for_timeout(800)
    page.wait_for_function(STATE.replace('return {', 'return v.state === "ready" && {'), timeout=30000)
    def drive(n, w, wait=700):
        ctx.set_geolocation({**at(n, w), 'accuracy': 5}); page.wait_for_timeout(wait)
    page.mouse.click(5, 5)  # a tap, as on a real phone, unlocks sound
    drive(5, 0); drive(20, 0, 2800); drive(40, 0, 2500)
    st = page.evaluate(STATE); said = page.evaluate('__said')
    check('Stan says the Assistant\u2019s lines in his own voice, not the phone\u2019s', st['played'] >= 1 and not said, f"{st} phone said {said}")
    check('the stop\u2019s likely lines were got ready early', st['lines'] >= 3, str(st))

    page.goto(BASE + '/demo/#/'); page.wait_for_selector('.duty-card'); page.wait_for_selector('.splash', state='detached', timeout=6000)
    page.locator('[aria-label="Settings"]').click(); page.wait_for_selector('.voice-status')
    check('Settings shows his voice is ready', 'ready on this phone' in page.inner_text('.voice-status'), page.inner_text('.voice-status'))
    page.locator('.sheet').screenshot(path='/tmp/voice-settings.png')
    page.locator('.sheet button', has_text='Phone').click(); page.wait_for_selector('.voice-status')
    check('Voice: Phone\u2019s switches back to the phone\u2019s voice', page.evaluate("localStorage.getItem('stb-voice')") == 'phone' and 'phone' in page.inner_text('.voice-status').lower())
    check('no page errors', not errors, str(errors))
    b.close()

print('ALL PASSED' if not fails else f'FAILED: {fails}')
sys.exit(1 if fails else 0)
