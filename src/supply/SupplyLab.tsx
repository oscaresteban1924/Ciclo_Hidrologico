// Sala «Acueducto: el agua a presión»: la tubería (energía y pérdidas), la red del barrio (presiones a lo largo del día,
// Hardy Cross y el método del gradiente) y el golpe de ariete. Cada parte tiene escena 3D, instrumentos en vivo, retos,
// experimentos que se comparan con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { ArieteLab } from './ArieteLab';
import { RedLab } from './RedLab';
import { TuberiaLab } from './TuberiaLab';

const PARTS: RoomPart[] = [
  { id: 'tuberia', name: 'La tubería y su energía', short: 'La tubería', icon: 'M2 5h3v3M4 8v6h12M16 14v-3h2M7 14V9M11 14V6M15 14v-4', C: TuberiaLab },
  { id: 'red', name: 'La red del barrio', short: 'La red', icon: 'M4 4h12v12H4zM10 4v12M4 10h12M4 4l-2-2', C: RedLab },
  { id: 'ariete', name: 'El golpe de ariete', short: 'El ariete', icon: 'M2 13h12M14 10v6M1.5 8l3-3 3 3 3-3 3 3M17 9v8', C: ArieteLab },
];

export default function SupplyLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:acueducto"
      prefix="ac"
      title="Acueducto: el agua a presión"
      disclaimer="Laboratorio educativo de hidráulica de tuberías con los métodos clásicos (Darcy-Weisbach, Hazen-Williams, Hardy Cross, método del gradiente y método de las características). La conducción, el barrio y la tubería son ilustrativos: no son redes de Medellín ni de ninguna empresa, y los prediseños no son diseños de ingeniería."
      parts={PARTS}
    />
  );
}
