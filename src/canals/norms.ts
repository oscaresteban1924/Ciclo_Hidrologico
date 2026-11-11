// Criterios de la norma colombiana que las herramientas de diseño revisan, con su artículo. Solo se incluyen valores
// leídos en los textos oficiales:
//
//   Resolución 0330 de 2017 del Ministerio de Vivienda, Ciudad y Territorio, «Reglamento Técnico para el Sector de
//   Agua Potable y Saneamiento Básico – RAS» (Diario Oficial 50.267, 17 de junio de 2017), con las modificaciones de
//   la Resolución 0799 de 2021. Los artículos usados aquí (135, 138, 148 a 152 y 159) no fueron modificados por la
//   Resolución 0799 de 2021 (Anexo 1 del documento compilatorio del Ministerio), salvo el 138, al que solo se le
//   agregó el numeral 13, sin relación con la Tabla 17.
//
// La resolución trata los sistemas de alcantarillado y drenaje urbano. Las carreteras (alcantarillas bajo la vía,
// puentes) se rigen por el Manual de Drenaje para Carreteras del INVÍAS (Resolución 0024 de 2011), que todavía no se
// pudo leer en su texto oficial y por eso no se incluye. Es un apoyo para aprender: la revisión de un diseño real la
// hace un profesional con la norma vigente completa.

import type { Check } from './designCalc';

export const RAS_REF = 'Resolución 0330 de 2017 (RAS), Ministerio de Vivienda, Ciudad y Territorio, con las modificaciones de la Resolución 0799 de 2021';
export const RAS_SHORT = 'Res. 0330 de 2017 (RAS)';

export const RAS = {
  /** Art. 148: diámetro interno real mínimo en alcantarillado pluvial y combinado (m). */
  pluvialDmin: 0.26,
  /** Art. 149: esfuerzo cortante mínimo en la pared en alcantarillado pluvial y combinado (Pa). */
  pluvialTauMin: 2.0,
  /** Art. 150: velocidad máxima real en un colector por gravedad (m/s); parágrafo: hasta 10 m/s en casos especiales. */
  vmax: 5.0,
  vmaxSpecial: 10,
  /** Art. 151: profundidad máxima del flujo / diámetro en un colector pluvial o combinado. */
  fillMax: 0.93,
  /** Art. 152, num. 2: profundidad máxima en canales de sección cerrada / altura del conducto. */
  closedFill: 0.9,
  /** Art. 152, num. 4: velocidad máxima en canales revestidos en concreto (m/s). */
  concreteVmax: 5.0,
  /** Art. 152, num. 5: velocidad mínima en canales revestidos (m/s). */
  linedVmin: 0.75,
} as const;

/** Art. 135, Tabla 16: período de retorno mínimo de la lluvia de diseño (años). */
export const RAS_TABLA16: { tramo: string; T: number }[] = [
  { tramo: 'Tramos iniciales en zonas residenciales con áreas tributarias menores de 2 ha', T: 3 },
  { tramo: 'Tramos iniciales en zonas comerciales o industriales con áreas tributarias menores de 2 ha', T: 5 },
  { tramo: 'Tramos de alcantarillado con áreas tributarias entre 2 y 10 ha', T: 5 },
  { tramo: 'Tramos de alcantarillado con áreas tributarias mayores de 10 ha', T: 10 },
  { tramo: 'Canales abiertos que drenan áreas menores de 1 000 ha', T: 50 },
  { tramo: 'Canales abiertos en zonas planas que drenan áreas mayores de 1 000 ha', T: 100 },
  { tramo: 'Canales abiertos en zonas montañosas (alta velocidad) o a media ladera que drenan áreas mayores de 1 000 ha', T: 100 },
];

/** Art. 138, num. 8, Tabla 17: período de retorno para la cota de aguas máximas en cruces de cauces, según el ancho L. */
export const RAS_TABLA17: { ancho: string; T: number }[] = [
  { ancho: 'L < 10 m', T: 25 },
  { ancho: '10 m ≤ L ≤ 50 m', T: 50 },
  { ancho: 'L > 50 m', T: 100 },
];

/** Período de retorno mínimo de un canal abierto según el área que drena (Art. 135, Tabla 16). */
export function canalReturnPeriod(areaHa: number): number {
  return areaHa < 1000 ? 50 : 100;
}

const fx = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const tag = (art: string) => `${RAS_SHORT}, ${art}`;

/** Revisión de un colector pluvial o combinado circular que corre por gravedad (Arts. 148 a 151). */
export function rasPipeChecks(o: { D: number; V: number; tau: number; yD: number }): Check[] {
  return [
    { name: `${tag('Art. 148')}: diámetro interno ≥ 260 mm`, ok: o.D >= RAS.pluvialDmin - 1e-9, value: `${fx(o.D * 1000, 0)} mm` },
    { name: `${tag('Art. 149')}: autolimpieza, esfuerzo en la pared ≥ 2,0 Pa`, ok: o.tau >= RAS.pluvialTauMin, value: `${fx(o.tau, 1)} Pa` },
    { name: `${tag('Art. 150')}: velocidad ≤ 5,0 m/s (hasta 10 m/s solo en los casos del parágrafo)`, ok: o.V <= RAS.vmax, value: `${fx(o.V)} m/s` },
    { name: `${tag('Art. 151')}: profundidad del flujo ≤ 93 % del diámetro`, ok: o.yD <= RAS.fillMax + 1e-9, value: `${fx(o.yD * 100, 0)} %` },
  ];
}

/**
 * Revisión de un canal abierto de aguas lluvias (Art. 152). La velocidad mínima (num. 5) es para canales revestidos;
 * la máxima de 5,0 m/s (num. 4) es para el concreto (en los demás, según el riesgo de erosión). El num. 1 pide evitar
 * el flujo crítico sin fijar un margen: la herramienta avisa cuando 0,9 < Fr < 1,1 y lo dice.
 */
export function rasChannelChecks(o: { V: number; Fr: number; lined: boolean; concrete: boolean }): Check[] {
  const out: Check[] = [];
  if (o.concrete) out.push({ name: `${tag('Art. 152, num. 4')}: canal revestido en concreto, velocidad ≤ 5,0 m/s`, ok: o.V <= RAS.concreteVmax, value: `${fx(o.V)} m/s` });
  if (o.lined) out.push({ name: `${tag('Art. 152, num. 5')}: canal revestido, velocidad ≥ 0,75 m/s`, ok: o.V >= RAS.linedVmin, value: `${fx(o.V)} m/s` });
  out.push({ name: `${tag('Art. 152, num. 1')}: evitar el flujo crítico (la norma no fija un margen; aquí, Fr fuera de 0,9 a 1,1)`, ok: o.Fr <= 0.9 || o.Fr >= 1.1, value: `Fr = ${fx(o.Fr)}` });
  return out;
}

/** Art. 159: la estructura de disipación debe dejar el agua en régimen subcrítico. */
export function rasOutletCheck(Fr: number): Check {
  return { name: `${tag('Art. 159')}: el agua sale de la disipación en régimen subcrítico`, ok: Fr < 1, value: `Fr = ${fx(Fr)}` };
}
