# Pruebas de la sala «Cuencas: de la lluvia al caudal»

Se ejecutan con `npm run test:basins`. Cada prueba declara su tolerancia antes de ejecutarse.

**12 de 12 cumplen.**

## C1. Escorrentía con el número de curva del SCS — cumple

- Tolerancia: P = 5,0 pulgadas con CN = 80 da 2,89 pulgadas (TR-55, tabla 2-1; error < 0,5 %); con P menor que Ia = 0,2·S no hay escorrentía; una superficie impermeable (CN 98) con 50 mm da la escorrentía de la fórmula escrita a mano (S = 5,18 mm, Ia = 1,04 mm: 44,28 mm, casi 90 %; error < 1e-6)
- Medido: Q = 2.893 pulgadas; P = 0,19·S → 0 mm; CN 98 con 50 mm → 44.3 mm

## C2. Tiempo de concentración: Kirpich, Témez y retardo del SCS — cumple

- Tolerancia: Kirpich y Témez iguales a la fórmula escrita a mano (error < 1e-9); el retardo del SCS baja al subir el CN (la urbanización acelera el agua); los tres bajan si la pendiente sube
- Medido: Kirpich 11.67 min, Témez 34.78 min, SCS 53.77 min (CN 60) y 21.80 min (CN 90)

## C3. Método racional y coeficientes de escorrentía de la tabla 15.1.1 de Chow et al. (1988) — cumple

- Tolerancia: C = 1, i = 1 mm/h y A = 1 ha dan 1/360 = 0,002778 m³/s (error < 1e-9); los coeficientes de la tabla se recuperan en sus períodos de retorno (asfalto 0,73 con T = 2 y 0,81 con T = 10; bosque en ladera 0,52 con T = 100) y crecen con T
- Medido: Q = 0.002778 m³/s; asfalto 0.730 y 0.810; bosque 0.520

## C4. Hietograma de diseño por bloques alternos — cumple

- Tolerancia: aguacero de 120 min con bloques de 10 min y T = 25 años: la suma de los bloques es la lámina de la curva IDF para 120 min (error < 1e-9); el bloque mayor es el de 10 min de la curva y queda en el centro (bloque 6 de 12)
- Medido: suma 75.294 mm (IDF 75.294 mm); bloque mayor 25.542 mm en la posición 6 (IDF 10 min: 25.542 mm)

## C5. Hidrograma unitario triangular del SCS y convolución — cumple

- Tolerancia: el hidrograma unitario lleva 1 mm sobre 0,8 km² = 800 m³ (error < 1e-9); tp = Δt/2 + 0,6·tc y qp = 0,208·A/tp como en NEH-630; el hidrograma de la convolución lleva el volumen de la lluvia efectiva (error < 1e-9)
- Medido: volumen unitario 800.000 m³; tp 0.3417 h; qp 0.4870 m³/s·mm; escorrentía 14.28 mm → 11422.5 m³ (esperado 11422.5 m³)

## C6. Frecuencia de crecientes con Gumbel — cumple

- Tolerancia: K_T = 0,719 (T = 5), 3,137 (T = 100) y −0,164 (T = 2), los de la tabla de Chow et al. (1988) (error < 0,002); una serie sintética de 20 000 años recupera la media y la desviación pedidas (error < 2 %); el período de retorno de Q100 vuelve a dar 100 años (error < 1e-6)
- Medido: K5 0.7195, K100 3.1367, K2 -0.1643; serie: media 100.21, desviación 29.96; T(Q100) = 100.000000

## C7. Riesgo de que la creciente de diseño se supere en la vida útil — cumple

- Tolerancia: T = 100 años en 50 años: R = 1 − 0,99^50 = 39,5 % (error < 0,1 %); el período de retorno para ese riesgo vuelve a dar 100 años (error < 1e-9); T = 2 años en 1 año: 50 %
- Medido: R = 39.50 %; T = 100.000000 años; R(2, 1) = 50.0 %

## C8. Cuenca de la escena: coberturas, volumen y rango del método racional — cumple

- Tolerancia: el volumen del hidrograma es la lámina de escorrentía por el área (error < 1e-6); con 80 % urbano el pico, el volumen y el C suben, y el tiempo de concentración no sube; con 300 ha el método racional queda fuera del rango del RAS (Art. 135)
- Medido: volumen 7931.2 m³ (lámina 7931.2 m³); pico 3.43 → 7.73 m³/s; C 0.488 → 0.657; tc 26.8 → 23.2 min; racional con 300 ha: fuera de rango

## C9. Herramientas de diseño de la sala: sin errores, con los criterios del RAS y sus gráficas — cumple

- Tolerancia: 300 juegos de datos al azar en las siete herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); con 150 ha el caudal de diseño se calcula con el SCS y con 40 ha con el método racional (Art. 135); 10 % de riesgo en 50 años pide T ≈ 475 años; las siete dibujan su gráfica sin valores inválidos
- Medido: 2100 llamadas; excepciones 0; inválidos 0; 150 ha: número de curva e hidrograma unitario del SCS; 40 ha: racional; riesgo: 475 años; gráficas 7, con errores 0

## C10. Tanque de retención: conserva la masa, guarda el volumen calculado y rebosa si es pequeño — cumple

- Tolerancia: lo que entra es igual a lo que sale (error < 1e-9) con cuatro tamaños; con el volumen necesario (área del hidrograma sobre el pico de antes) el pico que sale no supera el de antes (1e-9) y el máximo guardado iguala ese volumen (error < 1e-6); con un tanque mayor no rebosa; con 30 % del volumen rebosa y el pico supera el de antes; la fracción llena queda entre 0 y 1
- Medido: entra 12974.6 m³, error de masa 5.6e-16; necesario 6674.0 m³; con él sale 1.8302 m³/s (antes 1.8302), guardó 6674.0 m³; con 120 % rebosa 0.00 m³; con 30 % rebosa 4672 m³ y sale 5.820 m³/s

## C11. Cuenca de la escena: coberturas, largo del cauce y remuestreo del hidrograma — cumple

- Tolerancia: las coberturas suman 1 y con 25 % urbanizado dan 20 % de barrio y 5 % de vías; L ≈ 1,8·√A da unos 1 400 m con 60 ha (±1 %); remuestrear a 3 min conserva el volumen (±3 %) y el pico (±5 %); con el mismo paso devuelve los mismos valores (1e-9)
- Medido: suma 1.000000, barrio 0.200, vías 0.050; L(60 ha) = 1394 m; volumen 7931 → 7930 m³; pico 3.433 → 3.433 m³/s; mismo paso: error 1.4e-17

## C12. Riesgo simulado contra la fórmula, y el nivel del río con sus casas — cumple

- Tolerancia: 20 000 vidas: la fracción con al menos una creciente mayor que la de T años queda a menos de 1 punto de R = 1 − (1 − 1/T)^n (T = 100, n = 50 y T = 10, n = 20); en 200 000 años la de 50 años se supera en promedio cada 50 ± 2,5 años; a cauce lleno el nivel es la orilla (±1 mm); el nivel sube con el caudal; con más nivel no se secan casas; cada casa está sobre el terreno
- Medido: T 100, n 50: 39.43 % contra 39.50 %; T 10, n 20: 88.20 % contra 87.84 %; cada 51.27 años; cauce lleno 3.0000 m; casas con agua a 3,2 / 3,6 / 4,1 m: 1 / 6 / 10
