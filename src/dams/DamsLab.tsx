// Sala «Presas y embalses»: el embalse (tránsito de crecientes), el vertedero (cresta WES y pozo de disipación) y la
// presa de gravedad (estabilidad). Cada parte tiene escena 3D, instrumentos en vivo, retos, experimentos que se comparan
// con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { EmbalseLab } from './EmbalseLab';
import { EstabilidadLab } from './EstabilidadLab';
import { VertederoLab } from './VertederoLab';

const PARTS: RoomPart[] = [
  { id: 'embalse', name: 'El embalse y la creciente', short: 'El embalse', icon: 'M2 12c3-1 5-1 8 0s5 1 8 0M2 15c3-1 5-1 8 0s5 1 8 0M13 4v12M13 4h5v12', C: EmbalseLab },
  { id: 'vertedero', name: 'El vertedero y el pozo', short: 'El vertedero', icon: 'M2 6h4c3 0 4 3 5 6l1 4h6M12 16v2h6v-2M2 6v12', C: VertederoLab },
  { id: 'estabilidad', name: 'La presa de gravedad', short: 'La presa', icon: 'M5 3h3l7 15H5zM2 18h16M4 8l-2 0M4 11H1M4 14H1', C: EstabilidadLab },
];

export default function DamsLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:presas"
      prefix="pr"
      title="Presas y embalses"
      disclaimer="Laboratorio educativo de obras hidráulicas con los métodos clásicos (tránsito de crecientes de Puls, vertedero WES, resalto hidráulico y estabilidad de presas de gravedad). El embalse, el vertedero y la presa son ilustrativos: no representan ninguna presa de Antioquia ni de Colombia, no son un pronóstico de crecientes y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
