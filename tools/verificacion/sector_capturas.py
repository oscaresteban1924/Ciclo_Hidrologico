# Capturas del entorno de los sectores (vista general, vista al valle y nivel de calle) en ambos sectores.
# uso: city15.py etiqueta [calidad: alta|ligera] [sectores: calle,ladera]
import sys, json
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else 'x'
Q = sys.argv[2] if len(sys.argv) > 2 else 'alta'
WHICH = (sys.argv[3] if len(sys.argv) > 3 else 'calle,ladera').split(',')
OUT = '/home/claude/shots/city/sector'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
NAMES = {'calle': 'Calle de prueba', 'ladera': 'Ladera con quebrada'}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    for key in WHICH:
        ctx = b.new_context(viewport={'width': 1440, 'height': 900})
        pg = ctx.new_page()
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
        pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Alta' if Q == 'alta' else 'Ligera').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click(); pg.wait_for_timeout(1500)
        pg.wait_for_selector('.city-pick', timeout=30000)
        pg.locator('.city-pick button', has_text=NAMES[key]).click(force=True)
        pg.wait_for_selector('.city-simbar', timeout=60000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
        pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{TAG}-{key}-general.png')
        print(key, json.dumps(pg.evaluate("() => window.__cityDebug.controller.renderInfo()")))
        for name in ['valle', 'calle']:
            pg.evaluate(f"() => window.__cityDebug.controller.camera('{name}')"); pg.wait_for_timeout(2600)
            pg.screenshot(path=f'{OUT}/{TAG}-{key}-{name}.png')
        ctx.close()
    b.close()
print('\n'.join(logs[:12]) or 'consola limpia')
