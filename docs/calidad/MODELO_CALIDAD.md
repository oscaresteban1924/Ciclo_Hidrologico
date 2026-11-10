# Módulo «Calidad del agua» — modelo, supuestos y fuentes

Quinto modo de la aplicación (`src/quality/`). Tiene tres partes con la misma distribución: una escena interactiva a la izquierda y un panel a la derecha (una sola columna en teléfonos). El cálculo está en `src/quality/model.ts`, sin interfaz, y se prueba en `tests/quality/model.test.ts` (`npm run test:quality`; informe en `PRUEBAS_CALIDAD.md`).

**Qué es y qué no es.** Es un laboratorio educativo con ecuaciones publicadas, valores típicos de la literatura y normas colombianas vigentes. No es un monitoreo de una quebrada real de Medellín ni una evaluación de una planta real. Lo que es regla didáctica se dice en la interfaz y en este documento.

## 1. La quebrada y su salud

Una quebrada de montaña recibe en x = 0 el agua usada de un grupo de casas. La sonda mide en cualquier punto entre 400 m aguas arriba y 3 km aguas abajo; se pueden tomar muestras «para el laboratorio» (coliformes fecales y DBO5) y levantar una piedra para ver los macroinvertebrados.

| Pieza | Ecuación o valor | Fuente |
|---|---|---|
| Oxígeno de saturación | ln C = −139,34411 + 1,575701·10⁵/T − 6,642308·10⁷/T² + 1,2438·10¹⁰/T³ − 8,621949·10¹¹/T⁴ (T en K), por la razón de presiones a la altitud | Benson y Krause, en *Standard Methods* (APHA, 4500-O); atmósfera estándar |
| Altitud | 1 495 m: presión 0,835 de la del mar | Atmósfera estándar internacional |
| Agua usada | 4 personas por casa; 102 L/persona·día (120 L de consumo × 0,85 de retorno) | Valor de referencia |
| Agua residual cruda | DBO5 300 mg/L; coliformes fecales 10⁷ NMP/100 mL; conductividad 900 µS/cm; turbiedad 150 UNT; 22 °C; 0,5 mg/L de oxígeno | Valores típicos (orden de magnitud) |
| Tratamiento | lo que queda: tanque séptico DBO 60 %, sólidos 40 %, coliformes 50 %; planta secundaria 10 %, 10 %, 1 %; alcantarillado 0 (no llega a la quebrada) | Remociones típicas |
| Caudal de la quebrada | verano 50 L/s, normal 150 L/s, lluvias 400 L/s (× 2,5 recién llovió) | Supuesto didáctico |
| Mezcla | C = (Q<sub>r</sub>·C<sub>r</sub> + Q<sub>w</sub>·C<sub>w</sub>)/(Q<sub>r</sub> + Q<sub>w</sub>), completa en el vertimiento | Balance de masa |
| Hidráulica | cauce ancho de 4 m, Manning: montaña S = 4 %, n = 0,05; plano S = 0,5 %, n = 0,035 | — |
| Reaireación | k<sub>a</sub> = 31 183·S·U (Q ≤ 0,4247 m³/s) o 15 308·S·U, por día a 20 °C; θ = 1,024 | Tsivoglou y Neal, en Chapra (*Surface Water-Quality Modeling*) |
| Descomposición de la DBO | k<sub>d</sub> = 0,3·(H/2,4)^−0,434 por día a 20 °C; θ = 1,047 | Hydroscience, en Chapra |
| Lodo del fondo | 4 g O₂/m²·día sin tratar, 2 con tanque séptico, 0,5 con planta, en los primeros 800 m; θ = 1,065 | Chapra (valores típicos cerca de un vertimiento) |
| Oxígeno | Streeter y Phelps con el déficit inicial de la mezcla, la DBO y el lodo: D(t) = D₀e^(−k<sub>a</sub>t) + k<sub>d</sub>L₀/(k<sub>a</sub> − k<sub>d</sub>)·(e^(−k<sub>d</sub>t) − e^(−k<sub>a</sub>t)) + (SOD/H)/k<sub>a</sub>·(1 − e^(−k<sub>a</sub>t)) | Streeter y Phelps (1925); Chapra |
| Coliformes | mueren con k<sub>b</sub> = 0,8 por día a 20 °C; θ = 1,07 | Mancini (1978), en Chapra |
| Turbiedad | se asienta con una velocidad de caída de 1 m/día | Supuesto didáctico |

**¿Se puede nadar?** Criterios de calidad para contacto primario del Decreto 1076 de 2015, artículo 2.2.3.3.9.7 (transitorio; recoge el artículo 42 del Decreto 1594 de 1984): coliformes fecales hasta 200 NMP/100 mL, oxígeno al menos 70 % de saturación y pH entre 5 y 9.

**Lo que muestra.** En una quebrada de montaña la reaireación es tan rápida (cientos por día) que el oxígeno casi no baja aunque llegue mucha materia orgánica; en un cauce lento y plano, en verano y con muchas casas sin tratar, el oxígeno baja hasta un mínimo aguas abajo y luego se recupera (prueba Q4). Los coliformes, en cambio, viajan kilómetros: la quebrada deja de servir para nadar mucho antes de que falte el oxígeno.

### Bioindicadores: índice BMWP/Col

Puntajes de las familias de macroinvertebrados acuáticos de Roldán (2003), según la tabla que reproduce Roldán-Pérez (2016), *Rev. Acad. Colomb. Cienc. Ex. Fis. Nat.* 40(155): 254–274:

| Puntaje | Familias del juego |
|---|---|
| 10 | Perlidae (plecóptero), Psephenidae (centavito de agua) |
| 9 | Leptophlebiidae (efímera), Philopotamidae (tricóptero de red fina) |
| 8 | Leptoceridae (tricóptero de estuche), Simuliidae (larva de mosca negra), Veliidae (patinador) |
| 7 | Baetidae (efímera nadadora), Hydropsychidae (tricóptero de red), Planariidae (planaria) |
| 6 | Elmidae (escarabajo de agua), Corydalidae (diablito), Libellulidae (ninfa de libélula) |
| 3 | Physidae (caracol), Glossiphoniidae (sanguijuela) |
| 2 | Chironomidae (larva roja), Culicidae (larva de zancudo) |
| 1 | Tubificidae (gusano de lodo) |

En la tabla fuente Hydropsychidae aparece con 7 y con 5; aquí se usa 7. Clases (Roldán, 2003): I buena (más de 100; la tabla original separa 101–120 y más de 150), II aceptable (61–100), III dudosa (36–60), IV crítica (16–35), V muy crítica (15 o menos).

**Regla didáctica de presencia.** Una familia aparece si el oxígeno y la DBO están dentro de lo que tolera según su puntaje: 10 → oxígeno ≥ 7 mg/L y DBO ≤ 2,5 mg/L; 9 → 6,5 y 3,5; 8 → 6 y 5; 7 → 5,5 y 7; 6 → 5 y 10; 3 → 2 y 40; 2 → 1 y 120; 1 → siempre. En agua muy limpia los tolerantes son escasos (salvo la larva roja). Los bichos se calculan con tiempo seco: muestran cómo ha estado el agua durante semanas, no solo el día de la lluvia. En la naturaleza influyen también el fondo, la corriente y la época; un muestreo real reúne muchas más familias.

## 2. Del río a la llave

| Pieza | Regla | Tipo |
|---|---|---|
| Agua cruda | tiempo seco 8 UNT; tras la lluvia 80 UNT; creciente 400 UNT (con coliformes totales y E. coli crecientes) | Valores típicos |
| Dosis óptima de coagulante | 6·T<sup>0,35</sup> mg/L de sulfato de aluminio | Didáctica |
| Coagulación, floculación y sedimentación | remoción 0,97·exp(−(ln(dosis/óptima))²/(2·0,55²)), al menos 25 % por sedimentación simple | Didáctica: forma de la prueba de jarras (falta de dosis y reestabilización por exceso) |
| Filtros de arena | quitan 90 % si llegan 10 UNT o menos; 70 % si llega más (se tapan) | Didáctica |
| pH | baja 0,006 unidades por mg/L de coagulante (consumo de alcalinidad) | Aproximación |
| Cloro | demanda 0,4 mg/L + 0,15 por UNT filtrada (+0,2 tras la lluvia, +0,4 en creciente); en la red decae 5 % por hora durante 12 h | Didáctica |
| Desinfección | inactivación log = mín(6; 40·C·t/(1 + 2·T<sub>filtrada</sub>)) con t = 30 min; la turbiedad protege a los microbios | Didáctica (forma del concepto C·t) |

**Norma.** Resolución 2115 de 2007 (Ministerio de la Protección Social y Ministerio de Ambiente, Vivienda y Desarrollo Territorial): turbiedad máxima 2 UNT (art. 2), pH entre 6,5 y 9,0 (art. 4), cloro residual libre entre 0,3 y 2,0 mg/L en cualquier punto de la red (art. 9), coliformes totales y *E. coli* 0 UFC/100 cm³ (art. 11). **IRCA** (arts. 13–15): suma de los puntajes de riesgo de las características que no cumplen sobre la suma de las analizadas × 100, con turbiedad 15, pH 1,5, cloro residual libre 15, coliformes totales 15 y *E. coli* 25; niveles 0–5 sin riesgo, 5,1–14 bajo, 14,1–35 medio, 35,1–80 alto y 80,1–100 inviable sanitariamente. El juego analiza esas cinco características (71,5 puntos); el color aparente no se simula.

**Medellín** (contexto, sin cálculo): el 96 % de los usuarios de EPM en el valle de Aburrá recibe agua de los embalses La Fe, Riogrande II y Piedras Blancas (EPM, 2026); las plantas de potabilización La Ayurá y Manantiales tienen capacidades de 9,2 y 6,0 m³/s (Superservicios, con datos de EPM). Las aguas residuales del sur se tratan en San Fernando (Itagüí, desde 2000; 1,8 m³/s nominales) y las del norte en Aguas Claras (Bello, desde 2018; unos 5 m³/s); según EPM, en 2025 se trataba cerca del 93 % de las aguas residuales del valle.

**Planta de tratamiento de aguas residuales** (esquema): rejas y desarenador (queda 95 % de la DBO5), sedimentación primaria (65 %), tratamiento biológico (15 %), sedimentación secundaria (8 %). Valores típicos de un tratamiento secundario; cada planta es distinta.

## 3. La ciudad y la lluvia

| Pieza | Ecuación | Fuente |
|---|---|---|
| Acumulación entre lluvias | B = 25·(1 − e^(−0,4·días)) g/m², sobre 1 200 m² de calle y andenes; el barrido la reduce a la mitad | Forma exponencial de SWMM (EPA); valores ilustrativos |
| Lavado | fracción arrastrada 1 − e^(−0,18·R), R la lluvia acumulada en mm | Sartor y Boyd (1972) |
| Concentración | masa arrastrada en el minuto / agua que escurre (C = 0,9) | — |
| Basura | objetos por día seco (1,5 o 6), × 0,4 con barrido | Ilustrativo |
| Conexiones erradas | 4 personas × 102 L/día por casa con 10⁷ coliformes fecales/100 mL, todos los días | Valores de referencia |

El **primer lavado** sale de la ecuación: con un aguacero de 15 mm, los primeros 10 mm arrastran cerca del 90 % de la mugre (prueba Q8).

Dos botones abren el laboratorio de lluvia de Medellín directamente en las misiones «sumidero obstruido» y «conexiones erradas». La segunda muestra el error contrario al de esta parte: techos conectados a la red de aguas residuales.

## 4. Accesibilidad

Pestañas con teclado (flechas), escenas con descripción textual y controles equivalentes (la sonda se mueve con el control deslizante o con las estaciones), gráficas navegables con flechas, colores con texto (bien, bajo, muy bajo; cumple o no cumple), movimiento reducido respetado en la lluvia de la calle.

## 5. Referencias

- APHA, AWWA, WEF. *Standard Methods for the Examination of Water and Wastewater*, 4500-O.
- Chapra, S. C. (1997). *Surface Water-Quality Modeling*. McGraw-Hill.
- Decreto 1076 de 2015, Ministerio de Ambiente y Desarrollo Sostenible, art. 2.2.3.3.9.7.
- EPM (2025–2026), comunicados sobre las plantas San Fernando y Aguas Claras y sobre las fuentes de abastecimiento; Superservicios, informe de acueducto y alcantarillado (capacidades de las plantas de EPM).
- Resolución 2115 de 2007, Ministerio de la Protección Social y Ministerio de Ambiente, Vivienda y Desarrollo Territorial.
- Roldán, G. (2003). *Bioindicación de la calidad del agua en Colombia. Uso del método BMWP/Col*. Universidad de Antioquia.
- Roldán-Pérez, G. (2016). Los macroinvertebrados como bioindicadores de la calidad del agua: cuatro décadas de desarrollo en Colombia y Latinoamérica. *Rev. Acad. Colomb. Cienc. Ex. Fis. Nat.* 40(155): 254–274.
- Sartor, J. D., y Boyd, G. B. (1972). *Water Pollution Aspects of Street Surface Contaminants*. EPA-R2-72-081.
- Streeter, H. W., y Phelps, E. B. (1925). *A study of the pollution and natural purification of the Ohio River*. U.S. Public Health Service, Bulletin 146.
