# Rendimiento medido en el navegador de pruebas (Chrome sin GPU: WebGL por software SwiftShader).
import json
from playwright.sync_api import sync_playwright
res = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for (W, H) in [(1280, 720), (390, 844)]:
        for sector in ['Calle de prueba', 'Ladera con quebrada']:
            pg = b.new_page(viewport={'width': W, 'height': H})
            pg.goto('http://127.0.0.1:5173/')
            pg.wait_for_timeout(800)
            pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
            pg.wait_for_selector('.city-pick', timeout=30000)
            pg.locator('.city-pick button', has_text=sector).click()
            pg.wait_for_selector('.city-simbar', timeout=30000)
            pg.wait_for_function("() => { const c = window.__cityDebug && window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
            pg.wait_for_timeout(800)
            pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } } }); c.start(); }")
            pg.wait_for_timeout(7000)
            r = pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); return { fps: c.fps, simMsPerFrame: c.simMsPerFrame, achieved: c.achievedSpeed, requested: c.speed, t: s.t, cells: s.c.nx * s.c.ny, dx: s.c.dx, render: c.renderInfo(), caps: { webgl2: true } }; }")
            caps = pg.evaluate("() => (window.__cityDebug.controller ? null : null)")
            res[f'{sector} {W}x{H}'] = r
            print(sector, W, H, json.dumps(r))
            pg.close()
    b.close()
json.dump(res, open('/home/claude/ciclo-hidrologico/docs/medellin/perf-navegador.json', 'w'), indent=2, ensure_ascii=False)
