// Persistencia local mínima: preferencias, progreso y bitácora, solo en este dispositivo.
// No se envía nada a ningún servidor.

import type { LogEntry, Quality, Speed } from '../state/store';

const KEY = 'ciclo-hidrologico:v1';

export interface Saved {
  prefs?: { reducedMotion?: boolean; narration?: boolean; labels?: boolean; arrows?: boolean };
  progress?: { visited?: string[]; found?: string[]; challenges?: string[]; discovered?: string[] };
  step?: number;
  speed?: Speed;
  quality?: Quality;
  logbook?: LogEntry[];
}

export function loadSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Saved;
    // validación defensiva: si algo no tiene la forma esperada, se descarta
    if (data.speed !== undefined && ![0.5, 1, 2].includes(data.speed)) delete data.speed;
    if (data.quality !== undefined && !['auto', 'alta', 'ligera'].includes(data.quality)) delete data.quality;
    if (data.logbook !== undefined && !Array.isArray(data.logbook)) delete data.logbook;
    if (data.logbook) data.logbook = data.logbook.filter((e) => e && typeof e.title === 'string' && typeof e.text === 'string').slice(-150);
    return data;
  } catch {
    return null;
  }
}

export function save(data: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* almacenamiento no disponible: la app sigue funcionando sin guardar */
  }
}
