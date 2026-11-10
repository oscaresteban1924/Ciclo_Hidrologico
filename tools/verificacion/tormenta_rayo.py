# Rayo ilustrativo (escritorio 1440 × 900): con el aguacero real y la cámara «Valle», fuerza un rayo cercano con la
# simulación en pausa (en pausa el rayo no envejece) para fotografiarlo, y mira el techo de nubes desde la calle.
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/storm'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=b.new_page(viewport={'width':1440,'height':900})
    pg.set_default_timeout(120000)
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(1200)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').first.evaluate('e => e.click()')
    pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.get_by_role('radio', name='Aguacero real', exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Iniciar lluvia').click()
    for i in range(60):
        st=pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); return {mmh: s.rainAt(s.t), storm: c.view.fx.stormLevel} }")
        if st['mmh']>120 and st['storm']>0.8: break
        pg.wait_for_timeout(1000)
    pg.evaluate("() => window.__cityDebug.controller.camera('valle')"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/7-valle.png')
    # forzar un rayo cercano hacia el oriente con la simulación en pausa (en pausa el rayo no envejece)
    pg.evaluate("() => window.__cityDebug.controller.setPaused(true)"); pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = window.__cityDebug.controller.view.sky; const r = s.rnd; let n = 0; s.rnd = () => (n++ < 2 ? 0.02 : r()); s.timer = 0; s.update(0.016, 180, 1, false); }""")
    pg.wait_for_timeout(1500)
    print(pg.evaluate("() => { const s = window.__cityDebug.controller.view.sky; return {n: s.bolts.length, flash: s.flash, strikes: s.strikes} }"))
    pg.screenshot(path=f'{OUT}/8-bolt.png')
    pg.evaluate("() => window.__cityDebug.controller.setPaused(false)")
    # vista de calle mirando arriba: el techo de nubes
    pg.evaluate("() => window.__cityDebug.controller.camera('calle')"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/9-calle.png')
    print('errors', errs[:5])
    b.close()
