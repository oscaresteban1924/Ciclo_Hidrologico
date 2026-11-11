// Módulo «Hidráulica de canales»: siete partes (el canal y su caudal, la caída y el resalto, el puente y el remanso,
// las alcantarillas, el transporte de sedimentos, medir el caudal y ondas y crecientes), cada una con su escena 3D, su pregunta,
// controles al pie, esquema, retos con medalla, experimentos, una pestaña de diseño (calculadora y prediseño),
// datos y notas para el docente. Sin WebGL, el esquema reemplaza a la escena, con el mismo cálculo.

import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { PartTab } from '../quality/shell';
import { hasWebGL } from '../quality/three/stage';
import { ActiveTab } from '../quality/ui';
import { BridgeLab } from './BridgeLab';
import { CulvertLab } from './CulvertLab';
import { GaugeLab } from './GaugeLab';
import { JumpLab } from './JumpLab';
import { SedimentLab } from './SedimentLab';
import { UniformLab } from './UniformLab';
import { WavesLab } from './WavesLab';
import '../quality/quality.css';
import '../quality/quality3d.css';
import './canals.css';

export type CanalPart = 'uniforme' | 'resalto' | 'puente' | 'alcantarilla' | 'sedimentos' | 'aforo' | 'ondas';

const PARTS: { id: CanalPart; name: string; short: string; icon: string; C: ComponentType<{ head: ReactNode; gl: boolean }> }[] = [
  { id: 'uniforme', name: 'El canal y su caudal', short: 'El canal', icon: 'M2 6h3l2.5 8h5L15 6h3M5.5 11h9', C: UniformLab },
  { id: 'resalto', name: 'La caída y el resalto', short: 'El resalto', icon: 'M2 5h4l5 7h7M11 12c1-2 2.5-3 3.5-1s2 1 2.5-1M2 16h16', C: JumpLab },
  { id: 'puente', name: 'El puente y el remanso', short: 'El puente', icon: 'M1.5 8h17M3 8v8M17 8v8M6 16a4 4 0 0 1 8 0M1.5 13c2-1.5 4 1.5 6 0', C: BridgeLab },
  { id: 'alcantarilla', name: 'Las alcantarillas', short: 'Alcantarillas', icon: 'M1.5 9h17M4 9l-2.5 7h17L16 9M7 16a3 3 0 0 1 6 0M1.5 13.5c2-1 3.5 1 5.5 0', C: CulvertLab },
  { id: 'sedimentos', name: 'El transporte de sedimentos', short: 'Sedimentos', icon: 'M2 6c3-2 5 2 8 0s5 2 8 0M3 15h14M5 13.5a1.5 1.5 0 1 0 0 .01M9 12.5a2 2 0 1 0 0 .01M14 13a1.6 1.6 0 1 0 0 .01', C: SedimentLab },
  { id: 'aforo', name: 'Medir el caudal', short: 'Medir', icon: 'M3 4v12M3 8h2M3 12h2M8 15h10M10 15V9l3 3 3-3v6', C: GaugeLab },
  { id: 'ondas', name: 'Ondas y crecientes', short: 'Ondas', icon: 'M1.5 13c2.5 0 3-6 6-6s3.5 6 6 6 2.5-3 5-3M1.5 16.5h17', C: WavesLab },
];

const KEY = 'ciclo-hidrologico:canales';

export default function CanalsLab() {
  const [part, setPart] = useState<CanalPart>(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      return PARTS.some((p) => p.id === v) ? (v as CanalPart) : 'uniforme';
    } catch {
      return 'uniforme';
    }
  });
  const tabRefs = useRef<Partial<Record<CanalPart, HTMLButtonElement | null>>>({});
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, part);
    } catch {
      /* sin almacenamiento: no se recuerda la parte */
    }
  }, [part]);
  const gl = useMemo(() => hasWebGL(), []);
  const go = (p: CanalPart, focus = false) => {
    setPart(p);
    if (focus) window.setTimeout(() => tabRefs.current[p]?.focus(), 0);
  };
  const head = (
    <div className="q-head">
      <p className="q-disclaimer">
        <strong>Hidráulica de canales.</strong> Laboratorio educativo con las ecuaciones clásicas de la hidráulica de canales. Las escenas y los prediseños son ilustrativos y académicos: no son diseños de ingeniería ni pronósticos, y ningún canal, puente o alcantarilla representa uno de Medellín.
        {!gl && ' Tu equipo no tiene WebGL: se muestran los esquemas planos, con el mismo cálculo.'}
      </p>
      <div className={`q-tabs hc-tabs n${PARTS.length}`} role="tablist" aria-label="Partes del módulo">
        {PARTS.map((p, k) => (
          <button
            key={p.id}
            ref={(el) => {
              tabRefs.current[p.id] = el;
            }}
            type="button"
            role="tab"
            aria-label={p.name}
            id={`hc-tab-${p.id}`}
            aria-selected={part === p.id}
            tabIndex={part === p.id ? 0 : -1}
            className={part === p.id ? 'is-on' : ''}
            onClick={() => go(p.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') go(PARTS[(k + 1) % PARTS.length].id, true);
              if (e.key === 'ArrowLeft') go(PARTS[(k + PARTS.length - 1) % PARTS.length].id, true);
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
  const cur = PARTS.find((p) => p.id === part)!;
  const C = cur.C;
  return (
    <ActiveTab.Provider value={`hc-tab-${part}`}>
      <PartTab.Provider value={`hc-tab-${part}`}>
        <C key={part} head={head} gl={gl} />
      </PartTab.Provider>
    </ActiveTab.Provider>
  );
}
