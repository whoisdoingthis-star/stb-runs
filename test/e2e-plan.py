# Stan's day plan on the phone (decision 0040), the crew check when going on duty and the notice board (decision 0041),
# and spare papers and pinned rules (decision 0042), in demo mode.
#   python3 -m http.server 8765 &   then   python3 test/e2e-plan.py /path/to/Report.pdf [screenshot-folder]
import json, sys, time
from playwright.sync_api import sync_playwright

PDF = sys.argv[1]
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
failed = []
def check(name, ok, extra=''):
    print(('✓ ' if ok else '✗ ') + name, extra if not ok else '')
    if not ok: failed.append(name)

SEED = """([me, helpers, dayOffset, driver]) => {
  const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date(Date.now() + n * 864e5));
  const today = day(0);
  const runs = JSON.parse(localStorage.getItem('stb.demo.runs')).map((r) => ({ ...r, delivery_date: today }));
  localStorage.setItem('stb.demo.runs', JSON.stringify(runs));
  for (const k of Object.keys(localStorage)) if (k.startsWith('stb.run.')) { const v = JSON.parse(localStorage.getItem(k)); v.run.delivery_date = today; localStorage.setItem(k, JSON.stringify(v)); }
  const routes = [...runs].sort((a, b) => b.route.localeCompare(a.route)).map((r) => r.route);   // the plan's order: last route first
  const now = Date.now(); const m = 60e3; let t = now + 20 * m;
  const list = routes.map((route) => { const x = { route, name: 'Run ' + Number(/(\\d+)$/.exec(route)[1]), startAt: t, finishAt: t + 30 * m, minutes: 30, hopMin: 5, stops: 20 }; t += 35 * m; return x; });
  const plan = { date: day(dayOffset), deadline: t + 5 * m, crews: [{ driver, helpers, runs: list, prepMin: 5, roadMin: 30 * list.length, travelMin: 5 * list.length, depotAt: now + 14 * m, leaveDepotAt: now + 19 * m, firstPaperAt: now + 20 * m, finishAt: t - 5 * m, shiftMin: 35 * list.length + 5 }], assumptions: [], news: ['New: I now know who drives and who helps.'] };
  localStorage.setItem('stb.dayplans', JSON.stringify([{ delivery_date: day(dayOffset), plan, note: 'Papers are due at 2:15.', updated_by: 'Mike', updated_at: '2026-11-19T07:00:00Z' }]));
  localStorage.setItem('stb.crew', JSON.stringify([{ name: 'Me', crew: me }, { name: 'Lenny', crew: 'helper' }, { name: 'Zaph', crew: 'helper' }, { name: 'Lisa', crew: 'driver' }]));
  localStorage.removeItem('stb.plan.seen.Me'); localStorage.removeItem('stb.spares'); localStorage.setItem('stb.sparepeople', JSON.stringify(['Aunty Pat'])); localStorage.removeItem('stb.notices'); localStorage.removeItem('stb.noticeseen'); localStorage.removeItem('stb.myruns'); localStorage.removeItem('stb.duty'); localStorage.removeItem('stb.dutypending');
  return routes;
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'])
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://localhost:8765/')
    page.wait_for_selector('#pdf', state='attached')
    page.wait_for_selector('.splash', state='detached', timeout=4000)
    page.set_input_files('#pdf', PDF)
    page.wait_for_selector('text=Check the sheet', timeout=20000)
    page.locator('.stickybar button').click()
    page.wait_for_selector('.tile')
    home = lambda: (page.goto('http://localhost:8765/#/'), page.reload(), page.wait_for_selector('.duty-card'), page.wait_for_selector('.splash', state='detached', timeout=5000), page.wait_for_timeout(900))
    duty = lambda: page.evaluate("JSON.parse(localStorage.getItem('stb.duty') || '[]')")

    # ---- a driver, with a plan for today ----
    routes = page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Me'])
    home()
    check('the plan pops up the first time the driver opens the app', page.locator('.sheet .plan-pop').count() == 1)
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('Stan says who is driving and who is helping', 'here’s the plan for today' in pop and 'You’re driving, with Lenny helping.' in pop, pop[:200])
    check('it gives the depot time, the first paper and the finish', all(x in pop for x in ['At the depot by', 'First paper by', 'All done by', 'The deadline is']))
    check('it lists the runs in the plan’s order, with times', page.locator('.plan-runs li').count() == len(routes) and page.locator('.plan-runs li b').first.inner_text() == 'Run ' + str(int(routes[0][-2:])))
    check('it shows the dispatcher’s note', 'Mike says: Papers are due at 2:15.' in pop)
    check('it says what has been set up: the runs lined up, and who is ticked', 'Your runs are lined up in this order' in pop and 'Lenny is already ticked' in pop and 'New: I now know who drives and who helps.' in pop, pop[-400:])
    if SHOTS: page.screenshot(path=f'{SHOTS}/plan-popup.png')
    page.locator('.sheet button', has_text='Got it').click(); page.wait_for_timeout(200)
    mine = page.evaluate("JSON.parse(localStorage.getItem('stb.myruns')).ids.length")
    check('My runs is filled in from the plan, in its order', mine == len(routes) and 'My runs: ' + ' → '.join('Run ' + str(int(r[-2:])) for r in routes) in page.inner_text('.duty-card'), page.inner_text('.duty-card'))
    check('the plan stays on the Runs page as a card', page.locator('.plan-card').count() == 1 and 'stan’s plan for today' in page.inner_text('.plan-card').lower() and 'Depot by' in page.inner_text('.plan-card'))
    if SHOTS: page.screenshot(path=f'{SHOTS}/plan-card.png')
    home()
    check('it pops up once only', page.locator('.sheet').count() == 0 and page.locator('.plan-card').count() == 1)
    page.locator('.plan-card').click(); page.wait_for_timeout(200)
    check('tapping the card opens the plan again', page.locator('.sheet .plan-pop').count() == 1)
    page.locator('.sheet button', has_text='Got it').click()

    # ---- going on duty: who's with you? ----
    page.locator('.duty-btn').click(); page.wait_for_timeout(300)
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('On duty asks a driver who is with them: the helpers, Other and Just me, never another driver', 'Who’s with you?' in sheet and page.locator('.who-btn').count() == 4 and 'Lisa' not in sheet and 'Other…' in sheet and 'Just me' in sheet, sheet)
    check('the planned helper is already ticked, so the next step is open', page.locator('.who-btn.on').count() == 1 and 'Lenny' in page.locator('.who-btn.on').inner_text() and page.locator('.who-next button[disabled]').count() == 0)
    page.locator('.who-btn', has_text='Lenny').click(); page.wait_for_timeout(100)
    check('with nobody picked, the next step is locked', page.locator('.who-next button[disabled]').count() == 2 and 'Tap who’s helping, or Just me' in page.inner_text('.who-next'))
    page.locator('.who-next button').first.click(force=True); page.wait_for_timeout(200)
    check('nothing is recorded while it is locked', len(duty()) == 0 and page.locator('.sheet').count() == 1)
    page.locator('.who-btn', has_text='Other…').click(); page.fill('.who-add input', '  seira '); page.locator('.who-add button').click(); page.wait_for_timeout(200)
    check('Other: a typed name becomes a ticked helper', page.locator('.who-btn.on').count() == 1 and page.locator('.who-btn.on').inner_text() == '✓ seira')
    page.locator('.who-btn', has_text='Lenny').click(); page.wait_for_timeout(100)
    if SHOTS: page.screenshot(path=f'{SHOTS}/who-with-you.png')
    page.locator('.sheet button', has_text='Prepping at the depot').click(); page.wait_for_timeout(600)
    d = duty()
    check('Prepping at the depot: on duty, with the helpers on the record', len(d) == 1 and d[0]['state'] == 'on_duty' and sorted(d[0].get('helpers')) == ['Lenny', 'seira'], json.dumps(d))
    check('the duty card then offers Leaving the depot now', page.locator('.duty-card.on .leave-btn').count() == 1 and 'On duty' in page.inner_text('.duty-card'))
    if SHOTS: page.screenshot(path=f'{SHOTS}/leaving-depot.png')
    page.locator('.leave-btn').click(); page.wait_for_timeout(800)
    d = duty()
    check('Leaving the depot now starts the run', len(d) == 2 and d[1]['state'] == 'on_run' and 'On the run' in page.inner_text('.duty-card') and page.locator('.leave-btn').count() == 0, json.dumps(d))
    spares = lambda: page.evaluate("JSON.parse(localStorage.getItem('stb.spares') || '[]')")
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('then Stan asks how many spares are on board: the Herald only on a weekday sheet, and it can be skipped', 'Spares on board?' in sheet and page.locator('.step-row').count() == 1 and 'Herald' in sheet and 'Skip' in sheet and 'go to someone' not in sheet, sheet)
    for _ in range(3): page.locator('.step-btn', has_text='+').click()
    page.locator('.step-btn', has_text='−').click()
    if SHOTS: page.screenshot(path=f'{SHOTS}/spares-start.png')
    page.locator('.sheet button', has_text='Save').click(); page.wait_for_timeout(500)
    sp = spares()
    check('the start count is saved for today under my name', len(sp) == 1 and sp[0]['moment'] == 'start' and sp[0]['counts'] == {'NZH': 2} and sp[0]['given'] == [] and sp[0]['user_name'] == 'Me', json.dumps(sp))
    page.locator('.duty-card button', has_text='Off duty').click(); page.wait_for_timeout(300)
    page.locator('.sheet button', has_text='Off duty').click(); page.wait_for_timeout(800)
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('going off duty asks how many are left and who any went to, with the regulars as buttons', duty()[-1]['state'] == 'off_duty' and 'Spares left?' in sheet and 'Did any spares go to someone?' in sheet.replace('DID ANY SPARES GO TO SOMEONE?', 'Did any spares go to someone?') and 'Aunty Pat' in sheet and 'Someone else…' in sheet, sheet)
    page.locator('.step-row', has_text='Herald').locator('.step-btn', has_text='+').click()
    page.locator('.step-row', has_text='Aunty Pat').locator('.step-btn', has_text='+').click()
    page.locator('.who-other').click(); page.fill('.who-add input', 'Mr Lee'); page.locator('.who-add button').click(); page.wait_for_timeout(200)
    if SHOTS: page.screenshot(path=f'{SHOTS}/spares-end.png')
    page.locator('.sheet button', has_text='Save').click(); page.wait_for_timeout(500)
    sp = spares()
    check('the end count is saved with who the spares went to, and a new name is remembered', len(sp) == 2 and sp[1]['moment'] == 'end' and sp[1]['counts'] == {'NZH': 1} and sp[1]['given'] == [{'to': 'Aunty Pat', 'n': 1}, {'to': 'Mr Lee', 'n': 1}] and 'Mr Lee' in page.evaluate("JSON.parse(localStorage.getItem('stb.sparepeople'))"), json.dumps(sp))
    check('the typed name is kept as a helper for next time', any(c['name'] == 'seira' and c['crew'] == 'helper' for c in page.evaluate("JSON.parse(localStorage.getItem('stb.crew'))")))

    # ---- on their own ----
    page.evaluate(SEED, ['driver', [], 0, 'Me']); page.evaluate("localStorage.setItem('stb.dayplans', JSON.stringify(JSON.parse(localStorage.getItem('stb.dayplans')).map((p) => ({ ...p, updated_at: '2026-11-19T08:00:00Z' }))))")
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('a changed plan pops up again; on their own, Stan says so and allows for folding', 'You’re driving on your own.' in pop and 'folding and bagging' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    page.locator('.duty-btn').click(); page.wait_for_timeout(300)
    check('on their own: nobody is ticked and the next step is locked until Just me', page.locator('.who-btn.on').count() == 0 and page.locator('.who-next button[disabled]').count() == 2)
    page.locator('.who-btn', has_text='Just me').click(); page.wait_for_timeout(100)
    page.locator('.sheet button', has_text='Prepped: starting the run').click(); page.wait_for_timeout(600)
    check('prepped and starting also asks about spares, and Skip saves nothing', 'Spares on board?' in page.inner_text('.sheet'))
    page.locator('.sheet button', has_text='Skip').click(); page.wait_for_timeout(300)
    check('skipping leaves no spare count', len(page.evaluate("JSON.parse(localStorage.getItem('stb.spares') || '[]')")) == 0 and page.locator('.sheet').count() == 0)
    d = duty(); check('Just me, already prepped: on duty with no helpers, and straight on the run', len(d) == 2 and d[0]['state'] == 'on_duty' and d[0].get('helpers') == [] and d[1]['state'] == 'on_run' and d[1]['device_time'] > d[0]['device_time'] and 'On the run' in page.inner_text('.duty-card'), json.dumps(d))

    # ---- a helper ----
    page.evaluate(SEED, ['helper', ['Me'], 0, 'Lisa'])
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('a helper gets the plan too: who they are helping and what to do', 'You’re helping Lisa.' in pop and 'Lisa drives. You fold and bag on the way' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    check('the helper’s card says who they are helping', 'Helping Lisa' in page.inner_text('.plan-card'))
    page.locator('.duty-btn').click(); page.wait_for_timeout(300)
    sheet = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('a helper is asked who is driving: the drivers only, the planned one first', 'Who’s driving?' in sheet and page.locator('.who-btn').count() == 1 and page.locator('.who-btn.primary').inner_text() == 'Lisa' and len(duty()) == 0, sheet)
    page.locator('.who-btn', has_text='Lisa').click(); page.wait_for_timeout(600)
    d = duty(); check('tapping the driver puts the helper on duty, with the driver on the record', page.locator('.sheet').count() == 0 and len(d) == 1 and d[0].get('driver') == 'Lisa' and 'helpers' not in d[0] and page.locator('.leave-btn').count() == 0, json.dumps(d))

    # ---- tomorrow's plan, seen the evening before ----
    page.evaluate(SEED, ['driver', ['Lenny'], 1, 'Me'])
    home()
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('tomorrow’s plan pops up the evening before, and says the runs will be lined up in the morning', 'here’s the plan for tomorrow' in pop and 'In the morning, your runs will be lined up' in pop, pop[:300])
    page.locator('.sheet button', has_text='Got it').click()
    check('tomorrow’s plan does not touch today’s My runs', page.evaluate("localStorage.getItem('stb.myruns')") is None and 'stan’s plan for tomorrow' in page.inner_text('.plan-card').lower())

    # ---- not in the plan; no plan; no crew list ----
    page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Lisa'])
    home()
    check('someone who is not in the plan sees no pop-up and no card', page.locator('.sheet').count() == 0 and page.locator('.plan-card').count() == 0)
    page.evaluate("localStorage.removeItem('stb.dayplans'); localStorage.removeItem('stb.crew')")
    home()
    page.locator('.duty-btn').click(); page.wait_for_timeout(600)
    d = duty(); check('with no drivers-and-helpers list, On duty works as before: one tap', page.locator('.sheet').count() == 0 and len(d) == 1 and d[0]['state'] == 'on_duty', json.dumps(d))

    # ---- the notice board ----
    page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Lisa'])
    page.evaluate("""() => { const now = Date.now(); localStorage.setItem('stb.notices', JSON.stringify([
      { id: 'n1', from_name: 'Mike', body: 'Papers will be late: about 2:45.', to_names: null, created_at: new Date(now - 3600e3).toISOString(), expires_at: new Date(now + 2 * 864e5).toISOString() },
      { id: 'n2', from_name: 'Lisa', body: 'Just for you: bring the trolley.', to_names: ['Me'], created_at: new Date(now - 1800e3).toISOString(), expires_at: null },
      { id: 'n3', from_name: 'Mike', body: 'Not for me.', to_names: ['Lenny'], created_at: new Date(now - 900e3).toISOString(), expires_at: null },
      { id: 'n4', from_name: 'Mike', body: 'Old news.', to_names: null, created_at: new Date(now - 9 * 864e5).toISOString(), expires_at: new Date(now - 6 * 864e5).toISOString() }])); }""")
    home(); page.wait_for_timeout(600)
    pop = page.inner_text('.sheet') if page.locator('.sheet').count() else ''
    check('Stan pops up with the notes for me: to everyone and to me, not someone else’s or an expired one', '2 notes for you' in pop and 'Papers will be late' in pop and 'bring the trolley' in pop and 'Not for me' not in pop and 'Old news' not in pop, pop)
    if SHOTS: page.screenshot(path=f'{SHOTS}/notice-popup.png')
    page.locator('.sheet .icon-btn').click(); page.wait_for_timeout(300)
    home(); page.wait_for_timeout(600)
    check('closed without Got it, it comes back the next time', page.locator('.sheet').count() == 1 and '2 notes for you' in page.inner_text('.sheet'))
    page.locator('.sheet button', has_text='Got it').click(); page.wait_for_timeout(400)
    seen = page.evaluate("JSON.parse(localStorage.getItem('stb.noticeseen') || '[]')")
    check('Got it is recorded for each note, under my name', sorted(x['notice_id'] for x in seen) == ['n1', 'n2'] and all(x['user_name'] == 'Me' for x in seen), json.dumps(seen))
    home(); page.wait_for_timeout(600)
    check('acknowledged notes do not pop up again; the board button counts the live notes for me', page.locator('.sheet').count() == 0 and page.locator('.notice-count').inner_text() == '2')
    page.locator('.notice-btn').click(); page.wait_for_timeout(300)
    board = page.inner_text('.sheet')
    check('the board lists my notes with who has seen them', 'Papers will be late' in board and 'Seen by Me; not yet Lenny, Zaph and Lisa' in board and 'Not for me' not in board, board)
    page.locator('.sheet button', has_text='Leave a note').click(); page.wait_for_timeout(300)
    page.locator('.sheet button', has_text='Post it').click(); page.wait_for_timeout(200)
    check('an empty note is not posted', 'Write the note first.' in page.inner_text('.sheet'))
    check('a note can be pinned as a rule', page.locator('.who-btn', has_text='Pin as a rule').count() == 1)
    check('a new note is for Everyone and for three days unless changed', page.locator('.who-btn.on').count() == 2 and 'Everyone' in page.locator('.who-btn.on').first.inner_text() and 'For 3 days' in page.locator('.who-btn.on').nth(1).inner_text())
    page.fill('.sheet textarea', 'Gate code at the village has changed. Ask Mike.')
    page.locator('.who-btn', has_text='Lenny').click(); page.locator('.who-btn', has_text='Until I remove it').click()
    if SHOTS: page.screenshot(path=f'{SHOTS}/notice-write.png')
    page.locator('.sheet button', has_text='Post it').click(); page.wait_for_timeout(600)
    notes = page.evaluate("JSON.parse(localStorage.getItem('stb.notices'))"); mine = [n for n in notes if n['from_name'] == 'Me']
    check('posting saves the note with who it is for and how long', len(mine) == 1 and mine[0]['to_names'] == ['Lenny'] and mine[0]['expires_at'] is None and mine[0]['body'].startswith('Gate code'), json.dumps(mine))
    check('my own note never pops up for me', page.locator('.sheet').count() == 0)
    page.locator('.notice-btn').click(); page.wait_for_timeout(300)
    board = page.inner_text('.sheet')
    check('my note is on the board, waiting for Lenny, and I can take it down', 'You ·' in board and 'for Lenny' in board and 'not yet Lenny' in board and page.locator('.nb-note button', has_text='Take it down').count() == 1, board)
    if SHOTS: page.screenshot(path=f'{SHOTS}/notice-board.png')
    page.locator('.nb-note button', has_text='Take it down').click(); page.wait_for_timeout(500)
    check('taking it down removes it from the board', page.locator('.notice-count').inner_text() == '2' and any(n.get('removed_at') for n in page.evaluate("JSON.parse(localStorage.getItem('stb.notices'))")))
    # pinned rules and the morning card
    page.locator('.notice-btn').click(); page.wait_for_timeout(300)
    page.locator('.sheet button', has_text='Leave a note').click(); page.wait_for_timeout(300)
    page.fill('.sheet textarea', 'Only give a spare if it is on the way and the count allows.')
    page.locator('.who-btn', has_text='Pin as a rule').click(); page.locator('.sheet button', has_text='Post it').click(); page.wait_for_timeout(600)
    pinned = [n for n in page.evaluate("JSON.parse(localStorage.getItem('stb.notices'))") if n.get('pinned')]
    check('a pinned rule is saved with no end date', len(pinned) == 1 and pinned[0]['expires_at'] is None, json.dumps(pinned))
    page.evaluate("""() => { const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(new Date());
      const runs = JSON.parse(localStorage.getItem('stb.demo.runs')); runs[0].closed_at = new Date().toISOString(); localStorage.setItem('stb.demo.runs', JSON.stringify(runs));
      localStorage.setItem('stb.spares', JSON.stringify([{ id: 's1', delivery_date: day, user_name: 'Me', moment: 'end', counts: { NZH: 3 }, given: [{ to: 'Aunty Pat', n: 1 }], device_time: new Date().toISOString() }])); }""")
    home(); page.wait_for_timeout(300)
    page.locator('.notice-btn').click(); page.wait_for_timeout(900)
    board = page.inner_text('.sheet')
    check('the board puts pinned rules first under How we do things', board.lower().index('how we do things') < board.lower().index('notes') and 'Only give a spare' in board and page.locator('.nb-pinned').count() == 1, board)
    check('the board shows this morning by itself: runs done and the spares', 'this morning' in board.lower() and 'Run 6 done ' in board and 'Spares: Herald: 3 left · 1 to Aunty Pat' in board, board)
    if SHOTS: page.screenshot(path=f'{SHOTS}/board-morning.png')
    page.locator('.sheet .icon-btn').click(); page.wait_for_timeout(200)
    # with a plan and a note both waiting: the plan first, then the note
    page.evaluate(SEED, ['driver', ['Lenny'], 0, 'Me'])
    page.evaluate("localStorage.setItem('stb.notices', JSON.stringify([{ id: 'n9', from_name: 'Mike', body: 'One more thing.', to_names: null, created_at: new Date().toISOString(), expires_at: null }]))")
    home()
    check('with a plan and a note both waiting, the plan shows first', page.locator('.sheet .plan-pop').count() == 1 and page.locator('.sheet-backdrop').count() == 1)
    page.locator('.sheet button', has_text='Got it').click(); page.wait_for_timeout(2500)
    check('and the note follows once the plan is closed', page.locator('.sheet').count() == 1 and 'One more thing.' in page.inner_text('.sheet'))
    page.locator('.sheet button', has_text='Got it').click()
    check('no page errors', not errors, str(errors))
    b.close()

print('\n' + ('FAILED: ' + ', '.join(failed) if failed else 'all passed'))
sys.exit(1 if failed else 0)
