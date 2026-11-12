// Sala «Bombas y energía del agua»: la bomba contra su tubería (punto de operación, leyes de afinidad, serie y
// paralelo), el agua que hierve en la entrada de la bomba (NPSH y cavitación) y una pequeña central de pasada
// (potencia, turbinas y energía del año). Cada parte tiene escena 3D, instrumentos en vivo, retos, experimentos que
// se comparan con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { BombaLab } from './BombaLab';
import { CavitacionLab } from './CavitacionLab';
import { CentralLab } from './CentralLab';

const PARTS: RoomPart[] = [
  { id: 'bomba', name: 'La bomba y la tubería', short: 'Bombeo', icon: 'M3 15h4M10 10a3 3 0 1 0 0 .1M13 10h4V4M17 4h-3', C: BombaLab },
  { id: 'cavitacion', name: 'El agua hierve en la bomba', short: 'Cavitación', icon: 'M10 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12M8 9a1 1 0 1 0 0 .1M12 12a1 1 0 1 0 0 .1M11 7a.6.6 0 1 0 0 .1', C: CavitacionLab },
  { id: 'central', name: 'La central hidroeléctrica', short: 'Central', icon: 'M2 4h6l4 10h6M12 14a2 2 0 1 0 0 .1M15 4l-2 4h3l-2 4', C: CentralLab },
];

export default function PumpsLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:bombas"
      prefix="bo"
      title="Bombas y energía del agua"
      disclaimer="Laboratorio educativo de bombas y pequeñas centrales con métodos clásicos (curvas de bombas y de sistemas con Darcy-Weisbach, leyes de afinidad, NPSH y potencia hidráulica con curva de duración). Las bombas, las tuberías, el río y la central son ilustrativos: no representan equipos de un fabricante ni un lugar de Medellín o de Colombia, y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
