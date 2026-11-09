# Decisión técnica — «Medellín: laboratorio de lluvia»

Fecha: 8 de noviembre de 2026. Alcance: módulo integrado en la aplicación del ciclo del agua (React 19 + TypeScript + Vite 8).

## 1. Requisitos que guiaron la decisión

- El cálculo tiene que correr en los equipos de un aula: portátiles, tabletas y teléfonos, muchos sin WebGPU.
- Hay que llevar las cuentas del agua: lluvia, infiltración, almacenamiento, sumideros, techos, salidas y residuo, cada término por separado.
- Los edificios tienen que bloquear el flujo de verdad, a cualquier profundidad.
- Las corridas tienen que ser reproducibles: reiniciar debe devolver exactamente el mismo resultado, y la comparación A/B debe usar las mismas condiciones.
- La licencia tiene que ser compatible con una aplicación educativa distribuida como sitio estático y como archivo único.
- La aplicación debe usar un solo motor geográfico o 3D; no se cargan varios en paralelo.

## 2. Candidatos evaluados

Se clonó la última versión de cada repositorio, se revisaron el código y la licencia y se hizo una prueba mínima. Los repositorios no se instalaron en el proyecto.

| Candidato | Commit revisado | Licencia | Mantenimiento | Qué hace | Prueba mínima | Decisión |
|---|---|---|---|---|---|---|
| IsenFlow (Glavin001) | `bdc083a`, 23-05-2026 | MIT | Activo | Aguas someras por «tubos virtuales» en WebGPU; acople con Rapier; edificios como cota del lecho. | Requiere `navigator.gpu`. En el Chrome de pruebas, `'gpu' in navigator` = `false`, así que el solucionador no se puede iniciar. No tiene lluvia, infiltración, sumideros ni balance por términos. | Solo como **referencia**: representación de obstáculos y presupuesto por cuadro. No se integra porque depende de WebGPU. |
| OpenFloodLab (SeanWong17) | `18c4ab5`, 12-07-2026 | **AGPL-3.0-only** | Activo | Solucionador de carga hidráulica conservativo en CPU y WebGL2; capa MapLibre; manifiestos de DEM con hash. | Plano inclinado de 64×32 con bloque alto y fuente puntual (`tools/candidatos/openfloodlab_prueba_minima.mts`): volumen inyectado 1,3571 m³, error relativo −3,3·10⁻⁷ (float32), sin agua dentro del bloque. | **Referencia** de buenas prácticas: limitador de salida, manifiestos y documentación. No se incorpora: la AGPL obligaría a relicenciar la aplicación; además no tiene lluvia ni infiltración, y junta en un solo «volumen no contabilizado» el drenaje de borde, el recorte y el error numérico. |
| WebFlood (aeickhoff) | `31569ef`, 04-09-2018 | MIT | Sin mantenimiento desde 2018 | Esquema semilagrangiano en sombreadores WebGL1 (tesis). | Revisión de código: WebGL1, sin módulos, dependencias antiguas. | Solo referencia histórica. |
| DC Flood Sim (abhiramm7) | `faf6b7e`, 12-06-2026 | **GPL-3.0** | Activo | SWE en GPU con edificios de OSM y caudales de USGS. | Revisión de código y de la demostración documentada: los edificios se dibujan, pero el flujo no los respeta. | **No se reproduce** ese error. Se tomó como contraejemplo y la prueba obligatoria 5 lo verifica. |
| Three.js | 0.187.0 (npm) | MIT | Activo | Motor 3D WebGL2. | Instalación fijada y prueba de WebGL2 en Chrome sin GPU (SwiftShader): funciona. | **Se adopta** para el dibujo, con carga diferida. |
| 3DTilesRendererJS, Cesium, MapLibre | — | MIT / Apache-2.0 / BSD-3 | Activos | Teselas 3D, globo y mapas. | No se instalaron. | Se descartan: los sectores son pequeños y se preparan antes, así que no hace falta transmitir teselas. Usarlos habría sumado un segundo motor geográfico. |
| osm_3d_model, osm2threejs, map3d | — | — | — | Extruir OSM a 3D. | No se instalaron. | Se descartan: extruyen sobre un plano y no resuelven la topografía de Medellín. La extrusión sobre el terreno ya la hacen el compilador y la escena. |
| anuga_core, SWMM, anuga_drainage, SynxFlow, SFINCS | — | Apache-2.0 / dominio público / varias | Activos | Hidráulica completa, redes de drenaje y modelos costeros. | No se instalaron. | Quedan para una fase posterior. La interfaz `DrainNetworkAdapter` ya está preparada para conectar SWMM (ver `src/city/sim/drainage.ts`). |

Las versiones de estas herramientas quedan fijadas en `package.json`: `three@^0.187.0`, `@types/three@^0.187.0` y `tsx@^4.23.15` (este último solo para pruebas). Pyproj 3.8.0 y Shapely 2.2.0 se usan únicamente en el pipeline de datos, que no forma parte de la aplicación.

## 3. Decisión

1. **Cálculo.** Se escribió un núcleo propio en TypeScript, puro y sin dependencias del navegador (`src/city/sim/`), con la aproximación inercial local de las ecuaciones de aguas someras (Bates et al. 2010; de Almeida et al. 2012). Corre en la CPU de cualquier equipo, usa números de doble precisión, lleva el balance por términos y es determinista.
2. **Dibujo.** Three.js con WebGL2 se carga solo al entrar al módulo. Sin WebGL2, se ofrece un mapa 2D que muestra el **mismo cálculo en vivo**; no es una reproducción grabada.
3. **WebGPU.** La aplicación lo detecta y lo informa, pero no lo necesita.
4. **Datos.** Se preparó un pipeline reproducible en Python (`tools/geo/medellin_pipeline.py`) que genera el archivo de escenario antes de usar la aplicación. Se puso a prueba contra un servidor que imita el MapServer, y la aplicación valida, compila y simula el resultado.

## 4. Acceso a los datos reales en este entorno

La consulta al servicio `VM_Cartografia_City_Urban_2022/MapServer/9` desde el entorno de trabajo fue rechazada por el proxy («CONNECT tunnel failed, response 403»). La lectura de metadatos por otra vía también fue denegada. Por regla del entorno, no se intentaron otros caminos.

Por eso el módulo trae:
- un **escenario didáctico de verificación** («Calle de prueba»);
- un **sector demostrativo inspirado en Medellín** («Ladera con quebrada»), identificado así en pantalla;
- el **cargador de datos reales listo** (pipeline + importación validada en la aplicación).

Ningún sumidero, tubería, pendiente ni bordillo se presenta como infraestructura levantada de Medellín.
