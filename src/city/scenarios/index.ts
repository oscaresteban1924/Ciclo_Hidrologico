// Registro de escenarios disponibles. Los escenarios importados (datos reales) se agregan en tiempo de ejecución.

import type { Scenario } from '../sim/scenario';
import { laderaScenario } from './ladera';
import { streetScenario } from './street';
import juanBobo from './reales/andalucia-juan-bobo.json';
import iguana from './reales/la-iguana-el-pesebre.json';
import anaDiaz from './reales/ana-diaz-el-corazon.json';

/** Tanques de lluvia que ofrece el planificador en los sectores reales: uno de 2 m³ en cada uno de los techos más grandes. */
export const PLAN_TANKS = { count: 10, capacityM3: 2 } as const;

const polyArea = (p: [number, number][]) => Math.abs(p.reduce((s, [x, y], i) => s + x * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * y, 0)) / 2;

/** Agrega al sector real los tanques del planificador (no están en los datos oficiales: son una intervención). */
function withPlanTanks(sc: Scenario): Scenario {
  if (sc.tanks.length > 0 || sc.buildings.length === 0) return sc;
  const big = [...sc.buildings].sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon)).slice(0, PLAN_TANKS.count);
  return {
    ...sc,
    tanks: big.map((b, i) => ({ id: `plan-tanque-${b.id}`, name: `Tanque de lluvia en el techo ${i + 1}`, buildingIds: [b.id], capacityM3: PLAN_TANKS.capacityM3, releaseLps: 0, cost: 3 })),
  };
}

/** Sectores con datos oficiales de la Alcaldía de Medellín (generados con tools/geo/sector_real.py). */
const REALES = ([juanBobo, iguana, anaDiaz] as unknown as Scenario[]).map(withPlanTanks);

let cache: Record<string, Scenario> | null = null;

export function builtinScenarios(): Record<string, Scenario> {
  if (!cache) {
    const list = [streetScenario(), laderaScenario(), ...REALES];
    cache = Object.fromEntries(list.map((s) => [s.id, s]));
  }
  return cache;
}

const imported: Record<string, Scenario> = {};

export function registerScenario(s: Scenario): void {
  imported[s.id] = s;
}

export function allScenarios(): Record<string, Scenario> {
  return { ...builtinScenarios(), ...imported };
}
