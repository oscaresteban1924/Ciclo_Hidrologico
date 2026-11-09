// Motor de partículas sobre Canvas 2D.
// Un único bucle requestAnimationFrame mueve todas las partículas del paisaje y las dibuja
// en coordenadas de escena (la cámara se aplica como transformación). Los objetos se
// reutilizan: no se crean nodos ni objetos nuevos durante la animación.

import type { LayerId } from '../content/types';
import { ALL_LAYERS } from '../content/types';
import type { Conditions, ModelResult } from '../lab/model';
import { makeSampler, type PathSampler, type Pt } from '../lib/paths';
import {
  CLOUDS,
  CONDENSATION_LEVEL,
  CREEK,
  FEATURED_TREE,
  FIELDS_POLY,
  FLANK_POLY,
  FOREST_POLY,
  GW_LINES,
  LAKE,
  MELT_STREAMS,
  PARAMO_POLY,
  PUMP_LINES,
  PUMP_RISER,
  RIVER,
  RIVER_MOUTH,
  RUNOFF_PATHS,
  SOIL_DEPTH,
  STORM_PIPE,
  SUN_GLINT,
  WIND_LINES,
  type Rect,
  canopyTop,
  coastX,
  drawdown,
  pointInPoly,
  yFront,
  yRidge,
  yWaterTable,
} from './geometry';

type Sym = 'liq' | 'drop' | 'vap' | 'ice' | 'cld' | 'glint' | 'gw' | 'fog' | 'spark';
type Draw = 'sprite' | 'streak' | 'ripple' | 'spin' | 'bird';
type Behavior =
  | 'rise'
  | 'fall'
  | 'snow'
  | 'path'
  | 'seep'
  | 'perc'
  | 'leaf'
  | 'stay'
  | 'ripple'
  | 'condense'
  | 'drift'
  | 'fogdrop'
  | 'twinkle'
  | 'bird';

interface Particle {
  on: boolean;
  layer: LayerId;
  sym: Sym;
  draw: Draw;
  b: Behavior;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  s: number;
  alpha: number;
  phase: number;
  rot: number;
  ty: number;
  path: PathSampler | null;
  dist: number;
  speed: number;
  flag: number;
  trail: number;
  next: PathSampler | null;
}

export interface EngineParams {
  conditions: Conditions;
  model: ModelResult;
  focus: LayerId[] | 'all';
  isolate: boolean;
  wideRain: boolean;
  longRain: boolean;
  condensationStep: boolean;
  running: boolean;
  pumping: number;
  /** Intensidad de lluvia impuesta por la simulación de tormenta (0–1), si está activa. */
  stormRain: number | null;
}

export interface EngineHooks {
  cloudA?: SVGGElement | null;
  snowClip?: SVGPolygonElement | null;
  soilWet?: SVGGElement | null;
  waterTable?: SVGPathElement | null;
  fringe?: SVGPathElement | null;
  saturated?: SVGPathElement | null;
  onSnowline?: (y: number) => void;
  buildWaterTable?: (rise: number, pumping: number) => { line: string; zone: string };
  buildSnowClip?: (snowline: number) => string;
}

const POOL: Record<LayerId, number> = {
  atmos: 40,
  wind: 40,
  evap: 120,
  sublim: 30,
  cond: 70,
  fog: 70,
  transp: 80,
  intercept: 70,
  rain: 260,
  snow: 110,
  melt: 50,
  river: 90,
  runoff: 120,
  infilt: 90,
  perc: 60,
  gw: 70,
  pump: 50,
  deco: 60,
};

/** Tamaño de cada símbolo en unidades de escena. */
const SIZE: Record<Sym, [number, number]> = {
  liq: [9, 11],
  drop: [7, 10],
  vap: [12, 12],
  ice: [10, 10],
  cld: [5, 5],
  glint: [10, 4],
  gw: [11, 11],
  fog: [34, 18],
  spark: [12, 12],
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

const riverSampler = makeSampler(RIVER);
const mouthSampler = makeSampler(RIVER_MOUTH);
const creekSampler = makeSampler(CREEK);
const pipeSampler = makeSampler(STORM_PIPE);
const riserSampler = makeSampler(PUMP_RISER, false);
const meltSamplers = MELT_STREAMS.map((p) => makeSampler(p));
const windSamplers = WIND_LINES.map((p) => makeSampler(p));
const gwSamplers = GW_LINES.map((l) => ({ id: l.id, sampler: makeSampler(l.points) }));
const pumpSamplers = PUMP_LINES.map((l) => ({ id: l.id, induced: l.induced, sampler: makeSampler(l.points) }));
const runoffSamplers = RUNOFF_PATHS.map((r) => ({ zone: r.zone, sampler: makeSampler(r.points) }));
const xylemSamplers = FEATURED_TREE.xylem.map((p) => makeSampler(p));

function randomInPoly(poly: readonly Pt[]): Pt {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let i = 0; i < 30; i++) {
    const x = rnd(minX, maxX);
    const y = rnd(minY, maxY);
    if (pointInPoly(x, y, poly)) return [x, y];
  }
  return poly[0];
}

function randomInCanopy(): Pt {
  const [cx, cy, r] = pick(FEATURED_TREE.canopy);
  const a = rnd(-Math.PI, 0.3);
  const d = Math.sqrt(Math.random()) * r * 0.9;
  return [cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9];
}

/* ------------------------------------------------------------------ */
/* Símbolos prerrenderizados                                            */
/* ------------------------------------------------------------------ */

const SPRITE_SCALE = 6;

function makeSprite(sym: Sym): HTMLCanvasElement {
  const [w, h] = SIZE[sym];
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * SPRITE_SCALE);
  c.height = Math.ceil(h * SPRITE_SCALE);
  const g = c.getContext('2d')!;
  g.scale(SPRITE_SCALE, SPRITE_SCALE);
  g.translate(w / 2, h / 2);
  const dropPath = (r: number, top: number) => {
    g.beginPath();
    g.moveTo(0, -top);
    g.bezierCurveTo(r * 0.75, -top * 0.35, r, r * 0.05, r, r * 0.35);
    g.arc(0, r * 0.35, r, 0, Math.PI, false);
    g.bezierCurveTo(-r, r * 0.05, -r * 0.75, -top * 0.35, 0, -top);
    g.closePath();
  };
  switch (sym) {
    case 'liq': {
      dropPath(3.4, 5);
      g.fillStyle = '#1f78c8';
      g.fill();
      g.lineWidth = 0.9;
      g.strokeStyle = '#ffffff';
      g.stroke();
      g.beginPath();
      g.arc(-1.1, 0.4, 0.9, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fill();
      break;
    }
    case 'drop': {
      dropPath(2.4, 4.4);
      g.fillStyle = '#2a86d0';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = '#e9f4ff';
      g.stroke();
      break;
    }
    case 'gw': {
      g.beginPath();
      g.arc(0, 0, 4.8, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      dropPath(3.2, 4.4);
      g.fillStyle = '#0b4c8c';
      g.fill();
      break;
    }
    case 'vap': {
      g.beginPath();
      g.arc(0, 0, 4.4, 0, Math.PI * 2);
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(255,255,255,0.92)';
      g.stroke();
      g.lineWidth = 1.3;
      g.strokeStyle = '#5b5fc7';
      g.stroke();
      break;
    }
    case 'cld': {
      g.beginPath();
      g.arc(0, 0, 1.9, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      g.lineWidth = 0.6;
      g.strokeStyle = '#8aa0b6';
      g.stroke();
      break;
    }
    case 'ice': {
      g.lineCap = 'round';
      for (const [col, lw] of [
        ['#2f6d9f', 2.6],
        ['#ffffff', 1.3],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          g.beginPath();
          g.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
          g.lineTo(-Math.cos(a) * 5, -Math.sin(a) * 5);
          g.stroke();
        }
        // pequeñas ramas
        g.lineWidth = lw * 0.6;
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const bx = Math.cos(a) * 3.2;
          const by = Math.sin(a) * 3.2;
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + Math.cos(a + 0.8) * 1.5, by + Math.sin(a + 0.8) * 1.5);
          g.moveTo(bx, by);
          g.lineTo(bx + Math.cos(a - 0.8) * 1.5, by + Math.sin(a - 0.8) * 1.5);
          g.stroke();
        }
      }
      break;
    }
    case 'glint': {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 5);
      grad.addColorStop(0, 'rgba(240,250,255,1)');
      grad.addColorStop(1, 'rgba(240,250,255,0)');
      g.fillStyle = grad;
      g.save();
      g.scale(1, 0.35);
      g.beginPath();
      g.arc(0, 0, 5, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    }
    case 'fog': {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 17);
      grad.addColorStop(0, 'rgba(255,255,255,0.75)');
      grad.addColorStop(0.6, 'rgba(250,252,253,0.3)');
      grad.addColorStop(1, 'rgba(250,252,253,0)');
      g.fillStyle = grad;
      g.save();
      g.scale(1, 0.52);
      g.beginPath();
      g.arc(0, 0, 17, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    }
    case 'spark': {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, 5.5);
      grad.addColorStop(0, 'rgba(255,253,235,1)');
      grad.addColorStop(0.35, 'rgba(255,244,200,0.7)');
      grad.addColorStop(1, 'rgba(255,244,200,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, 5.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,240,0.9)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(-5.5, 0);
      g.lineTo(5.5, 0);
      g.moveTo(0, -3);
      g.lineTo(0, 3);
      g.stroke();
      break;
    }
  }
  return c;
}

/* ------------------------------------------------------------------ */
/* Motor                                                                */
/* ------------------------------------------------------------------ */

export class ParticleEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites = new Map<Sym, HTMLCanvasElement>();
  private pools = new Map<LayerId, Particle[]>();
  private alpha = new Map<LayerId, number>();
  private acc: Record<string, number> = {};
  private raf = 0;
  private last = 0;
  private params: EngineParams | null = null;
  private hooks: EngineHooks;
  private cam = { vb: { x: 0, y: 0, w: 1600, h: 1000 } as Rect, w: 800, h: 500, dpr: 1 };
  private snowline = 272;
  private wtRise = 0;
  private pumpLevel = 0;
  private soilWet = 0.4;
  private cloudForm = 1;
  private hookTimer = 0;
  private lastSnowClip = '';
  private lastWT = '';
  private lastCloud = '';
  private lastWet = '';
  private leafCount = 0;
  private flash = 0;
  private nextFlash = 6;
  private visible = true;
  /** Velocidad de reproducción: solo cambia el ritmo, no las condiciones. */
  private speed = 1;
  /** Densidad de partículas según la calidad visual (1 = completa). */
  private density = 1;
  private quality: 'auto' | 'alta' | 'ligera' = 'auto';
  private frameAvg = 16;
  private slowFor = 0;
  private dprCap = 2;
  /** Probabilidad de emitir en capas secundarias (atenuadas). */
  private dimRate = new Map<LayerId, number>();

  constructor(canvas: HTMLCanvasElement, hooks: EngineHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.hooks = hooks;
    (['liq', 'drop', 'vap', 'ice', 'cld', 'glint', 'gw', 'fog', 'spark'] as Sym[]).forEach((s) => this.sprites.set(s, makeSprite(s)));
    for (const layer of ALL_LAYERS) {
      const pool: Particle[] = [];
      for (let i = 0; i < POOL[layer]; i++) {
        pool.push({
          on: false, layer, sym: 'liq', draw: 'sprite', b: 'rise', x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1,
          s: 1, alpha: 1, phase: 0, rot: 0, ty: 0, path: null, dist: 0, speed: 0, flag: 0, trail: 0, next: null,
        });
      }
      this.pools.set(layer, pool);
      this.alpha.set(layer, 1);
    }
  }

  setHooks(h: EngineHooks) {
    const prev = this.hooks;
    this.hooks = h;
    // si algún elemento del dibujo se volvió a montar, se aplican de nuevo los valores actuales
    const changed = prev.cloudA !== h.cloudA || prev.snowClip !== h.snowClip || prev.soilWet !== h.soilWet || prev.waterTable !== h.waterTable || prev.saturated !== h.saturated || prev.fringe !== h.fringe;
    if (changed && this.params) this.applyHooks(true);
  }

  setSpeed(v: number) {
    this.speed = v;
  }

  /** Calidad visual: «ligera» reduce partículas y resolución; «auto» se adapta si el equipo va lento. */
  setQuality(q: 'auto' | 'alta' | 'ligera') {
    this.quality = q;
    this.density = q === 'ligera' ? 0.5 : 1;
    this.dprCap = q === 'ligera' ? 1 : 2;
    this.slowFor = 0;
    this.setCamera(this.cam.vb, this.cam.w, this.cam.h);
  }

  setCamera(vb: Rect, w: number, h: number) {
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.cam = { vb, w, h, dpr };
    if (!this.raf) this.render();
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setParams(p: EngineParams) {
    const prev = this.params;
    this.params = p;
    if (p.condensationStep && !prev?.condensationStep) this.cloudForm = 0.15;
    if (!p.condensationStep) this.cloudForm = 1;
    if (p.running && !this.raf) this.start();
    if (!p.running && this.raf) this.stop();
    if (!p.running) this.render();
    // solo se fuerza la primera vez; después, únicamente si algo cambió de verdad
    this.applyHooks(!prev);
  }

  /** Reinicia las animaciones (botón «Repetir»). */
  reset() {
    this.clear();
    if (this.params?.condensationStep) this.cloudForm = 0.15;
    for (let i = 0; i < 45; i++) this.step(0.1, true);
    this.render();
  }

  clear() {
    for (const pool of this.pools.values()) for (const pt of pool) pt.on = false;
    this.leafCount = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const tick = (t: number) => {
      const real = (t - this.last) / 1000;
      // la marca de rAF puede ser anterior a performance.now() del arranque: nunca un dt negativo
      const dt = Math.min(0.05, Math.max(0, real));
      this.last = t;
      this.adapt(real);
      this.step(dt * this.speed, false);
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Si el equipo no alcanza ~40 cuadros por segundo durante un rato, se aligera la escena. */
  private adapt(real: number) {
    if (this.quality !== 'auto' || real > 0.25) return;
    this.frameAvg += (real * 1000 - this.frameAvg) * 0.05;
    if (this.frameAvg > 25 && this.density > 0.5) {
      this.slowFor += real;
      if (this.slowFor > 3) {
        this.density = 0.55;
        this.dprCap = 1.25;
        this.slowFor = 0;
        this.setCamera(this.cam.vb, this.cam.w, this.cam.h);
      }
    } else this.slowFor = 0;
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    this.pools.clear();
  }

  /* -------------------------------------------------------------- */

  private spawn(layer: LayerId, init: Partial<Particle> & { sym: Sym; b: Behavior }): Particle | null {
    const pool = this.pools.get(layer);
    if (!pool) return null;
    // Las capas secundarias emiten mucho menos: el proceso principal se distingue con claridad
    const rate = (this.dimRate.get(layer) ?? 1) * (layer === 'deco' ? 1 : this.density);
    if (rate < 1 && !init.next && Math.random() > rate) return null;
    for (const pt of pool) {
      if (!pt.on) {
        pt.on = true;
        pt.age = 0;
        pt.vx = 0;
        pt.vy = 0;
        pt.s = 1;
        pt.alpha = 1;
        pt.phase = Math.random() * Math.PI * 2;
        pt.rot = Math.random() * Math.PI;
        pt.path = null;
        pt.next = null;
        pt.dist = 0;
        pt.speed = 0;
        pt.flag = 0;
        pt.ty = 0;
        pt.life = 1;
        pt.trail = 0;
        pt.draw = 'sprite';
        Object.assign(pt, init);
        return pt;
      }
    }
    return null;
  }

  private kill(pt: Particle) {
    if (!pt.on) return;
    pt.on = false;
    if (pt.b === 'leaf') this.leafCount = Math.max(0, this.leafCount - 1);
  }

  private emit(key: string, rate: number, dt: number, fn: () => void) {
    if (rate <= 0) {
      this.acc[key] = 0;
      return;
    }
    this.acc[key] = (this.acc[key] ?? Math.random()) + rate * dt;
    let guard = 0;
    while (this.acc[key] >= 1 && guard++ < 24) {
      this.acc[key] -= 1;
      fn();
    }
  }

  private step(dt: number, warm: boolean) {
    const p = this.params;
    if (!p) return;
    const c = p.conditions;
    const m = p.model;
    const solarIdx = [0.35, 0.65, 1][c.solar];
    const windIdx = [0.35, 0.65, 1][c.wind];
    const windVx = 8 + windIdx * 34;
    const rainIdx = p.stormRain ?? [0, 0.35, 0.65, 1][c.rain];
    const veg = c.vegetation;

    // ---- Opacidad de cada capa (resaltar sin ocultar el contexto)
    for (const layer of ALL_LAYERS) {
      const focused = p.focus === 'all' || p.focus.includes(layer) || (layer === 'deco' && !p.isolate);
      const target = focused ? 1 : p.isolate ? 0.04 : 0.2;
      this.dimRate.set(layer, focused ? 1 : p.isolate ? 0 : 0.3);
      const cur = this.alpha.get(layer)!;
      this.alpha.set(layer, warm ? target : cur + (target - cur) * Math.min(1, dt * 4));
    }

    // ---- Estados lentos
    const snowTarget = [314, 272, 238][c.temperature] + (rainIdx > 0 && c.temperature < 2 ? 10 * rainIdx : 0);
    this.snowline += (snowTarget - this.snowline) * Math.min(1, dt * 0.25);
    const wtTarget = m.idx.waterTableRise * (p.longRain ? 1.25 : 1);
    this.wtRise += (wtTarget - this.wtRise) * Math.min(1, dt * 0.18);
    this.pumpLevel += (p.pumping - this.pumpLevel) * Math.min(1, dt * 0.35);
    this.soilWet += (m.idx.soil - this.soilWet) * Math.min(1, dt * 0.3);
    if (p.condensationStep) this.cloudForm = Math.min(1, this.cloudForm + dt * 0.07);

    // ---- Evaporación
    const evapRate = 0.2 + m.idx.evaporacion * 0.8;
    this.emit('evapOcean', 8.5 * evapRate, dt, () => {
      const y = rnd(500, 760);
      const x = rnd(-60, coastX(y) - 12);
      this.spawn('evap', { sym: 'vap', b: 'rise', x, y, vx: windVx * 0.6, vy: -rnd(22, 34), life: rnd(5, 8), s: rnd(0.75, 1.15) });
    });
    this.emit('evapLake', 3.4 * evapRate, dt, () => {
      const a = rnd(0, Math.PI * 2);
      const r = Math.sqrt(Math.random());
      this.spawn('evap', { sym: 'vap', b: 'rise', x: LAKE.cx + Math.cos(a) * LAKE.rx * r * 0.9, y: LAKE.cy + Math.sin(a) * LAKE.ry * r * 0.8, vx: windVx * 0.5, vy: -rnd(18, 28), life: rnd(4, 6.5), s: rnd(0.7, 1) });
    });
    this.emit('evapRiver', 1.4 * evapRate, dt, () => {
      const pos = riverSampler.at(rnd(0, riverSampler.length));
      this.spawn('evap', { sym: 'vap', b: 'rise', x: pos.x, y: pos.y, vx: windVx * 0.5, vy: -rnd(16, 24), life: rnd(3.5, 5.5), s: 0.72 });
    });
    this.emit('evapSoil', 4 * m.idx.evaporacion * (0.3 + this.soilWet), dt, () => {
      const [x, y] = Math.random() < 0.5 ? randomInPoly(FIELDS_POLY) : randomInPoly(FOREST_POLY);
      this.spawn('evap', { sym: 'vap', b: 'rise', x, y, vx: windVx * 0.5, vy: -rnd(14, 22), life: rnd(3, 5), s: 0.66 });
    });

    // Vapor disperso en la atmósfera
    this.emit('atmos', 1.5, dt, () => {
      this.spawn('atmos', { sym: 'vap', b: 'rise', x: rnd(-100, 1400), y: rnd(120, 420), vx: windVx, vy: -rnd(1, 4), life: rnd(8, 12), s: rnd(0.55, 0.85) });
    });

    // Transporte por el viento
    this.emit('wind', 1.4 + windIdx * 2, dt, () => {
      const sm = pick(windSamplers);
      this.spawn('wind', { sym: 'vap', b: 'path', path: sm, dist: rnd(0, sm.length * 0.3), speed: 50 + windIdx * 110, life: 99, s: 0.85 });
    });

    // Condensación: el vapor cruza el nivel de condensación y se vuelve gota de nube
    this.emit('cond', p.condensationStep ? 8 : 4, dt, () => {
      this.spawn('cond', { sym: 'vap', b: 'condense', x: rnd(480, 640), y: rnd(360, 430), vx: windVx * 0.2, vy: -rnd(26, 36), life: 14, s: 0.9 });
    });
    this.emit('cloudDrops', 7, dt, () => {
      const cl = Math.random() < 0.55 ? CLOUDS[0] : CLOUDS[1];
      const [cx, cy, r] = pick(cl.circles);
      const a = rnd(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * r * 0.8;
      this.spawn('cond', { sym: 'cld', b: 'stay', x: cx + Math.cos(a) * d, y: Math.min(cl.base - 4, cy + Math.sin(a) * d), life: rnd(1.5, 2.6), s: rnd(0.8, 1.4) });
    });

    // Niebla del páramo y del bosque de niebla: la vegetación atrapa sus gotas
    const fogRate = (0.35 + this.soilWet * 0.5) * (c.solar === 2 ? 0.6 : 1);
    this.emit('fogBlob', 1.4 * fogRate, dt, () => {
      const [x, y] = randomInPoly(PARAMO_POLY);
      this.spawn('fog', { sym: 'fog', b: 'drift', x: x - 80, y: y + rnd(-10, 30), vx: windVx * 0.55, vy: rnd(-2, 1), life: rnd(7, 11), s: rnd(1, 1.8) });
    });
    this.emit('fogDrop', 6 * fogRate, dt, () => {
      const [x, y] = Math.random() < 0.6 ? randomInPoly(PARAMO_POLY) : randomInPoly(FLANK_POLY);
      this.spawn('fog', { sym: 'cld', b: 'fogdrop', x: x - 30, y: y - rnd(6, 14), vx: windVx * 0.7, vy: 0, life: rnd(1.6, 3), s: 1.1, ty: y });
    });

    // Lluvia
    const canopyFull = this.leafCount >= [0, 16, 30][veg];
    this.emit('rain', 120 * rainIdx * (p.longRain ? 1.2 : 1), dt, () => {
      const wide = p.wideRain && Math.random() < 0.45;
      const x = wide ? rnd(470, 660) : rnd(950, 1155);
      const y = wide ? 262 : 244;
      let ty: number;
      let flag = 0;
      const ct = canopyTop(x);
      if (!wide && ct !== null && veg > 0 && Math.random() < (veg === 2 ? 0.75 : 0.45)) {
        ty = ct + rnd(2, 14);
        flag = 1;
      } else {
        const front = yFront(x);
        ty = rnd(Math.max(520, front - 90), front - 3);
      }
      this.spawn('rain', { sym: 'drop', draw: 'streak', b: 'fall', x, y: y + rnd(-6, 6), vx: windVx * 0.35, vy: rnd(480, 560), ty, flag, life: 3, s: rnd(0.8, 1.15) });
    });

    // Resplandor suave dentro de la nube de tormenta (sin destellos intermitentes)
    if (rainIdx >= 0.95 && !warm) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) {
        this.flash = 1;
        this.nextFlash = rnd(8, 13);
      }
    }
    this.flash = Math.max(0, this.flash - dt * 1.1);

    // Nieve
    const snowRate = rainIdx > 0 ? 17 * (0.45 + rainIdx * 0.55) * [1.2, 1, 0.35][c.temperature] : 0;
    this.emit('snow', snowRate, dt, () => {
      const x = rnd(1380, 1620);
      const ridge = yRidge(x);
      this.spawn('snow', { sym: 'ice', draw: 'spin', b: 'snow', x, y: rnd(98, 112), vx: windVx * 0.25, vy: rnd(36, 50), ty: ridge + rnd(6, Math.max(12, this.snowline - ridge)), life: 12, s: rnd(0.75, 1.15) });
    });

    // Fusión
    const melt = [0.12, 0.5, 1][c.temperature] * (0.55 + 0.45 * solarIdx);
    this.emit('melt', 8 * melt, dt, () => {
      const sm = pick(meltSamplers);
      this.spawn('melt', { sym: 'liq', b: 'path', path: sm, speed: rnd(80, 110), life: 99, s: 0.72 });
    });

    // Sublimación
    const sub = solarIdx * [1, 0.7, 0.4][c.temperature] * (0.6 + windIdx * 0.4);
    this.emit('sublim', 3.4 * sub, dt, () => {
      const x = rnd(1380, 1580);
      const ridge = yRidge(x);
      const y = ridge + rnd(4, Math.max(8, this.snowline - ridge - 6));
      this.spawn('sublim', { sym: 'vap', b: 'rise', x, y, vx: windVx * 0.4, vy: -rnd(12, 20), life: rnd(3, 4.5), s: 0.78 });
    });

    // Transpiración
    const transp = m.idx.transpiracion;
    if (veg > 0) {
      this.emit('xylem', 2.5 + transp * 6, dt, () => {
        const sm = pick(xylemSamplers);
        this.spawn('transp', { sym: 'liq', b: 'path', path: sm, speed: rnd(36, 48), life: 99, s: 0.58, flag: 1 });
      });
    }
    this.emit('canopyVapor', 7 * transp, dt, () => {
      if (Math.random() < (veg === 0 ? 0 : 0.45)) {
        const [x, y] = randomInCanopy();
        this.spawn('transp', { sym: 'vap', b: 'rise', x, y, vx: windVx * 0.4, vy: -rnd(16, 26), life: rnd(3, 4.5), s: 0.72 });
      } else {
        const [x, y] = Math.random() < 0.6 ? randomInPoly(FOREST_POLY) : randomInPoly(FLANK_POLY);
        if (Math.random() < [0.2, 0.6, 1][veg]) {
          this.spawn('transp', { sym: 'vap', b: 'rise', x, y: y - rnd(16, 40), vx: windVx * 0.4, vy: -rnd(16, 24), life: rnd(2.5, 4), s: 0.62 });
        }
      }
    });

    if (rainIdx > 0 && canopyFull) {
      this.emit('throughfall', 6 * rainIdx, dt, () => this.dripFromCanopy());
    }

    // Infiltración
    const infil = p.stormRain !== null ? Math.min(1, rainIdx * 1.2) * (m.idx.infiltracion > 0 ? 1 : 0.3) : m.idx.infiltracion * (p.longRain ? 1.3 : 1);
    this.emit('infilt', 26 * infil, dt, () => {
      const zone = Math.random();
      let x: number;
      if (zone < 0.62) x = rnd(860, 1240);
      else if (zone < 0.85) {
        if (c.surface === 2) return;
        x = rnd(480, 800);
        if (c.surface === 1 && ((x > 560 && x < 620) || (x > 680 && x < 740))) return;
      } else x = rnd(1290, 1560);
      const y = yFront(x) + 1;
      this.spawn('infilt', { sym: 'gw', b: 'seep', x, y, vy: rnd(18, 26), life: 30, s: 0.72, ty: yFront(x) + SOIL_DEPTH });
    });

    // Escorrentía
    const run = m.idx.escorrentia;
    if (run > 0.01) {
      for (const [i, r] of runoffSamplers.entries()) {
        let w = 1;
        if (r.zone === 'town') w = 0.35 + (c.surface / 2) * 0.9;
        if (r.zone === 'forest') w = 1.1 - veg * 0.35;
        if (r.zone === 'front') w = 0.8 + c.soilMoisture * 0.3;
        this.emit(`run${i}`, 6 * run * w, dt, () => {
          this.spawn('runoff', { sym: 'liq', b: 'path', path: r.sampler, speed: rnd(120, 170), life: 99, s: 0.72 });
        });
      }
      if (c.surface >= 1) {
        this.emit('pipe', 5 * run * (0.5 + c.surface * 0.4), dt, () => {
          this.spawn('runoff', { sym: 'liq', b: 'path', path: pipeSampler, speed: rnd(130, 160), life: 99, s: 0.6 });
        });
      }
    }

    // Flujo subterráneo (con estela que muestra la dirección)
    for (const g of gwSamplers) {
      this.emit(`gw-${g.id}`, 0.26 + this.wtRise * 0.15, dt, () => {
        this.spawn('gw', { sym: 'gw', b: 'path', path: g.sampler, speed: rnd(12, 16), life: 999, s: 0.85, trail: 34, dist: warm ? rnd(0, g.sampler.length) : 0 });
      });
    }

    // Bombeo: el pozo atrae agua desde todas las direcciones
    if (this.pumpLevel > 0.08) {
      for (const g of pumpSamplers) {
        if (g.induced && this.pumpLevel < 1.5) continue;
        this.emit(`pump-${g.id}`, 0.5 * this.pumpLevel, dt, () => {
          this.spawn('pump', { sym: 'gw', b: 'path', path: g.sampler, speed: rnd(18, 24) * (0.7 + this.pumpLevel * 0.3), life: 999, s: 0.85, trail: 30, next: riserSampler, dist: warm ? rnd(0, g.sampler.length) : 0 });
        });
      }
    }

    // Río, arroyo y desembocadura
    const riverIdx = m.idx.rio;
    this.emit('river', 4 + riverIdx * 10, dt, () => {
      this.spawn('river', { sym: 'glint', b: 'path', path: riverSampler, speed: 70 + riverIdx * 90, life: 99, s: rnd(0.7, 1.15), dist: warm ? rnd(0, riverSampler.length) : 0 });
    });
    this.emit('creek', 2, dt, () => {
      this.spawn('river', { sym: 'glint', b: 'path', path: creekSampler, speed: 46, life: 99, s: 0.6 });
    });
    this.emit('mouth', 1.2 + riverIdx * 2, dt, () => {
      this.spawn('river', { sym: 'glint', b: 'path', path: mouthSampler, speed: 60, life: 99, s: 0.8 });
    });

    // Decoración: destellos del sol en el mar y aves
    this.emit('spark', 5 * solarIdx, dt, () => {
      const y = rnd(SUN_GLINT.y0, SUN_GLINT.y1);
      const k = (y - SUN_GLINT.y0) / (SUN_GLINT.y1 - SUN_GLINT.y0);
      const x = rnd(SUN_GLINT.x0 + 20 - k * 40, SUN_GLINT.x1 - 40 + k * 20);
      this.spawn('deco', { sym: 'spark', b: 'twinkle', x, y, life: rnd(0.6, 1.4), s: 0.5 + k * 0.7 });
    });
    this.emit('bird', rainIdx > 0.6 ? 0 : 0.05, dt, () => {
      const y0 = rnd(180, 330);
      for (let k = 0; k < 3; k++) {
        this.spawn('deco', { sym: 'spark', draw: 'bird', b: 'bird', x: -60 - k * 22, y: y0 + k * 9 * (k % 2 ? 1 : -0.6), vx: rnd(60, 74), vy: rnd(-4, 1), life: 30, s: 0.9 - k * 0.1 });
      }
    });

    // ---- Actualización
    for (const pool of this.pools.values()) {
      for (const pt of pool) {
        if (!pt.on) continue;
        pt.age += dt;
        switch (pt.b) {
          case 'rise': {
            pt.x += (pt.vx + Math.sin(pt.age * 2 + pt.phase) * 6) * dt;
            pt.y += pt.vy * dt;
            const t = pt.age / pt.life;
            pt.alpha = t < 0.12 ? t / 0.12 : t > 0.6 ? Math.max(0, 1 - (t - 0.6) / 0.4) : 1;
            if (pt.age >= pt.life) this.kill(pt);
            break;
          }
          case 'drift': {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            const t = pt.age / pt.life;
            pt.alpha = Math.sin(Math.min(1, t) * Math.PI) * 0.75;
            if (pt.age >= pt.life) this.kill(pt);
            break;
          }
          case 'fogdrop': {
            if (pt.flag === 0) {
              pt.x += pt.vx * dt;
              pt.y += Math.sin(pt.age * 3 + pt.phase) * 4 * dt;
              pt.alpha = Math.min(1, pt.age / 0.4);
              if (pt.age > pt.life) {
                // la vegetación atrapa la gota: se vuelve agua líquida y gotea
                pt.flag = 1;
                pt.age = 0;
                pt.sym = 'liq';
                pt.s = 0.55;
                pt.vy = 0;
              }
            } else {
              pt.vy += 60 * dt;
              pt.y += pt.vy * dt;
              pt.alpha = Math.max(0, 1 - pt.age / 0.9);
              if (pt.age > 0.9) this.kill(pt);
            }
            break;
          }
          case 'condense': {
            pt.x += (pt.vx + Math.sin(pt.age * 2 + pt.phase) * 5) * dt;
            if (pt.flag === 0) {
              pt.y += pt.vy * dt;
              pt.alpha = Math.min(1, pt.age / 0.4);
              if (pt.y <= CONDENSATION_LEVEL) {
                pt.flag = 1;
                pt.age = 0;
                pt.sym = 'cld';
                pt.s = 1.3;
              }
            } else {
              pt.y += -6 * dt;
              pt.alpha = pt.age < 2 ? 1 : Math.max(0, 1 - (pt.age - 2) / 1.2);
              if (pt.age > 3.2) this.kill(pt);
            }
            if (pt.age > pt.life) this.kill(pt);
            break;
          }
          case 'fall': {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.alpha = 1;
            if (pt.y >= pt.ty) {
              if (pt.flag === 1) this.toLeaf(pt);
              else {
                this.ripple(pt.layer, pt.x, pt.ty);
                this.kill(pt);
              }
            }
            break;
          }
          case 'snow': {
            pt.x += (pt.vx + Math.sin(pt.age * 1.6 + pt.phase) * 14) * dt;
            pt.y += pt.vy * dt;
            pt.rot += dt * 1.2;
            pt.alpha = 1;
            if (pt.y >= pt.ty) {
              pt.b = 'stay';
              pt.age = 0;
              pt.life = rnd(1.2, 2.2);
            }
            break;
          }
          case 'stay': {
            const t = pt.age / pt.life;
            pt.alpha = t < 0.2 ? t / 0.2 : Math.max(0, 1 - (t - 0.2) / 0.8);
            if (pt.age >= pt.life) this.kill(pt);
            break;
          }
          case 'leaf': {
            pt.alpha = Math.min(1, pt.age / 0.3);
            const raining = rainIdx > 0;
            if (pt.age >= pt.life || (!raining && pt.age > 1.2 && Math.random() < dt * 0.6)) {
              const evapChance = 0.35 + solarIdx * 0.4 - (raining ? 0.25 : 0);
              if (Math.random() < evapChance) {
                this.spawn('intercept', { sym: 'vap', b: 'rise', x: pt.x, y: pt.y, vx: windVx * 0.4, vy: -rnd(16, 24), life: rnd(2.5, 3.5), s: 0.72 });
              } else {
                this.spawn('intercept', { sym: 'drop', draw: 'streak', b: 'fall', x: pt.x, y: pt.y + 4, vy: rnd(170, 230), ty: yFront(pt.x) - rnd(3, 14), life: 3, s: 0.75 });
              }
              this.kill(pt);
            }
            break;
          }
          case 'path': {
            if (!pt.path) {
              this.kill(pt);
              break;
            }
            pt.dist += pt.speed * dt;
            const pos = pt.path.at(pt.dist);
            pt.x = pos.x;
            pt.y = pos.y;
            const L = pt.path.length;
            const fadeIn = Math.min(1, pt.dist / 20);
            const fadeOut = Math.min(1, (L - pt.dist) / 24);
            pt.alpha = pt.next ? Math.min(1, fadeIn) : Math.max(0, Math.min(fadeIn, fadeOut));
            if (pt.dist >= L) {
              if (pt.layer === 'transp' && pt.flag === 1) {
                this.spawn('transp', { sym: 'vap', b: 'rise', x: pt.x, y: pt.y, vx: windVx * 0.4, vy: -rnd(18, 26), life: rnd(3, 4), s: 0.78 });
              }
              if (pt.next) {
                // del acuífero sube por el pozo hasta la superficie
                pt.path = pt.next;
                pt.next = null;
                pt.dist = 0;
                pt.speed = 90;
                pt.trail = 0;
                break;
              }
              this.kill(pt);
            }
            break;
          }
          case 'seep': {
            pt.y += pt.vy * dt;
            pt.x += Math.sin(pt.age * 3 + pt.phase) * 4 * dt;
            pt.alpha = Math.min(1, pt.age / 0.3);
            if (pt.y >= pt.ty) {
              const share = m.infiltration > 0 ? m.percolation / m.infiltration : 0.3;
              if (Math.random() < share) {
                const wt = yWaterTable(pt.x) - this.wtRise * 12 * this.bump(pt.x) + drawdown(pt.x, this.pumpLevel);
                this.spawn('perc', { sym: 'gw', b: 'perc', x: pt.x, y: pt.y, vy: rnd(10, 15), ty: wt, life: 60, s: 0.72 });
                this.kill(pt);
              } else {
                pt.b = 'stay';
                pt.age = 0;
                pt.life = rnd(3, 5);
              }
            }
            break;
          }
          case 'perc': {
            pt.y += pt.vy * dt;
            pt.x += Math.sin(pt.age * 2.4 + pt.phase) * 9 * dt;
            pt.alpha = 1;
            if (pt.y >= pt.ty) {
              this.ripple('perc', pt.x, pt.ty, true);
              this.kill(pt);
            }
            break;
          }
          case 'ripple': {
            const t = Math.min(1, Math.max(0, pt.age / pt.life));
            pt.s = 0.5 + t * 1.8;
            pt.alpha = Math.max(0, 1 - t);
            if (pt.age >= pt.life) this.kill(pt);
            break;
          }
          case 'twinkle': {
            const t = pt.age / pt.life;
            pt.alpha = Math.sin(t * Math.PI);
            if (pt.age >= pt.life) this.kill(pt);
            break;
          }
          case 'bird': {
            pt.x += pt.vx * dt;
            pt.y += (pt.vy + Math.sin(pt.age * 1.3 + pt.phase) * 4) * dt;
            pt.alpha = Math.min(1, pt.age / 1.5);
            if (pt.x > 1750 || pt.age > pt.life) this.kill(pt);
            break;
          }
        }
      }
    }

    if (!warm) {
      this.hookTimer += dt;
      if (this.hookTimer > 0.12) {
        this.hookTimer = 0;
        this.applyHooks(false);
      }
    }
  }

  private bump(x: number) {
    return Math.exp(-(((x - 1020) / 300) ** 2));
  }

  private toLeaf(pt: Particle) {
    const veg = this.params?.conditions.vegetation ?? 0;
    const cap = [0, 16, 30][veg];
    if (this.leafCount >= cap) {
      pt.flag = 0;
      pt.ty = yFront(pt.x) - rnd(3, 14);
      pt.vy *= 0.6;
      return;
    }
    const [x, y] = randomInCanopy();
    this.kill(pt);
    const leaf = this.spawn('intercept', { sym: 'liq', b: 'leaf', x, y, life: rnd(5, 10), s: 0.82 });
    if (leaf) this.leafCount++;
  }

  private dripFromCanopy() {
    const [x, y] = randomInCanopy();
    this.spawn('intercept', { sym: 'drop', draw: 'streak', b: 'fall', x, y: y + 6, vy: rnd(170, 230), ty: yFront(x) - rnd(3, 14), life: 3, s: 0.7 });
  }

  private ripple(layer: LayerId, x: number, y: number, always = false) {
    if (!always && Math.random() < 0.45) return;
    this.spawn(layer, { sym: 'liq', draw: 'ripple', b: 'ripple', x, y, life: 0.55, s: 0.5 });
  }

  /* -------------------------------------------------------------- */
  /* Dibujo                                                           */
  /* -------------------------------------------------------------- */

  private render() {
    const g = this.ctx;
    const { vb, w, h, dpr } = this.cam;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.visible || !this.params) return;
    const sc = Math.min(w / vb.w, h / vb.h);
    const ox = (w - vb.w * sc) / 2;
    const oy = (h - vb.h * sc) / 2;
    g.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox - vb.x * sc), dpr * (oy - vb.y * sc));
    // margen para no dibujar fuera de cuadro
    const x0 = vb.x - 40;
    const x1 = vb.x + vb.w + 40;
    const y0 = vb.y - 40;
    const y1 = vb.y + vb.h + 40;

    // resplandor de tormenta dentro de la nube
    if (this.flash > 0.01) {
      const k = this.flash < 0.85 ? this.flash / 0.85 : (1 - this.flash) / 0.15;
      const grad = g.createRadialGradient(1060, 205, 4, 1060, 205, 120);
      grad.addColorStop(0, `rgba(255,250,220,${(0.55 * k).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255,250,220,0)');
      g.globalAlpha = this.alpha.get('rain') ?? 1;
      g.fillStyle = grad;
      g.fillRect(940, 90, 240, 240);
    }

    for (const layer of ALL_LAYERS) {
      const la = this.alpha.get(layer) ?? 1;
      if (la < 0.01) continue;
      const pool = this.pools.get(layer)!;

      // 1) estelas (flujo subterráneo y bombeo)
      if (layer === 'gw' || layer === 'pump') {
        g.globalAlpha = la * 0.38;
        g.strokeStyle = '#0b4c8c';
        g.lineWidth = 3;
        g.lineCap = 'round';
        g.beginPath();
        for (const pt of pool) {
          if (!pt.on || !pt.path || pt.trail <= 0) continue;
          const steps = 6;
          let started = false;
          for (let k = 0; k <= steps; k++) {
            const d = pt.dist - pt.trail + (pt.trail * k) / steps;
            if (d < 0) continue;
            const pos = pt.path.at(d);
            if (!started) {
              g.moveTo(pos.x, pos.y);
              started = true;
            } else g.lineTo(pos.x, pos.y);
          }
        }
        g.stroke();
      }

      // 2) trazos de lluvia (inclinados por el viento)
      g.lineCap = 'round';
      let streaks = false;
      for (const pt of pool) {
        if (pt.on && pt.draw === 'streak') {
          streaks = true;
          break;
        }
      }
      if (streaks) {
        g.globalAlpha = la * 0.85;
        g.strokeStyle = '#2a7fc6';
        g.lineWidth = 1.6;
        g.beginPath();
        for (const pt of pool) {
          if (!pt.on || pt.draw !== 'streak') continue;
          if (pt.x < x0 || pt.x > x1 || pt.y < y0 || pt.y > y1) continue;
          const k = 0.022 * pt.s;
          g.moveTo(pt.x - pt.vx * k, pt.y - pt.vy * k);
          g.lineTo(pt.x, pt.y);
        }
        g.stroke();
      }

      // 3) salpicaduras
      g.lineWidth = 1;
      g.strokeStyle = '#1f78c8';
      for (const pt of pool) {
        if (!pt.on || pt.draw !== 'ripple') continue;
        g.globalAlpha = la * pt.alpha * 0.9;
        g.beginPath();
        const rs = Math.max(0.05, pt.s);
        g.ellipse(pt.x, pt.y, 4.5 * rs, 1.7 * rs, 0, 0, Math.PI * 2);
        g.stroke();
      }

      // 4) aves
      g.strokeStyle = '#33465a';
      g.lineWidth = 1.5;
      for (const pt of pool) {
        if (!pt.on || pt.draw !== 'bird') continue;
        const flap = Math.sin(pt.age * 9 + pt.phase) * 2.5 * pt.s;
        g.globalAlpha = la * pt.alpha * 0.8;
        g.beginPath();
        g.moveTo(pt.x - 6 * pt.s, pt.y - flap);
        g.quadraticCurveTo(pt.x - 3 * pt.s, pt.y - 3 * pt.s, pt.x, pt.y);
        g.quadraticCurveTo(pt.x + 3 * pt.s, pt.y - 3 * pt.s, pt.x + 6 * pt.s, pt.y - flap);
        g.stroke();
      }

      // 5) símbolos
      for (const pt of pool) {
        if (!pt.on || (pt.draw !== 'sprite' && pt.draw !== 'spin')) continue;
        if (pt.x < x0 || pt.x > x1 || pt.y < y0 || pt.y > y1) continue;
        const a = la * pt.alpha;
        if (a < 0.01) continue;
        const img = this.sprites.get(pt.sym)!;
        const [sw, sh] = SIZE[pt.sym];
        const ww = sw * pt.s;
        const hh = sh * pt.s;
        g.globalAlpha = a;
        if (pt.draw === 'spin') {
          g.save();
          g.translate(pt.x, pt.y);
          g.rotate(pt.rot);
          g.drawImage(img, -ww / 2, -hh / 2, ww, hh);
          g.restore();
        } else {
          g.drawImage(img, pt.x - ww / 2, pt.y - hh / 2, ww, hh);
        }
      }
    }
    g.globalAlpha = 1;
  }

  private applyHooks(force: boolean) {
    const h = this.hooks;
    const ca = (0.25 + 0.75 * this.cloudForm).toFixed(2);
    if (h.cloudA && (force || ca !== this.lastCloud)) {
      h.cloudA.style.opacity = ca;
      this.lastCloud = ca;
    }
    const sw = Math.max(0.05, Math.min(1, this.soilWet)).toFixed(2);
    if (h.soilWet && (force || sw !== this.lastWet)) {
      h.soilWet.style.opacity = sw;
      this.lastWet = sw;
    }
    if (h.snowClip && h.buildSnowClip) {
      const pts = h.buildSnowClip(Math.round(this.snowline));
      if (force || pts !== this.lastSnowClip) {
        h.snowClip.setAttribute('points', pts);
        this.lastSnowClip = pts;
        h.onSnowline?.(this.snowline);
      }
    }
    if (h.buildWaterTable && h.waterTable && h.saturated) {
      const r = Math.round(this.wtRise * 40) / 40;
      const pl = Math.round(this.pumpLevel * 40) / 40;
      const key = `${r}|${pl}`;
      if (force || key !== this.lastWT) {
        const { line, zone } = h.buildWaterTable(r, pl);
        h.waterTable.setAttribute('d', line);
        h.fringe?.setAttribute('d', line);
        h.saturated.setAttribute('d', zone);
        this.lastWT = key;
      }
    }
  }
}
