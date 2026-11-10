#!/usr/bin/env python3
"""Sectores reales de Medellín con quebrada para el laboratorio de lluvia.

Construye un escenario `medellin-lluvia/escenario` v1 a partir de las respuestas sin modificar de los servicios
oficiales de mapas de la Alcaldía (verificadas con su SHA-256 en `insumos/manifiesto.json`):

  · ServiciosImagen/Modelo_digital_de_elevacion_medellin_2024/ImageServer: terreno de 1 m (EPSG:9377);
  · ServiciosCiudad/CartografiaBase/MapServer/15 (Construccion): huellas y número de pisos;
  · ServiciosCiudad/CartografiaBase/MapServer/14 (Vias Medellin): ejes de vías;
  · ServiciosCiudad/CartografiaBase/MapServer/27 (Hidrografia POT): eje de la quebrada (escala 1:25 000).

Pasos y decisiones (todas quedan en la procedencia del escenario):
  1. Recorte del dominio (rectángulo alineado con EPSG:9377, lado largo a lo largo de la quebrada).
  2. Eje de la quebrada: el de la hidrografía POT se lleva al fondo del cauce del modelo de elevación (talweg):
     en cada metro se busca la cota mínima en ±8 m perpendiculares y se suaviza. Se informa el desplazamiento.
  3. Paso del agua por el cauce: donde el perfil del fondo sube aguas abajo (vías en terraplén sobre coberturas o
     puentes que el modelo de terreno no distingue) se rebaja el fondo a lo largo del eje para que el agua pueda
     seguir (acondicionamiento hidrológico del terreno). Se informan la longitud y la profundidad rebajadas. No se
     dibuja ninguna obra: no hay datos levantados de coberturas ni puentes.
  4. Construcciones: huellas oficiales; altura = pisos × 3 m (estimada). Donde una huella cubre el cauce, el
     cálculo deja un paso de agua de 3 m bajo ella (la construcción se divide); se cuentan en la procedencia.
  5. Vías: ejes oficiales con ancho estimado (5 m o 3 m según la jerarquía) en asfalto.
  6. Coberturas del suelo: retiro de la quebrada (8 m a cada lado) con grama; el resto, concreto (estimado).
  7. Bordes: la quebrada entra por el borde de aguas arriba (creciente de ejemplo); el agua sale por todos los
     bordes con profundidad normal y la pendiente local. Sin red de alcantarillado: no está levantada.

Uso:
    python3 tools/geo/sector_real.py --site blanquizal-la-iguana --out src/city/scenarios/reales/blanquizal-la-iguana.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

import sys

import numpy as np
import tifffile
from pyproj import Transformer
from scipy.ndimage import uniform_filter1d
from shapely.geometry import LineString, MultiLineString, Point, Polygon, box, mapping, shape
from shapely.ops import linemerge, unary_union
from shapely.validation import make_valid

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
INSUMOS = ROOT / "insumos"


@dataclass
class Site:
    id: str
    title: str
    short: str
    quebrada: str
    barrio: str
    comuna: str
    # dominio [xmin, ymin, xmax, ymax] en EPSG:9377 (dentro del recuadro descargado, que tiene 10 m de margen)
    domain: tuple[float, float, float, float]
    summary: str


SITES = {
    "andalucia-juan-bobo": Site(
        "andalucia-juan-bobo",
        "Andalucía: quebrada Juan Bobo (datos oficiales)",
        "Andalucía · Juan Bobo",
        "Q. Juan Bobo",
        "Andalucía",
        "Santa Cruz (comuna 2)",
        (4717256, 2254459, 4717406, 2254579),
        "Tramo de la quebrada Juan Bobo en el barrio Andalucía (Santa Cruz), conocido por el reasentamiento de familias del retiro. Terreno, ortofoto, construcciones, vías y eje de la quebrada vienen de los servicios oficiales de mapas de la Alcaldía de Medellín.",
    ),
    "la-iguana-el-pesebre": Site(
        "la-iguana-el-pesebre",
        "La Iguaná entre El Pesebre y Fuente Clara (datos oficiales)",
        "La Iguaná · El Pesebre",
        "Q. La Iguaná",
        "El Pesebre y Fuente Clara",
        "límite de San Javier (comuna 13) y Robledo (comuna 7)",
        (4712140, 2252060, 4712290, 2252180),
        "Tramo abierto de la quebrada La Iguaná entre los barrios El Pesebre (San Javier) y Fuente Clara (Robledo), aguas abajo de Blanquizal. Terreno, ortofoto, construcciones, vías y eje de la quebrada vienen de los servicios oficiales de mapas de la Alcaldía de Medellín.",
    ),
    "ana-diaz-el-corazon": Site(
        "ana-diaz-el-corazon",
        "Ana Díaz en El Corazón y Betania (datos oficiales)",
        "Ana Díaz · El Corazón",
        "Q. Ana Diaz",
        "El Corazón y Betania",
        "San Javier (comuna 13)",
        (4709827, 2248823, 4709977, 2248943),
        "Tramo abierto de la quebrada Ana Díaz entre los barrios El Corazón y Betania (San Javier), con viviendas a pocos metros del cauce. Terreno, ortofoto, construcciones, vías y eje de la quebrada vienen de los servicios oficiales de mapas de la Alcaldía de Medellín.",
    ),
}

BASIN_DEM = {
    "andalucia-juan-bobo": "cuenca-dem-5m.tif",
    "la-iguana-el-pesebre": "cuenca-dem-10m-amplia.tif",
    "ana-diaz-el-corazon": "cuenca-dem-10m-amplia.tif",
}
RUNOFF_C = 0.75  # coeficiente de escorrentía de las laderas vecinas urbanizadas (estimado)
FLOOR_M = 3.0
BURN_HALF = 1.0  # semiancho del paso abierto a lo largo del eje [m]
GAP_HALF = 1.5  # semiancho del paso de agua bajo construcciones sobre el cauce [m]
RETIRO_M = 8.0


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load_dem(site: Site):
    p = INSUMOS / site.id / "dem-2024-1m.tif"
    with tifffile.TiffFile(p) as t:
        pg = t.pages[0]
        a = pg.asarray().astype(np.float64)
        tags = {k.name: k.value for k in pg.tags.values()}
    sx, sy = tags["ModelPixelScaleTag"][:2]
    tie = tags["ModelTiepointTag"]
    x0, ytop = tie[3], tie[4]
    if sx != 1.0 or sy != 1.0:
        raise SystemExit("El modelo de elevación no tiene 1 m de pixel.")
    nodata = float(tags.get("GDAL_NODATA", "-32767"))
    if (a <= nodata + 1).any():
        raise SystemExit("El modelo de elevación tiene celdas sin dato dentro del recuadro.")
    xmin, ymin, xmax, ymax = site.domain
    i0 = int(round(xmin - x0))
    j0 = int(round(ytop - ymax))
    W, H = int(xmax - xmin), int(ymax - ymin)
    sub = a[j0 : j0 + H, i0 : i0 + W]
    # filas desde el sur
    return np.flipud(sub).copy(), p


def dem_at(z: np.ndarray, x: float, y: float) -> float:
    """Cota bilineal en coordenadas locales [m] (centros de celda en +0,5)."""
    ny, nx = z.shape
    fx = min(max(x - 0.5, 0), nx - 1.000001)
    fy = min(max(y - 0.5, 0), ny - 1.000001)
    i, j = int(fx), int(fy)
    tx, ty = fx - i, fy - j
    return float(z[j, i] * (1 - tx) * (1 - ty) + z[j, i + 1] * tx * (1 - ty) + z[j + 1, i] * (1 - tx) * ty + z[j + 1, i + 1] * tx * ty)


def local(geom, site: Site):
    from shapely.affinity import translate

    return translate(geom, -site.domain[0], -site.domain[1])


def creek_axis(site: Site, z: np.ndarray, log: list[str]):
    gj = json.loads((INSUMOS / site.id / "hidrografia-pot.geojson").read_text(encoding="utf-8"))
    W, H = site.domain[2] - site.domain[0], site.domain[3] - site.domain[1]
    dom = box(0, 0, W, H)
    lines = []
    for f in gj["features"]:
        if f["properties"].get("nombre") != site.quebrada:
            continue
        g = local(shape(f["geometry"]), site).intersection(dom.buffer(-0.01))
        if g.is_empty:
            continue
        lines.extend(list(g.geoms) if hasattr(g, "geoms") else [g])
    merged = linemerge(MultiLineString([l for l in lines if isinstance(l, LineString)]))
    parts = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    main = max(parts, key=lambda l: l.length)
    # de aguas arriba a aguas abajo
    a, b = main.coords[0], main.coords[-1]
    if dem_at(z, *a) < dem_at(z, *b):
        main = LineString(list(main.coords)[::-1])
    log.append(f"Eje de la hidrografía POT dentro del dominio: {main.length:.1f} m ({len(parts)} tramo(s); se usa el más largo).")
    # talweg: mínimo en ±8 m perpendiculares cada metro
    n = max(2, int(main.length))
    pts, offs = [], []
    for k in range(n + 1):
        s = k * main.length / n
        p = main.interpolate(s)
        q = main.interpolate(min(main.length, s + 1.0))
        r = main.interpolate(max(0.0, s - 1.0))
        tx, ty = q.x - r.x, q.y - r.y
        L = math.hypot(tx, ty) or 1.0
        nx_, ny_ = -ty / L, tx / L
        best, bo = 1e9, 0.0
        for o in np.arange(-8.0, 8.01, 0.5):
            x, y = p.x + o * nx_, p.y + o * ny_
            if 0.5 <= x <= W - 0.5 and 0.5 <= y <= H - 0.5:
                zz = dem_at(z, x, y) + 0.004 * abs(o)  # leve preferencia por el eje POT en fondos planos
                if zz < best:
                    best, bo = zz, o
        pts.append((p.x + bo * nx_, p.y + bo * ny_))
        offs.append(bo)
    P = np.array(pts)
    P[:, 0] = uniform_filter1d(P[:, 0], 7, mode="nearest")
    P[:, 1] = uniform_filter1d(P[:, 1], 7, mode="nearest")
    axis = LineString(P)
    offs = np.abs(np.array(offs))
    log.append(f"Eje llevado al fondo del cauce del modelo de elevación: desplazamiento medio {offs.mean():.1f} m, máximo {offs.max():.1f} m.")
    return axis, offs


def burn_channel(z: np.ndarray, axis: LineString, log: list[str]):
    """Fondo continuo hacia aguas abajo a lo largo del eje (el agua no queda atrapada tras un terraplén)."""
    n = int(axis.length)
    s = np.linspace(0, axis.length, n + 1)
    prof = np.array([dem_at(z, *axis.interpolate(v).coords[0]) for v in s])
    enforced = np.minimum.accumulate(prof)
    # pendiente mínima de 0,5 % donde quedó plano
    for k in range(1, len(enforced)):
        enforced[k] = min(enforced[k], enforced[k - 1] - 0.005 * (s[k] - s[k - 1]))
    lowered = prof - enforced
    ny, nx = z.shape
    zb = z.copy()
    burned = 0
    for j in range(ny):
        for i in range(nx):
            c = Point(i + 0.5, j + 0.5)
            d = axis.distance(c)
            if d > BURN_HALF:
                continue
            sv = axis.project(c)
            e = float(np.interp(sv, s, enforced))
            if zb[j, i] > e:
                zb[j, i] = e
                burned += 1
    long_m = float(((lowered > 0.05).sum()) * (s[1] - s[0]))
    log.append(f"Paso del agua por el cauce: se rebajó el fondo en {long_m:.0f} m del eje (máximo {lowered.max():.2f} m; {burned} celdas) donde el perfil subía aguas abajo.")
    slope = (prof[0] - prof[-1]) / axis.length
    log.append(f"Perfil del fondo: de {prof[0]:.1f} m a {prof[-1]:.1f} m en {axis.length:.0f} m (pendiente media {slope * 100:.1f} %).")
    return zb, s, enforced, lowered, slope


def cross_section(z: np.ndarray, axis: LineString, sv: float, half: float = 15.0):
    p = axis.interpolate(sv)
    q = axis.interpolate(min(axis.length, sv + 1.5))
    r = axis.interpolate(max(0.0, sv - 1.5))
    tx, ty = q.x - r.x, q.y - r.y
    L = math.hypot(tx, ty) or 1.0
    nx_, ny_ = -ty / L, tx / L
    ofs = np.arange(-half, half + 0.01, 0.5)
    zz = np.array([dem_at(z, p.x + o * nx_, p.y + o * ny_) for o in ofs])
    return p, (nx_, ny_), ofs, zz


def bank_tops(zz: np.ndarray, ofs: np.ndarray, c: int, free: np.ndarray, max_d: float = 10.0):
    """Orillas a cada lado del talweg en una sección perpendicular (muestras cada 0,5 m): el borde de una terraza
    (después de un talud que sube más de 0,3 m en un metro, los 3 m siguientes suben menos de 0,45 m y están
    libres), el pie de una construcción o el terreno a `max_d` del talweg. Devuelve, por lado, (cota, distancia,
    motivo)."""
    out = []
    for side in (-1, 1):
        k, steep, why = c, False, "límite"
        while True:
            k2 = k + 2 * side
            if k2 < 0 or k2 >= len(ofs) or abs(ofs[k2] - ofs[c]) > max_d:
                break
            if not free[k2]:
                why = "construcción"
                break
            g = zz[k2] - zz[k]
            if g >= 0.3:
                steep = True
            elif steep:
                k3 = k + 6 * side
                if 0 <= k3 < len(ofs) and zz[k3] - zz[k] < 0.45 and all(free[min(k, k3) : max(k, k3) + 1]):
                    why = "terraza"
                    break
            k = k2
        out.append((float(zz[k]), float(abs(ofs[k] - ofs[c])), why))
    return out


def control_section(z: np.ndarray, axis: LineString, solid: np.ndarray, log: list[str]):
    """Sección de control: en la mitad central del tramo, entre las estaciones (cada metro) donde el eje va casi a
    lo largo de una fila o columna de la malla (coseno ≥ 0,96, para que la sección del modelo sea perpendicular
    al cauce), la de menor profundidad de cauce lleno (mediana móvil de 5 m): donde la quebrada se sale primero."""
    from scipy.ndimage import median_filter

    ny, nx = z.shape
    L = axis.length
    cands = []
    for sv in np.arange(L * 0.25, L * 0.75, 1.0):
        q, r = axis.interpolate(min(L, sv + 3)), axis.interpolate(max(0.0, sv - 3))
        tx, ty = q.x - r.x, q.y - r.y
        nn = math.hypot(tx, ty) or 1.0
        tx, ty = tx / nn, ty / nn
        p, (nx_, ny_), ofs, zz = cross_section(z, axis, sv, 12)
        xs, ys = p.x + ofs * nx_, p.y + ofs * ny_
        ii = np.clip(xs.astype(int), 0, nx - 1)
        jj = np.clip(ys.astype(int), 0, ny - 1)
        free = ~solid[jj, ii] & (xs >= 0) & (xs < nx) & (ys >= 0) & (ys < ny)
        c = len(ofs) // 2
        ct = min(range(c - 4, c + 5), key=lambda k: zz[k] if free[k] else 1e9)
        tops = bank_tops(zz, ofs, ct, free)
        cands.append({"sv": float(sv), "al": max(abs(tx), abs(ty)), "flow": "x" if abs(tx) >= abs(ty) else "y", "depth": min(tops[0][0], tops[1][0]) - float(zz[ct]), "tops": tops, "ct": ct, "p": p, "n": (nx_, ny_), "ofs": ofs, "zz": zz, "free": free})
    med = median_filter(np.array([c["depth"] for c in cands]), size=5, mode="nearest")
    ok = [k for k, c in enumerate(cands) if c["al"] >= 0.96]
    if not ok:
        ok = sorted(range(len(cands)), key=lambda k: -cands[k]["al"])[: max(1, len(cands) // 5)]
    kb = min(ok, key=lambda k: med[k])
    c = cands[kb]
    ct, ofs, zz, free = c["ct"], c["ofs"], c["zz"], c["free"]
    depth = float(min(4.0, max(0.5, c["depth"])))
    level = float(zz[ct]) + depth

    def reach(side):
        k = ct
        while 0 <= k + side < len(ofs) and free[k + side] and zz[k + side] < level:
            k += side
        return abs(ofs[k] - ofs[ct]) + 0.25

    bank_half = float(min(10.0, max(1.5, round((reach(-1) + reach(1)) / 2 * 2) / 2)))
    at = (c["p"].x + ofs[ct] * c["n"][0], c["p"].y + ofs[ct] * c["n"][1])
    low = 0 if c["tops"][0][0] <= c["tops"][1][0] else 1
    why = {"terraza": "borde de una terraza", "construcción": "pie de una construcción", "límite": "terreno a 10 m del fondo"}[c["tops"][low][2]]
    clip = "" if abs(depth - c["depth"]) < 1e-9 else f" (la estimación dio {c['depth']:.2f} m; se usa el límite de {'0,5' if depth < 1 else '4'} m)"
    log.append(f"Sección de control a {c['sv']:.0f} m de la entrada, donde el cauce se llena primero en la mitad central del tramo (entre las estaciones con el eje a menos de 16° de la malla): cauce lleno a {depth:.2f} m sobre el fondo{clip}, limitado por la orilla más baja ({why}, a {c['tops'][low][1]:.1f} m del talweg); semiancho del agua a ese nivel {bank_half:.1f} m.")
    return {"at": at, "flow": c["flow"], "depth": depth, "bank_half": bank_half, "sv": c["sv"]}


def fill_depressions(z: np.ndarray, solid: np.ndarray, log: list[str], eps: float = 0.001) -> np.ndarray:
    """Relleno de depresiones (inundación por prioridad, Barnes et al., 2014) con las construcciones como muros:
    toda celda libre queda con un camino descendente hasta un borde del dominio."""
    import heapq

    ny, nx = z.shape
    out = z.copy()
    seen = solid.copy().astype(bool)
    pq: list[tuple[float, int, int]] = []
    for j in range(ny):
        for i in range(nx):
            if (i in (0, nx - 1) or j in (0, ny - 1)) and not seen[j, i]:
                heapq.heappush(pq, (out[j, i], j, i))
                seen[j, i] = True
    while pq:
        h, j, i = heapq.heappop(pq)
        for jj, ii in ((j - 1, i), (j + 1, i), (j, i - 1), (j, i + 1)):
            if 0 <= jj < ny and 0 <= ii < nx and not seen[jj, ii]:
                seen[jj, ii] = True
                if out[jj, ii] <= h + eps:
                    out[jj, ii] = h + eps
                heapq.heappush(pq, (out[jj, ii], jj, ii))
    d = out - z
    d[solid] = 0
    filled = d > 0.01
    log.append(f"Depresiones del terreno sin salida entre construcciones (terrazas y patios que en la realidad se desaguan por tuberías): se rellenaron {int(filled.sum())} celdas, {float(d[filled].sum()):.0f} m³, hasta {float(d.max()):.2f} m.")
    return out


def raster_mask(polys_: list, nx: int, ny: int) -> np.ndarray:
    import shapely

    xs, ys = np.meshgrid(np.arange(nx) + 0.5, np.arange(ny) + 0.5)
    m = np.zeros((ny, nx), dtype=bool)
    for p in polys_:
        x0, y0, x1, y1 = p.bounds
        i0, i1 = max(0, int(x0)), min(nx, int(math.ceil(x1)) + 1)
        j0, j1 = max(0, int(y0)), min(ny, int(math.ceil(y1)) + 1)
        if i1 <= i0 or j1 <= j0:
            continue
        m[j0:j1, i0:i1] |= shapely.contains_xy(p, xs[j0:j1, i0:i1], ys[j0:j1, i0:i1])
    return m


def ortho(site: Site, nx: int, ny: int):
    """Ortofoto 2024 del dominio (0,25 m) y su color medio por celda de 1 m."""
    from PIL import Image

    p = INSUMOS / site.id / "ortofoto-2024-25cm.jpg"
    im = Image.open(p).convert("RGB")
    m = 40  # 10 m de margen a 4 px/m
    dom = im.crop((m, m, m + nx * 4, m + ny * 4))
    a = np.asarray(dom, dtype=np.float64)  # filas desde el norte
    cells = a.reshape(ny, 4, nx, 4, 3).mean(axis=(1, 3))[::-1]  # filas desde el sur
    return dom, cells, p


def vegetation(cells: np.ndarray, blocked: np.ndarray):
    """Índice de exceso de verde (Woebbecke et al., 1995) en coordenadas cromáticas: 2g − r − b."""
    s = cells.sum(axis=2) + 1e-9
    r, g, b = cells[..., 0] / s, cells[..., 1] / s, cells[..., 2] / s
    exg = 2 * g - r - b
    bright = cells.mean(axis=2)
    veg = (exg > 0.06) & ~blocked
    trees = veg & (exg > 0.1) & (bright < 120)
    return exg, veg, trees


def mask_polys(m: np.ndarray, min_area: float = 6.0):
    from shapely.geometry import box as sbox

    ny, nx = m.shape
    sq = [sbox(i, j, i + 1, j + 1) for j in range(ny) for i in range(nx) if m[j, i]]
    if not sq:
        return []
    u = unary_union(sq).simplify(0.5)
    return [q for q in polys(u) if q.area >= min_area]


def edge_of(pt, W, H):
    x, y = pt
    d = {"W": x, "E": W - x, "S": y, "N": H - y}
    return min(d, key=d.get)


def outward_slope(z: np.ndarray, edge: str) -> float:
    ny, nx = z.shape
    if edge == "W":
        g = np.abs(z[:, 3] - z[:, 0]) / 3
    elif edge == "E":
        g = np.abs(z[:, nx - 4] - z[:, nx - 1]) / 3
    elif edge == "S":
        g = np.abs(z[3, :] - z[0, :]) / 3
    else:
        g = np.abs(z[ny - 4, :] - z[ny - 1, :]) / 3
    return float(min(0.3, max(0.01, np.median(g))))


def polys(g):
    if g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [q for q in getattr(g, "geoms", []) if q.geom_type == "Polygon"]


def ring(p: Polygon, nd=2):
    c = list(p.exterior.coords)[:-1]
    return [[round(x, nd), round(y, nd)] for x, y in c]


def build(site: Site, with_creek: bool) -> dict:
    log: list[str] = []
    z0, dem_path = load_dem(site)
    ny, nx = z0.shape
    W, H = float(nx), float(ny)
    dom = box(0, 0, W, H)
    axis, offs = creek_axis(site, z0, log)
    if with_creek:
        z, s_prof, enforced, lowered, slope = burn_channel(z0, axis, log)
    else:
        z = z0
        log.append("La quebrada no se simula: el modelo de elevación no muestra un cauce abierto continuo (puede estar cubierta o canalizada bajo las construcciones) y no hay datos de esa obra. Su eje se dibuja como referencia.")
    # --------------------------------------------------------------- construcciones
    gj = json.loads((INSUMOS / site.id / "construcciones.geojson").read_text(encoding="utf-8"))
    gap = axis.buffer(GAP_HALF, cap_style=2) if with_creek else None
    seen, buildings, cut, dup, small = set(), [], 0, 0, 0
    feats = sorted(gj["features"], key=lambda f: f["properties"].get("objectid") or 0)
    for f in feats:
        g = make_valid(local(shape(f["geometry"]), site)).intersection(dom)
        key = g.wkb_hex if not g.is_empty else None
        if key in seen:
            dup += 1
            continue
        seen.add(key)
        parts = polys(g)
        if gap is not None and g.intersects(gap):
            parts = polys(g.difference(gap))
            cut += 1
        pr = f["properties"]
        floors = int(pr.get("numero_pisos") or 0)
        for k, q in enumerate(parts):
            q = q.simplify(0.15, preserve_topology=True)
            if q.area < 4:
                small += 1
                continue
            fl = floors if floors > 0 else 1
            buildings.append(
                {
                    "oid": pr.get("objectid"),
                    "poly": q,
                    "floors": fl,
                    "attrs": {"objectid": pr.get("objectid"), "numero_pisos": pr.get("numero_pisos"), "tipo_construccion": pr.get("tipo_construccion"), "cbml": pr.get("cbml"), "parte": k},
                }
            )
    # nombres: las más cercanas al cauce son «casas de la orilla»
    for b in buildings:
        b["dist"] = axis.distance(b["poly"])
    near = sorted([b for b in buildings if b["dist"] <= 6.0], key=lambda b: axis.project(b["poly"].representative_point()))
    for n, b in enumerate(near, 1):
        b["id"] = f"orilla-{n}"
    for b in buildings:
        b.setdefault("id", f"cons-{b['oid']}-{b['attrs']['parte']}")
    solid = raster_mask([b["poly"] for b in buildings], nx, ny)
    z = fill_depressions(z, solid, log)
    log.append(f"Construcciones: {len(feats)} registros; {dup} repetidas; {small} partes de menos de 4 m² descartadas; {len(buildings)} en el cálculo; {len(near)} a 6 m o menos del cauce" + (f"; {cut} cubrían el cauce y se dividieron con un paso de agua de {2 * GAP_HALF:.0f} m" if with_creek else "") + ".")
    # --------------------------------------------------------------- vías
    vj = json.loads((INSUMOS / site.id / "vias.geojson").read_text(encoding="utf-8"))
    roads, names = [], {}
    for f in vj["features"]:
        pr = f["properties"]
        g = local(shape(f["geometry"]), site)
        half = 2.5 if (pr.get("jerarquia_via") or 0) >= 50 else 1.5
        roads.append(g.buffer(half, cap_style=2, join_style=2))
        lab = (pr.get("label") or "").split("#")[0].strip()
        if lab:
            names[lab] = names.get(lab, 0) + g.intersection(dom).length
    road_u = unary_union(roads).intersection(dom) if roads else Polygon()
    surfaces = []
    # coberturas vegetales desde la ortofoto (fuera de construcciones y vías)
    img, cells_rgb, ortho_path = ortho(site, nx, ny)
    road_m = raster_mask(polys(road_u), nx, ny)
    exg, veg, trees_m = vegetation(cells_rgb, solid | road_m)
    for k, q in enumerate(mask_polys(veg & ~trees_m)):
        surfaces.append({"id": f"grama-{k}", "polygon": ring(q), "cover": "grama", "kind": "estimado", "label": "Pasto (ortofoto)"})
    for k, q in enumerate(mask_polys(trees_m)):
        surfaces.append({"id": f"arboles-{k}", "polygon": ring(q), "cover": "zona_verde", "kind": "estimado", "label": "Árboles (ortofoto)"})
    log.append(f"Coberturas desde la ortofoto 2024 (índice de exceso de verde por celda de 1 m): {int((veg & ~trees_m).sum())} m² de pasto y {int(trees_m.sum())} m² con árboles; el resto, concreto.")
    for k, q in enumerate(polys(road_u)):
        if q.area >= 6:
            surfaces.append({"id": f"via-{k}", "polygon": ring(q.simplify(0.2)), "cover": "asfalto", "kind": "estimado"})
    # árboles para el dibujo: uno cada ~4 m donde la ortofoto muestra copas
    tree_pts = []
    rng = np.random.default_rng(11)
    for j in range(1, ny - 1, 4):
        for i in range(1, nx - 1, 4):
            sub = trees_m[j : j + 4, i : i + 4]
            if sub.size and sub.mean() > 0.6:
                tree_pts.append([round(i + 1 + float(rng.uniform(0, 2)), 1), round(j + 1 + float(rng.uniform(0, 2)), 1)])
    log.append(f"Vías: {len(vj['features'])} ejes oficiales; calzada estimada de 5 m (3 m en las de menor jerarquía), {road_u.area:.0f} m² en asfalto.")
    # --------------------------------------------------------------- bordes, entrada y sección
    inflows, creek, probes, labels = [], None, [], []
    a0 = axis.coords[0]
    e_in = edge_of(a0, W, H)
    if with_creek:
        cs = control_section(z, axis, solid, log)
        bank_half = cs["bank_half"]
        coord = a0[1] if e_in in ("E", "W") else a0[0]
        span = bank_half + 2.0
        inflows.append({"id": "quebrada-arriba", "name": f"Agua que trae la {site.quebrada.replace('Q.', 'quebrada')} desde arriba", "edge": e_in, "from": round(max(0.0, coord - span), 2), "to": round(min(W if e_in in ('N', 'S') else H, coord + span), 2), "kind": "estimado"})
        sec = (round(cs["at"][0], 2), round(cs["at"][1], 2))
        # lecho del cauce con rugosidad de quebrada de montaña (cobertura «cauce»)
        bed = axis.buffer(bank_half, cap_style=2).intersection(dom)
        for k, q in enumerate(polys(bed)):
            if q.area >= 4:
                surfaces.append({"id": f"cauce-{k}", "polygon": ring(q.simplify(0.3)), "cover": "cauce", "kind": "estimado", "label": "Lecho de la quebrada"})
        # cuenca real hasta la entrada del sector
        from cuenca import delineate, runon_entries

        res = delineate(INSUMOS / site.id / BASIN_DEM[site.id], (site.domain[0] + a0[0], site.domain[1] + a0[1]))
        if res["touchesEdge"]:
            raise SystemExit("La cuenca toca el borde del modelo de elevación: amplíe el recuadro.")
        gauge_d = max(300.0, round(res["lengthM"] / 2, -1))
        basin = {"name": f"Cuenca de la {site.quebrada.replace('Q. ', 'quebrada ')} hasta el sector", "areaKm2": res["areaKm2"], "lengthM": res["lengthM"], "slopePct": res["slopePct"], "gauge": {"name": "Estación de nivel didáctica aguas arriba", "distanceM": gauge_d, "celerityMs": 4}}
        log.append(f"Cuenca hasta la entrada del sector (D8 sobre el modelo de elevación de {res['cellM']:.0f} m, con relleno de depresiones): {res['areaKm2']:.3f} km², longitud hidráulica {res['lengthM']:.0f} m, pendiente media {res['slopePct']:.1f} %, desde {res['headZ']:.0f} m hasta {res['outletZ']:.0f} m. La estación de nivel es didáctica, a {gauge_d:.0f} m por el cauce.")
        # agua de las laderas vecinas que entra por los bordes
        coord_in = a0[1] if e_in in ("E", "W") else a0[0]
        for k, g in enumerate(runon_entries(res, site.domain, [(e_in, coord_in, bank_half + 8)])):
            if g["areaM2"] < 200:
                continue
            L = W if g["edge"] in ("N", "S") else H
            inflows.append({"id": f"ladera-{k}", "name": f"Agua de la ladera vecina (borde {g['edge']})", "edge": g["edge"], "from": round(max(0.0, g["center"] - 5), 1), "to": round(min(L, g["center"] + 5), 1), "kind": "estimado", "rainAreaM2": round(g["areaM2"], 0), "runoffC": RUNOFF_C})
        ro = [q for q in inflows if q.get("rainAreaM2")]
        log.append(f"Agua de las laderas vecinas: {len(ro)} entradas por los bordes con {sum(q['rainAreaM2'] for q in ro) / 1e4:.2f} ha de fuera del sector (método racional, C = {RUNOFF_C}).")
        creek = {
            "name": site.quebrada.replace("Q. ", "Quebrada "),
            "inflowId": "quebrada-arriba",
            "axis": [[round(x, 2), round(y, 2)] for x, y in axis.simplify(0.5).coords],
            "section": {"at": list(sec), "halfWidthM": 12, "bankHalfWidthM": bank_half, "name": "Sección de control", "flowAxis": cs["flow"], "bankDepthM": round(cs["depth"], 2)},
            "baseM3s": round(max(0.05, 0.03 * res["areaKm2"]), 2),
            "basin": basin,
        }
        probes.append({"id": "seccion", "name": "Quebrada (sección de control)", "at": list(sec)})
    # salidas: todos los bordes, salvo el tramo por donde entra la quebrada
    outlets = []
    for e in ("N", "S", "E", "W"):
        L = W if e in ("N", "S") else H
        segs = [(0.0, L)]
        for f in sorted([q for q in inflows if q["edge"] == e], key=lambda q: q["from"]):
            a, b = f["from"] - 1.0, f["to"] + 1.0
            nsegs = []
            for fr, to in segs:
                if b <= fr or a >= to:
                    nsegs.append((fr, to))
                    continue
                if a > fr:
                    nsegs.append((fr, a))
                if b < to:
                    nsegs.append((b, to))
            segs = nsegs
        for k, (fr, to) in enumerate(segs):
            if to - fr >= 2:
                outlets.append({"id": f"borde-{e}-{k}", "name": f"Borde {e}", "edge": e, "from": round(fr, 2), "to": round(to, 2), "slope": round(outward_slope(z, e), 3), "kind": "estimado"})
    # medidores: orilla más cercana y una calle
    if near:
        b = min(near, key=lambda b: b["dist"])
        q = b["poly"]
        pt = axis.interpolate(axis.project(q.representative_point()))
        # punto libre entre la casa y el cauce
        nearest = q.exterior.interpolate(q.exterior.project(pt))
        mx, my = (nearest.x + pt.x) / 2, (nearest.y + pt.y) / 2
        probes.append({"id": "orilla", "name": "Frente a la casa más cercana a la quebrada" if with_creek else "Junto al eje de la quebrada cubierta", "at": [round(mx, 2), round(my, 2)]})
    if names:
        main = max(names, key=names.get)
        geo = [local(shape(f["geometry"]), site).intersection(dom) for f in vj["features"] if (f["properties"].get("label") or "").split("#")[0].strip() == main]
        mline = unary_union(geo)
        mp = mline.interpolate(0.5, normalized=True)
        probes.append({"id": "esquina", "name": f"Calle ({main})", "at": [round(mp.x, 2), round(mp.y, 2)]})
        labels.append({"id": "calle", "text": main.replace("CL ", "Calle ").replace("CR ", "Carrera "), "at": [round(mp.x, 2), round(mp.y, 2)], "priority": 4})
        others = sorted(names, key=names.get, reverse=True)[1:3]
        for k, nm in enumerate(others):
            geo = [local(shape(f["geometry"]), site).intersection(dom) for f in vj["features"] if (f["properties"].get("label") or "").split("#")[0].strip() == nm]
            mp = unary_union(geo).interpolate(0.5, normalized=True)
            labels.append({"id": f"calle-{k}", "text": nm.replace("CL ", "Calle ").replace("CR ", "Carrera "), "at": [round(mp.x, 2), round(mp.y, 2)], "priority": 3})
    mid = axis.interpolate(0.5, normalized=True)
    labels.append({"id": "quebrada", "text": site.quebrada.replace("Q. ", "Quebrada ") + ("" if with_creek else " (cubierta)"), "at": [round(mid.x, 2), round(mid.y, 2)], "priority": 5})
    labels.append({"id": "barrio", "text": f"Barrio {site.barrio}", "at": [round(W * 0.2, 1), round(H * 0.85, 1)], "priority": 2})
    # --------------------------------------------------------------- ensamblaje
    tr = Transformer.from_crs("EPSG:9377", "EPSG:4326", always_xy=True)
    cx, cy = site.domain[0] + W / 2, site.domain[1] + H / 2
    lon, lat = tr.transform(cx, cy)
    man = json.loads((INSUMOS / "manifiesto.json").read_text(encoding="utf-8"))
    srcs = []
    for f in man["files"]:
        if f["site"] != site.id:
            continue
        local_sha = sha(INSUMOS / f["name"])
        if local_sha != f["sha256"]:
            raise SystemExit(f"{f['name']}: el SHA-256 no coincide con el manifiesto.")
        srcs.append({"label": f"{f['layer']} · consultado {f['receivedAt'][:10]} · SHA-256 {f['sha256'][:16]}…", "url": f["url"].split("?")[0]})
    vis = mid.coords[0]
    eye = axis.interpolate(min(axis.length, axis.length * 0.75)).coords[0]
    scen = {
        "format": "medellin-lluvia/escenario",
        "version": 1,
        "id": site.id,
        "title": site.title,
        "shortTitle": site.short,
        "summary": site.summary,
        "provenance": {
            "kind": "datos-reales",
            "badge": "Datos oficiales con elementos estimados",
            "statement": f"Barrio {site.barrio}, {site.comuna}. Terreno (modelo digital de elevación 2024, 1 m), construcciones, vías y eje de la quebrada de los servicios oficiales de mapas de la Alcaldía de Medellín. Alturas, anchos de vía, coberturas del suelo y parámetros hidráulicos son estimados; no hay red de alcantarillado levantada. Es un ejercicio educativo: no es un estudio de amenaza ni un pronóstico.",
            "layers": [
                {"layer": "Terreno", "kind": "real", "note": "Modelo digital de elevación de Medellín 2024 (1 m, EPSG:9377), sin remuestrear dentro del dominio." + (" " + next(l for l in log if l.startswith("Paso del agua")) if with_creek else "")},
                {"layer": "Construcciones", "kind": "real", "note": "Huellas oficiales (Construccion, capa 15). Altura estimada: número de pisos × 3 m." + (" Las construcciones que cubren el cauce se dividen en el cálculo para dejar pasar el agua." if with_creek else "")},
                {"layer": "Vías", "kind": "estimado", "note": "Ejes oficiales (Vias Medellin, capa 14); el ancho de calzada es estimado."},
                {"layer": "Quebrada", "kind": "real" if with_creek else "estimado", "note": ("Eje de la hidrografía POT (escala 1:25 000) llevado al fondo del cauce del modelo de elevación. La creciente es de ejemplo: no es un caudal medido ni un pronóstico." if with_creek else "Eje de la hidrografía POT dibujado como referencia; el cauce no se ve abierto en el terreno y no se simula su creciente.")},
                {"layer": "Coberturas del suelo", "kind": "estimado", "note": ("Retiro de la quebrada con grama (8 m a cada lado); " if with_creek else "") + "el resto, concreto. Parámetros de literatura general, no calibrados."},
                {"layer": "Alcantarillado", "kind": "estimado", "note": "No se incluye: la red no está levantada en estos datos y no se inventa."},
                {"layer": "Depresiones del terreno", "kind": "estimado", "note": next(l for l in log if l.startswith("Depresiones"))},
                {"layer": "Patios interiores cerrados", "kind": "estimado", "note": "Los espacios libres rodeados por construcciones, sin camino hasta un borde en la malla de cálculo, se tratan como parte de la construcción vecina: su lluvia sale por la bajante (en la realidad, por las tuberías de las casas)."},
                {"layer": "Bordes", "kind": "estimado", "note": "El agua sale por los cuatro bordes con profundidad normal y la pendiente local; no entra agua de las laderas vecinas."},
            ],
            "sources": [{"label": "Alcaldía de Medellín, servicios de mapas (servidormapas). Respuestas guardadas en tools/geo/insumos con su SHA-256.", "url": "https://www.medellin.gov.co/servidormapas/rest/services"}] + srcs,
            "generatedBy": "tools/geo/sector_real.py",
            "generatedAt": man.get("createdAt"),
            "log": log,
        },
        "extent": {"crs": "EPSG:9377", "origin": [site.domain[0], site.domain[1]], "lonLat": [round(lon, 6), round(lat, 6)], "width": W, "height": H},
        "units": {"length": "m", "elevation": "m", "rain": "mm/h", "time": "s", "flow": "L/s"},
        "resolutions": [1, 2],
        "defaultResolution": 1,
        "terrain": {"kind": "raster", "dx": 1, "nx": nx, "ny": ny, "values": [round(float(v), 2) for v in z.ravel()], "datum": "Cotas del modelo digital de elevación de Medellín 2024 (datum vertical según el servicio; verificar)", "verticalAccuracy": "no declarada en el servicio"},
        "defaultCover": "concreto",
        "surfaces": surfaces,
        "bowls": [],
        "buildings": [
            {"id": b["id"], "polygon": ring(b["poly"]), "floors": b["floors"], "heightM": round(b["floors"] * FLOOR_M, 1), "downspout": [round(c, 2) for c in b["poly"].representative_point().coords[0]], "style": "ladrillo" if b["floors"] <= 3 else "revoque", "kind": "real", "attrs": b["attrs"]}
            for b in buildings
        ],
        "drains": [],
        "outlets": outlets,
        "inflows": inflows,
        "zones": [],
        "gardens": [],
        "tanks": [],
        "probes": probes,
        "labels": labels,
        "streetView": {"eye": [round(eye[0], 1), round(eye[1], 1)], "look": [round(vis[0], 1), round(vis[1], 1)]},
        "pipes": [],
        "defaults": {"scenarioId": site.id, "dx": 1, "rain": {"intensityMmH": 60, "durationMin": 20, "pattern": "constante", "spatial": "uniforme", "center": [round(W / 2, 1), round(H / 2, 1)], "radiusM": 30}, "simMinutes": 35, "soilInitial": "seco", "inflowLps": 0, "seed": 7},
        "closePockets": True,
        "engine": {"name": "inercial-local-urbano", "version": "1.0.0"},
        "seed": 7,
    }
    import base64
    import io

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80, optimize=True, progressive=True)
    scen["imagery"] = {"href": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"), "x0": 0, "y0": 0, "x1": W, "y1": H, "label": f"Ortofoto Medellín 2024 (0,25 m), Alcaldía de Medellín · SHA-256 del original {sha(ortho_path)[:16]}…"}
    scen["decor"] = {"markings": [], "trees": tree_pts, "lamps": []}
    if creek:
        scen["creek"] = creek
    else:
        scen["decor"]["creekRef"] = [[round(x, 2), round(y, 2)] for x, y in axis.simplify(0.5).coords]
    return scen


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True, choices=sorted(SITES))
    ap.add_argument("--creek", choices=["auto", "si", "no"], default="auto", help="Simular la quebrada (auto: si el cauce se ve abierto en el terreno)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    site = SITES[a.site]
    z, _ = load_dem(site)
    log: list[str] = []
    axis, _ = creek_axis(site, z, log)
    zb, *_ = burn_channel(z, axis, log)
    ok = tot = 0
    for sv in np.arange(3, axis.length - 3, 5):
        p, n_, ofs, zz = cross_section(zb, axis, sv, 15)
        c = len(ofs) // 2
        tot += 1
        ok += zz[:c].max() - zz[c] >= 1.0 and zz[c + 1 :].max() - zz[c] >= 1.0
    open_frac = ok / max(1, tot)
    with_creek = a.creek == "si" or (a.creek == "auto" and open_frac >= 0.8)
    scen = build(site, with_creek)
    scen["provenance"]["log"].insert(0, f"Cauce abierto en el terreno: {open_frac * 100:.0f} % de las secciones cada 5 m tienen las dos orillas al menos 1 m sobre el fondo en 15 m (umbral 80 % para simular la quebrada).")
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text(json.dumps(scen, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{a.out}: quebrada {'simulada' if with_creek else 'de referencia'}; {len(scen['buildings'])} edificaciones; {len(scen['surfaces'])} superficies")
    for l in scen["provenance"]["log"]:
        print("  ·", l)


if __name__ == "__main__":
    main()
