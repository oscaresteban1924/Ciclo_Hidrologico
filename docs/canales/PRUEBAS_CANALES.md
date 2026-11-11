# Pruebas del módulo «Hidráulica de canales»

Se ejecutan con `npm run test:canals`. Cada prueba declara su tolerancia antes de ejecutarse.

**15 de 15 cumplen.**

## H1. Geometría: área, perímetro, ancho de superficie y momento estático de las tres secciones — cumple

- Tolerancia: error relativo menor que 1 × 10⁻⁹ frente a las fórmulas cerradas (rectangular, trapecial con talud 1,5 y tubo medio lleno, con el centroide del semicírculo a 4r/3π)
- Medido: error máximo 1.2e-16

## H2. Profundidad normal: con el caudal de Manning a una profundidad conocida, el cálculo recupera esa profundidad — cumple

- Tolerancia: 81 casos (tres secciones, n de 0,012 a 0,04, pendiente de 0,05 % a 5 %, profundidad de 0,1 a 0,9 m); error relativo menor que 1 × 10⁻⁷
- Medido: 81 casos; error máximo 3.7e-11

## H3. Profundidad crítica: Froude igual a 1, energía específica mínima y fórmula cerrada en el canal rectangular — cumple

- Tolerancia: |F − 1| menor que 1 × 10⁻⁶ en nueve casos; energía mayor 3 % por encima y por debajo; en el rectangular, error menor que 1 × 10⁻⁸ frente a yc = (q²/g)^(1/3)
- Medido: |F − 1| máximo 2.2e-10; casos sin mínimo 0; rectangular 3.4e-11

## H4. Tubo circular: el caudal máximo con superficie libre es con el agua cerca de 0,94 D y supera al del tubo lleno — cumple

- Tolerancia: y/D entre 0,936 y 0,940 y Qmáx/Qlleno entre 1,07 y 1,08 (valores de Chow 1959)
- Medido: y/D = 0.9382; Qmáx/Qlleno = 1.0757

## H5. Resalto: la fuerza específica se conserva, coincide con Bélanger y la pérdida es (y2 − y1)³ / (4 y1 y2) — cumple

- Tolerancia: errores relativos menores que 1 × 10⁻⁶ (Bélanger, fuerza específica, pérdida y que la conjugada de la conjugada sea la profundidad de partida); en el trapecial, fuerza específica con error menor que 1 × 10⁻⁶
- Medido: Bélanger 7.0e-11; fuerza 1.1e-10; pérdida 6.2e-9; ida y vuelta 2.5e-10; trapecial 3.2e-11

## H6. Profundidades alternas: misma energía, una a cada lado de la crítica; por debajo de la energía crítica no hay ninguna — cumple

- Tolerancia: energía con error relativo menor que 1 × 10⁻⁸; la lenta mayor y la rápida menor que la crítica; con 90 % de la energía crítica, ninguna
- Medido: 6 casos; error máximo 6.7e-10; fuera de orden 0; sin solución bajo la crítica: sí

## H7. Flujo gradualmente variado: el paso directo coincide con una integración fina (Runge-Kutta) del perfil M1 — cumple

- Tolerancia: canal trapecial, Q = 8 m³/s, n = 0,025, S0 = 0,1 %, desde 1,2 m sobre la normal hasta 1 % sobre ella; largos con diferencia menor que 1 %; el perfil baja de forma continua hacia aguas arriba
- Medido: paso directo 2290 m; Runge-Kutta 2291 m; diferencia 0.07 %; monótono: sí

## H8. El canal y su caudal: malla completa sin valores inválidos, banderas coherentes y retos alcanzables — cumple

- Tolerancia: tres formas × cinco materiales × cuatro pendientes × seis caudales; ningún valor NaN o infinito (salvo la profundidad normal cuando el tubo trabajaría a presión); Manning devuelve el caudal; «desborda» si y solo si la normal supera la pared o el tubo no alcanza; «bien» nunca con desborde, erosión, sedimentación o flujo inestable; la capacidad con borde libre no supera la del borde; existen casos para cada reto
- Medido: 360 casos; fallas 0; retos alcanzables: sí

## H9. La caída y el resalto: malla completa, energía que no aumenta, resalto donde la conjugada iguala al pozo y retos alcanzables — cumple

- Tolerancia: cuatro caudales × cuatro caídas × cinco vertederos × tres largos de pozo; sin valores inválidos; y1 < yc < y2 y F1 > 1; la energía al pie no supera la de la cresta; si el pozo alcanza la conjugada, el resalto está al pie; si no, su conjugada iguala la profundidad del pozo (error menor que 1 mm); «contenido» solo si cabe en el pozo; aparecen resalto barrido, ahogado y contenido estable, y alguno disipa 60 % o más
- Medido: 240 casos; fallas 0; lugares vistos: barrido, pozo, ahogado, pie; retos alcanzables: sí

## H10. El puente y el remanso: malla completa, energía crítica en la abertura, remanso que crece con lo tapado y retos alcanzables — cumple

- Tolerancia: cinco caudales × cuatro pendientes × tres luces × tres alturas × tres grados de obstrucción; sin valores inválidos; en canal suave el agua en el puente no baja de la normal; si el puente estrangula, la energía aguas arriba es la crítica de la abertura (error menor que 1 × 10⁻⁶); a más obstrucción, el agua nunca baja; el perfil de remanso baja de forma continua hacia aguas arriba; aparecen los cuatro tipos de paso y existen casos para cada reto
- Medido: 540 casos; fallas 0; casos donde tapar bajó el agua 0; tipos vistos: estrangulado, presion, encima, libre; retos alcanzables: sí

## H11. Medir el caudal: vertederos y compuerta coherentes, y el ajuste de la curva recupera el exponente — cumple

- Tolerancia: triangular de 90° a 1 % de 1,37 H^2,5; rectangular igual a Rehbock calculado a mano (error menor que 1 × 10⁻¹²); la carga calculada devuelve el caudal (error menor que 1 × 10⁻⁷); en la compuerta, misma energía antes y en la vena contraída y coeficiente de descarga entre 0,45 y 0,61 (diagrama de Henry); con datos exactos del triangular, el ajuste da 2,5 ± 0,001
- Medido: triangular 0.01 %; rectangular 0.0e+0; inversión 1.9e-9; compuerta: energía 0 fallas, Cd fuera de rango 0; exponente ajustado 2.5000; 45 casos, inválidos 0

## H12. Escalas: en los extremos de los controles, las profundidades y largos caben en las escenas — cumple

- Tolerancia: profundidad del pozo menor que 12 m con los controles al máximo; con la creciente mayor (90 m³/s), puente de 3 m de luz y 1,2 m de alto, muy tapado: agua menor que 20 m y remanso menor que 20 km (canal de 8 m, rápida de 4 m)
- Medido: 3 casos; fallas 0; puente extremo: 12.4 m de agua, remanso 14048 m

## H13. Alcantarillas: control a la entrada continuo y creciente, energía a la salida, reparto con la vía y retos alcanzables — cumple

- Tolerancia: tres entradas × tres diámetros × tres pendientes × tres niveles aguas abajo; el nivel a la entrada nunca baja al subir el caudal y no salta más de 0,25 D entre pasos (transición de HDS-5); sin valores inválidos; caudal por los tubos más el de encima de la vía igual al total (1 × 10⁻⁶) y el de la vía igual al vertedero (0,1 %); nivel = el mayor de los dos controles; pérdida a la salida igual al cálculo a mano (1 × 10⁻⁹); aparecen control a la entrada y a la salida, paso por encima de la vía y un caso que cumple con 5 m³/s o más
- Medido: 324 casos; inválidos o desbalance 0; bajadas 0; saltos 0; salida a mano 1.6e-16; controles vistos: salida, entrada; retos alcanzables: sí

## H14. Sedimentos: curva de Shields, velocidad de caída, arrastre de fondo, perfil de Rouse y los cinco modos de transporte — cumple

- Tolerancia: θcr mínimo de la curva entre 0,028 y 0,035 y de grava (3 cm) entre 0,05 y 0,06; caída de arena de 0,2 mm entre 0,02 y 0,03 m/s y de limo fino igual a Stokes (5 %); q* = 3,97·(0,1 − 0,0495)^1,5 = 0,0451 (0,5 %); en la malla (siete granos × tres caudales × tres pendientes) sin valores inválidos, sin arrastre bajo el umbral y con el enrocado en θ = 0,047/1,5; la concentración baja con la altura y sube cuanto menor el número de Rouse; aparecen los cinco modos
- Medido: θcr mínimo 0.0299; grava 0.0553; D* de la grava 759; caída arena 0.0232 m/s; limo 1.7 % de Stokes; q* 0.0451; 63 casos, fallas 0; perfil bien; modos vistos: lavado, mixto, fondo, suspension, quieto

## H15. Calculadoras y prediseñadores de las seis partes: sin errores ni valores inválidos, y propuestas que cumplen sus criterios — cumple

- Tolerancia: 400 juegos de datos al azar en las doce herramientas (4 800 llamadas): ninguna excepción y ningún resultado o paso con NaN, indefinido o infinito (salvo los avisos de datos inválidos); con los datos de ejemplo, la alcantarilla propuesta cumple sus tres criterios, el puente no estrangula, el enrocado tiene clase y el aforador tiene una estructura válida
- Medido: 4800 llamadas; excepciones 0; con valores inválidos 0; propuestas de ejemplo cumplen (alcantarilla: 2 de 1,4 m)
