# Sala «Laderas»: modelo, supuestos y fuentes

Sala de la aplicación (`src/slopes/`, enlace directo `#laderas`). Tiene tres partes con la distribución de las salas con partes (`src/rooms/RoomLab.tsx`): escena 3D con una pregunta, instrumentos en vivo y controles al pie, y un panel con Esquema, Retos, Experimentos, Diseño, Datos y Docente. Sin WebGL, cada parte muestra su gráfica o su corte plano con el mismo cálculo.

El cálculo está en módulos sin interfaz: `slope.ts` (Green-Ampt, talud infinito, SHALSTAB y RUSLE), `scene.ts` (las escenas ilustrativas) y `design.ts` (herramientas de diseño y sus gráficas). Se prueba en `tests/slopes/slope.test.ts` (`npm run test:slopes`; informe en `PRUEBAS_LADERAS.md`).

**Qué es y qué no es.** Laboratorio educativo. Las parcelas y las laderas son **ilustrativas**: no representan un lugar de Medellín ni de Colombia, no son un mapa de amenaza ni un estudio de estabilidad, y los prediseños no son diseños de ingeniería. No se citan artículos de normas: el factor de seguridad de 1,5, la pérdida tolerable de 11 t/(ha·año) y el vaciado en 48 horas son criterios usuales de la práctica, dichos así.

**Escalas.** Las tres maquetas van a escala, sin exageración vertical. La lluvia de la parcela se reproduce en 20 s.

## 1. La lluvia entra al suelo

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Parámetros del suelo | Ks, ψ y θe por textura (arena a arcilla) | Rawls, Brakensiek y Miller (1983); Chow, Maidment y Mays (1988), tabla 4.3.1 |
| Encharcado desde el principio | F − ψΔθ·ln(1 + F/ψΔθ) = Ks·t, resuelta por Newton | Green y Ampt (1911) |
| Lluvia constante | tp = Ks·ψΔθ/(i·(i − Ks)); antes de tp entra toda la lluvia; después, la curva corrida para que F(tp) = i·tp | Mein y Larson (1973) |
| Frente de humedecimiento | L = F/Δθ, con Δθ = (1 − Se)·θe | ibíd. |

**La escena.** Una parcela de 10 × 8 m con 4 % de pendiente y su corte. Al llover baja por el corte una capa oscura (el suelo mojado) con su frente; la superficie se moja, se forman charcos cuando el suelo no da abasto y el agua corre a una cuneta. Un infiltrómetro de doble anillo muestra la capacidad de infiltración. **Experimentos:** balance de agua, el encharcamiento por fórmula y en la serie, y la misma lluvia sobre cada suelo.

## 2. La ladera y el agua

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Factor de seguridad | FS = (c + cr)/(γ·z·sinβ·cosβ) + (1 − m·γw/γ)·tanφ/tanβ (flujo paralelo a la ladera) | Skempton y DeLory (1957); Duncan, Wright y Brandon (2014) |
| Agua en el suelo | fracción saturada W = q·(a/b)/(T·sinβ), como máximo 1; T = K·z | Montgomery y Dietrich (1994), SHALSTAB |
| Lluvia crítica | la recarga con la que W iguala la fracción que da FS = 1 | ibíd. |
| Raíces | cohesión aparente: pasto 1,5 kPa, bosque 7 kPa (típicos) | Sidle y Ochiai (2006) |
| Drenes | bajan el nivel del agua al 40 % (representación simple) | — |

**La escena.** Una ladera de 40 m a la pendiente elegida, con la capa de suelo sobre la roca, vegetación, casas al pie y la lluvia. En el corte del frente se ve el nivel del agua. Si el factor baja de 1, la capa se desliza ladera abajo con escombros que ruedan hacia las casas. **Experimentos:** las fuerzas sobre el plano de falla y la suma de los dos términos del factor, la lluvia crítica y su comprobación (FS = 1), y una tabla de lluvia por vegetación.

## 3. La ladera pierde suelo

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Pérdida de suelo | A = R·K·LS·C·P [t/(ha·año)] | Renard y otros (1997), RUSLE |
| Factor S | 10,8·sinθ + 0,03 bajo 9 %; 16,8·sinθ − 0,50 desde 9 % | McCool y otros (1987) |
| Factor L | (λ/22,13)^m, m = β/(1 + β), β = (sinθ/0,0896)/(3·sinθ^0,8 + 0,56) | McCool y otros (1989) |
| Cobertura C y prácticas P | valores típicos (desnudo 1, cultivo limpio 0,4, café con sombrío 0,12, pasto 0,03, rastrojo 0,01, bosque 0,002; P según la pendiente) | Wischmeier y Smith (1978) |
| Erosividad R | 5 000 MJ·mm/(ha·h·año), ilustrativa | — |
| Tolerable | 11 t/(ha·año) | Wischmeier y Smith (1978) |

**La escena.** Una ladera de cultivo a escala con su cobertura (suelo con surcos de erosión, maíz en hileras, café con sombrío, pasto, rastrojo o bosque) y sus prácticas (curvas de nivel, barreras vivas, terrazas). Abajo, una quebrada que se enturbia y un abanico de sedimento que crece con la pérdida; al llover baja el lodo por la ladera. **Experimentos:** el cálculo factor por factor con la comprobación de la parcela unitaria, la pérdida según el largo y la de cada práctica.

## 4. Herramientas de diseño

| Parte | Calculadora | Prediseño |
|---|---|---|
| Infiltración | Green-Ampt con lluvia constante | zanja de infiltración (área y profundidad de grava que se vacía en el tiempo pedido) |
| La ladera | talud infinito (factor, términos y fracción crítica) | pendiente máxima con el factor pedido |
| Erosión | RUSLE | largo máximo de ladera sin cortes (espaciamiento de barreras o terrazas) |

## 5. Verificación

`npm run test:slopes` ejecuta nueve pruebas (L1 a L9): Green-Ampt contra los ejemplos de Chow y otros, balance de agua y lluvia menor que Ks, la ecuación implícita, el talud sin cohesión (soluciones cerradas), un caso con cohesión a mano con la fracción y la lluvia críticas, la parcela unitaria de RUSLE, la robustez y coherencia de las seis herramientas y las escenas de partida.

## Límites

Green-Ampt supone suelo homogéneo, frente nítido y lluvia constante. El talud infinito vale para deslizamientos poco profundos con plano de falla paralelo a la ladera, sin sismo; la lluvia se trata en flujo estable. RUSLE es un promedio anual de largo plazo y no dice cuánto sedimento llega de verdad a la quebrada. Los valores de los suelos, la vegetación y la lluvia son típicos e ilustrativos.

## Fuentes

- Chow, V. T., Maidment, D. R. y Mays, L. W. (1988). *Applied Hydrology*. McGraw-Hill.
- Duncan, J. M., Wright, S. G. y Brandon, T. L. (2014). *Soil Strength and Slope Stability* (2.ª ed.). Wiley.
- Green, W. H. y Ampt, G. A. (1911). Studies on soil physics. *Journal of Agricultural Science*, 4(1).
- McCool, D. K. y otros (1987, 1989). Revised slope steepness and slope length factors for the USLE. *Transactions of the ASAE*, 30(5) y 32(5).
- Mein, R. G. y Larson, C. L. (1973). Modeling infiltration during a steady rain. *Water Resources Research*, 9(2).
- Montgomery, D. R. y Dietrich, W. E. (1994). A physically based model for the topographic control on shallow landsliding. *Water Resources Research*, 30(4).
- Rawls, W. J., Brakensiek, D. L. y Miller, N. (1983). Green-Ampt infiltration parameters from soils data. *Journal of Hydraulic Engineering*, 109(1).
- Renard, K. G. y otros (1997). *Predicting Soil Erosion by Water: RUSLE*. USDA, Agriculture Handbook 703.
- Sidle, R. C. y Ochiai, H. (2006). *Landslides: Processes, Prediction, and Land Use*. AGU.
- Skempton, A. W. y DeLory, F. A. (1957). Stability of natural slopes in London Clay. *Proc. 4th ICSMFE*.
- Wischmeier, W. H. y Smith, D. D. (1978). *Predicting Rainfall Erosion Losses*. USDA, Agriculture Handbook 537.
