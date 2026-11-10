#!/usr/bin/env python3
"""Monitoreo real de quebradas de Medellín para el módulo «Calidad del agua».

Entrada (tools/geo/insumos/calidad-quebradas/, descargada sin modificar; URL y sha256 en el manifiesto):
  · sitios-muestreo.geojson — capa 1 de ambiente_dllo_sost/VM_Monitoreo_Calidad_Agua (Secretaría de Medio
    Ambiente de Medellín): 75 sitios de 18 microcuencas del corregimiento de San Antonio de Prado, con
    oxígeno disuelto, saturación, coliformes, DBO5, DQO, turbiedad, conductividad e índice ICASAP;
  · calidad-retiros.geojson — capa 2: calidad de los retiros (franjas de orilla) por tramo, con sus afectaciones;
  · sitios-muestreo-capa.json — descripción de la capa (convenios y campañas).

Salida: src/quality/data/monitoreo.ts (generado; no se edita a mano).

Qué se hace: se normalizan los números (la DBO5 viene como texto, con coma decimal y «< 2,00» cuando está
por debajo del límite de detección), se descartan los sitios sin medición (todo en cero), se asigna cada sitio
a su microcuenca (lista de la descripción de la capa) y a su posición a lo largo del cauce (alto, medio-alto,
medio, medio-bajo, bajo) y se le une la calidad de su retiro (mismo identificador id_ma). Nada se corrige ni
se completa: lo que no se midió queda vacío.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
INS = RAIZ / 'tools' / 'geo' / 'insumos' / 'calidad-quebradas'
SALIDA = RAIZ / 'src' / 'quality' / 'data' / 'monitoreo.ts'

CUENCAS = ['Barro Azul', 'Cabuyala', 'Candela', 'Cañadita', 'Chorrera', 'Despensa', 'Doña María', 'Guapante', 'Indio', 'Isabela', 'Jacinta', 'Larga', 'Limona', 'Macana', 'Manguala', 'Sorbetana', 'Zorrita', 'Zulia', 'Popala', 'Astillera']
ORDEN = {'ALTO': 0, 'MEDIO-ALTO': 1, 'MEDIO': 2, 'MEDIO-BAJO': 3, 'BAJO': 4}


def plain(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.upper()) if unicodedata.category(c) != 'Mn')


def cuenca_de(quebrada: str) -> str | None:
    q = plain(quebrada)
    if q.startswith('AFLUENTE'):
        return None  # afluentes: se informan aparte
    for c in CUENCAS:
        if q.startswith(plain(c)):
            return c
    return None


def num(v) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def dbo(v) -> tuple[float, bool] | None:
    """DBO5 como (valor, menor que el límite de detección)."""
    if v is None:
        return None
    s = str(v).strip()
    m = re.match(r'^<\s*([0-9]+(?:[.,][0-9]+)?)$', s)
    if m:
        return (float(m.group(1).replace(',', '.')), True)
    x = num(s)
    return None if x is None or x == 0 else (x, False)


def titulo(s: str) -> str:
    s = ' '.join(s.split())
    return s


def main() -> int:
    feats = json.loads((INS / 'sitios-muestreo.geojson').read_text(encoding='utf-8'))['features']
    retiros = {f['properties']['id_ma']: f['properties'] for f in json.loads((INS / 'calidad-retiros.geojson').read_text(encoding='utf-8'))['features']}
    capa = json.loads((INS / 'sitios-muestreo-capa.json').read_text(encoding='utf-8'))
    sitios, sin_medicion, afluentes = [], [], []
    for f in feats:
        p = f['properties']
        lon, lat = f['geometry']['coordinates'][:2]
        medido = (num(p['od']) or 0) > 0 or (num(p['coliformes_fecales']) or 0) > 0
        c = cuenca_de(p['quebrada'])
        if not medido:
            sin_medicion.append(titulo(p['nombre']))
            continue
        if c is None:
            afluentes.append(titulo(p['nombre']))
            continue
        r = retiros.get(p['id_ma'])
        afect = []
        if r:
            for k in range(1, 6):
                a = (r.get(f'afectacion_{k}') or '').strip()
                if a and a.upper() != 'N/A':
                    afect.append(a.capitalize())
        ica = num(p['icasap_2017_v1'])
        sitio = {
            'id': p['id_ma'],
            'cuenca': c,
            'nombre': titulo(p['nombre']),
            'sector': p['sector'],
            'orden': ORDEN.get(p['sector'], 2),
            'altura': num(p['altura']),
            'fecha': dt.datetime.fromtimestamp(p['fecha'] / 1000, dt.timezone.utc).date().isoformat() if p.get('fecha') else None,
            'lon': round(lon, 6),
            'lat': round(lat, 6),
            'od': round(num(p['od']), 2) if num(p['od']) else None,
            'sat': round(num(p['porc_sat_od']), 1) if num(p['porc_sat_od']) else None,
            'cf': num(p['coliformes_fecales']) if num(p['coliformes_fecales']) else None,
            'ct': num(p['coliformes_totales']) if num(p['coliformes_totales']) else None,
            'dbo': dbo(p['dbo5_total']),
            'turb': round(num(p['turbiedad']), 2) if num(p['turbiedad']) else None,
            'ce': round(num(p['ce']), 1) if num(p['ce']) else None,
            'ica': round(ica, 2) if ica else None,
            'icaClase': (p.get('e_2017_icasap2017_v1') or '').strip() if (p.get('e_2017_icasap2017_v1') or '').strip() not in ('', 'N/A') else None,
            'retiro': (r.get('e_iir2017') or '').strip() if r and (r.get('e_iir2017') or '').strip() not in ('', 'N/A') else None,
            'afectaciones': afect,
        }
        sitios.append(sitio)
    sitios.sort(key=lambda s: (s['cuenca'], s['orden'], -(s['altura'] or 0)))
    fechas = sorted(s['fecha'] for s in sitios if s['fecha'])
    meta = {
        'fuente': 'Alcaldía de Medellín, Secretaría de Medio Ambiente: monitoreo de quebradas del corregimiento de San Antonio de Prado (capa «Sitios Muestreo» del servicio VM_Monitoreo_Calidad_Agua)',
        'derechos': capa.get('copyrightText') or '',
        'campanas': 'Convenios y contratos de la Secretaría de Medio Ambiente (2012–2013, 2014 y 2017); la mayoría de las mediciones son de diciembre de 2017 y enero de 2018.',
        'fechas': [fechas[0], fechas[-1]] if fechas else None,
        'sitios': len(sitios),
        'cuencas': sorted({s['cuenca'] for s in sitios}),
        'sinMedicion': sin_medicion,
        'afluentes': afluentes,
        'generador': 'tools/geo/calidad_monitoreo.py',
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    out = [
        '// GENERADO por tools/geo/calidad_monitoreo.py a partir de la capa oficial de monitoreo de quebradas de la',
        '// Secretaría de Medio Ambiente de Medellín. No editar a mano. Valores tal como se publicaron (sin corregir).',
        '/* eslint-disable */',
        'export interface SitioMonitoreo {',
        '  id: number; cuenca: string; nombre: string; sector: string; orden: number; altura: number | null; fecha: string | null; lon: number; lat: number;',
        '  /** Oxígeno disuelto [mg/L] y saturación [%]. */ od: number | null; sat: number | null;',
        '  /** Coliformes fecales y totales [NMP/100 mL]. */ cf: number | null; ct: number | null;',
        '  /** DBO5 [mg/L]: [valor, menor que el límite de detección]. */ dbo: [number, boolean] | null;',
        '  turb: number | null; ce: number | null; ica: number | null; icaClase: string | null; retiro: string | null; afectaciones: string[];',
        '}',
        f'export const MONITOREO_META = {json.dumps(meta, ensure_ascii=False)};',
        f'export const SITIOS: SitioMonitoreo[] = {json.dumps(sitios, ensure_ascii=False)};',
    ]
    SALIDA.write_text('\n'.join(out) + '\n', encoding='utf-8')
    print(f"{len(sitios)} sitios con medición en {len(meta['cuencas'])} microcuencas; sin medición: {len(sin_medicion)}; afluentes: {len(afluentes)}; {meta['fechas']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
