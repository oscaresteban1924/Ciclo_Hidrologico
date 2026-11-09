# Salida del módulo: recursos liberados; módulo anterior sigue funcionando; teclado y movimiento reducido.
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.add_init_script("""(() => { const orig = HTMLCanvasElement.prototype.getContext; window.__gl = 0; HTMLCanvasElement.prototype.getContext = function(t, o) { const c = orig.call(this, t, o); if (c && (t === 'webgl2' || t === 'webgl')) { if (!this.__counted) { this.__counted = true; window.__gl++; } } return c; }; })();""")
    pg.goto('http://127.0.0.1:5173/')
    pg.wait_for_timeout(1000)
    for rep in range(3):
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_selector('.city-pick', timeout=30000)
        pg.locator('.city-pick button', has_text='Calle de prueba').click()
        pg.wait_for_selector('.city-simbar', timeout=30000)
        pg.locator('.city-simbar .btn').first.click()
        pg.wait_for_timeout(1500)
        live = pg.evaluate('window.__cityDebug.live')
        pg.get_by_role('button', name='Recorrido guiado').click()
        pg.wait_for_timeout(800)
        st = pg.evaluate("() => ({ live: window.__cityDebug.live, last: window.__cityDebug.lastDisposed, canvases: document.querySelectorAll('canvas.city-canvas').length, labels: document.querySelectorAll('.city-labels').length, glCreated: window.__gl })")
        print(f'ciclo {rep+1}: activos durante = {live}; al salir = {st}')
    # módulo anterior: avanzar pasos del recorrido
    pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(400); pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(600)
    title = pg.locator('.panel h2').first.inner_text()
    print('recorrido guiado funciona; paso actual:', title)
    pg.get_by_role('button', name='Laboratorio del agua').click(); pg.wait_for_timeout(600)
    print('laboratorio del agua visible:', pg.locator('.panel').first.is_visible())
    # Salida por una herramienta (glosario) también libera
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.get_by_role('button', name='Glosario').click(); pg.wait_for_timeout(800)
    print('salida por glosario: activos =', pg.evaluate('window.__cityDebug.live'), '; término rugosidad en glosario:', pg.locator('text=Rugosidad').count() > 0)
    # Teclado: entrar al módulo y recorrer con Tab
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').focus()
    pg.keyboard.press('Enter')
    pg.wait_for_selector('.city-simbar', timeout=30000)
    seen = []
    for i in range(40):
        pg.keyboard.press('Tab')
        d = pg.evaluate("() => { const e = document.activeElement; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { t: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 28), outline: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none', vis: r.width > 0 && r.height > 0 }; }")
        seen.append(d)
    noring = [s['t'] for s in seen if not s['outline']]
    print('Tab: elementos recorridos =', len(seen), '; sin foco visible =', noring[:8])
    # tecla P pausa la simulación del módulo
    pg.evaluate("() => window.__cityDebug.controller.start()")
    pg.locator('body').click(position={'x': 5, 'y': 700}) if False else None
    pg.keyboard.press('Escape')
    pg.evaluate("() => document.activeElement && document.activeElement.blur()")
    pg.keyboard.press('p'); pg.wait_for_timeout(500)
    print('P pausa el cálculo:', pg.evaluate('window.__cityDebug.controller.paused'))
    t1 = pg.evaluate('window.__cityDebug.controller.displayed().t'); pg.wait_for_timeout(1200); t2 = pg.evaluate('window.__cityDebug.controller.displayed().t')
    print('tiempo simulado no avanza en pausa:', t1 == t2, t1, t2)
    print('\n'.join(logs[:10]) or 'consola limpia')
    b.close()
