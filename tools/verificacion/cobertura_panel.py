# Panel de la cobertura (herramienta «Creciente») y misión «La cobertura tapada».
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/cob'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera').click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.get_by_role('radio', name='Creciente').click(force=True); pg.wait_for_timeout(400)
    pg.locator('button.preset', has_text='Cauce lleno').click(force=True); pg.wait_for_timeout(400)
    pg.get_by_role('radio', name='Se tapa con la creciente').click(force=True); pg.wait_for_timeout(400)
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); }")
    for k in range(12):
        pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({(k + 1) * 60})"); pg.wait_for_timeout(200)
    pg.get_by_role('button', name='Ver la cobertura en la maqueta').click(); pg.wait_for_timeout(3500)
    pg.evaluate("() => { const el = document.querySelector('.culvert-box'); el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(800)
    pass
    pg.evaluate("() => { const el = document.querySelector('.culvert-box figure, .culvert-box .city-chart'); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(800)
    pass
    print(pg.evaluate("() => document.querySelector('.culvert-box').innerText.slice(0, 900)"))
    # misión
    pg.evaluate("() => window.__cityDebug.controller.setPaused(false)")
    pg.get_by_role('tab', name='Misiones').click(); pg.wait_for_timeout(400)
    pg.screenshot(path=f'{OUT}/p3-misiones.png')
    pg.locator('.mission-card', has_text='La cobertura tapada').click(); pg.wait_for_timeout(400)
    pg.get_by_role('button', name='Hacer mi predicción').click(); pg.wait_for_timeout(300)
    pg.locator('.cover-opt').nth(1).click(); pg.get_by_role('button', name='Guardar mi predicción').click(); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Hacer el cambio y comparar').click(); pg.wait_for_timeout(3000)
    pg.evaluate("() => { const p = window.__cityDebug.controller.pair; while (!p.finished) p.advanceTo(p.t + 60); }", )
    pg.wait_for_selector('.city-mission-result', timeout=300000); pg.wait_for_timeout(1500)
    pg.evaluate("() => window.__cityDebug.controller.focusCulvert(0)"); pg.wait_for_timeout(3000)
    pg.screenshot(path=f'{OUT}/p4-mision.png')
    pg.evaluate("() => document.querySelector('.city-mission-result').scrollIntoView({ block: 'start' })"); pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/p5-mision-resultado.png')
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
