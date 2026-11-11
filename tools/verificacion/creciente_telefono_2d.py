# Teléfono y alternativa 2D: panel de creciente, leyenda de peligro y redes en 390×844; vista de peligro en 2D.
import sys, os
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/cr'
os.makedirs(OUT, exist_ok=True)
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
def go(b, w, h, name, extra_args=None):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').first.click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text=name).click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_timeout(2500)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    return pg
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = go(b, 390, 844, 'Ladera con quebrada')
    pg.evaluate("() => { const c = window.__cityDebug.controller; const cap = c.displayed().c.creek.capacity; c.update({ shared: { creek: { peakM3s: Math.round(2.5 * cap), timeToPeakMin: 6, startMin: 2, sedimentCv: 0 }, simMinutes: 35 } }); c.start(); c.displayed().advanceTo(600); c.setPaused(true); c.setView('peligro'); }")
    pg.wait_for_timeout(3000)
    pg.screenshot(path=f'{OUT}/f-tel-peligro.png')
    # abre el panel y la herramienta de creciente
    pg.evaluate("() => { const t = [...document.querySelectorAll('button')].find((b) => /Panel|Herramientas/.test(b.textContent || '')); if (t) t.click(); }"); pg.wait_for_timeout(600)
    pg.evaluate("() => { const r = [...document.querySelectorAll('[role=radio], button')].find((b) => (b.textContent || '').trim().startsWith('Creciente')); if (r) { r.scrollIntoView(); r.click(); } }"); pg.wait_for_timeout(900)
    pg.evaluate("() => { const el = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('Creciente de la quebrada')); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/f-tel-creciente.png')
    pg.evaluate("() => { const el = [...document.querySelectorAll('figcaption')].find((h) => h.textContent.includes('Sección transversal')); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/f-tel-seccion.png')
    pg.evaluate("() => { const el = [...document.querySelectorAll('caption')].find((h) => h.textContent.includes('Daños')); if (el) el.scrollIntoView({ block: 'start' }); }"); pg.wait_for_timeout(600)
    pg.screenshot(path=f'{OUT}/f-tel-danos.png')
    over = pg.evaluate("() => { const out = []; for (const el of document.querySelectorAll('.creek-tool *')) { const r = el.getBoundingClientRect(); if (r.width > 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto') out.push(el.className || el.tagName); } return out.slice(0, 10); }")
    print('desbordes en el panel de creciente:', over, pg.evaluate("() => !!document.querySelector('.creek-tool')"))
    pg.close()
    b.close()
    # 2D sin WebGL
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-webgl', '--disable-3d-apis'])
    pg = go(b, 1280, 800, 'Ladera con quebrada')
    pg.evaluate("() => { const c = window.__cityDebug.controller; const cap = c.displayed().c.creek.capacity; c.update({ shared: { creek: { peakM3s: Math.round(2.5 * cap), timeToPeakMin: 6, startMin: 2, sedimentCv: 0 }, simMinutes: 35 } }); c.start(); c.displayed().advanceTo(600); c.setPaused(true); c.setView('peligro'); }")
    pg.wait_for_timeout(2000)
    pg.screenshot(path=f'{OUT}/f-2d-peligro.png')
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.setView('realista'); c.setCut(true); c.setNetFilter('lluvias'); }")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/f-2d-redes.png')
    pg.close()
    b.close()
print('\n'.join(logs[:12]) or 'consola limpia')
