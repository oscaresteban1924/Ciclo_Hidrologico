# Vistas alrededor de un sector (suroccidente, noroccidente, nororiente...) para revisar que esté asentado en el terreno.
# Uso: python3 city13_orbita.py "Ladera con quebrada" etiqueta 225,315,45
import math, sys
from playwright.sync_api import sync_playwright
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
INIT = "try { const k = 'ciclo-hidrologico:v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.quality = 'alta'; localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}"
name = sys.argv[1]; tag = sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(INIT); pg = ctx.new_page()
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); c.displayed().advanceTo(600); }")
    for k, ang in enumerate([int(a) for a in (sys.argv[3] if len(sys.argv) > 3 else "225,315,45").split(",")]):
        a = math.radians(ang)
        pg.evaluate(f"() => {{ const v = window.__cityDebug.controller.view; const s = Math.max(v.W, v.H); v.tween = null; v.camera.position.set(Math.cos({a})*s*0.75, v.fitA + s*0.3, Math.sin({a})*s*0.75); v.controls.target.set(0, v.fitA - 3, 0); v.controls.update(); }}")
        pg.wait_for_timeout(2200)
        pg.screenshot(path=f'/home/claude/shots/city/env/{tag}-orbit{ang}.png', clip={'x': 0, 'y': 65, 'width': 994, 'height': 835})
    b.close()
