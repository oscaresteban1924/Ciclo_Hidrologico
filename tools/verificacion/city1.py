# Recorrido básico del módulo Medellín: valle → sector → lluvia; capturas y consola.
import sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5173/#recorrido'
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
H = int(sys.argv[3]) if len(sys.argv) > 3 else 900
tag = f'{W}x{H}'
out = '/home/claude/shots/city'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': W, 'height': H})
    logs = []
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto(URL)
    pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-crumb', timeout=30000)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{out}/{tag}-1-valle.png')
    pg.locator('.city-pick button', has_text='Calle de prueba').click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{out}/{tag}-2-sector.png')
    pg.locator('.city-simbar .btn').first.click()
    pg.wait_for_timeout(9000)
    pg.screenshot(path=f'{out}/{tag}-3-lluvia.png')
    info = pg.evaluate("() => { const c = window.__cityDebug?.controller; if (!c) return null; const s = c.displayed(); return { t: s.t, steps: s.diag.steps, fps: c.fps, ach: c.achievedSpeed, ms: c.simMsPerFrame, P: s.bal.precipitation, res: s.bal.residual, render: c.renderInfo() }; }")
    print('info', info)
    print('\n'.join(logs[:30]) or 'consola limpia')
    b.close()
