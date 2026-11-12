# Pruebas de la sala «Aguas subterráneas»

Se ejecutan con `npm run test:ground`. Cada prueba declara su tolerancia antes de ejecutarse.

**9 de 9 cumplen.**

## S1. Función de pozo de Theis W(u) — cumple

- Tolerancia: W(0,0001) = 8,6332, W(0,01) = 4,0379, W(0,1) = 1,8229, W(1) = 0,2194 y W(5) = 0,001148 (tablas de Theis, ±0,05 %); sin salto entre la serie y la fracción continua en u = 1 (< 1e-7)
- Medido: W(0.0001) = 8.6332; W(0.01) = 4.0379; W(0.1) = 1.8229; W(1) = 0.21938; W(5) = 0.0011483; salto 7.4e-10

## S2. Theis, Cooper-Jacob y Thiem — cumple

- Tolerancia: con u < 0,01 Cooper-Jacob queda a menos de 0,5 % de Theis; con u = 0,25 se aparta más de 10 %; en tiempos largos la diferencia de abatimiento entre 10 y 100 m es la de Thiem, Q·ln(10)/(2πT) (±0,1 %)
- Medido: u = 1.3e-5: diferencia 0.017 %; u = 0.25: 22.3 %; Thiem 0.6333 m, Theis 0.6333 m

## S3. Prueba de bombeo con error de lectura: Cooper-Jacob recupera T y S — cumple

- Tolerancia: 18 lecturas de Theis con ±1 cm de error en el pozo a 50 m: T a menos de 5 % y S a menos de 25 % de los del acuífero
- Medido: T 752.2 m²/día (verdadera 750); S 1.91e-4 (verdadero 0.0002); Δs 0.210 m por ciclo

## S4. Ley de Darcy y permeámetros — cumple

- Tolerancia: q = K·i y v = q/ne (1e-12); el permeámetro de carga constante devuelve la K de la muestra (1e-12) y el de carga variable también (1e-9); 50 cm de carga en arena gruesa dan del orden de 5 mL/s
- Medido: q 0.3 m/día, v 1.0714 m/día, Q 15 m³/día; carga constante K = 30.000000 m/día; carga variable K = 0.100000 m/día; arena gruesa 4.55 mL/s

## S5. Acuífero libre entre la loma y el río (Dupuit) — cumple

- Tolerancia: q = K·(h1² − h2²)/(2L) es el mismo en todo el tramo (±0,01 %); h(0) = h1 y h(L) = h2 (1e-12); el tiempo de viaje crece de la grava a la arcilla
- Medido: q 6.9000 m²/día, mayor desvío 2.1e-9 %; h(0) 26.0000, h(L) 20.0000; viaje 0.138 años, 1.54 años, 13.8 años, 248 años, 8.27e+4 años

## S6. Transporte: Ogata-Banks contra partículas con caminata aleatoria — cumple

- Tolerancia: erfc(0,5) = 0,4795, erfc(1) = 0,1573 y erfc(2) = 0,004678 (±1e-6); con fuente continua, v = 0,5 m/día y αL = 2 m, la fracción de la masa más allá de cada distancia a los 200 días queda a menos de 0,02 de la solución con entrada de flujo (van Genuchten y Alves, 1982); la masa total es v·t (±2 %); Ogata-Banks (concentración fija en la entrada) mete más masa por dispersión y da más concentración en el frente: se informa la diferencia en x = v·t
- Medido: erfc 0.479500, 0.157299, 0.004678; 16000 partículas; mayor diferencia 0.0020; masa 100.00 contra v·t = 100; en el frente, Ogata-Banks da 0.0403 más

## S7. Zona de captura de un pozo en un flujo regional (Todd) — cumple

- Tolerancia: ancho Q/(b·q) y punto de estancamiento Q/(2π·b·q) (1e-12); las trayectorias sin dispersión que salen con |y| menor que la mitad del ancho terminan en el pozo y las demás no
- Medido: ancho 100 m, estancamiento 15.915 m; capturadas: -45, -20, 0, 20, 45 m

## S8. Suelos: conductividades en orden y dentro de los rangos de la literatura — cumple

- Tolerancia: la conductividad baja de la grava a la arcilla; grava entre 100 y 1 000 m/día, arena gruesa entre 1 y 100, arcilla menor de 1e-3 (Freeze y Cherry, 1979); porosidades eficaces entre 0,01 y 0,35
- Medido: Grava 300 m/día, ne 0.25; Arena gruesa 30 m/día, ne 0.28; Arena fina 3 m/día, ne 0.25; Limo 0.1 m/día, ne 0.15; Arcilla 0.0001 m/día, ne 0.05

## S9. Herramientas de diseño de la sala: sin errores y con sus gráficas — cumple

- Tolerancia: 60 juegos de datos al azar en las ocho herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); 4,55 mL/s con 50 cm de carga se reconocen como arena gruesa; la prueba de ejemplo da una transmisividad; con 5 L/s una fuente a 50 m del eje queda dentro de la zona de captura (ancho 360 m); las ocho dibujan su gráfica
- Medido: 480 llamadas; excepciones 0; inválidos 0; permeámetro: arena gruesa; prueba: T 736,1 m²/día; captura: termina en el pozo; gráficas 8, con errores 0
