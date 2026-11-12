// Sala «Laderas»: la lluvia que entra al suelo (Green-Ampt), la ladera que se desliza cuando sube el agua (talud
// infinito) y la ladera que pierde suelo (RUSLE). Cada parte tiene escena 3D, instrumentos en vivo, retos,
// experimentos que se comparan con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { ErosionLab } from './ErosionLab';
import { InfiltracionLab } from './InfiltracionLab';
import { TaludLab } from './TaludLab';

const PARTS: RoomPart[] = [
  { id: 'infiltracion', name: 'La lluvia entra al suelo', short: 'Infiltración', icon: 'M3 4v3M7 3v3M11 4v3M2 10h16M2 13h16M2 16h16M14 9v8', C: InfiltracionLab },
  { id: 'talud', name: 'La ladera y el agua', short: 'La ladera', icon: 'M2 17h16M2 17 12 5h6M5 14l6-7M7 17l3-4', C: TaludLab },
  { id: 'erosion', name: 'La ladera pierde suelo', short: 'Erosión', icon: 'M2 6l14 10M4 9l2 1M8 11l2 1M12 13l2 1M16 16h3', C: ErosionLab },
];

export default function SlopesLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:laderas"
      prefix="la"
      title="Laderas"
      disclaimer="Laboratorio educativo de laderas con métodos clásicos (infiltración de Green-Ampt, talud infinito con agua, lluvia crítica de SHALSTAB y RUSLE). Las parcelas y las laderas son ilustrativas: no representan un lugar de Medellín ni de Colombia, no son un mapa de amenaza ni un estudio de estabilidad, y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
