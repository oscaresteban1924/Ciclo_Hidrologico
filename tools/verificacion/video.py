# Video corto de la lluvia y el agua, cuadro por cuadro con reloj controlado (24 cuadros/s reales).
# Con el reloj falso de Playwright cada cuadro avanza exactamente 1/24 s, aunque el navegador de pruebas
# dibuje por software y tarde más en producirlo.
import sys, os
from playwright.sync_api import sync_playwright
OUT = '/home/claude/video/frames'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FPS = 24
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 10**9
ONLY5 = len(sys.argv) > 2 and sys.argv[2] == 'solo5'
CSS = """
.layout-city { grid-template-columns: minmax(0, 1fr) 0 !important; }
.city-panel, .city-viewbar, .city-banners, .city-coach { display: none !important; }
.vid-cap { position: absolute; left: 50%; top: 68px; transform: translateX(-50%); z-index: 50; background: rgba(15, 30, 48, .82); color: #fff;
  font: 600 19px/1.3 var(--font-display, system-ui); padding: 10px 18px; border-radius: 12px; text-align: center; max-width: 80%; }
.vid-cap small { display: block; font: 500 14px/1.35 var(--font-body, system-ui); opacity: .88; margin-top: 2px; }
"""
AIM = """(o) => { const v = window.__cityDebug.controller.view; const c = v.c; const cc = (k) => [((k % c.nx) + 0.5) * c.dx, (Math.floor(k / c.nx) + 0.5) * c.dx];
  let P, T;
  if (o.kind === 'sumidero') { const [x, y] = cc(c.drains[0].cell); const z = c.z[c.drains[0].cell]; P = [x - 5, y - 6, z + 4.2]; T = [x, y, z]; }
  if (o.kind === 'salida') { const ou = c.outlets[Math.floor(c.outlets.length / 2)]; const [x, y] = cc(ou.cell); const z = c.z[ou.cell]; const W = c.nx * c.dx, H = c.ny * c.dx;
    const ex = x > W - 2 ? 1 : x < 2 ? -1 : 0, ey = y > H - 2 ? 1 : y < 2 ? -1 : 0; P = [x + ex * 14 - ey * 7 + (ex ? 0 : 7), y + ey * 14 + ex * 7, z + 3.5]; T = [x - ex * 3, y - ey * 3, z - 1.5]; }
  v.tween = null; v.w(P[0], P[1], P[2], v.camera.position); v.w(T[0], T[1], T[2], v.controls.target); v.controls.update(); }"""
n = 0
def shot(pg, clip):
    global n
    pg.clock.run_for(round((n + 1) * 1000 / FPS) - round(n * 1000 / FPS))
    pg.screenshot(path=f'{OUT}/f{n:05d}.png', clip=clip)
    n += 1
def caption(pg, title, sub):
    pg.evaluate("([t, s]) => { let d = document.querySelector('.vid-cap'); if (!d) { d = document.createElement('div'); d.className = 'vid-cap'; document.querySelector('.city-stage').appendChild(d); } d.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }", [title, sub])
def segment(pg, clip, seconds, orbit=0.0):
    for _ in range(int(seconds * FPS)):
        if n >= LIMIT: return
        if orbit: pg.evaluate(f"() => window.__cityDebug.controller.view.orbit({orbit})")
        shot(pg, clip)
def enter(pg, name):
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_selector('.city-simbar', timeout=60000)
    for _ in range(200):
        pg.clock.run_for(100)
        if pg.evaluate("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return !!(i && i.triangles > 1000); }"): break
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
with sync_playwright() as p:
    if not ONLY5:
        for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    pg = ctx.new_page()
    pg.clock.install()
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(1500)
    pg.add_style_tag(content=CSS)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=60000)
    pg.clock.pause_at(pg.evaluate("() => Date.now()") + 1000)
    enter(pg, 'Calle de prueba')
    pg.clock.run_for(500)
    box = pg.locator('.city-stage').bounding_box()
    clip = {'x': box['x'], 'y': box['y'], 'width': int(box['width']) // 2 * 2, 'height': int(box['height']) // 2 * 2}
    if ONLY5:
        n = 504
        for f in os.listdir(OUT):
            if int(f[1:6]) >= 504: os.remove(os.path.join(OUT, f))
    if not ONLY5:
        # 1) Vista general: empieza a llover sobre la calle seca
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); }")
        caption(pg, 'Calle de prueba · empieza un aguacero de 100 mm/h', 'Escenario didáctico · la simulación avanza ×30')
        segment(pg, clip, 1.0, orbit=0.1)
        pg.evaluate("() => window.__cityDebug.controller.start()")
        segment(pg, clip, 7.0, orbit=0.1)
        # 2) A nivel de calle
        pg.evaluate("() => { const v = window.__cityDebug.controller.view; v.goto('calle', false); }")
        caption(pg, 'A nivel de calle', 'Gotas, salpicaduras y anillos donde llueve · la lámina se dibuja a escala real')
        segment(pg, clip, 5.0)
        # 3) Sumidero
        pg.evaluate(AIM, {'kind': 'sumidero'})
        caption(pg, 'Sumidero: el remolino crece con el caudal captado', 'Las vetas avanzan con la velocidad calculada del agua')
        segment(pg, clip, 4.0, orbit=0.08)
        # 4) Salida del sector
        pg.evaluate(AIM, {'kind': 'salida'})
        caption(pg, 'El agua que sale del sector', 'La cascada aparece donde el modelo calcula caudal de salida')
        segment(pg, clip, 4.0)
    ctx.close()
    # 5) Ladera con quebrada (minuto 10 de la misma lluvia)
    if n < LIMIT:
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        pg = ctx.new_page()
        pg.clock.install()
        pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(1500)
        pg.add_style_tag(content=CSS)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=60000)
        pg.clock.pause_at(pg.evaluate("() => Date.now()") + 1000)
        enter(pg, 'Ladera con quebrada')
        pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); c.displayed().advanceTo(600); }")
        pg.clock.run_for(3000)
        caption(pg, 'Ladera con quebrada · el mismo aguacero, ya avanzado', 'Sector demostrativo · el agua baja por las calles hacia la quebrada')
        segment(pg, clip, 5.0, orbit=0.12)
        ctx.close()
    b.close()
print('cuadros:', n)
