# Puente peatonal (escritorio 1440 × 900): avenida torrencial en la ladera; imprime cada 5 s el estado del puente y
# el texto del panel hasta el colapso, y fotografía el puente caído. Capturas en /home/claude/shots/storm.
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/storm'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=b.new_page(viewport={'width':1440,'height':900})
    pg.set_default_timeout(120000)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type in ('error','warning') else None)
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(1200)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').first.evaluate('e => e.click()')
    pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.locator('.tool-card', has_text='Creciente').first.click(); pg.wait_for_timeout(800)
    pg.locator('.preset', has_text='Avenida torrencial').first.click(); pg.wait_for_timeout(500)
    pg.get_by_role('button', name='Iniciar lluvia').click()
    for i in range(40):
        pg.wait_for_timeout(5000)
        st=pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); return { t: Math.round(s.t), status: c.status, st: s.bridge.status, u: +s.bridge.utilization.toFixed(2), um: +s.bridge.utilMax.toFixed(2), panel: (document.querySelector('.bridge-box .stat-row') || {}).innerText } }")
        print(st)
        if st['st']=='colapsado': break
    pg.evaluate("() => window.__cityDebug.controller.setPaused(true)")
    pg.evaluate("() => window.__cityDebug.controller.view.lookFrom([58, -4, 44], [72, 16, 37])"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/puente-2.png')
    print('errors', errs[:8])
    b.close()
