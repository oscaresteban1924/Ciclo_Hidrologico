# Pruebas del módulo «Hidráulica de canales»

Se ejecutan con `npm run test:canals`. Cada prueba declara su tolerancia antes de ejecutarse.

**29 de 29 cumplen.**

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
- Medido: 648 casos; inválidos o desbalance 0; bajadas 0; saltos 0; salida a mano 1.6e-16; controles vistos: salida, entrada; retos alcanzables: sí

## H14. Sedimentos: curva de Shields, velocidad de caída, arrastre de fondo, perfil de Rouse y los cinco modos de transporte — cumple

- Tolerancia: θcr mínimo de la curva entre 0,028 y 0,035 y de grava (3 cm) entre 0,05 y 0,06; caída de arena de 0,2 mm entre 0,02 y 0,03 m/s y de limo fino igual a Stokes (5 %); q* = 3,97·(0,1 − 0,0495)^1,5 = 0,0451 (0,5 %); en la malla (siete granos × tres caudales × tres pendientes) sin valores inválidos, sin arrastre bajo el umbral y con el enrocado en θ = 0,047/1,5; la concentración baja con la altura y sube cuanto menor el número de Rouse; aparecen los cinco modos
- Medido: θcr mínimo 0.0299; grava 0.0553; D* de la grava 759; caída arena 0.0232 m/s; limo 1.7 % de Stokes; q* 0.0451; 63 casos, fallas 0; perfil bien; modos vistos: lavado, mixto, fondo, suspension, quieto

## H15. Calculadoras y prediseñadores de las siete partes: sin errores ni valores inválidos, y propuestas que cumplen sus criterios — cumple

- Tolerancia: 400 juegos de datos al azar en las veinticuatro herramientas (9 600 llamadas): ninguna excepción y ningún resultado o paso con NaN, indefinido o infinito (salvo los avisos de datos inválidos); con los datos de ejemplo, la alcantarilla propuesta cumple sus tres criterios, el puente no estrangula, el enrocado tiene clase, el aforador tiene una estructura válida y los muros junto a la compuerta contienen la onda con su borde libre
- Medido: 9600 llamadas; excepciones 0; con valores inválidos 0; propuestas de ejemplo cumplen (alcantarilla: 2 de 1,4 m)

## H16. Fuerza tractiva de Lane y rugosidad compuesta de Horton y Einstein — cumple

- Tolerancia: K de Lane para talud 2:1 y reposo de 33° igual a √(1 − sen²θ/sen²φ) = 0,571 (error < 0,1 %); un talud más empinado que el reposo da K = 0; n compuesto de 2 m a 0,013 y 4 m a 0,030 igual a 0,0250 (error < 0,5 %) y con un solo material, ese mismo n
- Medido: K = 0.5708 (referencia 0.5708); talud 1:1 → K = 0; n = 0.02502; n con un solo material = 0.0200

## H17. Pozos amortiguadores USBR: tipo según F1, V1 y q, y proporciones del tipo III (Peterka) — cumple

- Tolerancia: F1 = 7 con 12 m/s y q = 3,6 m²/s → tipo III, bloques de y1·(4 + F1)/6 y umbral de y1·(18 + F1)/18 (error < 0,1 %), a 0,8·y2 del pie y largo 2,7·y2; con 20 m/s → tipo II con umbral dentado de 0,2·y2; F1 = 3,5 → tipo IV; F1 = 2 → tipo I con el largo del resalto libre
- Medido: tipos III, II, IV, I; h3 = 0.550 m (ref. 0.550); h4 = 0.417 m (ref. 0.417); largo III 7.62 m frente a libre 17.40 m

## H18. Pilas de puente: remanso de Yarnell y socavación local (HEC-18) — cumple

- Tolerancia: Yarnell igual a la ecuación escrita a mano (error < 1e-9); socavación del ejemplo publicado (y1 = 5,334 m, V = 7,15 m/s, a = 4,52 m, cilindro, agua clara) igual a 10,484 m (error < 0,5 %); el tope de 2,4·a (Fr ≤ 0,8) o 3,0·a (Fr > 0,8) en pila redonda; la pila cuadrada socava 10 % más que la redonda
- Medido: Δy = 0.0491 m (ref. 0.0491); ys = 10.485 m; pila de 1 m con Fr = 0.79: 2.40 m (tope sí); cuadrada/redonda = 1.100

## H19. Socavación por contracción (HEC-18): agua clara y lecho vivo — cumple

- Tolerancia: grava de 5 cm a 1,1 m/s (por debajo de la velocidad crítica) → agua clara con y2 = [0,025·Q²/(Dm^(2/3)·W²)]^(3/7) (error < 1e-9); arena de 0,5 mm → lecho vivo con k1 de la tabla; sin contracción (W2 = W1) no hay socavación por lecho vivo
- Medido: agua clara: sí, y2 = 1.805 m (ref. 1.805), ys = 0.000 m; lecho vivo: sí, k1 = 0.69, ys = 0.646 m; sin contracción ys = 0.0000 m

## H20. Transporte de sedimentos con cuatro fórmulas y formas del lecho (van Rijn) — cumple

- Tolerancia: bajo el umbral, Meyer-Peter y Müller y van Rijn dan 0; cada fórmula en su rango de grano: en grava, Meyer-Peter y Müller y Einstein-Brown dentro de un factor de 3; en arena, van Rijn, Einstein-Brown y Engelund-Hansen dentro de un factor de 10; van Rijn fuera de rango en grava; en arena, al subir la velocidad, las formas del lecho siguen el orden quieto → rizos → dunas → transición → lecho plano o antidunas, sin retroceder
- Medido: bajo el umbral: MPM 0, van Rijn 0; grava: MPM 2.738, Einstein-Brown 3.429 L/s·m (factor 1.3; van Rijn fuera de rango); arena: van Rijn 0.0440, Einstein-Brown 0.4149, Engelund-Hansen 0.1602 L/s·m (factor 9.4); formas: lecho → rizos → rizos → dunas → dunas → lecho → lecho

## H21. Aforo: canaleta Parshall y molinete por sección media (ISO 748) — cumple

- Tolerancia: Parshall de 6 y 9 pulgadas con Ha = 1 pie igual a las tablas del USBR (2,06 y 3,07 pies³/s, error < 0,1 %); la carga inversa recupera la carga (error < 1e-9); sección media de un ejemplo a mano: Q = 2,2 m³/s y A = 3,5 m²
- Medido: 6 pulgadas: 2.060 pies³/s; 9 pulgadas: 3.070 pies³/s; carga inversa 0.1200 m; molinete Q = 2.200 m³/s, A = 3.500 m²

## H22. Alcantarilla de cajón: control a la entrada (HDS-5, forma 1) y a la salida, y modelo completo — cumple

- Tolerancia: cajón de 2,0 × 1,5 m con 6 m³/s: HW a la entrada igual al cálculo a mano con Hc = 1,5·dc, K = 0,026 y M = 1 (error < 0,1 %); pérdida a la salida con R = A/P del cajón lleno y ke = 0,4 (error < 1e-9); el cajón (3 m²) deja el agua más baja que un tubo de 1,5 m (1,77 m²); una entrada de tubo pedida para un cajón se cambia por aletas de 30° a 75°
- Medido: X = 2.957; HW = 1.565 m (a mano 1.565); H = 0.3389 m (a mano 0.3389); cajón 1.57 m frente a tubo 2.50 m; entrada corregida: aletas3075

## H23. Planos acotados, gráficas y memoria de cálculo imprimible de los prediseños — cumple

- Tolerancia: 120 juegos de datos (el primero, los de ejemplo) en las doce herramientas con plano o gráfica: ninguna excepción; cada plano y gráfica es un SVG sin NaN, indefinido ni infinito, y la memoria HTML no contiene NaN ni «undefined»
- Medido: 1440 memorias; 849 planos y 593 gráficas; excepciones 0; con valores inválidos 0

## H24. Saint-Venant: rotura de presa sobre fondo seco igual a la solución de Ritter — cumple

- Tolerancia: presa de 1 m en la mitad de un canal de 100 m sin fricción, 800 celdas, a los 4 s: error medio relativo de la profundidad < 2 %; el punto con 1 cm de agua a menos de 2 m del exacto
- Medido: error medio 0.46 %; frente de 1 cm en 69.88 m (exacto 71.30 m)

## H25. Saint-Venant: rotura de presa sobre fondo mojado igual a la solución de Stoker — cumple

- Tolerancia: presa de 1 m sobre 0,1 m de agua, a los 5 s: error medio < 2 %; altura de la meseta a menos de 1 % de la exacta; frente (resalto móvil) a menos de 1 m
- Medido: error medio 0.39 %; meseta 0.3960 m (exacta 0.3962 m); frente en 65.44 m (exacto 65.53 m)

## H26. Saint-Venant: flujo uniforme, conservación del volumen y lago en reposo sobre un fondo irregular — cumple

- Tolerancia: canal de 2 km (S = 0,2 %, n = 0,02, 5 m, 10 m³/s): a mitad del canal, profundidad normal de Manning (error < 1 %) y caudal 10 m³/s (error < 0,5 %); volumen final = inicial + entrado − salido (error relativo < 1e-9); un lago sobre una loma queda quieto (caudal por metro < 1e-9 m²/s a los 100 s)
- Medido: y = 1.0779 m (Manning 1.0797 m); Q = 9.9555 m³/s; error de volumen 3.9e-15; lago: 2.0e-15 m²/s

## H27. Compuerta en el canal: el agua sube hasta la carga del orificio y sale por la vena contraída — cumple

- Tolerancia: compuerta de 0,3 m con 1 m²/s: aguas arriba, la profundidad de la ecuación del orificio q = Cc·a·√(2g·(h1 − Cc·a)) (error < 1 %); aguas abajo, Cc·a = 0,183 m (error < 2 %); caudal que pasa igual al que entra (error < 0,5 %)
- Medido: arriba 1.7002 m (ecuación 1.7049 m); abajo 0.1830 m; Q 1.9970 m³/s

## H28. Onda positiva por el cierre brusco de una compuerta (Favre) — cumple

- Tolerancia: canal con 1 m de agua a 1 m/s y la compuerta cerrada de golpe, a los 30 s: altura detrás del frente a menos de 1 % de la de Favre (masa y cantidad de movimiento en el frente) y frente a menos de 2 m de la posición teórica
- Medido: altura 1.3418 m (Favre 1.3418 m); frente en 212.25 m (Favre 212.22 m, a 2.926 m/s)

## H29. El resalto calculado en el tiempo llega al estado del cálculo permanente — cumple

- Tolerancia: cuatro pozos: con el chorro del pie de la rápida entrando al pozo lleno hasta la cresta, a los 200 s el modelo de Saint-Venant (celdas de 10 cm) da el mismo resultado que el cálculo permanente (resalto atrapado o barrido); si queda atrapado, la profundidad del pozo a menos de 4 % y el resalto dentro del pozo. La posición del resalto se informa pero no se exige: es muy sensible a la profundidad del pozo
- Medido: 12 m³/s, vertedero 0.8 m: atrapado / atrapado, pozo 2.32 m (permanente 2.26), resalto a 3.8 m (permanente 7.6); 12 m³/s, vertedero 0.6 m: barrido / barrido; 20 m³/s, vertedero 1.2 m: atrapado / atrapado, pozo 3.32 m (permanente 3.25), resalto a 0.1 m (permanente 4.9); 8 m³/s, vertedero 0.5 m: atrapado / atrapado, pozo 1.64 m (permanente 1.61), resalto a 8.3 m (permanente 10.6)
