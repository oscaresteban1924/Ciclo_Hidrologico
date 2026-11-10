// Planificador: un catálogo de obras para el sector, con un presupuesto en puntos del juego, que se prueba con
// una tormenta de diseño (A: el barrio como está; B: con el plan). Los puntos no son dinero: la relación entre
// costos sigue, donde existe, la calificación cualitativa de costos de capital de la Guía técnica de diseño y
// construcción de SUDS de Bogotá (SDA y Universidad de los Andes, 2016): cunetas verdes, BAJO; tanques de
// almacenamiento y zonas de bioretención, MEDIO.

import type { Indicators } from '../sim/compare';
import type { Interventions, Scenario } from '../sim/scenario';
import { budgetItems } from './missions';

export const PLAN_BUDGET = 100;

export interface PlanItem {
  id: string;
  label: string;
  /** Qué hace, en una frase. */
  detail: string;
  cost: number;
  /** Ítems del mismo grupo se excluyen entre sí. */
  group?: string;
  apply: (iv: Interventions) => void;
}

/** Obras disponibles en el sector. */
export function planItems(sc: Scenario): PlanItem[] {
  const items: PlanItem[] = [];
  const drains = sc.drains;
  if (drains.length) {
    items.push({
      id: 'sumideros',
      label: `Limpiar los ${drains.length} sumideros`,
      detail: 'Se quitan hojas, basura y lodo de las rejillas antes de las lluvias.',
      cost: Math.min(30, 4 * drains.length),
      apply: (iv) => {
        for (const d of drains) iv.drains[d.id] = 0;
      },
    });
  }
  // obras propias del sector (jardines, depósitos y zonas de la ladera y la calle de prueba)
  for (const it of budgetItems(sc)) {
    if (it.kind === 'sumidero') continue;
    if (it.kind === 'jardin') items.push({ id: it.id, label: it.label, detail: 'Un jardín más bajo que la calle recibe el agua de la cuneta y la deja entrar al suelo.', cost: it.cost, apply: (iv) => (iv.gardens[it.target] = true) });
    if (it.kind === 'deposito' && !it.target.startsWith('plan-tanque-')) items.push({ id: it.id, label: it.label, detail: 'Guarda la lluvia del techo y la entrega despacio a la red.', cost: it.cost, apply: (iv) => (iv.tanks[it.target] = { on: true, destination: 'red' }) });
    if (it.kind === 'zona' && it.value) items.push({ id: it.id, label: it.label, detail: it.value === 'adoquin_permeable' ? 'Pavimento con juntas y base de piedra: deja pasar parte del agua.' : 'Superficie con pasto o árboles: el agua entra al suelo.', cost: it.cost, group: `zona:${it.target}`, apply: (iv) => (iv.zones[it.target] = it.value as Interventions['zones'][string]) });
  }
  // tanques de lluvia en techos (sectores reales: los agrega el planificador)
  const planTanks = sc.tanks.filter((t) => t.id.startsWith('plan-tanque-'));
  if (planTanks.length) {
    const cap = planTanks.reduce((s, t) => s + t.capacityM3, 0);
    items.push({
      id: 'tanques-techos',
      label: `Tanques de lluvia en ${planTanks.length} techos grandes`,
      detail: `${planTanks.length} tanques de ${planTanks[0].capacityM3} m³ (${cap} m³ en total) que guardan la lluvia del techo para usarla después.`,
      cost: 30,
      apply: (iv) => {
        for (const t of planTanks) iv.tanks[t.id] = { on: true, destination: 'retener' };
      },
    });
  }
  // patios y antejardines verdes: una fracción del suelo abierto de concreto pasa a pasto
  for (const f of [0.1, 0.2]) {
    items.push({
      id: `verde-${f * 100}`,
      label: `Patios y antejardines verdes (${f * 100} %)`,
      detail: `El ${f * 100} % del concreto de patios, antejardines y lotes pasa a pasto, repartido por el sector.`,
      cost: f === 0.1 ? 20 : 40,
      group: 'verde',
      apply: (iv) => (iv.greening = f),
    });
  }
  if (sc.creek?.basin) {
    items.push({
      id: 'cuenca-bosque',
      label: 'Reforestar la cuenca de la quebrada',
      detail: 'Bosque en vez de potreros y barrios en la cuenca de arriba: la quebrada crece menos y más despacio (se nota con la creciente calculada desde la cuenca).',
      cost: 50,
      apply: (iv) => (iv.basinCover = 'bosque'),
    });
  }
  return items;
}

/** Aplica el plan elegido sobre las intervenciones (B). */
export function applyPlan(sc: Scenario, iv: Interventions, sel: string[]): void {
  for (const it of planItems(sc)) if (sel.includes(it.id)) it.apply(iv);
}

export const planCost = (sc: Scenario, sel: string[]): number => planItems(sc).filter((i) => sel.includes(i.id)).reduce((s, i) => s + i.cost, 0);

/** Indicadores del planificador, A y B. */
export interface PlanRow {
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  /** true: menos es mejor. */
  lower: boolean;
}

export function planRows(a: Indicators, b: Indicators): PlanRow[] {
  const m2 = (v: number) => `${Math.round(v).toLocaleString('es-CO')} m²`;
  const m3 = (v: number) => `${v.toLocaleString('es-CO', { maximumFractionDigits: v < 10 ? 1 : 0 })} m³`;
  const lps = (v: number) => `${(v * 1000).toLocaleString('es-CO', { maximumFractionDigits: 0 })} L/s`;
  const n = (v: number) => String(Math.round(v));
  const kg = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} t` : `${Math.round(v)} kg`);
  const haz = (x: Indicators) => x.hazardArea.slice(3).reduce((s, v) => s + v, 0);
  const rows: PlanRow[] = [
    { label: `Área con ${Math.round(a.threshold * 100)} cm de agua o más (máximo)`, a: a.maxAreaAbove, b: b.maxAreaAbove, fmt: m2, lower: true },
    { label: 'Área peligrosa para niños y carros (H3 o más)', a: haz(a), b: haz(b), fmt: m2, lower: true },
    { label: 'Edificaciones con 10 cm de agua o más', a: a.damage.affected, b: b.damage.affected, fmt: n, lower: true },
    { label: 'Agua que entró al suelo o se guardó', a: a.infiltrated + a.devices, b: b.infiltrated + b.devices, fmt: m3, lower: false },
    { label: 'Caudal pico que sale del sector', a: a.peakOutlet, b: b.peakOutlet, fmt: lps, lower: true },
    { label: 'Tierra que se llevó el agua', a: a.sed.out + a.sed.drained, b: b.sed.out + b.sed.drained, fmt: kg, lower: true },
  ];
  if (a.creekPeakIn > 0 || b.creekPeakIn > 0) rows.push({ label: 'Pico de la quebrada al entrar', a: a.creekPeakIn, b: b.creekPeakIn, fmt: (v) => `${v.toLocaleString('es-CO', { maximumFractionDigits: 1 })} m³/s`, lower: true });
  return rows;
}
