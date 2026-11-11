// Memoria de cálculo imprimible: un documento HTML autocontenido (se abre en cualquier navegador y se imprime o se
// guarda en PDF) con los datos, el plano, la gráfica, el cálculo paso a paso, los resultados y las verificaciones.
// Se arma en el navegador; no se envía a ningún servidor.

import type { Result } from './designCalc';
import { RAS_REF, RAS_SHORT } from './norms';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface MemoriaInput {
  title: string;
  intro: string;
  level: 'Niños' | 'Universitarios';
  data: { label: string; value: string }[];
  res: Result;
  planSvg?: string;
  chartSvg?: string;
  project?: string;
  author?: string;
  /** Sala de la herramienta (por defecto, hidráulica de canales). */
  room?: string;
}

export function memoriaHTML(m: MemoriaInput): string {
  const now = new Date();
  const date = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const rows = (r: { label: string; value: string }[]) => r.map((x) => `<tr><th>${esc(x.label)}</th><td>${esc(x.value)}</td></tr>`).join('');
  const checks = m.res.checks?.length
    ? `<h2>§ Verificaciones</h2><table class="chk">${m.res.checks.map((c) => `<tr class="${c.ok ? 'ok' : 'no'}"><th>${esc(c.name)}</th><td>${c.ok ? 'Cumple' : 'No cumple'}</td><td>${esc(c.value)}</td></tr>`).join('')}</table>${
        m.res.checks.some((c) => c.name.startsWith(RAS_SHORT)) ? `<p class="note">Norma citada: ${esc(RAS_REF)}. Las demás verificaciones son criterios de la herramienta para aprender.</p>` : ''
      }`
    : '';
  const sections = [
    `<h2>§ Datos</h2><table>${rows(m.data)}</table>`,
    ...(m.planSvg ? [`<h2>§ Plano</h2><figure>${m.planSvg}</figure>`] : []),
    ...(m.chartSvg ? [`<h2>§ Gráfica</h2><figure>${m.chartSvg}</figure>`] : []),
    `<h2>§ Cálculo paso a paso</h2><ol>${m.res.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`,
    `<h2>§ Resultados</h2><table>${rows(m.res.outs)}</table>`,
    ...(checks ? [checks] : []),
  ];
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memoria de cálculo — ${esc(m.title)}</title>
<style>
  @page { size: letter; margin: 18mm 16mm; }
  body { font-family: "Atkinson Hyperlegible", Arial, sans-serif; color: #17324d; max-width: 780px; margin: 24px auto; padding: 0 18px; line-height: 1.45; font-size: 14px; }
  header { border-bottom: 2px solid #17324d; padding-bottom: 10px; margin-bottom: 14px; }
  header p { margin: 2px 0; color: #3c4b57; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; padding-bottom: 3px; border-bottom: 1px solid #c8d6df; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #e3eaef; vertical-align: top; }
  th { font-weight: 600; width: 55%; color: #3c4b57; }
  .chk tr.ok td:nth-child(2) { color: #2f6a3f; font-weight: 700; }
  .chk tr.no td:nth-child(2) { color: #9b2c22; font-weight: 700; }
  ol { padding-left: 22px; } ol li { margin: 4px 0; }
  figure { margin: 10px 0; page-break-inside: avoid; } figure svg { max-width: 100%; height: auto; border: 1px solid #e3eaef; }
  .note { margin-top: 22px; padding: 10px 12px; border-left: 4px solid #c0632b; background: #fbf3ec; font-size: 12.5px; }
  .kid { padding: 8px 12px; background: #eef6f0; border-left: 4px solid #4f8f5f; }
  .bar { margin: 0 0 16px; } .bar button { font: inherit; padding: 6px 12px; border: 1px solid #17324d; border-radius: 6px; background: #fff; cursor: pointer; }
  @media print { .bar { display: none; } body { margin: 0; } }
</style></head>
<body>
<div class="bar"><button onclick="window.print()">Imprimir o guardar en PDF</button></div>
<header>
  <h1>Memoria de cálculo: ${esc(m.title)}</h1>
  <p>${esc(m.intro)}</p>
  <p><b>Proyecto:</b> ${esc(m.project?.trim() || '—')} · <b>Elaborado por:</b> ${esc(m.author?.trim() || '—')} · <b>Nivel:</b> ${m.level} · <b>Fecha:</b> ${esc(date)}</p>
  <p>Laboratorio del agua · ${esc(m.room ?? 'Hidráulica de canales')}</p>
</header>
<p class="kid">${esc(m.res.kid)}</p>
${sections.map((x, k) => x.replace('§', `${k + 1}.`)).join('\n')}
${m.res.error ? `<p class="note"><b>Aviso:</b> ${esc(m.res.error)}</p>` : ''}
<p class="note"><b>Prediseño académico.</b> Este documento es un ejercicio de aprendizaje: no es un diseño de ingeniería. Un diseño real necesita estudios de campo, hidrología, geotecnia, las normas vigentes del lugar y la firma de un profesional responsable. Las fuentes de cada ecuación están en el paso a paso y en la documentación del módulo.</p>
</body></html>`;
}
