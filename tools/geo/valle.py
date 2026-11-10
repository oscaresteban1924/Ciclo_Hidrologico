#!/usr/bin/env python3
"""Valle de Aburrá con datos oficiales para la vista de orientación (escala de ciudad).

Entradas (tools/geo/insumos/valle-aburra/, descargadas sin modificar; URL y sha256 en el manifiesto):
  · valle-dem-amva-25m-ampliado.tif — modelo de elevación del AMVA (10 m) exportado a 25 m, EPSG:9377;
  · valle-dem-amva-400m.tif — el mismo modelo a 400 m en todo su recuadro (horizonte);
  · red-hidrica.geojson, rio-medellin-poligono.geojson — drenajes oficiales de Medellín (POT);
  · sentido-vial-NN.geojson — red vial del área metropolitana (35 469 tramos, con jerarquía);
  · transporte-masivo-lineas/estaciones.geojson — metro, tranvía, metrocables y Metroplús;
  · area-metropolitana-municipios.geojson, comunas-corregimientos.geojson, barrios-veredas.geojson;
  · cerros-tutelares.geojson, toponimia-cerros.geojson, equipamientos-referentes.geojson,
    aeropuerto-pista.geojson, toponimia-coltejer.geojson.

Salida: src/city/render/aburraData.ts (generado; no se edita a mano) y un informe de verificación.

Método (resumen; detalle en docs/medellin/DATOS_REALES.md §7):
  1. Relieve: el MDE de 25 m se filtra (gaussiana de 40 m) y se muestrea cada 100 m en las coordenadas del
     esquema (km desde La Alpujarra). Fuera del área del AMVA no hay datos: se rellena con una superficie
     suave que desciende desde el borde (ilustrativa, marcada como tal).
  2. Río y quebradas: D8 sobre el MDE de 25 m con relleno de depresiones (Barnes et al., 2014) y quemado de
     los drenajes oficiales de Medellín (río −5 m, quebradas −2 m) para que los cauces entubados sigan su
     trazado oficial. El río entra por el sur con el área de su cuenca alta (D8 sobre el MDE de 400 m).
     Se dibujan los cauces de más de 0,8 km² de cuenca; los nombres salen de la red hídrica oficial.
  3. Ciudad: la densidad de calles (m de vía por hectárea) de la red vial metropolitana define dónde hay
     ciudad y con qué intensidad; el tipo de tejido es ilustrativo (comuna, pendiente y municipio).
  4. Transporte: trazados y estaciones oficiales de las líneas existentes (estado 1); se excluyen las
     líneas en ejecución o en estudio (corredor de la 80).
"""

from __future__ import annotations

import base64
import zlib
import hashlib
import heapq
import json
import math
import sys
from pathlib import Path

import numpy as np
import pyproj
import tifffile
from scipy import ndimage
import shapely
from shapely.geometry import LineString, MultiLineString, Point, Polygon, shape
from shapely.ops import linemerge, unary_union

RAIZ = Path(__file__).resolve().parents[2]
INS = RAIZ / 'tools' / 'geo' / 'insumos' / 'valle-aburra'
MANIF = RAIZ / 'tools' / 'geo' / 'insumos' / 'manifiesto.json'
SALIDA = RAIZ / 'src' / 'city' / 'render' / 'aburraData.ts'
INFORME = RAIZ / 'docs' / 'medellin' / 'valle-informe.json'

# --------------------------------------------------------------------------- esquema (igual que aburra.ts)
LON0, LAT0 = -75.5736, 6.2442
KX = 111.32 * math.cos(math.radians(LAT0))
KY = 110.57
EXT = dict(x0=-15.0, x1=10.0, y0=-18.5, y1=12.0)
ST = 0.1  # km
OUT = dict(x0=-44.8, y0=-49.6, st=0.8, nx=113, ny=119)
A_MIN_KM2 = 0.8  # cuenca mínima de los cauces dibujados

G2C = pyproj.Transformer.from_crs(4326, 9377, always_xy=True)
C2G = pyproj.Transformer.from_crs(9377, 4326, always_xy=True)


def to_km(lon, lat):
    return (np.asarray(lon) - LON0) * KX, (np.asarray(lat) - LAT0) * KY


def km_to_ll(x, y):
    return LON0 + np.asarray(x) / KX, LAT0 + np.asarray(y) / KY


def km_to_c(x, y):
    lo, la = km_to_ll(x, y)
    return G2C.transform(lo, la)


def c_to_km(X, Y):
    lo, la = C2G.transform(X, Y)
    return to_km(lo, la)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def gj(name: str) -> list[dict]:
    return json.loads((INS / name).read_text(encoding='utf-8'))['features']


# --------------------------------------------------------------------------- ráster
class Raster:
    def __init__(self, path: Path):
        with tifffile.TiffFile(path) as t:
            pg = t.pages[0]
            a = pg.asarray().astype(np.float64)
            tags = {k.name: k.value for k in pg.tags.values()}
        self.dx = float(tags['ModelPixelScaleTag'][0])
        self.dy = float(tags['ModelPixelScaleTag'][1])
        self.X0 = float(tags['ModelTiepointTag'][3])
        self.Ytop = float(tags['ModelTiepointTag'][4])
        self.valid = np.isfinite(a) & (a > 500)
        self.z = np.where(self.valid, a, 0.0)
        self.ny, self.nx = a.shape

    def pix(self, X, Y):
        return (np.asarray(X) - self.X0) / self.dx - 0.5, (self.Ytop - np.asarray(Y)) / self.dy - 0.5

    def center(self, i, j):
        return self.X0 + (np.asarray(i) + 0.5) * self.dx, self.Ytop - (np.asarray(j) + 0.5) * self.dy

    def sample(self, X, Y, sigma_px: float = 0.0):
        """Bilineal con normalización por los datos válidos (los sin dato no contaminan)."""
        zm, m = self.z * self.valid, self.valid.astype(np.float64)
        if sigma_px > 0:
            zm, m = ndimage.gaussian_filter(zm, sigma_px, mode='nearest'), ndimage.gaussian_filter(m, sigma_px, mode='nearest')
        fi, fj = self.pix(X, Y)
        i0, j0 = np.floor(fi).astype(int), np.floor(fj).astype(int)
        u, v = fi - i0, fj - j0
        out_z = np.zeros(np.shape(fi))
        out_w = np.zeros(np.shape(fi))
        for di, dj, w in ((0, 0, (1 - u) * (1 - v)), (1, 0, u * (1 - v)), (0, 1, (1 - u) * v), (1, 1, u * v)):
            ii, jj = np.clip(i0 + di, 0, self.nx - 1), np.clip(j0 + dj, 0, self.ny - 1)
            inside = (i0 + di >= 0) & (i0 + di < self.nx) & (j0 + dj >= 0) & (j0 + dj < self.ny)
            out_z += np.where(inside, zm[jj, ii] * w, 0)
            out_w += np.where(inside, m[jj, ii] * w, 0)
        ok = out_w > 0.5
        return np.where(ok, out_z / np.maximum(out_w, 1e-9), np.nan), ok


# --------------------------------------------------------------------------- relleno ilustrativo
def vnoise(x, y, seed=7):
    """Ruido de valor determinista (0–1) en coordenadas continuas."""
    def h(i, j):
        s = np.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453
        return s - np.floor(s)
    i, j = np.floor(x), np.floor(y)
    fx, fy = x - i, y - j
    ux, uy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy


def relax(z, known, iters=3000):
    """Relleno armónico (Laplace) de las celdas sin dato con los datos como borde fijo."""
    z = z.copy()
    if known.all():
        return z
    z[~known] = np.nanmean(z[known])
    for _ in range(iters):
        p = np.pad(z, 1, mode='edge')
        avg = 0.25 * (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:])
        z[~known] = avg[~known]
    return z


def fill_outer(z, known, xs, ys, st):
    z = relax(z, known, 4000)
    d = ndimage.distance_transform_edt(~known) * st  # km hasta el dato más cercano
    X, Y = np.meshgrid(xs, ys)
    n = 0.6 * vnoise(X * 0.22, Y * 0.22) + 0.4 * vnoise(X * 0.55 + 3.1, Y * 0.55 - 1.7)
    z = z - np.minimum(600.0, 35.0 * d) * (~known) + np.minimum(260.0, 45.0 * d) * (n - 0.45) * (~known)
    return z


# --------------------------------------------------------------------------- codificación compacta
def zig(v: int) -> int:
    return v * 2 if v >= 0 else -v * 2 - 1


def varint(v: int, out: bytearray):
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def enc_grid(q: np.ndarray) -> bytes:
    """Entero por celda; predictor a + b − c (izquierda, abajo, diagonal); zigzag + LEB128; base64."""
    ny, nx = q.shape
    out = bytearray()
    for j in range(ny):
        for i in range(nx):
            if j == 0 and i == 0:
                p = 0
            elif j == 0:
                p = q[j, i - 1]
            elif i == 0:
                p = q[j - 1, i]
            else:
                p = q[j, i - 1] + q[j - 1, i] - q[j - 1, i - 1]
            varint(zig(int(q[j, i] - p)), out)
    return bytes(out)


def enc_rle(vals: np.ndarray) -> bytes:
    """Bytes repetidos: (valor, largo) con largo en LEB128; base64."""
    v = vals.ravel()
    out = bytearray()
    k = 0
    while k < len(v):
        r = 1
        while k + r < len(v) and v[k + r] == v[k]:
            r += 1
        out.append(int(v[k]))
        varint(r, out)
        k += r
    return bytes(out)


def enc_line(pts) -> bytes:
    """Polilínea en km → metros enteros, diferencias zigzag + LEB128; base64."""
    out = bytearray()
    px = py = 0
    for x, y in pts:
        X, Y = int(round(x * 1000)), int(round(y * 1000))
        varint(zig(X - px), out)
        varint(zig(Y - py), out)
        px, py = X, Y
    return bytes(out)


# --------------------------------------------------------------------------- geometría
def chaikin(pts, n=2):
    p = np.asarray(pts, dtype=float)
    for _ in range(n):
        if len(p) < 3:
            break
        q = [p[0]]
        for a, b in zip(p[:-1], p[1:]):
            q.append(0.75 * a + 0.25 * b)
            q.append(0.25 * a + 0.75 * b)
        q.append(p[-1])
        p = np.asarray(q)
    return p


def simplify(pts, tol_km):
    if len(pts) < 3:
        return [tuple(map(float, p)) for p in pts]
    return [tuple(c) for c in LineString(pts).simplify(tol_km, preserve_topology=False).coords]


def geom_km(g):
    return shapely.transform(g, lambda c: np.column_stack(to_km(c[:, 0], c[:, 1])))


# --------------------------------------------------------------------------- 1. relieve
def build_relief(rep: dict):
    dem = Raster(INS / 'valle-dem-amva-25m-ampliado.tif')
    xs = np.round(np.arange(EXT['x0'], EXT['x1'] + 1e-9, ST), 6)
    ys = np.round(np.arange(EXT['y0'], EXT['y1'] + 1e-9, ST), 6)
    X, Y = np.meshgrid(xs, ys)
    CX, CY = km_to_c(X, Y)
    z100, ok100 = dem.sample(CX, CY, sigma_px=1.6)
    rep['relieve'] = {'malla': f'{len(xs)} × {len(ys)} nodos cada {int(ST * 1000)} m', 'conDatos': round(float(ok100.mean()), 4)}

    # horizonte a 800 m
    d400 = Raster(INS / 'valle-dem-amva-400m.tif')
    xo = OUT['x0'] + np.arange(OUT['nx']) * OUT['st']
    yo = OUT['y0'] + np.arange(OUT['ny']) * OUT['st']
    XO, YO = np.meshgrid(xo, yo)
    zo, oko = d400.sample(*km_to_c(XO, YO))
    # dentro del recuadro detallado: el MDE de 25 m suavizado a la escala de 800 m
    ins = (XO >= EXT['x0']) & (XO <= EXT['x1']) & (YO >= EXT['y0']) & (YO <= EXT['y1'])
    zs, oks = dem.sample(*km_to_c(XO, YO), sigma_px=12)
    zo = np.where(ins & oks, zs, zo)
    oko = np.where(ins, oks, oko)
    zo_f = fill_outer(np.where(oko, zo, 0.0), oko, xo, yo, OUT['st'])

    # relleno del recuadro detallado: base = horizonte interpolado + residuo armónico
    def interp_outer(xq, yq):
        fi, fj = (xq - OUT['x0']) / OUT['st'], (yq - OUT['y0']) / OUT['st']
        return ndimage.map_coordinates(zo_f, [fj, fi], order=3, mode='nearest')
    base = interp_outer(X, Y)
    res = np.where(ok100, z100 - base, 0.0)
    res = relax(res, ok100, 1500)
    if (~ok100).any():
        # el residuo se apaga lejos del dato (el relleno sigue al horizonte)
        dd = ndimage.distance_transform_edt(~ok100) * ST
        res = np.where(ok100, res, res * np.exp(-dd / 1.2))
    zf = base + res
    zf[ok100] = z100[ok100]
    return dem, xs, ys, zf, ok100, zo_f, oko


# --------------------------------------------------------------------------- 2. drenaje
D8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def burn(dem: Raster, rep: dict):
    """Quema los drenajes oficiales de Medellín (red hídrica y polígono del río) en el MDE de 25 m."""
    z = dem.z.copy()
    burned = np.zeros_like(dem.valid)
    n_lines = 0
    for f in gj('red-hidrica.geojson'):
        g = shape(f['geometry'])
        lines = list(g.geoms) if isinstance(g, MultiLineString) else [g]
        for ln in lines:
            c = np.asarray(ln.coords)
            X, Y = G2C.transform(c[:, 0], c[:, 1])
            L = LineString(np.column_stack([X, Y]))
            n = max(2, int(L.length / 8))
            pts = np.asarray([L.interpolate(t, normalized=True).coords[0] for t in np.linspace(0, 1, n)])
            fi, fj = dem.pix(pts[:, 0], pts[:, 1])
            ii, jj = np.round(fi).astype(int), np.round(fj).astype(int)
            m = (ii >= 0) & (ii < dem.nx) & (jj >= 0) & (jj < dem.ny)
            burned[jj[m], ii[m]] = True
            n_lines += 1
    z[burned & dem.valid] -= 2.0
    # río: polígono oficial
    rio = unary_union([shape(f['geometry']) for f in gj('rio-medellin-poligono.geojson')])
    rio_c = shapely.transform(rio, lambda c: np.column_stack(G2C.transform(c[:, 0], c[:, 1])))
    minx, miny, maxx, maxy = rio_c.bounds
    i0, j0 = dem.pix(minx, maxy)
    i1, j1 = dem.pix(maxx, miny)
    I, J = np.meshgrid(np.arange(max(0, int(i0) - 1), min(dem.nx, int(i1) + 2)), np.arange(max(0, int(j0) - 1), min(dem.ny, int(j1) + 2)))
    CX, CY = dem.center(I, J)
    inr = shapely.contains_xy(rio_c, CX, CY)
    z[J[inr], I[inr]] = np.minimum(z[J[inr], I[inr]], z[J[inr], I[inr]] - 5.0)
    rep['quemado'] = {'tramosRedHidrica': n_lines, 'celdasQuebradas': int(burned.sum()), 'celdasRio': int(inr.sum())}
    return z, burned


def priority_fill(z, valid, eps=1e-4):
    ny, nx = z.shape
    fill = z.copy()
    seen = ~valid
    pq: list = []
    inval = ~valid
    edge = np.zeros_like(valid)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    near_nd = ndimage.binary_dilation(inval, structure=np.ones((3, 3), bool))
    start = valid & (edge | near_nd)
    for j, i in zip(*np.nonzero(start)):
        heapq.heappush(pq, (fill[j, i], int(j), int(i)))
        seen[j, i] = True
    while pq:
        h, j, i = heapq.heappop(pq)
        for a, b in D8:
            jj, ii = j + a, i + b
            if 0 <= jj < ny and 0 <= ii < nx and not seen[jj, ii]:
                seen[jj, ii] = True
                if fill[jj, ii] <= h + eps:
                    fill[jj, ii] = h + eps
                heapq.heappush(pq, (fill[jj, ii], jj, ii))
    return fill


def d8(fill, valid, d):
    ny, nx = fill.shape
    best = np.zeros((ny, nx))
    down = -np.ones((ny, nx), dtype=np.int64)
    P = np.pad(fill, 1, mode='constant', constant_values=np.inf)
    V = np.pad(valid, 1, mode='constant', constant_values=False)
    J, I = np.mgrid[0:ny, 0:nx]
    for a, b in D8:
        nb = P[1 + a:1 + a + ny, 1 + b:1 + b + nx]
        nv = V[1 + a:1 + a + ny, 1 + b:1 + b + nx]
        s = np.where(nv, (fill - nb) / (d * math.hypot(a, b)), -np.inf)
        upd = s > best
        best = np.where(upd, s, best)
        down = np.where(upd, (J + a) * nx + (I + b), down)
    down[~valid] = -1
    return down


def accumulate(fill, valid, down, extra=None):
    ny, nx = fill.shape
    acc = valid.astype(np.float64).ravel()
    if extra is not None:
        acc = acc + extra.ravel()
    order = np.argsort(-np.where(valid, fill, -np.inf), axis=None)
    df = down.ravel()
    for k in order:
        t = df[k]
        if t >= 0:
            acc[t] += acc[k]
    return acc.reshape(ny, nx)


def coarse_inflow(dem: Raster, rep: dict):
    """Área de la cuenca alta del río al sur del recuadro (D8 sobre el MDE de 400 m) y su punto de entrada."""
    r = Raster(INS / 'valle-dem-amva-400m.tif')
    fill = priority_fill(r.z, r.valid)
    down = d8(fill, r.valid, (r.dx + r.dy) / 2)
    acc = accumulate(fill, r.valid, down)
    # celdas del MDE grueso que caen en el borde sur del recuadro fino
    ny, nx = acc.shape
    best = (0.0, None)
    yS = dem.Ytop - dem.ny * dem.dy  # borde sur del MDE fino
    for j in range(ny):
        for i in range(nx):
            if not r.valid[j, i] or down[j, i] < 0:
                continue
            X, Y = r.center(i, j)
            tj, ti = divmod(int(down[j, i]), nx)
            X2, Y2 = r.center(ti, tj)
            if Y < yS <= Y2 and dem.X0 < X < dem.X0 + dem.nx * dem.dx:  # cruza el borde sur hacia el norte
                if acc[j, i] > best[0]:
                    best = (float(acc[j, i]), (float((X + X2) / 2), float(yS)))
    area_km2 = best[0] * r.dx * r.dy / 1e6
    rep['cuencaAltaRio'] = {'areaKm2': round(area_km2, 1), 'entrada9377': [round(v) for v in best[1]] if best[1] else None}
    return best[1], area_km2


def drainage(dem: Raster, rep: dict):
    """D8 con el río entrando por el borde sur. El relleno de depresiones toma todos los bordes como desagüe;
    en el tramo del borde sur por donde entra el río eso lo haría salir hacia el sur, así que ese tramo
    (±1 km) se trata como pared y el área de la cuenca alta se inyecta en el cauce justo adentro."""
    zb, burned = burn(dem, rep)
    entry, area_up = coarse_inflow(dem, rep)
    row = dem.ny - 1
    k = None
    if entry is not None:
        fi, _ = dem.pix(*entry)
        i = int(np.clip(round(fi), 0, dem.nx - 1))
        lo, hi = max(0, i - 20), min(dem.nx, i + 21)
        k = lo + int(np.argmin(np.where(dem.valid[row, lo:hi], dem.z[row, lo:hi], np.inf)))
        zb = zb.copy()
        zb[row, max(0, k - 40):k + 41] += 400.0  # pared: el agua no sale por aquí
    fill = priority_fill(zb, dem.valid)
    down = d8(fill, dem.valid, dem.dx)
    extra = np.zeros_like(fill)
    if k is not None:
        j_in = row - 1
        cand = [(fill[j_in, k + b], k + b) for b in (-1, 0, 1) if 0 <= k + b < dem.nx and dem.valid[j_in, k + b]]
        k_in = min(cand)[1]
        extra[j_in, k_in] = area_up * 1e6 / (dem.dx * dem.dy)
        rep['cuencaAltaRio']['celdaEntrada'] = {'columna': int(k_in), 'cota': round(float(dem.z[j_in, k_in]), 1)}
    acc = accumulate(fill, dem.valid, down, extra)
    return fill, down, acc, burned


def trace_network(dem: Raster, fill, down, acc, rep: dict):
    ny, nx = acc.shape
    cell_km2 = dem.dx * dem.dy / 1e6
    stream = acc * cell_km2 >= A_MIN_KM2
    df = down.ravel()
    sflat = stream.ravel()
    # vecinos aguas arriba que son cauce
    ups: dict[int, list[int]] = {}
    for k in np.nonzero(sflat)[0]:
        t = df[k]
        if t >= 0 and sflat[t]:
            ups.setdefault(int(t), []).append(int(k))
    # orden de Strahler
    order = np.zeros(ny * nx, dtype=np.int16)
    for k in np.argsort(-np.where(stream, fill, -np.inf), axis=None):
        if not sflat[k]:
            continue
        u = ups.get(int(k), [])
        if not u:
            order[k] = 1
        else:
            m = max(order[q] for q in u)
            order[k] = m + 1 if sum(1 for q in u if order[q] == m) >= 2 else m
    # tramo principal: desde la salida de mayor acumulación, aguas arriba por la mayor acumulación
    outs = [k for k in np.nonzero(sflat)[0] if df[k] < 0]
    out_k = max(outs, key=lambda k: acc.ravel()[k])
    trunk = [int(out_k)]
    while True:
        u = ups.get(trunk[-1], [])
        if not u:
            break
        trunk.append(max(u, key=lambda q: acc.ravel()[q]))
    trunk.reverse()  # de aguas arriba hacia abajo
    on_trunk = np.zeros(ny * nx, bool)
    on_trunk[trunk] = True
    # enlaces: de cada cabecera o confluencia hasta la siguiente confluencia (o el río)
    links = []
    heads = [int(k) for k in np.nonzero(sflat)[0] if not ups.get(int(k)) and not on_trunk[k]]
    starts = set(heads)
    for t, u in ups.items():
        if len(u) >= 2:
            for q in u:
                if not on_trunk[q]:
                    starts.add(q)
    for s in starts:
        path = [s]
        k = s
        while True:
            t = df[k]
            if t < 0:
                break
            path.append(int(t))
            if on_trunk[t] or len(ups.get(int(t), [])) >= 2:
                break
            k = int(t)
        links.append({'cells': path, 'order': int(order[s]), 'acc': float(acc.ravel()[path[-2] if len(path) > 1 else path[0]] * cell_km2)})
    rep['drenaje'] = {'cuencaMinimaKm2': A_MIN_KM2, 'celdasCauce': int(stream.sum()), 'enlaces': len(links), 'ordenMaximo': int(order.max()), 'rioCeldas': len(trunk)}
    return trunk, links


def cells_to_km(dem: Raster, cells):
    k = np.asarray(cells)
    j, i = np.divmod(k, dem.nx)
    X, Y = dem.center(i, j)
    return np.column_stack(c_to_km(X, Y))


def name_links(dem: Raster, links, rep: dict):
    """Nombre oficial de cada enlace: el drenaje con nombre de la red hídrica que lo acompaña (≥ 60 % de sus
    puntos a menos de 60 m)."""
    named = []
    for f in gj('red-hidrica.geojson'):
        nm = (f['properties'].get('nombre') or '').strip()
        if not nm or nm.upper() in ('SIN NOMBRE', 'NN', 'N.N.'):
            continue
        g = shape(f['geometry'])
        named.append((nm, geom_km(g)))
    tree = shapely.STRtree([g for _, g in named])
    n_named = 0
    for L in links:
        pts = L['km']
        if len(pts) < 3:
            L['name'] = None
            continue
        votes: dict[str, int] = {}
        P = shapely.points(pts)
        for idx, p in zip(range(len(pts)), P):
            near = tree.query(p, predicate='dwithin', distance=0.06)
            if len(near):
                best = min(near, key=lambda q: named[q][1].distance(p))
                votes[named[best][0]] = votes.get(named[best][0], 0) + 1
        if votes:
            nm, c = max(votes.items(), key=lambda kv: kv[1])
            L['name'] = nm if c >= 0.6 * len(pts) else None
        else:
            L['name'] = None
        n_named += L['name'] is not None
    rep['drenaje']['enlacesConNombre'] = n_named


def clean_name(nm: str | None) -> str | None:
    if not nm:
        return None
    s = nm.strip()
    for a, b in (('Q. ', 'Quebrada '), ('Qda. ', 'Quebrada '), ('Qda ', 'Quebrada '), ('Q.', 'Quebrada ')):
        if s.startswith(a):
            s = b + s[len(a):]
    return ' '.join(s.split())


# --------------------------------------------------------------------------- 3. ciudad
def streets(rep: dict):
    feats = []
    for p in range(18):
        feats += gj(f'sentido-vial-{p:02d}.geojson')
    rep['vias'] = {'tramos': len(feats)}
    return feats


def street_density(feats, xs, ys):
    """Metros de vía por hectárea en la malla de 100 m (suavizado gaussiano de 75 m)."""
    fine = 0.025
    fx0, fy0 = EXT['x0'], EXT['y0']
    nxf = int(round((EXT['x1'] - fx0) / fine)) + 1
    nyf = int(round((EXT['y1'] - fy0) / fine)) + 1
    acc = np.zeros((nyf, nxf))
    for f in feats:
        jer = f['properties'].get('jerarquia_op')
        if jer in (1, 7):  # autopistas y vías interveredales: cruzan zonas sin ciudad
            continue
        g = f['geometry']
        if g is None:
            continue
        parts = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        for c in parts:
            c = np.asarray(c)
            if len(c) < 2:
                continue
            x, y = to_km(c[:, 0], c[:, 1])
            for a in range(len(x) - 1):
                L = math.hypot(x[a + 1] - x[a], y[a + 1] - y[a])
                n = max(1, int(L / 0.005))
                t = (np.arange(n) + 0.5) / n
                px, py = x[a] + (x[a + 1] - x[a]) * t, y[a] + (y[a + 1] - y[a]) * t
                ii = np.round((px - fx0) / fine).astype(int)
                jj = np.round((py - fy0) / fine).astype(int)
                m = (ii >= 0) & (ii < nxf) & (jj >= 0) & (jj < nyf)
                np.add.at(acc, (jj[m], ii[m]), L * 1000 / n)
    # m de vía por celda de 25 m → m/ha: × 16 celdas por ha, tras suavizar
    dens = ndimage.gaussian_filter(acc, 3.0, mode='constant') * 16
    # muestreo en la malla de 100 m
    ii = np.round((np.asarray(xs) - fx0) / fine).astype(int)
    jj = np.round((np.asarray(ys) - fy0) / fine).astype(int)
    return dens[np.ix_(jj, ii)]


FABRIC = {'None': 0, 'Ladera': 1, 'Plano': 2, 'Centro': 3, 'Poblado': 4, 'Industria': 5, 'Municipio': 6}
COMUNA_TIPO = {
    '10': 'Centro', '14': 'Poblado', '11': 'Plano', '12': 'Plano', '16': 'Plano', '15': 'Industria',
    '05': 'Plano', '04': 'Plano', '06': 'Ladera', '07': 'Ladera', '01': 'Ladera', '02': 'Ladera', '03': 'Ladera',
    '08': 'Ladera', '09': 'Ladera', '13': 'Ladera',
}


def smoothstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def fabric(xs, ys, z, ok, dens, river_km, rep: dict):
    X, Y = np.meshgrid(xs, ys)
    # dónde hay ciudad: núcleos de calles densas (> 110 m/ha) y su borde hasta 300 m donde todavía hay
    # calles (> 45 m/ha); una carretera rural suelta (30–60 m/ha) no forma ciudad. En Medellín, además, los
    # polígonos de barrio (suelo urbano) con alguna calle cuentan como ciudad aunque sus manzanas sean grandes
    # (torres de El Poblado).
    bar = np.zeros(X.shape, bool)
    for f in gj('barrios-veredas.geojson'):
        if f['properties'].get('subtipo_barriovereda') == 1:
            bar |= shapely.contains_xy(geom_km(shape(f['geometry'])), X, Y)
    core = dens > 110
    near = ndimage.binary_dilation(core, iterations=3)
    cand = ((dens > 45) & near) | (bar & (dens > 10))
    cand = ndimage.binary_closing(cand, iterations=1) & (dens > 5)
    k = np.where(cand, smoothstep(30.0, 150.0, dens), 0.0)
    k = np.where(cand & bar, np.maximum(k, 0.5), k)
    k[~ok] = 0
    # pendiente (m/m) de la malla de 100 m
    gy, gx = np.gradient(z, ST * 1000)
    slope = np.hypot(gx, gy)
    # municipios del AMVA y comunas de Medellín
    mun = np.full(X.shape, '', dtype=object)
    for f in gj('area-metropolitana-municipios.geojson'):
        g = geom_km(shape(f['geometry']))
        mun[shapely.contains_xy(g, X, Y)] = f['properties']['nombre']
    com = np.full(X.shape, '', dtype=object)
    for f in gj('comunas-corregimientos.geojson'):
        g = geom_km(shape(f['geometry']))
        cid = f['properties'].get('codigo') or f['properties'].get('identificacion') or ''
        com[shapely.contains_xy(g, X, Y)] = str(f['properties'].get('codigo', cid))
    # zonas sin edificios: cerros tutelares, pista del aeropuerto, unidad deportiva, cauce del río
    free = np.zeros(X.shape, bool)
    for f in gj('cerros-tutelares.geojson'):
        free |= shapely.contains_xy(geom_km(shape(f['geometry'])).buffer(-0.03), X, Y)
    for f in gj('aeropuerto-pista.geojson'):
        free |= shapely.contains_xy(geom_km(shape(f['geometry'])).buffer(0.09), X, Y)
    for f in gj('equipamientos-referentes.geojson'):
        if 'Atanasio' in f['properties'].get('nombre', ''):
            free |= shapely.contains_xy(geom_km(shape(f['geometry'])).buffer(-0.02), X, Y)
    rl = LineString(river_km)
    dr = shapely.distance(rl, shapely.points(X.ravel(), Y.ravel())).reshape(X.shape)
    free |= dr < 0.07
    k[free] = 0
    # tipo
    f = np.zeros(X.shape, np.int32)
    urb = k > 0.02
    steep = slope > 0.14
    for code, tipo in COMUNA_TIPO.items():
        m = urb & (com == code)
        t = FABRIC[tipo]
        if tipo in ('Plano', 'Industria'):
            f[m & ~steep] = t
            f[m & steep] = FABRIC['Ladera']
        else:
            f[m] = t
    # Guayabal: industria solo en el fondo plano cerca del río; el resto, barrios planos
    m = urb & (com == '15') & (dr > 1.3)
    f[m & (f == FABRIC['Industria'])] = FABRIC['Plano']
    # corregimientos de Medellín y otros municipios
    rest = urb & (f == 0)
    medellin = mun == 'Medellín'
    f[rest & medellin & steep] = FABRIC['Ladera']
    f[rest & medellin & ~steep] = FABRIC['Plano']
    f[rest & ~medellin & steep] = FABRIC['Ladera']
    f[rest & ~medellin & ~steep] = FABRIC['Municipio']
    k[f == 0] = 0
    q = np.round(k * 15).astype(np.int32)
    f[q == 0] = 0
    byte = (f * 16 + q).astype(np.uint8)
    rep['ciudad'] = {
        'celdasUrbanas': int((q > 0).sum()),
        'km2Urbanos': round(float((q > 0).sum() * ST * ST), 1),
        'porTipo': {n: int(((f == v) & (q > 0)).sum()) for n, v in FABRIC.items() if v},
    }
    return byte, mun, com, k, slope, dr


# --------------------------------------------------------------------------- 4. transporte y vías
LINE_KIND = {1: 'metro', 2: 'cable', 3: 'metroplus', 4: 'tranvia'}


def transit(rep: dict):
    lines = []
    excl = []
    for f in gj('transporte-masivo-lineas.geojson'):
        p = f['properties']
        if p['estado'] != 1:
            excl.append(f"{p['nombre']} (estado {p['estado']})")
            continue
        g = geom_km(shape(f['geometry']))
        parts = list(g.geoms) if g.geom_type == 'MultiLineString' else [g]
        merged = linemerge(parts) if len(parts) > 1 else parts[0]
        segs = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]
        code = p['linea'].replace('Línea ', '').strip() if p['linea'].startswith('Línea') else p['linea']
        nm = p['nombre']
        for s in segs:
            c = simplify(list(s.coords), 0.004)
            lines.append({'id': f"{LINE_KIND[p['tipo']]}-{code}".lower().replace(' ', '-'), 'code': code, 'name': nm, 'kind': LINE_KIND[p['tipo']], 'pts': c})
    st = []
    for f in gj('transporte-masivo-estaciones.geojson'):
        p = f['properties']
        x, y = to_km(*f['geometry']['coordinates'][:2])
        code = p['linea'].replace('Línea ', '').strip()
        code = 'T' if code == 'T-A' else code  # las estaciones del tranvía se rotulan «T-A»; la línea, «T»
        st.append({'name': ' '.join(str(p['nombre']).split()), 'line': code, 'kind': LINE_KIND.get(p['ruleid'], 'metro'), 'x': float(x), 'y': float(y), 'estado': p['estado']})
    rep['transporte'] = {'lineas': sorted({l['name'] for l in lines}), 'excluidas': excl, 'estaciones': len(st),
                         'estacionesConEstadoDistinto': sorted({f"{s['line']}: {s['name']} (estado {s['estado']})" for s in st if s['estado'] != 1})}
    return lines, st


def main_roads(feats, rep: dict):
    """Autopistas (jerarquía 1) y arterias principales (2), fundidas en polilíneas y simplificadas a 12 m."""
    by: dict[tuple[int, str], list] = {}
    for f in feats:
        jer = f['properties'].get('jerarquia_op')
        if jer not in (1, 2) or f['geometry'] is None:
            continue
        g = geom_km(shape(f['geometry']))
        nm = (f['properties'].get('nombre') or '').strip()
        by.setdefault((jer, ''), []).extend(list(g.geoms) if g.geom_type == 'MultiLineString' else [g])
    out = []
    for (jer, _), parts in by.items():
        merged = linemerge(parts)
        segs = list(merged.geoms) if merged.geom_type == 'MultiLineString' else [merged]
        for s in segs:
            if s.length < (0.6 if jer == 2 else 0.3):
                continue
            out.append({'cls': jer, 'pts': simplify(list(s.coords), 0.02)})
    rep['viasPrincipales'] = {'autopistaKm': round(sum(LineString(r['pts']).length for r in out if r['cls'] == 1), 1),
                              'arteriasKm': round(sum(LineString(r['pts']).length for r in out if r['cls'] == 2), 1), 'polilineas': len(out)}
    return out


# --------------------------------------------------------------------------- 5. referentes y rótulos
HILL_IDS = {
    'CERRO NUTIBARA': ('nutibara', 'Cerro Nutibara'),
    'ECOPARQUE CERRO EL VOLADOR': ('volador', 'Cerro El Volador'),
    'CERRO LA ASOMADERA': ('asomadera', 'Cerro La Asomadera'),
    'CERRO PAN DE AZUCAR': ('pan-de-azucar', 'Cerro Pan de Azúcar'),
    'CERRO DE LAS TRES CRUCES': ('tres-cruces', 'Cerro de las Tres Cruces'),
    'CERRO SANTO DOMINGO': ('santo-domingo', 'Cerro Santo Domingo'),
    'CERRO EL PICACHO': ('picacho', 'Cerro El Picacho'),
    'CERRO DEL PADRE AMAYA': ('padre-amaya', 'Cerro del Padre Amaya'),
    'CERRO EL BOQUERON': ('boqueron', 'Cerro El Boquerón'),
}


def zgrid_at(xs, ys, z, x, y):
    fi, fj = (x - xs[0]) / ST, (y - ys[0]) / ST
    return float(ndimage.map_coordinates(z, [[fj], [fi]], order=1, mode='nearest')[0])


def hills(xs, ys, z, rep):
    tutelares = {}
    for f in gj('cerros-tutelares.geojson'):
        g = geom_km(shape(f['geometry']))
        tutelares[f['properties']['nombre']] = g
    out = []
    for f in gj('toponimia-cerros.geojson'):
        nm = f['properties']['nombre']
        if nm not in HILL_IDS:
            continue
        hid, label = HILL_IDS[nm]
        x, y = map(float, to_km(*f['geometry']['coordinates'][:2]))
        # cima: máximo del relieve a menos de 400 m del punto oficial
        best = (zgrid_at(xs, ys, z, x, y), x, y)
        for dx in np.arange(-0.4, 0.41, 0.05):
            for dy in np.arange(-0.4, 0.41, 0.05):
                if dx * dx + dy * dy <= 0.16:
                    zz = zgrid_at(xs, ys, z, x + dx, y + dy)
                    if zz > best[0]:
                        best = (zz, x + dx, y + dy)
        # radio aproximado: el del polígono de cerro tutelar si existe
        r = 0.6
        for tn, g in tutelares.items():
            if g.contains(Point(x, y)) or g.distance(Point(x, y)) < 0.15:
                r = max(0.25, math.sqrt(g.area / math.pi))
        inside = EXT['x0'] <= x <= EXT['x1'] and EXT['y0'] <= y <= EXT['y1']
        out.append({'id': hid, 'name': label, 'x': round(x, 3), 'y': round(y, 3), 'peak': round(best[0]), 'r': round(r, 2), 'tutelar': any(g.distance(Point(x, y)) < 0.15 for g in tutelares.values()), 'inside': inside})
    rep['cerros'] = [{k: h[k] for k in ('name', 'peak', 'tutelar')} for h in out]
    return out, tutelares


def labels_from_urban(xs, ys, kk, region_mask):
    X, Y = np.meshgrid(xs, ys)
    w = kk * region_mask
    if w.sum() < 1:
        return None
    # centro de la mancha urbana: el punto urbano más cercano al centroide ponderado
    cx, cy = float((X * w).sum() / w.sum()), float((Y * w).sum() / w.sum())
    m = w > 0.5 * w.max()
    d = np.where(m, np.hypot(X - cx, Y - cy), np.inf)
    j, i = np.unravel_index(np.argmin(d), d.shape)
    return round(float(X[j, i]), 3), round(float(Y[j, i]), 3)


def places(xs, ys, kk, mun, com, rep):
    out = {}
    for f in gj('area-metropolitana-municipios.geojson'):
        nm = f['properties']['nombre']
        p = labels_from_urban(xs, ys, kk, (mun == nm).astype(float))
        if p:
            out['mun:' + nm] = p
    for f in gj('comunas-corregimientos.geojson'):
        c = str(f['properties'].get('codigo'))
        nm = f['properties'].get('nombre')
        if not nm:
            continue
        m = (com == c).astype(float)
        p = labels_from_urban(xs, ys, kk, m)
        if p is None:  # corregimiento rural: centroide del polígono
            g = geom_km(shape(f['geometry']))
            p = (round(g.representative_point().x, 3), round(g.representative_point().y, 3))
        out['com:' + c] = p
        out['comname:' + c] = nm
    return out


def landmarks():
    out = {}
    for f in gj('aeropuerto-pista.geojson'):
        g = geom_km(shape(f['geometry']))
        mrr = g.minimum_rotated_rectangle
        c = np.asarray(mrr.exterior.coords)[:4]
        # extremos de la pista: puntos medios de los lados cortos
        sides = [(c[i], c[(i + 1) % 4]) for i in range(4)]
        sides.sort(key=lambda s: np.hypot(*(s[1] - s[0])))
        a, b = (sides[0][0] + sides[0][1]) / 2, (sides[1][0] + sides[1][1]) / 2
        if a[1] > b[1]:
            a, b = b, a
        out['runwayS'] = [round(float(a[0]), 3), round(float(a[1]), 3)]
        out['runwayN'] = [round(float(b[0]), 3), round(float(b[1]), 3)]
        out['runwayW'] = round(float(np.hypot(*(sides[0][1] - sides[0][0]))), 3)
    for f in gj('aeropuerto-punto.geojson'):
        out['aeropuerto'] = [round(float(v), 3) for v in to_km(*f['geometry']['coordinates'][:2])]
    for f in gj('toponimia-coltejer.geojson'):
        out['coltejer'] = [round(float(v), 3) for v in to_km(*f['geometry']['coordinates'][:2])]
    for f in gj('equipamientos-referentes.geojson'):
        g = geom_km(shape(f['geometry']))
        nm = f['properties']['nombre']
        key = 'unidadAtanasio' if 'Atanasio' in nm else 'bibliotecaEspana'
        c = g.representative_point() if key == 'bibliotecaEspana' else g.centroid
        out[key] = [round(c.x, 3), round(c.y, 3)]
        if key == 'unidadAtanasio':
            out['unidadAtanasioR'] = round(math.sqrt(g.area / math.pi), 3)
    return out


def boundaries():
    """Límites municipales (contornos simplificados a 25 m) para dibujarlos sobre el relieve."""
    polys = [geom_km(shape(f['geometry'])) for f in gj('area-metropolitana-municipios.geojson')]
    # límites internos: todos los bordes menos el contorno exterior del área metropolitana
    outer = unary_union(polys).boundary.buffer(0.06)
    inner = unary_union([p.boundary for p in polys]).difference(outer)
    inner = inner.intersection(shapely.box(EXT['x0'], EXT['y0'], EXT['x1'], EXT['y1']))
    merged = linemerge(inner) if inner.geom_type in ('MultiLineString', 'GeometryCollection') else inner
    edges = []
    for q in (merged.geoms if hasattr(merged, 'geoms') else [merged]):
        if q.geom_type == 'LineString' and q.length > 0.3:
            edges.append(simplify(list(q.coords), 0.025))
    return edges


# --------------------------------------------------------------------------- 6. perfil transversal (tablas por y)
def cross_tables(xs, ys, z, river_y, river_x, river_z):
    """Por cada fila (cada 0,5 km): cota y distancia de la cuchilla a cada lado del río y ancho del fondo plano
    (donde el terreno sube menos de 35 m sobre el cauce)."""
    rows = np.arange(EXT['y0'], EXT['y1'] + 1e-9, 0.5)
    out = {k: [] for k in ('dW', 'hW', 'dE', 'hE', 'fW', 'fE')}
    zs = ndimage.gaussian_filter(z, 2)
    for y in rows:
        j = int(round((y - ys[0]) / ST))
        rx = float(np.interp(y, river_y, river_x))
        rz = float(np.interp(y, river_y, river_z))
        prof = zs[j]
        for side, kd, kh, kf in ((-1, 'dW', 'hW', 'fW'), (1, 'dE', 'hE', 'fE')):
            m = (xs - rx) * side > 0
            if not m.any():
                out[kd].append(1.0); out[kh].append(rz + 600); out[kf].append(0.3)
                continue
            xx, zz = xs[m], prof[m]
            k = int(np.argmax(zz))
            out[kd].append(round(abs(float(xx[k]) - rx), 2))
            out[kh].append(round(float(zz[k])))
            dd = np.abs(xx - rx)
            o = np.argsort(dd)
            flat = 0.3
            for q in o:
                if zz[q] - rz > 35:
                    flat = max(0.3, float(dd[q]))
                    break
            out[kf].append(round(flat, 2))
    # suavizado ligero de las tablas
    for k in out:
        a = np.asarray(out[k], float)
        a = ndimage.median_filter(a, 3, mode='nearest')
        out[k] = [round(float(v), 2) for v in ndimage.uniform_filter1d(a, 3, mode='nearest')]
    return {'y0': EXT['y0'], 'dy': 0.5, **out}


# --------------------------------------------------------------------------- principal
def main() -> int:
    rep: dict = {}
    dem, xs, ys, zf, ok100, zo, oko = build_relief(rep)

    print('drenaje (D8 a 25 m)…', file=sys.stderr)
    fill, down, acc, burned = drainage(dem, rep)
    trunk, links = trace_network(dem, fill, down, acc, rep)

    # río: celdas → km, cota del cauce (mínimo local del MDE sin quemar) monótona aguas abajo
    tk = cells_to_km(dem, trunk)
    tj, ti = np.divmod(np.asarray(trunk), dem.nx)
    zr = ndimage.minimum_filter(np.where(dem.valid, dem.z, 1e9), 3)[tj, ti]
    zr = np.minimum.accumulate(zr)
    sm = chaikin(tk, 3)
    zsm = np.interp(np.linspace(0, 1, len(sm)), np.linspace(0, 1, len(zr)), zr)
    # remuestreo cada 100 m
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(sm, axis=0).T))]
    s100 = np.arange(0, seg[-1], 0.1)
    river = np.column_stack([np.interp(s100, seg, sm[:, 0]), np.interp(s100, seg, sm[:, 1]), np.interp(s100, seg, zsm)])
    # tabla x(y) monótona en y (para riverAt)
    yy = np.maximum.accumulate(river[:, 1])
    keep = np.r_[True, np.diff(yy) > 1e-6]
    ry, rx, rz = yy[keep], river[keep, 0], river[keep, 2]
    rep['rio'] = {'largoKm': round(float(seg[-1]), 2), 'cotaEntrada': round(float(river[0, 2])), 'cotaSalida': round(float(river[-1, 2])),
                  'entradaKm': [round(float(river[0, 0]), 2), round(float(river[0, 1]), 2)], 'salidaKm': [round(float(river[-1, 0]), 2), round(float(river[-1, 1]), 2)]}

    # comparación con el polígono oficial del río (solo existe dentro de Medellín): distancia del eje D8
    rio = geom_km(unary_union([shape(f['geometry']) for f in gj('rio-medellin-poligono.geojson')]))
    med = [geom_km(shape(f['geometry'])) for f in gj('area-metropolitana-municipios.geojson') if f['properties']['nombre'] == 'Medellín'][0]
    pts = shapely.points(river[:, 0], river[:, 1])
    lo_y, hi_y = rio.bounds[1] + 0.2, rio.bounds[3] - 0.2  # sin los extremos donde el polígono termina
    sel = shapely.contains(med, pts) & (river[:, 1] > lo_y) & (river[:, 1] < hi_y)
    dists = shapely.distance(rio, pts)[sel] * 1000
    rep['rio']['distanciaAlPoligonoOficial_m'] = {'mediana': round(float(np.median(dists)), 1), 'p95': round(float(np.percentile(dists, 95)), 1), 'max': round(float(dists.max()), 1), 'puntos': int(sel.sum()), 'nota': 'eje del río D8 frente al polígono oficial del cauce, dentro de Medellín (0 = dentro del cauce)'}

    # quebradas: km, suavizado, simplificación
    for L in links:
        k = cells_to_km(dem, L['cells'])
        L['km'] = chaikin(k, 2)
    name_links(dem, links, rep)
    streams = []
    for L in links:
        pts_ = simplify(L['km'], 0.012)
        if len(pts_) < 2:
            continue
        streams.append({'n': clean_name(L['name']), 'o': L['order'], 'a': round(L['acc'], 2), 'pts': pts_})
    # quebradas con nombre: rótulo en el enlace de mayor cuenca de cada nombre
    by_name: dict[str, dict] = {}
    for s in streams:
        if s['n'] and (s['n'] not in by_name or s['a'] > by_name[s['n']]['a']):
            by_name[s['n']] = s
    creek_labels = []
    for nm, s in sorted(by_name.items(), key=lambda kv: -kv[1]['a']):
        p = LineString(s['pts']).interpolate(0.55, normalized=True)
        creek_labels.append({'name': nm, 'x': round(p.x, 3), 'y': round(p.y, 3), 'a': s['a']})
    rep['drenaje']['quebradasConNombre'] = len(creek_labels)

    feats = streets(rep)
    dens = street_density(feats, xs, ys)
    fab, mun, com, kk, slope, dr = fabric(xs, ys, zf, ok100, dens, river[:, :2], rep)
    lines, stations = transit(rep)
    roads = main_roads(feats, rep)
    hl, _ = hills(xs, ys, zf, rep)
    pl = places(xs, ys, kk, mun, com, rep)
    lm = landmarks()
    bnd = boundaries()
    ct = cross_tables(xs, ys, zf, ry, rx, rz)

    # verificación: estaciones del metro en el fondo del valle; cerros en su cota
    st_lift = []
    for s in stations:
        if s['kind'] == 'metro' and EXT['y0'] <= s['y'] <= EXT['y1']:
            st_lift.append(zgrid_at(xs, ys, zf, s['x'], s['y']) - float(np.interp(s['y'], ry, rz)))
    rep['verificacion'] = {
        'estacionesMetroSobreElRio_m': {'max': round(max(st_lift), 1), 'mediana': round(float(np.median(st_lift)), 1)},
        'rioBajaDeSurANorte': bool(np.all(np.diff(river[:, 2]) <= 1e-6)),
    }

    # ---------------------------------------------------------------- escritura
    qz = np.round(zf).astype(np.int64)
    qo = np.round(zo).astype(np.int64)
    srcs = sorted(p.name for p in INS.iterdir() if p.is_file())
    man = json.loads(MANIF.read_text(encoding='utf-8'))
    urls = {e['name'].split('/', 1)[1]: e.get('layer') for e in man['files'] if e['name'].startswith('valle-aburra/')}
    meta = {
        'generador': 'tools/geo/valle.py',
        'fuente': 'Alcaldía de Medellín, servidor de mapas (servidormapas/rest/services); modelo de elevación del AMVA',
        'insumos': [{'archivo': n, 'capa': urls.get(n), 'sha256': sha(INS / n)[:16]} for n in srcs],
    }

    def jn(o):
        return json.dumps(o, ensure_ascii=False, separators=(',', ':'))

    # bloque binario: secciones concatenadas, comprimidas con zlib (se descomprime con fflate de three.js)
    secs: list[tuple[str, bytes]] = []
    secs.append(('relieve', enc_grid(qz)))
    secs.append(('horizonte', enc_grid(qo)))
    secs.append(('relleno', enc_rle((~ok100).astype(np.uint8))))
    secs.append(('rellenoH', enc_rle((~oko).astype(np.uint8))))
    secs.append(('tejido', enc_rle(fab)))
    secs.append(('quebradas', b''.join(enc_line(s_['pts']) for s_ in streams)))
    secs.append(('lineas', b''.join(enc_line(l['pts']) for l in lines)))
    secs.append(('vias', b''.join(enc_line(r['pts']) for r in roads)))
    secs.append(('limites', b''.join(enc_line(b) for b in bnd)))
    index, off, blob = {}, 0, bytearray()
    for nm, b in secs:
        index[nm] = [off, len(b)]
        blob += b
        off += len(b)
    z = zlib.compress(bytes(blob), 9)
    rep['datos'] = {'bytes': len(blob), 'comprimidos': len(z), 'secciones': {k: v[1] for k, v in index.items()}}

    ts = []
    ts.append('// GENERADO por tools/geo/valle.py a partir de capas oficiales (Alcaldía de Medellín y AMVA). No editar a mano.')
    ts.append('// Coordenadas en km desde La Alpujarra (x este, y norte); cotas en m. Detalle: docs/medellin/DATOS_REALES.md §7.')
    ts.append('/* eslint-disable */')
    ts.append(f'export const VALLE_META = {jn(meta)};')
    ts.append(f'export const VALLE_INFORME = {jn(rep)};')
    ts.append(f"export const RELIEVE = {jn({**EXT, 'st': ST, 'nx': len(xs), 'ny': len(ys)})};")
    ts.append(f"export const HORIZONTE = {jn(OUT)};")
    ts.append('/** Secciones del bloque binario: [desplazamiento, largo] en bytes, ya descomprimido. */')
    ts.append(f'export const SECCIONES = {jn(index)} as const;')
    ts.append('/** relieve y horizonte: cota entera [m] con predictor a + b − c, zigzag y LEB128; relleno: 1 = sin dato del AMVA (RLE);')
    ts.append(' *  tejido: tipo × 16 + intensidad 0–15 (RLE); polilíneas: diferencias en m (zigzag, LEB128). */')
    ts.append(f"export const BLOQUE = '{base64.b64encode(z).decode()}';")
    ts.append(f"export const RIO = {jn([[round(float(a), 3), round(float(b), 3), round(float(c), 1)] for a, b, c in river])};")
    ts.append(f"export const QUEBRADAS = {jn([{'n': s_['n'], 'o': s_['o'], 'a': s_['a'], 'c': len(s_['pts'])} for s_ in streams])};")
    ts.append(f"export const QUEBRADAS_ROTULOS = {jn(creek_labels)};")
    ts.append(f"export const LINEAS = {jn([{'id': l['id'], 'code': l['code'], 'name': l['name'], 'kind': l['kind'], 'c': len(l['pts'])} for l in lines])};")
    ts.append(f"export const ESTACIONES = {jn([{'name': s_['name'], 'line': s_['line'], 'kind': s_['kind'], 'x': round(s_['x'], 3), 'y': round(s_['y'], 3)} for s_ in stations])};")
    ts.append(f"export const VIAS = {jn([[r['cls'], len(r['pts'])] for r in roads])};")
    ts.append(f"export const CERROS = {jn(hl)};")
    ts.append(f"export const LUGARES = {jn(pl)};")
    ts.append(f"export const REFERENTES = {jn(lm)};")
    ts.append(f"export const LIMITES = {jn([len(b) for b in bnd])};")
    ts.append(f"export const TRANSVERSAL = {jn(ct)};")
    rep_json = json.dumps(rep, ensure_ascii=False, indent=1)
    INFORME.write_text(rep_json + '\n', encoding='utf-8')
    SALIDA.write_text('\n'.join(ts) + '\n', encoding='utf-8')
    print(rep_json)
    print(f'{SALIDA.relative_to(RAIZ)}: {SALIDA.stat().st_size / 1024:.0f} KiB', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
