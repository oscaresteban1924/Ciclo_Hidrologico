// Sala «El agua en casa»: cuánta agua usa una casa y dónde se va, el medidor y la factura, y el agua lluvia para los
// sanitarios. Cada parte tiene escena 3D, instrumentos en vivo, retos, experimentos y herramientas de diseño con su
// memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { ConsumoLab } from './ConsumoLab';
import { FacturaLab } from './FacturaLab';
import { TanqueLab } from './TanqueLab';

const PARTS: RoomPart[] = [
  { id: 'consumo', name: '¿Cuánta agua usa la casa?', short: 'Consumo', icon: 'M3 10l7-6 7 6M5 9v8h10V9M9 17v-4h2v4', C: ConsumoLab },
  { id: 'factura', name: 'El medidor y la factura', short: 'Factura', icon: 'M5 2h10v16l-2-1-2 1-2-1-2 1-2-1zM8 6h4M8 9h4M8 12h3', C: FacturaLab },
  { id: 'lluvia', name: 'Agua lluvia para la casa', short: 'Agua lluvia', icon: 'M2 9l8-6 8 6M4 8v9h6M13 11h5v7h-5zM6 2v2M10 1v2', C: TanqueLab },
];

export default function HouseLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:casa"
      prefix="ca"
      title="El agua en casa"
      disclaimer="Laboratorio educativo del agua en una casa: consumo por aparato y hábito, el medidor y la factura con los rangos de consumo de la CRA, y un tanque de agua lluvia con su balance diario. La casa, la familia, la tarifa, los factores por estrato y la serie de lluvia son ilustrativos: no son la tarifa de una empresa ni una medición real, y los cálculos no son una asesoría."
      parts={PARTS}
    />
  );
}
