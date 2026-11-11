// Parte «De la casa al río» en dibujos planos (equipos sin WebGL): la planta de aguas residuales de lodos
// activados, con el mismo modelo que la escena 3D (ptar.ts): controles, agua en cada etapa, norma de vertimientos
// (Resolución 0631 de 2015), río aguas abajo, lodos y energía.

import { useMemo, useState, type ReactNode } from 'react';
import { Disclosure, Segmented, Toggle } from '../../components/ui';
import { DEFAULT_PTAR, RES_0631, RIVER_FISH_DO, WEATHER, ptarModel, type Purga, type PtarInput, type Weather } from '../ptar';
import { PTAR_UNITS } from '../ptarUnits';
import { ProfileChart, QLayout, QRange, fmt, fmtBig } from '../ui';

/** Color del agua según sus sólidos suspendidos [mg/L]. */
function sstColor(sst: number): string {
  const clear = [176, 214, 230], dirty = [128, 112, 86];
  const f = Math.min(1, Math.sqrt(Math.max(0, sst) / 250));
  return `rgb(${clear.map((c, i) => Math.round(c + (dirty[i] - c) * f)).join(',')})`;
}
const LIQUOR = '#6e4f30', DEAD = '#8b8577';
const mg = (v: number) => fmt(v, v < 10 ? 1 : 0);

export function PtarPart({ head }: { head: ReactNode }) {
  const [inp, setInp] = useState<PtarInput>(DEFAULT_PTAR);
  const set = (p: Partial<PtarInput>) => setInp((s) => ({ ...s, ...p }));
  const r = useMemo(() => ptarModel(inp), [inp]);
  const W = WEATHER[inp.weather];
  const liquor = r.reactor.washout ? DEAD : LIQUOR;
  const steps = [
    { id: 'llegada', name: 'Llegada', color: sstColor(r.raw.sst), value: `${Math.round((r.Qin * 1000) / 86400)} L/s`, bad: r.Qbypass > 0 },
    { id: 'pre', name: 'Rejas y desarenador', color: sstColor(r.pre.sst), value: `${Math.round(r.trashLD)} L basura/día`, bad: false },
    { id: 'primario', name: 'Primario', color: sstColor(r.prim.sst), value: inp.primary ? `sólidos ${mg(r.prim.sst)} mg/L` : 'fuera de servicio', bad: !inp.primary },
    { id: 'reactor', name: 'Reactor con aire', color: liquor, value: r.reactor.washout ? '¡sin bacterias!' : `DBO ${mg(r.reactor.S)} mg/L`, bad: r.reactor.washout || r.reactor.bulking },
    { id: 'secundario', name: 'Secundario', color: sstColor(r.sec.sst), value: `sólidos ${mg(r.sec.sst)} mg/L`, bad: r.sec.sst > RES_0631[r.cat].sst },
    { id: 'uv', name: 'Luz UV', color: sstColor(r.eff.sst), value: inp.uv ? 'encendida' : 'apagada', bad: !inp.uv },
  ];
  const prof = useMemo(() => {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 80; k++) pts.push([k * 0.5, r.river.at(k * 0.5).dO]);
    return pts;
  }, [r]);
  const ok = r.complies;
  return (
    <QLayout
      head={head}
      stage={
        <div className="q-stage-plant">
          <svg viewBox="0 0 1000 540" className="q-scene q-scene-h" role="img" aria-label={`Planta de aguas residuales: llegan ${Math.round((r.Qin * 1000) / 86400)} litros por segundo; el agua tratada sale con DBO5 de ${mg(r.eff.dbo)} mg/L y ${ok ? 'cumple' : 'no cumple'} la norma. ${r.Qbypass > 0 ? `El ${fmt(r.bypassPct, 0)} % pasa sin tratar por el aliviadero.` : ''} Peces en el río: ${r.river.fishOk ? 'sí' : 'no'}.`}>
            <rect width="1000" height="540" fill="#eef4f3" />
            <text x="500" y="36" textAnchor="middle" className="q-svg-title">De la casa al río</text>
            <path d="M60 210 H930" stroke="#7d8d99" strokeWidth="10" strokeLinecap="round" />
            {steps.map((s, k) => {
              const x = 40 + k * 145, w = 112;
              return (
                <g key={s.id} className={s.bad ? 'q-bad' : ''}>
                  {s.id === 'primario' || s.id === 'secundario' ? (
                    <ellipse cx={x + w / 2} cy={210} rx={w / 2} ry={42} fill={s.color} stroke={s.bad ? '#c0462a' : '#5b7183'} strokeWidth={s.bad ? 3 : 1.5} />
                  ) : (
                    <rect x={x} y={168} width={w} height={84} rx="8" fill={s.color} stroke={s.bad ? '#c0462a' : '#5b7183'} strokeWidth={s.bad ? 3 : 1.5} />
                  )}
                  {s.id === 'reactor' &&
                    Array.from({ length: Math.round(inp.air * 4) }, (_, p) => <circle key={p} cx={x + 12 + ((p * 29) % 88)} cy={240 - ((p * 17) % 60)} r={3} fill="#ffffff" opacity="0.85" />)}
                  {s.id === 'uv' && inp.uv && [0, 1, 2].map((p) => <rect key={p} x={x + 20 + p * 32} y={176} width={8} height={68} rx="4" fill="#b98cff" />)}
                  <text x={x + w / 2} y={286} textAnchor="middle" className="q-svg-label">{s.name}</text>
                  <text x={x + w / 2} y={304} textAnchor="middle" className="q-svg-value">{s.value}</text>
                  {k > 0 && <path d={`M${x - 20} 210 l10 -6 v12z`} fill="#46596b" />}
                </g>
              );
            })}
            {/* recirculación del lodo del secundario al reactor (por encima de los tanques) */}
            {inp.recirc && <path d="M666 168 q0 -34 -40 -34 h-150 q-26 0 -26 34" fill="none" stroke="#7a5f3e" strokeWidth="4" strokeDasharray="8 5" />}
            {inp.recirc && <text x="560" y="126" textAnchor="middle" className="q-svg-small">recirculación del lodo</text>}
            {/* aliviadero y río */}
            {r.Qbypass > 0 && <path d="M50 252 V430" stroke={sstColor(r.raw.sst)} strokeWidth="8" />}
            {r.Qbypass > 0 && (
              <text x="60" y="420" className="q-svg-small" style={{ fill: '#9b2f1b' }}>
                {`aliviadero: ${fmt(r.bypassPct, 0)} % sin tratar`}
              </text>
            )}
            <path d="M930 210 V430" stroke={sstColor(r.eff.sst)} strokeWidth="6" />
            <rect x="0" y="430" width="1000" height="48" fill={r.river.fishOk ? '#7fb3c8' : '#8f8a6c'} />
            <text x="500" y="460" textAnchor="middle" className="q-svg-label" style={{ fill: '#ffffff' }}>{`El río: oxígeno mínimo ${fmt(r.river.minDO, 1)} mg/L a ${fmt(r.river.xMinKm, 1)} km · peces: ${r.river.fishOk ? 'sí' : 'no'}`}</text>
            {/* línea de lodos */}
            <g transform="translate(270 334)">
              {[
                { x: 0, w: 130, fill: '#a08a6a', t: 'Espesador' },
                { x: 164, w: 236, fill: '#6b5640', t: `Digestor: ${Math.round(r.sludge.biogasM3D)} m³ de biogás` },
                { x: 434, w: 184, fill: '#5a4129', t: `Biosólido: ${fmt(r.sludge.cakeTD, 1)} t/día` },
              ].map((b, k) => (
                <g key={b.t}>
                  <rect x={b.x} width={b.w} height="44" rx="8" fill={b.fill} />
                  <text x={b.x + b.w / 2} y="27" textAnchor="middle" className="q-svg-label" style={{ fill: '#ffffff' }}>
                    {b.t}
                  </text>
                  {k > 0 && <path d={`M${b.x - 30} 22 h22 l-6 -5 m6 5 l-6 5`} stroke="#7a5f3e" strokeWidth="3" fill="none" />}
                </g>
              ))}
            </g>
            {/* sellos de la norma */}
            <g transform="translate(22 490)">
              {r.checks.map((c, k) => (
                <g key={c.id} transform={`translate(${k * 162} 0)`}>
                  <rect width="154" height="42" rx="8" fill={c.ok ? '#e8f3e3' : '#fbe9e4'} stroke={c.ok ? '#3d7a3a' : '#c0462a'} />
                  <text x="8" y="17" className="q-svg-small" fill={c.ok ? '#2c5d2a' : '#9b2f1b'}>{`${c.ok ? '✓' : '✗'} ${c.name}`}</text>
                  <text x="8" y="34" className="q-svg-small">{c.shown}</text>
                </g>
              ))}
            </g>
          </svg>
          <svg viewBox={`0 0 400 ${110 + steps.length * 86 + 120}`} className="q-scene q-scene-v" role="img" aria-label={`Planta de aguas residuales, de arriba abajo. El agua tratada sale con DBO5 de ${mg(r.eff.dbo)} mg/L y ${ok ? 'cumple' : 'no cumple'} la norma. Peces en el río: ${r.river.fishOk ? 'sí' : 'no'}.`}>
            <rect width="400" height={110 + steps.length * 86 + 120} fill="#eef4f3" />
            <text x="200" y="40" textAnchor="middle" className="q-svg-title">De la casa al río</text>
            <path d={`M70 76 V${76 + steps.length * 86 + 20}`} stroke="#7d8d99" strokeWidth="8" strokeLinecap="round" />
            {steps.map((s, k) => {
              const y = 66 + k * 86;
              return (
                <g key={s.id} className={s.bad ? 'q-bad' : ''}>
                  <rect x="24" y={y} width="92" height="64" rx="8" fill={s.color} stroke={s.bad ? '#c0462a' : '#5b7183'} strokeWidth={s.bad ? 3 : 1.5} />
                  <text x="136" y={y + 28} className="q-svg-label">{s.name}</text>
                  <text x="136" y={y + 50} className="q-svg-value">{s.value}</text>
                  {k < steps.length - 1 && <path d={`M70 ${y + 72} l-7 -9 h14z`} fill="#46596b" />}
                </g>
              );
            })}
            {(() => {
              const y = 66 + steps.length * 86;
              return (
                <g>
                  <rect x="0" y={y + 10} width="400" height="44" fill={r.river.fishOk ? '#7fb3c8' : '#8f8a6c'} />
                  <text x="200" y={y + 38} textAnchor="middle" className="q-svg-label" style={{ fill: '#ffffff' }}>{`Río: peces ${r.river.fishOk ? 'sí' : 'no'}`}</text>
                  <text x="20" y={y + 84} className="q-svg-value" fill={ok ? '#2c5d2a' : '#9b2f1b'}>{ok ? '✓ cumple la Resolución 0631' : `✗ no cumple (${r.checks.filter((c) => !c.ok).length} de 6)`}</text>
                </g>
              );
            })()}
          </svg>
        </div>
      }
      panel={
        <div className="q-part">
          <p className="q-lead">
            El agua del baño y la cocina se va por el alcantarillado hasta una planta de tratamiento. Allí se le quita la basura, lo que se asienta y, con bacterias y aire, la materia orgánica disuelta. Maneja la planta para que el agua que vuelve al río cumpla la norma y el río conserve sus peces.
          </p>
          <section className="q-box" aria-label="Lo que llega a la planta">
            <h3>Lo que llega</h3>
            <QRange label="Habitantes" value={inp.pop} min={10000} max={150000} step={5000} unit="personas" digits={0} onChange={(v) => set({ pop: v })} help={`Recogen ${fmt(r.loadKgD, 0)} kg/día de DBO5: ${RES_0631[r.cat].label}.`} />
            <Segmented<Weather>
              label="Clima"
              value={inp.weather}
              options={[
                { value: 'seco', label: 'Seco' },
                { value: 'lluvia', label: 'Lluvia' },
                { value: 'aguacero', label: 'Aguacero' },
              ]}
              onChange={(v) => set({ weather: v })}
              help={`Con alcantarillado combinado llega ${W.mult} ${W.mult === 1 ? 'vez' : 'veces'} el agua de tiempo seco. Caben ${Math.round((r.Qcap * 1000) / 86400)} L/s; ${r.Qbypass > 0 ? `${Math.round((r.Qbypass * 1000) / 86400)} L/s se van por el aliviadero sin tratar.` : 'todo entra a la planta.'}`}
            />
          </section>
          <section className="q-box" aria-label="Cómo se opera la planta">
            <h3>Cómo se opera</h3>
            <QRange label="Aire en el reactor" value={inp.air} min={0} max={4} step={0.25} unit="mg/L" digits={2} onChange={(v) => set({ air: v })} help={r.reactor.washout ? 'Las bacterias del reactor se lavaron o no tienen aire: la materia orgánica pasa casi entera.' : r.reactor.bulking ? `Con tan poco oxígeno crecen bacterias en hilos y el lodo se asienta mal (IVL ${Math.round(r.reactor.svi)} mL/g).` : `Los sopladores gastan ${fmt(r.energy.airKwhD, 0)} kWh/día.`} />
            <Segmented<Purga>
              label="Purga de lodo"
              value={inp.purga}
              options={[
                { value: 'poca', label: 'Poca' },
                { value: 'normal', label: 'Normal' },
                { value: 'mucha', label: 'Mucha' },
              ]}
              onChange={(v) => set({ purga: v })}
              help={`Edad del lodo: ${fmt(r.reactor.srtD, r.reactor.srtD < 2 ? 2 : 1)} días. ${r.reactor.nitrify ? 'Las bacterias nitrificantes alcanzan a crecer: el amonio pasa a nitrato.' : 'Las nitrificantes no alcanzan a crecer: el amonio sale al río.'}`}
            />
            <Toggle label="Sedimentador primario" checked={inp.primary} onChange={(v) => set({ primary: v })} />
            <Toggle label="Recirculación del lodo" checked={inp.recirc} onChange={(v) => set({ recirc: v })} />
            <Toggle label="Luz ultravioleta" checked={inp.uv} onChange={(v) => set({ uv: v })} />
            <Toggle label="Segunda línea de tratamiento" checked={inp.lines === 2} onChange={(v) => set({ lines: v ? 2 : 1 })} />
          </section>
          <section className="q-box" aria-label="Agua que vuelve al río">
            <h3>¿El agua que vuelve al río cumple?</h3>
            <ul className="q-checks">
              {r.checks.map((c) => (
                <li key={c.id} className={c.ok ? 'is-ok' : 'is-bad'}>
                  <span aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
                  <div>
                    <strong>{c.name}</strong>: {c.shown}
                    <span className="q-help">Resolución 0631 de 2015: {c.limit}.</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className={`q-verdict ${ok && r.river.fishOk && r.Qbypass <= 0 ? 'is-ok' : 'is-bad'}`} role="status">
              {ok ? 'El agua tratada cumple la norma.' : 'El agua tratada todavía no cumple la norma.'} {r.Qbypass > 0 ? `Pero el ${fmt(r.bypassPct, 0)} % del agua pasa sin tratar.` : ''} {r.river.fishOk ? 'El río conserva sus peces.' : `En el río, ${r.river.fishWhy.join(' y ')}.`}
            </p>
            <ProfileChart
              title="Oxígeno del río aguas abajo"
              lines={[{ points: prof, color: '#2f6fa8', label: 'oxígeno disuelto' }]}
              yUnit="mg/L"
              refs={[{ y: RIVER_FISH_DO, label: 'peces (4 mg/L)', color: '#c9372c' }]}
              marks={[{ x: r.river.xMinKm, label: `mínimo ${fmt(r.river.minDO, 1)}`, strong: true }]}
              fmtY={(v) => fmt(v, 1)}
              xLabel="distancia aguas abajo de la descarga (km)"
              xUnit="km"
            />
          </section>
          <section className="q-box" aria-label="Lodos y energía">
            <h3>Lodos y energía</h3>
            <p className="q-help">
              Cada día salen {fmt(r.sludge.primaryKgD + r.sludge.wasKgD, 0)} kg de lodo seco. El digestor produce {fmt(r.sludge.biogasM3D, 0)} m³ de biogás, que dan {fmt(r.energy.biogasKwhD, 0)} kWh: el {fmt(r.energy.coverPct, 0)} % de la energía de la planta. Coliformes a la salida: {fmtBig(Math.max(0, r.eff.coli))} por 100 mL.
            </p>
          </section>
          <Disclosure title="Las once partes de la planta">
            <ol className="q-teacher">
              {PTAR_UNITS.map((u) => (
                <li key={u.id}>
                  <strong>{u.name}.</strong> {u.short}
                </li>
              ))}
            </ol>
          </Disclosure>
          <Disclosure title="Para docentes: el modelo y sus fuentes">
            <div className="q-teacher">
              <p>
                <strong>Norma.</strong> Resolución 0631 de 2015, artículo 8 (aguas residuales domésticas de prestadores del servicio de alcantarillado a aguas superficiales): hasta 3 000 kg/día de DBO5, DQO 180, DBO5 90, sólidos suspendidos 90 y grasas y aceites 20 mg/L; más de 3 000 kg/día, 150, 70, 70 y 10 mg/L; en todas, pH de 6 a 9 y sólidos sedimentables de 5 mL/L o menos.
              </p>
              <p>
                <strong>Modelo.</strong> Remoción primaria t/(a + b·t) (Crites y Tchobanoglous); lodos activados con cinética de Monod y edad del lodo (Metcalf y Eddy), nitrificación, demanda de oxígeno y energía de aireación; digestión anaerobia y biogás; río con Streeter y Phelps. Las reglas del sedimentador secundario, del IVL y de la luz UV son didácticas. Detalles en docs/calidad/MODELO_CALIDAD.md. La planta es ilustrativa: no representa San Fernando ni Aguas Claras.
              </p>
            </div>
          </Disclosure>
        </div>
      }
    />
  );
}
