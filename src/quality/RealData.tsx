// Panel «Medellín»: monitoreo real de 18 quebradas de San Antonio de Prado (Secretaría de Medio Ambiente,
// diciembre de 2017 y enero de 2018), con lo que dicen los datos frente al modelo de la escena. Los números
// salen de src/quality/data/monitoreo.ts (generado desde la capa oficial) y el resumen se calcula (realdata.ts).

import { useId, useMemo } from 'react';
import { FISH, SWIM } from './model';
import { MONITOREO_META, SECTOR_LABEL, cuencas, resumen, type SitioMonitoreo } from './realdata';
import { fmt, fmtBig } from './ui';

const CUENCAS = cuencas();
const R = resumen();

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—');
const dboText = (s: SitioMonitoreo) => (s.dbo === null ? '—' : s.dbo[1] ? `< ${fmt(s.dbo[0], 0)}` : fmt(s.dbo[0], s.dbo[0] < 10 ? 1 : 0));
const parte = (s: SitioMonitoreo) => SECTOR_LABEL[s.sector] ?? s.sector;

/** ¿Suben los coliformes de la parte alta a la baja en esta microcuenca? null si no hay sitio alto y bajo. */
export function subeAguasAbajo(name: string): boolean | null {
  const c = CUENCAS.find((q) => q.name === name);
  if (!c) return null;
  const alta = c.sitios.find((s) => s.orden === 0 && s.cf !== null);
  const baja = [...c.sitios].reverse().find((s) => s.orden === 4 && s.cf !== null);
  return alta && baja ? (baja.cf as number) > (alta.cf as number) : null;
}
/** ¿Hay en esta microcuenca algún sitio donde los coliformes permitirían nadar? */
export const nadarEn = (name: string) => !!CUENCAS.find((q) => q.name === name)?.sitios.some((s) => s.cf !== null && s.cf <= SWIM.coliformsFecal);

/** Barras horizontales por sitio, de la parte alta a la baja (escala logarítmica opcional) con una línea de referencia. */
function SiteBars({ title, sitios, get, log, ref, refLabel, okIf, unit, fmtV }: { title: string; sitios: SitioMonitoreo[]; get: (s: SitioMonitoreo) => number | null; log: boolean; ref: number; refLabel: string; okIf: (v: number) => boolean; unit: string; fmtV: (v: number) => string }) {
  const id = useId();
  const vals = sitios.map(get);
  const W = 520, rowH = 24, L = 118, Rr = 92, T = 18, B = 8;
  const H = T + B + rowH * sitios.length;
  const tr = (v: number) => (log ? Math.log10(Math.max(v, 1)) : v);
  const max = Math.max(tr(ref) * 1.05, ...vals.map((v) => (v === null ? 0 : tr(v))));
  const top = log ? Math.ceil(max) : max * 1.1;
  const sx = (v: number) => L + (Math.max(0, tr(v)) / top) * (W - L - Rr);
  return (
    <figure className="q-chart q3-bars">
      <figcaption id={`${id}-t`}>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <desc id={`${id}-d`}>{sitios.map((s, k) => `${parte(s)} (${s.nombre}): ${vals[k] === null ? 'sin dato' : `${fmtV(vals[k] as number)} ${unit}`}`).join('; ')}. Referencia: {refLabel}.</desc>
        {log &&
          Array.from({ length: top + 1 }, (_, k) => (
            <g key={k}>
              <line x1={L + (k / top) * (W - L - Rr)} x2={L + (k / top) * (W - L - Rr)} y1={T - 4} y2={H - B} stroke="#d9e2e8" strokeWidth={1} />
              <text x={L + (k / top) * (W - L - Rr)} y={T - 7} fontSize="9" textAnchor="middle" fill="#5b6b78">
                {k === 0 ? '1' : `10${'⁰¹²³⁴⁵⁶⁷⁸⁹'[k]}`}
              </text>
            </g>
          ))}
        {sitios.map((s, k) => {
          const v = vals[k];
          const y = T + k * rowH;
          const ok = v !== null && okIf(v);
          return (
            <g key={s.id}>
              <text x={L - 6} y={y + rowH / 2 + 4} fontSize="11" textAnchor="end" fill="#1f2933">
                {parte(s)} · {s.altura !== null ? `${fmt(s.altura, 0)} m` : ''}
              </text>
              {v !== null && <rect x={L} y={y + 4} width={Math.max(1.5, sx(v) - L)} height={rowH - 9} rx={3} fill={ok ? '#2f8f63' : '#c0462a'} />}
              <text x={v === null ? L + 4 : sx(v) + 5} y={y + rowH / 2 + 4} fontSize="11" fill="#1f2933" fontWeight={700}>
                {v === null ? 'sin dato' : fmtV(v)}
              </text>
            </g>
          );
        })}
        <line x1={sx(ref)} x2={sx(ref)} y1={T - 2} y2={H - B} stroke="#1f2933" strokeWidth={1.5} strokeDasharray="4 3" />
      </svg>
      <p className="q3-small">
        <span className="q3-key is-ok" aria-hidden="true" /> cumple · <span className="q3-key is-bad" aria-hidden="true" /> no cumple · línea punteada: {refLabel}.
      </p>
    </figure>
  );
}

export function RealCreeks({ picked, onPick }: { picked: string; onPick: (name: string) => void }) {
  const selId = useId();
  const c = useMemo(() => CUENCAS.find((q) => q.name === picked) ?? CUENCAS[0], [picked]);
  const sube = subeAguasAbajo(c.name);
  const afect = [...new Set(c.sitios.flatMap((s) => s.afectaciones))];
  return (
    <div className="q3-real">
      <h3>Quebradas reales de Medellín</h3>
      <p className="q3-small">
        {R.sitios} sitios de {R.cuencas} quebradas del corregimiento de San Antonio de Prado, medidos por la Secretaría de Medio Ambiente de Medellín entre el {fmtDate(MONITOREO_META.fechas?.[0] ?? null)} y el {fmtDate(MONITOREO_META.fechas?.[1] ?? null)}. Cada sitio es una medición de un día.
      </p>
      <h4>Lo que dicen los datos</h4>
      <ul className="q3-findings">
        <li>
          <strong>Oxígeno.</strong> En {R.oxigenoParaPeces} de {R.conOxigeno} sitios había {FISH.minDO} mg/L o más (mediana {fmt(R.medianaOxigeno, 1)} mg/L, {fmt(R.medianaSaturacion, 0)} % de saturación). Como en la quebrada de montaña de la escena, el agua que salta entre las piedras se oxigena rápido.
        </li>
        <li>
          <strong>Coliformes.</strong> En {R.noNadar} de {R.conColiformes} sitios pasaban de {SWIM.coliformsFecal} NMP/100 mL: no se podía nadar. Solo en {R.siNadar.length}, casi todos en la parte alta, se podría por los coliformes.
        </li>
        <li>
          <strong>Aguas abajo.</strong> En {R.subenAguasAbajo} de {R.conAltaYBaja} quebradas con sitio en la parte alta y en la baja, abajo había más coliformes que arriba: el agua usada de las casas entra por el camino.
        </li>
      </ul>
      <div className="q3-field">
        <label htmlFor={selId}>Quebrada</label>
        <select id={selId} value={c.name} onChange={(e) => onPick(e.target.value)}>
          {CUENCAS.map((q) => (
            <option key={q.name} value={q.name}>
              {q.name} ({q.sitios.length} {q.sitios.length === 1 ? 'sitio' : 'sitios'})
            </option>
          ))}
        </select>
      </div>
      <p className="q3-big" aria-live="polite">
        {sube === null ? `${c.name}: no hay sitio en la parte alta y en la baja para comparar.` : sube ? `${c.name}: los coliformes suben de la parte alta a la baja.` : `${c.name}: abajo no hay más coliformes que arriba.`}
      </p>
      <SiteBars
        title={`Coliformes fecales en la quebrada ${c.name} (NMP/100 mL, escala logarítmica)`}
        sitios={c.sitios}
        get={(s) => s.cf}
        log
        ref={SWIM.coliformsFecal}
        refLabel={`máximo para nadar (${SWIM.coliformsFecal})`}
        okIf={(v) => v <= SWIM.coliformsFecal}
        unit="NMP/100 mL"
        fmtV={fmtBig}
      />
      <SiteBars
        title={`Oxígeno disuelto en la quebrada ${c.name} (mg/L)`}
        sitios={c.sitios}
        get={(s) => s.od}
        log={false}
        ref={FISH.minDO}
        refLabel={`mínimo para peces (${FISH.minDO} mg/L)`}
        okIf={(v) => v >= FISH.minDO}
        unit="mg/L"
        fmtV={(v) => fmt(v, 1)}
      />
      <div className="q3-tablewrap">
        <table className="q3-table">
          <caption>Mediciones en la quebrada {c.name}</caption>
          <thead>
            <tr>
              <th scope="col">Sitio</th>
              <th scope="col">O₂ (mg/L)</th>
              <th scope="col">Sat. (%)</th>
              <th scope="col">Coliformes fecales</th>
              <th scope="col">DBO5 (mg/L)</th>
              <th scope="col">Turbiedad (UNT)</th>
              <th scope="col">ICA 2017</th>
            </tr>
          </thead>
          <tbody>
            {c.sitios.map((s) => (
              <tr key={s.id}>
                <th scope="row">
                  {parte(s)}
                  <small>
                    {s.nombre.toLowerCase()} · {s.altura !== null ? `${fmt(s.altura, 0)} m` : ''} · {fmtDate(s.fecha)}
                  </small>
                </th>
                <td>{s.od === null ? '—' : fmt(s.od, 1)}</td>
                <td>{s.sat === null ? '—' : fmt(s.sat, 0)}</td>
                <td>{s.cf === null ? '—' : fmtBig(s.cf)}</td>
                <td>{dboText(s)}</td>
                <td>{s.turb === null ? '—' : fmt(s.turb, 1)}</td>
                <td>{s.icaClase ? s.icaClase.toLowerCase() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {afect.length > 0 && (
        <p className="q3-small">
          <strong>Orillas (retiros) de esta quebrada:</strong> {afect.join(' · ').toLowerCase()}.
        </p>
      )}
      <h4>Compara con la escena</h4>
      <p className="q3-small">
        En la escena, con 600 casas sin tratar en una quebrada de montaña, el oxígeno casi no baja pero los coliformes impiden nadar en todo el tramo. Las quebradas de San Antonio de Prado muestran lo mismo: oxígeno alto y coliformes altos. Lo que las arregla no es la caída del agua sino que el agua usada de las casas no llegue a la quebrada.
      </p>
      <p className="q3-small">
        «DBO5 &lt; 2» quiere decir que estaba por debajo de lo que el laboratorio puede medir. ICA: índice de calidad del agua de la campaña de 2017. Fuente: {MONITOREO_META.fuente}. {MONITOREO_META.derechos}
      </p>
    </div>
  );
}
