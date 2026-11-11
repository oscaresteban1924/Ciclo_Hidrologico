// Planos acotados y gráficas de los prediseños: descripciones vectoriales puras (sin interfaz) y su dibujo en SVG
// como texto, para mostrarlas en la pestaña Diseño y meterlas en la memoria de cálculo imprimible. Los planos se
// dibujan a escala (la misma en x y en y) salvo que digan su exageración vertical.

export type XY = [number, number];
export type Fill = 'concreto' | 'tierra' | 'agua' | 'roca' | 'acero' | 'relleno' | 'vacio';

export type PlanItem =
  | { k: 'shape'; pts: XY[]; fill: Fill }
  | { k: 'line'; pts: XY[]; style: 'agua' | 'eje' | 'terreno' | 'energia' }
  | { k: 'dim'; a: XY; b: XY; text: string; off: number }
  | { k: 'label'; at: XY; text: string; anchor?: 'start' | 'middle' | 'end'; small?: boolean }
  | { k: 'circle'; c: XY; r: number; fill: Fill };

export interface Plan {
  title: string;
  /** Corte transversal, perfil longitudinal, alzado… */
  view: string;
  items: PlanItem[];
  /** Exageración vertical (1 = a escala). */
  vex?: number;
}

export interface Chart {
  title: string;
  xLabel: string;
  yLabel: string;
  series: { name: string; pts: XY[]; dash?: boolean }[];
  /** Punto de diseño y líneas horizontales de referencia. */
  mark?: { at: XY; text: string };
  hlines?: { y: number; text: string }[];
  logY?: boolean;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n2 = (v: number) => (Math.round(v * 100) / 100).toString();

const FILL: Record<Fill, string> = {
  concreto: 'url(#hc-p-conc)',
  tierra: 'url(#hc-p-soil)',
  agua: '#cfe6f4',
  roca: 'url(#hc-p-rock)',
  acero: '#9aa4ad',
  relleno: 'url(#hc-p-fill)',
  vacio: '#ffffff',
};

const DEFS = `<defs>
<pattern id="hc-p-conc" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e4e1db"/><circle cx="2" cy="2" r="0.8" fill="#a39d92"/><circle cx="6" cy="5" r="0.6" fill="#a39d92"/></pattern>
<pattern id="hc-p-soil" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#e9dcc6"/><line x1="0" y1="0" x2="0" y2="8" stroke="#b49a72" stroke-width="1.2"/></pattern>
<pattern id="hc-p-fill" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#efe6d4"/><circle cx="3" cy="3" r="1" fill="#c4ae86"/><circle cx="8" cy="7" r="1.2" fill="#c4ae86"/></pattern>
<pattern id="hc-p-rock" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#d9d5cd"/><ellipse cx="4" cy="4" rx="3.2" ry="2.4" fill="#a8a196" stroke="#7e776c" stroke-width="0.6"/><ellipse cx="10" cy="8" rx="2.4" ry="1.8" fill="#b5aea3" stroke="#7e776c" stroke-width="0.6"/></pattern>
<marker id="hc-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,2 L10,5 L0,8 z" fill="#17324d"/></marker>
</defs>`;

/** Dibujo SVG del plano, ajustado a `W` píxeles de ancho. */
export function planSVG(plan: Plan, W = 560): string {
  const vex = plan.vex ?? 1;
  const pts: XY[] = [];
  for (const it of plan.items) {
    if (it.k === 'shape' || it.k === 'line') pts.push(...it.pts);
    else if (it.k === 'dim') {
      const [dx, dy] = [it.b[0] - it.a[0], it.b[1] - it.a[1]];
      const L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * it.off, ny = (dx / L) * it.off;
      pts.push(it.a, it.b, [it.a[0] + nx * 1.6, it.a[1] + ny * 1.6], [it.b[0] + nx * 1.6, it.b[1] + ny * 1.6]);
    } else if (it.k === 'label') pts.push(it.at);
    else pts.push([it.c[0] - it.r, it.c[1] - it.r], [it.c[0] + it.r, it.c[1] + it.r]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1] * vex);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // margen: arriba y abajo para el título y la nota; a los lados, para el texto de las cotas verticales
  const pad = 34, padX = 70;
  const sw = (W - 2 * padX) / Math.max(1e-6, x1 - x0);
  const H0 = (y1 - y0) * sw;
  const maxH = 320;
  const s = H0 > maxH ? (maxH / H0) * sw : sw;
  const H = Math.max(120, (y1 - y0) * s + 2 * pad + 18);
  const ox = padX + (W - 2 * padX - (x1 - x0) * s) / 2;
  const X = (x: number) => ox + (x - x0) * s;
  const Y = (y: number) => H - pad - (y * vex - y0) * s;
  const P = (p: XY) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`;
  const out: string[] = [];
  for (const it of plan.items) {
    if (it.k === 'shape') out.push(`<polygon points="${it.pts.map(P).join(' ')}" fill="${FILL[it.fill]}" stroke="${it.fill === 'agua' ? '#4f93c2' : '#5b6670'}" stroke-width="${it.fill === 'agua' ? 0.8 : 1.1}"/>`);
    else if (it.k === 'circle') out.push(`<circle cx="${X(it.c[0]).toFixed(1)}" cy="${Y(it.c[1]).toFixed(1)}" r="${(it.r * s).toFixed(1)}" fill="${FILL[it.fill]}" stroke="#5b6670" stroke-width="1.1"/>`);
    else if (it.k === 'line') {
      const st = { agua: 'stroke="#1f78b4" stroke-width="1.6"', eje: 'stroke="#8a96a0" stroke-width="0.8" stroke-dasharray="8 3 2 3"', terreno: 'stroke="#6d5a3e" stroke-width="1.2"', energia: 'stroke="#c0392b" stroke-width="1" stroke-dasharray="5 3"' }[it.style];
      out.push(`<polyline points="${it.pts.map(P).join(' ')}" fill="none" ${st}/>`);
      if (it.style === 'agua' && it.pts.length >= 2) {
        // símbolo del nivel del agua (triángulo invertido)
        const m = it.pts[Math.floor(it.pts.length / 2)];
        const cx = X(m[0]), cy = Y(m[1]);
        out.push(`<path d="M${(cx - 5).toFixed(1)},${(cy - 9).toFixed(1)} L${(cx + 5).toFixed(1)},${(cy - 9).toFixed(1)} L${cx.toFixed(1)},${(cy - 1).toFixed(1)} Z" fill="#1f78b4"/>`);
      }
    } else if (it.k === 'dim') {
      const ax = X(it.a[0]), ay = Y(it.a[1]), bx = X(it.b[0]), by = Y(it.b[1]);
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
      const off = it.off * s * (vex !== 1 && Math.abs(dx) < 1e-6 ? 1 : 1);
      const nx = (dy / L) * off, ny = (-dx / L) * off;
      const a2 = [ax + nx, ay + ny], b2 = [bx + nx, by + ny];
      out.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${a2[0].toFixed(1)}" y2="${a2[1].toFixed(1)}" stroke="#8a96a0" stroke-width="0.6"/>`);
      out.push(`<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${b2[0].toFixed(1)}" y2="${b2[1].toFixed(1)}" stroke="#8a96a0" stroke-width="0.6"/>`);
      out.push(`<line x1="${a2[0].toFixed(1)}" y1="${a2[1].toFixed(1)}" x2="${b2[0].toFixed(1)}" y2="${b2[1].toFixed(1)}" stroke="#17324d" stroke-width="0.9" marker-start="url(#hc-arr)" marker-end="url(#hc-arr)"/>`);
      const mx = (a2[0] + b2[0]) / 2, my = (a2[1] + b2[1]) / 2;
      const vertical = Math.abs(dx) < Math.abs(dy);
      const tx = vertical ? mx + (nx >= 0 ? 5 : -5) : mx, ty = vertical ? my + 4 : my - 5;
      out.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="11" font-weight="700" fill="#17324d" text-anchor="${vertical ? (nx >= 0 ? 'start' : 'end') : 'middle'}" paint-order="stroke" stroke="#ffffff" stroke-width="3">${esc(it.text)}</text>`);
    } else if (it.k === 'label') {
      out.push(`<text x="${X(it.at[0]).toFixed(1)}" y="${Y(it.at[1]).toFixed(1)}" font-size="${it.small ? 10 : 11}" fill="#3c4b57" text-anchor="${it.anchor ?? 'middle'}" paint-order="stroke" stroke="#ffffff" stroke-width="3">${esc(it.text)}</text>`);
    }
  }
  const foot = `${plan.view}${vex !== 1 ? ` · escala vertical × ${n2(vex).replace('.', ',')}` : ' · a escala'} · cotas en metros`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H.toFixed(0)}" width="${W}" height="${H.toFixed(0)}" font-family="Atkinson Hyperlegible, Arial, sans-serif" role="img" aria-label="${esc(plan.title)}">${DEFS}<rect width="${W}" height="${H.toFixed(0)}" fill="#ffffff"/><text x="12" y="18" font-size="12" font-weight="700" fill="#17324d">${esc(plan.title)}</text>${out.join('')}<text x="${W - 10}" y="${(H - 8).toFixed(0)}" font-size="10" fill="#5b6b78" text-anchor="end">${esc(foot)}</text></svg>`;
}

/** Gráfica de líneas en SVG (ejes claros, leyenda si hay más de una serie). */
export function chartSVG(c: Chart, W = 560, H = 260): string {
  const L = 54, R = 16, B = 42;
  // leyenda en filas que caben en el ancho
  const legend: { x: number; row: number; k: number }[] = [];
  if (c.series.length > 1) {
    let lx = L + 6, row = 0;
    c.series.forEach((s, k) => {
      const w = 30 + s.name.length * 5.6;
      if (lx + w > W - R && lx > L + 6) {
        row++;
        lx = L + 6;
      }
      legend.push({ x: lx, row, k });
      lx += w;
    });
  }
  const rows = legend.length ? legend[legend.length - 1].row + 1 : 0;
  const T = 30 + rows * 15;
  const all = c.series.flatMap((s) => s.pts).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && (!c.logY || p[1] > 0));
  if (!all.length) return '';
  const hy = (c.hlines ?? []).map((h) => h.y);
  const xs = all.map((p) => p[0]);
  const ysRaw = [...all.map((p) => p[1]), ...hy, ...(c.mark ? [c.mark.at[1]] : [])];
  const tf = (y: number) => (c.logY ? Math.log10(y) : y);
  const ys = ysRaw.filter((y) => !c.logY || y > 0).map(tf);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (!c.logY) y0 = Math.min(0, y0);
  if (x1 - x0 < 1e-9) x1 = x0 + 1;
  if (y1 - y0 < 1e-9) y1 = y0 + 1;
  y1 += (y1 - y0) * 0.08;
  const X = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const Y = (y: number) => H - B - ((tf(y) - y0) / (y1 - y0)) * (H - T - B);
  const nice = (lo: number, hi: number, n: number) => {
    const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  };
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',').replace(/,?0+$/, (m) => (m.startsWith(',') ? '' : m));
  const o: string[] = [];
  const yt = c.logY ? Array.from({ length: Math.floor(y1) - Math.ceil(y0) + 1 }, (_, k) => Math.pow(10, Math.ceil(y0) + k)) : nice(y0, y1, 5);
  for (const v of yt) o.push(`<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e6ecf0"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" font-size="10" fill="#5b6b78" text-anchor="end">${fmt(v)}</text>`);
  for (const v of nice(x0, x1, 6)) o.push(`<text x="${X(v).toFixed(1)}" y="${H - B + 15}" font-size="10" fill="#5b6b78" text-anchor="middle">${fmt(v)}</text>`);
  o.push(`<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#8a96a0"/>`);
  const COLORS = ['#2f7fb0', '#c0632b', '#4f8f5f', '#7b5ea7'];
  for (const h of c.hlines ?? []) o.push(`<line x1="${L}" x2="${W - R}" y1="${Y(h.y).toFixed(1)}" y2="${Y(h.y).toFixed(1)}" stroke="#c0392b" stroke-dasharray="5 3"/><text x="${W - R - 4}" y="${(Y(h.y) - 4).toFixed(1)}" font-size="10" fill="#9b2c22" text-anchor="end">${esc(h.text)}</text>`);
  c.series.forEach((s, k) => {
    const p = s.pts.filter((q) => Number.isFinite(q[1]) && (!c.logY || q[1] > 0));
    if (p.length < 2) return;
    o.push(`<polyline points="${p.map((q) => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(' ')}" fill="none" stroke="${COLORS[k % 4]}" stroke-width="2"${s.dash ? ' stroke-dasharray="6 4"' : ''}/>`);
  });
  if (c.mark) {
    const mx = X(c.mark.at[0]), my = Y(c.mark.at[1]);
    const right = mx > L + (W - L - R) * 0.62;
    o.push(`<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4.5" fill="#17324d" stroke="#ffffff" stroke-width="2"/><text x="${(right ? mx - 8 : mx + 8).toFixed(1)}" y="${(my - 7).toFixed(1)}" font-size="10.5" font-weight="700" fill="#17324d" text-anchor="${right ? 'end' : 'start'}" paint-order="stroke" stroke="#ffffff" stroke-width="3">${esc(c.mark.text)}</text>`);
  }
  for (const g of legend) {
    const s = c.series[g.k], y = 31 + g.row * 15;
    o.push(`<line x1="${g.x}" x2="${g.x + 16}" y1="${y}" y2="${y}" stroke="${COLORS[g.k % 4]}" stroke-width="2"${s.dash ? ' stroke-dasharray="6 4"' : ''}/><text x="${g.x + 20}" y="${y + 3.5}" font-size="10" fill="#3c4b57">${esc(s.name)}</text>`);
  }
  o.push(`<text x="${(L + W - R) / 2}" y="${H - 8}" font-size="10.5" fill="#3c4b57" text-anchor="middle">${esc(c.xLabel)}</text>`);
  o.push(`<text x="12" y="${(T + H - B) / 2}" font-size="10.5" fill="#3c4b57" text-anchor="middle" transform="rotate(-90 12 ${(T + H - B) / 2})">${esc(c.yLabel)}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Atkinson Hyperlegible, Arial, sans-serif" role="img" aria-label="${esc(c.title)}"><rect width="${W}" height="${H}" fill="#ffffff"/><text x="12" y="16" font-size="12" font-weight="700" fill="#17324d">${esc(c.title)}</text>${o.join('')}</svg>`;
}
