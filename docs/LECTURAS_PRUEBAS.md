# Pruebas de las fichas de lectura

Se ejecutan con `npm run test:readings`. Cada prueba declara su tolerancia antes de ejecutarse.

**11 de 11 cumplen.**

## L1. Froude = 1 y energía específica = 1,5 y en flujo crítico de 1 m — cumple

- Tolerancia: error relativo < 1e-9
- Medido: Fr = 1.000000000, E = 1.500000000 m

## L2. Profundidad hidráulica A/T de la ficha igual a la del motor de canales (cuatro secciones) — cumple

- Tolerancia: error relativo < 1e-9
- Medido: peor 0.0e+0

## L3. En una trapecial (b = 2 m, z = 1,5) el Froude con A/T supera al de la profundidad — cumple

- Tolerancia: Fr(A/T) > Fr(y) y D < y
- Medido: D = 0.700 m; Fr = 0.763 frente a 0.639

## L4. Interpolación de series: nodos exactos, punto medio lineal y extremos — cumple

- Tolerancia: exacta (1e-12)
- Medido: f(17,5) = 6

## L5. Fracción del área con tiempo de viaje menor o igual que t — cumple

- Tolerancia: exacta
- Medido: 0,125 → 0.429; 0,95 → 0.857

## L6. Presión en la llave: 30 m en la esquina, casa 4 m más alta, llave a 1,2 m — cumple

- Tolerancia: 24,8 m exactos
- Medido: 24.800 m

## L7. Ladera de pasto con 10 % de pendiente: 300 m hasta el cauce con V = k·√S — cumple

- Tolerancia: error relativo < 2 % (la ruta puede tomar diagonales)
- Medido: 445.4 s frente a 445.4 s

## L8. Tiempos de viaje: bosque > pasto > pavimento; en la ladera, en la proporción de los coeficientes k — cumple

- Tolerancia: orden estricto; (bosque − cauce)/(pavimento − cauce) = 6,19/0,76 ± 2 %
- Medido: 1176 > 428 > 156 s; razón en la ladera 8.14

## L9. Ladera con un hoyo: todos los nodos con tiempo finito y positivo; el agua del hoyo sigue al cauce — cumple

- Tolerancia: 0 nodos malos; tiempo del hoyo mayor que el de su vecino río abajo
- Medido: 0 malos; hoyo 796 s, vecino 764 s

## L10. Velocidad de Manning en el cauce (n = 0,045; R = 0,4 m; S = 2 %) — cumple

- Tolerancia: error relativo < 1e-12
- Medido: 1.706 m/s

## L11. Nodo del cauce a 200 m de la salida con 2 m/s — cumple

- Tolerancia: 100 s exactos
- Medido: 100.000 s
