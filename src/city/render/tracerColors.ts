// Colores de las gotas trazadoras por destino: los mismos de «¿Adónde fue la lluvia?», en el mismo orden.
// Módulo sin Three.js para que el mapa 2D y los paneles no carguen el motor 3D.
import type { TracerState } from '../sim/tracers';

export const TRACER_COLORS: Record<TracerState, string> = {
  agua: '#ffffff', // gota en movimiento (sigue sobre el suelo): blanca con borde azul
  sumidero: '#eda100',
  suelo: '#1baf7a',
  salida: '#eb6834',
  deposito: '#e87ba4',
};
export const TRACER_MOVING_RING = '#2a78d6';
/** Color de la ruta mientras la gota sigue en movimiento (con borde blanco se lee sobre asfalto y agua). */
export const TRACER_TRAIL_MOVING = '#2a78d6';
