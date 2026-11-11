# Sectores reales (datos oficiales): vista general con la ortofoto y sin ella, vista desde arriba y creciente desde
# la cuenca en la sección de control. Con --rapido solo las vistas. Capturas en /home/claude/shots/city/reales.
from playwright.sync_api import sync_playwright
import os, sys
OUT = '/home/claude/shots/city/reales'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SECTORES = [('Andalucía · Juan Bobo', 'jb'), ('La Iguaná · El Pesebre', 'li'), ('Ana Díaz · El Corazón', 'ad')]
rapido = '--rapido' in sys.argv
solo = [a for a in sys.argv[1:] if not a.startswith('--')] or [t for _, t in SECTORES]
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.set_default_timeout(180000)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(2500)
    print([t.strip() for t in pg.locator('.city-pick button').all_inner_texts()])
    for name, tag in SECTORES:
        if tag not in solo:
            continue
        pg.locator('.city-pick button', has_text=name.split(' · ')[0]).first.evaluate('e => e.click()')
        pg.wait_for_selector('.city-simbar', timeout=60000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000 && c.sc; }", timeout=60000)
        pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
        pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-1-general-foto.png')
        # sin la foto aérea (mismo encuadre)
        pg.evaluate("() => window.__cityDebug.controller.setOrtho(false)"); pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{tag}-2-general-sin-foto.png')
        pg.evaluate("() => window.__cityDebug.controller.setOrtho(true)"); pg.wait_for_timeout(800)
        pg.evaluate("() => window.__cityDebug.controller.camera('arriba')"); pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{tag}-3-arriba-foto.png')
        info = pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); const cr = s.c.creek; return { id: c.sc.id, cap: cr ? +cr.capacity.toFixed(1) : null, flow: cr && cr.flow, bank: cr ? +(cr.bankLevel - cr.zBed).toFixed(2) : null, pockets: s.c.pockets, fill: s.c.fillCells, runon: s.c.runon.length, b: s.c.buildings.length }; }")
        print(tag, info)
        if rapido:
            pg.evaluate("() => window.__cityDebug.controller.showValley()")
            pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(1500)
            continue
        # creciente desde la lluvia en la cuenca (60 mm en una hora): sección de control a la hora del pico
        pg.get_by_role('radio', name='Creciente').first.evaluate('e => e.click()'); pg.wait_for_timeout(400)
        pg.get_by_role('radio', name='Lluvia en la cuenca').first.evaluate('e => e.click()'); pg.wait_for_timeout(600)
        pg.locator('.basin-box button.preset').first.evaluate('e => e.click()'); pg.wait_for_timeout(600)
        tpk = pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); const s = c.displayed(); return s.basin ? s.basin.tPeak : 1800; }")
        t_end = min(int(tpk) + 120, 240 * 60)
        for k in range(1, 13):
            pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({t_end * k / 12})"); pg.wait_for_timeout(150)
        print(tag, 'avance', pg.evaluate("() => { const s = window.__cityDebug.controller.displayed(); return { t: Math.round(s.t), basin: !!s.basin }; }"), 't_end', t_end)
        pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{tag}-4-cuenca-seccion.png')
        pg.evaluate("() => { const el = [...document.querySelectorAll('figcaption')].find((h) => h.textContent.includes('Sección transversal')); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
        pg.screenshot(path=f'{OUT}/{tag}-5-seccion-panel.png')
        pg.evaluate("() => { const el = document.querySelector('.basin-box'); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
        pg.screenshot(path=f'{OUT}/{tag}-6-cuenca-panel.png')
        st = pg.evaluate("() => { const s = window.__cityDebug.controller.displayed(); const cs = s.creekSection(); return { t: Math.round(s.t / 60), qin: +cs.qin.toFixed(1), qc: +cs.qChannel.toFixed(1), qo: +cs.qOutside.toFixed(1), nivel: +(cs.level - s.c.creek.zBed).toFixed(2), res: Math.abs(s.bal.residual) / (s.bal.precipitation + s.bal.inflow) }; }")
        print(tag, 'creciente', st)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.setPaused(false); c.update({ shared: { creek: null } }); }")
        pg.evaluate("() => window.__cityDebug.controller.showValley()")
        pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(1500)
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
