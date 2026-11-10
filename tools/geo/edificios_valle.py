"""Frentes de edificios del Valle de Aburrá a lo largo de la red vial oficial, con alturas del catastro de Medellín.

Entradas (tools/geo/insumos/, descargadas sin modificar; URL y sha256 en el manifiesto):
  - valle-aburra/sentido-vial-*.geojson: red vial metropolitana (35 469 tramos, con jerarquía).
  - valle-aburra/rio-medellin-poligono, cerros-tutelares, aeropuerto-pista, equipamientos-referentes,
    barrios-veredas (Medellín) y area-metropolitana-municipios.
  - construcciones-medellin/huella-por-barrio-y-pisos-comuna-*.json: huella construida y número de
    construcciones del catastro de Medellín por barrio (o vereda) y número de pisos. Solo estadísticas.
  - src/city/render/aburraData.ts (generado por valle.py): tejido urbano, río D8 y quebradas.

Salida: src/city/render/edificiosData.ts (generado; no se edita a mano) y docs/medellin/edificios-informe.json.

Método (detalle en docs/medellin/DATOS_REALES.md §7.5):
  1. Corredores: cada tramo vial se dibuja en un ráster de 2,5 m con el ancho de su jerarquía (de 9 m en
     una calle local a 30 m en una autopista), más el cauce del río y su retiro, los retiros de las
     quebradas, los cerros tutelares, la pista del aeropuerto, el estadio y dos referentes.
  2. Frentes: a cada lado de cada tramo, después del andén, se buscan franjas edificables. La
     profundidad de cada franja es la mitad del espacio libre hasta el corredor de atrás (dos frentes
     comparten la manzana) y nunca más que la del tipo de tejido. Las vías principales se procesan
     primero y cada franja aceptada ocupa el ráster: ningún frente se monta sobre otro ni sobre una vía.
  3. Alturas: en Medellín cada barrio o vereda lleva la distribución real de su huella construida por
     número de pisos (catastro) y la fracción de sus frentes que está construida (huella real ÷ área de
     los frentes). En los otros nueve municipios la distribución es ilustrativa, por municipio.
  4. El navegador reparte los edificios dentro de cada franja con un azar fijo por franja.
"""

from __future__ import annotations

import base64
import glob
import json
import math
import re
import sys
import zlib
from pathlib import Path

import cv2
import numpy as np
import shapely
from shapely.geometry import shape

sys.path.insert(0, str(Path(__file__).resolve().parent))
import valle as V  # noqa: E402

RAIZ = V.RAIZ
INS = RAIZ / 'tools' / 'geo' / 'insumos'
DATA_TS = RAIZ / 'src' / 'city' / 'render' / 'aburraData.ts'
SALIDA = RAIZ / 'src' / 'city' / 'render' / 'edificiosData.ts'
INFORME = RAIZ / 'docs' / 'medellin' / 'edificios-informe.json'

RES = 2.5  # m por celda del ráster de ocupación
X0, Y0 = V.EXT['x0'] * 1000, V.EXT['y0'] * 1000
NX, NY = int((V.EXT['x1'] - V.EXT['x0']) * 1000 / RES), int((V.EXT['y1'] - V.EXT['y0']) * 1000 / RES)
SUB = 4  # bits fraccionarios para cv2 (precisión de 1/16 de celda)

# semiancho del corredor [m] por jerarquía operativa (1 autopista … 5 local; 6–99 servicio, interveredal, peatonal)
HALF = {1: 15.0, 2: 10.5, 3: 8.5, 4: 7.0, 5: 5.0, 6: 5.0, 7: 4.0, 8: 3.5, 99: 3.5, None: 4.5}
ANDEN = 2.0  # m entre el borde del corredor y la fachada
# profundidad máxima de una franja por tejido [m] (0 nada · 1 ladera · 2 plano · 3 centro · 4 El Poblado · 5 industria · 6 municipios)
DEPTH_MAX = {0: 10.0, 1: 22.0, 2: 26.0, 3: 30.0, 4: 34.0, 5: 50.0, 6: 24.0}
DEPTH_MIN = 5.0
STEP = 4.0  # m entre estaciones a lo largo del frente
# cos(2πa/128) × 4096 redondeado (la misma tabla está en src/city/render/edificios.ts); sen(x) = cos(x − π/2)
COS4096 = [int(math.floor(math.cos(a / 128 * 2 * math.pi) * 4096 + 0.5)) for a in range(128)]

# rangos de pisos de los grupos guardados (el navegador sortea dentro del grupo)
BINS = [(1, 1), (2, 2), (3, 3), (4, 4), (5, 5), (6, 8), (9, 12), (13, 18), (19, 25), (26, 45)]
# distribución ILUSTRATIVA de la huella por grupo de pisos fuera de Medellín (%): sin datos de catastro
MUNI = {
    'Envigado': [5, 18, 18, 14, 10, 9, 9, 10, 6, 1],
    'Sabaneta': [4, 14, 15, 12, 9, 9, 10, 14, 11, 2],
    'Itagüí': [15, 30, 25, 12, 6, 5, 4, 3, 0, 0],
    'Bello': [12, 33, 27, 12, 5, 4, 4, 3, 0, 0],
    'La Estrella': [18, 36, 24, 9, 4, 4, 3, 2, 0, 0],
    'Caldas': [22, 40, 24, 8, 3, 2, 1, 0, 0, 0],
    'Copacabana': [20, 38, 25, 9, 4, 2, 2, 0, 0, 0],
    'Girardota': [24, 40, 22, 8, 3, 2, 1, 0, 0, 0],
    'Barbosa': [28, 42, 20, 6, 2, 1, 1, 0, 0, 0],
}
FILL_MUNI = 0.62  # fracción construida de los frentes fuera de Medellín (ilustrativa; cercana a la mediana de Medellín)


# --------------------------------------------------------------------------- datos de aburraData.ts
def leer_aburra():
    s = DATA_TS.read_text(encoding='utf-8')

    def J(name):
        m = re.search(r'export const %s = (.*?)(?: as const)?;\n' % name, s)
        return json.loads(m.group(1))

    blob = zlib.decompress(base64.b64decode(re.search(r"export const BLOQUE = '([^']+)'", s).group(1)))
    sec = J('SECCIONES')

    def sl(n):
        o, l_ = sec[n]
        return blob[o:o + l_]

    def varints(b):
        out, v, sh = [], 0, 0
        for c in b:
            v |= (c & 0x7f) << sh
            sh += 7
            if not c & 0x80:
                out.append(v)
                v, sh = 0, 0
        return out

    unz = lambda u: u >> 1 if not u & 1 else -((u + 1) >> 1)  # noqa: E731

    def rle(b, n):
        out, k = [], 0
        while k < len(b):
            v = b[k]
            k += 1
            r = sh = 0
            while True:
                c = b[k]
                k += 1
                r |= (c & 0x7f) << sh
                sh += 7
                if not c & 0x80:
                    break
            out += [v] * r
        a = np.array(out, np.uint8)
        assert len(a) == n
        return a

    def lines(b, counts):
        u = [unz(x) for x in varints(b)]
        k, res = 0, []
        for c in counts:
            px = py = 0
            pts = []
            for _ in range(c):
                px += u[k]
                py += u[k + 1]
                k += 2
                pts.append((px, py))  # m
            res.append(np.array(pts, float))
        return res

    R = J('RELIEVE')
    nx, ny = R['nx'], R['ny']
    fab = rle(sl('tejido'), nx * ny).reshape(ny, nx)
    Q = J('QUEBRADAS')
    qs = lines(sl('quebradas'), [q['c'] for q in Q])
    rio = np.array(J('RIO'))[:, :2] * 1000
    return {'R': R, 'fab': fab, 'Q': Q, 'qs': qs, 'rio': rio, 'cerros': J('CERROS'), 'ref': J('REFERENTES')}


# --------------------------------------------------------------------------- ráster
def px(xy):
    """m locales → coordenadas de cv2 con SUB bits fraccionarios (fila 0 = sur)."""
    xy = np.asarray(xy, float)
    c = np.empty_like(xy)
    c[..., 0] = (xy[..., 0] - X0) / RES
    c[..., 1] = (xy[..., 1] - Y0) / RES
    return np.round(c * (1 << SUB)).astype(np.int32)


def poly_m(g):
    """Geometría en km (shapely) → lista de anillos en m."""
    out = []
    gs = list(g.geoms) if hasattr(g, 'geoms') else [g]
    for p in gs:
        if p.is_empty:
            continue
        out.append(np.asarray(p.exterior.coords) * 1000)
    return out


def fill_polys(img, rings, val=1):
    if rings:
        cv2.fillPoly(img, [px(r) for r in rings], val, lineType=cv2.LINE_8, shift=SUB)


def draw_line(img, pts_m, half_m, val=1):
    t = max(1, int(round(2 * half_m / RES)))
    cv2.polylines(img, [px(pts_m)], False, val, thickness=t, lineType=cv2.LINE_8, shift=SUB)


def sample(img, x, y):
    i = ((np.asarray(x) - X0) / RES).astype(np.int64)
    j = ((np.asarray(y) - Y0) / RES).astype(np.int64)
    ok = (i >= 0) & (i < NX) & (j >= 0) & (j < NY)
    out = np.ones(i.shape, np.uint8)
    out[ok] = img[j[ok], i[ok]]
    return out


def merge_runs(rs: list[tuple]) -> list[tuple]:
    """Une franjas seguidas del mismo lado de una calle curva (separadas por menos de 4 m, con menos de 20°
    de giro y profundidad parecida) en una sola, por la cuerda: menos datos y frentes más largos."""
    out: list[tuple] = []
    for side in (1.0, -1.0):
        cur = None
        for r in sorted((r for r in rs if r[6] == side), key=lambda r: r[7]):
            if cur is not None:
                ex = cur[0] + cur[3] * math.cos(cur[2])
                ey = cur[1] + cur[3] * math.sin(cur[2])
                gap = math.hypot(r[0] - ex, r[1] - ey)
                dang = abs((r[2] - cur[2] + math.pi) % (2 * math.pi) - math.pi)
                if gap < 4.0 and dang < math.radians(20) and min(r[4], cur[4]) >= 0.7 * max(r[4], cur[4]):
                    nx_ = r[0] + r[3] * math.cos(r[2])
                    ny_ = r[1] + r[3] * math.sin(r[2])
                    L = math.hypot(nx_ - cur[0], ny_ - cur[1])
                    cur = (cur[0], cur[1], math.atan2(ny_ - cur[1], nx_ - cur[0]), L, min(cur[4], r[4]), cur[5], side, cur[7])
                    continue
                out.append(cur)
            cur = r
        if cur is not None:
            out.append(cur)
    return out


# --------------------------------------------------------------------------- principal
def main() -> int:
    rep: dict = {}
    A = leer_aburra()
    R = A['R']

    def fab_at(x, y):
        i = np.clip(np.round((np.asarray(x) / 1000 - R['x0']) / R['st']).astype(int), 0, R['nx'] - 1)
        j = np.clip(np.round((np.asarray(y) / 1000 - R['y0']) / R['st']).astype(int), 0, R['ny'] - 1)
        b = A['fab'][j, i]
        return b >> 4, (b & 15) / 15.0

    # vías
    segs = []
    for f in sorted(glob.glob(str(INS / 'valle-aburra' / 'sentido-vial-[0-9]*.geojson'))):
        for ft in json.loads(Path(f).read_text(encoding='utf-8'))['features']:
            g = ft['geometry']
            if not g:
                continue
            jer = ft['properties'].get('jerarquia_op')
            parts = [g['coordinates']] if g['type'] == 'LineString' else g['coordinates']
            for c in parts:
                c = np.asarray(c, float)
                if len(c) < 2:
                    continue
                x, y = V.to_km(c[:, 0], c[:, 1])
                pts = np.column_stack([x, y]) * 1000
                ls = shapely.simplify(shapely.linestrings(pts), 2.0)
                pts = shapely.get_coordinates(ls)
                if len(pts) >= 2:
                    segs.append((jer, pts))
    rep['tramos'] = len(segs)

    # ráster estático: corredores viales y zonas sin edificios
    S = np.zeros((NY, NX), np.uint8)
    for jer, pts in segs:
        draw_line(S, pts, HALF.get(jer, 4.5) + 0.5)
    rio_pol = V.geom_km(shapely.union_all([shape(f['geometry']) for f in V.gj('rio-medellin-poligono.geojson')]))
    fill_polys(S, poly_m(rio_pol.buffer(0.02)))
    draw_line(S, A['rio'], 45.0)  # eje del río (D8) con su retiro, también fuera de Medellín
    for q, pts in zip(A['Q'], A['qs']):
        draw_line(S, pts, {1: 6.0, 2: 10.0, 3: 14.0}.get(q['o'], 18.0))
    for f in V.gj('cerros-tutelares.geojson'):
        fill_polys(S, poly_m(V.geom_km(shape(f['geometry'])).buffer(-0.03)))
    for c in A['cerros']:
        if c['tutelar']:
            cv2.circle(S, tuple(int(v) for v in px([c['x'] * 1000, c['y'] * 1000])), int(c['r'] * 1000 * 0.55 / RES * (1 << SUB)), 1, -1, cv2.LINE_8, SUB)
    for f in V.gj('aeropuerto-pista.geojson'):
        fill_polys(S, poly_m(V.geom_km(shape(f['geometry'])).buffer(0.12)))
    for f in V.gj('equipamientos-referentes.geojson'):
        if 'Atanasio' in (f['properties'].get('nombre') or ''):
            fill_polys(S, poly_m(V.geom_km(shape(f['geometry'])).buffer(-0.01)))
    for key, r in (('coltejer', 70.0), ('bibliotecaEspana', 60.0)):
        x, y = A['ref'][key]
        cv2.circle(S, tuple(int(v) for v in px([x * 1000, y * 1000])), int(r / RES * (1 << SUB)), 1, -1, cv2.LINE_8, SUB)
    rep['rasterOcupado'] = round(float(S.mean()), 4)

    # ráster dinámico: franjas ya aceptadas
    D = np.zeros((NY, NX), np.uint8)

    # orden: vías principales primero (toman las esquinas), luego las más largas
    order = sorted(range(len(segs)), key=lambda k: (segs[k][0] if segs[k][0] in (1, 2, 3, 4, 5) else 6, -shapely.length(shapely.linestrings(segs[k][1]))))
    marches = np.arange(1.25, 2 * 45.0 + 0.1, RES)  # distancias a lo largo de la normal
    runs = []
    for k in order:
        jer, pts = segs[k]
        mine: list[tuple] = []
        hw = HALF.get(jer, 4.5) + ANDEN
        cum0 = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
        total = float(cum0[-1])
        for pi_, (a, b) in enumerate(zip(pts[:-1], pts[1:])):
            d = b - a
            L = float(np.hypot(*d))
            cum = float(cum0[pi_])
            if L < 8.0:
                continue
            u = d / L
            ns = max(1, int((L - 2.0) // STEP))
            s = (np.arange(ns) + 0.5) * (L / ns)
            for side in (1.0, -1.0):
                nrm = side * np.array([-u[1], u[0]])
                front = a[None, :] + s[:, None] * u[None, :] + hw * nrm[None, :]
                ftype, fk = fab_at(front[:, 0] + nrm[0] * 6, front[:, 1] + nrm[1] * 6)
                dmax = np.array([DEPTH_MAX[int(t)] for t in ftype])
                # espacio libre hacia atrás (rayos en el centro y a ±1,5 m de cada estación)
                avail = np.full(ns, 2 * 45.0)
                dyn = np.full(ns, 2 * 45.0)
                for off in (-1.5, 0.0, 1.5):
                    base = front + off * u[None, :]
                    P = base[:, None, :] + marches[None, :, None] * nrm[None, None, :]
                    hs = sample(S, P[..., 0], P[..., 1]).astype(bool)
                    hd = sample(D, P[..., 0], P[..., 1]).astype(bool)
                    first_s = np.where(hs.any(1), marches[np.argmax(hs, 1)], 2 * 45.0)
                    first_d = np.where(hd.any(1), marches[np.argmax(hd, 1)], 2 * 45.0)
                    avail = np.minimum(avail, first_s)
                    dyn = np.minimum(dyn, first_d)
                depth = np.minimum(np.minimum(dmax, avail / 2 - 0.5), dyn - 1.0)
                f0 = sample(S, front[:, 0], front[:, 1]) | sample(D, front[:, 0], front[:, 1])
                ok = (f0 == 0) & (depth >= DEPTH_MIN)
                # franjas: estaciones válidas seguidas con profundidad parecida
                i = 0
                while i < ns:
                    if not ok[i]:
                        i += 1
                        continue
                    j = i
                    dcur = depth[i]
                    while j + 1 < ns and ok[j + 1] and depth[j + 1] >= 0.75 * dcur and not (depth[j + 1] > 1.5 * dcur and (j - i + 1) * STEP >= 12):
                        j += 1
                        dcur = min(dcur, depth[j])
                    s0 = max(0.0, s[i] - L / ns / 2)
                    s1 = min(L, s[j] + L / ns / 2)
                    if s1 - s0 >= 6.0:
                        p0 = a + s0 * u + hw * nrm
                        p1 = a + s1 * u + hw * nrm
                        dd = float(math.floor(dcur))
                        # ocupa el ráster (la franja completa hasta su profundidad)
                        ring = np.array([p0, p1, p1 + dd * nrm, p0 + dd * nrm])
                        fill_polys(D, [ring])
                        # dirección con los edificios a la izquierda
                        dirv = (p1 - p0) if side > 0 else (p0 - p1)
                        start = p0 if side > 0 else p1
                        # tramo, lado y posición a lo largo del tramo: sirven para ordenar la codificación
                        mine.append((start[0], start[1], math.atan2(dirv[1], dirv[0]), s1 - s0, dd, k, side, (cum + s0) if side > 0 else (total - cum - s1)))
                    i = j + 1
        runs.extend(merge_runs(mine))
    rep['franjas'] = len(runs)
    rp = np.array(runs, float)
    rep['frenteKm'] = round(float(rp[:, 3].sum() / 1000), 1)

    # zonas: barrios y veredas de Medellín (con catastro) y los otros municipios (ilustrativo)
    mid = rp[:, :2] + (rp[:, 3:4] / 2) * np.column_stack([np.cos(rp[:, 2]), np.sin(rp[:, 2])]) + (rp[:, 4:5] / 2) * np.column_stack([-np.sin(rp[:, 2]), np.cos(rp[:, 2])])
    zone = np.full(len(rp), -1, np.int64)
    zonas: list[dict] = []
    hist = {}
    for f in glob.glob(str(INS / 'construcciones-medellin' / 'huella-por-barrio-y-pisos-comuna-*.json')):
        for ft in json.loads(Path(f).read_text(encoding='utf-8'))['features']:
            at = ft['attributes']
            code, pisos = at['expr1'], at['numero_pisos']
            if not code or not pisos or pisos < 1:
                continue
            b = next(i for i, (lo, hi) in enumerate(BINS) if lo <= pisos <= hi) if pisos <= BINS[-1][1] else len(BINS) - 1
            hist.setdefault(code, np.zeros(len(BINS)))[b] += at['huella'] or 0.0
    bar = V.gj('barrios-veredas.geojson')
    bar_geo = [V.geom_km(shape(f['geometry'])) for f in bar]
    for f, g in zip(bar, bar_geo):
        m = shapely.contains_xy(g, mid[:, 0] / 1000, mid[:, 1] / 1000) & (zone < 0)
        code = f['properties']['codigo']
        h = hist.get(code)
        if h is None or h.sum() <= 0:
            continue
        zi = len(zonas)
        zone[m] = zi
        env = float((rp[m, 3] * rp[m, 4]).sum())
        real = float(h.sum())
        zonas.append({'code': code, 'nombre': f['properties']['nombre'], 'h': h, 'huella': real, 'frentes': env, 'fill': float(np.clip(real / max(env * 0.85, 1), 0.12, 1.0)), 'fuente': 'catastro'})
    for f in V.gj('area-metropolitana-municipios.geojson'):
        nm = f['properties']['nombre']
        g = V.geom_km(shape(f['geometry']))
        m = shapely.contains_xy(g, mid[:, 0] / 1000, mid[:, 1] / 1000) & (zone < 0)
        if not m.any():
            continue
        pct = MUNI.get(nm, MUNI['Caldas'])
        zi = len(zonas)
        zone[m] = zi
        zonas.append({'code': nm, 'nombre': nm, 'h': np.array(pct, float), 'huella': None, 'frentes': float((rp[m, 3] * rp[m, 4]).sum()), 'fill': FILL_MUNI, 'fuente': 'ilustrativa'})
    keep = zone >= 0
    rp, zone = rp[keep], zone[keep]
    rep['franjasConZona'] = int(keep.sum())

    # orden de codificación: tramos en orden espacial (Morton a 64 m de su primera franja); dentro de cada
    # tramo, el lado izquierdo de principio a fin y luego el derecho de vuelta. Así cada franja empieza cerca
    # de donde terminó la anterior y casi siempre con el mismo ángulo.
    def morton(ix, iy):
        r = 0
        for b_ in range(16):
            r |= ((ix >> b_) & 1) << (2 * b_) | ((iy >> b_) & 1) << (2 * b_ + 1)
        return r
    seg_first: dict[int, tuple[float, float]] = {}
    for r_ in rp:
        seg_first.setdefault(int(r_[5]), (r_[0], r_[1]))
    seg_key = {k_: morton(int((x - X0) / 64), int((y - Y0) / 64)) for k_, (x, y) in seg_first.items()}
    srt = sorted(range(len(rp)), key=lambda i: (seg_key[int(rp[i, 5])], int(rp[i, 5]), -rp[i, 6], rp[i, 7]))
    rp, zone = rp[srt], zone[srt]

    # codificación en flujos separados (comprimen mejor): dx, dy desde el final de la franja anterior [2 m],
    # cambio de ángulo (1/128 de vuelta), largo [2 m], profundidad [2 m] y zona (diferencias, zigzag, LEB128)
    QP = 2.0
    fl = [bytearray() for _ in range(6)]
    ex, ey, pa, pz = 0, 0, 0, 0
    for (x, y, ang, L, dd, *_), z in zip(rp, zone):
        xi, yi = int(round(x / QP)), int(round(y / QP))
        ai = int(round((ang % (2 * math.pi)) / (2 * math.pi) * 128)) & 127
        Li = max(3, int(round(L / QP)))
        V.varint(V.zig(xi - ex), fl[0])
        V.varint(V.zig(yi - ey), fl[1])
        da = ((ai - pa + 64) % 128) - 64
        V.varint(V.zig(da), fl[2])
        V.varint(Li, fl[3])
        fl[4].append(min(127, int(dd // 2)))
        V.varint(V.zig(int(z) - pz), fl[5])
        # final de esta franja (en las mismas unidades), punto de partida de la siguiente; con enteros y una
        # tabla de cosenos redondeados para que el navegador llegue exactamente al mismo punto
        ex = xi + ((Li * COS4096[ai] + 2048) >> 12)
        ey = yi + ((Li * COS4096[(ai - 32) % 128] + 2048) >> 12)
        pa, pz = ai, int(z)
    # comprobación: decodificar como lo hará el navegador y comparar con lo codificado (en unidades de 2 m)
    def rd(b_, signed):
        o, v, sh = [], 0, 0
        for c in b_:
            v |= (c & 0x7f) << sh
            sh += 7
            if not c & 0x80:
                o.append((v >> 1 if not v & 1 else -((v + 1) >> 1)) if signed else v)
                v, sh = 0, 0
        return o
    ddx, ddy, dda, dL = rd(fl[0], True), rd(fl[1], True), rd(fl[2], True), rd(fl[3], False)
    ex_, ey_, a_, err = 0, 0, 0, 0
    for i, (x, y, *_r) in enumerate(rp):
        xq, yq = ex_ + ddx[i], ey_ + ddy[i]
        a_ = (a_ + dda[i]) % 128
        err = max(err, abs(xq - int(round(x / QP))), abs(yq - int(round(y / QP))))
        ex_ = xq + ((dL[i] * COS4096[a_] + 2048) >> 12)
        ey_ = yq + ((dL[i] * COS4096[(a_ - 32) % 128] + 2048) >> 12)
    rep['verificacionDecodificacion'] = {'errorMaximoUnidades': int(err), 'nota': 'posición decodificada frente a la codificada; 0 = exacta'}
    assert err == 0, err
    out = bytearray()
    lens = [len(f_) for f_ in fl]
    for f_ in fl:
        out += f_
    zc = zlib.compress(bytes(out), 9)
    rep['datos'] = {'bytes': len(out), 'comprimidos': len(zc), 'flujos': lens}

    # tabla de zonas: % de huella por grupo de pisos (0–100, enteros) y fracción construida (0–100)
    ztab = []
    for zd in zonas:
        h = zd['h'] / zd['h'].sum() * 100
        ztab.append([[int(round(v)) for v in h], int(round(zd['fill'] * 100))])
    med = [zd for zd in zonas if zd['fuente'] == 'catastro']
    tot_h = sum(zd['huella'] for zd in med)
    hall = sum(zd['h'] for zd in med)
    rep['medellin'] = {
        'barriosYVeredas': len(med),
        'huellaHa': round(tot_h / 1e4, 1),
        'pctHuellaPorPisos': {f'{lo}-{hi}' if lo != hi else str(lo): round(float(v / hall.sum() * 100), 2) for (lo, hi), v in zip(BINS, hall)},
        'fraccionConstruidaMediana': round(float(np.median([zd['fill'] for zd in med])), 2),
        'areaFrentesHa': round(sum(zd['frentes'] for zd in med) / 1e4, 1),
        'barriosConFrentesInsuficientes': int(sum(1 for zd in med if zd['huella'] > zd['frentes'] * 0.85)),
    }
    rep['zonas'] = len(zonas)

    meta = {'generador': 'tools/geo/edificios_valle.py', 'fuente': 'Red vial metropolitana (AMVA) y catastro de Medellín (CartografiaBase, capa 15): huella por barrio y número de pisos. Fuera de Medellín, alturas ilustrativas.', 'grupos': BINS}
    jn = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))  # noqa: E731
    ts = [
        '// GENERADO por tools/geo/edificios_valle.py (red vial del AMVA y catastro de Medellín). No editar a mano.',
        '/* eslint-disable */',
        f'export const EDIFICIOS_META = {jn(meta)};',
        f'export const EDIFICIOS_INFORME = {jn(rep)};',
        '/** Zonas: [% de la huella por grupo de pisos, % de los frentes construido]; nombre y fuente aparte. */',
        f"export const ZONAS = {jn(ztab)};",
        f"export const ZONAS_NOMBRE = {jn([[zd['nombre'], 1 if zd['fuente'] == 'catastro' else 0] for zd in zonas])};",
        f'export const N_FRANJAS = {len(rp)};',
        f"export const FLUJOS = {jn(rep['datos']['flujos'])};",
        '/** Franjas en seis flujos seguidos: dx, dy desde el final de la anterior [2 m], cambio de ángulo [1/128 de vuelta],',
        ' *  largo [2 m] (zigzag y LEB128 salvo el largo), profundidad [2 m] (un byte) y zona (diferencia, zigzag). */',
        f"export const FRANJAS = '{base64.b64encode(zc).decode()}';",
    ]
    SALIDA.write_text('\n'.join(ts) + '\n', encoding='utf-8')
    INFORME.write_text(json.dumps(rep, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps(rep, ensure_ascii=False, indent=1)[:2500], file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
