// Puente peatonal bajo la creciente: gálibo, empuje del agua, resistencia de los apoyos y posible colapso. Todas las
// cifras salen del cálculo (sim/bridge.ts) con supuestos didácticos declarados; no es una evaluación estructural.

import { useId, useMemo } from 'react';
import type { CitySim } from '../sim/engine';
import { COLLAPSE_HOLD_S, MU_FRICTION, bearingCapacity, selfWeight } from '../sim/bridge';
import { fmtNum } from '../render/palette';
import { LineChart, type Series } from './Chart';
import { Stat } from './SewerPanel';

export const BRIDGE_SOURCES =
  'Arrastre: Kerenyi, Sofu y Guo (2009), «Hydrodynamic forces on inundated bridge decks», FHWA-HRT-09-028 (envolvente superior de C_D). Flotación y aire atrapado: FHWA HDS-7 (2012), cap. 7. Cortante por fricción en los apoyos: ACI 318, μ = 0,6.';

export function BridgeSection({ sim }: { sim: CitySim }) {
  const id = useId();
  const cb = sim.c.bridge, st = sim.bridge;
  const nSamples = sim.samples.length;
  const series: Series[] = useMemo(() => {
    const pts = sim.samples.filter((q) => q.bridge);
    return [{ id: 'Uso', label: 'Resistencia usada', name: 'Parte de la resistencia de los apoyos que usa el empuje del agua', color: '#c0462a', fill: true, points: pts.map((q) => [q.t / 60, Math.min(150, q.bridge!.util * 100)] as [number, number]) }];
    // las muestras crecen con el cálculo: se recalcula con su número
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, nSamples]);
  if (!cb || !st) return null;
  const b = cb.spec;
  const w = selfWeight(b);
  const fallen = st.status === 'colapsado';
  const wet = Number.isFinite(st.level);
  const above = wet ? st.level - cb.soffit : -Infinity;
  const pins = `${b.dowels} pasadores de ${fmtNum(b.dowelMm, 1)} mm`;
  const capDry = bearingCapacity(b, w / 2);
  const tone = fallen ? 'danger' : st.utilization >= 0.7 ? 'danger' : above >= 0 ? 'warn' : 'ok';
  return (
    <section className="culvert-box bridge-box" aria-labelledby={`${id}-t`}>
      <h4 id={`${id}-t`}>Puente peatonal</h4>
      <p className="city-small">
        Tablero de concreto de {fmtNum(b.spanM, 0)} m de vano y {fmtNum(b.widthM, 1)} m de ancho, con {b.beams} vigas y {fmtNum(b.beamM * 100, 0)} cm de canto, apoyado en dos estribos con {pins} cada uno (supuesto). Mientras el agua pasa bajo la viga, el puente no recibe empuje. Cuando se acaba el <strong>gálibo</strong>, el agua lo empuja de lado y cada apoyo debe resistir la mitad de ese empuje. Si el empuje pasa lo que resisten los apoyos durante {COLLAPSE_HOLD_S} s o más, el puente colapsa.
      </p>
      <div className="stat-row">
        <Stat label="Gálibo bajo la viga" value={!wet ? 'libre' : above < 0 ? `${fmtNum(-above, 2)} m` : 'no queda'} sub={wet && above >= 0 ? `agua ${fmtNum(above, 2)} m sobre el fondo de la viga` : 'espacio entre el agua y la viga'} tone={!wet || above < -0.3 ? 'ok' : above < 0 ? 'warn' : 'danger'} />
        <Stat label="Empuje del agua" value={`${fmtNum(fallen ? st.dragMax : st.drag, 0)} kN`} sub={fallen ? 'el que tenía al colapsar' : `máximo del evento: ${fmtNum(st.dragMax, 0)} kN`} tone={st.drag > 0 ? 'warn' : 'neutral'} />
        <Stat label="Resistencia usada" value={fallen ? 'superada' : `${fmtNum(st.utilization * 100, 0)} %`} sub={fallen ? `colapsó en el minuto ${fmtNum(st.collapsedAt / 60, 1)} (${st.mode === 'flotacion' ? 'el agua lo levantó' : 'se deslizó de sus apoyos'})` : `máximo del evento: ${fmtNum(st.utilMax * 100, 0)} %`} tone={tone} />
      </div>
      {!fallen && above >= 0 && (
        <table className="city-table">
          <caption>Cuentas de este momento</caption>
          <tbody>
            <tr><th scope="row">Velocidad del agua bajo el puente</th><td>{fmtNum(st.velocity, 1)} m/s</td></tr>
            <tr><th scope="row">Relación de inundación h* = (nivel − fondo de viga) / canto</th><td>{fmtNum(Math.max(0, st.hStar), 2)}</td></tr>
            <tr><th scope="row">Coeficiente de arrastre C_D</th><td>{fmtNum(st.cd, 2)}</td></tr>
            <tr><th scope="row">Densidad del agua (con el lodo calculado)</th><td>{fmtNum(st.rho, 0)} kg/m³</td></tr>
            <tr><th scope="row">Empuje = C_D · ½ρv² · canto, sumado en el vano</th><td>{fmtNum(st.drag, 1)} kN</td></tr>
            <tr><th scope="row">Cortante en cada apoyo (la mitad)</th><td>{fmtNum(st.shear, 1)} kN</td></tr>
            <tr><th scope="row">Peso del tablero / flotación del agua</th><td>{fmtNum(st.weight, 0)} / {fmtNum(st.lift, 0)} kN</td></tr>
            <tr><th scope="row">Resistencia de cada apoyo = μ·(pasadores·f_y + peso que le queda)</th><td>{fmtNum(st.capacity, 1)} kN (seco: {fmtNum(capDry, 0)} kN)</td></tr>
          </tbody>
        </table>
      )}
      {nSamples > 1 && series[0].points.some((p) => p[1] > 0) && <LineChart title="Resistencia de los apoyos que usa el agua" series={series} fmtY={(v) => `${fmtNum(v, 0)} %`} yUnit="por ciento" refY={{ y: 100, label: 'colapso (100 %)' }} height={150} xMax={sim.endT / 60} nowX={sim.t / 60} />}
      <p className="city-small">
        Por qué la flotación importa: con el tablero bajo el agua, el agua lo levanta (también por el aire que queda atrapado entre las vigas) y le quita peso; con menos peso, la fricción en los apoyos (μ = {fmtNum(MU_FRICTION, 1)}) resiste menos. El lodo hace más densa el agua y aumenta el empuje y la flotación. No incluye el golpe de troncos, la acumulación de ramas contra el puente, la socavación de los estribos ni la flexión de las piezas: todos aumentan el riesgo.
      </p>
      <p className="city-small">
        {BRIDGE_SOURCES} Escenario didáctico: no es la evaluación de un puente real ni un diseño de ingeniería.
      </p>
    </section>
  );
}
