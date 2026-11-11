# Verificación: ocultar etiquetas y contraer el panel (escritorio y celular).
import sys
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/panel'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
def page(b, W, H):
    ctx = b.new_context(viewport={'width': W, 'height': H}, has_touch=W < 800)
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{W}: {m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'{W}: pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido')
    pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    return ctx, pg
def vis(pg):
    return pg.evaluate("() => [...document.querySelectorAll('.city-label')].filter(e => e.style.visibility==='visible' && e.offsetParent).length")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for W, H in [(1440, 900), (390, 844)]:
        ctx, pg = page(b, W, H)
        pg.locator('.city-pick button', has_text='Ladera').click()
        pg.wait_for_selector('.city-simbar', timeout=30000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{W}-1-normal.png')
        n0 = vis(pg)
        if W < 900:
            pg.locator('.city-viewbar > summary').click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Etiquetas de la maqueta: lugares, medidores, daños y redes').click()
        pg.wait_for_timeout(800)
        n1 = vis(pg)
        if W < 900:
            pg.locator('.city-viewbar > summary').click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Contraer el panel y ampliar la maqueta').click()
        pg.wait_for_timeout(1500)
        focus = pg.evaluate("() => document.activeElement && document.activeElement.getAttribute('aria-label')")
        canvas = pg.evaluate("() => { const r = document.querySelector('.city-canvas-host').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }")
        aside = pg.evaluate("() => document.getElementById('panel').hidden")
        pg.screenshot(path=f'{OUT}/{W}-2-contraido-sin-etiquetas.png')
        # recarga: se conserva
        pg.reload(); pg.wait_for_timeout(900)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_selector('.city-peek', timeout=30000)
        pg.screenshot(path=f'{OUT}/{W}-3a-valle-contraido.png')
        pg.locator('.city-pick button', has_text='Ladera').click()
        pg.wait_for_selector('.city-simbar', timeout=30000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
        pg.wait_for_timeout(2000)
        kept = pg.evaluate("() => [document.getElementById('panel').hidden, window.__cityDebug.controller.labelsOn()]")
        n2 = vis(pg)
        pg.screenshot(path=f'{OUT}/{W}-3-tras-recargar.png')
        pg.get_by_role('button', name='Mostrar el panel del laboratorio').click()
        pg.wait_for_timeout(1200)
        focus2 = pg.evaluate("() => document.activeElement && document.activeElement.getAttribute('aria-label')")
        if W < 900:
            pg.locator('.city-viewbar > summary').click(); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Etiquetas de la maqueta: lugares, medidores, daños y redes').click()
        pg.wait_for_timeout(1000)
        n3 = vis(pg)
        canvas2 = pg.evaluate("() => { const r = document.querySelector('.city-canvas-host').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }")
        pg.screenshot(path=f'{OUT}/{W}-4-restaurado.png')
        print(W, 'etiquetas', n0, '->', n1, 'recarga', n2, '-> restauradas', n3, '| maqueta contraído', canvas, 'restaurado', canvas2, '| aside oculto', aside, '| foco', focus, '/', focus2, '| conservado', kept)
        ctx.close()
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
