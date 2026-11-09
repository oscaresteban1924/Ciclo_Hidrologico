# Creciente desde la lluvia en la cuenca y aviso temprano: panel y maqueta.
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/cuenca'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
import os
os.makedirs(OUT, exist_ok=True)
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.set_default_timeout(240000)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera').click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.get_by_role('radio', name='Creciente').first.evaluate('e => e.click()'); pg.wait_for_timeout(400)
    pg.get_by_role('radio', name='Lluvia en la cuenca').first.evaluate('e => e.click()'); pg.wait_for_timeout(400)
    pg.get_by_role('radio', name='Urbanizada').first.evaluate('e => e.click()'); pg.wait_for_timeout(400)
    pg.locator('button.preset', has_text='Muy fuerte').first.evaluate('e => e.click()'); pg.wait_for_timeout(600)
    pg.evaluate("() => document.querySelector('.basin-box').scrollIntoView({ block: 'start' })"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/1-cuenca-panel.png')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); }")
    for k in range(14):
        pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({(k + 1) * 180})"); pg.wait_for_timeout(150)
    pg.wait_for_timeout(1500)
    pg.evaluate("() => document.querySelector('.warn-box').scrollIntoView({ block: 'start' })"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/2-aviso-min42.png')
    print(pg.evaluate("() => document.querySelector('.warn-box').innerText.slice(0, 1200)"))
    pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(3000)
    pg.screenshot(path=f'{OUT}/3-seccion-min42.png')
    pg.evaluate("() => window.__cityDebug.controller.setPaused(false)")
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
