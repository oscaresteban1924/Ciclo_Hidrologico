// Prueba mínima de OpenFloodLab (CPU): plano inclinado, "edificio" como cota alta, fuente puntual, borde cerrado.
const path = process.argv[2];
const { CpuShallowWaterSolver } = await import(path + '/CpuShallowWaterSolver.ts');
const W = 64, H = 32;
const el = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  let z = 10 - 0.04 * i;
  if (i >= 30 && i < 34 && j >= 8 && j < 24) z += 9; // bloque alto
  el[j * W + i] = z;
}
// ~1 m por celda cerca del ecuador: 64 m ≈ 0.000575°
const d = 1 / 111320;
const grid = { id: 'min', width: W, height: H, bounds: [0, 0, W * d, H * d], elevations: el };
const s = new CpuShallowWaterSolver(grid, { openBoundaryDrainRate: 0, adaptiveDomainEnabled: false });
s.setSources([{ id: 's', longitude: 5 * d, latitude: 16 * d, radiusMeters: 3, flowRateCubicMetersPerSecond: 0.05 }]);
let t = 0; let injected = 0;
for (let k = 0; k < 4000; k++) { const dt = s.step(); t += dt; injected += 0.05 * dt; }
const st = s.statistics();
let inBlock = 0; for (let j = 8; j < 24; j++) for (let i = 30; i < 34; i++) inBlock += s.depth[j * W + i];
console.log(JSON.stringify({ t: +t.toFixed(1), injected: +injected.toFixed(4), volume: +st.waterVolumeCubicMeters.toFixed(4), relErr: +((st.waterVolumeCubicMeters - injected) / injected).toExponential(2), depthSumInsideBlock: inBlock }));
