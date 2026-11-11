import sys
from playwright.sync_api import sync_playwright
SECTOR = sys.argv[1] if len(sys.argv) > 1 else 'Calle de prueba'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto('http://127.0.0.1:5173/#recorrido'); pg.wait_for_timeout(800)
    pg.get_by_role('button', name='Medellín: laboratorio de lluvia').click(); pg.wait_for_timeout(1500)
    pg.wait_for_selector('.city-pick', timeout=30000)
    pg.locator('.city-pick button', has_text=SECTOR).click(force=True)
    pg.wait_for_selector('.city-simbar', timeout=60000)
    pg.wait_for_function("() => { const c = window.__cityDebug.controller; const i = c && c.renderInfo(); return i && i.triangles > 1000; }", timeout=60000)
    pg.evaluate("() => { const c = window.__cityDebug.controller; c.update({ shared: { rain: { ...c.shared.rain, intensityMmH: 100 } } }); c.start(); c.pause && c.pause(); }")
    pg.wait_for_timeout(3000)
    T = """() => { const v = window.__cityDebug.controller.view; const gl = v.renderer.getContext(); const px = new Uint8Array(4);
      const one = () => { v.renderer.render(v.scene, v.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
      one(); const t0 = performance.now(); for (let i = 0; i < 2; i++) one(); return (performance.now() - t0) / 2; }"""
    G = "window.__cityDebug.controller.view.backdrop.group"
    def meas(name, js):
        pg.evaluate(js)
        print(f"{name:26s} {pg.evaluate(T):7.0f} ms/cuadro")
    import statistics
    cats = {
      'relieve': "o.isMesh && !o.isInstancedMesh && o.geometry.type === 'BufferGeometry' && o.material.side !== 2",
      'casas': "o.isInstancedMesh && !!o.geometry.attributes.aHouse",
      'arboles': "o.isInstancedMesh && (o.geometry.type === 'IcosahedronGeometry' || (o.geometry.type === 'BufferGeometry') || (o.geometry.type === 'CylinderGeometry' && o.material.color.r < 0.5 && o.material.color.g < 0.35))",
      'resto': "!(o.isSprite) && !(o.isMesh && !o.isInstancedMesh && o.geometry.type === 'BufferGeometry' && o.material.side !== 2) && !(o.isInstancedMesh && !!o.geometry.attributes.aHouse)",
      'nubes': "o.isSprite",
    }
    R = {k: [] for k in ['todo', 'nada'] + list(cats)}
    for _ in range(3):
        R['todo'].append(pg.evaluate(T))
        pg.evaluate(f"() => {{ {G}.visible = false; }}"); R['nada'].append(pg.evaluate(T)); pg.evaluate(f"() => {{ {G}.visible = true; }}")
        for k, cond in cats.items():
            pg.evaluate(f"() => {{ for (const o of {G}.children) if ({cond}) o.visible = false; }}")
            R[k].append(pg.evaluate(T))
            pg.evaluate(f"() => {{ for (const o of {G}.children) o.visible = true; }}")
    med = {k: statistics.median(v) for k, v in R.items()}
    print('todo', round(med['todo']), 'sin entorno', round(med['nada']))
    for k in cats: print(f"  sin {k:8s} ahorra {med['todo'] - med[k]:6.0f} ms")
    b.close()
