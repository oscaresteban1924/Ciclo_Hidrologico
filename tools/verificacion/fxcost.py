# Costo de cada efecto en el navegador de pruebas (dibujo por software): cuadros/s con y sin cada uno.
from playwright.sync_api import sync_playwright
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}); pg = ctx.new_page()
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    pg.locator('.city-pick button', has_text='Calle de prueba').click()
    pg.wait_for_selector('.city-simbar', timeout=30000); pg.wait_for_timeout(1500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, durationMin: 600 } } }); c.start(); c.displayed().advanceTo(600); c.setSpeed && c.setSpeed(1); }")
    def fps(label, js):
        pg.evaluate("() => { const fx = window.__cityDebug.controller.view.fx; " + js + " }")
        pg.wait_for_timeout(1200)
        n = pg.evaluate("() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })")
        print(f'{label:34s} {n:5.2f} cuadros/s')
    fps('todo', '')
    fps('sin cortina', "fx.curtain.material.visible = false;")
    fps('sin salpicaduras', "fx.splash.mat.visible = false;")
    fps('sin gotas', "fx.rainFar.mat.visible = false; fx.rainNear.mat.visible = false;")
    fps('sin cielo (fondo plano)', "fx.sky.material.visible = false;")
    fps('+ agua sin vetas/anillos (modo 1)', "fx.u.uRainAmt.value = 0; Object.defineProperty(fx.u.uMode, 'value', { get: () => 1, set: () => {} });")
    b.close()
