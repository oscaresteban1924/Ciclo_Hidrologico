// Marco común de las salas con partes (cuencas, acueducto, aguas subterráneas, presas): el aviso de la sala, las
// pestañas de las partes con su icono y la parte elegida, que se recuerda en este equipo. Cada parte usa la misma
// distribución que «Hidráulica de canales»: escena 3D con una pregunta, controles e instrumentos al pie, y un panel con
// esquema, retos, experimentos, diseño, datos y notas para el docente. Sin WebGL, cada parte muestra su esquema plano.

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { PartTab } from '../quality/shell';
import { hasWebGL } from '../quality/three/stage';
import { ActiveTab } from '../quality/ui';
import '../quality/quality.css';
import '../quality/quality3d.css';
import '../canals/canals.css';
import './rooms.css';

export interface RoomPart {
  id: string;
  name: string;
  short: string;
  /** Trazo del icono en una caja de 20 × 20. */
  icon: string;
  C: ComponentType<{ head: ReactNode; gl: boolean }>;
}

export function RoomLab({ storeKey, prefix, title, disclaimer, parts }: { storeKey: string; prefix: string; title: string; disclaimer: ReactNode; parts: RoomPart[] }) {
  const [part, setPart] = useState<string>(() => {
    try {
      const v = window.localStorage.getItem(storeKey);
      return parts.some((p) => p.id === v) ? (v as string) : parts[0].id;
    } catch {
      return parts[0].id;
    }
  });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  useEffect(() => {
    try {
      window.localStorage.setItem(storeKey, part);
    } catch {
      /* sin almacenamiento: no se recuerda la parte */
    }
  }, [part, storeKey]);
  const gl = useMemo(() => hasWebGL(), []);
  const go = (p: string, focus = false) => {
    setPart(p);
    if (focus) window.setTimeout(() => tabRefs.current[p]?.focus(), 0);
  };
  const head = (
    <div className="q-head">
      <p className="q-disclaimer">
        <strong>{title}.</strong> {disclaimer}
        {!gl && ' Tu equipo no tiene WebGL: se muestran los esquemas planos, con el mismo cálculo.'}
      </p>
      <div className={`q-tabs hc-tabs n${parts.length}`} role="tablist" aria-label="Partes de la sala">
        {parts.map((p, k) => (
          <button
            key={p.id}
            ref={(el) => {
              tabRefs.current[p.id] = el;
            }}
            type="button"
            role="tab"
            aria-label={p.name}
            id={`${prefix}-tab-${p.id}`}
            aria-selected={part === p.id}
            tabIndex={part === p.id ? 0 : -1}
            className={part === p.id ? 'is-on' : ''}
            onClick={() => go(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(parts[(k + 1) % parts.length].id, true);
              if (e.key === 'ArrowLeft') go(parts[(k + parts.length - 1) % parts.length].id, true);
            }}
          >
            <svg className="q-tab-ico" viewBox="0 0 20 20" aria-hidden="true">
              <path d={p.icon} />
            </svg>
            <span className="q-tab-txt">{p.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
  const cur = parts.find((p) => p.id === part) ?? parts[0];
  const C = cur.C;
  return (
    <ActiveTab.Provider value={`${prefix}-tab-${cur.id}`}>
      <PartTab.Provider value={`${prefix}-tab-${cur.id}`}>
        <C key={cur.id} head={head} gl={gl} />
      </PartTab.Provider>
    </ActiveTab.Provider>
  );
}
