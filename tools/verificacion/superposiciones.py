# Superposiciones: recorre los módulos y vistas principales (incluidas todas las salas de obras y de la naturaleza) en cuatro pantallas (escritorio 1440 × 900, portátil
# 1280 × 720, tableta 820 × 1180 y teléfono 390 × 844) y mide, en cada estado, si algún elemento flotante se monta
# sobre otro: rótulos de las escenas 3D, avisos, barras, leyendas, columna de cámara, tarjetas, preguntas y paneles
# sobre la escena. También informa los que quedan cortados por el borde de la escena o de la pantalla.
# Uso: python3 tools/verificacion/superposiciones.py [--pantallas escritorio,telefono] [--capturas]
# Escribe el informe en /home/claude/shots/overlap/informe.json y, con --capturas, una imagen por estado con los
# choques marcados en rojo. Sale con código 1 si encuentra algún choque.
import json, os, sys
from playwright.sync_api import sync_playwright

OUT = '/home/claude/shots/overlap'
URL = os.environ.get('URL', 'http://127.0.0.1:5173/#recorrido')
ARGS = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SCREENS = {
    'escritorio': dict(viewport={'width': 1440, 'height': 900}),
    'portatil': dict(viewport={'width': 1280, 'height': 720}),
    'tableta': dict(viewport={'width': 820, 'height': 1180}, is_mobile=True, has_touch=True),
    'telefono': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2),
}

# Elementos flotantes que no deben montarse unos sobre otros (cada uno se mide como una caja).
FLOATING = [
    # Medellín
    '.city-crumb', '.city-camrail', '.city-simbar', '.city-legend', '.city-card', '.city-coach',
    '.city-banners > *', '.city-label', '.city-pick', '.city-valley-head', '.city-ov:not(.city-crumb):not(.city-camrail):not(.city-simbar):not(.city-legend):not(.city-card):not(.city-coach):not(.banner):not(.city-pick)',
    # Calidad
    '.q3-question', '.q3-views', '.q3-cam', '.q3-card', '.q3-toast', '.q3-label', '.q3-hover', '.q3-tourbar',
    # Paisaje (recorrido, exploración, laboratorio)
    '.scene-tools', '.scene-hint', '.scene-label', '.scale-nav', '.stage-bottom > *', '.step-caption', '.rain-key', '.panel-peek', '.inq-pin',
    '.toast-region > *',
]

COLLECT = """(sels) => {
  const vw = innerWidth, vh = innerHeight;
  const seen = new Set();
  const out = [];
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < 0.05) return false;
    for (let p = el; p; p = p.parentElement) {
      const c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  };
  for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
    if (seen.has(el) || !visible(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('aria-label') || el.innerText || el.className || '').toString().replace(/\\s+/g, ' ').trim().slice(0, 60);
    out.push({ sel, name, x: r.left, y: r.top, w: r.width, h: r.height, el });
  }
  // las cajas anidadas (una dentro de otra en el DOM) no cuentan como choque
  const items = out.map((o, i) => ({ ...o, i }));
  const hits = [];
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const A = items[a], B = items[b];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
    const iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
    if (ix > 2 && iy > 2) hits.push({ a: A.name || A.sel, sa: A.sel, b: B.name || B.sel, sb: B.sel, area: Math.round(ix * iy), box: [Math.max(A.x, B.x), Math.max(A.y, B.y), ix, iy] });
  }
  const cut = items.filter((o) => o.x < -1 || o.y < -1 || o.x + o.w > vw + 1 || o.y + o.h > vh + 1).filter((o) => !o.sel.includes('label')).map((o) => ({ name: o.name || o.sel, sel: o.sel, box: [o.x, o.y, o.w, o.h] }));
  return { n: items.length, hits, cut };
}"""

MARK = """(boxes) => {
  const g = document.createElement('div'); g.id = '__ov';
  g.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999';
  for (const [x, y, w, h] of boxes) { const d = document.createElement('div'); d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;outline:3px solid #e00;background:rgba(255,0,0,.18)`; g.appendChild(d); }
  document.body.appendChild(g);
}"""


def check(pg, screen, state, shots, report):
    pg.wait_for_timeout(900)
    try:
        res = pg.evaluate(COLLECT, FLOATING)
    except Exception as e:  # la página cambió mientras se medía: se informa y se sigue
        report.append({'pantalla': screen, 'estado': state, 'error': str(e)[:200], 'choques': [], 'cortados': []})
        print(f'ERR [{screen}] {state}: {str(e)[:120]}')
        return
    report.append({'pantalla': screen, 'estado': state, 'elementos': res['n'], 'choques': res['hits'], 'cortados': res['cut']})
    flag = 'OK ' if not res['hits'] and not res['cut'] else 'MAL'
    print(f'{flag} [{screen}] {state}: {res["n"]} elementos, {len(res["hits"])} choques, {len(res["cut"])} cortados')
    for h in res['hits'][:6]:
        print(f'      choque: «{h["a"]}» ({h["sa"]}) con «{h["b"]}» ({h["sb"]}), {h["area"]} px²')
    for c in res['cut'][:4]:
        print(f'      cortado: «{c["name"]}» ({c["sel"]})')
    if shots and (res['hits'] or res['cut']):
        pg.evaluate(MARK, [h['box'] for h in res['hits']] + [c['box'] for c in res['cut']])
        pg.screenshot(path=f'{OUT}/{screen}-{state}.png')
        pg.evaluate("() => document.getElementById('__ov')?.remove()")


RANGE = """([l, v]) => { const el = [...document.querySelectorAll('.q3-range')].find((r) => r.textContent.includes(l)); const i = el && el.querySelector('input'); if (!i) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }"""
BTN = """(t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (b) b.click(); }"""


def top(pg):
    pg.evaluate('() => window.scrollTo(0, 0)'); pg.wait_for_timeout(300)


def mode(pg, name):
    # las salas están en menús por grupo: se abre el grupo y se elige la sala
    btn = pg.locator(f'.mode-tab[aria-label="{name}"]').first
    if not btn.is_visible():
        menu = pg.locator('.room-menu', has=btn)
        if menu.count():
            menu.first.locator('.room-group').click()
            pg.wait_for_timeout(300)
    btn.click()
    pg.wait_for_timeout(2500)


def cuencas(pg, screen, shots, report):
    """Sala de cuencas: las tres partes, el aguacero en curso, el tanque de retención y la pestaña Diseño."""
    mode(pg, 'Cuencas: de la lluvia al caudal'); pg.wait_for_timeout(4000)
    for part, tag in [('La cuenca y su respuesta', 'cuenca'), ('El hidrograma y la urbanización', 'hidrograma'), ('Crecientes y riesgo', 'crecientes')]:
        pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
        top(pg); check(pg, screen, f'cuencas-{tag}', shots, report)
        if tag == 'cuenca':
            pg.evaluate(BTN, 'Lanzar el aguacero'); pg.wait_for_timeout(9000)
            top(pg); check(pg, screen, 'cuencas-aguacero', shots, report)
        if tag == 'hidrograma':
            pg.evaluate(RANGE, ['Tanque de retención', '3000']); pg.wait_for_timeout(1500)
            pg.evaluate(BTN, 'Lanzar el aguacero'); pg.wait_for_timeout(12000)
            top(pg); check(pg, screen, 'cuencas-tanque', shots, report)
        if tag == 'crecientes':
            pg.evaluate(BTN, 'Las casas'); pg.wait_for_timeout(2500)
            top(pg); check(pg, screen, 'cuencas-casas', shots, report)
            pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
            top(pg); check(pg, screen, 'cuencas-diseno', shots, report)


def acueducto(pg, screen, shots, report):
    """Sala del acueducto: las tres partes, la válvula abierta, una tubería cerrada en la red, el golpe de ariete y Diseño."""
    mode(pg, 'Acueducto: el agua a presión'); pg.wait_for_timeout(4000)
    for part, tag in [('La tubería y su energía', 'tuberia'), ('La red del barrio', 'red'), ('El golpe de ariete', 'ariete')]:
        pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
        top(pg); check(pg, screen, f'acueducto-{tag}', shots, report)
        if tag == 'tuberia':
            pg.evaluate(RANGE, ['Apertura de la válvula', '100']); pg.wait_for_timeout(2500)
            top(pg); check(pg, screen, 'acueducto-tuberia-abierta', shots, report)
        if tag == 'red':
            pg.evaluate(BTN, 'Carrera oeste'); pg.wait_for_timeout(2500)
            top(pg); check(pg, screen, 'acueducto-red-valvula', shots, report)
        if tag == 'ariete':
            pg.evaluate(BTN, 'Cerrar la válvula'); pg.wait_for_timeout(8000)
            top(pg); check(pg, screen, 'acueducto-ariete-onda', shots, report)
            pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
            top(pg); check(pg, screen, 'acueducto-diseno', shots, report)


def subterraneas(pg, screen, shots, report):
    """Sala de aguas subterráneas: las tres partes, el bombeo, la fuga en viaje y la pestaña Diseño."""
    mode(pg, 'Aguas subterráneas'); pg.wait_for_timeout(4000)
    for part, tag in [('El acuífero y la ley de Darcy', 'acuifero'), ('El pozo y su cono', 'pozo'), ('La mancha y la zona de captura', 'mancha')]:
        pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
        top(pg); check(pg, screen, f'subterraneas-{tag}', shots, report)
        if tag == 'pozo':
            pg.evaluate(BTN, 'Bombear'); pg.wait_for_timeout(6000)
            top(pg); check(pg, screen, 'subterraneas-bombeo', shots, report)
        if tag == 'mancha':
            pg.evaluate(BTN, 'Simular la fuga'); pg.wait_for_timeout(10000)
            top(pg); check(pg, screen, 'subterraneas-fuga', shots, report)
            pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
            top(pg); check(pg, screen, 'subterraneas-diseno', shots, report)


def presas(pg, screen, shots, report):
    """Sala de presas y embalses: las tres partes, la creciente en el embalse y la pestaña Diseño."""
    mode(pg, 'Presas y embalses'); pg.wait_for_timeout(4000)
    for part, tag in [('El embalse y la creciente', 'embalse'), ('El vertedero y el pozo', 'vertedero'), ('La presa de gravedad', 'estabilidad')]:
        pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
        top(pg); check(pg, screen, f'presas-{tag}', shots, report)
        if tag == 'embalse':
            pg.evaluate(BTN, 'Llega la creciente'); pg.wait_for_timeout(8000)
            top(pg); check(pg, screen, 'presas-creciente', shots, report)
        if tag == 'estabilidad':
            pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
            top(pg); check(pg, screen, 'presas-diseno', shots, report)


def laderas(pg, screen, shots, report):
    """Sala de laderas: las tres partes, la lluvia en la parcela y la pestaña Diseño."""
    mode(pg, 'Laderas: lluvia, suelo y deslizamientos'); pg.wait_for_timeout(4000)
    for part, tag in [('La lluvia entra al suelo', 'infiltracion'), ('La ladera y el agua', 'talud'), ('La ladera pierde suelo', 'erosion')]:
        pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
        top(pg); check(pg, screen, f'laderas-{tag}', shots, report)
        if tag == 'infiltracion':
            pg.evaluate(BTN, 'Que llueva'); pg.wait_for_timeout(6000)
            top(pg); check(pg, screen, 'laderas-lluvia', shots, report)
        if tag == 'erosion':
            pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
            top(pg); check(pg, screen, 'laderas-diseno', shots, report)


def run(screens, shots):
    os.makedirs(OUT, exist_ok=True)
    report = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        for screen in screens:
          try:
            ctx = b.new_context(**SCREENS[screen])
            pg = ctx.new_page()
            pg.set_default_timeout(90000)
            pg.goto(URL); pg.wait_for_timeout(900)
            pg.evaluate('() => localStorage.clear()'); pg.reload(); pg.wait_for_timeout(2500)
            # portada (sin sala en la dirección) y luego el recorrido
            pg.goto(URL.split('#')[0]); pg.wait_for_timeout(1500)
            check(pg, screen, 'portada', shots, report)
            pg.goto(URL); pg.wait_for_timeout(2500)
            check(pg, screen, 'recorrido', shots, report)
            mode(pg, 'Exploración libre'); check(pg, screen, 'exploracion', shots, report)
            mode(pg, 'Experimentos'); check(pg, screen, 'laboratorio', shots, report)
            # Medellín: valle, sectores, vistas, creciente, cine
            mode(pg, 'Medellín: laboratorio de lluvia')
            pg.wait_for_selector('.city-pick', timeout=60000); pg.wait_for_timeout(2500)
            check(pg, screen, 'valle', shots, report)
            for sector in ['Calle de prueba', 'Ladera con quebrada', 'La Iguaná · El Pesebre']:
                pg.locator('.city-pick button', has_text=sector).first.evaluate('e => e.click()')
                pg.wait_for_selector('.city-simbar', timeout=90000); pg.wait_for_timeout(3500)
                pg.evaluate("() => { const b = document.querySelector('.city-coach button'); if (b) b.click(); }")
                tag = sector.split(' ')[0].lower()
                check(pg, screen, f'{tag}-general', shots, report)
                pg.evaluate("() => window.__cityDebug?.controller?.camera('calle')"); pg.wait_for_timeout(2000)
                check(pg, screen, f'{tag}-calle', shots, report)
                pg.evaluate("() => window.__cityDebug?.controller?.camera('general')"); pg.wait_for_timeout(1500)
                for v in ['peligro', 'resultados']:
                    pg.evaluate(f"() => window.__cityDebug?.controller?.setView('{v}')"); pg.wait_for_timeout(1200)
                    check(pg, screen, f'{tag}-{v}', shots, report)
                pg.evaluate("() => window.__cityDebug?.controller?.setView('realista')")
                if sector == 'Ladera con quebrada':
                    pg.evaluate("""() => { const c = window.__cityDebug.controller; c.update({ shared: { creek: { source: 'ejemplo', peakM3s: 120, timeToPeakMin: 3, startMin: 0, sedimentCv: 0.2 }, simMinutes: 20 } }); c.reset(); c.speed = 240; c.start(); c.setAmplify(5); }""")
                    pg.wait_for_timeout(25000)
                    check(pg, screen, 'ladera-creciente', shots, report)
                    pg.evaluate("() => window.__cityDebug.controller.setCinema(true)"); pg.wait_for_timeout(2500)
                    check(pg, screen, 'ladera-cine', shots, report)
                    pg.evaluate("() => { const c = window.__cityDebug.controller; c.setCinema(false); c.setAmplify(1); c.reset(); }")
                pg.evaluate("() => window.__cityDebug.controller.showValley()"); pg.wait_for_timeout(3500)
            # Calidad del agua: las cuatro partes (en el teléfono la escena queda arriba del panel: se vuelve arriba
            # antes de medir, para que se midan sus rótulos y tarjetas)
            mode(pg, 'Calidad del agua'); pg.wait_for_timeout(6000)
            top(pg); check(pg, screen, 'calidad-quebrada', shots, report)
            # datos reales: la pestaña Medellín y la medalla que gana elegir una quebrada
            pg.get_by_role('tab', name='Medellín', exact=True).last.click(); pg.wait_for_timeout(800)
            pg.locator('.q3-field select').first.select_option('Cabuyala'); pg.wait_for_timeout(1200)
            top(pg); check(pg, screen, 'calidad-medellin', shots, report)
            pg.get_by_role('tab', name='Del río a la llave').click(); pg.wait_for_timeout(3500)
            top(pg); check(pg, screen, 'calidad-planta', shots, report)
            # de la casa al río: vista general, el reactor de cerca (desde el panel) y el aguacero con el río
            pg.get_by_role('tab', name='De la casa al río').click(); pg.wait_for_timeout(4500)
            top(pg); check(pg, screen, 'calidad-ptar', shots, report)
            pg.evaluate("() => { const b = [...document.querySelectorAll('.q3-steps button')][4]; if (b) b.click(); }"); pg.wait_for_timeout(2500)
            top(pg); check(pg, screen, 'calidad-ptar-reactor', shots, report)
            pg.evaluate("() => { for (const t of ['Aguacero', 'Salida y río']) { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t); if (b) b.click(); } }"); pg.wait_for_timeout(2500)
            top(pg); check(pg, screen, 'calidad-ptar-aguacero', shots, report)
            pg.get_by_role('tab', name='La ciudad y la lluvia').click(); pg.wait_for_timeout(3500)
            top(pg); check(pg, screen, 'calidad-ciudad', shots, report)
            # Hidráulica de canales: las seis partes, la alcantarilla con el agua sobre la vía, el fondo del cauce
            # de sedimentos y la pestaña Diseño
            mode(pg, 'Hidráulica de canales'); pg.wait_for_timeout(4000)
            for part, tag in [('El canal y su caudal', 'canal'), ('La caída y el resalto', 'resalto'), ('El puente y el remanso', 'puente'),
                              ('Las alcantarillas', 'alcantarilla'), ('El transporte de sedimentos', 'sedimentos'), ('Medir el caudal', 'aforo'), ('Ondas y crecientes', 'ondas')]:
                pg.get_by_role('tab', name=part, exact=True).first.click(); pg.wait_for_timeout(3500)
                top(pg); check(pg, screen, f'canales-{tag}', shots, report)
                if tag == 'alcantarilla':
                    pg.evaluate(RANGE, ['Caudal de la creciente', '14']); pg.wait_for_timeout(2500)
                    top(pg); check(pg, screen, 'canales-alcantarilla-encima', shots, report)
                if tag == 'ondas':
                    pg.evaluate(BTN, 'Romper la presa'); pg.wait_for_timeout(4000)
                    top(pg); check(pg, screen, 'canales-ondas-presa', shots, report)
                    pg.evaluate(BTN, 'Creciente'); pg.wait_for_timeout(3500)
                    top(pg); check(pg, screen, 'canales-ondas-creciente', shots, report)
                if tag == 'sedimentos':
                    pg.evaluate(BTN, 'El fondo'); pg.wait_for_timeout(2500)
                    top(pg); check(pg, screen, 'canales-sedimentos-fondo', shots, report)
                    pg.get_by_role('tab', name='Diseño', exact=True).first.click(); pg.wait_for_timeout(1000)
                    top(pg); check(pg, screen, 'canales-diseno', shots, report)
            cuencas(pg, screen, shots, report)
            acueducto(pg, screen, shots, report)
            subterraneas(pg, screen, shots, report)
            presas(pg, screen, shots, report)
            laderas(pg, screen, shots, report)
            ctx.close()
          except Exception as e:
            report.append({'pantalla': screen, 'estado': 'recorrido interrumpido', 'error': str(e)[:300], 'choques': [{'a': 'error', 'sa': '', 'b': str(e)[:120], 'sb': '', 'area': 0, 'box': [0, 0, 0, 0]}], 'cortados': []})
            print(f'ERR [{screen}] recorrido interrumpido: {str(e)[:200]}')
        b.close()
    with open(f'{OUT}/informe.json', 'w') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    bad = [r for r in report if r['choques'] or r['cortados']]
    print(f'\n{len(report) - len(bad)} de {len(report)} estados sin choques ni cortes.')
    return 1 if bad else 0


if __name__ == '__main__':
    scr = list(SCREENS)
    args = sys.argv[1:]
    for i, a in enumerate(args):
        # acepta «--pantallas tableta,telefono» y «--pantallas=tableta,telefono»
        if a.startswith('--pantallas'):
            val = a.split('=', 1)[1] if '=' in a else (args[i + 1] if i + 1 < len(args) else '')
            pedidas = [x for x in val.split(',') if x]
            malas = [x for x in pedidas if x not in SCREENS]
            if malas:
                sys.exit(f'Pantallas desconocidas: {", ".join(malas)} (hay: {", ".join(SCREENS)})')
            scr = pedidas or scr
    sys.exit(run(scr, '--capturas' in sys.argv))
