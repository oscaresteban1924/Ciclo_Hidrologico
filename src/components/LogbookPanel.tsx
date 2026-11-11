// Bitácora de investigación: observaciones, predicciones, comparaciones y explicaciones.
// Se guarda solo en este dispositivo. Los niveles premian observar, comparar y explicar, no los clics.

import { useState } from 'react';
import { useStore, type LogEntry } from '../state/store';
import { InquiryList } from './Inquiry';
import { Icon } from './ui';

const KINDS: { id: LogEntry['kind']; label: string; plural: string }[] = [
  { id: 'observacion', label: 'Observación', plural: 'Observaciones' },
  { id: 'prediccion', label: 'Predicción', plural: 'Predicciones' },
  { id: 'comparacion', label: 'Comparación', plural: 'Comparaciones' },
  { id: 'explicacion', label: 'Explicación', plural: 'Explicaciones' },
];

interface Level {
  name: string;
  checks: { label: string; ok: boolean }[];
}

function levels(log: LogEntry[]): Level[] {
  const n = (k: LogEntry['kind']) => log.filter((e) => e.kind === k).length;
  const checked = log.filter((e) => e.kind === 'prediccion' && e.outcome).length;
  return [
    { name: 'Observación', checks: [{ label: 'Completa una vista de detalle', ok: n('observacion') >= 1 }] },
    {
      name: 'Exploración',
      checks: [
        { label: 'Tres observaciones', ok: n('observacion') >= 3 },
        { label: 'Una predicción o hipótesis', ok: n('prediccion') >= 1 },
      ],
    },
    {
      name: 'Investigación',
      checks: [
        { label: 'Dos comparaciones', ok: n('comparacion') >= 2 },
        { label: 'Dos predicciones comprobadas en Experimentos', ok: checked >= 2 },
      ],
    },
    {
      name: 'Hidrología',
      checks: [
        { label: 'Cinco observaciones', ok: n('observacion') >= 5 },
        { label: 'Tres comparaciones', ok: n('comparacion') >= 3 },
        { label: 'Dos explicaciones con tus palabras', ok: n('explicacion') >= 2 },
      ],
    },
  ];
}

const dateFmt = (t: number) => new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function exportText(log: LogEntry[]): string {
  const lines = ['Bitácora del ciclo hidrológico', ''];
  for (const e of [...log].sort((a, b) => a.at - b.at)) {
    const k = KINDS.find((x) => x.id === e.kind)?.label ?? e.kind;
    lines.push(`${dateFmt(e.at)} · ${k}${e.outcome ? ` (${e.outcome === 'coincide' ? 'coincidió con lo observado' : 'fue distinta a lo observado'})` : ''}`);
    lines.push(e.title);
    lines.push(e.text);
    lines.push('');
  }
  return lines.join('\n');
}

export function LogbookPanel() {
  const { state, dispatch } = useStore();
  const log = state.logbook;
  const [filter, setFilter] = useState<LogEntry['kind'] | 'todo'>('todo');
  const [confirm, setConfirm] = useState(false);
  const lv = levels(log);
  const reached = lv.filter((l) => l.checks.every((c) => c.ok)).length;
  const next = lv[reached];
  const shown = [...log].filter((e) => filter === 'todo' || e.kind === filter).sort((a, b) => b.at - a.at);

  const [dl, setDl] = useState<'idle' | 'saved' | 'declined' | 'error'>('idle');
  const download = async () => {
    const text = exportText(log);
    const filename = 'bitacora-ciclo-hidrologico.txt';
    // dentro de Claude, la descarga pasa por la confirmación del visor
    const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
    if (host?.use) {
      try {
        const downloads = (await host.use('downloads')) as { save: (r: { filename: string; data: string }) => Promise<unknown> } | null;
        if (downloads) {
          await downloads.save({ filename, data: text });
          setDl('saved');
          return;
        }
      } catch (e) {
        setDl((e as { code?: string })?.code === 'declined' ? 'declined' : 'error');
        return;
      }
    }
    // como archivo independiente, una descarga normal del navegador
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDl('saved');
    } catch {
      setDl('error');
    }
  };

  return (
    <div className="logbook">
      <header>
        <h2 className="term">Bitácora de investigación</h2>
        <p className="lead">Aquí quedan tus observaciones, predicciones, comparaciones y explicaciones.</p>
        <p className="privacy-note">Se guarda solo en este dispositivo y no se envía a ningún lugar.</p>
      </header>

      <section className="lv" aria-labelledby="lv-title">
        <h3 id="lv-title">
          Nivel: {reached > 0 ? lv[reached - 1].name : 'Primeros pasos'}
          <span className="lv-steps" aria-hidden="true">
            {lv.map((l, i) => (
              <i key={l.name} className={i < reached ? 'is-on' : ''} />
            ))}
          </span>
        </h3>
        {next ? (
          <>
            <p className="hint-inline">Para llegar a {next.name}:</p>
            <ul className="lv-checks">
              {next.checks.map((c) => (
                <li key={c.label} className={c.ok ? 'is-ok' : ''}>
                  <span className="lv-box" aria-hidden="true">
                    {c.ok && <Icon name="check" />}
                  </span>
                  {c.label}
                  <span className="sr-only">{c.ok ? ' (logrado)' : ' (pendiente)'}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Completaste todos los niveles. ¡Ahora formula tu propia pregunta y diseña un experimento en Experimentos!</p>
        )}
      </section>

      <div className="log-counts" role="group" aria-label="Filtrar la bitácora">
        <button type="button" className={`filter${filter === 'todo' ? ' is-on' : ''}`} aria-pressed={filter === 'todo'} onClick={() => setFilter('todo')}>
          Todo ({log.length})
        </button>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className={`filter${filter === k.id ? ' is-on' : ''}`} aria-pressed={filter === k.id} onClick={() => setFilter(k.id)}>
            {k.plural} ({log.filter((e) => e.kind === k.id).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="log-empty">
          <p>
            <strong>Todavía no hay registros{filter !== 'todo' ? ' de este tipo' : ''}.</strong> Completa una vista de detalle («Ver de cerca»), compara dos escenarios en Experimentos o escribe una hipótesis en una pregunta para investigar.
          </p>
        </div>
      ) : (
        <ol className="log-list">
          {shown.map((e) => (
            <li key={e.id} className={`log-entry kind-${e.kind}`}>
              <p className="log-meta">
                <span className="log-kind">{KINDS.find((k) => k.id === e.kind)?.label}</span>
                <time dateTime={new Date(e.at).toISOString()}>{dateFmt(e.at)}</time>
                {e.outcome && <span className={`log-outcome is-${e.outcome}`}>{e.outcome === 'coincide' ? 'Coincidió con lo observado' : 'Fue distinta a lo observado'}</span>}
              </p>
              <p className="log-title">{e.title}</p>
              <p className="log-text">{e.text}</p>
              <button type="button" className="log-del" aria-label={`Borrar el registro: ${e.title}`} onClick={() => dispatch({ type: 'logRemove', id: e.id })}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ol>
      )}

      {log.length > 0 && (
        <div className="log-actions">
          <button type="button" className="btn-ghost small" onClick={() => void download()}>
            Descargar como texto
          </button>
          {dl !== 'idle' && (
            <span className="dl-status" role="status">
              {dl === 'saved' ? 'Descarga lista.' : dl === 'declined' ? 'Descarga cancelada.' : 'No se pudo descargar aquí; la bitácora sigue guardada en este dispositivo.'}
            </span>
          )}
          {confirm ? (
            <>
              <button
                type="button"
                className="btn-ghost small is-danger"
                onClick={() => {
                  log.forEach((e) => dispatch({ type: 'logRemove', id: e.id }));
                  setConfirm(false);
                }}
              >
                Sí, borrar todo
              </button>
              <button type="button" className="btn-ghost small" onClick={() => setConfirm(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="btn-ghost small" onClick={() => setConfirm(true)}>
              Borrar la bitácora
            </button>
          )}
        </div>
      )}

      <InquiryList title="Preguntas que puedes investigar" />
    </div>
  );
}
