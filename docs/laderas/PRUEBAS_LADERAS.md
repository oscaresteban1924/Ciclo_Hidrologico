# Pruebas de la sala «Laderas»

Se ejecutan con `npm run test:slopes`. Cada prueba declara su tolerancia antes de ejecutarse.

**9 de 9 cumplen.**

## L1. Green-Ampt con encharcamiento desde el principio contra el ejemplo de Chow y otros — cumple

- Tolerancia: F(1 h) = 31,7 mm del libro dentro de su redondeo (±0,05 mm) y f = 18,1 mm/h con ±0,1 mm/h (el libro calcula f con F ya redondeado)
- Medido: F = 31.67 mm, f = 18.16 mm/h

## L2. Tiempo de encharcamiento con lluvia constante y continuidad de la curva — cumple

- Tolerancia: tp = 0,170 h del ejemplo 4.4.1 de Chow y otros (franco limoso, 5 cm/h) con 1 % o menos; antes de tp entra toda la lluvia y después menos; F no salta en tp (menos de 1 % de un paso de lluvia)
- Medido: tp = 0.1698 h (serie: 0.1698 h); antes true, después true; salto 0.0000 mm

## L3. Balance de agua (infiltración + escorrentía = lluvia) y lluvia menor que Ks — cumple

- Tolerancia: balance con error de 1e-9 mm o menos en todos los suelos y lluvias; con i ≤ Ks no hay encharcamiento ni escorrentía
- Medido: error máximo 2.84e-14 mm; sin encharcamiento con i ≤ Ks: true

## L4. Solución de F − ψΔθ·ln(1 + F/ψΔθ) = Ks·t por Newton — cumple

- Tolerancia: residuo relativo de 1e-9 o menos (20 casos de suelo y tiempo)
- Medido: residuo máximo 2.03e-12

## L5. Talud infinito sin cohesión: seco y saturado — cumple

- Tolerancia: seco FS = tanφ/tanβ y saturado FS = (1 − γw/γ)·tanφ/tanβ, con 1e-12
- Medido: seco 1.268566 (cerrada 1.268566); saturado 0.613585 (cerrada 0.613585)

## L6. Talud con cohesión calculado a mano, fracción saturada crítica y lluvia crítica de SHALSTAB — cumple

- Tolerancia: FS igual al cálculo a mano (1e-12); con la fracción crítica FS = 1 (1e-9); la lluvia crítica satura justo esa fracción (1e-9)
- Medido: FS 1.232911 (a mano 1.232911); m crítica 0.9220 → FS 1.000000000; q crítica 22.129 mm/día → W 0.922045

## L7. Factor LS en la parcela unitaria, crecimiento con largo y pendiente, y producto de RUSLE — cumple

- Tolerancia: LS(22,13 m; 9 %) = 1 con 1 %; LS crece con el largo y con la pendiente; A = R·K·LS·C·P (1e-12)
- Medido: LS unitario 1.0059; crece true; A 296.238 t/(ha·año)

## L8. Herramientas de diseño: datos al azar, pendiente máxima, espaciamiento de barreras, zanja y gráficas — cumple

- Tolerancia: sin excepciones ni valores raros en 1 800 llamadas; la pendiente máxima cumple el factor y 0,2° más no; el largo máximo deja la pérdida en la tolerable y 0,2 m más la pasa; la zanja de ejemplo cumple; las seis gráficas se dibujan
- Medido: 1800 llamadas, 0 con valores raros, 0 excepciones; pendiente 26.8° true; largo 21 m true; zanja true; gráficas true

## L9. Escenas de partida: la parcela se encharca, la ladera aguanta y la ladera de cultivo pierde suelo de más — cumple

- Tolerancia: en la parcela hay escorrentía; la ladera tiene FS entre 1 y 1,5 (aguanta, sin el margen usual); el cultivo limpio pasa la pérdida tolerable
- Medido: escorrentía 14.6 mm (encharca a los 6.9 min); FS 1.32; pérdida 592 t/(ha·año)
