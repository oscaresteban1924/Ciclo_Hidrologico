# Pruebas del módulo «Calidad del agua»

Se ejecutan con `npm run test:quality`. Cada prueba declara su tolerancia antes de ejecutarse.

**8 de 8 cumplen.**

## Q1. Oxígeno disuelto de saturación y altitud de Medellín — cumple

- Tolerancia: a nivel del mar, 9,09 mg/L a 20 °C, 8,26 a 25 °C y 11,29 a 10 °C (tabla de Standard Methods, error < 0,02 mg/L); a 1 495 m la presión es 0,835 de la del mar (error < 0,002) y la saturación baja en la misma proporción
- Medido: 20 °C: 9.092; 25 °C: 8.263; 10 °C: 11.288 mg/L; presión a 1 495 m: 0.8350; saturación a 20 °C en Medellín: 7.592 mg/L

## Q2. Profundidad por Manning, reaireación de Tsivoglou y descomposición de la DBO — cumple

- Tolerancia: con 0,15 m³/s en 4 m de ancho, pendiente 4 % y n = 0,05 la profundidad es la del cálculo a mano (error < 10⁻¹²) y U·H·ancho = Q; ka = 31 183·S·U; kd = 0,3·(H/2,4)^−0,434
- Medido: H 0.0607 m (a mano 0.0607), U 0.618 m/s, caudal reconstruido 0.150000 m³/s; ka 770.6 1/día; kd 1.480 1/día

## Q3. Mezcla completa en el punto del vertimiento — cumple

- Tolerancia: con 300 casas (1 200 personas, 102 L/persona·día) el caudal vertido es 1,417 L/s; coliformes y conductividad justo después del vertimiento iguales al balance de masa a mano (error < 10⁻⁹)
- Medido: vertimiento 1.417 L/s; quebrada 150 L/s; coliformes 93709 (a mano 93709); conductividad 77.77 µS/cm (a mano 77.77)

## Q4. Curva de oxígeno de Streeter y Phelps con demanda del lodo — cumple

- Tolerancia: la solución analítica coincide con la integración numérica fina de las ecuaciones (diferencia < 0,01 mg/L en 2 km); con 600 casas sin tratamiento, verano y cauce plano, el mínimo de oxígeno está aguas abajo del vertimiento y a 3 km el oxígeno es mayor que en el mínimo
- Medido: diferencia máxima 2.6e-5 mg/L; mezcla 7.28 mg/L; mínimo 6.08 mg/L a 800 m; a 2 km 7.27 mg/L; a 3 km 7.44 mg/L (ka 39.5, kd 1.43 1/día)

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
