# Teléfono: mide desbordes del panel de creciente con el ajuste abierto y captura la leyenda de peligro.
from playwright.sync_api import sync_playwright
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 390, 'height': 844})
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').first.click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.evaluate("() => { const r = [...document.querySelectorAll('[role=radio], button')].find((b) => (b.textContent || '').trim().startsWith('Creciente')); if (r) { r.scrollIntoView(); r.click(); } }"); pg.wait_for_timeout(800)
    pg.locator('button.preset', has_text='Inundación grave').click(force=True); pg.wait_for_timeout(500)
    pg.evaluate("() => { const d = document.querySelector('.creek-adjust'); if (d) d.open = true; }"); pg.wait_for_timeout(500)
    res = pg.evaluate("() => [...document.querySelectorAll('.creek-tool .city-range, .creek-tool .city-range *')].filter((el) => el.scrollWidth > el.clientWidth + 2).map((el) => `${el.tagName}.${el.className} ${el.scrollWidth}/${el.clientWidth}`)")
    print('desbordes:', res)
    pg.evaluate("() => { const d = document.querySelector('.creek-adjust'); if (d) d.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(500)
    pg.screenshot(path='/home/claude/shots/city/cr/g-tel-ajuste.png')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.start(); c.displayed().advanceTo(600); c.setPaused(true); c.setView('peligro'); window.scrollTo(0, 0); }"); pg.wait_for_timeout(3000)
    pg.screenshot(path='/home/claude/shots/city/cr/g-tel-peligro.png')
    b.close()
