# Cobertura en el mapa 2D (sin WebGL2).
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/cob'
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--disable-3d-apis'])
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()"); pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-valley2d', timeout=30000)
    pg.locator('.city-valley2d button', has_text='Ladera').click()
    pg.wait_for_selector('.city-simbar', timeout=60000); pg.wait_for_timeout(1500)
    pg.evaluate("""() => { const c = window.__cityDebug.controller; const cap = c.displayed().c.creek.capacity;
      c.update({ shared: { creek: { peakM3s: Math.round(0.6 * cap), timeToPeakMin: 8, startMin: 2, sedimentCv: 0 }, simMinutes: 35 },
                 B: { ...c.ivB, culverts: { 'cobertura-carrera': { obstruction: 0.9, progressive: false } } } });
      c.reset(); c.start(); c.setPaused(true); c.displayed().advanceTo(720); }""")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/m2d.png')
    b.close()
print('\n'.join(logs) or 'consola limpia')
