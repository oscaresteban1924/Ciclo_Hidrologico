// Utilidades comunes de las pruebas de las salas: cada prueba declara su tolerancia antes de ejecutarse, se imprime
// el resultado y se escribe el informe en Markdown.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface TestResult {
  id: string;
  name: string;
  tolerance: string;
  measured: string;
  pass: boolean;
}

export const results: TestResult[] = [];
export const record = (r: TestResult) => results.push(r);
export const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

/** Robustez de herramientas: muchas llamadas con datos al azar, sin excepciones ni NaN/indefinido/infinito. */
export function robust(fns: Record<string, (v: Record<string, number | string>) => { outs: { value: string }[]; steps: string[]; error?: string }>, gen: (R: () => number) => Record<string, number | string>, n = 300) {
  let x = 13;
  const R = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  let calls = 0, bad = 0, thrown = 0;
  for (let k = 0; k < n; k++) {
    const v = gen(R);
    for (const fn of Object.values(fns)) {
      calls++;
      try {
        const r = fn(v);
        if (!r.error && (r.outs.some((o) => /NaN|undefined|Infinity/.test(o.value)) || r.steps.some((s) => /NaN|undefined|Infinity/.test(s)))) bad++;
      } catch {
        thrown++;
      }
    }
  }
  return { calls, bad, thrown };
}

export function finish(doc: string, title: string, cmd: string): void {
  const ok = results.filter((r) => r.pass).length;
  for (const r of results) {
    console.log(`${r.pass ? 'PASA ' : 'FALLA'}  [${r.id}] ${r.name}`);
    console.log(`        tolerancia: ${r.tolerance}`);
    console.log(`        medido:     ${r.measured}`);
  }
  console.log(`\n${ok}/${results.length} cumplen.`);
  mkdirSync(dirname(doc), { recursive: true });
  writeFileSync(
    doc,
    `# ${title}\n\nSe ejecutan con \`${cmd}\`. Cada prueba declara su tolerancia antes de ejecutarse.\n\n**${ok} de ${results.length} cumplen.**\n\n` +
      results.map((r) => `## ${r.id}. ${r.name} — ${r.pass ? 'cumple' : 'NO cumple'}\n\n- Tolerancia: ${r.tolerance}\n- Medido: ${r.measured}\n`).join('\n'),
  );
  if (ok !== results.length) process.exit(1);
}
