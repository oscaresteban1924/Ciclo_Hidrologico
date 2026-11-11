# Tormenta viva (escritorio 1440 × 900): aguacero real en la ladera; espera la lluvia fuerte, recorre las cinco
# tomas del modo cine, graba unos segundos y descarga el video (con su rótulo), y revisa que arrastrar la maqueta
# detenga el cine. Capturas y video en /home/claude/shots/storm. Imprime un resumen y los errores de consola.
import sys, json
from playwright.sync_api import sync_playwright
OUT='/home/claude/shots/storm'
ARGS=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    ctx=b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True)
    pg=ctx.new_page()
    pg.set_default_timeout(120000)
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(1200)
    pg.locator('.city-pick button', has_text='Ladera con quebrada').first.evaluate('e => e.click()')
    pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(2500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.get_by_role('radio', name='Aguacero real', exact=True).click(); pg.wait_for_timeout(600)
    pg.get_by_role('button', name='Iniciar lluvia').click()
    # wait until heavy rain
    for i in range(60):
        st=pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); return {t: s.t, mmh: s.rainAt(s.t), storm: c.view.fx.stormLevel, strikes: c.view.sky?.strikes ?? -1, flash: c.view.sky?.flash} }")
        if st['mmh']>120 and st['storm']>0.8: break
        pg.wait_for_timeout(1000)
    print('heavy', st)
    pg.screenshot(path=f'{OUT}/1-heavy.png')
    # wait for a strike and capture the flash
    got=False
    for i in range(120):
        st=pg.evaluate("() => { const c = window.__cityDebug.controller; return {strikes: c.view.sky.strikes, flash: c.view.sky.flash} }")
        if st['flash']>0.2:
            pg.screenshot(path=f'{OUT}/2-flash.png'); got=True; break
        pg.wait_for_timeout(150)
    print('flash', got, st)
    pg.evaluate("() => window.__cityDebug.controller.camera('calle')"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/3-calle.png')
    # cinema
    pg.get_by_role('button', name='Modo cine: la cámara recorre la tormenta sola (se detiene al tocar la maqueta)').click()
    for k in range(5):
        pg.wait_for_timeout(5500 if k==0 else 0)
        shot=pg.evaluate("() => window.__cityDebug.controller.cinemaShot")
        pg.screenshot(path=f'{OUT}/4-cine-{k}.png')
        print('shot', k, shot)
        # jump to next shot quickly by advancing the start time
        pg.evaluate("() => { const v = window.__cityDebug.controller.view; v.cine.start -= v.cine.shots[v.cine.i].dur*1000*0.5; }")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/4-cine-{k}b.png')
        pg.evaluate("() => { const v = window.__cityDebug.controller.view; v.cine.start -= v.cine.shots[v.cine.i].dur*1000; }")
        pg.wait_for_timeout(800)
    # record
    sup=pg.evaluate("() => window.__cityDebug.controller.canRecord()")
    print('canRecord', sup)
    if sup:
        pg.get_by_role('button', name='Grabar un video de la maqueta (hasta 60 s, queda en tu equipo)').click()
        pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/5-rec.png')
        with pg.expect_download(timeout=30000) as dl:
            pg.get_by_role('button', name='Detener la grabación y guardar el video').click()
        d=dl.value
        d.save_as(f'{OUT}/clip.webm')
        print('download', d.suggested_filename)
        pg.wait_for_timeout(800)
        pg.screenshot(path=f'{OUT}/6-saved.png')
        print('frames', pg.evaluate("() => window.__cityDebug.controller.lastClip"))
    # user interaction stops cinema
    pg.mouse.move(600,450); pg.mouse.down(); pg.mouse.move(650,460); pg.mouse.up(); pg.wait_for_timeout(500)
    print('cine after drag', pg.evaluate("() => window.__cityDebug.controller.cinemaOn()"))
    print('errors', errs[:10])
    b.close()
