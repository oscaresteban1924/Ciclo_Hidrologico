# Sectores reales (datos oficiales): vista general, creciente en Juan Bobo y quebrada cubierta.
from playwright.sync_api import sync_playwright
import os
OUT = '/home/claude/shots/city/reales'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.set_default_timeout(120000)
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/0-valle.png')
    print([t.strip() for t in pg.locator('.city-pick button').all_inner_texts()])
    for name, tag in [('Andalucía', 'jb'), ('Blanquizal', 'bq'), ('El Corazón', 'ec')]:
        pg.locator('.city-pick button', has_text=name).first.evaluate('e => e.click()') if pg.locator('.city-pick').count() else None
        pg.wait_for_selector('.city-simbar', timeout=60000)
        pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000 && c.sc; }", timeout=60000)
        pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
        pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{tag}-1-general.png')
        info = pg.evaluate("() => { const c = window.__cityDebug.controller; const s = c.displayed(); return { id: c.sc.id, creek: !!s.c.creek, cap: s.c.creek ? +s.c.creek.capacity.toFixed(1) : null, pockets: s.c.pockets, b: s.c.buildings.length }; }")
        print(tag, info)
        if tag == 'jb':
            pg.get_by_role('radio', name='Creciente').first.evaluate('e => e.click()'); pg.wait_for_timeout(400)
            pg.locator('button.preset', has_text='Se desborda').first.evaluate('e => e.click()'); pg.wait_for_timeout(500)
            pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); }")
            for k in range(8):
                pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({(k + 1) * 75})"); pg.wait_for_timeout(200)
            pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(3500)
            pg.screenshot(path=f'{OUT}/jb-2-creciente-seccion.png')
            pg.evaluate("() => window.__cityDebug.controller.camera('general')"); pg.wait_for_timeout(3000)
            pg.screenshot(path=f'{OUT}/jb-3-creciente-general.png')
            pg.evaluate("() => { const el = [...document.querySelectorAll('figcaption')].find((h) => h.textContent.includes('Sección transversal')); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
            pg.screenshot(path=f'{OUT}/jb-4-seccion-panel.png')
            pg.evaluate("() => window.__cityDebug.controller.setPaused(false)")
        pg.evaluate("() => window.__cityDebug.controller.showValley()")
        pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(1500)
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
