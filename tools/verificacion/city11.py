# Lluvia localizada, vistas de materiales y resultados, y movimiento reducido con los efectos nuevos.
from playwright.sync_api import sync_playwright
import json
OUT = '/home/claude/shots/city/fx'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
def page(b, W, H, reduced=False):
    ctx = b.new_context(viewport={'width': W, 'height': H}, reduced_motion='reduce' if reduced else 'no-preference')
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text[:300]}') if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    return ctx, pg
def sector(pg, name):
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx, pg = page(b, 1440, 900)
    sector(pg, 'Ladera con quebrada')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, spatial: 'localizada', center: [45, 50], radiusM: 30 } } }); c.start(); c.displayed().advanceTo(600); }")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/d-ladera-localizada.png')
    for v in ['Materiales', 'Resultados']:
        pg.get_by_role('button', name=v, exact=True).click(); pg.wait_for_timeout(1800)
        pg.screenshot(path=f'{OUT}/d-ladera-{v.lower()}.png')
    ctx.close()
    ctx, pg = page(b, 1280, 800, reduced=True)
    sector(pg, 'Calle de prueba')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } } }); c.start(); c.displayed().advanceTo(600); }")
    pg.wait_for_timeout(1500)
    t0 = pg.evaluate("() => window.__cityDebug.controller.view.fx.u.uTime.value")
    pg.wait_for_timeout(1500)
    t1 = pg.evaluate("() => window.__cityDebug.controller.view.fx.u.uTime.value")
    lv = pg.evaluate("() => window.__cityDebug.controller.view.fx.levels")
    print('movimiento reducido: reloj de efectos', t0, '→', t1, '| niveles', json.dumps(lv))
    pg.screenshot(path=f'{OUT}/d-reducido.png')
    ctx.close(); b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
