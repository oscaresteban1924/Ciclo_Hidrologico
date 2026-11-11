from playwright.sync_api import sync_playwright
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
for W, H in [(1280, 720), (390, 844)]:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': W, 'height': H}); pg = ctx.new_page()
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(5000)
    r = pg.evaluate("() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })")
    info = pg.evaluate("() => { const r = window.__cityDebug.controller.valley.renderer.info; return [r.render.calls, r.render.triangles]; }")
    print(W, H, 'fps', round(r, 2), 'calls/tris', info)
    b.close()
