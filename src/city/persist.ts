// Guardado local del laboratorio de lluvia (solo en este dispositivo; sin cuentas ni servidores).

import { validateConfig, type CityConfig } from './sim/scenario';
import { allScenarios } from './scenarios/index';

const KEY = 'ciclo-hidrologico:medellin:v1';

export interface MissionProgress {
  prediction?: string;
  outcome?: string | null;
  done: boolean;
}

export interface CitySaved {
  version: 1;
  configs: Record<string, CityConfig>;
  missions: Record<string, MissionProgress>;
  lastScenario?: string;
  speed: number;
  budget: Record<string, string[]>;
  renderer?: 'webgl' | '2d';
  /** La guía de primeros pasos ya se cerró. */
  coach?: boolean;
  /** Etiquetas de la maqueta ocultas (false). Por omisión se muestran. */
  labels?: boolean;
  /** Panel derecho contraído para ampliar la maqueta. */
  panelHidden?: boolean;
  /** Foto aérea de los sectores reales apagada (false). Por omisión se muestra. */
  ortho?: boolean;
}

export const DEFAULT_SAVED: CitySaved = { version: 1, configs: {}, missions: {}, speed: 30, budget: {} };

export function loadCity(): CitySaved {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SAVED };
    const d = JSON.parse(raw) as Partial<CitySaved>;
    const out: CitySaved = { ...DEFAULT_SAVED, configs: {}, missions: {}, budget: {} };
    // cada configuración se valida contra el escenario; lo inválido se descarta
    for (const [id, cfg] of Object.entries(d.configs ?? {})) {
      const v = validateConfig(cfg, allScenarios());
      if (v.ok && v.config && v.config.shared.scenarioId === id) out.configs[id] = v.config;
    }
    for (const [id, m] of Object.entries(d.missions ?? {})) if (m && typeof m.done === 'boolean') out.missions[id] = { done: m.done, prediction: typeof m.prediction === 'string' ? m.prediction : undefined, outcome: typeof m.outcome === 'string' ? m.outcome : null };
    if (typeof d.lastScenario === 'string' && allScenarios()[d.lastScenario]) out.lastScenario = d.lastScenario;
    if ([15, 30, 60, 120].includes(d.speed as number)) out.speed = d.speed as number;
    for (const [id, list] of Object.entries(d.budget ?? {})) if (Array.isArray(list)) out.budget[id] = list.filter((q) => typeof q === 'string').slice(0, 30);
    if (d.renderer === 'webgl' || d.renderer === '2d') out.renderer = d.renderer;
    if (d.coach === true) out.coach = true;
    if (d.labels === false) out.labels = false;
    if (d.panelHidden === true) out.panelHidden = true;
    if (d.ortho === false) out.ortho = false;
    return out;
  } catch {
    return { ...DEFAULT_SAVED };
  }
}

export function saveCity(s: CitySaved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin almacenamiento disponible: el laboratorio funciona igual */
  }
}

export function clearCity(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nada que borrar */
  }
}
