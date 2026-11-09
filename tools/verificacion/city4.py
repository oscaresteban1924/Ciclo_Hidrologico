# Tamaños múltiples: valle y sector con lluvia; teléfono y tableta; movimiento reducido; teclado.
import sys
from playwright.sync_api import sync_playwright
sizes = [(1280, 720), (1024, 1366), (390, 844)]
out = '/home/claude/shots/city'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for (W, H) in sizes:
        ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=W < 800)
        pg = ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' or (m.type == 'warning' and 'GL Driver' not in m.text) else None)
        pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
        pg.goto('http://127.0.0.1:5173/')
        pg.wait_for_timeout(1000)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_selector('.city-pick', timeout=30000)
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{out}/{W}x{H}-s1-valle.png')
        pg.locator('.city-pick button', has_text='Ladera con quebrada').click()
        pg.wait_for_selector('.city-simbar', timeout=30000)
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.start(); c.displayed().advanceTo(12*60); }")
        pg.wait_for_timeout(2000)
        pg.screenshot(path=f'{out}/{W}x{H}-s2-ladera.png')
        # solapes de los paneles flotantes entre sí
        ov = pg.evaluate("""() => { const els = [...document.querySelectorAll('.city-stage .city-ov')].filter(e => getComputedStyle(e).display !== 'none'); const r = els.map(e => ({c: e.className, b: e.getBoundingClientRect()})); const bad = []; for (let i=0;i<r.length;i++) for (let j=i+1;j<r.length;j++){ const a=r[i].b, c=r[j].b; if (a.width && c.width && !(a.right<=c.left||c.right<=a.left||a.bottom<=c.top||c.bottom<=a.top)) bad.push(r[i].c+' × '+r[j].c);} const st=document.querySelector('.city-stage').getBoundingClientRect(); const outside = r.filter(x => x.b.right > st.right+1 || x.b.left < st.left-1 || x.b.bottom > st.bottom+1).map(x=>x.c); return {bad, outside}; }""")
        print(W, H, 'solapes', ov)
        small = pg.evaluate("""() => [...document.querySelectorAll('.city-stage button, .city-panel button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 30) && !e.classList.contains('link'); }).map(e => e.textContent.trim().slice(0,20)).slice(0,12)""")
        print('  botones pequeños (<30 px):', small)
        print('  ' + ('\n  '.join(logs[:10]) or 'consola limpia'))
        ctx.close()
    b.close()
