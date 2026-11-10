// Alternativa funcional sin WebGL2: mapa 2D cenital del MISMO cálculo (no es una reproducción grabada).

import { COVERS, COVER_LIST } from '../sim/constants';
import type { Compiled } from '../sim/compile';
import type { CitySim } from '../sim/engine';
import { flowArrows } from '../sim/fields';
import type { Scenario } from '../sim/scenario';
import type { TracerSet } from '../sim/tracers';
import { TRACER_COLORS, TRACER_TRAIL_MOVING } from './tracerColors';
import { depthColor, hexToRgb } from './palette';
import { HAZARD } from '../sim/hazard';
import { showsSystem, type NetFilter } from './sewerColors';

const HAZ_RGB = HAZARD.map((h) => hexToRgb(h.color));
import type { Pick, ViewMode } from './sectorScene';

export class SectorMap2D {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private off: HTMLCanvasElement;
  private og: CanvasRenderingContext2D;
  private img: ImageData;
  private c: Compiled;
  private sc: Scenario;
  private container: HTMLElement;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private sim: CitySim | null = null;
  private tracers: TracerSet | null = null;
  private hl: [number, number] | null = null;
  view: ViewMode = 'realista';
  cut = false;
  netFilter: NetFilter = 'ambas';
  showArrows = true;
  amplify = 1;
  /** Ortofoto del sector real (vista realista): imagen cargada y preferencia de la persona. */
  private ortho: HTMLImageElement | null = null;
  private orthoOn = true;

  constructor(container: HTMLElement, sc: Scenario, c: Compiled) {
    this.container = container;
    this.sc = sc;
    this.c = c;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'city-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `Mapa 2D del sector ${sc.title} (vista sin 3D).`);
    container.appendChild(this.canvas);
    const g = this.canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D no disponible');
    this.g = g;
    this.off = document.createElement('canvas');
    this.og = this.off.getContext('2d')!;
    this.img = new ImageData(1, 1);
    this.setCompiled(c);
    this.resize();
    if (sc.imagery) {
      const im = new Image();
      im.onload = () => (this.ortho = im);
      im.src = sc.imagery.href;
    }
  }

  setOrtho(on: boolean): void {
    this.orthoOn = on;
  }

  setCompiled(c: Compiled): void {
    this.c = c;
    this.off.width = c.nx;
    this.off.height = c.ny;
    this.img = this.og.createImageData(c.nx, c.ny);
  }

  setView(v: ViewMode): void {
    this.view = v;
  }
  setCut(on: boolean): void {
    this.cut = on;
  }
  setNetFilter(f: NetFilter): void {
    this.netFilter = f;
  }
  setRain(): void {}
  setPinned(): void {}
  goto(): void {}
  focusOn(): void {}
  orbit(): void {}
  zoom(): void {}

  update(sim: CitySim, tracers: TracerSet | null): void {
    this.sim = sim;
    this.tracers = tracers;
  }

  resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const W = this.c.nx * this.c.dx, H = this.c.ny * this.c.dx;
    this.scale = Math.min((w * dpr) / W, (h * dpr) / H) * 0.94;
    this.ox = (w * dpr - W * this.scale) / 2;
    this.oy = (h * dpr - H * this.scale) / 2;
  }

  render(): void {
    const c = this.c, sim = this.sim;
    const d = this.img.data;
    const tmp = new Float32Array(4);
    const real = COVER_LIST.map((id) => hexToRgb(COVERS[id].color));
    const mat = COVER_LIST.map((id) => hexToRgb(COVERS[id].matColor));
    let zmin = Infinity, zmax = -Infinity;
    for (let k = 0; k < c.z.length; k++) {
      zmin = Math.min(zmin, c.z[k]);
      zmax = Math.max(zmax, c.z[k]);
    }
    // con la ortofoto, la imagen va debajo y la capa de celdas lleva solo el agua (transparente donde está seco)
    const photo = this.view === 'realista' && this.orthoOn && this.ortho !== null && !!this.sc.imagery;
    for (let j = 0; j < c.ny; j++) for (let i = 0; i < c.nx; i++) {
      const k = j * c.nx + i;
      const o = ((c.ny - 1 - j) * c.nx + i) * 4;
      if (photo) {
        const h = sim && !c.solid[k] ? sim.h[k] : 0;
        depthColor(h, tmp, 0);
        d[o] = tmp[0] * 255;
        d[o + 1] = tmp[1] * 255;
        d[o + 2] = tmp[2] * 255;
        d[o + 3] = c.solid[k] ? 0 : tmp[3] * 255;
        continue;
      }
      const base = (this.view === 'materiales' ? mat : real)[c.cover[k]];
      const shade = 0.75 + 0.3 * ((c.z[k] - zmin) / Math.max(1e-6, zmax - zmin));
      let r = base[0] * shade, g = base[1] * shade, b = base[2] * shade;
      if (this.view === 'resultados' || this.view === 'peligro') r = g = b = (r + g + b) / 3;
      if (c.solid[k]) {
        r *= 0.75;
        g *= 0.75;
        b *= 0.75;
      } else if (sim && this.view === 'peligro') {
        // clase de peligro máxima calculada (misma paleta de la leyenda)
        const hc = sim.hazMax[k];
        if (hc > 0) {
          const [hr, hg, hb] = HAZ_RGB[hc];
          r = r * 0.08 + hr * 0.92;
          g = g * 0.08 + hg * 0.92;
          b = b * 0.08 + hb * 0.92;
        }
      } else if (sim) {
        const h = this.view === 'resultados' ? sim.hmaxField[k] : sim.h[k];
        depthColor(h, tmp, 0);
        const a = tmp[3];
        r = r * (1 - a) + tmp[0] * a;
        g = g * (1 - a) + tmp[1] * a;
        b = b * (1 - a) + tmp[2] * a;
      }
      d[o] = r * 255;
      d[o + 1] = g * 255;
      d[o + 2] = b * 255;
      d[o + 3] = 255;
    }
    this.og.putImageData(this.img, 0, 0);
    const G = this.g;
    G.setTransform(1, 0, 0, 1, 0, 0);
    G.fillStyle = '#dfe8ee';
    G.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const W = c.nx * c.dx, H = c.ny * c.dx;
    const P = (x: number, y: number): [number, number] => [this.ox + x * this.scale, this.oy + (H - y) * this.scale];
    if (photo) {
      const im = this.sc.imagery!;
      const [ax, ay] = P(im.x0, im.y1), [bx, by] = P(im.x1, im.y0);
      G.imageSmoothingEnabled = true;
      G.drawImage(this.ortho!, ax, ay, bx - ax, by - ay);
    }
    G.imageSmoothingEnabled = false;
    G.drawImage(this.off, this.ox, this.oy, W * this.scale, H * this.scale);
    // Tuberías esquemáticas
    if (this.cut) {
      G.setLineDash([6, 5]);
      G.strokeStyle = '#4a5a6a';
      G.lineWidth = 3;
      for (const p of this.sc.pipes) {
        G.beginPath();
        p.path.forEach(([x, y], q) => (q ? G.lineTo(...P(x, y)) : G.moveTo(...P(x, y))));
        G.stroke();
      }
      G.setLineDash([]);
      // Red separada: colectores por sistema (más grueso si está en carga) y cámaras
      const sw = sim?.sewer;
      if (c.sewer) {
        const env = sim ? { h: sim.h, z: c.z, area: c.area, dx: c.dx } : undefined;
        const col = ['#2f6fb3', '#8a5a2b'];
        c.sewer.pipes.forEach((p, k) => {
          if (!showsSystem(this.netFilter, p.system)) return;
          const a = c.sewer!.nodes[p.a], b = c.sewer!.nodes[p.b];
          const load = sw ? sw.fillOf(k, env) > 1.001 : false;
          // la tubería conserva el color de su red; en carga se le añade un borde rojo
          if (load) {
            G.strokeStyle = '#e03131';
            G.lineWidth = 7;
            G.beginPath();
            G.moveTo(...P(a.x, a.y));
            G.lineTo(...P(b.x, b.y));
            G.stroke();
          }
          G.strokeStyle = col[p.system];
          G.lineWidth = p.role === 'colector' ? 3 : 1.5;
          G.beginPath();
          G.moveTo(...P(a.x, a.y));
          G.lineTo(...P(b.x, b.y));
          G.stroke();
          // sentido del flujo de diseño (de a hacia b) en la mitad del colector
          if (p.role === 'colector') {
            const [ax, ay] = P(a.x, a.y), [bx, by] = P(b.x, b.y);
            const mx = (ax + bx) / 2, my = (ay + by) / 2, L = Math.hypot(bx - ax, by - ay) || 1;
            const ux = (bx - ax) / L, uy = (by - ay) / L;
            G.fillStyle = col[p.system];
            G.beginPath();
            G.moveTo(mx + ux * 6, my + uy * 6);
            G.lineTo(mx - ux * 4 - uy * 5, my - uy * 4 + ux * 5);
            G.lineTo(mx - ux * 4 + uy * 5, my - uy * 4 - ux * 5);
            G.closePath();
            G.fill();
          }
        });
        const dt = sim && sim.lastDt > 0 ? sim.lastDt : 1;
        c.sewer.nodes.forEach((n, k) => {
          if (n.kind === 'caja-sumidero' || n.outfall || !showsSystem(this.netFilter, n.system)) return;
          const [px, py] = P(n.x, n.y);
          G.fillStyle = col[n.system];
          G.beginPath();
          G.arc(px, py, 4, 0, Math.PI * 2);
          G.fill();
          if (sw && sw.lastOverflow[k] / dt > 2e-4) {
            G.strokeStyle = '#e03131';
            G.lineWidth = 2;
            G.beginPath();
            G.arc(px, py, 8, 0, Math.PI * 2);
            G.stroke();
          }
        });
      }
    }
    // Sumideros
    for (const dr of c.drains) {
      const x = ((dr.cell % c.nx) + 0.5) * c.dx, y = (Math.floor(dr.cell / c.nx) + 0.5) * c.dx;
      const [px, py] = P(x, y);
      G.fillStyle = dr.obstruction > 0.5 ? '#7a5a2e' : '#22272b';
      G.fillRect(px - 5, py - 4, 10, 8);
    }
    // Quebrada cubierta o no visible en el terreno: eje de referencia a trazos (solo dibujo)
    const ref = this.sc.decor?.creekRef;
    if (ref && ref.length > 1) {
      G.setLineDash([7, 5]);
      G.strokeStyle = '#2f8fd8';
      G.lineWidth = 2.5;
      G.beginPath();
      ref.forEach(([x, y], q) => (q ? G.lineTo(...P(x, y)) : G.moveTo(...P(x, y))));
      G.stroke();
      G.setLineDash([]);
    }
    // Coberturas: cajones bajo la vía (contorno discontinuo), cabezales y troncos atascados en la entrada (la
    // franja marrón cubre la fracción obstruida calculada)
    (this.sc.culverts ?? []).forEach((cs, ci) => {
      const cu = c.culverts[ci];
      if (!cu) return;
      const half = cs.spanM / 2;
      const inWest = cs.inlet[0] < cs.road.x0;
      G.setLineDash([5, 4]);
      G.strokeStyle = '#2f3a44';
      G.lineWidth = 1.5;
      for (let q = 0; q <= cs.barrels; q++) {
        const f = -half + (q * cs.spanM) / cs.barrels;
        G.beginPath();
        G.moveTo(...P(cs.road.x0, cs.inlet[1] + f));
        G.lineTo(...P(cs.road.x1, cs.outlet[1] + f));
        G.stroke();
      }
      G.setLineDash([]);
      G.strokeStyle = '#8d8b84';
      G.lineWidth = 4;
      for (const [x, yc] of [[cs.road.x0, inWest ? cs.inlet[1] : cs.outlet[1]], [cs.road.x1, inWest ? cs.outlet[1] : cs.inlet[1]]]) {
        G.beginPath();
        G.moveTo(...P(x, yc - half - 0.35));
        G.lineTo(...P(x, yc + half + 0.35));
        G.stroke();
      }
      const obs = sim ? (sim.culv[ci]?.obs ?? 0) : cu.progressive ? 0 : cu.obstruction;
      if (obs > 0) {
        const xf = inWest ? cs.road.x0 : cs.road.x1, s2 = inWest ? -1 : 1;
        const [x0, y0] = P(xf, cs.inlet[1] + half * obs);
        const [x1, y1] = P(xf + s2 * 1.4, cs.inlet[1] - half * obs);
        G.fillStyle = '#6b4a2f';
        G.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
    });
    // Flechas
    if (sim && this.showArrows && this.view !== 'resultados' && this.view !== 'peligro') {
      G.strokeStyle = 'rgba(255,255,255,0.95)';
      G.lineWidth = 1.6;
      for (const a of flowArrows(sim, Math.max(2, Math.round(3 / c.dx)), 0.003, 0.03)) {
        const [x0, y0] = P(a.x, a.y);
        const L = Math.min(1.6, 0.5 + a.speed) * this.scale;
        const ang = Math.atan2(-a.uy, a.ux);
        const x1 = x0 + Math.cos(ang) * L, y1 = y0 + Math.sin(ang) * L;
        G.beginPath();
        G.moveTo(x0, y0);
        G.lineTo(x1, y1);
        G.lineTo(x1 - Math.cos(ang - 0.5) * L * 0.35, y1 - Math.sin(ang - 0.5) * L * 0.35);
        G.moveTo(x1, y1);
        G.lineTo(x1 - Math.cos(ang + 0.5) * L * 0.35, y1 - Math.sin(ang + 0.5) * L * 0.35);
        G.stroke();
      }
    }
    // Trazadores: estela con el color de su destino (los mismos de «¿Adónde fue la lluvia?»)
    if (this.tracers) {
      G.lineCap = 'round';
      G.lineJoin = 'round';
      for (const t of this.tracers.tracers) {
        if (t.trail.length < 4) continue;
        const path = () => {
          G.beginPath();
          for (let q = 0; q < t.trail.length; q += 2) {
            const [px, py] = P(t.trail[q], t.trail[q + 1]);
            if (q === 0) G.moveTo(px, py);
            else G.lineTo(px, py);
          }
          if (t.state === 'agua') {
            const [px, py] = P(t.x, t.y);
            G.lineTo(px, py);
          }
        };
        path();
        G.strokeStyle = 'rgba(10, 30, 56, 0.55)';
        G.lineWidth = 5;
        G.stroke();
        path();
        G.strokeStyle = t.state === 'agua' ? TRACER_TRAIL_MOVING : TRACER_COLORS[t.state];
        G.lineWidth = 2.5;
        G.stroke();
      }
      for (const t of this.tracers.tracers) {
        const [px, py] = t.state === 'agua' ? P(t.x, t.y) : P(t.trail[t.trail.length - 2], t.trail[t.trail.length - 1]);
        G.beginPath();
        G.arc(px, py, t.state === 'agua' ? 4.5 : 3.5, 0, Math.PI * 2);
        G.fillStyle = TRACER_COLORS[t.state];
        G.fill();
        G.lineWidth = 1.5;
        G.strokeStyle = t.state === 'agua' ? '#2a78d6' : '#ffffff';
        G.stroke();
      }
    }
    if (this.hl) {
      const [px, py] = P(this.hl[0], this.hl[1]);
      G.strokeStyle = '#ffd23f';
      G.lineWidth = 3;
      G.beginPath();
      G.arc(px, py, 9, 0, Math.PI * 2);
      G.stroke();
    }
  }

  pick(clientX: number, clientY: number): Pick | null {
    const r = this.canvas.getBoundingClientRect();
    const dpr = this.canvas.width / r.width;
    const H = this.c.ny * this.c.dx;
    const x = ((clientX - r.left) * dpr - this.ox) / this.scale;
    const y = H - ((clientY - r.top) * dpr - this.oy) / this.scale;
    if (x < 0 || y < 0 || x >= this.c.nx * this.c.dx || y >= H) return null;
    const k = Math.floor(y / this.c.dx) * this.c.nx + Math.floor(x / this.c.dx);
    const di = this.c.drains.findIndex((d) => d.cell === k);
    if (di >= 0) return { kind: 'drain', index: di, x, y };
    if (this.c.building[k] >= 0) return { kind: 'building', index: this.c.building[k], x, y };
    return { kind: 'cell', k, x, y };
  }

  showHighlight(x: number | null, y = 0): void {
    this.hl = x === null ? null : [x, y];
  }

  info(): { geometries: number; textures: number; calls: number; triangles: number } {
    return { geometries: 0, textures: 0, calls: 0, triangles: 0 };
  }

  dispose(): void {
    this.canvas.remove();
  }
}
