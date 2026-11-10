// Módulo «Calidad del agua»: tres partes con la misma distribución (escena y panel). Se carga aparte del resto
// de la aplicación.

import { useEffect, useRef, useState } from 'react';
import { CreekPart } from './CreekPart';
import { PlantPart } from './PlantPart';
import { StreetPart } from './StreetPart';
import { ActiveTab } from './ui';
import './quality.css';

type PartId = 'quebrada' | 'llave' | 'ciudad';

const PARTS: { id: PartId; name: string; short: string }[] = [
  { id: 'quebrada', name: 'La quebrada y su salud', short: 'Quebrada' },
  { id: 'llave', name: 'Del río a la llave', short: 'Del río a la llave' },
  { id: 'ciudad', name: 'La ciudad y la lluvia', short: 'Ciudad y lluvia' },
];

const KEY = 'ciclo-hidrologico:calidad';

export default function QualityLab() {
  const [part, setPart] = useState<PartId>(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      return v === 'llave' || v === 'ciudad' ? v : 'quebrada';
    } catch {
      return 'quebrada';
    }
  });
  const tabRefs = useRef<Record<PartId, HTMLButtonElement | null>>({ quebrada: null, llave: null, ciudad: null });
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, part);
    } catch {
      /* almacenamiento no disponible: no se recuerda la parte */
    }
  }, [part]);
  const go = (p: PartId, focus = false) => {
    setPart(p);
    if (focus) window.setTimeout(() => tabRefs.current[p]?.focus(), 0);
  };
  const head = (
    <div className="q-head">
      <p className="q-disclaimer">
        <strong>Calidad del agua.</strong> Laboratorio educativo con valores típicos de la literatura y normas colombianas; no es un monitoreo de una quebrada real.
      </p>
      <div className="q-tabs" role="tablist" aria-label="Partes del módulo">
        {PARTS.map((p, k) => (
          <button
            key={p.id}
            ref={(el) => {
              tabRefs.current[p.id] = el;
            }}
            type="button"
            role="tab"
            aria-label={p.name}
            id={`q-tab-${p.id}`}
            aria-selected={part === p.id}
            aria-controls="q-tabpanel"
            tabIndex={part === p.id ? 0 : -1}
            className={part === p.id ? 'is-on' : ''}
            onClick={() => go(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(PARTS[(k + 1) % PARTS.length].id, true);
              if (e.key === 'ArrowLeft') go(PARTS[(k + PARTS.length - 1) % PARTS.length].id, true);
            }}
          >
            <span className="lbl-long">{p.name}</span>
            <span className="lbl-short">{p.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <ActiveTab.Provider value={`q-tab-${part}`}>
      {part === 'quebrada' ? <CreekPart head={head} goStreet={() => go('ciudad')} /> : part === 'llave' ? <PlantPart head={head} /> : <StreetPart head={head} />}
    </ActiveTab.Provider>
  );
}
