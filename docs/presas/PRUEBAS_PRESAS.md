# Pruebas de la sala «Presas y embalses»

Se ejecutan con `npm run test:dams`. Cada prueba declara su tolerancia antes de ejecutarse.

**8 de 8 cumplen.**

## D1. Esquema de Puls contra el embalse lineal exacto — cumple

- Tolerancia: con O = k·S y entrada constante, el esquema de Puls (trapecios en el tiempo) sigue a S(t) = (I/k)·(1 − e^(−kt)) con error menor que 0,05 % del volumen final
- Medido: mayor error 0.0019 % del volumen final; Δt = 3 min, k = 1/7200 s

## D2. Tránsito por el embalse: conserva la masa, atenúa y retrasa el pico — cumple

- Tolerancia: entra = sale + guardado (1e-9); el pico de salida es menor que el de entrada y llega después; en ese instante entrada y salida casi coinciden (±3 % con Δt = 15 min); un vertedero más ancho atenúa menos y deja el agua más baja
- Medido: masa 1.4e-15; pico 800 → 593 m³/s, de 6 a 8.75 h; en el pico I − O = 0.48 %; con 60 m: 702 m³/s y 3.06 m (con 30 m, 4.35 m)

## D3. Perfil WES, tangencia con la rápida y resalto al pie — cumple

- Tolerancia: el perfil x^1,85 = 2·Hd^0,85·y da y(Hd) = Hd/2 (1e-12); en el punto de tangencia la pendiente es 1/m (1e-6); al pie se conserva la energía (1e-6) y las profundidades conjugadas igualan la fuerza específica (1e-9); Q = C·L·H^1,5
- Medido: y(Hd) = 1.5000 (a mano 1.5000); tangencia en x = 4.613 m con pendiente 1.333333; y1 0.3954 m, F1 12.84, y2 6.986 m; Q con 3 m de carga 339.8 m³/s

## D4. Estabilidad de una presa triangular, a mano — cumple

- Tolerancia: peso, empuje y subpresión, momentos respecto a la punta, factores de volcamiento y deslizamiento y la excentricidad iguales al cálculo a mano (1e-9)
- Medido: B 16 m; V 2190.40 kN/m (a mano 2190.40); FSv 1.3449 (a mano 1.3449); FSd 0.7815 (a mano 0.7815); e 3.3048 m (a mano 3.3048)

## D5. Tercio medio, esfuerzos en la base y el efecto de los drenes — cumple

- Tolerancia: el promedio de los esfuerzos del talón y la punta por B es la fuerza vertical (1e-9); cuando la resultante pasa por el borde del tercio medio el esfuerzo en el talón es cero (±1 kPa); con drenes (un tercio de la subpresión) suben los dos factores de seguridad
- Medido: V 7814.3 contra 7814.3 kN/m; talud 0,5: sale del tercio con 28.35 m de agua y el talón queda en 0.000 kPa; sin drenes FSv 2.09 y FSd 1.53; con drenes 3.82 y 2.01

## D6. Volumen del embalse, descarga y forma del hidrograma — cumple

- Tolerancia: el volumen sobre la cresta es la integral del área (±1e-6 relativo); la descarga es C·L·H^1,5 más la de fondo (1e-12); el hidrograma gamma llega a su pico en tp y empieza en el caudal base (1e-12)
- Medido: volumen con 3 m: 5175000 m³ (integral 5175000); descarga 344.828 m³/s; hidrograma: Q(0) 10, Q(tp) 500.000000

## D7. Herramientas de diseño de la sala: sin errores, criterios y gráficas — cumple

- Tolerancia: 40 juegos de datos al azar en las seis herramientas: ninguna excepción ni valores NaN, indefinidos o infinitos (salvo los avisos de datos inválidos); el ancho del vertedero, el pozo y el talud propuestos cumplen sus verificaciones; las seis dibujan su gráfica
- Medido: 240 llamadas; excepciones 0; inválidos 0; vertedero 28 m; pozo 4,64 m; talud 0,75:1; gráficas 6, con errores 0

## D8. Coeficiente de la cresta con otras cargas, pozo profundizado y pérdida del resalto — cumple

- Tolerancia: C(H/Hd = 1) es el de diseño (1e-12) y crece con la carga; con el pozo a la profundidad justa el resalto queda dentro y 1 cm menos lo saca; la pérdida por energía y por la fórmula del resalto coinciden (1e-9)
- Medido: C = 1.768, 1.992, 2.100, 2.180, 2.232, 2.262, 2.317 para H/Hd = 0.2, 0.5, 0.75, 1, 1.2, 1.33, 1.6; pozo justo 4.749 m (dentro true, 1 cm menos false); pérdida 29.0319 m y 29.0319 m
