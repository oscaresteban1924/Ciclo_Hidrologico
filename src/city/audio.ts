// Sonido de la tormenta, sintetizado en el navegador (sin archivos de audio): la lluvia suena según la intensidad
// que calcula el modelo en ese momento, el agua que corre según el caudal calculado (quebrada y salidas del
// sector) y los truenos llegan después de cada rayo con el retraso del sonido (343 m/s). Se enciende solo con un
// gesto de la persona (política de los navegadores) y entrega también un flujo para grabar el video con sonido.

export interface StormSound {
  /** Intensidad de lluvia que se aplica ahora [mm/h] (calculada). */
  rainMmH: number;
  /** Agua que corre, normalizada [0–1] (caudal calculado). */
  flow: number;
}

const SOUND_SPEED = 343;

export class StormAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private rainBand: BiquadFilterNode | null = null;
  private rumbleGain: GainNode | null = null;
  private flowGain: GainNode | null = null;
  private flowLow: BiquadFilterNode | null = null;
  private brown: AudioBuffer | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private pending: number[] = [];
  enabled = false;

  /** ¿El navegador puede sintetizar sonido? */
  static supported(): boolean {
    return typeof window !== 'undefined' && (typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
  }

  /** Enciende el sonido (debe llamarse desde un clic). */
  async enable(): Promise<void> {
    if (!StormAudio.supported()) return;
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.master!.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.2);
    this.enabled = true;
  }

  disable(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    this.enabled = false;
    for (const h of this.pending) window.clearTimeout(h);
    this.pending = [];
  }

  /** Flujo de audio para grabar (null si el sonido no se ha encendido nunca). */
  stream(): MediaStream | null {
    return this.dest?.stream ?? null;
  }

  private build(): void {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    // ruido blanco (lluvia) y ruido pardo (agua que corre, trueno)
    const len = sr * 3;
    const wn = ctx.createBuffer(1, len, sr);
    const w = wn.getChannelData(0);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < len; i++) w[i] = rnd();
    const bn = ctx.createBuffer(1, len, sr);
    const b = bn.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * rnd()) / 1.02;
      b[i] = last * 3.5;
    }
    this.brown = bn;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.dest = ctx.createMediaStreamDestination();
    master.connect(this.dest);
    this.master = master;
    const loop = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start();
      return s;
    };
    // lluvia: ruido filtrado en banda (más agudo y fuerte con más lluvia)
    const rainBand = ctx.createBiquadFilter();
    rainBand.type = 'bandpass';
    rainBand.frequency.value = 3000;
    rainBand.Q.value = 0.6;
    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    loop(wn).connect(rainBand).connect(rainGain).connect(master);
    this.rainBand = rainBand;
    this.rainGain = rainGain;
    // aguacero fuerte: un rumor grave debajo
    const rumbleLow = ctx.createBiquadFilter();
    rumbleLow.type = 'lowpass';
    rumbleLow.frequency.value = 500;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    loop(wn).connect(rumbleLow).connect(rumbleGain).connect(master);
    this.rumbleGain = rumbleGain;
    // agua que corre: ruido pardo filtrado (se abre con el caudal)
    const flowLow = ctx.createBiquadFilter();
    flowLow.type = 'lowpass';
    flowLow.frequency.value = 400;
    const flowGain = ctx.createGain();
    flowGain.gain.value = 0;
    loop(bn).connect(flowLow).connect(flowGain).connect(master);
    this.flowLow = flowLow;
    this.flowGain = flowGain;
  }

  /** Ajusta la lluvia y el agua a lo calculado en este cuadro. */
  update(s: StormSound): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0, s.rainMmH);
    const rl = r > 0 ? Math.min(1, Math.sqrt(r / 120)) : 0;
    this.rainGain!.gain.setTargetAtTime(0.32 * rl, t, 0.25);
    this.rainBand!.frequency.setTargetAtTime(2200 + 3000 * rl, t, 0.3);
    this.rumbleGain!.gain.setTargetAtTime(0.18 * Math.max(0, rl - 0.4), t, 0.3);
    const f = Math.min(1, Math.max(0, s.flow));
    this.flowGain!.gain.setTargetAtTime(0.5 * f, t, 0.4);
    this.flowLow!.frequency.setTargetAtTime(300 + 900 * f, t, 0.4);
  }

  /** Trueno de un rayo a `distM` metros: llega después de distM/343 s, más débil y grave cuanto más lejos. */
  thunder(distM: number): void {
    if (!this.ctx || !this.enabled || !this.brown) return;
    const delayMs = (distM / SOUND_SPEED) * 1000;
    const h = window.setTimeout(() => {
      const ctx = this.ctx!;
      if (!this.enabled) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = distM < 1500 ? 900 : 350;
      lp.frequency.setTargetAtTime(120, t + 0.3, 1.2);
      const g = ctx.createGain();
      const peak = Math.min(1, 900 / Math.max(300, distM));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + (distM < 1500 ? 0.05 : 0.4));
      g.gain.setTargetAtTime(peak * 0.5, t + 0.6, 0.6);
      g.gain.setTargetAtTime(0, t + 2.2, 1.0);
      src.connect(lp).connect(g).connect(this.master!);
      src.start(t, Math.random() * 1.5);
      src.stop(t + 7);
      this.pending = this.pending.filter((q) => q !== h);
    }, delayMs);
    this.pending.push(h);
  }

  dispose(): void {
    this.disable();
    void this.ctx?.close();
    this.ctx = null;
  }
}
