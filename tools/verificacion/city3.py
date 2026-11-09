# Flujo de misión (sumidero obstruido) y comparación A/B; herramientas; captura y verificación.
import sys, json
from playwright.sync_api import sync_playwright
W = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
H = int(sys.argv[2]) if len(sys.argv) > 2 else 900
out = '/home/claude/shots/city'
tag = f'{W}x{H}'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_timeout(1000)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    # Misión 2
    pg.get_by_role('tab', name='Misiones').click()
    pg.get_by_role('button', name='Sumidero obstruido').click()
    pg.get_by_role('button', name='Ir al sector «Calle de prueba»').click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.get_by_role('button', name='Hacer mi predicción').click()
    pg.get_by_label('Más profundo').check()
    pg.get_by_role('button', name='Guardar mi predicción').click()
    pg.get_by_role('button', name='Hacer el cambio y comparar').click()
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/{tag}-m1-corriendo.png')
    pg.get_by_role('button', name='Ver el resultado ya').click()
    pg.wait_for_selector('.city-mission-result', timeout=60000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/{tag}-m2-resultado.png')
    res = pg.locator('.city-mission-result').inner_text()
    print('RESULTADO MISIÓN:\n', res[:1200])
    pg.get_by_role('button', name='Guardar en mi bitácora').click()
    # Comparar tab
    pg.get_by_role('tab', name='Comparar').click()
    pg.wait_for_timeout(800)
    pg.screenshot(path=f'{out}/{tag}-m3-comparar.png', full_page=False)
    pg.locator('.city-panel .panel-scroll').evaluate('e => e.scrollTo(0, 99999)')
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{out}/{tag}-m4-graficas.png')
    # Ver A
    pg.locator('.ab-switch button', has_text='A').click()
    pg.wait_for_timeout(1200)
    pg.screenshot(path=f'{out}/{tag}-m5-verA.png')
    # selección en la maqueta (centro)
    box = pg.locator('.city-canvas-host').bounding_box()
    pg.mouse.click(box['x'] + box['width'] * 0.55, box['y'] + box['height'] * 0.55)
    pg.wait_for_timeout(800)
    card = pg.locator('.city-card')
    print('TARJETA:', card.inner_text()[:300] if card.count() else 'sin tarjeta')
    pg.screenshot(path=f'{out}/{tag}-m6-seleccion.png')
    # Docente
    pg.get_by_role('tab', name='Docente').click()
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{out}/{tag}-m7-docente.png')
    pg.get_by_role('button', name='Pruebas del modelo').first.click() if pg.get_by_role('button', name='Pruebas del modelo').count() else None
    print('\n'.join(logs[:20]) or 'consola limpia')
    b.close()
