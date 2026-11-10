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

Las animaciones «con lupa» son ilustrativas. Donde dependen del juego usan los valores calculados: la neutralización de cargas sigue la dosis frente a la dosis justa (con más del doble, las partículas quedan positivas), el tamaño de los flocs sigue la remoción, el cloro deja de actuar si no queda cloro libre, el pH es el calculado y la red muestra el cloro en la llave. La prueba Q13 revisa que los once pasos estén completos, en orden y en la escena, que sus valores sean números válidos en 18 combinaciones de río, dosis y cloro, que citen los artículos de la Resolución 0330 y que el IRCA mostrado sea el calculado.

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

## 4. Escenas 3D, retos y experimentos

Cada parte es una escena 3D (Three.js) alimentada por las mismas funciones de este documento; si el equipo no tiene WebGL se muestra la versión en dibujos planos (`src/quality/classic`), con el mismo cálculo. Lo que se dibuja y de dónde sale:

**La quebrada.** El color de cada tramo de agua mezcla un agua de montaña clara con café según la turbiedad y con gris verdoso según la DBO5 calculadas en ese punto; la espuma aparece cerca del tubo según la DBO5; con «Ver el oxígeno» el agua toma el color de su clase de oxígeno disuelto (7 o más, 5 a 7, 3 a 5, 1 a 3, menos de 1 mg/L). La distancia se comprime aguas abajo (u = 200·√(x/3 000) unidades del dibujo; aguas arriba, 0,18 por metro), con más espacio cerca del tubo (prueba Q10). Cada casa del barrio representa 10.

**Regla de los peces** (didáctica, con dos criterios publicados): hay peces donde el oxígeno disuelto es de al menos 5 mg/L —criterio de preservación de flora y fauna en aguas dulces frías del Decreto 1594 de 1984, compilado en el Decreto 1076 de 2015, artículo 2.2.3.3.9.10— y la DBO5 es de 6 mg/L o menos —valor guía para aguas ciprinícolas de la Directiva 78/659/CEE (hoy 2006/44/CE)—. En una quebrada de montaña la reaireación es tan rápida que el oxígeno casi no baja; lo que aleja a los peces es la materia orgánica. En verano y con 600 casas, ni sin tratar ni con tanque séptico hay peces junto al tubo; con planta pequeña o alcantarillado vuelven a las cuatro estaciones (prueba Q9).

**Vigencia de los criterios.** Los criterios de calidad por uso del Decreto 1076 de 2015 (artículos 2.2.3.3.9.2 a 2.2.3.3.9.13) siguen vigentes de manera transitoria: la Resolución 0565 de 2026 del Ministerio de Ambiente, publicada el 21 de mayo de 2026, define los nuevos criterios y rige desde el 21 de mayo de 2027. Habrá que revisar entonces los criterios de nadar y de los peces.

**La planta.** Once procesos en línea (los lodos van detrás del sedimentador). Los tanques tienen el frente de vidrio; en el filtro solo se dibuja el agua que está sobre el lecho, para que se vean la grava, la arena y la antracita. El color del agua de cada tanque sigue la turbiedad de esa etapa; el número de partículas dibujadas es 13·log₁₀(T + 1) (hasta 46) y el de bacterias, 4·log₁₀(C + 1) (hasta 26), con C los coliformes totales por 100 mL de esa etapa: crecen con el cálculo, pero no son un conteo (prueba Q12). El lodo del sedimentador, la costra de los filtros y el lodo del espesador crecen con el logaritmo de lo retenido; la arena del desarenador y la basura en la rejilla, con el tipo de río. Las paletas de las tres zonas del floculador giran cada vez más despacio. «Lavar los filtros» anima un retrolavado de 7 s: suben burbujas, la costra sale y vuelve a formarse en unos 45 s. Las etiquetas se alternan en dos alturas para que las once quepan en la vista general.

**La calle.** Las manchas de mugre son 4 por cada g/m² acumulado (hasta 110) y los papeles y plásticos, los objetos calculados (hasta 90). Cada uno sale de la calle cuando la fracción lavada (masa arrastrada sobre lo acumulado) alcanza su turno; lo que la lluvia no alcanza a lavar se queda. La animación dura 0,4 s por minuto de lluvia. La prueba del colorante sigue el desagüe de la casa por su tubo: las casas mal conectadas son las primeras k de un orden fijo, siempre las mismas (prueba Q11). La tierra se dibuja transparente para ver los tubos.

**Microscopio.** El número de bastoncitos es 6·log₁₀(C + 1) (10 → 6, mil → 18, un millón → 36; hasta 48).

**Retos.** Se revisan con el estado de la escena; al cumplirse se guarda la medalla en el equipo y se anota en la bitácora. La quebrada: que vuelvan los peces (verano, 600 casas o más, peces en las cuatro estaciones), detective de bichos (piedras en A y B con el tubo sin tratar), ¿se puede nadar? (un punto abajo del tubo que cumpla el criterio de contacto primario con 300 casas o más) y bacterias en una gota. La planta: los once pasos (abrirlos todos en la pestaña Procesos), la jarra más clara, agua segura después de la lluvia (IRCA 0 %), el cloro justo (IRCA 0 % con 1,4 mg/L o menos), la creciente (acercarse a la mejor dosis; ni así baja de 2 UNT) y bacterias en el vaso. La calle: detective de conexiones erradas, el primer lavado (10 días secos o más, con y sin barrido) y una quebrada que no recibe mugre (5 kg o menos con un aguacero fuerte).

## 5. Accesibilidad

Pestañas con teclado (flechas), pasos de la planta como botones con el paso actual anunciado (`aria-current` y región «Paso n de 11» que se lee al cambiar), «Recorrer la planta» que se detiene con el mismo botón, escenas con descripción textual, rótulos que también son botones (las estaciones de la quebrada), controles equivalentes fuera de la escena (estaciones, casas del colorante y jarras como botones), gráficas navegables con flechas, colores con texto (cumple o no cumple, hay peces o no), movimiento reducido respetado (sin animación, la lluvia y el colorante dan su resultado de una vez).

## 6. Referencias

- APHA, AWWA, WEF. *Standard Methods for the Examination of Water and Wastewater*, 4500-O.
- Consejo de las Comunidades Europeas. Directiva 78/659/CEE, relativa a la calidad de las aguas continentales que requieren protección o mejora para ser aptas para la vida de los peces (codificada como 2006/44/CE). Anexo I: DBO5 ≤ 3 mg/L (salmonícolas) y ≤ 6 mg/L (ciprinícolas), valores guía.
- Ministerio de Ambiente y Desarrollo Sostenible. Resolución 0565 de 2026, por la cual se definen los criterios de calidad para el uso de las aguas superficiales, subterráneas y marinas (Diario Oficial 53.497, 21 de mayo de 2026; rige desde el 21 de mayo de 2027).
- DANE, Sistema de Información del Medio Ambiente. Ficha técnica «Oxígeno disuelto» (criterios del Decreto 1594 de 1984: 5,0 mg/L en aguas dulces frías y 4,0 mg/L en cálidas para preservación de flora y fauna).
- Chapra, S. C. (1997). *Surface Water-Quality Modeling*. McGraw-Hill.
- Decreto 1076 de 2015, Ministerio de Ambiente y Desarrollo Sostenible, art. 2.2.3.3.9.7.
- EPM (2025–2026), comunicados sobre las plantas San Fernando y Aguas Claras y sobre las fuentes de abastecimiento; Superservicios, informe de acueducto y alcantarillado (capacidades de las plantas de EPM).
- Resolución 2115 de 2007, Ministerio de la Protección Social y Ministerio de Ambiente, Vivienda y Desarrollo Territorial.
- Ministerio de Vivienda, Ciudad y Territorio. Resolución 0330 de 2017, Reglamento Técnico para el Sector de Agua Potable y Saneamiento Básico (RAS), con las modificaciones de las Resoluciones 799 y 908 de 2021; texto compilado de la Comisión de Regulación de Agua Potable y Saneamiento Básico (CRA), artículos 55, 111 a 114, 121, 122, 125 y 133.
- Roldán, G. (2003). *Bioindicación de la calidad del agua en Colombia. Uso del método BMWP/Col*. Universidad de Antioquia.
- Roldán-Pérez, G. (2016). Los macroinvertebrados como bioindicadores de la calidad del agua: cuatro décadas de desarrollo en Colombia y Latinoamérica. *Rev. Acad. Colomb. Cienc. Ex. Fis. Nat.* 40(155): 254–274.
- Sartor, J. D., y Boyd, G. B. (1972). *Water Pollution Aspects of Street Surface Contaminants*. EPA-R2-72-081.
- Streeter, H. W., y Phelps, E. B. (1925). *A study of the pollution and natural purification of the Ohio River*. U.S. Public Health Service, Bulletin 146.
