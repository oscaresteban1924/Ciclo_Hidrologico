#!/usr/bin/env python3
"""
Prueba del pipeline sin red: levanta un servidor local que imita un MapServer de ArcGIS (metadatos,
consulta por caja y paginación), con geometrías defectuosas a propósito, y ejecuta el pipeline contra él.
Después valida el escenario con el mismo código de la aplicación (tests/city/scenario-check.ts).

Ejecutar desde la raíz del proyecto:  python3 tools/geo/test_pipeline.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

from pyproj import Transformer

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

to9377 = Transformer.from_crs("EPSG:4326", "EPSG:9377", always_xy=True)
LON, LAT = -75.5775, 6.2455  # punto de prueba en el área urbana de Medellín (solo para la prueba)
CX, CY = to9377.transform(LON, LAT)


def rect(x0: float, y0: float, x1: float, y1: float) -> list[list[float]]:
    return [[CX + x0, CY + y0], [CX + x1, CY + y0], [CX + x1, CY + y1], [CX + x0, CY + y1], [CX + x0, CY + y0]]


FEATURES = [
    {"agl": 9.5, "n_pisos": 3, "n_pisostot": 3, "g": {"type": "Polygon", "coordinates": [rect(-50, -40, -38, -28)]}},
    {"agl": None, "n_pisos": 5, "n_pisostot": 5, "g": {"type": "Polygon", "coordinates": [rect(-30, -40, -16, -26)]}},
    {"agl": 0.0, "n_pisos": None, "n_pisostot": None, "g": {"type": "Polygon", "coordinates": [rect(-10, -40, 4, -30)]}},
    # «corbatín» autointersectado (inválido): debe repararse
    {"agl": 6.0, "n_pisos": 2, "n_pisostot": 2, "g": {"type": "Polygon", "coordinates": [[[CX + 10, CY - 40], [CX + 22, CY - 28], [CX + 22, CY - 40], [CX + 10, CY - 28], [CX + 10, CY - 40]]]}},
    # multipolígono: dos partes
    {"agl": 12.0, "n_pisos": 4, "n_pisostot": 4, "g": {"type": "MultiPolygon", "coordinates": [[rect(-50, 10, -40, 20)], [rect(-36, 10, -26, 20)]]}},
    # astilla de 1 m²: debe descartarse
    {"agl": 3.0, "n_pisos": 1, "n_pisostot": 1, "g": {"type": "Polygon", "coordinates": [rect(0, 0, 1, 1)]}},
    # parcialmente fuera de la caja: debe recortarse
    {"agl": 15.0, "n_pisos": 5, "n_pisostot": 5, "g": {"type": "Polygon", "coordinates": [rect(40, 10, 70, 22)]}},
    {"agl": 7.0, "n_pisos": 2, "n_pisostot": 2, "g": {"type": "Polygon", "coordinates": [rect(-20, 10, -8, 22)]}},
    {"agl": 60.0, "n_pisos": 20, "n_pisostot": 20, "g": {"type": "Polygon", "coordinates": [rect(5, 10, 20, 25)]}},
    # completamente fuera de la caja: la consulta acotada no debe devolverlo
    {"agl": 8.0, "n_pisos": 2, "n_pisostot": 2, "g": {"type": "Polygon", "coordinates": [rect(400, 400, 410, 410)]}},
]

META = {
    "name": "Construcciones (prueba)",
    "type": "Feature Layer",
    "geometryType": "esriGeometryPolygon",
    "description": "Capa de prueba. Sistema de referencia: WGS84 / UTM zona 18N (texto heredado).",
    "copyrightText": "Datos de prueba sintéticos",
    "maxRecordCount": 4,
    "advancedQueryCapabilities": {"supportsPagination": True},
    "extent": {"spatialReference": {"wkid": 9377, "latestWkid": 9377}},
    "fields": [
        {"name": "OBJECTID", "type": "esriFieldTypeOID"},
        {"name": "agl", "type": "esriFieldTypeDouble"},
        {"name": "n_pisos", "type": "esriFieldTypeInteger"},
        {"name": "n_pisostot", "type": "esriFieldTypeInteger"},
    ],
}

REQUESTS: list[str] = []


def bbox_of(g: dict) -> tuple[float, float, float, float]:
    pts = []
    def walk(c):
        if isinstance(c[0], (int, float)):
            pts.append(c)
        else:
            for q in c:
                walk(q)
    walk(g["coordinates"])
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencio
        pass

    def do_GET(self):  # noqa: N802
        u = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        REQUESTS.append(self.path)
        if u.path.endswith("/query"):
            env = [float(v) for v in q["geometry"].split(",")]
            sel = []
            for i, f in enumerate(FEATURES):
                b = bbox_of(f["g"])
                if b[2] < env[0] or b[0] > env[2] or b[3] < env[1] or b[1] > env[3]:
                    continue
                sel.append({"type": "Feature", "id": i + 1, "geometry": f["g"], "properties": {"OBJECTID": i + 1, "agl": f["agl"], "n_pisos": f["n_pisos"], "n_pisostot": f["n_pisostot"]}})
            off, cnt = int(q.get("resultOffset", 0)), int(q.get("resultRecordCount", 4))
            page = sel[off : off + cnt]
            body = {"type": "FeatureCollection", "features": page, "exceededTransferLimit": off + cnt < len(sel)}
        else:
            body = META
        raw = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)


def main() -> int:
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    tmp = tempfile.mkdtemp(prefix="pipeline-")
    # DEM ASCII en EPSG:9377 (pendiente de 6 % hacia el este)
    dem = os.path.join(tmp, "dem.asc")
    cs = 2.0
    x0, y0 = CX - 120, CY - 120
    n = 120
    with open(dem, "w") as fh:
        fh.write(f"ncols {n}\nnrows {n}\nxllcorner {x0}\nyllcorner {y0}\ncellsize {cs}\nNODATA_value -9999\n")
        for r in range(n):
            y = y0 + (n - r - 0.5) * cs
            fh.write(" ".join(f"{1500 - 0.06 * (x0 + (c + 0.5) * cs - CX) + 0.02 * (y - CY):.3f}" for c in range(n)) + "\n")
    out = os.path.join(tmp, "escenario.json")
    tr = Transformer.from_crs("EPSG:9377", "EPSG:4326", always_xy=True)
    lon0, lat0 = tr.transform(CX - 60, CY - 50)
    lon1, lat1 = tr.transform(CX + 60, CY + 50)
    cmd = [
        sys.executable, os.path.join(HERE, "medellin_pipeline.py"),
        "--layer", f"http://127.0.0.1:{port}/rest/services/prueba/MapServer/9",
        "--bbox", str(lon0), str(lat0), str(lon1), str(lat1), "--bbox-crs", "EPSG:4326",
        "--dem", dem, "--dem-datum", "prueba (sintético)", "--dem-vertical-accuracy", "no aplica",
        "--outlet", "E:20:60:0.06", "--id", "prueba-pipeline", "--title", "Prueba del pipeline",
        "--out", out, "--cache", os.path.join(tmp, "cache"), "--page-size", "500",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stderr)
    if r.returncode != 0:
        print("El pipeline falló", r.stdout)
        return 1
    sc = json.load(open(out, encoding="utf-8"))
    checks = []
    def ck(name, ok, detail):
        checks.append((name, ok, detail))
    queries = [q for q in REQUESTS if "/query" in q]
    ck("Consulta acotada y paginada (páginas de 4 por maxRecordCount)", len(queries) >= 3 and all("resultOffset" in q for q in queries), f"{len(queries)} consultas")
    ck("No se pidió el elemento fuera de la caja", all(b["attrs"]["agl"] != 8.0 or b["heightM"] != 8.0 for b in sc["buildings"]), f"{len(sc['buildings'])} edificios")
    ck("Advertencia por CRS descrito como UTM pero declarado EPSG:9377", "no coinciden" in r.stderr, "registrada en pipelineLog")
    ck("Geometría inválida reparada", "reparados: 1" in r.stderr, "make_valid")
    ck("Astilla descartada", "astillas (< 4 m²) descartadas: 1" in r.stderr, "")
    ck("Multipolígono separado en partes", sum(1 for b in sc["buildings"] if b["attrs"]["agl"] == 12.0) == 2, "")
    widths = [max(p[0] for p in b["polygon"]) for b in sc["buildings"]]
    ck("Recorte a la caja", max(widths) <= sc["extent"]["width"] + 1e-6, f"máx x local = {max(widths):.2f} m")
    ck("Alturas: agl real, n_pisos estimado y sin dato marcados", "'real (agl)'" in r.stderr and "estimado" in r.stderr and "sin dato" in r.stderr, "")
    ck("CRS de salida EPSG:9377 y centro en Medellín", sc["extent"]["crs"] == "EPSG:9377" and abs(sc["extent"]["lonLat"][0] - LON) < 0.002, str(sc["extent"]["lonLat"]))
    ck("Hashes de cada página registrados", all(len(p["sha256"]) == 64 for p in sc["pipelinePages"]), f"{len(sc['pipelinePages'])} archivos")
    ck("Sin sumideros inventados", len(sc["drains"]) == 0 and len(sc["pipes"]) == 0, "")
    # Validación con el código de la aplicación
    rc = subprocess.run(["npx", "tsx", "tests/city/scenario-check.ts", out], cwd=ROOT, capture_output=True, text=True)
    ck("La aplicación valida, compila y simula el escenario", rc.returncode == 0, rc.stdout.strip().splitlines()[-1] if rc.stdout.strip() else rc.stderr[-300:])
    ok = all(c[1] for c in checks)
    for name, good, detail in checks:
        print(f"{'PASA ' if good else 'FALLA'} {name} — {detail}")
    report = {"ok": ok, "checks": [{"name": a, "pass": b, "detail": c} for a, b, c in checks]}
    with open(os.path.join(ROOT, "docs", "medellin", "pipeline-test.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    srv.shutdown()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
