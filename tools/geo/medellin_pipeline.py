#!/usr/bin/env python3
"""
Pipeline reproducible: cartografía de Medellín → escenario del «laboratorio de lluvia».

Prepara, ANTES de usar la aplicación, un archivo de escenario (formato medellin-lluvia/escenario v1)
para un sector pequeño. No descarga toda la ciudad: consulta solo la caja del sector, con paginación.

Pasos
  1. Metadatos del servicio (?f=pjson): campos, sistema de referencia, límite de registros, paginación.
  2. Verificación del CRS: la descripción de la capa menciona WGS84/UTM 18N, pero la referencia publicada
     puede ser EPSG:9377 (MAGNA-SIRGAS 2018 / Origen-Nacional). El pipeline compara lo que declara el servicio
     con lo esperado y se detiene si no coincide, salvo que se indique --assume-crs explícitamente.
  3. Consulta acotada por caja con paginación (resultOffset/resultRecordCount); cada página se guarda con su
     hash SHA-256 para la trazabilidad.
  4. Reparación de geometrías (make_valid), separación de multipolígonos, descarte de astillas, recorte a la
     caja y simplificación.
  5. Homogeneización de CRS y unidades: todo a EPSG:9377 en metros; comprobación de que el centro cae en Medellín.
  6. Alturas: agl si es plausible; si no, n_pisos × 3 m (estimado); si no hay dato, 6 m (marcado «sin dato»).
  7. Terreno: DEM (GeoTIFF con rasterio, o ASCII Grid .asc sin dependencias) remuestreado a la malla del
     sector; se registran resolución, datum vertical y exactitud declarada.
  8. Coordenadas locales (origen en la esquina suroeste), exportación y registro de procedencia.
  9. Complemento OSM opcional (archivo GeoJSON local), con atribución ODbL.

Nunca inventa sumideros, tuberías ni bordillos: si no hay datos levantados, el escenario no los trae, o los
trae marcados como «hipotético» solo si se pide con --hypothetical-inlets.

Uso típico
  python3 medellin_pipeline.py \\
      --layer https://www.medellin.gov.co/servidormapas/rest/services/mapas_nacionales/VM_Cartografia_City_Urban_2022/MapServer/9 \\
      --bbox -75.5795 6.2440 -75.5775 6.2458 --bbox-crs EPSG:4326 \\
      --dem dem_sector.tif --dem-datum "alturas sobre el nivel medio del mar (verificar)" \\
      --outlet E:20:40:0.03 --id mi-sector --title "Mi sector" --out mi-sector.json

Requisitos: Python ≥ 3.10, pyproj, shapely (≥ 2). Opcional: rasterio para GeoTIFF.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any

from pyproj import CRS, Transformer
from shapely.geometry import MultiPolygon, Polygon, box, shape
from shapely.validation import make_valid

TARGET_CRS = "EPSG:9377"
EXPECTED_FIELDS = ("agl", "n_pisos", "n_pisostot")
# Caja amplia de Medellín y su área urbana [lon, lat] para comprobar el CRS
MEDELLIN_LONLAT = (-75.72, 6.13, -75.47, 6.37)
PIPELINE_VERSION = "1.0.0"


@dataclass
class Log:
    items: list[dict[str, Any]] = field(default_factory=list)

    def add(self, step: str, msg: str, level: str = "info", **extra: Any) -> None:
        self.items.append({"paso": step, "nivel": level, "mensaje": msg, **extra})
        print(f"[{level}] {step}: {msg}", file=sys.stderr)


def http_json(url: str, params: dict[str, Any], timeout: float = 60.0) -> tuple[dict[str, Any], str]:
    q = urllib.parse.urlencode(params)
    full = f"{url}?{q}"
    req = urllib.request.Request(full, headers={"User-Agent": "medellin-lluvia-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (URL controlada por el usuario)
        raw = r.read()
    return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()


def service_crs(meta: dict[str, Any]) -> str | None:
    sr = meta.get("extent", {}).get("spatialReference") or meta.get("spatialReference") or {}
    wkid = sr.get("latestWkid") or sr.get("wkid")
    if wkid:
        return f"EPSG:{wkid}"
    wkt = sr.get("wkt")
    if wkt:
        try:
            epsg = CRS.from_wkt(wkt).to_epsg()
            return f"EPSG:{epsg}" if epsg else None
        except Exception:  # noqa: BLE001
            return None
    return None


def check_crs(meta: dict[str, Any], assume: str | None, log: Log) -> str:
    declared = service_crs(meta)
    desc = (meta.get("description") or "") + " " + (meta.get("copyrightText") or "")
    mentions_utm = "UTM" in desc.upper() or "WGS84" in desc.upper().replace(" ", "")
    log.add("crs", f"CRS declarado por el servicio: {declared}; la descripción menciona UTM/WGS84: {mentions_utm}")
    if assume:
        if declared and declared != assume:
            log.add("crs", f"Se usa --assume-crs {assume}, distinto del declarado {declared}. Decisión manual registrada.", "advertencia")
        return assume
    if declared is None:
        raise SystemExit("El servicio no declara su sistema de referencia: use --assume-crs (p. ej. EPSG:9377) después de verificarlo.")
    if mentions_utm and declared == "EPSG:9377":
        log.add("crs", "La descripción y el CRS declarado no coinciden (UTM 18N vs EPSG:9377). Se usa el declarado y se pide verificar con un punto de control.", "advertencia")
    return declared


def to_target(geom, src: str):
    if src == TARGET_CRS:
        return geom
    tr = Transformer.from_crs(src, TARGET_CRS, always_xy=True)
    from shapely.ops import transform

    return transform(tr.transform, geom)


def bbox_in_target(b: list[float], crs: str) -> tuple[float, float, float, float]:
    if crs == TARGET_CRS:
        return b[0], b[1], b[2], b[3]
    tr = Transformer.from_crs(crs, TARGET_CRS, always_xy=True)
    xs, ys = [], []
    for x, y in ((b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])):
        X, Y = tr.transform(x, y)
        xs.append(X)
        ys.append(Y)
    return min(xs), min(ys), max(xs), max(ys)


def check_in_medellin(x: float, y: float, log: Log) -> tuple[float, float]:
    tr = Transformer.from_crs(TARGET_CRS, "EPSG:4326", always_xy=True)
    lon, lat = tr.transform(x, y)
    ok = MEDELLIN_LONLAT[0] <= lon <= MEDELLIN_LONLAT[2] and MEDELLIN_LONLAT[1] <= lat <= MEDELLIN_LONLAT[3]
    log.add("crs", f"Centro del sector: lon {lon:.5f}, lat {lat:.5f} ({'dentro' if ok else 'FUERA'} de la caja de Medellín)", "info" if ok else "error")
    if not ok:
        raise SystemExit("El centro del sector no cae en Medellín: revise el CRS de la caja o del servicio.")
    return lon, lat


def fetch_buildings(layer: str, env: tuple[float, float, float, float], page: int, max_records: int, log: Log, cache: str) -> tuple[list[dict[str, Any]], list[dict[str, str]], dict[str, Any]]:
    meta, meta_hash = http_json(layer, {"f": "pjson"})
    fields = [f.get("name") for f in meta.get("fields", [])]
    log.add("metadatos", f"Capa «{meta.get('name')}»; {len(fields)} campos; maxRecordCount = {meta.get('maxRecordCount')}; paginación = {meta.get('advancedQueryCapabilities', {}).get('supportsPagination')}")
    missing = [f for f in EXPECTED_FIELDS if f not in fields]
    if missing:
        log.add("metadatos", f"Faltan campos esperados: {missing}. Se usarán alturas estimadas donde falten.", "advertencia")
    oid = next((f.get("name") for f in meta.get("fields", []) if f.get("type") == "esriFieldTypeOID"), "OBJECTID")
    page = min(page, int(meta.get("maxRecordCount") or page))
    pages: list[dict[str, str]] = [{"url": f"{layer}?f=pjson", "sha256": meta_hash}]
    feats: list[dict[str, Any]] = []
    offset = 0
    out_fields = ",".join([oid] + [f for f in EXPECTED_FIELDS if f in fields])
    while True:
        params = {
            "where": "1=1",
            "geometry": f"{env[0]},{env[1]},{env[2]},{env[3]}",
            "geometryType": "esriGeometryEnvelope",
            "inSR": TARGET_CRS.split(":")[1],
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": out_fields,
            "returnGeometry": "true",
            "outSR": TARGET_CRS.split(":")[1],
            "orderByFields": oid,
            "resultOffset": offset,
            "resultRecordCount": page,
            "f": "geojson",
        }
        data, h = http_json(f"{layer}/query", params)
        name = os.path.join(cache, f"pagina-{offset:06d}.geojson")
        with open(name, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        got = data.get("features", [])
        pages.append({"url": f"{layer}/query (offset {offset})", "sha256": h, "archivo": os.path.basename(name), "registros": str(len(got))})
        feats.extend(got)
        log.add("consulta", f"Página con offset {offset}: {len(got)} registros")
        more = data.get("exceededTransferLimit") or data.get("properties", {}).get("exceededTransferLimit")
        if not got or (not more and len(got) < page):
            break
        offset += len(got)
        if len(feats) >= max_records:
            log.add("consulta", f"Se alcanzó el máximo de {max_records} registros: el sector es demasiado grande.", "error")
            raise SystemExit("Reduzca la caja del sector: este pipeline no está pensado para descargar la ciudad.")
    return feats, pages, meta


def repair(features: list[dict[str, Any]], clip: Polygon, src_crs: str, simplify: float, log: Log) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    stats = {"reparadas": 0, "astillas": 0, "partes": 0, "fuera": 0}
    for f in features:
        g = f.get("geometry")
        if not g:
            continue
        geom = to_target(shape(g), src_crs)
        if not geom.is_valid:
            geom = make_valid(geom)
            stats["reparadas"] += 1
        parts = list(geom.geoms) if isinstance(geom, MultiPolygon) or hasattr(geom, "geoms") else [geom]
        for part in parts:
            if not isinstance(part, Polygon):
                continue
            part = part.intersection(clip)
            if part.is_empty:
                stats["fuera"] += 1
                continue
            if isinstance(part, MultiPolygon):
                sub = list(part.geoms)
            else:
                sub = [part] if isinstance(part, Polygon) else []
            for p in sub:
                if p.area < 4.0:
                    stats["astillas"] += 1
                    continue
                p = p.simplify(simplify, preserve_topology=True)
                stats["partes"] += 1
                out.append({"geom": p, "props": f.get("properties", {}) or {}})
    log.add("geometria", f"Polígonos útiles: {stats['partes']}; reparados: {stats['reparadas']}; astillas (< 4 m²) descartadas: {stats['astillas']}; fuera de la caja: {stats['fuera']}")
    return out


def height_of(props: dict[str, Any]) -> tuple[float, int, str]:
    agl = props.get("agl")
    pisos = props.get("n_pisos") or props.get("n_pisostot")
    try:
        agl = float(agl) if agl is not None else None
    except (TypeError, ValueError):
        agl = None
    try:
        pisos = int(float(pisos)) if pisos is not None else None
    except (TypeError, ValueError):
        pisos = None
    if agl is not None and 2.0 <= agl <= 250.0:
        return agl, pisos or max(1, round(agl / 3.0)), "real (agl)"
    if pisos and 1 <= pisos <= 80:
        return pisos * 3.0, pisos, "estimado (n_pisos × 3 m)"
    return 6.0, 2, "sin dato (6 m supuestos)"


def read_dem(path: str, log: Log) -> tuple[Any, str]:
    """Devuelve una función z(X, Y) en EPSG:9377 y una descripción."""
    if path.lower().endswith(".asc"):
        with open(path, encoding="utf-8") as fh:
            head = {}
            for _ in range(6):
                k, v = fh.readline().split()
                head[k.lower()] = float(v)
            rows = [list(map(float, line.split())) for line in fh if line.strip()]
        ncols, nrows = int(head["ncols"]), int(head["nrows"])
        cs = head["cellsize"]
        x0 = head.get("xllcorner", head.get("xllcenter", 0) - cs / 2)
        y0 = head.get("yllcorner", head.get("yllcenter", 0) - cs / 2)
        nod = head.get("nodata_value", -9999)
        crs = os.environ.get("DEM_CRS", TARGET_CRS)

        def z(X: float, Y: float) -> float:
            fx = (X - x0) / cs - 0.5
            fy = (y0 + nrows * cs - Y) / cs - 0.5
            i0, j0 = max(0, min(ncols - 1, math.floor(fx))), max(0, min(nrows - 1, math.floor(fy)))
            i1, j1 = min(ncols - 1, i0 + 1), min(nrows - 1, j0 + 1)
            ax, ay = min(1, max(0, fx - i0)), min(1, max(0, fy - j0))
            v = [rows[j0][i0], rows[j0][i1], rows[j1][i0], rows[j1][i1]]
            if any(q == nod for q in v):
                raise SystemExit(f"El DEM no tiene datos en ({X:.1f}, {Y:.1f}).")
            return (v[0] * (1 - ax) + v[1] * ax) * (1 - ay) + (v[2] * (1 - ax) + v[3] * ax) * ay

        if crs != TARGET_CRS:
            raise SystemExit("El DEM ASCII debe estar en EPSG:9377 (o reproyéctelo antes).")
        desc = f"ASCII Grid {ncols}×{nrows}, celda {cs} m, CRS {crs}"
        log.add("terreno", desc)
        return z, desc
    try:
        import rasterio  # type: ignore
        from rasterio.warp import transform as rtransform  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise SystemExit("Para GeoTIFF instale rasterio, o convierta el DEM a ASCII Grid (.asc) en EPSG:9377.") from e
    ds = rasterio.open(path)
    band = ds.read(1)
    src = ds.crs.to_string()
    res = ds.res

    def z(X: float, Y: float) -> float:
        xs, ys = (X,), (Y,)
        if src != TARGET_CRS:
            xs, ys = rtransform(TARGET_CRS, src, xs, ys)
        r, c = ds.index(xs[0], ys[0])
        return float(band[max(0, min(band.shape[0] - 1, r))][max(0, min(band.shape[1] - 1, c))])

    desc = f"GeoTIFF {ds.width}×{ds.height}, resolución {res[0]:.2f}×{res[1]:.2f}, CRS {src}"
    log.add("terreno", desc)
    return z, desc


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--layer", required=True, help="URL de la capa MapServer de edificaciones")
    ap.add_argument("--bbox", nargs=4, type=float, required=True, metavar=("XMIN", "YMIN", "XMAX", "YMAX"))
    ap.add_argument("--bbox-crs", default="EPSG:4326")
    ap.add_argument("--assume-crs", default=None, help="CRS del servicio si no se puede verificar (decisión manual registrada)")
    ap.add_argument("--dem", required=False, help="DEM del sector (GeoTIFF o ASCII Grid .asc en EPSG:9377)")
    ap.add_argument("--dem-datum", default="no declarado: verificar", help="Datum vertical del DEM")
    ap.add_argument("--dem-vertical-accuracy", default="no declarada", help="Exactitud vertical declarada")
    ap.add_argument("--flat-terrain", action="store_true", help="Sin DEM: terreno plano (se marca como didáctico)")
    ap.add_argument("--dx", type=float, default=0.5, help="Resolución del ráster exportado [m]")
    ap.add_argument("--page-size", type=int, default=500)
    ap.add_argument("--max-records", type=int, default=3000)
    ap.add_argument("--simplify", type=float, default=0.2)
    ap.add_argument("--outlet", action="append", default=[], help="Salida: BORDE:desde:hasta:pendiente (m locales), p. ej. E:20:40:0.03")
    ap.add_argument("--osm", default=None, help="GeoJSON local de OSM (vías y zonas verdes) para complementar coberturas")
    ap.add_argument("--hypothetical-inlets", default=None, help="JSON con sumideros HIPOTÉTICOS [[x,y],…] en metros locales")
    ap.add_argument("--id", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cache", default="cache-pipeline")
    a = ap.parse_args(argv)

    log = Log()
    os.makedirs(a.cache, exist_ok=True)
    if not a.outlet:
        raise SystemExit("Defina al menos una salida hidráulica con --outlet (el agua debe tener por dónde salir).")
    env = bbox_in_target(a.bbox, a.bbox_crs)
    W, H = env[2] - env[0], env[3] - env[1]
    log.add("caja", f"Caja en {TARGET_CRS}: {env[0]:.1f}, {env[1]:.1f} – {env[2]:.1f}, {env[3]:.1f} ({W:.0f} × {H:.0f} m)")
    if W > 600 or H > 600:
        raise SystemExit("El sector supera 600 m por lado: este laboratorio trabaja con sectores pequeños.")
    lon, lat = check_in_medellin((env[0] + env[2]) / 2, (env[1] + env[3]) / 2, log)

    feats, pages, meta = fetch_buildings(a.layer, env, a.page_size, a.max_records, log, a.cache)
    src = check_crs(meta, a.assume_crs, log)
    clip = box(*env)
    polys = repair(feats, clip, src, a.simplify, log)

    # Terreno
    nx, ny = max(1, round(W / a.dx)), max(1, round(H / a.dx))
    if a.dem:
        zf, dem_desc = read_dem(a.dem, log)
        terrain_kind, terrain_note = "real", f"{dem_desc}; datum vertical: {a.dem_datum}; exactitud vertical: {a.dem_vertical_accuracy}"
    elif a.flat_terrain:
        zf, dem_desc = (lambda X, Y: 0.0), "plano"
        terrain_kind, terrain_note = "didactico", "Sin DEM: terreno plano. No representa la topografía de Medellín."
        log.add("terreno", terrain_note, "advertencia")
    else:
        raise SystemExit("Se necesita --dem (o --flat-terrain, que se marca como didáctico).")
    values: list[float] = []
    for j in range(ny):
        for i in range(nx):
            values.append(round(zf(env[0] + (i + 0.5) * a.dx, env[1] + (j + 0.5) * a.dx), 3))

    # Edificios en coordenadas locales
    buildings = []
    sources_h = {"real (agl)": 0, "estimado (n_pisos × 3 m)": 0, "sin dato (6 m supuestos)": 0}
    for n, b in enumerate(polys):
        hgt, floors, how = height_of(b["props"])
        sources_h[how] += 1
        ext = [[round(x - env[0], 3), round(y - env[1], 3)] for x, y in list(b["geom"].exterior.coords)[:-1]]
        c = b["geom"].representative_point()
        # bajante: punto del borde más cercano al centro de la caja (supuesto, se documenta)
        bnd = b["geom"].exterior
        dp = bnd.interpolate(bnd.project(c))
        buildings.append({
            "id": f"edif-{n + 1}",
            "polygon": ext,
            "floors": floors,
            "heightM": round(hgt, 2),
            "downspout": [round(dp.x - env[0], 2), round(dp.y - env[1], 2)],
            "style": "ladrillo" if hgt <= 15 else "torre",
            "kind": "real",
            "attrs": {k: b["props"].get(k) for k in EXPECTED_FIELDS},
        })
    log.add("alturas", f"Origen de alturas: {sources_h}")

    surfaces = []
    sources = [
        {"label": f"Alcaldía de Medellín — capa «{meta.get('name')}»", "url": a.layer, "license": meta.get("copyrightText") or "verificar condiciones de uso", "accessed": dt.date.today().isoformat()},
    ]
    if a.osm:
        with open(a.osm, encoding="utf-8") as fh:
            osm = json.load(fh)
        n_osm = 0
        for f in osm.get("features", []):
            props = f.get("properties", {})
            g = to_target(shape(f["geometry"]), "EPSG:4326")
            cover = None
            if props.get("highway"):
                width = float(props.get("width") or (7.0 if props.get("highway") in ("primary", "secondary", "tertiary") else 6.0))
                g = g.buffer(width / 2, cap_style=2)
                cover = "asfalto"
            elif props.get("leisure") == "park" or props.get("landuse") in ("grass", "forest", "recreation_ground"):
                cover = "zona_verde"
            if not cover:
                continue
            g = g.intersection(clip)
            for p in (list(g.geoms) if hasattr(g, "geoms") else [g]):
                if isinstance(p, Polygon) and p.area > 4:
                    surfaces.append({"id": f"osm-{n_osm}", "polygon": [[round(x - env[0], 2), round(y - env[1], 2)] for x, y in list(p.exterior.coords)[:-1]], "cover": cover, "kind": "estimado", "label": props.get("name")})
                    n_osm += 1
        sources.append({"label": "OpenStreetMap", "url": "https://www.openstreetmap.org/copyright", "license": "© colaboradores de OpenStreetMap, ODbL 1.0"})
        log.add("osm", f"Coberturas desde OSM: {n_osm} polígonos (anchos de vía estimados)")

    drains = []
    if a.hypothetical_inlets:
        for n, (x, y) in enumerate(json.loads(a.hypothetical_inlets)):
            drains.append({"id": f"sum-hip-{n + 1}", "name": f"Sumidero hipotético {n + 1}", "at": [x, y], "widthM": 0.6, "lengthM": 0.9, "freeSides": 3, "openFraction": 0.5, "capacityLps": 40, "gutterSlope": 0.02, "obstruction": 0, "kind": "hipotetico"})
        log.add("sumideros", f"{len(drains)} sumideros HIPOTÉTICOS agregados por pedido explícito", "advertencia")

    outlets = []
    for n, spec in enumerate(a.outlet):
        edge, f0, f1, slope = spec.split(":")
        outlets.append({"id": f"salida-{n + 1}", "name": f"Salida {n + 1}", "edge": edge, "from": float(f0), "to": float(f1), "slope": float(slope), "kind": "estimado"})

    layers = [
        {"layer": "Edificios", "kind": "real", "note": f"Capa municipal (consulta del {dt.date.today().isoformat()}); alturas: {sources_h}."},
        {"layer": "Terreno", "kind": terrain_kind, "note": terrain_note},
        {"layer": "Coberturas", "kind": "estimado", "note": "Por defecto concreto; OSM si se usó; parámetros hidráulicos estimados."},
        {"layer": "Salidas", "kind": "estimado", "note": "Definidas por el usuario del pipeline."},
        {"layer": "Sumideros y bordillos", "kind": "hipotetico" if drains else "estimado", "note": "Sumideros hipotéticos por pedido explícito." if drains else "No hay sumideros ni bordillos levantados en este escenario."},
    ]
    scenario = {
        "format": "medellin-lluvia/escenario",
        "version": 1,
        "id": a.id,
        "title": a.title,
        "shortTitle": a.title[:32],
        "summary": "Sector construido con cartografía municipal mediante el pipeline reproducible.",
        "provenance": {
            "kind": "datos-reales" if terrain_kind == "real" else "mixto",
            "badge": "Datos reales con elementos estimados",
            "statement": "Edificios de la cartografía municipal; terreno del DEM indicado; coberturas y parámetros estimados. No es un pronóstico oficial.",
            "layers": layers,
            "sources": sources,
            "generatedBy": f"tools/geo/medellin_pipeline.py {PIPELINE_VERSION}",
            "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        },
        "extent": {"crs": TARGET_CRS, "origin": [round(env[0], 3), round(env[1], 3)], "width": round(nx * a.dx, 3), "height": round(ny * a.dx, 3), "lonLat": [round(lon, 6), round(lat, 6)]},
        "units": {"length": "m", "elevation": "m", "rain": "mm/h", "time": "s", "flow": "L/s"},
        "resolutions": [1, 2],
        "defaultResolution": 1,
        "terrain": {"kind": "raster", "dx": a.dx, "nx": nx, "ny": ny, "values": values, "datum": a.dem_datum, "verticalAccuracy": a.dem_vertical_accuracy},
        "defaultCover": "concreto",
        "surfaces": surfaces,
        "bowls": [],
        "buildings": buildings,
        "drains": drains,
        "outlets": outlets,
        "inflows": [],
        "zones": [],
        "gardens": [],
        "tanks": [],
        "probes": [{"id": "centro", "name": "Centro del sector", "at": [round(nx * a.dx / 2, 2), round(ny * a.dx / 2, 2)]}],
        "labels": [],
        "streetView": {"eye": [2, round(ny * a.dx / 2, 2)], "look": [round(nx * a.dx - 2, 2), round(ny * a.dx / 2, 2)]},
        "pipes": [],
        "defaults": {"scenarioId": a.id, "dx": 1, "rain": {"intensityMmH": 60, "durationMin": 20, "pattern": "constante", "spatial": "uniforme", "center": [round(nx * a.dx / 2, 2), round(ny * a.dx / 2, 2)], "radiusM": 30}, "simMinutes": 35, "soilInitial": "seco", "inflowLps": 0, "seed": 20261108},
        "engine": {"name": "inercial-local-urbano", "version": "1.0.0"},
        "seed": 20261108,
        "pipelineLog": log.items,
        "pipelinePages": pages,
    }
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(scenario, fh, ensure_ascii=False)
    log.add("exportar", f"Escenario escrito en {a.out} ({len(buildings)} edificios, ráster {nx}×{ny})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
