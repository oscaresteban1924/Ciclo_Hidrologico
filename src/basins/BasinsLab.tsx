// Sala «Cuencas: de la lluvia al caudal»: la cuenca y su tiempo de concentración, el hidrograma (y lo que cambia al
// urbanizar), y las crecientes con su período de retorno y su riesgo. Cada parte tiene escena 3D, instrumentos en vivo,
// retos, experimentos que se comparan con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { CuencaLab } from './CuencaLab';
import { FrecuenciaLab } from './FrecuenciaLab';
import { HidroLab } from './HidroLab';
import './basins.css';

const PARTS: RoomPart[] = [
  { id: 'cuenca', name: 'La cuenca y su respuesta', short: 'La cuenca', icon: 'M2 15c2-6 5-10 8-10s6 4 8 10M10 5v4M7 9l3 3 3-3M10 12v5', C: CuencaLab },
  { id: 'hidrograma', name: 'El hidrograma y la urbanización', short: 'El hidrograma', icon: 'M2 17h16M2 17c3 0 4-11 6-11s4 7 10 9M4 3v3M7 2v3M10 3v3', C: HidroLab },
  { id: 'frecuencia', name: 'Crecientes y riesgo', short: 'Crecientes', icon: 'M2 12h4l2-5 2 9 2-6 2 3h4M2 16.5c2.5-1.5 4 1.5 6.5 0s4 1.5 6.5 0 2 .8 3 .5', C: FrecuenciaLab },
];

export default function BasinsLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:cuencas"
      prefix="cu"
      title="Cuencas: de la lluvia al caudal"
      disclaimer="Laboratorio educativo de hidrología con los métodos clásicos (tiempo de concentración, método racional, número de curva, hidrograma unitario y Gumbel). Las cuencas, el río, la curva IDF y las series de caudales son ilustrativos: no representan una quebrada de Medellín ni son pronósticos oficiales de crecientes, y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
