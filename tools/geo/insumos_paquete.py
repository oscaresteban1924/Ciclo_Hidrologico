"""Desempaca un paquete de descargas del navegador (medellin-lluvia/insumos) en tools/geo/insumos/.

El paquete lo arma el navegador con las respuestas SIN MODIFICAR de los servicios oficiales: cada
archivo trae su URL, el estado HTTP, el tipo de contenido, el tamaño y el sha256 de los bytes recibidos.
Este programa vuelve a calcular el sha256 de cada cuerpo, rechaza el paquete completo si alguno no
coincide, escribe los archivos en modo solo lectura y añade sus entradas al manifiesto.

Uso:
  python3 -I tools/geo/insumos_paquete.py RUTA/AL/PAQUETE.json [--nombre medellin-valle-insumos-4.json]
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import stat
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent / 'insumos'
MANIFIESTO = RAIZ / 'manifiesto.json'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('paquete', type=Path)
    ap.add_argument('--nombre', default=None, help='nombre con el que se registra el paquete en el manifiesto')
    a = ap.parse_args()

    crudo = a.paquete.read_bytes()
    pq = json.loads(crudo)
    if pq.get('format') != 'medellin-lluvia/insumos':
        print('formato desconocido', file=sys.stderr)
        return 2
    nombre = a.nombre or a.paquete.name
    errores: list[str] = []
    cuerpos: list[tuple[dict, bytes]] = []
    for f in pq['files']:
        if f.get('encoding') != 'base64':
            errores.append(f"{f['name']}: codificación {f.get('encoding')}")
            continue
        b = base64.b64decode(f['body'])
        h = hashlib.sha256(b).hexdigest()
        if h != f['sha256'] or len(b) != f['bytes']:
            errores.append(f"{f['name']}: sha256 o tamaño no coinciden")
        if f.get('status') != 200:
            errores.append(f"{f['name']}: estado HTTP {f.get('status')}")
        nm = Path(f['name'])
        if nm.is_absolute() or '..' in nm.parts:
            errores.append(f"{f['name']}: ruta no permitida")
        cuerpos.append((f, b))
    if errores:
        print('Paquete rechazado:\n  ' + '\n  '.join(errores), file=sys.stderr)
        return 1

    man = json.loads(MANIFIESTO.read_text(encoding='utf-8'))
    ya = {e['name']: e for e in man['files']}
    for f, b in cuerpos:
        destino = RAIZ / f['name']
        destino.parent.mkdir(parents=True, exist_ok=True)
        if destino.exists():
            if hashlib.sha256(destino.read_bytes()).hexdigest() == f['sha256']:
                continue  # idéntico: nada que hacer
            os.chmod(destino, stat.S_IWUSR | stat.S_IRUSR)
        destino.write_bytes(b)
        os.chmod(destino, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
        entrada = {k: v for k, v in f.items() if k != 'body'}
        entrada.update({'verified': True, 'bundle': nombre})
        ya[f['name']] = entrada
    man['files'] = list(ya.values())
    paquetes = man.setdefault('downloads', [])
    if not any(p.get('bundle') == nombre for p in paquetes):
        paquetes.append({'bundle': nombre, 'createdAt': pq['createdAt'], 'sha256': hashlib.sha256(crudo).hexdigest(), 'note': pq.get('note', '')})
    MANIFIESTO.write_text(json.dumps(man, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(cuerpos)} archivos verificados y escritos; manifiesto con {len(man["files"])} entradas.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
