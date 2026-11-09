# ⚽ Fútbol Táctico — Partido con entrenador y pizarras (Fútbol 7)

App para **celular y tablet** (instalable y sin conexión): jugás tu posición en un partido en vivo y un **entrenador** frena el juego, te pregunta qué hacer y te corrige. Incluye **pizarras tácticas** editables, **vistas 3D** y la **ficha del jugador**. Es la página principal (`index.html`).

## 📲 App para el celular

Es una **app instalable (PWA)**: se agrega a la pantalla de inicio, abre a pantalla completa con su ícono y **funciona sin internet** una vez abierta la primera vez.

- **Android (Chrome):** abrí el link → botón **📲 Instalar en el celular** del menú (o ⋮ → *Instalar app*).
- **iPhone (Safari):** abrí el link → **Compartir** → **Agregar a pantalla de inicio**.
- Se actualiza sola: la versión nueva se baja en segundo plano y aparece la siguiente vez que abrís la app.
- El progreso, la ficha y las pizarras editadas se guardan **en ese celular** (no se sincronizan entre dispositivos).
- Para cambiar qué se guarda sin conexión, editá la lista de `sw.js` y subí `VERSION`.

## ⚽ Partido con entrenador y pizarras (`index.html`)

El motor de entrenamiento de **Vóley TV** aplicado al fútbol 7. Jugás tu posición en un partido en vivo y, cuando llega el momento, el juego frena con una curva suave, hace zoom y aparece una **tarjeta con opciones A/B/C**, cada una marcada con un **círculo en el piso**. Podés tocar la opción o el círculo. Después corrige, explica por qué y vuelve a acelerar.

| Tarjeta | Qué pregunta | De dónde sale la respuesta |
|---|---|---|
| Ubicación en ataque / defensa | ¿Dónde tenés que estar? | El punto que la IA elige para tu posición |
| Transición ofensiva / defensiva | ¡Recuperamos! / ¡La perdimos! ¿A dónde vas? | Igual, con contrapresión o repliegue según el motor |
| Pelota parada | Saque de arco: ¿dónde te parás? | El lugar de tu posición en la pizarra |
| ¿De quién es? | ¿Presionás, cubrís o marcás? | La tarea que el motor te asignó en la defensa |
| Leer la jugada | ¿Qué va a hacer el poseedor? | Repetir su decisión 200 veces y contar |
| Con la pelota | ¿Qué hacés? (se ejecuta de verdad) | La opción más probable, con riesgo, distancia y metros ganados |
| Después del pase | ¿A dónde vas? (si acertás, hay pared) | El mejor punto de carrera |
| Distribución del equipo | ¿Qué le falta al equipo? | Ancho, largo, distancia entre líneas, carriles y gente detrás de la pelota |

- **Ralentizado progresivo por nivel (como en Vóley TV):** 6 niveles de lectura. Cuando hay que decidir, el juego frena de a poco y sigue a la velocidad de tu nivel: **congelado, 6 %, 14 %, 28 %, 50 % y tiempo real**. **Cada acierto sube un nivel y cada error baja uno**; si en una zona de la cancha te equivocás mucho, ahí se vuelve más lento. A partir del nivel 3 hay un tiempo límite para decidir (10 → 4 s) y, si se acaba, cuenta como error. La tarjeta muestra *lectura n/6 · velocidad*.
- **Sonido de acierto y error:** suena un "bien" (tres notas que suben) o un "mal" (dos tonos graves que bajan) al corregirte. También en modo manual cuando estás fuera de lugar en el nivel máximo. El botón 🔊 lo apaga y queda guardado.
- **Control de velocidad del juego:** deslizador de 20 % a 120 % en el menú y en el partido (botón ⏱, con atajos 30 / 60 / 100 %). Por defecto va al 60 %, porque a velocidad real los jugadores corren muy rápido para la cancha de 60 × 40 m. Se guarda.
- **Flecha de guía (🧭):** muestra adónde tenés que ir y qué hacer, con un color y una leyenda por acción: 🟣 **bloquear** (cerrar el camino al arco o la línea de pase), ⚪ **desplazarte** (moverte al espacio), 🔴 **disputar la pelota** (presionar o ir a la dividida), 🟢 **hacer el pase**, 🟡 **interceptar el pase** y 🟠 **disparar al arco**. Con la pelota, apunta a lo más probable según el motor. Arranca prendida en modo *Manual*; tocá la leyenda para ver la lista de colores.
- **Dos formas de jugar:** *Tarjetas* (tu jugador se mueve solo y te preguntan) y *Manual* (lo movés tocando la cancha y el entrenador solo frena si vas mal; si vas bien encaminado no corta el juego).
- **Vistas:** *TV* (de costado, sigue la pelota), *3D* (alta, detrás del arco), *Hombro* (detrás de tu jugador) y *Pizarra* (cenital). Al frenar, la cámara encuadra todos los círculos; si una opción queda a tu espalda, la vista de hombro pasa a la de costado. En *3D* y *Hombro* **arrastrá con el dedo para mirar hacia otro lado**; aparece 🎯 para volver al centro. Un toque corto sigue moviendo a tu jugador.
- **Animación:** esqueleto 3D con cinemática inversa: carrera, pasos laterales y de espaldas, pase, remate, despeje, recepción (el pie va a la pelota), barrida, estirada y postura del arquero, festejo.
- **Ficha del jugador:** nota general ponderada por tu posición, radial de 8 áreas (ubicación, transición, presión, lectura, decisión, pase, remate, reacción), lo que hacés bien y lo que tenés que mejorar (incluye el error que más repetís y la pizarra para repasar), y métricas: tarjetas por situación, zona, pases, remates, recuperación, últimos partidos y nivel de entrenamiento. Se filtra por posición.
- **Pizarras (17):** ofensiva (salida, creación, finalización), defensiva (presión alta, bloque medio, bloque bajo), transiciones (ofensiva, contrapresión, repliegue) y pelota parada (saque de arco rival, saque del medio, córner, tiro libre y lateral, a favor y en contra). Cada una tiene la idea, la tarea de cada posición y flechas. Se pueden **animar**, **editar**, **exportar/importar** y rendir un **examen** (te ocultan y tocás dónde te parás).
  - **Editar con el dedo:** arrastrá cualquier jugador (tuyo o rival) y **arrastrá el círculo amarillo de la punta de una flecha** para cambiar adónde va. Con un jugador elegido, **➕ Flecha** le agrega una y **🗑 Quitar flecha** se la saca. Todo queda guardado en el celular y **↺ Restablecer** vuelve a la pizarra original.
  - **🎬 Guardar video:** graba la animación (4,2 s) en un video de 1280×720 con zoom a la jugada, las flechas y el nombre de la pizarra, y lo descarga. En Chrome (Android y PC) y Safari sale **MP4**; en Firefox, que no sabe grabar MP4, sale **WebM** y la app lo avisa. Si el celular lo permite, aparece **📤 Compartir video** (WhatsApp, etc.).

## Probarlo desplegado en Vercel (desde el celular)

1. Entrá a **vercel.com/new** (iniciá sesión con tu cuenta de GitHub).
2. Elegí el repositorio **Futbol-tactic-train** → **Import**.
3. No cambies nada (Framework: *Other*, sin build) → **Deploy**.
4. Te da un link tipo `https://futbol-tactic-train.vercel.app`. Abrilo en el celular y, si querés, *Agregar a pantalla de inicio*.

Cada vez que se sube un cambio a la rama `main`, Vercel vuelve a desplegar solo. También se puede abrir localmente `index.html` (no necesita servidor).
`/partido` y `/sim` (direcciones viejas) redirigen a la página principal.

## Estructura

```
index.html, css/partido.css partido con entrenador en vivo y pizarras tácticas (página principal)
js/                           (orden de carga = orden de dependencias; sin dependencias circulares)
  debug.js match.js ball.js tactics.js roles.js defense.js ai.js    motor de IA del partido (ver docs/MOTOR-V6.md)
  trainer.js                  lógica del entrenador, sin DOM: arma jugadas, probabilidades, puntajes, diagnóstico de errores
  cam3d.js                    cámara con perspectiva (metros, proyección, del toque al piso), sin DOM
  ficha.js                    las 17 pizarras, sus ediciones y la lectura de la fase del partido, sin DOM
  puppet.js                   esqueleto y animación de jugadores, sin DOM
  coach.js                    entrenador en vivo: cuándo preguntar, tarjetas, niveles, distribución del equipo, sin DOM
  audio.js                    sonidos de acierto y error (WebAudio), sin DOM
  pwa.js, sw.js, manifest.webmanifest, icons/   app instalable: aviso de instalar, funcionamiento sin conexión, ícono
  perfil.js                   ficha del jugador: acciones registradas, notas, radial, bien y mal, tablas, sin DOM
  render3d.js                 dibujo en canvas de cancha, jugadores y círculos en las 4 cámaras
  partido-ui.js               interfaz de index.html (único módulo de esa página que toca el DOM)
tests/                        pruebas (ver abajo) y sus salidas reales: *last-run.txt
docs/MOTOR-V6.md              detalle del motor, cambios respecto de V5 y limitaciones
vercel.json, package.json     despliegue estático (sin build ni dependencias)
```

## Pruebas (ejecuciones reales; las salidas están en `tests/*last-run.txt`)

```bash
npm test                    # = run-tests.js, train-tests.js y coach-tests.js   (sin dependencias)
node tests/ui-pwa.js        # app instalable: manifiesto, íconos, service worker y apertura sin conexión (requiere Playwright)
node tests/ui-partido.js    # index.html (la app principal) en navegador, vertical y apaisado (requiere Playwright; F7_CHANNEL=chrome usa el Chrome instalado)
```

| Qué | Resultado medido |
|---|---|
| Motor de IA (`run-tests.js`) | **32/32 OK**: arquero, poseedor, desmarques, defensa, transiciones, pases/robos/remates/goles, diagnósticos (incluye controles negativos), 20 partidos × 5 min sin errores, reinicio limpio, guardar/restaurar el partido exacto |
| Entrenador (`train-tests.js`) | **12/12 OK**: jugadas válidas para las 7 posiciones en ataque y defensa (42 jugadas, ~0.2–0.3 s c/u en una PC), **56 de 56 jugadas arrancan con saque de arco** (progresión de 2 a 10 s, mediana 3 s, cuadro final = instante congelado), jugada determinista al repetirla, puntajes, 12 códigos de error verificados, la jugada se juega y termina, progreso, **paredes**: de 30 jugadas con el usuario poseedor, 20 ofrecen una pared posible y las 20 salen al jugarlas; y “a dónde ir” marca errores concretos |
| **Calibración** | En 60 jugadas reales, la opción que el juego marca como más probable ocurrió **78%** de las veces (el modelo esperaba **71%**) y **ningún** desenlace real estuvo marcado como “casi imposible” (<2%) |
| Partido, tarjetas, pizarras y ficha (`coach-tests.js`) | **17/17 OK**: 17 pizarras válidas, cámara ida y vuelta, huesos de largo fijo, tarjetas en las 7 posiciones, curva de frenado y tiempo límite, niveles, acciones que se ejecutan de verdad, pared con devolución, distribución, modo manual, ficha, 20 partidos sin trabas |
| `index.html` en navegador (`ui-partido.js`) | **75/75 OK** en 390×844, 360×640 y 844×390: tarjetas, círculos visibles fuera de la tarjeta, 4 cámaras, pizarras (editar, animar, examen), ficha, progreso guardado, sin errores de consola |

Durante el desarrollo estas pruebas encontraron y corrigieron errores reales: un estado que no se reiniciaba entre partidos (`tackleCdUntil`; afectaba también al botón REINICIAR de la V6) y un detector de desenlace que confundía la decisión anterior del poseedor con la actual (las probabilidades mostradas no coincidían con lo real hasta arreglarlo), jugadas que se decían “saque de arco” pero se reiniciaban a mitad de camino, y un cuadro de animación con tiempo negativo que trababa la progresión en el celular, y un puntaje de ubicación calculado después de jugar la jugada (con los jugadores ya movidos) en lugar de antes.

## Limitaciones honestas

- Las “probabilidades” y las ubicaciones ideales son **las de la IA del motor** (reglas tácticas heurísticas), no estadísticas de partidos reales ni de tu equipo. Sirven para aprender conceptos de posicionamiento, no son una verdad táctica.
- La app porta de Vóley TV su entrenador, su cámara, su animación y su ficha, adaptados al fútbol.
- Una jugada tarda en armarse entre ~0.2 s (en una PC) y varios segundos en celulares lentos; se muestra “Armando la jugada…”.
- Sin fueras por las bandas, faltas ni saques de banda (igual que en V5/V6). Por eso córner, tiro libre y lateral existen en las pizarras y en su examen, pero **no ocurren en el partido en vivo**: ahí la única pelota parada que se pregunta es el saque de arco.
- Editar una pizarra cambia la respuesta de su examen y de la tarjeta de saque de arco, pero **no cambia cómo juega la IA**: en juego abierto el equipo se mueve con el motor.
- Las pizarras son propuestas tácticas para el 2-3-1: conviene que las revise un entrenador.
- El motor es 2D: la altura de la pelota es solo de dibujo. El arco se dibuja de 8,8 m porque es lo que mide en el motor (el reglamentario de fútbol 7 es de 6 m) y la velocidad del motor en metros es alta para una cancha de 60 × 40.
