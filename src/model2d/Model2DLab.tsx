// Sala «Modelación hidráulica 2D»: el terreno (MDT, MDS y el tamaño del píxel), las coberturas, el n de Manning y la
// calibración con marcas de agua, las crecientes, la lluvia y las condiciones de borde, la malla y las ecuaciones, las
// estructuras (el puente y la rotura del jarillón), el riesgo (ensamble, zonificación y daños), un modelo
// bidimensional armado paso a paso como en HEC-RAS y el mismo modelo sobre un terreno propio. El modelo 2D corre en el
// navegador con tablas subgrid; el valle es ilustrativo.

import { RoomLab, type RoomPart } from '../rooms/RoomLab';
import { TerrenoLab } from './TerrenoLab';
import { CoberturaLab } from './CoberturaLab';
import { RetornoLab } from './RetornoLab';
import { EcuacionesLab } from './EcuacionesLab';
import { EstructurasLab } from './EstructurasLab';
import { RiesgoLab } from './RiesgoLab';
import { ModeloLab } from './ModeloLab';
import { TuTerrenoLab } from './TuTerrenoLab';
import './model2d.css';

const PARTS: RoomPart[] = [
  { id: 'terreno', name: 'El terreno: MDT, MDS y el píxel', short: 'Terreno', icon: 'M2 15l4-5 3 3 4-6 5 8zM2 17h16M5 4h2v2H5zM9 4h2v2H9zM13 4h2v2h-2z', C: TerrenoLab },
  { id: 'cobertura', name: 'Coberturas, n y calibración', short: 'Coberturas', icon: 'M3 16c2-5 4-5 6 0M9 16c2-7 5-7 8 0M2 17h16M6 6a2 2 0 104 0 2 2 0 00-4 0', C: CoberturaLab },
  { id: 'retorno', name: 'Crecientes, lluvia y bordes', short: 'Crecientes', icon: 'M3 16l3-3 3 2 4-6 4-4M3 4v13h14M13 5h4v4', C: RetornoLab },
  { id: 'ecuaciones', name: 'La malla y las ecuaciones', short: 'Ecuaciones', icon: 'M3 3h14v14H3zM3 8h14M3 13h14M8 3v14M13 3v14', C: EcuacionesLab },
  { id: 'estructuras', name: 'El puente y la rotura del jarillón', short: 'Estructuras', icon: 'M2 8h16M2 11h16M4 11v6M16 11v6M7 17c0-3 6-3 6 0', C: EstructurasLab },
  { id: 'riesgo', name: 'Incertidumbre, zonificación y daños', short: 'Riesgo', icon: 'M10 3l8 14H2zM10 8v4M10 14.5v.5', C: RiesgoLab },
  { id: 'modelo', name: 'HEC-RAS 2D paso a paso', short: 'Paso a paso', icon: 'M4 4h3v3H4zM9 9h3v3H9zM14 14h3v3h-3zM7 5h4v4M12 10h4v4', C: ModeloLab },
  { id: 'propio', name: 'Tu terreno', short: 'Tu terreno', icon: 'M10 13V3M6 7l4-4 4 4M3 12v5h14v-5', C: TuTerrenoLab },
];

export default function Model2DLab() {
  return (
    <RoomLab
      storeKey="laboratorio-agua:modelo2d"
      prefix="m2"
      title="Modelación hidráulica 2D"
      disclaimer="Laboratorio educativo de modelación hidráulica bidimensional: modelos de elevación (MDT y MDS) y su resolución, coberturas y n de Manning, calibración con marcas de agua, periodos de retorno, lluvia, condiciones de borde, mallas, tablas subgrid, las ecuaciones de aguas someras, el puente, la rotura de un jarillón, la incertidumbre, la zonificación y los daños, con un modelo 2D que corre en el navegador construido con las ideas de HEC-RAS 2D (no es HEC-RAS). El valle, la serie de caudales, las marcas de agua, las casas, el jarillón, la vía y el puente son ilustrativos: no son un lugar de Medellín, y los mapas no son un estudio de amenaza, un pronóstico oficial de inundación ni diseños de ingeniería. Un terreno propio se lee en tu navegador y no sale de tu equipo."
      parts={PARTS}
    />
  );
}
