# Versión de un solo archivo, sin servidor: el módulo Medellín abre, calcula y no pide nada a internet.
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    reqs, logs = [], []
    pg.on('request', lambda r: reqs.append(r.url) if not r.url.startswith(('file:', 'data:', 'blob:')) else None)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('file:///home/claude/ciclo-hidrologico/dist-single/index.html')
    pg.wait_for_timeout(1200)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_function("() => document.querySelector('canvas.city-canvas')", timeout=30000)
    pg.locator('.city-simbar .btn').first.click()
    pg.wait_for_timeout(4000)
    t = pg.locator('.sim-clock').inner_text().replace('\n', ' | ')
    pg.screenshot(path='/home/claude/shots/city/single-file.png')
    print('reloj:', t)
    print('peticiones externas:', reqs)
    print('\n'.join(logs[:10]) or 'consola limpia')
    b.close()
