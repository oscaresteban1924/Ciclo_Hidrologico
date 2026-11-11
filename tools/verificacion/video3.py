# Video corto: el barrio que evoca Medellín y el recorrido de las gotas trazadoras (24 cuadros/s, reloj controlado).
import sys, os
from playwright.sync_api import sync_playwright
OUT = '/home/claude/video/frames3'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FPS = 24
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 10**9
START = int(sys.argv[2]) if len(sys.argv) > 2 else 0  # cuadros anteriores: se simulan sin capturar
CSS = """
.layout-city { grid-template-columns: minmax(0, 1fr) 0 !important; }
.city-panel, .city-viewbar, .city-banners, .city-coach { display: none !important; }
.vid-cap { position: absolute; left: 50%; top: 68px; transform: translateX(-50%); z-index: 50; background: rgba(15, 30, 48, .82); color: #fff;
  font: 600 19px/1.3 var(--font-display, system-ui); padding: 10px 18px; border-radius: 12px; text-align: center; max-width: 80%; }
.vid-cap small { display: block; font: 500 14px/1.35 var(--font-body, system-ui); opacity: .88; margin-top: 2px; }
"""
n = 0
RAF = """() => { if (window.__flush) return; const q = new Map(); let id = 1;
  window.requestAnimationFrame = (cb) => { q.set(id, cb); return id++; };
  window.cancelAnimationFrame = (k) => { q.delete(k); };
  window.__flush = (t) => { const cbs = [...q.values()]; q.clear(); for (const cb of cbs) cb(t); }; }"""
def tick(pg, ms):
    pg.clock.run_for(ms)
    pg.evaluate("() => { if (window.__flush) window.__flush(performance.now()); }")
def shot(pg, clip):
    global n
    tick(pg, round((n + 1) * 1000 / FPS) - round(n * 1000 / FPS))
    if n >= START: pg.screenshot(path=f'{OUT}/f{n:05d}.png', clip=clip)
    n += 1
def caption(pg, title, sub):
    pg.evaluate("([t, s]) => { let d = document.querySelector('.vid-cap'); if (!d) { d = document.createElement('div'); d.className = 'vid-cap'; document.querySelector('.city-stage').appendChild(d); } d.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); }", [title, sub])
def segment(pg, clip, seconds, orbit=0.0):
    for _ in range(int(seconds * FPS)):
        if n >= LIMIT: return
        if orbit: pg.evaluate(f"() => {{ const v = window.__cityDebug.controller.view; if (v && v.orbit) v.orbit({orbit}); }}")
        shot(pg, clip)
with sync_playwright() as p:
    for f in os.listdir(OUT):
        if int(f[1:6]) >= START: os.remove(os.path.join(OUT, f))
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    pg = ctx.new_page()
    pg.clock.install()
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(1500)
    pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Alta').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.add_style_tag(content=CSS)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=60000)
    pg.wait_for_selector('.city-pick', timeout=60000)
    pg.clock.pause_at(pg.evaluate("() => Date.now()") + 1000)
    pg.clock.run_for(1500)
    pg.evaluate(RAF)
    tick(pg, 50)
    box = pg.locator('.city-stage').bounding_box()
    clip = {'x': box['x'], 'y': box['y'], 'width': int(box['width']) // 2 * 2, 'height': int(box['height']) // 2 * 2}
    # 1) Valle de Aburrá (esquema)
    caption(pg, 'Valle de Aburrá', 'Esquema para orientarse: laderas, río, metro y los sectores de estudio')
    segment(pg, clip, 2.0)
    # 2) Entrar al sector: la cámara «Valle» muestra el barrio y la loma detrás
    pg.locator('.city-pick button', has_text='Calle de prueba').click()
    for _ in range(300):
        tick(pg, 100)
        if pg.evaluate("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return !!(i && i.triangles > 1000) && !!document.querySelector('.city-simbar'); }"): break
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.camera('valle'); c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); }")
    caption(pg, 'Calle de prueba en su barrio', 'El sector al pie de la ladera: casas de ladrillo, tanques en las azoteas, cable aéreo · entorno ilustrativo')
    segment(pg, clip, 4.0, orbit=0.06)
    # 3) Vista general: tres tandas de gotas trazadoras
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.camera('general'); c.displayed().advanceTo(300); }")
    for _ in range(3): tick(pg, 400)
    pg.evaluate("""() => { const c = window.__cityDebug.controller; const sc = c.view.sc; const b = sc.buildings[2];
      const cx = b.polygon.reduce((s, q) => s + q[0], 0) / b.polygon.length, cy = b.polygon.reduce((s, q) => s + q[1], 0) / b.polygon.length;
      c.releaseTracers(12, 40); c.releaseTracers(30, 22); c.releaseTracers(cx, cy); }""")
    caption(pg, 'Seguir el agua: tres tandas de 24 gotas', 'Ruta azul con flechas: la gota guía y lo que lleva recorrido · al llegar, el color de su destino')
    segment(pg, clip, 7.0)
    # 4) Siguiendo a la gota guía de la primera tanda
    FOLLOW = """() => { const c = window.__cityDebug.controller; const v = c.view; const t = c.tracers.tracers.find((q) => q.group === 1); if (!t) return;
      const z = v.surfaceAt(c.displayed(), t.x, t.y); const p = v.w(t.x, t.y, z);
      v.tween = null; v.controls.target.lerp(p, 0.12); const off = { x: -9, y: 7.5, z: 11 };
      v.camera.position.set(v.controls.target.x + off.x, v.controls.target.y + off.y, v.controls.target.z + off.z); v.controls.update(); }"""
    pg.evaluate("""() => { const c = window.__cityDebug.controller; const v = c.view; const t = c.tracers.tracers.find((q) => q.group === 1);
      const p = v.w(t.x, t.y, v.surfaceAt(c.displayed(), t.x, t.y)); v.tween = null; v.controls.target.copy(p); v.controls.update(); }""")
    caption(pg, 'Siguiendo a una gota', 'Su ruta se apoya en la lámina de agua y nunca atraviesa un edificio')
    for _ in range(int(5.0 * FPS)):
        if n >= LIMIT: break
        pg.evaluate(FOLLOW)
        shot(pg, clip)
    ctx.close()
    # 5) Ladera con quebrada
    if n < LIMIT:
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        pg = ctx.new_page()
        pg.clock.install()
        pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(1500)
        pg.get_by_role('button', name='Ajustes').first.click(); pg.get_by_role('radio', name='Alta').click(); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.add_style_tag(content=CSS)
        pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
        pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=60000)
        pg.wait_for_selector('.city-pick', timeout=60000)
        pg.clock.pause_at(pg.evaluate("() => Date.now()") + 1000)
        pg.clock.run_for(1500)
        pg.evaluate(RAF)
        tick(pg, 50)
        pg.locator('.city-pick button', has_text='Ladera con quebrada').click()
        for _ in range(300):
            tick(pg, 100)
            if pg.evaluate("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return !!(i && i.triangles > 1000) && !!document.querySelector('.city-simbar'); }"): break
        pg.evaluate("""() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100, pattern: 'constante' } } }); c.start(); c.displayed().advanceTo(420);
          const sc = c.view.sc; const up = sc.labels.find((l) => /arriba/i.test(l.text)) || sc.labels[0]; c.releaseTracers(up.at[0], up.at[1]);
          const pk = sc.labels.find((l) => /Cancha/i.test(l.text)); if (pk) c.releaseTracers(pk.at[0], pk.at[1]); }""")
        for _ in range(5): tick(pg, 500)
        caption(pg, 'Ladera con quebrada', 'Las gotas de la calle de arriba bajan por la ladera · sector demostrativo')
        segment(pg, clip, 4.0, orbit=0.08)
        ctx.close()
    b.close()

print('cuadros:', n)
