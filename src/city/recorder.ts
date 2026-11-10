// Grabación de un video corto de la maqueta (con el sonido de la tormenta, si está encendido). Todo ocurre en el
// navegador: cada cuadro de la escena 3D se copia a un lienzo con un rótulo fijo (sector, lluvia calculada,
// tiempo simulado y la aclaración de que es un escenario didáctico), y el navegador lo codifica. No se sube nada:
// al terminar, el archivo se descarga en el equipo.

export interface Overlay {
  title: string;
  lines: string[];
  foot: string;
}

const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];

/** Formato de video que el navegador puede grabar, o null si no puede grabar. */
export function recordingMime(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  for (const m of MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* navegador sin isTypeSupported */
    }
  }
  return null;
}

export function recordingSupported(): boolean {
  return recordingMime() !== null;
}

/** Duración máxima de un video [s]. */
export const MAX_CLIP_S = 60;

export class ClipRecorder {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private t0 = performance.now();
  private stopped = false;
  private duration = 0;
  readonly mime: string;
  /** Cuadros copiados (para verificar). */
  frames = 0;

  constructor(
    src: HTMLCanvasElement,
    private overlay: () => Overlay,
    audio: MediaStream | null,
    private onDone: (blob: Blob, mime: string) => void,
  ) {
    const mime = recordingMime();
    if (!mime) throw new Error('Este navegador no puede grabar video.');
    this.mime = mime;
    // tamaño del video: el de la maqueta, acotado a 1280 px de ancho y con medidas pares
    const k = Math.min(1, 1280 / Math.max(1, src.width));
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(320, Math.round((src.width * k) / 2) * 2);
    this.canvas.height = Math.max(180, Math.round((src.height * k) / 2) * 2);
    this.g = this.canvas.getContext('2d')!;
    const stream = this.canvas.captureStream(30);
    const tracks = [...stream.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])];
    this.rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.rec.onstop = () => this.onDone(new Blob(this.chunks, { type: mime.split(';')[0] }), mime);
    this.rec.start(1000);
  }

  /** Segundos grabados. */
  get elapsed(): number {
    return this.stopped ? this.duration : (performance.now() - this.t0) / 1000;
  }

  get active(): boolean {
    return !this.stopped;
  }

  /** Copia el cuadro recién dibujado de la escena (llamar justo después de dibujarla) y agrega el rótulo. */
  frame(src: HTMLCanvasElement): void {
    if (this.stopped) return;
    const { width: W, height: H } = this.canvas;
    const g = this.g;
    g.drawImage(src, 0, 0, W, H);
    const o = this.overlay();
    let s = W / 1280;
    const pad = 18 * (W / 1280);
    g.save();
    g.textBaseline = 'top';
    // rótulo superior (la letra se achica si el video es angosto, para que el texto quepa completo)
    const font = (wgt: number, px: number) => `${wgt} ${Math.max(9, Math.round(px * s))}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const widest = () => {
      g.font = font(600, 22);
      let m = g.measureText(o.title).width;
      g.font = font(400, 17);
      for (const l of [...o.lines, o.foot]) m = Math.max(m, g.measureText(l).width);
      return m;
    };
    const room = W - pad * 4;
    const m0 = widest();
    if (m0 > room) s *= room / m0;
    const fT = font(600, 22);
    const fL = font(400, 17);
    g.font = fT;
    let bw = g.measureText(o.title).width;
    g.font = fL;
    for (const l of o.lines) bw = Math.max(bw, g.measureText(l).width);
    const lh = 24 * s;
    const bh = pad * 1.2 + 28 * s + o.lines.length * lh;
    g.fillStyle = 'rgba(16, 24, 32, 0.66)';
    g.fillRect(pad, pad, bw + pad * 2, bh);
    g.fillStyle = '#ffffff';
    g.font = fT;
    g.fillText(o.title, pad * 2, pad * 1.6);
    g.font = fL;
    o.lines.forEach((l, i) => g.fillText(l, pad * 2, pad * 1.6 + 30 * s + i * lh));
    // pie: aclaración permanente
    g.font = fL;
    const fw = g.measureText(o.foot).width;
    g.fillStyle = 'rgba(16, 24, 32, 0.66)';
    g.fillRect(pad, H - pad - 30 * s, fw + pad * 2, 30 * s);
    g.fillStyle = '#ffffff';
    g.fillText(o.foot, pad * 2, H - pad - 24 * s);
    g.restore();
    this.frames++;
    if (this.elapsed >= MAX_CLIP_S) this.stop();
  }

  stop(): void {
    if (this.stopped) return;
    this.duration = this.elapsed;
    this.stopped = true;
    try {
      this.rec.stop();
    } catch {
      /* ya detenido */
    }
  }
}

/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
}
