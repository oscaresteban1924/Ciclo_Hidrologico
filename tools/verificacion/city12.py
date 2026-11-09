# Capturas de trabajo: entorno (vista general y valle) y gotas trazadoras, con calidad alta forzada.
import sys, json
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/env'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
tag = sys.argv[1] if len(sys.argv) > 1 else 'a'
only = sys.argv[2] if len(sys.argv) > 2 else 'todo'
logs = []
INIT = "try { const k = 'ciclo-hidrologico:v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.quality = 'alta'; localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}"
def page(b, W=1440, H=900):
    ctx = b.new_context(viewport={'width': W, 'height': H})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text[:300]}') if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    return ctx, pg
def sector(pg, name):
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.wait_for_timeout(1200)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx, pg = page(b)
    sector(pg, 'Calle de prueba')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); c.displayed().advanceTo(420); }")
    pg.wait_for_timeout(2500)
    if only in ('todo', 'entorno'):
        pg.screenshot(path=f'{OUT}/{tag}-calle-general.png')
        pg.evaluate("() => window.__cityDebug.controller.view.goto('valle', false)"); pg.wait_for_timeout(2000)
        pg.screenshot(path=f'{OUT}/{tag}-calle-valle.png')
        pg.evaluate("() => window.__cityDebug.controller.view.goto('general', false)"); pg.wait_for_timeout(800)
    if only in ('todo', 'gotas'):
        # gotas: dos sueltas en la calle y una en un techo
        pg.evaluate("() => { const c = window.__cityDebug.controller; const v = c.view; const sc = v.sc; c.releaseTracers(12, 40); c.releaseTracers(30, 22); const b = sc.buildings[2]; const cx = b.polygon.reduce((s, q) => s + q[0], 0) / b.polygon.length, cy = b.polygon.reduce((s, q) => s + q[1], 0) / b.polygon.length; c.releaseTracers(cx, cy); }")
        for t in [4000, 9000]:
            pg.wait_for_timeout(t)
            pg.screenshot(path=f'{OUT}/{tag}-gotas-{t//1000}s.png')
        print('gotas:', pg.evaluate("() => JSON.stringify(window.__cityDebug.controller.tracers.counts())"), 't =', pg.evaluate("() => window.__cityDebug.controller.displayed().t"))
        pg.evaluate("() => { const v = window.__cityDebug.controller.view; v.focusOn(28, 30); setTimeout(() => v.zoom(0.6), 900); }"); pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{tag}-gotas-cerca.png')
    ctx.close()
    if only in ('todo', 'entorno'):
        ctx, pg = page(b)
        sector(pg, 'Ladera con quebrada')
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); c.displayed().advanceTo(600); }")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{tag}-ladera-general.png')
        pg.evaluate("() => window.__cityDebug.controller.view.goto('valle', false)"); pg.wait_for_timeout(2000)
        pg.screenshot(path=f'{OUT}/{tag}-ladera-valle.png')
        ctx.close()
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
