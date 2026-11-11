// Módulo «Calidad del agua»: cuatro partes (la quebrada, del río a la llave, de la casa al río y la ciudad y la
// lluvia), cada una con
// una escena 3D, su pregunta, controles al pie, retos con medalla, experimentos animados, datos y notas para el
// docente. Sin WebGL se muestra la versión en dibujos planos (carpeta classic), con el mismo modelo. Se carga
// aparte del resto de la aplicación.

import { useEffect, useMemo, useRef, useState } from 'react';
import { CreekPart } from './classic/CreekPart';
import { PlantPart } from './classic/PlantPart';
import { PtarPart } from './classic/PtarPart';
import { StreetPart } from './classic/StreetPart';
import { CreekLab } from './CreekLab';
import { PlantLab } from './PlantLab';
import { PtarLab } from './PtarLab';
import { StreetLab } from './StreetLab';
import { PartTab } from './shell';
import { hasWebGL } from './three/stage';
import { ActiveTab } from './ui';
import './quality.css';
import './quality3d.css';

type PartId = 'quebrada' | 'llave' | 'ptar' | 'ciudad';

const PARTS: { id: PartId; name: string; short: string }[] = [
  { id: 'quebrada', name: 'La quebrada y su salud', short: 'La quebrada' },
  { id: 'llave', name: 'Del río a la llave', short: 'Del río a la llave' },
  { id: 'ptar', name: 'De la casa al río', short: 'De la casa al río' },
  { id: 'ciudad', name: 'La ciudad y la lluvia', short: 'La ciudad y la lluvia' },
];

/** Íconos de las partes (trazo, 20 × 20). */
const PART_ICON: Record<PartId, string> = {
  quebrada: 'M2 7.5c2.7-2.6 5.3 2.6 8 0s5.3 2.6 8 0M2 12.5c2.7-2.6 5.3 2.6 8 0s5.3 2.6 8 0M5 16.5c1.7-1.4 3.3 1.4 5 0s3.3 1.4 5 0',
  llave: 'M2.5 7.5h8a4 4 0 0 1 4 4v1.5M7 4.5v3M4.5 4.5h5M14.5 15.5c-.9 1.2-1.3 2-1.3 2.6a1.3 1.3 0 0 0 2.6 0c0-.6-.4-1.4-1.3-2.6z',
  ptar: 'M2 10.5 6.5 7l4.5 3.5V16H2zM5 16v-3h3v3M12.5 12h3.5m-1.5-2 2 2-2 2M12.5 17.5c1.2-1 2.3 1 3.5 0s2.3 1 3.5 0',
  ciudad: 'M6 11.5a3.3 3.3 0 1 1 .9-6.5 4.4 4.4 0 0 1 8.4 1.7A2.4 2.4 0 0 1 15 11.5zM7 14l-1 2.5M10.5 14l-1 2.5M14 14l-1 2.5',
};

const KEY = 'ciclo-hidrologico:calidad';

export default function QualityLab() {
  const [part, setPart] = useState<PartId>(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      return v === 'llave' || v === 'ptar' || v === 'ciudad' ? v : 'quebrada';
    } catch {
      return 'quebrada';
    }
  });
  const tabRefs = useRef<Record<PartId, HTMLButtonElement | null>>({ quebrada: null, llave: null, ptar: null, ciudad: null });
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, part);
    } catch {
      /* almacenamiento no disponible: no se recuerda la parte */
    }
  }, [part]);
  const gl = useMemo(() => hasWebGL(), []);
  const go = (p: PartId, focus = false) => {
    setPart(p);
    if (focus) window.setTimeout(() => tabRefs.current[p]?.focus(), 0);
  };
  const head = (
    <div className="q-head">
      <p className="q-disclaimer">
        <strong>Calidad del agua.</strong> Laboratorio educativo con valores típicos de la literatura y normas colombianas; las escenas no son un monitoreo real (la quebrada tiene una pestaña con mediciones reales de Medellín para comparar).
        {!gl && ' Tu equipo no tiene WebGL: se muestra la versión en dibujos planos, con el mismo cálculo.'}
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
            <svg className="q-tab-ico" viewBox="0 0 20 20" aria-hidden="true">
              <path d={PART_ICON[p.id]} />
            </svg>
            <span className="q-tab-txt">{p.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
  return (
    <ActiveTab.Provider value={`q-tab-${part}`}>
      <PartTab.Provider value={`q-tab-${part}`}>
        {gl ? (
          part === 'quebrada' ? (
            <CreekLab key="q3c" head={head} />
          ) : part === 'llave' ? (
            <PlantLab key="q3p" head={head} goPtar={() => go('ptar')} />
          ) : part === 'ptar' ? (
            <PtarLab key="q3w" head={head} />
          ) : (
            <StreetLab key="q3s" head={head} />
          )
        ) : part === 'quebrada' ? (
          <CreekPart head={head} goStreet={() => go('ciudad')} />
        ) : part === 'llave' ? (
          <PlantPart head={head} goPtar={() => go('ptar')} />
        ) : part === 'ptar' ? (
          <PtarPart head={head} />
        ) : (
          <StreetPart head={head} />
        )}
      </PartTab.Provider>
    </ActiveTab.Provider>
  );
}
