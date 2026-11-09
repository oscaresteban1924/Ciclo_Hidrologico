# Sector elegido, lluvia acelerada y vistas: realista, materiales, resultados, bajo la calle, calle.
import sys
from playwright.sync_api import sync_playwright
URL = 'http://127.0.0.1:5173/'
sector = sys.argv[1]
W = int(sys.argv[2]); H = int(sys.argv[3])
tag = f'{sector}-{W}x{H}'
out = '/home/claude/shots/city'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error',) or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto(URL)
    pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text=sector).click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_timeout(800)
    # lluvia muy fuerte
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } } }); c.start(); }")
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.displayed().advanceTo(14*60); }")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/{tag}-a-realista.png')
    pg.get_by_role('button', name='Materiales').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/{tag}-b-materiales.png')
    pg.get_by_role('button', name='Resultados').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/{tag}-c-resultados.png')
    pg.get_by_role('button', name='Realista').click()
    pg.get_by_role('button', name='Ver bajo la calle: redes de aguas lluvias y de aguas residuales').click(); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/{tag}-d-corte.png')
    pg.get_by_role('button', name='Ver bajo la calle: redes de aguas lluvias y de aguas residuales').click()
    pg.get_by_role('button', name='Vista a nivel de calle').click(); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/{tag}-e-calle.png')
    print('\n'.join(logs[:20]) or 'consola limpia')
    b.close()
