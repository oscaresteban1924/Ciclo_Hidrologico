// Escalas de color del laboratorio. La profundidad tiene dos escalas de un solo tono, de claro a
// oscuro: la NATURAL (escorrentía turbia: película brillante que se vuelve café, como el agua que corre
// por las calles y quebradas de Medellín en un aguacero) y la AZUL (analítica: resultados, plano 2D y
// cuando se pide «Agua en azul»). Ambas se acompañan de números en la leyenda y en las mediciones.

/** Exageración vertical del esquema del valle (se informa en la interfaz; no afecta el cálculo). */
export const VALLEY_EXAGGERATION = 1.5;

export interface DepthStop {
  depth: number;
  color: string;
  alpha: number;
  label: string;
}

/** Paradas de la escala de profundidad [m]. */
// La lámina de pocos milímetros cubre toda la ladera cuando llueve: se tiñe apenas (casi transparente) para que
// el azul fuerte quede donde el agua se junta y corre (calles, canales, la quebrada).
export const DEPTH_STOPS: DepthStop[] = [
  { depth: 0.001, color: '#8fd3f7', alpha: 0.16, label: '1 mm' },
  { depth: 0.005, color: '#5cb8ee', alpha: 0.42, label: '5 mm' },
  { depth: 0.02, color: '#3592d6', alpha: 0.84, label: '2 cm' },
  { depth: 0.05, color: '#2a78c4', alpha: 0.84, label: '5 cm' },
  { depth: 0.15, color: '#16509b', alpha: 0.9, label: '15 cm' },
  { depth: 0.3, color: '#0b2f66', alpha: 0.94, label: '30 cm' },
];

/** Escala natural (agua turbia): misma profundidad en cada parada; más opaca y más oscura al crecer. */
export const NATURAL_STOPS: DepthStop[] = [
  { depth: 0.001, color: '#a9aaa0', alpha: 0.2, label: '1 mm' },
  { depth: 0.005, color: '#9c8d6c', alpha: 0.42, label: '5 mm' },
  { depth: 0.02, color: '#87714d', alpha: 0.66, label: '2 cm' },
  { depth: 0.05, color: '#745b3a', alpha: 0.8, label: '5 cm' },
  { depth: 0.15, color: '#5d452a', alpha: 0.9, label: '15 cm' },
  { depth: 0.3, color: '#44311d', alpha: 0.95, label: '30 cm' },
];

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const toRgb = (stops: DepthStop[]) => stops.map((s) => ({ ...s, rgb: hex(s.color), ld: Math.log(s.depth) }));
const STOPS_RGB = toRgb(DEPTH_STOPS);
const NATURAL_RGB = toRgb(NATURAL_STOPS);

/** Color y opacidad para una profundidad [m] (interpolación en escala logarítmica). */
export function depthColor(h: number, out: Float32Array, o: number, natural = false): void {
  const STOPS = natural ? NATURAL_RGB : STOPS_RGB;
  if (h < DEPTH_STOPS[0].depth * 0.5) {
    out[o] = out[o + 1] = out[o + 2] = 0;
    out[o + 3] = 0;
    return;
  }
  const lh = Math.log(Math.max(h, DEPTH_STOPS[0].depth));
  let a = STOPS[0], b = STOPS[0];
  for (let k = 0; k < STOPS.length - 1; k++) {
    if (lh <= STOPS[k + 1].ld) {
      a = STOPS[k];
      b = STOPS[k + 1];
      break;
    }
    a = b = STOPS[STOPS.length - 1];
  }
  const t = a === b ? 0 : Math.min(1, Math.max(0, (lh - a.ld) / (b.ld - a.ld)));
  out[o] = a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t;
  out[o + 1] = a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t;
  out[o + 2] = a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t;
  out[o + 3] = a.alpha + (b.alpha - a.alpha) * t;
}

export function cssDepthGradient(natural = false): string {
  // cada escala se muestra sobre un suelo: la película fina deja ver el suelo, el agua honda no
  const rgba = (s: DepthStop) => {
    const [r, g, b] = hex(s.color).map((v) => Math.round(v * 255));
    return `rgba(${r}, ${g}, ${b}, ${s.alpha})`;
  };
  const stops = natural ? NATURAL_STOPS : DEPTH_STOPS;
  return `linear-gradient(90deg, ${stops.map((s, i) => `${rgba(s)} ${(i / (stops.length - 1)) * 100}%`).join(', ')}), ${natural ? '#55585c' : '#b9b4aa'}`;
}

export const hexToRgb = hex;

/** Formato de profundidad para niñas y niños: mm por debajo de 1 cm, cm por encima. */
export function fmtDepth(h: number): string {
  if (h < 0.0005) return 'seco';
  if (h < 0.01) return `${(h * 1000).toFixed(0)}\u00a0mm`;
  return `${(h * 100).toFixed(h < 0.1 ? 1 : 0).replace('.', ',')}\u00a0cm`;
}

export function fmtNum(v: number, d = 1): string {
  return v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Duración legible: «1 min 40 s», «45 s», «2 min». */
export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
  return m > 0 ? (s > 0 ? `${m}\u00a0min ${s}\u00a0s` : `${m}\u00a0min`) : `${s}\u00a0s`;
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
