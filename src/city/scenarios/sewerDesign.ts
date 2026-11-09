// Trazado didáctico de una red de alcantarillado con criterios de la norma de EPM (GD-AS002).
//
// Calcula las cotas de batea de cada tramo de aguas arriba hacia aguas abajo:
//  · recubrimiento mínimo hasta la cota clave (corona) de la tubería (EPM 6.2.14 y 5.2.15: 1,2 m);
//  · pendiente entre un mínimo (autolimpieza; 2 % en conductos de sumidero, EPM 8.5.3) y un máximo que
//    mantiene la velocidad a tubo lleno por debajo del límite del material;
//  · si el terreno baja más rápido que la pendiente máxima, la tubería sale más profunda de la cámara de
//    aguas arriba y esa cámara queda con caída; si la caída supera 0,7 m es «cámara de caída» (EPM 8.4.1).
// No es un diseño de ingeniería: es un trazado coherente con esos criterios para enseñar.

import { cellOf, compile } from '../sim/compile';
import { baseInterventions, type Pt, type Scenario, type SewerNodeSpec, type SewerPipeSpec, type SewerSystemId } from '../sim/scenario';

export interface DesignNode {
  id: string;
  name: string;
  at: Pt;
  kind: 'camara' | 'caja-sumidero' | 'descarga';
  /** Diámetro de la cámara (1,2 m) o lado de la caja del sumidero en planta [m]. */
  diameterM?: number;
  outfall?: 'quebrada' | 'colector';
  /** Para descargas a la quebrada: cota fija de la batea de salida [m]. */
  fixedInvertM?: number;
}

export interface DesignPipe {
  id: string;
  from: string;
  to: string;
  diameterM: number;
  material: 'concreto' | 'PVC';
  role: 'colector' | 'conexion-sumidero';
}

export interface DesignOptions {
  system: SewerSystemId;
  /** Cota de la rasante en un punto [m]. */
  surface: (p: Pt) => number;
  /** Recubrimiento sobre la corona [m] (≥ 1,2 m); en conductos de sumidero puede darse aparte. */
  cover: number;
  coverInlet?: number;
  /** Pendientes mínimas [m/m] para colectores y conductos de sumidero. */
  minSlope: number;
  minSlopeInlet?: number;
  /** Velocidad máxima a tubo lleno [m/s] por material (EPM: 5 m/s en concreto; 10 m/s en plásticos). */
  vMax: { concreto: number; PVC: number };
}

export const MANNING = { concreto: 0.013, PVC: 0.010 } as const;

/** Pendiente que da una velocidad v a tubo lleno con Manning. */
function slopeForVelocity(v: number, D: number, n: number): number {
  return Math.pow((v * n) / Math.pow(D / 4, 2 / 3), 2);
}

export function designNetwork(nodes: DesignNode[], pipes: DesignPipe[], o: DesignOptions): { nodes: SewerNodeSpec[]; pipes: SewerPipeSpec[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outOf = new Map<string, DesignPipe>();
  const into = new Map<string, DesignPipe[]>();
  for (const p of pipes) {
    if (outOf.has(p.from)) throw new Error(`El nodo ${p.from} tiene dos salidas: la red de diseño debe ser un árbol.`);
    outOf.set(p.from, p);
    into.set(p.to, [...(into.get(p.to) ?? []), p]);
  }
  // orden topológico: un nodo se procesa cuando todos sus tramos de llegada ya tienen cota
  const zDn = new Map<string, number>();
  const zUp = new Map<string, number>();
  const inv = new Map<string, number>();
  const done = new Set<string>();
  const pending = [...nodes];
  let guard = 0;
  while (pending.length && guard++ < 10000) {
    const k = pending.findIndex((n) => (into.get(n.id) ?? []).every((p) => zDn.has(p.id)));
    if (k < 0) throw new Error('La red de diseño tiene un ciclo.');
    const n = pending.splice(k, 1)[0];
    const ins = into.get(n.id) ?? [];
    const minIn = ins.length ? Math.min(...ins.map((p) => zDn.get(p.id)!)) : Infinity;
    const out = outOf.get(n.id);
    if (!out) {
      // descarga: fondo bajo la tubería que llega (o cota fija)
      inv.set(n.id, n.fixedInvertM ?? minIn);
      done.add(n.id);
      continue;
    }
    const to = byId.get(out.to)!;
    const L = Math.max(1, Math.hypot(to.at[0] - n.at[0], to.at[1] - n.at[1]));
    const inletPipe = out.role === 'conexion-sumidero';
    const cover = inletPipe ? o.coverInlet ?? o.cover : o.cover;
    const sMin = inletPipe ? o.minSlopeInlet ?? 0.02 : o.minSlope;
    const sMax = slopeForVelocity(o.vMax[out.material], out.diameterM, MANNING[out.material]);
    const D = out.diameterM;
    const zUpMax = Math.min(minIn, o.surface(n.at) - cover - D);
    let zDnT = to.fixedInvertM !== undefined ? to.fixedInvertM : o.surface(to.at) - cover - D;
    // a una descarga libre o a la quebrada no se exige recubrimiento en el extremo de llegada
    if (to.kind === 'descarga' && to.fixedInvertM === undefined) zDnT = Math.min(zDnT, zUpMax - sMin * L);
    let up = Math.min(zUpMax, zDnT + sMax * L);
    let dn = Math.min(zDnT, up - sMin * L);
    if (to.kind === 'descarga' && to.fixedInvertM !== undefined) {
      // la batea de salida está fijada (cabezal en la orilla): la tubería llega justo ahí
      dn = to.fixedInvertM;
      up = Math.min(zUpMax, Math.max(dn + sMin * L, Math.min(up, dn + sMax * L)));
    }
    zUp.set(out.id, up);
    zDn.set(out.id, dn);
    inv.set(n.id, up);
    done.add(n.id);
  }
  // las descargas que no tenían tramos al procesarse se recalculan con los de llegada
  for (const n of nodes) {
    if (outOf.get(n.id)) continue;
    const ins = into.get(n.id) ?? [];
    if (ins.length && n.fixedInvertM === undefined) inv.set(n.id, Math.min(...ins.map((p) => zDn.get(p.id)!)));
  }
  const outNodes: SewerNodeSpec[] = nodes.map((n) => {
    const ins = into.get(n.id) ?? [];
    const drop = ins.length && outOf.get(n.id) ? Math.max(...ins.map((p) => zDn.get(p.id)! - inv.get(n.id)!)) : 0;
    const kind = n.kind === 'camara' && drop > 0.7 ? 'caida' : n.kind;
    return {
      id: n.id,
      name: n.name,
      system: o.system,
      kind,
      at: n.at,
      invertM: Math.round(inv.get(n.id)! * 1000) / 1000,
      diameterM: n.diameterM ?? (n.kind === 'caja-sumidero' ? 0.9 : 1.2),
      outfall: n.outfall,
      data: 'hipotetico',
    };
  });
  const outPipes: SewerPipeSpec[] = pipes.map((p) => ({
    id: p.id,
    system: o.system,
    from: p.from,
    to: p.to,
    diameterM: p.diameterM,
    material: p.material,
    manning: MANNING[p.material],
    // redondeo al milímetro sin reducir la pendiente: arriba se redondea, abajo se trunca hacia abajo
    invertUpM: Math.round(zUp.get(p.id)! * 1000) / 1000,
    invertDownM: Math.floor(zDn.get(p.id)! * 1000 - 0.5) / 1000,
    role: p.role,
    kind: 'hipotetico',
  }));
  // redondeo: el fondo de cada nodo no puede quedar por encima de un extremo de tubería
  for (const n of outNodes) {
    const ends = outPipes.flatMap((p) => [p.from === n.id ? p.invertUpM : Infinity, p.to === n.id ? p.invertDownM : Infinity]);
    n.invertM = Math.min(n.invertM, ...ends);
  }
  return { nodes: outNodes, pipes: outPipes };
}

/**
 * Rasante para el diseño: la cota de la celda del cálculo en cada resolución permitida (la más baja), para
 * que el recubrimiento se cumpla con cualquier malla.
 */
export function surfaceOf(sc: Scenario): (p: Pt) => number {
  const comp = sc.resolutions.map((dx) => compile({ ...sc, sewer: undefined }, { ...sc.defaults, dx }, baseInterventions(sc)));
  return (p: Pt) => Math.min(...comp.map((c) => c.z[cellOf(c.dx, c.nx, c.ny, p)]));
}
