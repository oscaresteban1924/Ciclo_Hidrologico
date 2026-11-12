// Tipos mínimos de n8ao (la librería no trae declaraciones): solo lo que usa src/three/look.ts.
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    autosetGamma: boolean;
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      gammaCorrection: boolean;
      transparencyAware: boolean;
      color: Color;
    };
    setSize(width: number, height: number): void;
    dispose(): void;
  }
}
