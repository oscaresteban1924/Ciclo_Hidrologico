// Red de drenaje: interfaz para conectar un modelo hidráulico (p. ej., SWMM) y una red esquemática simple.
//
// La red esquemática NO resuelve la hidráulica de tuberías: acepta el agua que captan los sumideros hasta
// una capacidad total del colector y la entrega a la descarga en el mismo paso. Nunca devuelve agua a la
// calle (no simula sobrecarga). Así se evita mostrar una sobrecarga falsa.

export interface DrainExchange {
  /** Volumen ofrecido por cada entrada (sumideros y luego depósitos) en este paso [m³]. */
  offered: Float64Array;
  /** Volumen aceptado por cada entrada [m³] (≤ ofrecido). Lo escribe la red. */
  accepted: Float64Array;
  /** Volumen que la red devuelve a la superficie en cada entrada [m³] (sobrecarga). */
  returned: Float64Array;
}

export interface DrainNetworkAdapter {
  readonly id: string;
  readonly label: string;
  /** true solo si la red resuelve hidráulica de tuberías (no es el caso de la red esquemática). */
  readonly hydraulicallySolved: boolean;
  reset(): void;
  exchange(t: number, dt: number, x: DrainExchange): void;
  /** Volumen almacenado dentro de la red [m³]. */
  storage(): number;
  /** Volumen entregado a la descarga desde el inicio [m³]. */
  outfallVolume(): number;
}

/**
 * Red esquemática: colector con capacidad total limitada [m³/s]. Si lo ofrecido supera la capacidad,
 * todas las entradas se reducen en la misma proporción. Sin almacenamiento ni retorno.
 */
export class SchematicNetwork implements DrainNetworkAdapter {
  readonly id = 'red-esquematica';
  readonly label = 'Red esquemática (no se resuelve la hidráulica de tuberías)';
  readonly hydraulicallySolved = false;
  private out = 0;
  constructor(private readonly trunkCapacity: number) {}
  reset(): void {
    this.out = 0;
  }
  exchange(_t: number, dt: number, x: DrainExchange): void {
    let total = 0;
    for (let k = 0; k < x.offered.length; k++) total += x.offered[k];
    const cap = this.trunkCapacity * dt;
    const f = total > cap && total > 0 ? cap / total : 1;
    for (let k = 0; k < x.offered.length; k++) {
      x.accepted[k] = x.offered[k] * f;
      x.returned[k] = 0;
      this.out += x.accepted[k];
    }
  }
  storage(): number {
    return 0;
  }
  outfallVolume(): number {
    return this.out;
  }
}

/*
 * Conexión futura con SWMM (no implementada): un adaptador debería
 *  1) mapear cada sumidero a un nodo de SWMM,
 *  2) en exchange(), entregar `offered/dt` como caudal lateral, avanzar SWMM hasta t+dt,
 *  3) escribir en `accepted` lo que el nodo realmente admitió y en `returned` el desborde del nodo,
 *  4) informar storage() con el volumen en conductos y nodos, y outfallVolume() con la descarga.
 * El motor de superficie ya contabiliza `returned` como agua que vuelve a la calle.
 */
