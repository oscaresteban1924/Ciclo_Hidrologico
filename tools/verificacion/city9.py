# Comprueba que las pestañas del panel del módulo caben sin desplazamiento en varios anchos.
from playwright.sync_api import sync_playwright
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for W, H in [(1440, 900), (1280, 800), (1280, 720), (1024, 1366), (390, 844)]:
        ctx = b.new_context(viewport={'width': W, 'height': H})
        pg = ctx.new_page(); pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_selector('.city-tabs', timeout=30000)
        r = pg.evaluate("""() => { const t = document.querySelector('.city-tabs'); const bs=[...t.querySelectorAll('button')];
          return { scroll: t.scrollWidth, client: t.clientWidth, fs: getComputedStyle(bs[0]).fontSize,
            clipped: bs.filter(b => { const r=b.getBoundingClientRect(), q=t.getBoundingClientRect(); return r.right > q.right + 0.5 || r.left < q.left - 0.5; }).map(b=>b.textContent) }; }""")
        if W == 1280 and H == 800: pg.screenshot(path='/home/claude/shots/city/tabs-1280.png', clip={'x': 880, 'y': 60, 'width': 400, 'height': 160})
        print(W, H, r); ctx.close()
    b.close()
