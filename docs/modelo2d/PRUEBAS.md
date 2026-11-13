# Pruebas de la sala «Modelación hidráulica 2D»

Se ejecutan con `npm run test:model2d`. Cada prueba declara su tolerancia antes de ejecutarse.

**28 de 28 cumplen.**

## M1. Curva cota-volumen de las celdas (subgrid) e inversa exacta — cumple

- Tolerancia: volumen igual a la suma píxel por píxel (error < 1e-5) y nivel recuperado a < 1 mm
- Medido: error relativo 3.40e-12; nivel 0.0000 mm

## M2. El promedio conserva la cota media pero pierde capacidad del cauce — cumple

- Tolerancia: cota media igual a < 1 mm con píxeles de 10 y 20 m; capacidad que no sube al crecer el píxel
- Medido: diferencias 0.000 y 0.000 mm; capacidades 47, 47, 43, 35, 24, 13 m³/s

## M3. MDS, remuestreo por máximo y cauce levantado — cumple

- Tolerancia: el MDS tapa la luz del puente; el máximo a 10 m conserva la corona (±5 cm) y el promedio la baja más de 30 cm; sin el cauce bajo el agua la capacidad baja más de 15 %; insertado vuelve a la real (±1 %)
- Medido: luz MDS 0.2 m² (MDT 76); corona máx 0.017 m, prom -0.60 m; capacidad 47.5 / 64.5 / 64.5 m³/s

## M4. Tablas de área y conducción de las caras — cumple

- Tolerancia: la tabla reproduce la suma por franjas (< 1,5 %, interpolación cada 10 cm) y una cara plana da K = b·h^(5/3)/n (< 1 %)
- Medido: peor diferencia 0.00 %; cara plana 774.34 frente a 774.34

## M5. Lago en reposo sobre el terreno irregular — cumple

- Tolerancia: con el agua quieta a una cota y los bordes cerrados, ningún nivel cambia más de 1 mm en 5 min (inercia local y onda difusiva)
- Medido: inercia 2.27e-10 mm; difusiva 8.24e-4 mm

## M6. Conservación del volumen en la creciente de 100 años — cumple

- Tolerancia: error de volumen < 0,01 % con los dos esquemas; volumen recortado < 0,01 % de lo que entró
- Medido: inercia -9.01e-14 %, recorte 0.0 m³; difusiva -5.09e-12 %, recorte 0.0 m³ de 204615 m³

## M7. Rotura de presa contra la solución de Ritter — cumple

- Tolerancia: en la presa h = 4·h0/9 exacto; aguas someras completas con error medio < 5 %; la inercia local se aleja más (más de 15 %)
- Medido: h(0) = 0.8889 (4h0/9 = 0.8889); completas 2.4 %, inercia 34.0 %

## M8. Gumbel por momentos y riesgo — cumple

- Tolerancia: K₁₀₀ = 3,1367 (±0,001); R(100, 50) = 0,3950 (±0,001); T para 10 % en 50 años = 475 (±1); Q₁₀₀ = media + K·desviación
- Medido: K = 3.1367, R = 0.3950, T = 475.1, Q₁₀₀ = 79.61 m³/s (media 32.66, desv. 14.97)

## M9. Onda difusiva (implícita) frente a inercia local (explícita) — cumple

- Tolerancia: nivel máximo en el puente a menos de 5 cm; caudal pico bajo el puente a menos de 3 %
- Medido: puente 1477.956 y 1477.964 m; pico 69.34 y 68.99 m³/s

## M10. Paso de tiempo: explícito inestable, implícito con Courant alto — cumple

- Tolerancia: inercia local con Δt fijo de 3 s en celdas de 10 m: se detecta la inestabilidad; onda difusiva con Δt = 60 s (Courant > 3): estable y a menos de 5 cm en el puente
- Medido: explícito: inestable a los -18.4 min; implícito: Courant 10.9, estable, puente 1477.968 m

## M11. Flujo permanente con caudal constante — cumple

- Tolerancia: después de una hora con 30 m³/s, la salida y el puente llevan 30 m³/s (±2 %)
- Medido: salida 30.00 m³/s, puente 30.06 m³/s

## M12. Celdas grandes con y sin subgrid; terreno de 30 m — cumple

- Tolerancia: con celdas de 40 m, el subgrid queda a menos de 15 cm de la referencia de 10 m y sin subgrid a más de 30 cm; el terreno de 30 m inunda más el barrio que el de 1 m
- Medido: referencia 1478.04 m; 40 m con subgrid 0.07 m, sin subgrid 0.67 m; barrio 17739 m² (1 m) y 30818 m² (30 m)

## M13. Clases de amenaza H1 a H6 (AIDR, 2017) — cumple

- Tolerancia: profundidad, velocidad y su producto en combinación dan la clase de la tabla
- Medido: D 0.2, V 0.5 → H1 (esperada H1); D 0.4, V 1 → H2 (esperada H2); D 1, V 0.5 → H3 (esperada H3); D 1.5, V 0.6 → H4 (esperada H4); D 1, V 2.5 → H5 (esperada H5); D 5, V 1 → H6 (esperada H6); D 0.25, V 1.8 → H2 (esperada H2); D 0.25, V 2.5 → H5 (esperada H5)

## M14. Herramientas de diseño: robustez y valores de ejemplo — cumple

- Tolerancia: sin excepciones ni NaN con datos al azar; con los valores de ejemplo todas dan resultado sin error
- Medido: 6600 llamadas, 0 con NaN, 0 excepciones; 22 de 22 con los valores de ejemplo

## M15. Escenas y retos — cumple

- Tolerancia: ningún reto de las partes 1 a 3 se cumple con los valores por omisión; cada uno tiene una solución; el modelo por omisión usa las opciones de HEC-RAS (onda difusiva, θ = 1, 20 iteraciones, 3 mm)
- Medido: parte 1 por omisión no/no/no/no, soluciones sí/sí/sí/sí; parte 2: +0.30 m, barrio 6225/17739 m², sí/sí/sí; parte 3: sí/sí/sí/sí (T 25 barrio 5500 m², T 10 0 m²); modelo sí

## M16. Malla refinada (árbol cuaternario balanceado) — cumple

- Tolerancia: lago en reposo a < 1 mm; volumen conservado (< 0,01 %); ninguna cara une celdas de más del doble de tamaño; con 20 m refinada a 10 m en el cauce y el jarillón, el puente a < 3 cm de la malla de 10 m y el barrio más cerca de ella que la de 20 m
- Medido: lago 1.82e-9 mm; volumen -2.32e-13 %; razón máxima 2; 949 celdas (10 m: 2560); puente 1478.041 / 1478.042 m; barrio 9280 / 10031 / 17739 m²

## M17. Rotura de presa en 2D: aguas someras completas contra Ritter — cumple

- Tolerancia: con la advección (Stelling y Duinmeijer) el error medio es < 10 % y la inercia local se aleja más de 15 %; volumen conservado
- Medido: aguas someras 3.5 %, inercia local 32.5 %; volumen 1.3e-13 %

## M18. Lluvia sobre la malla con pérdidas del número de curva — cumple

- Tolerancia: escorrentía del SCS exacta (CN 74, P 80 mm); el hietograma suma P con el pico en el centro; volumen conservado (< 0,001 %) con la inercia y la onda difusiva; lluvia = escorrentía + pérdidas; el barrio se encharca detrás del jarillón sin creciente del río
- Medido: Q 25.515 mm (fórmula 25.515); hietograma 80.000 mm, pico en el bloque 6 de 12; volumen 1.2e-13 % y -9.1e-10 %; lámina total 80.00 mm; barrio 8501 m²

## M19. Rotura progresiva del jarillón (disparada por nivel) — cumple

- Tolerancia: la rotura se dispara y se completa en el tiempo de formación; la corona baja al terreno natural; el volumen se conserva al cambiar el terreno (< 0,01 %); entra agua por la rotura y el barrio se inunda más que sin ella
- Medido: corona 1479.80 m → 1478.49 m (pie 1478.47 m); inicio 24.9 min, completa 34.9 min; caudal por la rotura 3.3 m³/s; volumen 2.4e-13 %; barrio 12749 frente a 10031 m²

## M20. El puente como estructura: flujo libre, a presión y vertedero — cumple

- Tolerancia: vertedero libre = C·L·H^1,5 y sumergido con Villemonte (exactos); las pérdidas de la luz suben el agua sobre la corrida sin estructura; tapar media luz la sube más de 20 cm; con el tablero bajo y la luz tapada el agua pasa la cara inferior del tablero (flujo a presión) sin inestabilidad y con el volumen conservado
- Medido: vertedero 16.600/16.600 y 14.033/14.033 m³/s; puente sin estructura 1478.04 m, con la luz libre 1478.21 m, media luz tapada 1478.48 m; tablero a 1478,30 y luz tapada: 1479.11 m, volumen -2.2e-13 %

## M21. Onda difusiva, inercia local y aguas someras en el mismo valle — cumple

- Tolerancia: las tres estables y con el volumen conservado (< 0,01 %); la difusiva y la inercia a < 3 cm en el puente; las aguas someras, con las pérdidas por curvas, contracción y expansión, suben el agua en el puente (más de 5 cm)
- Medido: puente: difusiva 1478.051, inercia 1478.042, aguas someras 1478.340 m; volumen -1.3e-11, -4.0e-15, -5.0e-13 %

## M22. Ensamble: mapa de probabilidad de inundación — cumple

- Tolerancia: los miembros se repiten con la misma semilla; la probabilidad va de 0 a 1: hay celdas que se mojan en todos los miembros (1), la ladera lejana nunca se moja (0) y hay celdas con probabilidad intermedia
- Medido: 8 miembros (n ×1.58, 0.87, 1.20, 0.83, 1.10, 0.74, 0.71, 0.78; Q 79, 90, 83, 86, 69, 81, 67, 65 m³/s); probabilidad de 0 a 1; 71 celdas con 1; ladera 0; 382 celdas intermedias

## M23. Calibración del n con marcas de agua (búsqueda de sección dorada) — cumple

- Tolerancia: las marcas salen de una corrida escondida con n ×1,18 y ±5 cm de error; la búsqueda recupera el multiplicador a ±0,06 con un RMSE del orden del error de las marcas; con n ×1 el sesgo es negativo (el modelo queda bajo)
- Medido: 8 marcas; mejor ×1.156 con RMSE 1.7 cm en 10 corridas; con ×1: RMSE 14.7 cm, sesgo -14.6 cm

## M24. Curva profundidad-daño y daño anual esperado — cumple

- Tolerancia: regla del trapecio exacta en un caso a mano (con la cola del periodo mayor); la curva interpola y llega a 1; el daño crece con el periodo de retorno
- Medido: DAE 6.1000 (a mano 6.1000); curva 0.000, 0.245, 0.490, 0.775, 1.000; daño 10/100/500 años 0 / 308 / 1697 m²

## M25. Intensidad y zonificación de la amenaza (ejercicio) — cumple

- Tolerancia: umbrales de profundidad, velocidad y su producto (0,5/0,5/0,225 y 1,0/0,8/0,45) y la matriz con 30 y 100 años dan la clase esperada; el barrio tiene zonas de amenaza con la creciente de 100 años
- Medido: h 0.3, v 0.3 → 1; h 0.7, v 0.3 → 2; h 0.3, v 0.6 → 2; h 0.4, v 0.55 → 2; h 1.2, v 0.2 → 3; h 0.4, v 0.9 → 3; h 0.6, v 0.7 → 2; h 0.02, v 0 → 0; matriz 3,2,3,2,1,0; barrio sin/baja/media/alta 28281 / 7445 / 3461 / 500 m²

## M26. GeoTIFF, shapefile y ZIP para HEC-RAS — cumple

- Tolerancia: el GeoTIFF se lee con geotiff.js con las mismas cotas, el «sin dato», el píxel y la esquina; CRC-32 de «123456789» = cbf43926; el ZIP termina en su directorio central con el número de archivos; el paquete trae terreno, coberturas, 4 shapefiles de 5 archivos, 2 CSV y el LEAME
- Medido: 12 × 9, píxel 2 m, esquina 4200000, 2000000, EPSG 9377; peor diferencia 0; sin dato true; CRC cbf43926; ZIP 6054b50 con 2 archivos; paquete 26 archivos

## M27. Terreno propio: GeoTIFF cargado, malla y corrida — cumple

- Tolerancia: el ejemplo se lee igual que se escribió; la malla cubre el terreno; con 20 m³/s constantes, a la hora sale lo mismo que entra (±2 %) con el volumen conservado
- Medido: 180 × 120 píxeles de 2 m; 2400 celdas de 6 m; salida 20.00 m³/s; volumen -7.2e-14 %

## M28. Mapas de diagnóstico: Courant e iteraciones — cumple

- Tolerancia: el mayor Courant por celda coincide con el de la corrida; con 2 iteraciones y una tolerancia de 0,5 mm aparecen celdas sin converger y su error coincide con el mayor del registro
- Medido: Courant 3.307 / 3.307; 197 pasos sin converger, 216 celdas marcadas, error 247.17 / 247.17 mm
