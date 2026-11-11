# Cobertura bajo la carrera en la maqueta 3D (uso: etiqueta obstrucción si|no fracción segundos).
import sys
from playwright.sync_api import sync_playwright
TAG = sys.argv[1] if len(sys.argv) > 1 else 'a'
OBS = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
PROG = (sys.argv[3] if len(sys.argv) > 3 else 'si') == 'si'
F = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
T = int(sys.argv[5]) if len(sys.argv) > 5 else 900
OUT = '/home/claude/shots/city/cob'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(900)
    pg.evaluate("() => localStorage.clear()")
    pg.reload(); pg.wait_for_timeout(900)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text='Ladera').click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
    pg.evaluate(f"""() => {{ const c = window.__cityDebug.controller; const cap = c.displayed().c.creek.capacity;
      c.update({{ shared: {{ creek: {{ peakM3s: Math.round({F} * cap), timeToPeakMin: 10, startMin: 2, sedimentCv: 0.1 }}, simMinutes: 35 }},
                 B: {{ ...c.ivB, culverts: {{ 'cobertura-carrera': {{ obstruction: {OBS}, progressive: {'true' if PROG else 'false'} }} }} }} }});
      c.reset(); c.start(); c.setPaused(true); }}""")
    LOOK_OUT = "() => { const c = window.__cityDebug.controller; c.view.lookFrom([104, 2, 45], [88, 13, 35.5]); }"
    LOOK_IN = "() => { const c = window.__cityDebug.controller; c.view.lookFrom([76.5, 21, 41], [84.5, 13, 35.6]); }"
    pg.evaluate(LOOK_OUT); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/{TAG}-0-seco.png')
    pg.evaluate(LOOK_IN); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/{TAG}-0-seco-entrada.png')
    pg.evaluate(LOOK_OUT); pg.wait_for_timeout(500)
    for k in range(10):
        pg.evaluate(f"() => window.__cityDebug.controller.displayed().advanceTo({(k + 1) * T / 10})"); pg.wait_for_timeout(300)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/{TAG}-1-creciente.png')
    info = pg.evaluate("() => { const s = window.__cityDebug.controller.displayed(); return { t: s.t, culv: s.culv.map((u) => ({ q: +u.q.toFixed(1), over: +u.over.toFixed(1), obs: +u.obs.toFixed(2), up: +u.up.toFixed(2) })) }; }")
    print(TAG, info)
    pg.evaluate(LOOK_IN); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/{TAG}-2-entrada.png')
    b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
