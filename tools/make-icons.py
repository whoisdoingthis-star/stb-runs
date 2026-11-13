# Makes the home-screen icons from Stan's drawing (decision 0033).
#   python3 -m http.server 8766 &   then   python3 tools/make-icons.py
from playwright.sync_api import sync_playwright
# name, size, r (share of the icon his head's circle takes: 0.40 = the maskable safe zone), spark lines
ICONS = [('icon-192.png', 192, 0.46, 1), ('icon-512.png', 512, 0.46, 1), ('icon-180.png', 180, 0.45, 1), ('icon-512-maskable.png', 512, 0.41, 0)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, r, sparks in ICONS:
        pg = b.new_page(viewport={'width': size, 'height': size})
        pg.goto(f'http://localhost:8766/tools/icon.html?size={size}&r={r}&sparks={sparks}'); pg.wait_for_function('window.ready')
        pg.screenshot(path=f'icons/{name}'); pg.close(); print('made', name)
    b.close()
