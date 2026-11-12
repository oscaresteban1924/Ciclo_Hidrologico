// Sala «Aguas subterráneas»: el acuífero (Darcy y Dupuit), el pozo (Theis y la prueba de bombeo) y la mancha
// (transporte y zona de captura). Cada parte tiene escena 3D, instrumentos en vivo, retos, experimentos que se comparan
// con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { AcuiferoLab } from './AcuiferoLab';
import { ManchaLab } from './ManchaLab';
import { PozoLab } from './PozoLab';

const PARTS: RoomPart[] = [
  { id: 'acuifero', name: 'El acuífero y la ley de Darcy', short: 'El acuífero', icon: 'M2 6c3 1 6 1 8 0s5-1 8 0M2 6v11h16V6M2 11c4 1 9 2 16 3M5 14h2M10 15h2', C: AcuiferoLab },
  { id: 'pozo', name: 'El pozo y su cono', short: 'El pozo', icon: 'M2 6h16M2 6c4 0 6 5 8 9 2-4 4-9 8-9M10 2v13M8 2h4', C: PozoLab },
  { id: 'mancha', name: 'La mancha y la zona de captura', short: 'La mancha', icon: 'M2 10h4M4 6l2 4-2 4M8 10c2-3 5-3 7 0-2 3-5 3-7 0M17 7v6', C: ManchaLab },
];

export default function GroundLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:subterraneas"
      prefix="as"
      title="Aguas subterráneas"
      disclaimer="Laboratorio educativo de hidrogeología con los métodos clásicos (Darcy, Dupuit, Theis, Cooper-Jacob, zona de captura y transporte con dispersión). El valle, el acuífero, el pozo y la fuga son ilustrativos: no representan los acuíferos del valle de Aburrá ni ningún pozo real, y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
