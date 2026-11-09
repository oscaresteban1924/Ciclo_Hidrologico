// Sonido ambiental opcional generado con Web Audio (sin archivos externos).
// Viento: ruido marrón filtrado con una oscilación lenta. Lluvia: ruido blanco filtrado.

interface Ambient {
  ctx: AudioContext;
  master: GainNode;
  wind: GainNode;
  rain: GainNode;
  water: GainNode;
  sources: AudioScheduledSourceNode[];
}

let ambient: Ambient | null = null;

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') data[i] = w;
    else {
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buf;
}

export function startAmbient(): void {
  if (ambient) return;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return; // el navegador o el marco no permite audio: la app sigue sin sonido
  }
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.5);

  const brown = noiseBuffer(ctx, 'brown');
  const white = noiseBuffer(ctx, 'white');

  // Viento
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = brown;
  windSrc.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 500;
  const wind = ctx.createGain();
  wind.gain.value = 0.35;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.15;
  lfo.connect(lfoGain).connect(wind.gain);
  windSrc.connect(windFilter).connect(wind).connect(master);

  // Lluvia
  const rainSrc = ctx.createBufferSource();
  rainSrc.buffer = white;
  rainSrc.loop = true;
  const rainHp = ctx.createBiquadFilter();
  rainHp.type = 'highpass';
  rainHp.frequency.value = 1200;
  const rainLp = ctx.createBiquadFilter();
  rainLp.type = 'lowpass';
  rainLp.frequency.value = 7000;
  const rain = ctx.createGain();
  rain.gain.value = 0;
  rainSrc.connect(rainHp).connect(rainLp).connect(rain).connect(master);

  // Agua que corre
  const waterSrc = ctx.createBufferSource();
  waterSrc.buffer = white;
  waterSrc.loop = true;
  const waterBp = ctx.createBiquadFilter();
  waterBp.type = 'bandpass';
  waterBp.frequency.value = 900;
  waterBp.Q.value = 0.7;
  const water = ctx.createGain();
  water.gain.value = 0.04;
  waterSrc.connect(waterBp).connect(water).connect(master);

  windSrc.start();
  rainSrc.start();
  waterSrc.start();
  lfo.start();
  ambient = { ctx, master, wind, rain, water, sources: [windSrc, rainSrc, waterSrc, lfo] };
}

export function setAmbient(levels: { wind: number; rain: number; river: number }): void {
  if (!ambient) return;
  const t = ambient.ctx.currentTime;
  ambient.wind.gain.setTargetAtTime(0.2 + levels.wind * 0.35, t, 0.8);
  ambient.rain.gain.setTargetAtTime(levels.rain * 0.22, t, 0.8);
  ambient.water.gain.setTargetAtTime(0.02 + levels.river * 0.06, t, 0.8);
}

export function stopAmbient(): void {
  if (!ambient) return;
  const a = ambient;
  ambient = null;
  try {
    a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.2);
    window.setTimeout(() => {
      a.sources.forEach((s) => {
        try {
          s.stop();
        } catch {
          /* ya detenido */
        }
      });
      void a.ctx.close();
    }, 600);
  } catch {
    /* contexto ya cerrado */
  }
}
