// Pestaña «Diseño» de cada parte: una calculadora (datos libres, resultados con su fórmula y sus números) y un
// prediseñador (propone dimensiones con criterios, las revisa y entrega la memoria de cálculo). Dos niveles: Niños
// (pocos datos y una frase) y Universitarios (todos los datos, pasos y verificaciones). Prediseños académicos.

import { useEffect, useMemo, useState } from 'react';
import { MATERIALS, type Material } from './hydraulics';
import { INLETS, type Inlet } from './culvert';
import {
  calcAforo,
  calcAlcantarilla,
  calcCanal,
  calcPuente,
  calcResalto,
  calcSedimento,
  preAforador,
  preAlcantarilla,
  preCanal,
  preEnrocado,
  prePozo,
  prePuente,
  type Result,
  type Vals,
} from './designCalc';

export type DesignPart = 'canal' | 'resalto' | 'puente' | 'alcantarilla' | 'sedimentos' | 'aforo';
type Level = 'ninos' | 'uni';

interface Field {
  id: string;
  label: string;
  unit?: string;
  def: number | string;
  kid?: boolean;
  options?: { value: string; label: string }[];
  /** Solo si otro campo tiene ese valor. */
  when?: [string, string[]];
}

interface Tool {
  title: string;
  intro: string;
  kidIntro: string;
  fields: Field[];
  run: (v: Vals) => Result;
}

const MAT_OPTS = (Object.keys(MATERIALS) as Material[]).map((m) => ({ value: m, label: `${MATERIALS[m].name} (n ${MATERIALS[m].n})` }));
const INLET_OPTS = (Object.keys(INLETS) as Inlet[]).map((i) => ({ value: i, label: INLETS[i].name }));

const TOOLS: Record<DesignPart, { calc: Tool; pre: Tool }> = {
  canal: {
    calc: {
      title: 'Calculadora de flujo uniforme',
      intro: 'Profundidad normal, velocidad, Froude y energía de cualquier canal (Manning).',
      kidIntro: 'Escoge un canal y cuánta agua lleva: te dice qué tan hondo y qué tan rápido va el agua.',
      fields: [
        { id: 'forma', label: 'Forma', def: 'trap', kid: true, options: [{ value: 'rect', label: 'Rectangular' }, { value: 'trap', label: 'Trapecial' }, { value: 'circ', label: 'Tubo' }] },
        { id: 'b', label: 'Ancho del fondo', unit: 'm', def: 1.5, kid: true, when: ['forma', ['rect', 'trap']] },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1.5, when: ['forma', ['trap']] },
        { id: 'D', label: 'Diámetro', unit: 'm', def: 1.2, kid: true, when: ['forma', ['circ']] },
        { id: 'material', label: 'Material', def: 'concreto', kid: true, options: [...MAT_OPTS, { value: 'otro', label: 'Otro (escribir n)' }] },
        { id: 'n', label: 'n de Manning', def: 0.015, when: ['material', ['otro']] },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.1, kid: true },
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 3, kid: true },
      ],
      run: calcCanal,
    },
    pre: {
      title: 'Prediseño de un canal (sección de máxima eficiencia)',
      intro: 'Propone el ancho, la profundidad y la altura de las paredes de un canal que lleve el caudal de diseño, y revisa erosión, sedimentación, estabilidad y borde libre.',
      kidIntro: 'Dime cuánta agua debe llevar tu canal y de qué es: te propongo cómo hacerlo.',
      fields: [
        { id: 'Q', label: 'Caudal de diseño', unit: 'm³/s', def: 4, kid: true },
        { id: 'material', label: 'Material', def: 'concreto', kid: true, options: MAT_OPTS },
        { id: 'S', label: 'Pendiente del terreno', unit: '%', def: 0.1, kid: true },
        { id: 'forma', label: 'Forma', def: 'trap', options: [{ value: 'rect', label: 'Rectangular' }, { value: 'trap', label: 'Trapecial' }] },
        { id: 'z', label: 'Talud (horizontal : 1)', def: 1.5, when: ['forma', ['trap']] },
        { id: 'fb', label: 'Borde libre', unit: '% de la profundidad', def: 20 },
      ],
      run: preCanal,
    },
  },
  resalto: {
    calc: {
      title: 'Calculadora del resalto hidráulico',
      intro: 'Conjugada de Bélanger, pérdida de energía, longitud y tipo del resalto en un canal rectangular.',
      kidIntro: 'Si el agua llega rápida y delgada, ¿hasta dónde salta?',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 12, kid: true },
        { id: 'b', label: 'Ancho', unit: 'm', def: 4, kid: true },
        { id: 'y1', label: 'Profundidad al llegar', unit: 'm', def: 0.3, kid: true },
      ],
      run: calcResalto,
    },
    pre: {
      title: 'Prediseño de un pozo de amortiguación',
      intro: 'Pozo horizontal al pie de una caída: profundidad al pie, conjugada, agua necesaria en el pozo, largo, vertedero de salida y paredes.',
      kidIntro: 'El agua baja por una caída: te propongo un pozo que atrape su salto.',
      fields: [
        { id: 'Q', label: 'Caudal de diseño', unit: 'm³/s', def: 12, kid: true },
        { id: 'b', label: 'Ancho del pozo', unit: 'm', def: 4, kid: true },
        { id: 'H', label: 'Altura de la caída', unit: 'm', def: 6, kid: true },
        { id: 'loss', label: 'Pérdida en la rápida', unit: '%', def: 10 },
        { id: 'fs', label: 'Factor sobre la conjugada', def: 1.1 },
      ],
      run: prePozo,
    },
  },
  puente: {
    calc: {
      title: 'Calculadora de estrangulamiento',
      intro: '¿La abertura de un puente estrangula el paso? Energía del cauce contra la energía crítica de la abertura.',
      kidIntro: 'Mira si un puente es muy angosto para la quebrada.',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 30, kid: true },
        { id: 'B', label: 'Ancho del cauce', unit: 'm', def: 8, kid: true },
        { id: 'bp', label: 'Luz útil del puente', unit: 'm', def: 4, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.3 },
        { id: 'n', label: 'n de Manning', def: 0.02 },
      ],
      run: calcPuente,
    },
    pre: {
      title: 'Prediseño hidráulico de un puente',
      intro: 'Luz mínima para no estrangular con lo tapado previsto y altura del bajo del puente con su gálibo.',
      kidIntro: 'Te digo qué tan ancho y qué tan alto debe ser un puente para que la creciente pase.',
      fields: [
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 40, kid: true },
        { id: 'B', label: 'Ancho del cauce', unit: 'm', def: 8, kid: true },
        { id: 'Hc', label: 'Altura de las paredes', unit: 'm', def: 3 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.3 },
        { id: 'n', label: 'n de Manning', def: 0.02 },
        { id: 'blk', label: 'Parte tapada prevista', unit: '%', def: 20, kid: true },
        { id: 'gal', label: 'Gálibo bajo el tablero', unit: 'm', def: 0.6 },
      ],
      run: prePuente,
    },
  },
  alcantarilla: {
    calc: {
      title: 'Calculadora de alcantarilla (HDS-5)',
      intro: 'Nivel del agua a la entrada por control a la entrada y a la salida, para un tubo circular de concreto.',
      kidIntro: '¿Hasta dónde sube el agua antes de entrar al tubo?',
      fields: [
        { id: 'Q', label: 'Caudal', unit: 'm³/s', def: 5, kid: true },
        { id: 'D', label: 'Diámetro', unit: 'm', def: 1.2, kid: true },
        { id: 'L', label: 'Largo', unit: 'm', def: 30 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1 },
        { id: 'tw', label: 'Nivel aguas abajo', unit: 'm', def: 0.5 },
        { id: 'entrada', label: 'Entrada', def: 'muro', options: INLET_OPTS },
      ],
      run: calcAlcantarilla,
    },
    pre: {
      title: 'Prediseño de alcantarilla',
      intro: 'Prueba tubos comerciales de 0,6 a 3,0 m con 1 a 3 tubos y escoge el de menor área que cumple los criterios.',
      kidIntro: 'Dime cuánta agua pasa y qué tan alta es la vía: te digo qué tubos poner.',
      fields: [
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 8, kid: true },
        { id: 'road', label: 'Altura de la vía', unit: 'm', def: 4, kid: true },
        { id: 'L', label: 'Largo', unit: 'm', def: 30 },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1 },
        { id: 'tw', label: 'Nivel aguas abajo', unit: 'm', def: 0.5 },
        { id: 'entrada', label: 'Entrada', def: 'muro', options: INLET_OPTS },
        { id: 'hwd', label: 'HW máximo', unit: 'veces D', def: 1.5 },
        { id: 'free', label: 'Mínimo bajo la vía', unit: 'm', def: 0.5 },
        { id: 'vmax', label: 'Velocidad máxima a la salida', unit: 'm/s', def: 4.5 },
      ],
      run: preAlcantarilla,
    },
  },
  sedimentos: {
    calc: {
      title: 'Calculadora de transporte de sedimentos',
      intro: 'Shields, umbral, velocidad de caída, número de Rouse y arrastre de fondo para un grano y un flujo.',
      kidIntro: '¿El agua mueve las piedritas del fondo?',
      fields: [
        { id: 'd', label: 'Tamaño del grano', unit: 'mm', def: 10, kid: true },
        { id: 'h', label: 'Profundidad del agua', unit: 'm', def: 1, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 0.4, kid: true },
        { id: 'b', label: 'Ancho del cauce', unit: 'm', def: 10 },
      ],
      run: calcSedimento,
    },
    pre: {
      title: 'Prediseño de enrocado de protección',
      intro: 'Tamaño de piedra (d50) que aguanta el esfuerzo de la creciente, con el criterio de Shields y un factor de seguridad.',
      kidIntro: '¿Qué tan grandes deben ser las piedras para que la creciente no se las lleve?',
      fields: [
        { id: 'Q', label: 'Creciente de diseño', unit: 'm³/s', def: 50, kid: true },
        { id: 'b', label: 'Ancho del cauce', unit: 'm', def: 10, kid: true },
        { id: 'S', label: 'Pendiente', unit: '%', def: 1, kid: true },
        { id: 'n', label: 'n de Manning del enrocado', def: 0.035 },
        { id: 'fs', label: 'Factor de seguridad', def: 1.5 },
      ],
      run: preEnrocado,
    },
  },
  aforo: {
    calc: {
      title: 'Calculadora de aforadores',
      intro: 'Caudal de un vertedero rectangular (Rehbock), triangular o de una compuerta con salida libre.',
      kidIntro: 'Mide la altura del agua sobre el vertedero y te digo cuánta agua pasa.',
      fields: [
        { id: 'tipo', label: 'Estructura', def: 'rect', kid: true, options: [{ value: 'rect', label: 'Vertedero rectangular' }, { value: 'tri', label: 'Vertedero triangular' }, { value: 'gate', label: 'Compuerta' }] },
        { id: 'H', label: 'Carga H', unit: 'cm', def: 10, kid: true, when: ['tipo', ['rect', 'tri']] },
        { id: 'b', label: 'Ancho', unit: 'cm', def: 30, when: ['tipo', ['rect', 'gate']] },
        { id: 'P', label: 'Altura de la cresta', unit: 'cm', def: 15, when: ['tipo', ['rect']] },
        { id: 'ang', label: 'Ángulo del triángulo', unit: '°', def: 90, when: ['tipo', ['tri']] },
        { id: 'a', label: 'Abertura', unit: 'cm', def: 5, kid: true, when: ['tipo', ['gate']] },
        { id: 'y1', label: 'Profundidad aguas arriba', unit: 'cm', def: 30, kid: true, when: ['tipo', ['gate']] },
      ],
      run: calcAforo,
    },
    pre: {
      title: 'Escoger un aforador',
      intro: 'Compara un vertedero rectangular y uno triangular de 90° para un rango de caudales en un canal, con sus límites de validez.',
      kidIntro: 'Dime entre cuánta y cuánta agua quieres medir: te digo qué vertedero usar.',
      fields: [
        { id: 'qmin', label: 'Caudal mínimo', unit: 'L/s', def: 3, kid: true },
        { id: 'qmax', label: 'Caudal máximo', unit: 'L/s', def: 15, kid: true },
        { id: 'b', label: 'Ancho del canal', unit: 'cm', def: 30 },
        { id: 'Hc', label: 'Alto del canal', unit: 'cm', def: 45 },
        { id: 'P', label: 'Cresta del rectangular', unit: 'cm', def: 15 },
      ],
      run: preAforador,
    },
  },
};

const LEVEL_KEY = 'ciclo-hidrologico:canales-nivel';

function loadLevel(): Level {
  try {
    return window.localStorage.getItem(LEVEL_KEY) === 'ninos' ? 'ninos' : 'uni';
  } catch {
    return 'uni';
  }
}

export function DesignTab({ part }: { part: DesignPart }) {
  const [level, setLevel] = useState<Level>(loadLevel);
  useEffect(() => {
    try {
      window.localStorage.setItem(LEVEL_KEY, level);
    } catch {
      /* sin almacenamiento */
    }
  }, [level]);
  const t = TOOLS[part];
  return (
    <div className="q3-exps">
      <div className="hc-level" role="radiogroup" aria-label="Nivel">
        {(['ninos', 'uni'] as Level[]).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={level === l} className={level === l ? 'is-on' : ''} onClick={() => setLevel(l)}>
            {l === 'ninos' ? 'Niños' : 'Universitarios'}
          </button>
        ))}
      </div>
      <ToolForm tool={t.calc} level={level} kind="calc" part={part} />
      <ToolForm tool={t.pre} level={level} kind="pre" part={part} />
      <p className="hc-note">Prediseño académico para aprender: no es un diseño de ingeniería. Un diseño real necesita estudios de campo, hidrología, geotecnia, normas vigentes y la firma de un profesional.</p>
    </div>
  );
}

function ToolForm({ tool, level, kind, part }: { tool: Tool; level: Level; kind: 'calc' | 'pre'; part: DesignPart }) {
  const [vals, setVals] = useState<Vals>(() => Object.fromEntries(tool.fields.map((f) => [f.id, f.def])));
  const kid = level === 'ninos';
  const visible = tool.fields.filter((f) => (!kid || f.kid) && (!f.when || f.when[1].includes(String(vals[f.when[0]]))));
  const res = useMemo(() => tool.run(vals), [tool, vals]);
  const memo = () => {
    const lines = [
      `${tool.title} — Ciclo hidrológico, Hidráulica de canales`,
      `Fecha: ${new Date().toLocaleString('es-CO')}`,
      '',
      'DATOS',
      ...tool.fields.filter((f) => !f.when || f.when[1].includes(String(vals[f.when[0]]))).map((f) => `  ${f.label}: ${f.options ? f.options.find((o) => o.value === vals[f.id])?.label ?? vals[f.id] : vals[f.id]}${f.unit ? ` ${f.unit}` : ''}`),
      '',
      'CÁLCULO',
      ...res.steps.map((s, k) => `  ${k + 1}. ${s}`),
      '',
      'RESULTADOS',
      ...res.outs.map((o) => `  ${o.label}: ${o.value}`),
      ...(res.checks ? ['', 'VERIFICACIONES', ...res.checks.map((c) => `  [${c.ok ? 'cumple' : 'no cumple'}] ${c.name}: ${c.value}`)] : []),
      ...(res.error ? ['', `AVISO: ${res.error}`] : []),
      '',
      'Prediseño académico: no es un diseño de ingeniería.',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind === 'pre' ? 'prediseno' : 'calculo'}-${part}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className={`hc-tool is-${kind}`} aria-label={tool.title}>
      <p className="hc-kicker">{kind === 'calc' ? 'Calculadora: revisa lo que tú propones' : 'Prediseñador: propone las medidas y las revisa'}</p>
      <h3>{tool.title}</h3>
      <p className="q3-small">{kid ? tool.kidIntro : tool.intro}</p>
      <div className="hc-form">
        {visible.map((f) => (
          <label key={f.id}>
            <span>
              {f.label} {f.unit && <span className="hc-unit">({f.unit})</span>}
            </span>
            {f.options ? (
              <select value={String(vals[f.id])} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value }))}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input inputMode="decimal" value={String(vals[f.id]).replace('.', ',')} onChange={(e) => setVals((v) => ({ ...v, [f.id]: e.target.value.replace(',', '.') }))} />
            )}
          </label>
        ))}
      </div>
      {res.error && <p className="q3-progress">{res.error}</p>}
      {kid ? (
        res.kid && <p className="q3-progress is-ok">{res.kid}</p>
      ) : null}
      {res.outs.length > 0 && (
        <div className="hc-result">
          {res.outs
            .filter((o) => !kid || o.kid)
            .map((o) => (
              <div key={o.label}>
                <span>{o.label}</span>
                <b>{o.value}</b>
              </div>
            ))}
        </div>
      )}
      {res.checks && (
        <ul className="hc-checks">
          {res.checks.map((c) => (
            <li key={c.name} className={c.ok ? 'is-ok' : 'is-bad'}>
              <span>{c.name}</span>
              <b>
                {c.ok ? 'cumple' : 'no cumple'} · {c.value}
              </b>
            </li>
          ))}
        </ul>
      )}
      {!kid && res.steps.length > 0 && (
        <details className="hc-details">
          <summary>Paso a paso</summary>
          <ol className="hc-steps">
            {res.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      )}
      {kind === 'pre' && (
        <button type="button" className="hc-memo" onClick={memo}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
            <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v2.5h12V14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Descargar la memoria de cálculo (.txt)
        </button>
      )}
    </section>
  );
}
