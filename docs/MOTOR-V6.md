# Motor de IA y simulador V6 (detalle técnico)

> La app (partido con entrenador y pizarras) está en el `README.md` de la raíz. Este documento describe el motor de IA que la alimenta.

Motor de IA modular del fútbol 7 (V6; evolucionó de la V5, cuya versión original ya no está en el repositorio).

## Cómo se usa

El motor corre dentro de la app (`index.html`) y también sin pantalla, con Node, para las pruebas (`tests/engine.js` lo carga en un contexto aislado).

En la consola del navegador: `F7.debug.sim(30)` avanza 30 s, `F7.debug.counts` muestra los diagnósticos, `F7.debug.log` el detalle, `F7.match.init({seed:42})` reproduce un partido, `F7.debug.give(k)` / `F7.debug.place(k,x,y)` arman escenarios.

## Estructura

```
js/                  (el orden de carga es el de dependencias; ninguno depende de uno posterior)
  team-model.js      atributos individuales, catálogo de formaciones 7v7/11v11 y perfiles por rol
  debug.js           diagnósticos (5 códigos), registro de errores, simulación determinista, panel opcional
  match.js           estado, utilidades, formación, transiciones, movimiento de jugadores, reinicios, comandos del usuario
  ball.js            pelota: posesión, pase en vuelo/recepción/intercepción, robo, remate, atajada, despeje, goles, saque de arco
  tactics.js         opciones y riesgo de pase, remate, conducción, decisión del poseedor, búsqueda de espacios para desmarcarse
  team-intelligence.js coordinación de apoyos, separación y estrategia colectiva
  roles.js           perfiles ARQ/DEF/MED/EXT/DEL, anclas dinámicas, movimiento sin pelota, distribución del arquero
  defense.js         bloque, presión única, cobertura, marcas, repliegue, intercepción, contrapresión, arquero
  ai.js              coordina ataque/defensa por jugador y ejecuta las decisiones del poseedor
tests/
  run-tests.js       30 pruebas reproducibles del motor (Node, sin navegador)
  engine.js          carga el motor en un contexto aislado (para las pruebas)
  team-intelligence-tests.js pruebas de perfiles, catálogo de formaciones y coordinación colectiva
  last-run.txt, v5-baseline-run.txt   salidas reales de la última ejecución
```

Dependencias (siempre hacia atrás): `team-model` → `debug` → `match` → `ball` → `tactics` → `team-intelligence` → `roles` → `defense` → `ai` → `main`.
Todo cuelga de un único objeto global `F7` (`F7.state`, `F7.match`, `F7.ball`, …); los módulos solo usan a otros **en tiempo de ejecución**, así que no hay dependencias circulares.

## Cómo probar

```bash
node tests/run-tests.js          # pruebas reproducibles del motor
node tests/team-intelligence-tests.js # perfiles, coordinación y catálogo de formaciones
```

Cada prueba carga un motor nuevo con **semilla fija**, arma un escenario y mide comportamiento real (sin mocks del motor).
En la consola del navegador: `F7.debug.sim(30)` avanza 30 s, `F7.debug.counts` muestra los diagnósticos, `F7.debug.log` el detalle,
`F7.match.init({seed:42})` reproduce un partido, `F7.debug.give(k)` / `F7.debug.place(k,x,y)` arman escenarios.

### Diagnósticos (`F7.debug.counts`)

| Código | Qué detecta |
|---|---|
| `GOALKEEPER_CARRY_TOO_LONG` | arquero con la pelota > 3 s o a más de 0.30 de su arco |
| `PASS_NOT_RECEIVED` | pase que no llega al receptor en 2.2 s (se usa recepción de emergencia) |
| `TEAMMATE_NOT_SUPPORTING` | poseedor presionado ≥ 1.2 s sin ninguna opción de pase razonable |
| `DEFENSE_SHAPE_BROKEN` | equipo sin pelota estirado (> 0.62) o sin nadie por detrás de la pelota cerca de su arco ≥ 1.5 s |
| `PLAYER_CHASING_BALL` | más presionadores/perseguidores de los permitidos (1; 2 en contrapresión o con el botón PRESIÓN) o ≥ 4 jugadores encima de la pelota |

Cinco de las pruebas son **controles negativos**: plantan el problema a propósito y comprueban que el diagnóstico salta
(así un "0" en un partido real significa algo).

## Cambios respecto a V5

**Arquero** — nunca conduce; tras un breve control (0.5 s) pasa corto a un compañero libre (prefiere defensores) o despeja si está
presionado o pasa 1.2 s; límite duro de 2.2 s. Se posiciona entre la pelota y el arco, sale algo con la pelota lejos y va al punto de llegada de los remates.

**Poseedor** — decide entre remate, pase (3 mejores), conducción, protección y despeje con puntuaciones por rol, presión, tiempo con la pelota,
zona y fase, con ruido para no repetir siempre lo mismo. Conducción con 7 direcciones que evita bandas/fondo, retroceso y rivales; tope de tiempo por rol.
Pases evaluados por progresión, distancia, riesgo de intercepción (el marcador *detrás* del receptor no cuenta como bloqueo), marca sobre el receptor,
apoyos y cambios de orientación.

**Compañeros sin pelota** — eligen cada ~0.45 s el mejor punto entre ~30 candidatos (línea de pase libre, espacio, distancia al poseedor,
separación de compañeros, ancla del rol, progresión, amplitud, desmarque a espalda). EXT abre la banda y busca solapamientos, DEL busca profundidad/espalda (y "check-run" si lo marcan),
DEF da salida y queda detrás de la pelota, MED apoya y llega. Con el poseedor presionado se acercan para dar descarga. El receptor sale a buscar la pelota y se orienta hacia ella; el pasador se proyecta (pase y desmarque).

**Defensa** — un solo presionador (con histéresis), cobertura detrás, marcas por peligrosidad (un marcador por rival, lado del arco), bloque que sube/baja
y se comprime hacia el lado de la pelota, repliegue acelerado si quedan < 2 jugadores detrás de la pelota, intercepción de pases en vuelo.

**Transiciones** — `ATAQUE`, `DEFENSA`, `PÉRDIDA` y `RECUPERACIÓN` por equipo (la fase del azul se ve en la cabecera). Los cambios de posesión duran 2.4 s:
- *Pérdida*: si se pierde en campo rival con ≥ 2 compañeros cerca → **contrapresión** (2 presionadores, bloque alto); si no → **repliegue** (contención, bloque bajo, +25% de velocidad).
- *Recuperación*: los atacantes salen más rápido y más adelantados, y el poseedor prioriza pases de progresión.

**Mecánicas que V5 no tenía y fueron necesarias** (V5 nunca perdía la pelota por presión, por eso un poseedor podía quedarse indefinidamente en la línea de fondo):
robo del poseedor por un rival pegado (más difícil si protege la pelota), atajadas/rechazos/bloqueos en los remates con efecto real, pelota muerta detrás de la línea de fondo la toma el arquero (saque de arco),
y tras un gol saca el equipo que lo recibió (V5 siempre daba el saque al azul).


### Mejoras de sensación (post-V6 base)

- **Movimiento**: los jugadores ya no se desplazan a velocidad constante. Tienen velocidad (`vx`/`vy`), aceleración hacia el target y frenado suave. Se siente mucho menos robótico.
- **Motor de espacios**: `bestSpot` evalúa más candidatos (diagonales y profundidades) y premia mejor el espacio libre, la separación entre compañeros y los desmarques a espalda del rival.
- **Off-ball más vivo**: extremos buscan solapamientos, delanteros hacen check-runs cuando están marcados, mediocampistas ajustan el apoyo según presión, anclas con un poco de personalidad por jugador.

## Resultados de las pruebas (ejecución real, ver `tests/last-run.txt`)

**30/30 pruebas OK.** Resumen de lo medido:

| Área | Resultado medido |
|---|---|
| Inicio/reinicio | 20 semillas × 3 reinicios, sin excepciones ni NaN |
| Arquero | 60 casos (2 equipos, con/sin presión): máx. 0.52 s con la pelota, avance máx. 0.06 del largo, 0 conducciones; sale por pase (con compañero libre) 15/15; con rival pegado: 12 despejes, 3 robadas por el rival durante el control inicial |
| Poseedor | tiempo máx. con la pelota (180 s × 12 partidos): DEL 3.0 s, MED 2.8 s, DEF 2.8 s, EXT 2.9 s (límites duros 4.2/3.8/3.4/4.2); usa pase, conducción, remate, protección y despeje; 0/370 conducciones hacia atrás; con formación inicial, 3+ opciones siempre y la mejor con riesgo < 0.6 en 64/72 (peor caso: el extremo marcado en el saque) |
| Desmarques | poseedor sostenido 6 s: opciones abiertas promedio 1.5 (mín. 1), separación mínima entre compañeros 0.18, 0 pegados al poseedor; EXT ancho 12/12, DEL por delante 12/12, DEF detrás 12/12 |
| Defensa | 48 escenarios: máx. 1 presionador, mín. 3 jugadores detrás de la pelota, profundidad máx. 0.49; la línea sube con la pelota 8/8; repliegue: ≥ 4 jugadores detrás de la pelota a los 4 s en 10/10 |
| Transiciones | fases PÉRDIDA/RECUPERACIÓN→DEFENSA/ATAQUE 8/8; contrapresión arriba 10/10 vs repliegue abajo 10/10 (bloque 0.24 más alto); en RECUPERACIÓN el poseedor elige pase de progresión 55/60 vs 18/60 en ATAQUE estable |
| Pases/robos/remates | 60/60 pases libres recibidos (máx. 0.30 s); intercepción con rival en línea 8/8; robo 15/15 (media 1.3 s); gol con arquero lejos 12/12 con reinicio correcto; tiros al centro: 12/30 gol |
| Partidos completos | 20 semillas × 5 min: sin errores; 97% de pases completos; `GOALKEEPER_CARRY_TOO_LONG` = 0, `PASS_NOT_RECEIVED` = 0, `PLAYER_CHASING_BALL` = 0 y `DEFENSE_SHAPE_BROKEN` ≈ 0.1 cada 10 min; ~40 pases/min (ambos equipos), ~2 goles/min, ~10 robos/min |

en 12 de 12 partidos de 180 s un jugador azul terminó reteniendo la pelota los ~179 s en la línea de fondo.

## Limitaciones conocidas (honestas)

- `TEAMMATE_NOT_SUPPORTING` **no es cero**: ~27 cada 10 min de partido (ambos equipos). Ocurre sobre todo cuando el rival marca a todas las opciones y el poseedor está presionado; la IA mejora pero no elimina esas situaciones.
- La orientación del receptor se guarda (`p.face`) y la usa la lógica de recepción, pero no se dibuja ni penaliza el control.
- Sin fueras por las bandas, faltas ni saques de banda: la pelota se queda dentro (como en V5).
- Los números de la IA (pesos, umbrales) son heurísticos ajustados con simulaciones; las pruebas fijan semillas y rangos, no una "verdad" futbolística.
- En el navegador el partido usa semilla aleatoria (cada carga es distinto); en consola `F7.match.init({seed:N})` lo vuelve reproducible.


## Capa de equipo y escalado a Fútbol 11

`team-model.js` incorpora perfiles individuales (visión, técnica, velocidad, posicionamiento, decisión, resistencia y anticipación). Los atributos ajustan de forma moderada la elección de pase, remate y conducción, la velocidad y la fatiga; no sustituyen la lectura de la situación. `team-intelligence.js` refina el punto de apoyo para favorecer líneas de pase, separación y triángulos sin borrar la responsabilidad del rol. Se pueden seleccionar estilos con `F7.teamIntelligence.setStrategy(team, 'possession'|'direct'|'pressing'|'compact'|'balanced')`.

El catálogo incorpora 2-3-1, 3-2-1 y 2-2-2 para 7v7 y 4-3-3, 4-4-2, 4-2-3-1 y 3-5-2 para 11v11. **El motor de partido sigue siendo 7v7**: los datos 11v11 son una base de diseño y no activan una simulación de 22 jugadores. La ampliación real requiere generalizar índices, tamaño de plantilla, arcos, reglas de fuera de juego, roles y pruebas antes de habilitar ese formato.
