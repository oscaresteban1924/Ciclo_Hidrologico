# Pruebas del módulo «Calidad del agua»

Se ejecutan con `npm run test:quality`. Cada prueba declara su tolerancia antes de ejecutarse.

**26 de 26 cumplen.**

## Q1. Oxígeno disuelto de saturación y altitud de Medellín — cumple

- Tolerancia: a nivel del mar, 9,09 mg/L a 20 °C, 8,26 a 25 °C y 11,29 a 10 °C (tabla de Standard Methods, error < 0,02 mg/L); a 1 495 m la presión es 0,835 de la del mar (error < 0,002) y la saturación baja en la misma proporción
- Medido: 20 °C: 9.092; 25 °C: 8.263; 10 °C: 11.288 mg/L; presión a 1 495 m: 0.8350; saturación a 20 °C en Medellín: 7.592 mg/L

## Q2. Profundidad por Manning, reaireación de Tsivoglou y descomposición de la DBO — cumple

- Tolerancia: con 0,15 m³/s en 4 m de ancho, pendiente 4 % y n = 0,05 la profundidad es la del cálculo a mano (error < 10⁻¹²) y U·H·ancho = Q; ka = 31 183·S·U; kd = 0,3·(H/2,4)^−0,434
- Medido: H 0.0607 m (a mano 0.0607), U 0.618 m/s, caudal reconstruido 0.150000 m³/s; ka 770.6 1/día; kd 1.480 1/día

## Q3. Mezcla completa en el punto del vertimiento — cumple

- Tolerancia: con 300 casas (1 200 personas, 102 L/persona·día) el caudal vertido es 1,417 L/s; coliformes y conductividad justo después del vertimiento iguales al balance de masa a mano (error < 10⁻⁹)
- Medido: vertimiento 1.417 L/s; quebrada 150 L/s; coliformes 93709 (a mano 93709); conductividad 77.77 µS/cm (a mano 77.77)

## Q4. Curva de oxígeno de Streeter y Phelps con demanda del lodo y nitrificación — cumple

- Tolerancia: la solución analítica coincide con la integración numérica fina de las ecuaciones de DBO, amonio y oxígeno (diferencia < 0,01 mg/L en 2 km, en el oxígeno y en el amonio); con 600 casas sin tratamiento, verano y cauce plano, el mínimo de oxígeno está aguas abajo del vertimiento y a 3 km el oxígeno es mayor que en el mínimo
- Medido: diferencia máxima 2.6e-5 mg/L de oxígeno y 9.1e-9 mg/L de amonio; amonio en la mezcla 1.37 mg/L de N (kn 0.41 1/día); mezcla 7.28 mg/L; mínimo 6.03 mg/L a 800 m; a 2 km 7.21 mg/L; a 3 km 7.38 mg/L (ka 39.5, kd 1.43 1/día)

## Q5. Respuesta del modelo a las decisiones del barrio — cumple

- Tolerancia: 100 m aguas abajo: con 900 casas hay más coliformes y DBO y menos oxígeno que con 300; conectadas al alcantarillado, el agua es la de arriba (solo cambia por la muerte natural de los microbios); con planta secundaria los coliformes bajan más de 50 veces; en verano (menos caudal) hay más coliformes; aguas arriba se puede nadar y abajo del vertimiento no
- Medido: coliformes 300/900 casas: 93595 / 275336; DBO 4.28 / 9.70 mg/L; oxígeno 7.88 / 7.83 mg/L; alcantarillado 150; planta 2898; verano 275151; arriba 150 NMP/100 mL

## Q6. Bioindicadores: puntajes BMWP/Col, clases y presencia — cumple

- Tolerancia: los 18 puntajes son los de la tabla de Roldán (2003) reproducida por Roldán-Pérez (2016); las clases cortan en 101, 61, 36 y 16; la quebrada limpia de arriba da clase I (más de 100) y la quebrada con 900 casas sin tratar en verano y cauce plano da clase III o peor, con más gusanos de lodo y larvas rojas que arriba
- Medido: arriba: 14 familias, BMWP/Col 103 (clase I, Buena); abajo: 5 familias (Physidae, Glossiphoniidae, Chironomidae, Culicidae, Tubificidae), BMWP/Col 11 (clase V)

## Q7. Planta de potabilización e índice IRCA — cumple

- Tolerancia: la prueba de jarras tiene forma de U: con la dosis óptima el agua sedimentada es más clara que con un tercio o con el triple; con dosis óptima y 1,5 mg/L de cloro el agua cumple las cinco características (IRCA 0, sin riesgo); sin coagulante los filtros se tapan y no cumple la turbiedad; sin cloro fallan cloro, coliformes y E. coli y el IRCA es la suma de sus puntajes (15 + 15 + 25) sobre 71,5; con 4 mg/L el cloro pasa de 2,0 mg/L
- Medido: dosis óptima 27.8 mg/L; sedimentada 2.40 / 60.00 / 60.00 UNT (óptima, un tercio, triple); con todo bien: IRCA 0.0 (Sin riesgo), turbiedad 0.24 UNT, cloro 0.86–0.47 mg/L; sin coagulante: 18.0 UNT, filtros tapados sí; sin cloro: IRCA 76.9 (Riesgo alto); exceso: 3.36 mg/L

## Q8. Lavado de la calle y primer lavado — cumple

- Tolerancia: con 7 días secos y 15 mm de lluvia, la masa arrastrada es B·(1 − e^(−0,18·15)) (error < 10⁻⁹ kg); la concentración baja minuto a minuto (primer lavado) y los primeros 10 mm llevan más de 80 %; el barrido reduce la mugre a la mitad; 3 casas con conexión errada vierten 1,224 m³ de agua residual al día
- Medido: arrastrado 26.282 kg (a mano 26.282); primeros 10 mm: 89.5 %; concentración del minuto 1 al 30: 4491 → 330 mg/L; con barrido 13.141 kg; conexiones erradas 1.224 m³/día

## Q9. Peces de la escena: oxígeno de al menos 5 mg/L y DBO5 de 6 mg/L o menos — cumple

- Tolerancia: la regla acepta exactamente los bordes (5 mg/L y 6 mg/L) y rechaza lo que pasa de ellos; en verano con 600 casas: sin tratar y con tanque séptico no hay peces junto al tubo (B); con planta pequeña o alcantarillado hay peces en las cuatro estaciones; arriba del tubo (A) siempre hay
- Medido: bordes correctos; estaciones con peces (de 4): directo 1, séptico 1, planta 4, alcantarillado 4; DBO5 en B: 17.5 / 11.1 / 3.0 / 1.5 mg/L

## Q10. Escala del dibujo de la quebrada (comprimida aguas abajo) — cumple

- Tolerancia: ida y vuelta entre metros y dibujo con error < 10⁻⁹ m en −400 a 3 000 m, y el orden de los puntos se conserva (las estaciones y la sonda caen donde corresponde)
- Medido: error máximo 1.1e-13 m; orden conservado; 600 m → 89.4, 2 500 m → 182.6 unidades

## Q11. Casas mal conectadas del juego del colorante — cumple

- Tolerancia: con k casas pedidas hay exactamente k (de 0 a 20), siempre las mismas en cada visita, y al subir k se agregan casas sin cambiar las anteriores
- Medido: tamaños correctos; anidadas sí; deterministas sí; con 3: casas 15, 13, 19

## Q12. Partículas, bacterias y bastoncitos del dibujo — cumple

- Tolerancia: el número dibujado nunca baja cuando sube la turbiedad o el conteo; sin bacterias no se dibuja ninguna; con la dosis justa y 1,3 mg/L de cloro el vaso de la llave queda sin bacterias y con 0 mg/L sí tiene
- Medido: partículas no decrecientes; bacterias no decrecientes; bastoncitos no decrecientes; vaso con cloro justo: 0 (IRCA 0 %); sin cloro: 5

## Q13. Los once procesos de la planta convencional — cumple

- Tolerancia: once procesos numerados del 1 al 11 sin repetir, cada uno con texto, mecanismo, criterios de diseño, fuente, fallas y mediciones, y con su lugar en la escena; sus valores «en el juego» existen y son números válidos para los tres ríos, tres dosis y dos dosis de cloro (ninguno NaN ni vacío); los procesos citan los artículos 55, 111, 112, 113, 114, 121 y 125 de la Resolución 0330 de 2017; el IRCA que muestra la llave es el calculado
- Medido: orden correcto; completos 11 de 11; en la escena todos; valores revisados 468, inválidos 0; citas correctas; IRCA de la llave coincide (97.9 %)

## Q14. Amoníaco libre (Emerson et al.) y nitrificación aguas abajo — cumple

- Tolerancia: fracción de NH₃ libre igual a la tabla de Emerson et al. (1975) a 20 y 25 °C y pH 7, 8 y 9 (error relativo < 2 %); amonio de la mezcla = balance de masa (error < 10⁻⁹) y aguas abajo = N₀·e^(−kn·t) (error < 10⁻⁹); el amoníaco libre de la lectura es el amonio por su fracción libre; el amonio que llega baja con cada tratamiento (directo = séptico ≥ planta ≥ alcantarillado) y la demanda nitrogenada (4,57 g O₂/g N) es positiva
- Medido: error máximo frente a la tabla 0.70 %; amonio en la mezcla 1.3691 frente a 1.3691 mg/L; a 1,5 km 1.3339 frente a 1.3339 mg/L; NH₃ libre 10.27 µg/L; amonio que llega (directo, séptico, planta, alcantarillado): 0.493 / 0.493 / 0.261 / 0.030 mg/L; demanda nitrogenada en la mezcla 6.26 mg/L de O₂ (50 % del amonio queda con la planta pequeña)

## Q15. Datos reales de 18 quebradas de San Antonio de Prado y lo que dicen frente al modelo — cumple

- Tolerancia: 68 sitios con medición en 18 microcuencas, todos con números válidos y medidos entre diciembre de 2017 y enero de 2018; los sitios de cada microcuenca, de la parte alta a la baja; el resumen del panel = un recuento independiente; el oxígeno y la saturación medidos son coherentes con la ecuación de Benson y Krause a la altitud del sitio (temperatura del agua implícita entre 10 y 26 °C en al menos 90 % de los sitios; ida y vuelta < 10⁻⁶ mg/L); el modelo y los datos coinciden en lo cualitativo: oxígeno de al menos 5 mg/L en la mayoría de los sitios reales y en la quebrada de montaña del modelo, y coliformes por encima del criterio para nadar en la mayoría de los sitios reales y en todo el tramo del modelo con 600 casas sin tratar
- Medido: 68 sitios en 18 microcuencas (2017-12-19 a 2018-01-22); números válidos; fechas en el rango; orden correcto; oxígeno ≥ 5 mg/L: 64 (recuento 64) de 68, mediana 7.28 mg/L y 96.7 %; coliformes > 200: 60 (recuento 60) de 68; suben aguas abajo en 13 de 16 microcuencas; temperatura implícita 13.8–19.1 °C (5 % a 95 %), coherente en 68 de 68; modelo: oxígeno mínimo 7.53 mg/L, ¿se puede nadar en algún punto? no

## Q16. Robustez ante miles de entradas al azar y entradas inválidas — cumple

- Tolerancia: 6 000 barrios, 6 000 plantas y 2 000 calles al azar (8 % de los números son NaN, infinitos, negativos, enormes o de otro tipo, y algunas opciones no existen): ninguna excepción; ningún NaN ni infinito; oxígeno entre 0 y la saturación; DBO, coliformes, turbiedad y amonio ≥ 0; amoníaco libre ≤ amonio; pH entre 6 y 9; IRCA entre 0 y 100; cloro en la llave ≤ cloro a la salida; turbiedad filtrada entre 0 y la del río; masa lavada creciente y nunca mayor que la acumulada; primer lavado entre 0 y 100 %; las entradas saneadas quedan en sus límites
- Medido: lecturas de la quebrada 36000 (fuera de rango 0); plantas 6000 (fuera de rango 0); calles 2000 (fuera de rango 0); excepciones 0; límites correctos

## Q17. Coherencia de las respuestas en toda la malla de decisiones — cumple

- Tolerancia: en 2 cauces × 3 temporadas × lluvia reciente o no × árboles o no: más casas nunca bajan la DBO, los coliformes ni el amonio ni suben el oxígeno; un mejor tratamiento nunca sube la DBO ni los coliformes; más caudal (verano → normal → lluvias) baja las concentraciones junto al tubo; en la planta, más cloro nunca deja menos cloro en la llave ni menos inactivación; en la calle, más días secos nunca lavan menos mugre y barrer nunca lava más; 0 violaciones
- Medido: 11218 comprobaciones; violaciones 0

## Q18. Pluma del tubo: conserva la masa, se mezcla en el largo de Fischer y nunca supera el agua del tubo — cumple

- Tolerancia: en 3 temporadas × 2 cauces × 60, 600 y 3000 casas y a 20, 60, 200, 600 y 2000 m: la media a lo ancho del exceso relativo es 1 (error < 0,5 %); en Lm = 0,4·U·W²/εt las dos orillas están dentro del 5 % de la media; aguas abajo, en la línea donde cae el chorro la pluma nunca sube y en la orilla opuesta nunca baja; nunca más que el agua del tubo sin mezclar; sin casas, sin pluma
- Medido: 18 casos; error máximo de la media 0.000 %; desvío máximo en Lm 3.59 %; violaciones de orden 0; sobre el tope 0; sin casas F = 1; Lm con 600 casas: verano/montana 1185 m, verano/plana 1203 m, normal/montana 697 m, normal/plana 708 m, lluvioso/montana 429 m, lluvioso/plana 436 m

## Q19. Lodos activados: Monod con edad del lodo, lavado sin recirculación y balances de biomasa y oxígeno — cumple

- Tolerancia: S del reactor igual a Ks(1 + kd·θc)/(θc(Y·k − kd) − 1) (error < 0,01 mg/L) e igual con lluvia; sin recirculación y sin aire hay lavado (DBO de salida > 100 mg/L); lodo purgado = lodo que crece (error < 0,1 %); oxígeno según Metcalf y Eddy (error < 0,1 %); primario de 2 h: 34,5 ± 0,1 % de DBO y 56,3 ± 0,1 % de sólidos
- Medido: S = 3.885 mg/L (fórmula 3.885; con lluvia difiere 0.0000); sin recirculación lavado true y DBO 197 mg/L; sin aire lavado true; Px 388.1 kg/día vs purga 388.1; O₂ 1255 kg/día (fórmula 1255); primario 34.48 % y 56.34 %

## Q20. Resolución 0631 de 2015 (art. 8): categoría por carga de DBO5, límites y cumplimiento — cumple

- Tolerancia: carga de 625 kg/día con unos 20 400 habitantes y de 3 000 kg/día con unos 98 000; límites DQO 180/180/150, DBO5 90/90/70, SST 90/90/70, grasas 20/20/10 mg/L y SSED 5 mL/L; cada análisis se compara con su límite; la planta del juego cumple en su operación normal; con 100 000 habitantes una línea no cumple y dos sí; sin recirculación no cumple
- Medido: 625 kg/día ↔ 20425 hab; 3 000 ↔ 98039 hab; categorías 20 000 → 1, 21 000 → 2, 95 000 → 2, 100 000 → 3; límites con error 0; comparaciones erradas 0; normal true; 100 000 con 1 línea false (falla sst), con 2 true; sin recirculación false

## Q21. Caudales: llegada = tratado + aliviadero; el aliviadero rebosa solo cuando no cabe — cumple

- Tolerancia: en 3456 casos de la malla: llegada = tratado + aliviado (error < 10⁻⁶ m³/día); rebosa si y solo si llega más que 2.5 veces el caudal de diseño de las líneas en servicio; con 50 000 habitantes y aguacero, una línea alivia 37,5 % y dos no alivian
- Medido: 3456 casos; violaciones 0; aguacero con 1 línea 37.5 % y con 2 0.0 %

## Q22. Robustez de la planta de aguas residuales: entradas al azar e inválidas — cumple

- Tolerancia: 4 000 entradas al azar: todos los valores finitos y no negativos; el agua tratada nunca más sucia que la cruda (DBO, sólidos, coliformes); oxígeno del río por debajo de la saturación; el biogás nunca da más del 100 % de la energía; 7 entradas inválidas se llevan a valores válidos
- Medido: 4000 casos, violaciones 0; entradas inválidas mal saneadas 0

## Q23. Coherencia de la planta de aguas residuales: cada decisión empuja hacia donde debe — cumple

- Tolerancia: en 4 poblaciones × 1 o 2 líneas × 3 climas × 3 purgas × con o sin primario: más aire nunca gasta menos ni deja más amonio; la luz UV nunca deja más coliformes; la recirculación nunca empeora la DBO; purga «mucha» deja salir más de 5 mg/L de amonio y la normal menos de 2; sin primario se gasta más aire y sale menos biogás; con una línea, más habitantes nunca aclaran la salida; el aliviadero baja el oxígeno del río; 0 violaciones
- Medido: 1818 comprobaciones; violaciones 0

## Q24. Energía, biogás y lodos: cuentas cerradas, rangos típicos y retos alcanzables — cumple

- Tolerancia: electricidad del biogás = m³ × 0,65 × 35,8 MJ/m³ × 35 % (error < 10⁻⁹); energía total = aireación + base + UV; neta = (total − biogás)/m³; en operación normal entre 0,3 y 0,6 kWh/m³ con aireación > 50 % y biogás que cubre del 30 al 70 %; biosólido > 0; el reto de energía no se cumple en la operación normal y sí con 1 mg/L de oxígeno; 100 000 habitantes con dos líneas cumplen; aguacero con dos líneas sin aliviadero y con peces; amonio < 2 mg/L con la purga normal; el resumen de «Del río a la llave» baja de etapa en etapa
- Medido: 0.374 kWh/m³ (aireación 60 %, biogás 48 %); errores 1.1e-13, 0.0e+0, 0.0e+0; biosólido 4.08 t/día; reto de energía true; crece true; aguacero true; amonio 0.37 mg/L; resumen 100 → 66 → 3 %

## Q25. Río aguas abajo (Streeter y Phelps): oxígeno físico, recuperación y criterio de los peces — cumple

- Tolerancia: en la malla (con primario y UV): oxígeno entre 0 y la saturación de 0 a 40 km; el mínimo nunca está por encima del de la descarga; a 40 km el oxígeno ya no está por debajo del mínimo; peces = oxígeno ≥ 4 mg/L y amoníaco libre ≤ 0,025 mg/L; con la planta normal el río conserva los peces y con las bacterias lavadas los pierde
- Medido: 864 casos; violaciones 0; recuperación a 40 km en 864 de 864; mínimo normal 6.24 mg/L, con lavado 0.00 mg/L a 3.1 km

## Q26. Las once partes de la planta de aguas residuales: completas, en orden, dibujadas y con valores del modelo — cumple

- Tolerancia: once partes numeradas del 1 al 11, cada una con nombre, etiqueta, descripción, al menos dos pasos de «cómo lo hace», rangos de diseño, fuente, qué sale mal, qué se mide y un lugar en la escena; en la malla de casos, ningún valor mostrado vacío, NaN, indefinido o infinito
- Medido: 11 partes; 68184 valores revisados; fallas 0
