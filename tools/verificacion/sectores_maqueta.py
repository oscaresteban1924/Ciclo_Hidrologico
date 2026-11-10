# Sectores reales como maqueta: vista general con lluvia de 60 mm/h (16 min), sección de control, calle y valle
# para los tres sectores, con el panel recogido. Capturas en /home/claude/shots/diag. Uso: sectores_maqueta.py [jb li ad]
from playwright.sync_api import sync_playwright
import sys
OUT="/home/claude/shots/diag"
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
SEC=[('Andalucía','jb'),('La Iguaná','li'),('Ana Díaz','ad')]
solo=sys.argv[1:] or [t for _,t in SEC]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=b.new_page(viewport={'width':1408,'height':745})
    pg.set_default_timeout(180000)
    logs=[]
    pg.on('console', lambda m: logs.append(m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(1500)
    for name,tag in SEC:
        if tag not in solo: continue
        pg.locator('.city-pick button', has_text=name).first.evaluate('e => e.click()')
        pg.wait_for_selector('.city-simbar', timeout=60000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000 && c.sc; }", timeout=60000)
        pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
        pg.evaluate("() => { const b = [...document.querySelectorAll('button')].find(x => /Contraer el panel/.test(x.getAttribute('aria-label')||'')); if (b) b.click(); }")
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); }")
        for k in range(1,9):
            pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({16*60*k/8})"); pg.wait_for_timeout(80)
        pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{tag}-a-general.png')
        pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-b-seccion.png')
        pg.evaluate("() => window.__cityDebug.controller.camera('calle')"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-c-calle.png')
        pg.evaluate("() => window.__cityDebug.controller.camera('valle')"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-d-valle.png')
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.setPaused(false); }")
        pg.evaluate("() => window.__cityDebug.controller.showValley()")
        pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(1500)
        pg.evaluate("() => { const b = [...document.querySelectorAll('button')].find(x => /Mostrar el panel/.test(x.getAttribute('aria-label')||'')); if (b) b.click(); }")
    b.close()
    print('\n'.join(logs[:10]) or 'consola limpia')
