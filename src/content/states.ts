// Cambios de estado del agua (exploración complementaria del paso L).

import type { LayerId } from './types';

export type Phase = 'solido' | 'liquido' | 'gas';

export interface PhaseChange {
  id: string;
  name: string;
  from: Phase;
  to: Phase;
  where: string;
  region: string;
  layers: LayerId[];
}

export const PHASE_NAMES: Record<Phase, string> = {
  solido: 'Sólido (hielo y nieve)',
  liquido: 'Líquido (agua)',
  gas: 'Gas (vapor de agua)',
};

export const PHASE_CHANGES: PhaseChange[] = [
  { id: 'fusion', name: 'Fusión', from: 'solido', to: 'liquido', where: 'La nieve de las cumbres se funde y forma arroyos de deshielo.', region: 'mountains', layers: ['melt'] },
  { id: 'congelacion', name: 'Congelación', from: 'liquido', to: 'solido', where: 'En las partes altas y frías de las nubes, gotas muy frías se congelan; en invierno, el agua de charcos y lagos puede helarse.', region: 'mountains', layers: ['snow'] },
  { id: 'evaporacion', name: 'Evaporación', from: 'liquido', to: 'gas', where: 'Del océano, del lago, de los ríos, del suelo y de las hojas mojadas.', region: 'evaporation', layers: ['evap'] },
  { id: 'condensacion', name: 'Condensación', from: 'gas', to: 'liquido', where: 'En el aire que sube y se enfría: así se forman las nubes.', region: 'condensation', layers: ['cond'] },
  { id: 'sublimacion', name: 'Sublimación', from: 'solido', to: 'gas', where: 'En la nieve de las cumbres, sobre todo con aire seco, sol y viento.', region: 'mountains', layers: ['sublim'] },
  { id: 'deposicion', name: 'Deposición', from: 'gas', to: 'solido', where: 'En las nubes frías, el vapor forma cristales de hielo directamente; también así se forma la escarcha.', region: 'mountains', layers: ['snow'] },
];
