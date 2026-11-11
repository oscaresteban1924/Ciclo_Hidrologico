# Capturas de trabajo de la vista del Valle de Aburrá (calidad alta forzada y automática).
import sys
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/valle'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
tag = sys.argv[1] if len(sys.argv) > 1 else 'a'
quality = sys.argv[2] if len(sys.argv) > 2 else 'alta'
logs = []
INIT = "try { const k = 'ciclo-hidrologico:v1'; const d = JSON.parse(localStorage.getItem(k) || '{}'); d.quality = '%s'; localStorage.setItem(k, JSON.stringify(d)); } catch (e) {}" % quality
VIEWS = {
  'inicio': None,
  'oriente': "v.camera.position.copy(v.w(9.5, 0.5, 3600)); v.controls.target.copy(v.w(-1.5, 1.0, 1600));",
  'occidente': "v.camera.position.copy(v.w(-11.0, -1.5, 3800)); v.controls.target.copy(v.w(1.5, 1.5, 1700));",
  'centro': "v.camera.position.copy(v.w(3.2, -4.5, 2500)); v.controls.target.copy(v.w(-0.6, 1.0, 1500));",
}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}); ctx.add_init_script(INIT); pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text[:300]}') if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=60000)
    pg.wait_for_timeout(4000)
    for name, js in VIEWS.items():
        if js:
            pg.evaluate("() => { const v = window.__cityDebug.controller.valley; v.tween = null; " + js + " v.controls.update(); }")
            pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{tag}-{name}.png')
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
