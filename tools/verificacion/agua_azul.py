# Comprueba en el navegador el botón «Agua en azul» y la leyenda (calidad ligera, lluvia de 100 mm/h).
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/lluvia'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Ligera').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Calle de prueba').click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } } }); c.start(); c.displayed().advanceTo(600); }")
    pg.wait_for_timeout(4000)
    legend = lambda: pg.evaluate("() => { const t = [...document.querySelectorAll('.city-legend, [class*=legend]')].map(e => e.textContent).join(' | '); return t.slice(0, 120); }")
    btn = pg.get_by_role('button', name='Agua en azul')
    r0 = (btn.get_attribute('aria-pressed'), legend(), pg.evaluate("() => window.__cityDebug.controller.waterBlue()"))
    pg.screenshot(path=f'{OUT}/t-natural.png')
    btn.click(force=True); pg.wait_for_timeout(2500)
    r1 = (btn.get_attribute('aria-pressed'), legend(), pg.evaluate("() => window.__cityDebug.controller.waterBlue()"))
    pg.screenshot(path=f'{OUT}/t-azul.png')
    btn.click(force=True); pg.wait_for_timeout(1500)
    r2 = (btn.get_attribute('aria-pressed'), pg.evaluate("() => window.__cityDebug.controller.waterBlue()"))
    print('natural:', r0); print('azul:', r1); print('de vuelta:', r2)
    b.close()
print('\n'.join(logs[:10]) or 'consola limpia')
