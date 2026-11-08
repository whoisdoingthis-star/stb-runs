from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['iPhone 13'])
    page = ctx.new_page(); errs=[]
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto('http://localhost:8765/'); page.wait_for_selector('text=Load run sheet')
    page.set_input_files('#pdf', '/home/claude/src2/report.pdf')
    page.wait_for_selector('text=Check the sheet', timeout=30000)
    print([t.split('\n')[0:3] for t in page.locator('.card').all_inner_texts()])
    print(page.locator('.stickybar button').inner_text())
    page.click('.stickybar button'); page.wait_for_selector('.tile'); page.wait_for_timeout(500)
    print('tiles', page.locator('.tile').count(), page.locator('.fb-prog').inner_text(), 'segs', page.locator('.seg button').all_inner_texts())
    page.click('.seg button:has-text("Run 8")'); page.wait_for_timeout(200)
    page.screenshot(path='/home/claude/run8.png')
    print('errors', errs); b.close()
