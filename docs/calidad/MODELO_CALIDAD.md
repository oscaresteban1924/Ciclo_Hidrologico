# Módulo «Calidad del agua» — modelo, supuestos y fuentes

Quinto modo de la aplicación (`src/quality/`). Tiene cuatro partes con la misma distribución: una escena interactiva a la izquierda y un panel a la derecha (una sola columna en teléfonos). El cálculo está en `src/quality/model.ts` y, para la planta de aguas residuales, en `src/quality/ptar.ts`, sin interfaz, y se prueba en `tests/quality/model.test.ts` (`npm run test:quality`; informe en `PRUEBAS_CALIDAD.md`).

**Qué es y qué no es.** Es un laboratorio educativo con ecuaciones publicadas, valores típicos de la literatura y normas colombianas vigentes. Las escenas no son un monitoreo de una quebrada real de Medellín ni una evaluación de una planta real de potabilización o de aguas residuales; para comparar, la pestaña Medellín de la quebrada muestra mediciones reales de 18 quebradas (sección 4 bis). Lo que es regla didáctica se dice en la interfaz y en este documento.

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
| Amonio | 25 mg/L de N en el agua usada cruda; queda 100 % con tanque séptico (sin aire, el nitrógeno sale como amonio), 50 % con la planta pequeña (nitrificación parcial, supuesto didáctico), 0 con alcantarillado; 0,03 mg/L de N aguas arriba (0,08 recién llovió) | Metcalf y Eddy (agua residual doméstica de concentración media) |
| Nitrificación | el amonio pasa a nitrato con k<sub>n</sub> = 0,5 por día a 20 °C, θ = 1,08, y gasta 4,57 g de O₂ por gramo de N: al déficit se suma 4,57·k<sub>n</sub>·N₀/(k<sub>a</sub> − k<sub>n</sub>)·(e^(−k<sub>n</sub>t) − e^(−k<sub>a</sub>t)) | Bowie et al. (1985); Chapra |
| Amoníaco libre | NH₃ = N amoniacal × f × 17,03/14,01, con f = 1/(1 + 10^(pK<sub>a</sub> − pH)) y pK<sub>a</sub> = 0,09018 + 2 729,92/T(K) | Emerson et al. (1975) |
| Turbiedad | se asienta con una velocidad de caída de 1 m/día | Supuesto didáctico |
| Pluma del tubo (dibujo) | el exceso de contaminante se reparte a lo ancho con la mezcla transversal de una fuente en la orilla: ε<sub>t</sub> = 0,6·H·u*, u* = √(g·H·S); C/C̄ = Σ [e^(−(y′−y₀′−2n)²/4x′) + e^(−(y′+y₀′−2n)²/4x′)]/√(4πx′), con x′ = ε<sub>t</sub>·x/(U·W²), y′ = y/W y el chorro a y₀ = 0,12·W de la orilla (serie de cosenos cuando la pluma ya es ancha); largo de mezcla L<sub>m</sub> = 0,4·U·W²/ε<sub>t</sub> (≈ 1,2 km en verano, 0,7 km normal, 0,43 km en lluvias); nunca más que el agua del tubo sin mezclar | Fischer et al. (1979), *Mixing in Inland and Coastal Waters*, cap. 5 |

**¿Se puede nadar?** Criterios de calidad para contacto primario del Decreto 1076 de 2015, artículo 2.2.3.3.9.7 (transitorio; recoge el artículo 42 del Decreto 1594 de 1984): coliformes fecales hasta 200 NMP/100 mL, oxígeno al menos 70 % de saturación y pH entre 5 y 9.

**La pluma.** Las lecturas de la sonda, los peces y la pregunta usan la mezcla completa de la sección (el modelo de arriba). El dibujo del agua reparte ese exceso a lo ancho con la pluma: pegada a la orilla del tubo al principio y de orilla a orilla después de L<sub>m</sub> (prueba Q18: la media a lo ancho es la de la mezcla, error < 0,5 %). El tono de la pluma está reforzado para que se vea (raíz de la DBO5 que trae el tubo; 30 mg/L = tono pleno) y su rótulo lo dice; sobre el reforzamiento se ve la espuma de los detergentes. La distancia a lo largo de la quebrada está comprimida en el dibujo, como en el resto de la escena. Con alcantarillado no hay pluma.

**Entradas siempre válidas.** Cada parte sanea lo que recibe antes de calcular (`sanitizeCreek`, `sanitizePlant`, `sanitizeStreet`): un número que no es finito toma el valor por defecto, uno fuera de rango se lleva al borde (casas 0–5 000; altitud 0–4 500 m; dosis 0–200 mg/L; cloro 0–10 mg/L; red 0–72 h; días secos 0–60; lluvia 0–300 mm/h; duración 1–240 min; casas mal conectadas 0–20) y una opción desconocida toma la de por defecto. La prueba Q16 lo comprueba con miles de entradas al azar, inválidas incluidas, y Q17 revisa que cada decisión empuje el resultado hacia donde debe en toda la malla de opciones.

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

**Los once procesos** (pestaña Procesos, `src/quality/processes.ts`). La escena dibuja una planta convencional de filtración rápida con once pasos; el cálculo usa cinco de ellos (coagulación y floculación con sedimentación, filtración, cloro y red). Los otros se dibujan y se explican sin cambiar el resultado: el desarenador no quita la arcilla que da la turbiedad; el pH del juego siempre queda dentro de la norma, así que no hace falta cal; el almacenamiento no cambia el cloro en el juego, y el lodo se muestra como la turbiedad retirada. Los criterios citados son rangos generales de diseño de la norma colombiana, no los de una planta de EPM, y la escena no es un diseño de ingeniería.

| Paso | Criterios citados | Fuente |
|---|---|---|
| 1. Captación y rejilla | retiene objetos gruesos; deja pasar arena y arcilla | Descripción general |
| 2. Desarenador | partícula de 0,1 mm; velocidad ≤ 0,25 m/s; relación velocidad horizontal / velocidad de caída < 20; arena de 2,65 g/cm³; pendiente > 10 %; ≥ 20 min para partículas muy finas | Res. 0330 de 2017, art. 55 |
| 3. Mezcla rápida | hidráulica: G 1 000–2 000 s⁻¹ en menos de 1 s; mecánica: G 500–2 000 s⁻¹ en menos de 60 s; resalto con número de Froude 4,5–9 | Res. 0330, art. 111 |
| 4. Floculación | al menos tres zonas con G de 70 a 10 s⁻¹ (medio 40 s⁻¹); 20–40 min; mecánica desde 250 L/s | Res. 0330, art. 112 (mod. Res. 799 de 2021) |
| 5. Sedimentación | alta tasa (módulos de 1,2 m): 120–185 m³/m²·día, 10–20 min; flujo horizontal: 15–30 m³/m²·día, 2–4 h | Res. 0330, art. 113 (corr. Res. 908 de 2021) |
| 6. Filtración rápida | lecho mixto 180–250 m³/m²·día (hasta 350), antracita 0,4–0,6 m sobre arena 0,15–0,3 m; solo arena < 120 m³/m²·día, 0,6–0,9 m; retrolavado ≥ 0,6 m/min; al menos 3 filtros (4 si se lavan unos con otros) | Res. 0330, art. 114 (corr. Res. 908) |
| 7. Desinfección | tanque de contacto antes del almacenamiento, ≥ 20 min; cloro residual libre 0,3–2,0 mg/L en la red; coliformes y *E. coli* 0 UFC/100 cm³ | Res. 0330, art. 121 (corr. Res. 908); Res. 2115, arts. 9 y 11 |
| 8. Estabilización del pH | pH 6,5–9,0; medir pH, conductividad y turbiedad a la entrada y a la salida | Res. 2115, art. 4; Res. 0330, art. 122 |
| 9. Almacenamiento | cloro suficiente para llegar con 0,3 mg/L o más a toda la red | Res. 2115, art. 9 |
| 10. Red y llave | turbiedad ≤ 2 UNT; pH 6,5–9,0; cloro 0,3–2,0 mg/L; coliformes y *E. coli* 0; IRCA | Res. 2115, arts. 2, 4, 9, 11, 13 y 15 |
| 11. Lodos | espesador 15–25 kg/m²·día y 6–12 h; homogeneización ≤ 6 h; lechos de secado: al menos 4 celdas, 3–4 días; muestreo cada 6 meses, 3 meses o 10 días según el caudal | Res. 0330, arts. 125 y 133 (mod. Res. 799) |

Las animaciones «con lupa» son ilustrativas: cada una es un corte de la parte, con el agua del color de su turbiedad, el proceso en movimiento y un círculo de aumento sobre el detalle (granos, partículas con su carga, flocs, bacterias, moléculas de cloro), y al pie los valores del juego. Donde dependen del juego usan los valores calculados: la neutralización de cargas sigue la dosis frente a la dosis justa (con más del doble, las partículas quedan positivas), el tamaño de los flocs sigue la remoción, el cloro deja de actuar si no queda cloro libre, el pH es el calculado y la red muestra el cloro en la llave. La prueba Q13 revisa que los once pasos estén completos, en orden y en la escena, que sus valores sean números válidos en 18 combinaciones de río, dosis y cloro, que citen los artículos de la Resolución 0330 y que el IRCA mostrado sea el calculado.

**Medellín** (contexto, sin cálculo): el 96 % de los usuarios de EPM en el valle de Aburrá recibe agua de los embalses La Fe, Riogrande II y Piedras Blancas (EPM, 2026); las plantas de potabilización La Ayurá y Manantiales tienen capacidades de 9,2 y 6,0 m³/s (Superservicios, con datos de EPM). Las aguas residuales del sur se tratan en San Fernando (Itagüí, desde 2000; 1,8 m³/s nominales) y las del norte en Aguas Claras (Bello, desde 2018; unos 5 m³/s); según EPM, en 2025 se trataba cerca del 93 % de las aguas residuales del valle.

**¿Y después de usarla?** El resumen de esta parte (lo que queda de la DBO5 después de cada etapa) se calcula con la planta de «De la casa al río» en su operación normal (`ptarStages` en `src/quality/ptar.ts`): 100 % después de rejas y desarenador, 66 % después del primario y 3 % después del secundario.

## 2 bis. De la casa al río (planta de tratamiento de aguas residuales)

Modelo en `src/quality/ptar.ts`; partes en `src/quality/ptarUnits.ts`; escena en `src/quality/three/ptarWorld.ts`; versión plana en `src/quality/classic/PtarPart.tsx`. La planta es una escena ilustrativa de lodos activados: no representa San Fernando, Aguas Claras ni otra planta real, y su resultado no es un diseño de ingeniería.

**Entradas.** Habitantes conectados (10 000 a 150 000; el modelo acepta de 5 000 a 150 000), líneas de tratamiento en servicio (1 o 2), clima (seco, lluvia, aguacero), sedimentador primario (sí o no), oxígeno disuelto que mantienen los sopladores en el reactor (0 a 4 mg/L), recirculación del lodo (sí o no), purga de lodo (poca, normal o mucha) y luz ultravioleta (sí o no). Las entradas inválidas se llevan a valores válidos (`sanitizePtar`).

| Pieza | Regla | Tipo |
|---|---|---|
| Agua residual cruda | 102 L por persona al día (la misma de la quebrada); DBO5 300, SST 250, amonio 25 mg/L de N, grasas y aceites 80 mg/L, 10⁷ coliformes fecales/100 mL, 22 °C, pH 7,2; DQO = 2·DBO5 + 25 | Valores típicos (Metcalf y Eddy) |
| Lluvia | alcantarillado combinado: llega 2 veces (lluvia) o 4 veces (aguacero) el caudal de tiempo seco; el agua de lluvia trae DBO5 20, SST 150, amonio 1 y grasas 5 mg/L y 10⁵ coliformes/100 mL | Ilustrativo |
| Capacidad y aliviadero | cada línea se dimensiona para 50 000 habitantes (5 100 m³/día) y recibe hasta 2,5 veces ese caudal; lo que sobra sale por el aliviadero, sin tratar, al río | Ilustrativo |
| Rejas, desarenador y desengrasador | basura 20 L por cada 1 000 m³ (×2 con lluvia, ×3,5 con aguacero); arena 15 L por 1 000 m³ (×3 y ×6); quitan la mitad de las grasas | Órdenes de magnitud |
| Sedimentador primario | 2 h de retención y 3,5 m de profundidad con el caudal de diseño (42 m³/m²·día); remoción R = t/(a + b·t) con t en horas: DBO a = 0,018, b = 0,020; SST a = 0,0075, b = 0,014; quita la mitad de las grasas que quedan y la mitad de los coliformes | Crites y Tchobanoglous (1998), en Metcalf y Eddy |
| Reactor | mezcla completa, 6 h de retención con el caudal de diseño, 22 °C; edad del lodo θc de 20, 8 o 1,5 días según la purga; sin recirculación, θc = tiempo de retención | Diseño ilustrativo |
| Heterótrofas | k = 5 d⁻¹ (θ 1,07), Ks = 60 mg/L, Y = 0,6, kd = 0,06 d⁻¹ (θ 1,04), por el oxígeno OD/(0,2 + OD); S = Ks(1 + kd·θc)/(θc(Y·k − kd) − 1); si θc ≤ 1/(Y·k − kd) las bacterias se lavan; X = (θc/θ)·Y(S0 − S)/(1 + kd·θc) | Metcalf y Eddy, 4.ª ed., tabla 7-9 |
| Nitrificantes | μ = 0,75 d⁻¹ (θ 1,07), K_N = 0,74 mg/L (θ 1,053), kd = 0,08 d⁻¹ (θ 1,04), por OD/(0,5 + OD); el nitrógeno de las bacterias nuevas (0,12 g/g) sale del amonio | Metcalf y Eddy, 4.ª ed., tabla 7-10 |
| Oxígeno y energía | O₂ = Q(S0 − S)/0,68 − 1,42·Px + 4,57·Q·N nitrificado; burbuja fina de 3,6 kg O₂/kWh en agua limpia, α = 0,5, por (Cs − OD)/Cs,20 y 1,024^(T − 20); bombeo y demás 0,12 kWh/m³; UV 0,03 kWh/m³ | Metcalf y Eddy; eficiencias típicas |
| Lodo del licor mixto | SST = X/0,8 + (θc/θ)·0,25·SST que entra; IVL de 110 mL/g (purga normal), 95 (poca), 170 (mucha), más 220·(1 − OD/1,2)^1,5 con menos de 1,2 mg/L de oxígeno (bacterias en hilos); V30 = SST·IVL/1 000 | Didáctica |
| Sedimentador secundario | sólidos que escapan = 10·e^((CS − 24)/20)·(SST/3 000)^0,7·(IVL/100)^0,8 mg/L (×2,2 con lodo muy joven), CS la carga superficial en m³/m²·día; nunca más que el agua que llega a la planta. DBO5 de salida = S + 0,5·SST (nunca más que la que entra al reactor); sin bacterias, la DBO pasa entera y se asienta 15 % de los sólidos | Didáctica |
| Coliformes | primario 0,3 unidades logarítmicas; biológico 1,5 (0,2 sin bacterias); luz UV 3,5/(1 + máx(0, SST − 10)/20) | Didáctica |
| Sólidos sedimentables | 0,04·SST en el agua cruda; el primario quita mín(95 %, 1,7·R_SST); a la salida, 0,03·SST (0,01 sin lodo) | Didáctica |
| Lodos y biogás | lodo primario = sólidos retenidos (65 % volátiles); lodo biológico = SST·V/θc; digestión del 60 % de los volátiles del primario y 35 % del biológico; 0,9 m³ de biogás por kg destruido, 65 % metano, 35,8 MJ/m³ de metano, 35 % de eficiencia eléctrica (2,26 kWh por m³ de biogás); torta con 22 % de sólidos | Rangos de Metcalf y Eddy |
| Río | 0,4, 1,2 o 3,5 m³/s según el clima, con agua de 21, 20 o 19 °C, 90 a 94 % de saturación, DBO5 3 a 8 mg/L y amonio 0,2 a 0,4 mg/L; ancho 10·Q^0,45 m y profundidad 0,9·Q^0,35 m; reaireación de O'Connor y Dobbins 3,93·U^0,5/H^1,5 d⁻¹; descomposición de la DBO 0,25 d⁻¹ (hasta 0,6 si llega agua sin tratar); nitrificación 0,5 d⁻¹; lodo del fondo hasta 5 g/m²·día en los primeros 4 km si llega agua sin tratar; Streeter y Phelps | Ilustrativo con ecuaciones publicadas |

**Norma.** Resolución 0631 de 2015 del Ministerio de Ambiente, artículo 8 (aguas residuales domésticas y de prestadores del servicio de alcantarillado vertidas a aguas superficiales). Los límites dependen de la carga de DBO5 de las aguas residuales: hasta 625 kg/día y de 625 a 3 000 kg/día, DQO 180, DBO5 90, SST 90 y grasas y aceites 20 mg/L; más de 3 000 kg/día, DQO 150, DBO5 70, SST 70 y grasas 10 mg/L; en todas, pH de 6 a 9 y sólidos sedimentables de 5 mL/L o menos; detergentes (SAAM), hidrocarburos, fósforo y nitrógeno se analizan y reportan. El artículo 6 pide analizar y reportar los coliformes termotolerantes cuando la carga antes del tratamiento pasa de 125 kg/día de DBO5. El juego toma la carga del agua residual que recoge el alcantarillado (102 L × 300 mg/L por persona: 625 kg/día con unos 20 400 habitantes y 3 000 kg/día con unos 98 000) y compara con los límites el agua tratada, no la del aliviadero. Para los peces del río: oxígeno de al menos 4,0 mg/L (aguas cálidas, Decreto 1594 de 1984, art. 45, compilado en el Decreto 1076 de 2015, art. 2.2.3.3.9.10) y amoníaco libre de 0,025 mg/L o menos (Directiva 78/659/CEE).

**Lo que enseña el cálculo.** En su operación normal (50 000 habitantes, tiempo seco, primario, 2 mg/L de oxígeno, recirculación, purga normal y UV) la planta saca DBO5 de 10 mg/L, SST de 13 mg/L y amonio de 0,4 mg/L, con 0,37 kWh/m³ de los que el biogás devuelve cerca de la mitad. Sin recirculación o sin aire, las bacterias se lavan y la DBO5 pasa entera; el río se queda sin oxígeno unos kilómetros más abajo. Con mucha purga, la edad del lodo (1,5 días) no alcanza para las nitrificantes y el amonio sale al río (más de 0,025 mg/L de amoníaco libre en la mezcla). Sin primario, la salida casi no cambia pero el reactor gasta 29 % más aire y sale 38 % menos biogás. Con 100 000 habitantes la norma es más estricta y una línea se queda pequeña (el secundario deja escapar sólidos); dos líneas cumplen. Con un aguacero, una línea alivia 37,5 % del agua sin tratar; dos líneas no alivian. Pruebas Q19 a Q26.

Cada parte tiene su animación «con lupa» (ilustrativa) en la pestaña Procesos: un corte con el agua del color de sus sólidos suspendidos y un círculo de aumento sobre el detalle, con los valores del juego al pie. Siguen el cálculo la lluvia y el agua que pasa por encima del muro del aliviadero, la basura atajada en las rejas (4·log₁₀(L/día + 1) objetos, hasta 14), el manto del primario según el lodo retenido (o «fuera de servicio»), las burbujas del reactor (10 por mg/L de oxígeno, hasta 40), los flóculos o las bacterias en hilos y el amonio que pasa a nitrato, el manto del secundario según el V30, las bacterias que la luz UV inactiva en la proporción calculada (las que van dentro de un sólido quedan protegidas), el oxígeno más bajo del río frente a los 4 mg/L de los peces, el lodo del espesador según el que llega, las burbujas de biogás y la cúpula del gasómetro, y la torta de la centrífuga.

| Parte | Rangos citados (valores típicos) | Fuente |
|---|---|---|
| 1. Llegada y aliviadero | 102 L por persona al día; cada línea recibe hasta 2,5 veces el caudal de diseño | Valores del juego |
| 2. Rejas | gruesas de 6 a 150 mm; finas de menos de 6 mm; 0,6 a 1,0 m/s entre barras | Metcalf y Eddy (2014) |
| 3. Desarenador y desengrasador | 2 a 5 min en un desarenador aireado; arena de 0,2 mm o más | Metcalf y Eddy (2014) |
| 4. Sedimentador primario | 1,5 a 2,5 h; 30 a 50 m³/m²·día; quita 50 a 70 % de los sólidos y 25 a 40 % de la DBO; 3 a 5 m de profundidad | Metcalf y Eddy (2014) |
| 5. Reactor | 3 a 8 h; edad del lodo de 3 a 15 días; licor mixto de 1 000 a 4 000 mg/L; oxígeno cerca de 2 mg/L | Metcalf y Eddy (2014) |
| 6. Sedimentador secundario | 16 a 28 m³/m²·día (medio) y 40 a 64 (máximo); 3,5 a 6 m; recirculación del 25 al 100 % | Metcalf y Eddy (2014) |
| 7. Desinfección UV | dosis del orden de 30 a 100 mJ/cm² | Metcalf y Eddy (2014) |
| 8. Descarga | límites de la Resolución 0631, art. 8; oxígeno para los peces | Res. 0631 de 2015; Decreto 1076 de 2015 |
| 9. Espesador | lodo primario de 5 a 10 % de sólidos; biológico de 2 a 6 % | Metcalf y Eddy (2014) |
| 10. Digestor y biogás | 30 a 38 °C; 15 a 20 días; 40 a 60 % de los volátiles; 0,75 a 1,12 m³/kg; 60 a 70 % metano | Metcalf y Eddy (2014) |
| 11. Deshidratación | torta de centrífuga de 20 a 30 % de sólidos | Metcalf y Eddy (2014) |

**Medellín** (contexto, sin cálculo): San Fernando (Itagüí, desde 2000; 1,8 m³/s nominales) trata con lodos activados y digiere sus lodos sin aire; Aguas Claras (Bello, desde 2018; unos 5 m³/s) tiene tratamiento secundario, digestión y secado térmico de los lodos; según EPM, en 2025 se trataba cerca del 93 % de las aguas residuales del valle.

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

## 4. Escenas 3D, retos y experimentos

Cada parte es una escena 3D (Three.js) alimentada por las mismas funciones de este documento; si el equipo no tiene WebGL se muestra la versión en dibujos planos (`src/quality/classic`), con el mismo cálculo. Lo que se dibuja y de dónde sale:

**La quebrada.** El color de cada tramo de agua mezcla un agua de montaña clara con café según la turbiedad y con gris verdoso según la DBO5 calculadas en ese punto; la espuma aparece cerca del tubo según la DBO5; con «Ver el oxígeno» el agua toma el color de su clase de oxígeno disuelto (7 o más, 5 a 7, 3 a 5, 1 a 3, menos de 1 mg/L). La distancia se comprime aguas abajo (u = 200·√(x/3 000) unidades del dibujo; aguas arriba, 0,18 por metro), con más espacio cerca del tubo (prueba Q10). Cada casa del barrio representa 10.

**Regla de los peces** (didáctica, con criterios publicados): hay peces donde el oxígeno disuelto es de al menos 5 mg/L —criterio de preservación de flora y fauna en aguas dulces frías del Decreto 1594 de 1984, compilado en el Decreto 1076 de 2015, artículo 2.2.3.3.9.10—, la DBO5 es de 6 mg/L o menos —valor guía para aguas ciprinícolas de la Directiva 78/659/CEE (hoy 2006/44/CE)— y el amoníaco libre es de 0,025 mg/L de NH₃ o menos —valor imperativo de la misma directiva—. Con el pH de la quebrada (cerca de 7,3) el amoníaco libre queda por debajo de ese límite en todos los casos del juego: la regla está para que la sonda lo muestre y para que se vea que subiría con un agua más alcalina. En una quebrada de montaña la reaireación es tan rápida que el oxígeno casi no baja; lo que aleja a los peces es la materia orgánica. En verano y con 600 casas, ni sin tratar ni con tanque séptico hay peces junto al tubo; con planta pequeña o alcantarillado vuelven a las cuatro estaciones (prueba Q9).

**Vigencia de los criterios.** Los criterios de calidad por uso del Decreto 1076 de 2015 (artículos 2.2.3.3.9.2 a 2.2.3.3.9.13) siguen vigentes de manera transitoria: la Resolución 0565 de 2026 del Ministerio de Ambiente, publicada el 21 de mayo de 2026, define los nuevos criterios y rige desde el 21 de mayo de 2027. Habrá que revisar entonces los criterios de nadar y de los peces.

**La planta.** Once procesos en línea (los lodos van detrás del sedimentador). Los tanques tienen el frente de vidrio; en el filtro solo se dibuja el agua que está sobre el lecho, para que se vean la grava, la arena y la antracita. El color del agua de cada tanque sigue la turbiedad de esa etapa; el número de partículas dibujadas es 13·log₁₀(T + 1) (hasta 46) y el de bacterias, 4·log₁₀(C + 1) (hasta 26), con C los coliformes totales por 100 mL de esa etapa: crecen con el cálculo, pero no son un conteo (prueba Q12). El lodo del sedimentador, la costra de los filtros y el lodo del espesador crecen con el logaritmo de lo retenido; la arena del desarenador y la basura en la rejilla, con el tipo de río. Las paletas de las tres zonas del floculador giran cada vez más despacio. «Lavar los filtros» anima un retrolavado de 7 s: suben burbujas, la costra sale y vuelve a formarse en unos 45 s. Las etiquetas se alternan en dos alturas para que las once quepan en la vista general. El agua se mueve: la superficie de cada tanque tiene vetas que avanzan hacia la salida y espuma donde el agua se agita (mucha alrededor de la paleta de la mezcla rápida, poca en el floculador, casi nada en el sedimentador), y el río corre con el color de la turbiedad del agua cruda; las velocidades son ilustrativas, no caudales calculados. Unas flechas avanzan sobre las tuberías con el color del agua de la etapa de la que salen, y otras, café, sobre la línea de lodos. Alrededor hay un patio de concreto, barandas en los bordes de los tanques, un edificio de laboratorio y control, una cerca, una vía de acceso y montañas con un valle por donde baja el río; un letrero en la entrada dice que es una escena ilustrativa y no una planta real. En pantallas angostas la vista general se aleja hasta que cabe toda la planta y, en el teléfono, la muestra en diagonal para aprovechar la pantalla vertical. Con movimiento reducido el agua y las flechas quedan quietas. El perfil hidráulico baja de un tanque al siguiente: el nivel del agua está a 3,81 m en la mezcla rápida, 3,61 m en los floculadores, 3,41 m en el sedimentador, 3,21 m en los filtros y 2,81 m en el tanque de contacto, y el agua pasa de la mezcla a los floculadores, al sedimentador y a los filtros por canales abiertos de concreto donde se ve correr (por gravedad, con su caída de nivel). Del desarenador a la mezcla rápida, que está más alta, la lleva una bomba (caseta de bombeo de agua cruda); después de los filtros el agua va por tubería cerrada. Las superficies del agua y los metales reflejan un cielo de degradé (sin texturas descargadas).

**De la casa al río.** Once partes en línea (llegada con aliviadero, rejas, desarenador y desengrasador, primario redondo, reactor, secundario redondo, canal de luz UV y gradas de la descarga) y, detrás, la línea de lodos (espesador, dos digestores, gasómetro, tea, motor-generador y centrífuga bajo cubierta). Los barrios están en la loma de la izquierda y el colector baja de ellos; el río corre al frente. Los tanques redondos tienen un tramo de vidrio por donde se ve el lodo del fondo: en el primario crece con el lodo retenido y en el secundario con el V30 de la probeta (más alto si el lodo se abulta). El color del agua de cada parte sigue sus sólidos suspendidos; el reactor es café (licor mixto) o gris si las bacterias se lavaron, y su espuma crece con el aire. Las burbujas del reactor son 40 por cada mg/L de oxígeno (hasta 160); la basura en las rejas, 7·log₁₀(L/día + 1) (hasta 48); la arena del desarenador y la lluvia, según el clima; la cúpula del gasómetro, con el biogás, y la torta del contenedor, con el biosólido. Cuando rebosa el aliviadero, el agua baja por su canal al río con basura flotando; en el río, la pluma de la descarga y la del aliviadero se abren y se diluyen aguas abajo (ilustrativas, con el color del agua que les llega). Hay peces aguas arriba siempre y frente a la planta solo si el río los aguanta. La segunda línea aparece al ponerla en servicio; mientras tanto se ve la losa reservada. Puentes de los sedimentadores, rastrillo de las rejas, varillas del espesador, tambor de la centrífuga y llama piloto de la tea se mueven; con movimiento reducido quedan quietos. Un letrero dice que es una escena ilustrativa y no una planta real.

**Prueba de sedimentación.** Cono Imhoff (una hora) con el agua que llega y con la tratada: muestra los sólidos sedimentables calculados en una escala cúbica (el volumen de un cono crece con el cubo de la altura). Probeta de 1 L (30 min) con el licor mixto: el manto de lodo baja hasta el V30 calculado y se informa el IVL.

**La calle.** Una cuadra ilustrativa (no es el levantamiento de una calle de Medellín) de veinte casas de barrio pegadas, de uno a cuatro pisos: frentes de ladrillo a la vista o pañetados y pintados, armados con los mismos módulos de fachada del laboratorio de Medellín (ventanas con reja o con marco de aluminio, balcones con losa y baranda, puertas, garajes y algunos locales con avisos genéricos), culatas de ladrillo, azoteas con pretil, tanque de agua y a veces un cuarto útil con teja ondulada, o techos de teja de barro a dos aguas; detrás hay más barrio. La calle tiene vía de asfalto con demarcación y una cebra, cunetas, bordillos, andenes de losetas con árboles y postes de luz, carros parqueados y un sumidero de rejilla con su boca en el bordillo. El suelo está en corte, con vidrio al frente y en el costado izquierdo: se ven las capas del pavimento (asfalto, base de grava y andén), los estratos del suelo y, bajo la calle, los dos tubos sobre su cama de grava con sus anillos de unión, los pozos de inspección con su tapa de hierro y, por cada casa, la caja de inspección bajo el andén y el desagüe hasta su tubo. Unas marcas avanzan siempre sobre el tubo de aguas residuales y sobre el de aguas lluvias cuando llueve (más tenues si hay casas conectadas por error). El tubo de aguas lluvias baja enterrado por la ladera hasta un cabezote de concreto con enrocado en la orilla de la quebrada; la pluma de la descarga es una cinta que se abre y se aclara aguas abajo (ilustrativa, con el color del agua que llega: café con el lavado de la calle, gris con agua usada y rosada con el colorante). Mientras llueve el cielo se oscurece, se encienden los postes y algunas ventanas, y la calle y los muros se mojan (con charcos que brillan); al escampar se secan despacio. La vista «Los tubos» muestra la cuadra en sección por el costado: casa, caja de inspección, desagüe y los dos tubos. Las manchas de mugre son 4 por cada g/m² acumulado (hasta 110) y los papeles y plásticos, los objetos calculados (hasta 90). Cada uno sale de la calle cuando la fracción lavada (masa arrastrada sobre lo acumulado) alcanza su turno; lo que la lluvia no alcanza a lavar se queda. La animación dura 0,4 s por minuto de lluvia. La prueba del colorante sigue el desagüe de la casa por su tubo: las casas mal conectadas son las primeras k de un orden fijo, siempre las mismas (prueba Q11).

**Microscopio.** El número de bastoncitos es 6·log₁₀(C + 1) (10 → 6, mil → 18, un millón → 36; hasta 48).

**Retos.** Se revisan con el estado de la escena; al cumplirse se guarda la medalla en el equipo y se anota en la bitácora. La quebrada: que vuelvan los peces (verano, 600 casas o más, peces en las cuatro estaciones), detective de bichos (piedras en A y B con el tubo sin tratar), ¿se puede nadar? (un punto abajo del tubo que cumpla el criterio de contacto primario con 300 casas o más) y bacterias en una gota. La planta: los once pasos (abrirlos todos en la pestaña Procesos), la jarra más clara, agua segura después de la lluvia (IRCA 0 %), el cloro justo (IRCA 0 % con 1,4 mg/L o menos), la creciente (acercarse a la mejor dosis; ni así baja de 2 UNT) y bacterias en el vaso. De la casa al río: las once partes, sin recirculación (ver el lavado de las bacterias y volver a cumplir), amonio para los peces (ver el amonio con purga «mucha» y bajarlo de 2 mg/L con peces en el río), cumplir gastando poco (tiempo seco, 50 000 habitantes o más y UV: cumplir, amonio < 2 mg/L, IVL ≤ 150 y energía neta ≤ 0,17 kWh/m³; con 1 mg/L de oxígeno se logra, con la operación normal no), la ciudad creció (100 000 habitantes o más en tiempo seco, cumpliendo), el aguacero (50 000 habitantes o más, sin aliviar y con peces), bacterias a la salida (microscopio con y sin UV) y la probeta de 30 minutos (un lodo que se asienta mal y uno que se asienta bien). La calle: detective de conexiones erradas, el primer lavado (10 días secos o más, con y sin barrido) y una quebrada que no recibe mugre (5 kg o menos con un aguacero fuerte).

## 4 bis. Datos reales: 18 quebradas de San Antonio de Prado

La pestaña **Medellín** de «La quebrada y su salud» muestra mediciones reales. Fuente: capa «Sitios Muestreo» del servicio `ambiente_dllo_sost/VM_Monitoreo_Calidad_Agua` del servidor de mapas de la Alcaldía de Medellín (Secretaría de Medio Ambiente): monitoreo de 18 microcuencas del corregimiento de San Antonio de Prado (convenios de 2012–2013 y 2014 y contrato de 2017). Se descargó sin modificar, con su sha256 en `tools/geo/insumos/manifiesto.json` (paquete `medellin-calidad-insumos-9`), y `tools/geo/calidad_monitoreo.py` la convierte en `src/quality/data/monitoreo.ts`:

- 75 sitios publicados; 7 sin medición (todo en cero: Astillera, Popala, un sitio de Zulia y un afluente de La Larga) se dejan fuera. Quedan **68 sitios con medición**, del 19 de diciembre de 2017 al 22 de enero de 2018.
- Cada sitio se asigna a su microcuenca (la lista de la descripción de la capa) y a su parte del cauce (alta, media alta, media, media baja, baja, como la publica la capa), y se le une la calidad de su retiro (capa «Calidad Retiros», mismo identificador).
- La DBO5 viene como texto: «< 2,00» es menor que el límite de detección y se muestra así. Nada se corrige ni se completa.

**Lo que dicen los datos** (calculado en `src/quality/realdata.ts`, no escrito a mano; prueba Q15):

| Hallazgo | Valor |
|---|---|
| Sitios con oxígeno disuelto de al menos 5 mg/L | 64 de 68 (mediana 7,3 mg/L; 97 % de saturación) |
| Sitios con coliformes fecales por encima de 200 NMP/100 mL (no se puede nadar) | 60 de 68; los 8 restantes, casi todos en la parte alta |
| Quebradas con sitio alto y bajo donde los coliformes suben aguas abajo | 13 de 16 |
| Temperatura del agua implícita en el oxígeno y su saturación (Benson y Krause a la altitud de cada sitio) | 13,8 a 19,1 °C (5 % a 95 %): los dos números del laboratorio son coherentes con la ecuación del modelo |

**Frente al modelo.** Con 600 casas sin tratar en una quebrada de montaña, el modelo da oxígeno de al menos 5 mg/L en todo el tramo y coliformes que impiden nadar en los 3 km: lo mismo que las quebradas reales. No es una calibración: el modelo no se ajustó a estos datos, y cada medición es de un solo día (cambia con la lluvia y la hora). Dos retos usan esta pestaña: «Datos de verdad» (una quebrada donde los coliformes suben de la parte alta a la baja) y «¿Dónde se podría nadar de verdad?».

## 5. Accesibilidad

Pestañas con teclado (flechas), la quebrada real se elige con una lista desplegable y sus gráficas tienen descripción textual y tabla equivalente (que se desplaza de lado en el teléfono), pasos de la planta como botones con el paso actual anunciado (`aria-current` y región «Paso n de 11» que se lee al cambiar), «Recorrer la planta» que se detiene con el mismo botón, escenas con descripción textual, rótulos que también son botones (las estaciones de la quebrada), controles equivalentes fuera de la escena (estaciones, casas del colorante y jarras como botones), gráficas navegables con flechas, colores con texto (cumple o no cumple, hay peces o no), movimiento reducido respetado (sin animación, la lluvia y el colorante dan su resultado de una vez).

## 6. Referencias

- APHA, AWWA, WEF. *Standard Methods for the Examination of Water and Wastewater*, 4500-O.
- Fischer, H. B., List, E. J., Koh, R. C. Y., Imberger, J. y Brooks, N. H. (1979). *Mixing in Inland and Coastal Waters*. Academic Press (cap. 5, mezcla transversal en ríos).
- Alcaldía de Medellín, Secretaría de Medio Ambiente. Monitoreo de quebradas del corregimiento de San Antonio de Prado (capas «Sitios Muestreo» y «Calidad Retiros» del servicio VM_Monitoreo_Calidad_Agua del servidor de mapas), consulta de noviembre de 2026.
- Bowie, G. L. et al. (1985). *Rates, Constants, and Kinetics Formulations in Surface Water Quality Modeling*, 2.ª ed. EPA/600/3-85/040.
- Emerson, K., Russo, R. C., Lund, R. E. y Thurston, R. V. (1975). Aqueous ammonia equilibrium calculations: effect of pH and temperature. *Journal of the Fisheries Research Board of Canada*, 32(12), 2379–2383.
- Metcalf & Eddy (2003). *Wastewater Engineering: Treatment and Reuse*, 4.ª ed. McGraw-Hill (composición típica del agua residual doméstica; coeficientes cinéticos de las tablas 7-9 y 7-10).
- Consejo de las Comunidades Europeas. Directiva 78/659/CEE, relativa a la calidad de las aguas continentales que requieren protección o mejora para ser aptas para la vida de los peces (codificada como 2006/44/CE). Anexo I: DBO5 ≤ 3 mg/L (salmonícolas) y ≤ 6 mg/L (ciprinícolas), valores guía.
- Ministerio de Ambiente y Desarrollo Sostenible. Resolución 0565 de 2026, por la cual se definen los criterios de calidad para el uso de las aguas superficiales, subterráneas y marinas (Diario Oficial 53.497, 21 de mayo de 2026; rige desde el 21 de mayo de 2027).
- DANE, Sistema de Información del Medio Ambiente. Ficha técnica «Oxígeno disuelto» (criterios del Decreto 1594 de 1984: 5,0 mg/L en aguas dulces frías y 4,0 mg/L en cálidas para preservación de flora y fauna).
- Chapra, S. C. (1997). *Surface Water-Quality Modeling*. McGraw-Hill.
- Crites, R. y Tchobanoglous, G. (1998). *Small and Decentralized Wastewater Management Systems*. McGraw-Hill (remoción en el sedimentador primario según el tiempo de retención).
- Metcalf & Eddy, AECOM (2014). *Wastewater Engineering: Treatment and Resource Recovery*, 5.ª ed. McGraw-Hill (rangos de diseño de rejas, desarenadores, sedimentadores, lodos activados, UV, espesadores, digestión y deshidratación).
- Ministerio de Ambiente y Desarrollo Sostenible. Resolución 0631 de 2015, por la cual se establecen los parámetros y los valores límites máximos permisibles en los vertimientos puntuales a cuerpos de aguas superficiales y a los sistemas de alcantarillado público (arts. 6 y 8); vigencia según la Resolución 2659 de 2015.
- O'Connor, D. J. y Dobbins, W. E. (1958). Mechanism of reaeration in natural streams. *Transactions of the ASCE*, 123, 641–684.
- Decreto 1076 de 2015, Ministerio de Ambiente y Desarrollo Sostenible, art. 2.2.3.3.9.7.
- EPM (2025–2026), comunicados sobre las plantas San Fernando y Aguas Claras y sobre las fuentes de abastecimiento; Superservicios, informe de acueducto y alcantarillado (capacidades de las plantas de EPM).
- Resolución 2115 de 2007, Ministerio de la Protección Social y Ministerio de Ambiente, Vivienda y Desarrollo Territorial.
- Ministerio de Vivienda, Ciudad y Territorio. Resolución 0330 de 2017, Reglamento Técnico para el Sector de Agua Potable y Saneamiento Básico (RAS), con las modificaciones de las Resoluciones 799 y 908 de 2021; texto compilado de la Comisión de Regulación de Agua Potable y Saneamiento Básico (CRA), artículos 55, 111 a 114, 121, 122, 125 y 133.
- Roldán, G. (2003). *Bioindicación de la calidad del agua en Colombia. Uso del método BMWP/Col*. Universidad de Antioquia.
- Roldán-Pérez, G. (2016). Los macroinvertebrados como bioindicadores de la calidad del agua: cuatro décadas de desarrollo en Colombia y Latinoamérica. *Rev. Acad. Colomb. Cienc. Ex. Fis. Nat.* 40(155): 254–274.
- Sartor, J. D., y Boyd, G. B. (1972). *Water Pollution Aspects of Street Surface Contaminants*. EPA-R2-72-081.
- Streeter, H. W., y Phelps, E. B. (1925). *A study of the pollution and natural purification of the Ohio River*. U.S. Public Health Service, Bulletin 146.
