// Escenas de la sala «Acueducto» (ilustrativas, no son redes de Medellín): la conducción desde un tanque en la loma
// hasta un barrio, la red de un barrio de nueve nudos con su curva de consumo del día y la tubería del golpe de ariete.

import { PVC_DIAMETERS, type PipeMat, type PipePoint, type PipelineInput } from './pipes';
import type { Network } from './network';

/** Perfil de la conducción: sale del tanque en la loma, pasa una loma pequeña y llega al barrio. */
export const PIPE_PROFILE: PipePoint[] = [
  { x: 0, z: 44 },
  { x: 60, z: 40 },
  { x: 140, z: 26 },
  { x: 200, z: 23 },
  { x: 245, z: 28 },
  { x: 300, z: 15 },
  { x: 420, z: 6 },
];

/** Codos en los cambios de pendiente. */
export const PIPE_FITTINGS = [60, 140, 200, 245, 300].map((x) => ({ x, K: 0.4, name: 'Codo de 45°' }));

export interface PipeScene {
  H0: number;
  dIdx: number;
  mat: PipeMat;
  open: number;
  method: 'darcy' | 'hw';
  T: number;
}

export const DEFAULT_PIPE: PipeScene = { H0: 50, dIdx: 1, mat: 'pvc', open: 0.25, method: 'darcy', T: 20 };

export function pipeInput(s: PipeScene): PipelineInput {
  return { H0: s.H0, profile: PIPE_PROFILE, D: PVC_DIAMETERS[s.dIdx].D, mat: s.mat, T: s.T, fittings: PIPE_FITTINGS, open: s.open, method: s.method };
}

/** Curva de consumo de un día (factor de la demanda media, hora a hora; ilustrativa, promedio 1). */
const RAW_DAY = [0.45, 0.4, 0.38, 0.38, 0.45, 0.7, 1.25, 1.6, 1.45, 1.2, 1.1, 1.15, 1.3, 1.2, 1.05, 1.0, 1.05, 1.2, 1.45, 1.55, 1.3, 1.0, 0.75, 0.55];
const MEAN_DAY = RAW_DAY.reduce((a, x) => a + x, 0) / RAW_DAY.length;
export const DAY_CURVE = RAW_DAY.map((x) => x / MEAN_DAY);
/** Factor de la demanda a una hora (interpolado entre horas). */
export function dayFactor(h: number): number {
  const t = ((h % 24) + 24) % 24;
  const k = Math.floor(t), f = t - k;
  return DAY_CURVE[k] * (1 - f) + DAY_CURVE[(k + 1) % 24] * f;
}

/** Red del barrio: tanque al occidente, nueve nudos en tres calles; el terreno baja hacia el oriente. */
export function barrio(H0: number, closed: string | null = null, mainD = 0.1982): Network {
  const col = [0, 130, 260], row = [0, 110, 220];
  const zOf = (i: number, j: number) => 22 - 0.0385 * col[i] + (j === 2 ? 1 : j === 1 ? -1 : 0);
  const nodes = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) nodes.push({ id: `N${j * 3 + i + 1}`, x: col[i], y: row[j], z: Math.round(zOf(i, j) * 10) / 10, q: [3.2, 3.6, 2.8, 3.4, 4.2, 3, 2.6, 3, 2.4][j * 3 + i] });
  nodes.unshift({ id: 'T', x: -200, y: 110, z: 38, q: 0 });
  // calles en 4" y carreras en 3" (diámetros internos de PVC)
  const H6 = 0.1033, H4 = 0.0803;
  const pipes = [
    { id: 'P0', a: 'T', b: 'N4', L: 230, D: mainD, C: 140 },
    // calles este-oeste
    { id: 'P1', a: 'N1', b: 'N2', L: 130, D: H6, C: 140 },
    { id: 'P2', a: 'N2', b: 'N3', L: 130, D: H4, C: 140 },
    { id: 'P3', a: 'N4', b: 'N5', L: 130, D: H6, C: 140 },
    { id: 'P4', a: 'N5', b: 'N6', L: 130, D: H6, C: 140 },
    { id: 'P5', a: 'N7', b: 'N8', L: 130, D: H6, C: 140 },
    { id: 'P6', a: 'N8', b: 'N9', L: 130, D: H4, C: 140 },
    // carreras norte-sur
    { id: 'P7', a: 'N4', b: 'N1', L: 110, D: H6, C: 140 },
    { id: 'P8', a: 'N4', b: 'N7', L: 110, D: H6, C: 140 },
    { id: 'P9', a: 'N5', b: 'N2', L: 110, D: H4, C: 140 },
    { id: 'P10', a: 'N5', b: 'N8', L: 110, D: H4, C: 140 },
    { id: 'P11', a: 'N6', b: 'N3', L: 110, D: H4, C: 140 },
    { id: 'P12', a: 'N6', b: 'N9', L: 110, D: H4, C: 140 },
  ];
  return { source: 'T', H0, nodes, pipes: pipes.map((p) => ({ ...p, closed: p.id === closed })) };
}

/** Tubos que se pueden cerrar en la escena, con su nombre. */
export const CLOSABLE: { id: string; name: string; short: string }[] = [
  { id: 'P3', name: 'Calle central, primera cuadra', short: 'Calle central' },
  { id: 'P7', name: 'Carrera occidental, hacia el norte', short: 'Carrera oeste' },
  { id: 'P4', name: 'Calle central, segunda cuadra', short: 'Calle central 2' },
  { id: 'P0', name: 'La matriz desde el tanque', short: 'La matriz' },
];

/** Tubería del golpe de ariete: espesor de pared por material para un diámetro de 0,3 m. */
export const HAMMER_WALL: Partial<Record<PipeMat, { e: number; note: string }>> = {
  acero: { e: 0.0064, note: 'acero de 6,4 mm (¼")' },
  hd: { e: 0.0072, note: 'hierro dúctil de 7,2 mm' },
  pvc: { e: 0.3 / 21, note: 'PVC RDE 21 (espesor D/21)' },
  pead: { e: 0.3 / 11, note: 'PEAD RDE 11 (espesor D/11)' },
};
