// Sala «Medir el agua»: la lluvia (pluviómetro de balancín y radar), el río (aforo con molinete y curva de gasto) y
// la tubería (Venturi y placa de orificio). Cada parte tiene escena 3D, instrumentos en vivo, retos, experimentos
// que se comparan con la teoría y herramientas de diseño con su memoria.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { AforoLab } from './AforoLab';
import { LluviaLab } from './LluviaLab';
import { MedidorLab } from './MedidorLab';

const PARTS: RoomPart[] = [
  { id: 'lluvia', name: 'Medir la lluvia', short: 'Lluvia', icon: 'M6 3v4M10 2v4M14 3v4M5 10h10l-1 7H6zM8 13h4', C: LluviaLab },
  { id: 'aforo', name: 'Aforar un río', short: 'Aforo', icon: 'M2 8h16M4 8c2 6 10 6 12 0M10 3v11M9 14h2', C: AforoLab },
  { id: 'medidor', name: 'El medidor en la tubería', short: 'Tubería', icon: 'M2 9h5l2 1h2l2-1h5M2 12h5l2-1h2l2 1h5M6 9V4M10 10V6M14 9V3', C: MedidorLab },
];

export default function MeasureLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:medir"
      prefix="me"
      title="Medir el agua"
      disclaimer="Laboratorio educativo de medición del agua con métodos de referencia (pluviómetro de balancín y relaciones Z-R del radar, aforo con molinete por sección media según ISO 748 y curva de gasto, Venturi y placa de orificio según ISO 5167). La estación, el río, los aforos y el banco de tuberías son ilustrativos: no son estaciones de la red del IDEAM ni de un sistema de alerta, y los cálculos no son mediciones oficiales."
      parts={PARTS}
    />
  );
}
