# Capturas de la creciente dañina, del mapa de peligro y de las redes legibles (panel y maqueta).
# uso: city19.py etiqueta [alta|ligera]
import sys, os
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else 'a'
Q = sys.argv[2] if len(sys.argv) > 2 else 'ligera'
ONLY = sys.argv[3] if len(sys.argv) > 3 else 'todo'
OUT = '/home/claude/shots/city/cr'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
os.makedirs(OUT, exist_ok=True)
def open_sector(b, name):
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Alta' if Q == 'alta' else 'Ligera').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text=name).click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.wait_for_timeout(500)
    return pg
def scroll_to(pg, sel, text):
    pg.evaluate(f"() => {{ const el = [...document.querySelectorAll('{sel}')].find((h) => h.textContent.includes('{text}')); if (el) el.scrollIntoView({{ block: 'start' }}); }}"); pg.wait_for_timeout(700)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    if ONLY in ('todo', 'creciente'):
        pg = open_sector(b, 'Ladera con quebrada')
        pg.get_by_role('radio', name='Creciente').click(force=True); pg.wait_for_timeout(400)
        pg.locator('button.preset', has_text='Inundación grave').click(force=True); pg.wait_for_timeout(600)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.start(); c.displayed().advanceTo(600); c.setPaused(true); }")
        pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{TAG}-grave-panel.png')
        scroll_to(pg, 'figcaption', 'Sección transversal')
        pg.screenshot(path=f'{OUT}/{TAG}-grave-seccion-panel.png')
        scroll_to(pg, 'figcaption', 'Caudales en la sección')
        pg.screenshot(path=f'{OUT}/{TAG}-grave-hidrograma.png')
        pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/{TAG}-grave-seccion.png')
        pg.evaluate("() => window.__cityDebug.controller.camera('general')"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{TAG}-grave-general.png')
        pg.evaluate("() => window.__cityDebug.controller.setView('peligro')"); pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{TAG}-grave-peligro.png')
        pg.evaluate("() => window.__cityDebug.controller.setView('realista')"); pg.wait_for_timeout(500)
        info = pg.evaluate("() => { const s = window.__cityDebug.controller.displayed(); return { t: s.t, drift: s.drift.map((o) => [o.id, o.state, Math.round(o.dist)]), sec: s.creekSection() }; }")
        print('grave', info)
        # avenida torrencial: avanza en pasos cortos para que el material flotante entre y se mueva con el agua
        pg.get_by_role('radio', name='Creciente').click(force=True); pg.wait_for_timeout(300)
        pg.locator('button.preset', has_text='Avenida torrencial').click(force=True); pg.wait_for_timeout(500)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.reset(); c.start(); c.setPaused(true); c.displayed().advanceTo(200); }")
        pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(2500)
        for k in range(14):
            pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({200 + 10 * (k + 1)})"); pg.wait_for_timeout(450)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{TAG}-avenida-seccion.png')
        pg.evaluate("() => window.__cityDebug.controller.focus(106, 22)"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/{TAG}-avenida-orilla.png')
        pg.evaluate("() => window.__cityDebug.controller.setView('peligro')"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{TAG}-avenida-peligro.png')
        pg.evaluate("() => window.__cityDebug.controller.setView('realista')"); pg.wait_for_timeout(300)
        for k in range(12):
            pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({340 + 100 * (k + 1)})"); pg.wait_for_timeout(250)
        pg.evaluate("() => window.__cityDebug.controller.focusCreekSection()"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/{TAG}-avenida-despues.png')
        pg.close()
    if ONLY in ('todo', 'redes'):
        pg = open_sector(b, 'Calle de prueba')
        pg.get_by_role('radio', name='Alcantarillado').click(force=True); pg.wait_for_timeout(400)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } }, B: { ...c.ivB, erradas: true } }); c.start(); c.displayed().advanceTo(720); c.setPaused(true); }")
        pg.wait_for_timeout(3000)
        pg.screenshot(path=f'{OUT}/{TAG}-calle-panel.png')
        scroll_to(pg, 'figcaption', 'Corte de la calle')
        pg.screenshot(path=f'{OUT}/{TAG}-calle-corte.png')
        scroll_to(pg, 'figcaption', 'planta')
        pg.screenshot(path=f'{OUT}/{TAG}-calle-planta.png')
        scroll_to(pg, 'figcaption', 'Perfil')
        pg.screenshot(path=f'{OUT}/{TAG}-calle-perfil.png')
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.setCut(true); c.camera('general'); }"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{TAG}-calle-bajo-ambas.png')
        pg.evaluate("() => window.__cityDebug.controller.setNetFilter('lluvias')"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{TAG}-calle-bajo-lluvias.png')
        pg.evaluate("() => window.__cityDebug.controller.setNetFilter('residuales')"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f'{OUT}/{TAG}-calle-bajo-residuales.png')
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.setNetFilter('ambas'); c.focus(46, 28); }"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/{TAG}-calle-bajo-cerca.png')
        pg.close()
        pg = open_sector(b, 'Ladera con quebrada')
        pg.get_by_role('radio', name='Alcantarillado').click(force=True); pg.wait_for_timeout(400)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.start(); c.displayed().advanceTo(600); c.setPaused(true); c.setCut(true); c.camera('general'); }"); pg.wait_for_timeout(3500)
        pg.screenshot(path=f'{OUT}/{TAG}-ladera-bajo.png')
        pg.evaluate("() => window.__cityDebug.controller.focus(87, 55)"); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'{OUT}/{TAG}-ladera-bajo-cerca.png')
        pg.close()
    b.close()
print('\n'.join(logs[:12]) or 'consola limpia')
