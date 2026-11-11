# Capturas de trabajo de los efectos de lluvia y agua (consola incluida).
import sys
from playwright.sync_api import sync_playwright
OUT = '/home/claude/shots/city/fx'
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
logs = []
tag = sys.argv[1] if len(sys.argv) > 1 else 'a'
def page(b, W, H):
    ctx = b.new_context(viewport={'width': W, 'height': H})
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'{m.type}: {m.text[:400]}') if m.type in ('error', 'warning') and 'GL Driver' not in m.text and 'GPU stall' not in m.text else None)
    pg.on('pageerror', lambda e: logs.append(f'pageerror: {e}'))
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click()
    pg.wait_for_function("() => window.__cityDebug && window.__cityDebug.controller", timeout=30000)
    return ctx, pg
def sector(pg, name):
    pg.locator('.city-pick button', has_text=name).click()
    pg.wait_for_selector('.city-simbar', timeout=30000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=30000)
    pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
def rain(pg, mmh, t, extra=''):
    pg.evaluate(f"() => {{ const c = window.__cityDebug.controller; c.update({{ shared: {{ rain: {{ ...c.shared.rain, intensityMmH: {mmh} {extra} }} }} }}); c.start(); c.displayed().advanceTo({t}); }}")
    pg.wait_for_timeout(2500)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    ctx, pg = page(b, 1440, 900)
    sector(pg, 'Calle de prueba'); rain(pg, 100, 600)
    pg.screenshot(path=f'{OUT}/{tag}-calle-general.png')
    pg.get_by_role('button', name='Vista a nivel de calle').click(); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/{tag}-calle-nivel.png')
    print('niveles:', pg.evaluate("() => JSON.stringify(window.__cityDebug.controller.view.fx.levels)"))
    pg.get_by_role('button', name='Restablecer la vista general').click(); pg.wait_for_timeout(1500)
    AIM = """(o) => { const v = window.__cityDebug.controller.view; const c = v.c; const cc = (k) => [((k % c.nx) + 0.5) * c.dx, (Math.floor(k / c.nx) + 0.5) * c.dx];
      let P, T;
      if (o.kind === 'sumidero') { const [x, y] = cc(c.drains[0].cell); const z = c.z[c.drains[0].cell]; P = [x - 6, y - 7, z + 5]; T = [x, y, z]; }
      if (o.kind === 'salida') { const ou = c.outlets[Math.floor(c.outlets.length / 2)]; const [x, y] = cc(ou.cell); const z = c.z[ou.cell]; const W = c.nx * c.dx, H = c.ny * c.dx;
        const ex = x > W - 2 ? 1 : x < 2 ? -1 : 0, ey = y > H - 2 ? 1 : y < 2 ? -1 : 0; P = [x + ex * 13 - ey * 6 + (ex ? 0 : 6), y + ey * 13 + ex * 6, z + 3]; T = [x, y, z - 2]; }
      if (o.kind === 'bajante' || o.kind === 'deposito') { const bi = o.kind === 'deposito' ? c.tanks[0].buildings[0] : o.bi; const b = v.sc.buildings[bi]; const [dx, dy] = b.downspout;
        const cx = b.polygon.reduce((s, p) => s + p[0], 0) / b.polygon.length, cy = b.polygon.reduce((s, p) => s + p[1], 0) / b.polygon.length;
        let ox = dx - cx, oy = dy - cy; const L = Math.hypot(ox, oy) || 1; ox /= L; oy /= L; const z = v.groundAt(dx, dy);
        P = [dx + ox * 8 - oy * 3, dy + oy * 8 + ox * 3, z + 3.2]; T = [dx, dy, z + 1.0]; }
      v.tween = null; v.w(P[0], P[1], P[2], v.camera.position); v.w(T[0], T[1], T[2], v.controls.target); v.controls.update(); return [P, T]; }"""
    for name in ['sumidero', 'salida', 'bajante']:
        pg.evaluate(AIM, {'kind': name, 'bi': 1})
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{tag}-calle-{name}.png')
    # depósito de la torre activado (mismo sector, nueva corrida)
    pg.evaluate("() => { const c = window.__cityDebug.controller; const t = Object.keys(c.ivB.tanks)[0]; c.update({ B: { ...c.ivB, tanks: { ...c.ivB.tanks, [t]: { on: true, destination: 'red' } } } }); c.start(); c.displayed().advanceTo(900); }")
    pg.wait_for_timeout(2500)
    pg.evaluate(AIM, {'kind': 'deposito', 'bi': 0})
    pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{OUT}/{tag}-calle-deposito.png')
    print('niveles con depósito:', pg.evaluate("() => JSON.stringify(window.__cityDebug.controller.view.fx.levels)"), pg.evaluate("() => { const s = window.__cityDebug.controller.displayed(); return [s.tankVol[0], s.c.tanks[0].capacity]; }"))
    ctx.close()
    ctx, pg = page(b, 1440, 900)
    sector(pg, 'Ladera con quebrada'); rain(pg, 100, 780)
    pg.screenshot(path=f'{OUT}/{tag}-ladera-general.png')
    pg.evaluate("() => { const v = window.__cityDebug.controller.view; const l = v.sc.labels.find(l => /Quebrada/.test(l.text)) || v.sc.labels[0]; v.focusOn(l.at[0], l.at[1]); setTimeout(() => v.zoom(0.5), 1000); }")
    pg.wait_for_timeout(2600)
    pg.screenshot(path=f'{OUT}/{tag}-ladera-quebrada.png')
    print('niveles:', pg.evaluate("() => JSON.stringify(window.__cityDebug.controller.view.fx.levels)"))
    ctx.close(); b.close()
print('\n'.join(logs[:20]) or 'consola limpia')
