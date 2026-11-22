"""Recorre todas las fichas de lectura de las salas.

En cada parte de cada sala con escena 3D, toma cada objeto que tiene ficha, proyecta varios puntos de su
geometría a la pantalla y lee ahí: la ficha cuenta como comprobada si en alguno de esos puntos aparece la lectura de
ese mismo objeto. Además prueba el teclado (flechas y anuncio al lector de pantalla) en una parte por sala y registra
los errores de la página y de la consola. Necesita el servidor de desarrollo (npm run dev) en 127.0.0.1:5173, porque
la escena queda a mano en window.__q3 solo en desarrollo.

Uso: python3 tools/verificacion/fichas.py [sala,sala,...]
"""
import json
import sys

from playwright.sync_api import sync_playwright

ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
URL = 'http://127.0.0.1:5173/'
SALAS = ['cuencas', 'acueducto', 'acuifero', 'presas', 'laderas', 'bombas', 'medir', 'casa', 'canales', 'calidad']

# En la página: para cada objeto con ficha, prueba hasta 14 vértices repartidos en su geometría
WALK = """() => {
  const st = window.__q3;
  if (!st) return { error: 'sin escena' };
  const cv = st.renderer.domElement, r = cv.getBoundingClientRect();
  const out = [];
  st.probes.forEach((p, i) => {
    if (!p.obj.visible) { out.push({ i, ok: null, why: 'oculto' }); return; }
    const meshes = [];
    p.obj.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position && o.visible !== false) meshes.push(o); });
    const pts = [];
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, n = pos.count;
      const per = Math.max(1, Math.ceil(14 / meshes.length));
      for (let k = 0; k < per; k++) {
        // promedio de un bloque de vértices seguidos: en los tubos es el centro de un anillo (en el eje), en las
        // cajas queda adentro y en las superficies queda sobre ellas
        const i0 = Math.floor(((k + 0.5) / per) * n) % n, blk = Math.max(1, Math.min(24, Math.floor(n / 8)));
        const v = new p.obj.position.constructor();
        const tmp = new p.obj.position.constructor();
        let c = 0;
        for (let q = i0; q < Math.min(n, i0 + blk); q++) { v.add(tmp.fromBufferAttribute(pos, q)); c++; }
        v.multiplyScalar(1 / Math.max(1, c));
        if (m.isInstancedMesh && m.count > 0) {
          const M = new st.camera.matrixWorld.constructor();
          m.getMatrixAt(Math.floor(((k + 0.5) / per) * m.count) % m.count, M);
          v.applyMatrix4(M);
        }
        pts.push(m.localToWorld(v));
      }
    }
    let ok = false, covered = false, tried = 0, title = '';
    for (const w of pts.slice(0, 18)) {
      const c = w.clone().project(st.camera);
      if (Math.abs(c.x) > 0.97 || Math.abs(c.y) > 0.97 || c.z > 1) continue;
      tried++;
      const x = r.left + ((c.x + 1) / 2) * r.width, y = r.top + ((1 - c.y) / 2) * r.height;
      if (st.probeAt(x, y)) {
        if (st.probeLast && st.probeLast.p === p) { ok = true; title = st.probeEl.querySelector('b').textContent; break; }
        covered = true;
      }
    }
    st.hideProbe();
    // tapada: en esos puntos responde otra ficha que está delante (la persona igual lee algo ahí)
    out.push({ i, ok: tried ? (ok ? true : covered ? 'tapada' : false) : null, tried, title, why: tried ? '' : 'fuera de la vista' });
  });
  return { n: st.probes.length, out };
}"""


def main(salas):
    resumen, errores = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        for sala in salas:
            pg = b.new_page(viewport={'width': 1280, 'height': 820})
            pg.set_default_timeout(120000)
            pg.on('pageerror', lambda e, s=sala: errores.append(f'{s}: {str(e)[:200]}'))
            pg.on('console', lambda m, s=sala: errores.append(f'{s} (consola): {m.text[:200]}') if m.type == 'error' and 'WebGL' not in m.text and 'GPU' not in m.text else None)
            pg.goto(f'{URL}#{sala}', timeout=120000)
            pg.wait_for_selector('canvas.q3-canvas', timeout=90000)
            pg.wait_for_timeout(4000)
            n_tabs = pg.evaluate("() => document.querySelectorAll('.q-tabs [role=tab]').length") or 1
            for t in range(n_tabs):
                if n_tabs > 1:
                    pg.evaluate('(i) => document.querySelectorAll(".q-tabs [role=tab]")[i].click()', t)
                    pg.wait_for_timeout(6500)
                parte = pg.evaluate("() => { const e = document.querySelector('.q-tabs [aria-selected=true]'); return e ? (e.getAttribute('aria-label') || e.textContent.trim()) : ''; }")
                res = pg.evaluate(WALK)
                if 'error' in res:
                    resumen.append({'sala': sala, 'parte': parte, 'error': res['error']})
                    print(f'-- {sala} / {parte}: {res["error"]}', flush=True)
                    continue
                okn = sum(1 for o in res['out'] if o['ok'] is True)
                tap = [o for o in res['out'] if o['ok'] == 'tapada']
                malas = [o for o in res['out'] if o['ok'] is False]
                sin = [o for o in res['out'] if o['ok'] is None]
                resumen.append({'sala': sala, 'parte': parte, 'fichas': res['n'], 'leidas': okn, 'tapadas': tap, 'sin_lectura': malas, 'no_probadas': sin})
                print(f'{"OK " if not malas else "MAL"} {sala} / {parte}: {okn} de {res["n"]} fichas leídas' + (f'; tapadas por otra ficha: {len(tap)}' if tap else '') + (f'; sin lectura: {[m["i"] for m in malas]}' if malas else '') + (f'; no probadas: {len(sin)}' if sin else ''), flush=True)
                # el teclado: el punto de lectura aparece y algo se anuncia
                if t == 0:
                    pg.focus('canvas.q3-canvas')
                    for k in ['ArrowDown', 'ArrowDown', 'ArrowRight']:
                        pg.keyboard.press(k)
                        pg.wait_for_timeout(300)
                    pg.wait_for_timeout(700)
                    kb = pg.evaluate("() => { const c = document.querySelector('.q3-kbcursor'); const l = [...document.querySelectorAll('.q3-scene p[aria-live]')].map(e => e.textContent).join(''); return { cursor: !!c && getComputedStyle(c).display !== 'none', anuncio: l.slice(0, 120) }; }")
                    pg.keyboard.press('Escape')
                    print(f'    teclado: punto {"visible" if kb["cursor"] else "NO visible"}; anuncio: «{kb["anuncio"]}»', flush=True)
                    resumen[-1]['teclado'] = kb
            pg.close()
        b.close()
    with open('/tmp/fichas.json', 'w') as f:
        json.dump({'partes': resumen, 'errores': errores}, f, ensure_ascii=False, indent=1)
    tot = sum(r.get('fichas', 0) for r in resumen)
    leidas = sum(r.get('leidas', 0) for r in resumen)
    malas = sum(len(r.get('sin_lectura', [])) for r in resumen)
    tapadas = sum(len(r.get('tapadas', [])) for r in resumen)
    print(f'\n{leidas} de {tot} fichas leídas; {tapadas} tapadas por otra ficha; {malas} sin lectura; {len(errores)} errores de la página o la consola.')
    for e in errores[:10]:
        print('  ', e)
    return 1 if malas or errores else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1].split(',') if len(sys.argv) > 1 else SALAS))
