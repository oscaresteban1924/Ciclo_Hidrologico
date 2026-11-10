// Texturas procedimentales (sin archivos externos): fachada de ladrillo, fachada pintada y vidrio.
// Cada textura representa un módulo de 3 m de ancho por un piso de alto (se repite con las UV).

import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D no disponible');
  return [c, g];
}

function window_(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame: string, glass: string) {
  g.fillStyle = frame;
  g.fillRect(x - 3, y - 3, w + 6, h + 6);
  g.fillStyle = glass;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x, y, w, h * 0.35);
  g.fillStyle = frame;
  g.fillRect(x + w / 2 - 1.5, y, 3, h);
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Ladrillo a la vista con ventana: el rasgo más común de las laderas de Medellín. */
export function brickTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#a4553a';
  g.fillRect(0, 0, 256, 256);
  const rows = 22;
  const bh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? 0 : 12;
    for (let x = -24 + off; x < 256; x += 24) {
      const v = 0.85 + ((r * 7 + x * 3) % 11) / 55;
      g.fillStyle = `rgb(${Math.round(170 * v)},${Math.round(86 * v)},${Math.round(58 * v)})`;
      g.fillRect(x + 1, r * bh + 1, 22, bh - 2);
    }
  }
  g.fillStyle = 'rgba(70,40,30,0.35)';
  g.fillRect(0, 242, 256, 14); // placa de entrepiso
  window_(g, 70, 70, 116, 104, '#e9e2d4', '#2f4656');
  return finish(c);
}

/** Fachada pintada (se multiplica por el color de cada casa). */
export function plasterTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, 256, 256);
  for (let q = 0; q < 900; q++) {
    g.fillStyle = `rgba(0,0,0,${0.015 + ((q * 37) % 10) / 600})`;
    g.fillRect((q * 53) % 256, (q * 97) % 256, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 240, 256, 16);
  window_(g, 64, 66, 128, 108, '#ffffff', '#33495a');
  g.fillStyle = 'rgba(40,40,40,0.55)';
  for (let x = 60; x < 196; x += 10) g.fillRect(x, 186, 3, 26); // reja del balcón
  g.fillRect(56, 184, 144, 4);
  return finish(c);
}

/** Vidrio y concreto para torres y edificios institucionales. */
export function glassTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#cfd6da';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3b5566';
  g.fillRect(12, 40, 232, 176);
  g.fillStyle = 'rgba(255,255,255,0.22)';
  g.fillRect(12, 40, 232, 60);
  g.fillStyle = '#cfd6da';
  for (let x = 12; x < 244; x += 58) g.fillRect(x, 40, 4, 176);
  return finish(c);
}

/** Textura de techo de concreto con manchas. */
export function roofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8f8a82';
  g.fillRect(0, 0, 128, 128);
  for (let q = 0; q < 300; q++) {
    g.fillStyle = `rgba(${q % 2 ? 60 : 200},${q % 2 ? 55 : 190},${q % 2 ? 50 : 180},0.06)`;
    g.beginPath();
    g.arc((q * 29) % 128, (q * 71) % 128, 2 + (q % 7), 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

// ---------------------------------------------------------------- atlas de fachadas de barrio
// Módulos de 3 m de ancho por un piso de alto, dibujados a mano (sin archivos externos). Cada fachada
// de los edificios del sector se arma con módulos: ladrillo a la vista, frente pañetado y pintado,
// ventanas con reja o con marco de aluminio, balcones con baranda, locales con aviso y persiana
// metálica, puertas, garajes, bloques calados y pisos en obra gris. Los nombres de los avisos son
// genéricos (no son marcas ni negocios reales).

export type TileId =
  | 'bWinReja' | 'bWinAlu' | 'bSmall' | 'bBalcon' | 'bBlank' | 'bCalado' | 'gWin' | 'gBlank'
  | 'bDoor' | 'bShopA' | 'bShopB' | 'bShutA' | 'bShutB' | 'bGarage' | 'bWinLow' | 'zocalo'
  | 'pWinReja' | 'pWinAlu' | 'pSmall' | 'pBalcon' | 'pBlank' | 'pWinReja2' | 'pPlants' | 'roofSheet'
  | 'pDoor' | 'pShopA' | 'pShopB' | 'pShutA' | 'pShutB' | 'pGarage' | 'pWinLow' | 'pShopC';

const TILE_ORDER: TileId[] = [
  'bWinReja', 'bWinAlu', 'bSmall', 'bBalcon', 'bBlank', 'bCalado', 'gWin', 'gBlank',
  'bDoor', 'bShopA', 'bShopB', 'bShutA', 'bShutB', 'bGarage', 'bWinLow', 'zocalo',
  'pWinReja', 'pWinAlu', 'pSmall', 'pBalcon', 'pBlank', 'pWinReja2', 'pPlants', 'roofSheet',
  'pDoor', 'pShopA', 'pShopB', 'pShutA', 'pShutB', 'pGarage', 'pWinLow', 'pShopC',
];

export interface FacadeAtlas {
  map: THREE.CanvasTexture;
  /** Blanco = muro (se tiñe con el color de la casa); negro = ventanas, puertas, avisos y rejas. */
  mask: THREE.CanvasTexture;
  /** Rectángulo UV [u0, v0, u1, v1] del módulo (v0 abajo). */
  uv(id: TileId): [number, number, number, number];
}

export function facadeAtlas(): FacadeAtlas {
  const T = 256, COLS = 8, ROWS = 4;
  const [c, g] = canvas(T * COLS, T * ROWS);
  const [cm, m] = canvas((T * COLS) / 2, (T * ROWS) / 2);
  m.scale(0.5, 0.5);
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const rect = (x: number, y: number, w: number, h: number, col: string, wall = false) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
    m.fillStyle = wall ? '#fff' : '#000';
    m.fillRect(x, y, w, h);
  };
  const ink = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const brickWall = (ox: number, oy: number, h = T) => {
    rect(ox, oy, T, h, '#bfa58e', true); // mortero
    const bh = 9.4, bw = 26;
    for (let r = 0; r * bh < h; r++) {
      const off = r % 2 ? 0 : bw / 2;
      for (let x = -bw + off; x < T; x += bw) {
        let v = 0.84 + rand() * 0.26;
        if (rand() < 0.05) v *= 0.75; // ladrillo quemado
        g.fillStyle = `rgb(${Math.round(168 * v)},${Math.round(86 * v)},${Math.round(56 * v)})`;
        const x0 = Math.max(ox, ox + x + 1), x1 = Math.min(ox + T, ox + x + bw - 1);
        if (x1 > x0) g.fillRect(x0, oy + r * bh + 1, x1 - x0, Math.min(bh - 2, h - r * bh - 1));
      }
    }
  };
  const plasterWall = (ox: number, oy: number, h = T) => {
    rect(ox, oy, T, h, '#f3efe6', true);
    for (let q = 0; q < 500; q++) {
      g.fillStyle = `rgba(0,0,0,${0.015 + rand() * 0.03})`;
      g.fillRect(ox + rand() * T, oy + rand() * h, 2, 2);
    }
    // manchas de humedad abajo y escurrimiento bajo las ventanas
    const grd = g.createLinearGradient(0, oy + h * 0.78, 0, oy + h);
    grd.addColorStop(0, 'rgba(70,60,50,0)');
    grd.addColorStop(1, 'rgba(70,60,50,0.16)');
    g.fillStyle = grd;
    g.fillRect(ox, oy + h * 0.78, T, h * 0.22);
  };
  const blockWall = (ox: number, oy: number) => {
    // bloque de concreto sin pañetar (obra gris)
    rect(ox, oy, T, T, '#8f8c86', true);
    for (let r = 0; r * 17 < T; r++) {
      const off = r % 2 ? 0 : 22;
      for (let x = -44 + off; x < T; x += 44) {
        const v = 0.88 + rand() * 0.18;
        g.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(147 * v)},${Math.round(140 * v)})`;
        const x0 = Math.max(ox, ox + x + 1), x1 = Math.min(ox + T, ox + x + 43);
        if (x1 > x0) g.fillRect(x0, oy + r * 17 + 1, x1 - x0, 15);
      }
    }
  };
  const slab = (ox: number, oy: number) => {
    // viga y placa de entrepiso (concreto) al pie del módulo
    ink(ox, oy + T - 16, T, 16, '#a9a69f');
    ink(ox, oy + T - 16, T, 2, 'rgba(0,0,0,0.18)');
  };
  const plinth = (ox: number, oy: number) => {
    // zócalo del primer piso
    ink(ox, oy + T - 14, T, 14, '#7d7a74');
  };
  const glass = (x: number, y: number, w: number, h: number, curtain?: string) => {
    const grd = g.createLinearGradient(x, y, x + w * 0.4, y + h);
    grd.addColorStop(0, '#5f7d8f');
    grd.addColorStop(0.45, '#2c4150');
    grd.addColorStop(1, '#22323d');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    m.fillStyle = '#000';
    m.fillRect(x, y, w, h);
    if (curtain) {
      g.fillStyle = curtain;
      const cw = w * (0.3 + rand() * 0.25);
      g.fillRect(x, y, cw, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 6; k < cw; k += 9) g.fillRect(x + k, y, 2, h);
    }
  };
  const windowAt = (x: number, y: number, w: number, h: number, frame: string, opts: { reja?: 'blanca' | 'negra' | 'rombos'; curtain?: string } = {}) => {
    rect(x - 6, y - 6, w + 12, h + 12, frame);
    glass(x, y, w, h, opts.curtain);
    ink(x + w / 2 - 2, y, 4, h, frame); // parteluz
    ink(x, y + h * 0.36, w, 3, frame); // ventana corrediza arriba
    rect(x - 12, y + h + 6, w + 24, 8, '#c7c2b8'); // alféizar de concreto
    if (opts.reja) {
      const col = opts.reja === 'negra' ? '#262626' : '#f1f1ec';
      g.fillStyle = col;
      for (let bx = x - 3; bx < x + w + 4; bx += 11) g.fillRect(bx, y - 4, 3, h + 8);
      g.fillRect(x - 6, y - 4, w + 12, 4);
      g.fillRect(x - 6, y + h, w + 12, 4);
      g.fillRect(x - 6, y + h * 0.5, w + 12, 3);
      if (opts.reja === 'rombos') {
        g.strokeStyle = col;
        g.lineWidth = 2.5;
        for (let k = 0; k < w; k += 22) {
          g.beginPath();
          g.moveTo(x + k, y + h * 0.25);
          g.lineTo(x + k + 11, y + h * 0.12);
          g.lineTo(x + k + 22, y + h * 0.25);
          g.lineTo(x + k + 11, y + h * 0.38);
          g.closePath();
          g.stroke();
        }
      }
    }
  };
  const curtains = ['#e9d3a8', '#c9d8e6', '#e8b9b9', '#f4f1ea', '#b9d6b4', undefined];
  const signColors: [string, string][] = [['#b8322a', '#fff'], ['#f2c230', '#1d2b3a'], ['#2a6fb0', '#fff'], ['#2e8b57', '#fff'], ['#7c3f98', '#fff'], ['#e07b22', '#fff'], ['#16857a', '#fff'], ['#24384d', '#fff']];
  const sign = (ox: number, oy: number, text: string, k: number) => {
    const [bg, fg] = signColors[k % signColors.length];
    rect(ox + 8, oy + 14, T - 16, 40, bg);
    g.fillStyle = fg;
    let fs = 30;
    g.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    while (g.measureText(text).width > T - 36 && fs > 14) g.font = `bold ${--fs}px Arial, Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, ox + T / 2, oy + 35);
  };
  const shopOpen = (ox: number, oy: number, text: string, k: number) => {
    sign(ox, oy, text, k);
    rect(ox + 14, oy + 58, T - 28, 8, '#8b8f93'); // caja de la persiana enrollada
    rect(ox + 14, oy + 66, T - 28, T - 80, '#3a332d');
    // estantes con productos de colores
    for (let sh = 0; sh < 3; sh++) {
      const y = oy + 80 + sh * 36;
      ink(ox + 20, y + 26, T - 40, 4, '#8a7a66');
      for (let x = ox + 22; x < ox + T - 26; x += 8 + rand() * 6) {
        const hgt = 10 + rand() * 14;
        g.fillStyle = `hsl(${Math.floor(rand() * 360)},${50 + rand() * 30}%,${45 + rand() * 20}%)`;
        g.fillRect(x, y + 26 - hgt, 5 + rand() * 4, hgt);
      }
    }
    rect(ox + 30, oy + 196, T - 60, 46, '#d9d2c4'); // mostrador
    ink(ox + 30, oy + 196, T - 60, 4, '#9a9184');
  };
  const shutter = (ox: number, oy: number, text: string, k: number) => {
    sign(ox, oy, text, k);
    rect(ox + 14, oy + 58, T - 28, T - 72, '#9ea3a7');
    for (let y = oy + 60; y < oy + T - 14; y += 7) ink(ox + 14, y, T - 28, 3, '#868b90');
    ink(ox + T / 2 - 6, oy + T - 30, 12, 8, '#3b3b3b'); // candado
    // rayones de grafiti en la persiana
    g.strokeStyle = ['#2b2b2b', '#c0392b', '#1f5fa8'][k % 3];
    g.lineWidth = 3;
    g.beginPath();
    let px = ox + 40, py = oy + 140;
    g.moveTo(px, py);
    for (let s = 0; s < 6; s++) {
      px += 20 + rand() * 12;
      py = oy + 120 + rand() * 50;
      g.lineTo(px, py);
    }
    g.stroke();
  };
  const door = (ox: number, oy: number, col: string) => {
    rect(ox + 86, oy + 46, 84, T - 58, '#cfcac0'); // marco
    rect(ox + 92, oy + 52, 72, T - 64, col);
    ink(ox + 98, oy + 60, 60, 60, 'rgba(255,255,255,0.12)');
    ink(ox + 98, oy + 132, 60, 96, 'rgba(0,0,0,0.12)');
    // ventanita con reja en la puerta
    glass(ox + 108, oy + 70, 40, 34);
    g.fillStyle = '#1f1f1f';
    for (let bx = ox + 110; bx < ox + 148; bx += 8) g.fillRect(bx, oy + 68, 2, 38);
    ink(ox + 150, oy + 150, 6, 12, '#d8c27a'); // chapa
  };
  const garage = (ox: number, oy: number, col: string) => {
    rect(ox + 20, oy + 40, T - 40, T - 52, col);
    for (let x = ox + 26; x < ox + T - 24; x += 14) ink(x, oy + 44, 4, T - 60, 'rgba(0,0,0,0.13)');
    ink(ox + 20, oy + 40, T - 40, 6, 'rgba(0,0,0,0.2)');
  };
  const balcony = (ox: number, oy: number, rail: string, wallFn: (ox: number, oy: number) => void) => {
    wallFn(ox, oy);
    // puerta-ventana al balcón
    rect(ox + 74, oy + 34, 108, T - 50, '#e9e6df');
    glass(ox + 80, oy + 40, 96, T - 62, curtains[Math.floor(rand() * curtains.length)]);
    ink(ox + 126, oy + 40, 4, T - 62, '#e9e6df');
    // la losa del balcón y la baranda se dibujan en 3D delante de la fachada (sectorScene.buildBuildings); aquí
    // queda solo la sombra que proyectan sobre el muro
    void rail;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(ox + 8, oy + T - 30, T - 16, 10);
    slab(ox, oy);
  };
  const plants = (x: number, y: number, w: number) => {
    for (let k = 0; k < w; k += 26) {
      rect(x + k, y, 20, 14, '#b5552f');
      g.fillStyle = ['#3f8a3a', '#5aa04a', '#e05a7a', '#f0c030'][Math.floor(rand() * 4)];
      g.beginPath();
      g.arc(x + k + 10, y - 6, 12, 0, Math.PI * 2);
      g.fill();
    }
  };
  const doorCols = ['#2f5d4a', '#6b2f2a', '#3d4f63', '#5a4632', '#7a7f84'];
  TILE_ORDER.forEach((id, i) => {
    const ox = (i % COLS) * T, oy = Math.floor(i / COLS) * T;
    const brickF = id.startsWith('b'), wallFn = brickF ? brickWall : plasterWall;
    const cur = () => curtains[Math.floor(rand() * curtains.length)];
    switch (id) {
      case 'bWinReja': case 'pWinReja':
        wallFn(ox, oy); windowAt(ox + 72, oy + 62, 112, 118, '#e9e6df', { reja: rand() < 0.5 ? 'blanca' : 'negra', curtain: cur() }); slab(ox, oy); break;
      case 'pWinReja2':
        wallFn(ox, oy); windowAt(ox + 64, oy + 60, 128, 122, '#d8d4cb', { reja: 'rombos', curtain: cur() }); slab(ox, oy); break;
      case 'bWinAlu': case 'pWinAlu':
        wallFn(ox, oy); windowAt(ox + 60, oy + 58, 136, 124, '#b9bec2', { curtain: cur() }); slab(ox, oy); break;
      case 'bSmall': case 'pSmall':
        wallFn(ox, oy);
        windowAt(ox + 38, oy + 64, 52, 42, '#e9e6df', { reja: 'blanca' });
        windowAt(ox + 150, oy + 64, 64, 64, '#b9bec2', { curtain: cur() });
        slab(ox, oy); break;
      case 'bBalcon': balcony(ox, oy, '#262626', brickWall); break;
      case 'pBalcon': balcony(ox, oy, '#f1f1ec', plasterWall); break;
      case 'bBlank': brickWall(ox, oy); slab(ox, oy); break;
      case 'pBlank': plasterWall(ox, oy); slab(ox, oy); break;
      case 'pPlants':
        plasterWall(ox, oy); windowAt(ox + 70, oy + 60, 116, 112, '#e9e6df', { reja: 'blanca', curtain: cur() }); plants(ox + 58, oy + 188, 140); slab(ox, oy); break;
      case 'bCalado':
        brickWall(ox, oy);
        rect(ox + 64, oy + 70, 128, 112, '#c9c3b7');
        for (let y = oy + 76; y < oy + 176; y += 18) for (let x = ox + 70; x < ox + 186; x += 18) {
          rect(x + 4, y + 2, 6, 12, '#2a2622');
          rect(x + 1, y + 6, 12, 4, '#2a2622');
        }
        slab(ox, oy); break;
      case 'gWin':
        blockWall(ox, oy); rect(ox + 70, oy + 60, 116, 124, '#2b2724'); ink(ox + 70, oy + 184, 116, 6, '#77746e'); slab(ox, oy); break;
      case 'gBlank': blockWall(ox, oy); slab(ox, oy); break;
      case 'bDoor': case 'pDoor':
        wallFn(ox, oy); plinth(ox, oy); door(ox, oy, doorCols[Math.floor(rand() * doorCols.length)]);
        windowAt(ox + 186, oy + 78, 50, 70, '#e9e6df', { reja: 'negra' });
        windowAt(ox + 20, oy + 78, 50, 70, '#e9e6df', { reja: 'blanca' }); break;
      case 'bShopA': wallFn(ox, oy); plinth(ox, oy); shopOpen(ox, oy, 'TIENDA', 0); break;
      case 'bShopB': wallFn(ox, oy); plinth(ox, oy); shopOpen(ox, oy, 'PANADERÍA', 1); break;
      case 'bShutA': wallFn(ox, oy); plinth(ox, oy); shutter(ox, oy, 'DROGUERÍA', 3); break;
      case 'bShutB': wallFn(ox, oy); plinth(ox, oy); shutter(ox, oy, 'FERRETERÍA', 7); break;
      case 'pShopA': wallFn(ox, oy); plinth(ox, oy); shopOpen(ox, oy, 'MISCELÁNEA', 2); break;
      case 'pShopB': wallFn(ox, oy); plinth(ox, oy); shopOpen(ox, oy, 'PAPELERÍA', 4); break;
      case 'pShopC': wallFn(ox, oy); plinth(ox, oy); shopOpen(ox, oy, 'MINIMERCADO', 6); break;
      case 'pShutA': wallFn(ox, oy); plinth(ox, oy); shutter(ox, oy, 'CACHARRERÍA', 5); break;
      case 'pShutB': wallFn(ox, oy); plinth(ox, oy); shutter(ox, oy, 'VARIEDADES', 0); break;
      case 'bGarage': case 'pGarage':
        wallFn(ox, oy); plinth(ox, oy); garage(ox, oy, ['#e7e5df', '#8a8f94', '#6b4f3a', '#3d5a73'][Math.floor(rand() * 4)]); break;
      case 'bWinLow': case 'pWinLow':
        wallFn(ox, oy); plinth(ox, oy); windowAt(ox + 66, oy + 66, 124, 120, '#e9e6df', { reja: rand() < 0.5 ? 'blanca' : 'negra', curtain: cur() }); break;
      case 'zocalo':
        rect(ox, oy, T, T, '#86827b'); break;
      case 'roofSheet':
        // teja ondulada de fibrocemento
        rect(ox, oy, T, T, '#a9aba7');
        for (let x = 0; x < T; x++) {
          const v = 0.5 + 0.5 * Math.sin((x / T) * Math.PI * 2 * 12);
          g.fillStyle = `rgba(0,0,0,${0.05 + 0.13 * v})`;
          g.fillRect(ox + x, oy, 1, T);
        }
        ink(ox, oy + T / 2 - 1, T, 2, 'rgba(0,0,0,0.15)'); break;
    }
  });
  const map = finish(c);
  const mask = finish(cm);
  mask.colorSpace = THREE.NoColorSpace;
  const inset = 1.5 / (T * COLS), insetV = 1.5 / (T * ROWS);
  return {
    map,
    mask,
    uv(id) {
      const i = TILE_ORDER.indexOf(id);
      const col = i % COLS, row = Math.floor(i / COLS);
      return [col / COLS + inset, 1 - (row + 1) / ROWS + insetV, (col + 1) / COLS - inset, 1 - row / ROWS - insetV];
    },
  };
}

/**
 * Mancha luminosa radial (halo de una luminaria o su reflejo en el suelo mojado). Es una textura de
 * datos, así que también se construye fuera del navegador.
 */
export function glowTexture(size = 64): THREE.DataTexture {
  const d = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const r = Math.hypot((i + 0.5) / size - 0.5, (j + 0.5) / size - 0.5) * 2;
      const a = r >= 1 ? 0 : Math.pow(1 - r, 2.2) * (0.6 + 0.4 * Math.exp(-r * r * 18));
      const k = (j * size + i) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(255 * a);
    }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
