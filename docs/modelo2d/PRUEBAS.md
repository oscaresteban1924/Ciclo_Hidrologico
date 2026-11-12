# Pruebas de la sala «Modelación hidráulica 2D»

Se ejecutan con `npm run test:model2d`. Cada prueba declara su tolerancia antes de ejecutarse.

**15 de 15 cumplen.**

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
- Medido: inercia 2.27e-10 mm; difusiva 2.71e-4 mm

## M6. Conservación del volumen en la creciente de 100 años — cumple

- Tolerancia: error de volumen < 0,01 % con los dos esquemas; volumen recortado < 0,01 % de lo que entró
- Medido: inercia -2.63e-13 %, recorte 0.0 m³; difusiva -5.07e-12 %, recorte 0.0 m³ de 204615 m³

## M7. Rotura de presa contra la solución de Ritter — cumple

- Tolerancia: en la presa h = 4·h0/9 exacto; aguas someras completas con error medio < 5 %; la inercia local se aleja más (más de 15 %)
- Medido: h(0) = 0.8889 (4h0/9 = 0.8889); completas 2.4 %, inercia 34.0 %

## M8. Gumbel por momentos y riesgo — cumple

- Tolerancia: K₁₀₀ = 3,1367 (±0,001); R(100, 50) = 0,3950 (±0,001); T para 10 % en 50 años = 475 (±1); Q₁₀₀ = media + K·desviación
- Medido: K = 3.1367, R = 0.3950, T = 475.1, Q₁₀₀ = 79.61 m³/s (media 32.66, desv. 14.97)

## M9. Onda difusiva (implícita) frente a inercia local (explícita) — cumple

- Tolerancia: nivel máximo en el puente a menos de 5 cm; caudal pico bajo el puente a menos de 3 %
- Medido: puente 1477.957 y 1477.964 m; pico 69.34 y 68.99 m³/s

## M10. Paso de tiempo: explícito inestable, implícito con Courant alto — cumple

- Tolerancia: inercia local con Δt fijo de 3 s en celdas de 10 m: se detecta la inestabilidad; onda difusiva con Δt = 60 s (Courant > 3): estable y a menos de 5 cm en el puente
- Medido: explícito: inestable a los -18.4 min; implícito: Courant 10.9, estable, puente 1477.968 m

## M11. Flujo permanente con caudal constante — cumple

- Tolerancia: después de una hora con 30 m³/s, la salida y el puente llevan 30 m³/s (±2 %)
- Medido: salida 29.70 m³/s, puente 30.04 m³/s

## M12. Celdas grandes con y sin subgrid; terreno de 30 m — cumple

- Tolerancia: con celdas de 40 m, el subgrid queda a menos de 15 cm de la referencia de 10 m y sin subgrid a más de 30 cm; el terreno de 30 m inunda más el barrio que el de 1 m
- Medido: referencia 1478.04 m; 40 m con subgrid 0.07 m, sin subgrid 0.67 m; barrio 17743 m² (1 m) y 30818 m² (30 m)

## M13. Clases de amenaza H1 a H6 (AIDR, 2017) — cumple

- Tolerancia: profundidad, velocidad y su producto en combinación dan la clase de la tabla
- Medido: D 0.2, V 0.5 → H1 (esperada H1); D 0.4, V 1 → H2 (esperada H2); D 1, V 0.5 → H3 (esperada H3); D 1.5, V 0.6 → H4 (esperada H4); D 1, V 2.5 → H5 (esperada H5); D 5, V 1 → H6 (esperada H6); D 0.25, V 1.8 → H2 (esperada H2); D 0.25, V 2.5 → H5 (esperada H5)

## M14. Herramientas de diseño: robustez y valores de ejemplo — cumple

- Tolerancia: sin excepciones ni NaN con datos al azar; con los valores de ejemplo todas dan resultado sin error
- Medido: 3600 llamadas, 0 con NaN, 0 excepciones; 12 de 12 con los valores de ejemplo

## M15. Escenas y retos — cumple

- Tolerancia: ningún reto de las partes 1 a 3 se cumple con los valores por omisión; cada uno tiene una solución; el modelo por omisión usa las opciones de HEC-RAS (onda difusiva, θ = 1, 20 iteraciones, 3 mm)
- Medido: parte 1 por omisión no/no/no/no, soluciones sí/sí/sí/sí; parte 2: +0.30 m, barrio 6850/17743 m², sí/sí/sí; parte 3: sí/sí/sí/sí (T 25 barrio 5531 m², T 10 0 m²); modelo sí
