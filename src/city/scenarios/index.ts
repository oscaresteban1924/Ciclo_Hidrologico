// Registro de escenarios disponibles. Los escenarios importados (datos reales) se agregan en tiempo de ejecución.

import type { Scenario } from '../sim/scenario';
import { laderaScenario } from './ladera';
import { streetScenario } from './street';

let cache: Record<string, Scenario> | null = null;

export function builtinScenarios(): Record<string, Scenario> {
  if (!cache) {
    const list = [streetScenario(), laderaScenario()];
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
