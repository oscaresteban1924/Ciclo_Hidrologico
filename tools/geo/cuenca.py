#!/usr/bin/env python3
"""Delimitación de la cuenca de una quebrada hasta el punto donde entra a un sector.

Sobre un modelo de elevación grueso (5 o 10 m, EPSG:9377) de los servicios oficiales:
  1. relleno de depresiones por inundación por prioridad (Barnes et al., 2014), con salida por los bordes;
  2. dirección de flujo D8 (O'Callaghan y Mark, 1984) hacia la vecina de mayor pendiente;
  3. acumulación de flujo; la salida se ajusta a la celda de mayor acumulación a 40 m o menos del punto dado;
  4. cuenca = celdas que drenan a la salida; área, longitud hidráulica (camino de flujo más largo hasta la
     salida), pendiente media de la cuenca (promedio de la pendiente de cada celda) y si toca el borde del
     recuadro (en ese caso la cuenca puede estar incompleta: se informa).
"""

from __future__ import annotations

import heapq
import math
from pathlib import Path

import numpy as np
import tifffile

D8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def load(path: Path):
    with tifffile.TiffFile(path) as t:
        pg = t.pages[0]
        a = pg.asarray().astype(np.float64)
        tags = {k.name: k.value for k in pg.tags.values()}
    sx = float(tags["ModelPixelScaleTag"][0])
    x0, ytop = float(tags["ModelTiepointTag"][3]), float(tags["ModelTiepointTag"][4])
    nodata = ~np.isfinite(a) | (a <= 0)
    return a, nodata, sx, x0, ytop


def delineate(path: Path, outlet_xy: tuple[float, float], snap_m: float = 40.0) -> dict:
    z, nod, d, x0, ytop = load(path)
    ny, nx = z.shape
    # 1) relleno por prioridad desde los bordes y las celdas vecinas de las sin dato
    fill = z.copy()
    seen = nod.copy()
    pq: list[tuple[float, int, int]] = []
    for j in range(ny):
        for i in range(nx):
            if seen[j, i]:
                continue
            edge = i in (0, nx - 1) or j in (0, ny - 1) or any(0 <= j + a < ny and 0 <= i + b < nx and nod[j + a, i + b] for a, b in D8)
            if edge:
                heapq.heappush(pq, (fill[j, i], j, i))
                seen[j, i] = True
    eps = 1e-4
    while pq:
        h, j, i = heapq.heappop(pq)
        for a, b in D8:
            jj, ii = j + a, i + b
            if 0 <= jj < ny and 0 <= ii < nx and not seen[jj, ii]:
                seen[jj, ii] = True
                if fill[jj, ii] <= h + eps:
                    fill[jj, ii] = h + eps
                heapq.heappush(pq, (fill[jj, ii], jj, ii))
    # 2) D8
    down = -np.ones((ny, nx), dtype=np.int64)
    for j in range(ny):
        for i in range(nx):
            if nod[j, i]:
                continue
            best, bk = 0.0, -1
            for a, b in D8:
                jj, ii = j + a, i + b
                if 0 <= jj < ny and 0 <= ii < nx and not nod[jj, ii]:
                    s = (fill[j, i] - fill[jj, ii]) / (d * math.hypot(a, b))
                    if s > best:
                        best, bk = s, jj * nx + ii
            down[j, i] = bk
    # 3) acumulación (orden por cota descendente)
    order = np.argsort(-fill, axis=None)
    acc = np.ones(ny * nx)
    acc[nod.ravel()] = 0
    dflat = down.ravel()
    for k in order:
        t = dflat[k]
        if t >= 0:
            acc[t] += acc[k]
    # salida ajustada
    ox, oy = outlet_xy
    oi, oj = int((ox - x0) / d), int((ytop - oy) / d)
    r = int(math.ceil(snap_m / d))
    best, ok_ = -1.0, oj * nx + oi
    for j in range(max(0, oj - r), min(ny, oj + r + 1)):
        for i in range(max(0, oi - r), min(nx, oi + r + 1)):
            if math.hypot(i - oi, j - oj) * d <= snap_m and acc[j * nx + i] > best:
                best, ok_ = acc[j * nx + i], j * nx + i
    # 4) cuenca: celdas cuyo camino llega a la salida; distancia de flujo hasta la salida
    up: dict[int, list[int]] = {}
    for k in range(ny * nx):
        t = dflat[k]
        if t >= 0:
            up.setdefault(t, []).append(k)
    mask = np.zeros(ny * nx, dtype=bool)
    dist = np.zeros(ny * nx)
    stack = [ok_]
    mask[ok_] = True
    while stack:
        k = stack.pop()
        for q in up.get(k, []):
            if not mask[q]:
                mask[q] = True
                a, b = q // nx - k // nx, q % nx - k % nx
                dist[q] = dist[k] + d * math.hypot(a, b)
                stack.append(q)
    m2 = mask.reshape(ny, nx)
    gy, gx = np.gradient(np.where(nod, np.nan, z), d)
    slope = np.hypot(gx, gy)
    touches = bool(m2[0, :].any() or m2[-1, :].any() or m2[:, 0].any() or m2[:, -1].any() or (m2 & np.roll(nod, 1, 0)).any() or (m2 & np.roll(nod, 1, 1)).any())
    area_km2 = float(mask.sum() * d * d / 1e6)
    jo, io = divmod(ok_, nx)
    far = int(np.argmax(np.where(mask, dist, -1)))
    jf, if_ = divmod(far, nx)
    return {
        "areaKm2": round(area_km2, 3),
        "lengthM": round(float(dist[far]), 0),
        "slopePct": round(float(np.nanmean(slope[m2]) * 100), 1),
        "outlet": [round(x0 + (io + 0.5) * d, 1), round(ytop - (jo + 0.5) * d, 1)],
        "outletZ": round(float(z[jo, io]), 1),
        "headZ": round(float(z[jf, if_]), 1),
        "head": [round(x0 + (if_ + 0.5) * d, 1), round(ytop - (jf + 0.5) * d, 1)],
        "touchesEdge": touches,
        "cellM": d,
        "mask": m2,
        "dist": dist.reshape(ny, nx),
        "origin": (x0, ytop),
        "down": down,
        "acc": acc.reshape(ny, nx),
        "nodata": nod,
    }


def runon_entries(res: dict, domain: tuple[float, float, float, float], skip: list[tuple[str, float, float]]) -> list[dict]:
    """Agua de las laderas vecinas: celdas de fuera del dominio cuya celda de aguas abajo queda dentro. Cada una
    trae el área que acumula (sin la cuenca de la quebrada, que entra aparte). Se agrupan por borde en tramos."""
    d = res["cellM"]
    x0, ytop = res["origin"]
    down, acc, mask = res["down"], res["acc"], res["mask"]
    ny, nx = acc.shape
    xmin, ymin, xmax, ymax = domain

    def inside(i, j):
        x, y = x0 + (i + 0.5) * d, ytop - (j + 0.5) * d
        return xmin <= x <= xmax and ymin <= y <= ymax

    entries = []
    for j in range(ny):
        for i in range(nx):
            if inside(i, j) or res["nodata"][j, i] or mask[j, i]:
                continue
            t = down[j, i]
            if t < 0:
                continue
            ti, tj = t % nx, t // nx
            if not inside(ti, tj):
                continue
            x, y = x0 + (ti + 0.5) * d, ytop - (tj + 0.5) * d
            # borde por donde entra y posición a lo largo del borde (coordenadas locales)
            lx, ly = x - xmin, y - ymin
            dist = {"W": lx, "E": (xmax - xmin) - lx, "S": ly, "N": (ymax - ymin) - ly}
            e = min(dist, key=dist.get)
            pos = ly if e in ("W", "E") else lx
            if any(e == se and abs(pos - sp) <= sw for se, sp, sw in skip):
                continue
            entries.append({"edge": e, "pos": pos, "areaM2": float(acc[j, i] * d * d)})
    # agrupar por borde: tramos de 20 m alrededor de cada grupo de entradas
    out = []
    for e in ("N", "S", "E", "W"):
        es = sorted([q for q in entries if q["edge"] == e], key=lambda q: q["pos"])
        group: list[dict] = []
        for q in es + [None]:
            if q is not None and (not group or q["pos"] - group[-1]["pos"] <= 15):
                group.append(q)
                continue
            if group:
                a = sum(g["areaM2"] for g in group)
                c = sum(g["pos"] * g["areaM2"] for g in group) / max(a, 1e-9)
                out.append({"edge": e, "center": c, "areaM2": a})
            group = [q] if q is not None else []
    return out
