# Capturas finales para la entrega (varios tamaños y vistas) y verificación de movimiento reducido.
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/final'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
def page(b, W, H, reduced=False):
    ctx = b.new_context(viewport={'width': W, 'height': H}, reduced_motion='reduce' if reduced else 'no-preference', has_touch=W < 800)
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{W}: {m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'{W}: pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido')
    pg.wait_for_timeout(900)
    if W >= 900:
        # calidad alta (la de un equipo con GPU); en el entorno de pruebas la automática elegiría la ligera
        pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Alta').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    return ctx, pg
def sector(pg, name):
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
def rain(pg, mmh, t):
    pg.evaluate(f"() => {{ const c = window.__cityDebug.controller; c.update({{ shared: {{ rain: {{ ...c.shared.rain, intensityMmH: {mmh} }} }} }}); c.start(); c.displayed().advanceTo({t}); }}")
    pg.wait_for_timeout(1800)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx, pg = page(b, 1280, 800)
    pg.get_by_role('tab', name='Misiones').click()
    pg.get_by_role('button', name='Jardín lleno').click()
    pg.get_by_role('button', name='Ir al sector «Calle de prueba»').click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.get_by_role('button', name='Hacer mi predicción').click()
    pg.get_by_label('Guarda una parte y luego rebosa').check()
    pg.get_by_role('button', name='Guardar mi predicción').click()
    pg.get_by_role('button', name='Hacer el cambio y comparar').click()
    pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='Ver el resultado ya').click()
    pg.wait_for_selector('.city-mission-result', timeout=90000)
    pg.evaluate("() => window.__cityDebug.controller.setView('resultados')")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/08-mision-jardin-1280.png')
    ctx.close()
    ctx, pg = page(b, 1024, 1366)
    sector(pg, 'Ladera con quebrada'); rain(pg, 60, 600)
    pg.screenshot(path=f'{OUT}/09-tableta-1024x1366.png')
    ctx.close()
    ctx, pg = page(b, 390, 844)
    pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}/10-telefono-valle-390.png')
    sector(pg, 'Calle de prueba'); rain(pg, 100, 600)
    pg.screenshot(path=f'{OUT}/11-telefono-calle-390.png')
    pg.evaluate("() => window.scrollTo(0, 900)"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/12-telefono-panel-390.png')
    ctx.close()
    # movimiento reducido: sin vuelo de cámara y lluvia sin animación
    ctx, pg = page(b, 1280, 800, reduced=True)
    rm = pg.evaluate("() => window.__cityDebug.controller.opts.reducedMotion")
    sector(pg, 'Calle de prueba')
    print('movimiento reducido activo en el módulo:', rm)
    ctx.close()
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia en todas las capturas')
