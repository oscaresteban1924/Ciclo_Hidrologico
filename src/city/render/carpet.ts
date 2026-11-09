// Funciones GLSL compartidas por la vista del valle y por el entorno de los sectores: el «tapete»
// urbano que se ve de lejos (techos por tipo de tejido y calles a escala de cuadra). Son solo dibujo.

/** Ruido, azar por celda y color de techo según el tejido (0 nada · 1 ladera · 2 plano · 3 centro ·
 *  4 El Poblado · 5 industria · 6 municipios). `r` elige el tipo de techo y `r2` varía el tono. */
export const CARPET_GLSL = `
// azar por celda sin funciones trigonométricas (más barato, sobre todo con WebGL por software)
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec3 roofColor(float fab, float r, float r2) {
  vec3 brick = vec3(0.6, 0.31, 0.2) * (0.82 + 0.36 * r2);
  vec3 conc = vec3(0.56, 0.55, 0.52) * (0.85 + 0.3 * r2);
  vec3 zinc = vec3(0.6, 0.63, 0.66);
  vec3 light = vec3(0.8, 0.77, 0.72) * (0.9 + 0.15 * r2);
  vec3 canopy = vec3(0.24, 0.4, 0.2) * (0.8 + 0.4 * r2);
  vec3 painted = r2 < 0.25 ? vec3(0.86, 0.66, 0.25) : r2 < 0.5 ? vec3(0.3, 0.6, 0.62) : r2 < 0.75 ? vec3(0.82, 0.5, 0.52) : vec3(0.8, 0.8, 0.76);
  if (fab < 1.5) return r < 0.6 ? brick : r < 0.8 ? conc : r < 0.89 ? zinc : painted;            // ladera
  if (fab < 2.5) return r < 0.36 ? canopy : r < 0.6 ? brick * 1.05 : r < 0.8 ? light : conc;    // plano
  if (fab < 3.5) return r < 0.2 ? brick : r < 0.75 ? conc * 1.12 : light;                        // centro
  if (fab < 4.5) return r < 0.5 ? canopy : r < 0.78 ? brick : light;                             // El Poblado
  if (fab < 5.5) return r < 0.5 ? zinc * 0.95 : r < 0.85 ? conc * 1.1 : brick;                  // industria
  return r < 0.5 ? brick : r < 0.75 ? light : r < 0.9 ? canopy : conc;                          // municipios
}
// Tapete urbano en p (unidades de 10 m): techos y calles que se desvanecen con la distancia (fw = unidades
// por píxel). base = color del suelo; ub = color medio del tejido; fab y k = tejido y peso urbano.
vec3 carpet(vec2 p, float fw, vec3 base, vec3 ub, float fab, float k) {
  float lad = step(fab, 1.5);
  // retícula de cuadras: alineada al norte en lo plano, irregular en las laderas
  vec2 q = p + lad * 2.6 * vec2(sin(p.y * 0.06 + sin(p.x * 0.031)), sin(p.x * 0.05 + cos(p.y * 0.027)));
  float blk = lad > 0.5 ? 5.0 : (fab > 4.5 && fab < 5.5) ? 11.0 : 7.5;
  vec2 f = fract(q / blk);
  float sw = lad > 0.5 ? 0.075 : 0.1;
  float street = 1.0 - step(sw, f.x) * step(sw, f.y);
  vec2 cell = floor(q / 1.2);
  float r = h21(cell), r2 = h21(cell + 17.3);
  vec3 roof = roofColor(fab, r, r2);
  float detail = 1.0 - smoothstep(0.5, 1.6, fw);
  float sdet = 1.0 - smoothstep(1.5, 5.0, fw);
  // el borde urbano es irregular: los barrios se deshilachan en la montaña
  float edge = smoothstep(0.0, 0.6, k + 0.35 * (vn(p * 0.08) - 0.5));
  vec3 urban = mix(ub, roof, detail * 0.85);
  urban = mix(urban, vec3(0.33, 0.33, 0.34), street * sdet * 0.75);
  return mix(base, urban, edge);
}
`;
