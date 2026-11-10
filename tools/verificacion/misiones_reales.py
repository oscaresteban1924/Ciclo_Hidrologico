# Misiones de los sectores reales: abren el sector correcto, corren y muestran el resultado calculado.
from playwright.sync_api import sync_playwright
import os
OUT = '/home/claude/shots/city/reales'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.set_default_timeout(600000)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(800)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(1500)
    pg.locator('.city-pick button', has_text='Andalucía').first.evaluate('e => e.click()')
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.get_by_role('tab', name='Misiones').click() if pg.get_by_role('tab', name='Misiones').count() else pg.locator('.city-tabs button', has_text='Misiones').click()
    pg.locator('.mission-card', has_text='¿De dónde viene el agua?').click(); pg.wait_for_timeout(500)
    print('escenario:', pg.evaluate("() => window.__cityDebug.controller.sc.id"))
    pg.get_by_role('button', name='Hacer mi predicción').click(); pg.wait_for_timeout(300)
    pg.locator('.city-panel label, .city-panel [role=radio]', has_text='La lluvia que corre').first.click(); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/mision-jb-1-prediccion.png')
    pg.get_by_role('button', name='Guardar mi predicción').click(); pg.wait_for_timeout(400)
    btns = [t.strip() for t in pg.locator('.city-panel button').all_inner_texts()]
    print('botones:', [x for x in btns if x][:12])
    pg.get_by_role('button', name='Que llueva').click(); pg.wait_for_timeout(500)
    # correr hasta el final sin esperar el tiempo real
    pg.evaluate("() => { const c = window.__cityDebug.controller; for (const s of c.sims()) s.runToEnd(); }")
    pg.wait_for_function("() => document.querySelector('.city-panel') && /coincide|calculado|Lo que pasó/i.test(document.querySelector('.city-panel').innerText)", timeout=120000)
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/mision-jb-2-resultado.png')
    print('resultado:', pg.locator('.city-panel').inner_text()[:700].replace('\n', ' | '))
    b.close()
print('\n'.join(logs[:10]) or 'consola limpia')
