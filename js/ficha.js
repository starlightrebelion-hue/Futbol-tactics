/* ficha.js — pizarras del entrenador (equivalente a la ficha de Vóley TV) y lectura de la fase del partido. Sin DOM.
 * Cada pizarra dice dónde va cada posición y qué tarea tiene en una fase o pelota parada del esquema 2-3-1.
 * Coordenadas del motor: x = largo (0 arco propio, 1 arco rival), y = ancho (0 = izquierda de quien ataca).
 * nos / rival: 7 puntos [x, y] en el orden ARQ, DEF izq, DEF der, MED izq, MED der, EXT, DEL.
 * flechas: [posición, x destino, y destino]. Son propuestas tácticas editables, no una verdad: el entrenador las puede mover.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;

  const GRUPOS = [['ofensiva', 'Ofensiva'], ['defensiva', 'Defensiva'], ['transicion', 'Transiciones'], ['parada', 'Pelota parada']];
  const NOMBRES = ['Arquero', 'Defensa izq', 'Defensa der', 'Medio izq', 'Medio der', 'Extremo', 'Delantero'];

  const PIZARRAS = [
    { id: 'salida', grupo: 'ofensiva', nombre: 'Salida desde el fondo', idea: 'Abrir la cancha para que el arquero tenga dos salidas cortas y una larga.',
      pelota: [0.06, 0.5], nos: [[0.06, 0.5], [0.15, 0.16], [0.15, 0.84], [0.33, 0.36], [0.29, 0.66], [0.48, 0.1], [0.6, 0.58]],
      rival: [[0.94, 0.5], [0.6, 0.3], [0.62, 0.7], [0.42, 0.38], [0.44, 0.64], [0.27, 0.24], [0.25, 0.6]],
      flechas: [[1, 0.2, 0.12], [2, 0.2, 0.88], [3, 0.27, 0.42], [6, 0.72, 0.5]],
      tareas: ['Jugá corto al defensa libre. Si los dos están tapados, buscá al medio o andá largo al extremo.', 'Abrite casi hasta la banda y perfilate para recibir mirando adelante.', 'Abrite a la banda contraria: si te llega, ya tenés el medio de frente.', 'Bajá a la espalda del primer presionador para ofrecer el pase interior.', 'Quedate escalonado con el otro medio: nunca a la misma altura.', 'Dá amplitud arriba y estirá al lateral rival: sos la salida larga.', 'Fijá a los centrales lo más lejos posible para alargar la cancha.'] },
    { id: 'creacion', grupo: 'ofensiva', nombre: 'Creación en campo medio', idea: 'Triángulos alrededor de la pelota y un jugador por carril.',
      pelota: [0.44, 0.66], nos: [[0.12, 0.5], [0.3, 0.3], [0.32, 0.68], [0.46, 0.4], [0.44, 0.66], [0.62, 0.1], [0.72, 0.56]],
      rival: [[0.94, 0.5], [0.72, 0.36], [0.74, 0.64], [0.58, 0.42], [0.58, 0.66], [0.46, 0.22], [0.42, 0.54]],
      flechas: [[5, 0.74, 0.1], [6, 0.8, 0.42], [3, 0.56, 0.34]],
      tareas: ['Adelantá unos metros: sos el pase de seguridad para cambiar de lado.', 'Quedate detrás de la pelota, listo para el cambio de orientación.', 'Apoyá por detrás del poseedor y cubrí la posible pérdida.', 'Buscá el espacio entre líneas, de frente al arco rival.', 'Con pelota: mirá primero al delantero, después a la banda contraria.', 'Mantené la raya y atacá la espalda del lateral cuando te miren.', 'Tirá la diagonal a la espalda de los centrales.'] },
    { id: 'finalizacion', grupo: 'ofensiva', nombre: 'Finalización', idea: 'Llegar al área con gente en tres alturas: primer palo, segundo palo y rebote.',
      pelota: [0.76, 0.12], nos: [[0.16, 0.5], [0.4, 0.34], [0.42, 0.66], [0.62, 0.44], [0.68, 0.68], [0.76, 0.12], [0.84, 0.52]],
      rival: [[0.95, 0.5], [0.85, 0.36], [0.86, 0.6], [0.74, 0.26], [0.72, 0.52], [0.58, 0.32], [0.54, 0.6]],
      flechas: [[6, 0.9, 0.46], [4, 0.84, 0.66], [3, 0.72, 0.4], [5, 0.85, 0.14]],
      tareas: ['Salí del área: si hay pérdida, sos el primero en cortar el pelotazo.', 'Vigilá al delantero rival: quedate con ventaja de metros.', 'Cerrá atrás con tu compañero: nunca dos arriba y uno abajo.', 'Llegá a la puerta del área para el rebote y el pase atrás.', 'Atacá el segundo palo con la carrera, no parado.', 'Encará hasta la línea o tirá el centro atrás.', 'Atacá el primer palo y arrastrá a un central.'] },

    { id: 'presion_alta', grupo: 'defensiva', nombre: 'Presión alta', idea: 'Un solo jugador va a la pelota; el resto cierra las salidas cortas.',
      pelota: [0.86, 0.3], nos: [[0.2, 0.5], [0.46, 0.34], [0.46, 0.66], [0.62, 0.42], [0.66, 0.62], [0.8, 0.24], [0.84, 0.42]],
      rival: [[0.95, 0.5], [0.86, 0.3], [0.84, 0.72], [0.7, 0.4], [0.68, 0.66], [0.56, 0.26], [0.52, 0.6]],
      flechas: [[6, 0.85, 0.33], [5, 0.84, 0.24], [3, 0.68, 0.4]],
      tareas: ['Adelantá hasta el borde del área: cubrís la espalda de la línea.', 'Subí la línea con tu compañero y achicá al delantero rival.', 'Mantené la altura del otro defensa: no dejes habilitada la espalda.', 'Saltá sobre el medio rival: que no pueda recibir de frente.', 'Cerrá la salida interior del lado contrario.', 'Cerrá la salida a la banda: empujá la pelota hacia adentro.', 'Presioná al poseedor en curva, tapando el pase al otro defensa.'] },
    { id: 'bloque_medio', grupo: 'defensiva', nombre: 'Bloque medio', idea: 'Equipo corto: menos de 25 metros entre el primero y el último, cargado al lado de la pelota.',
      pelota: [0.58, 0.3], nos: [[0.08, 0.5], [0.28, 0.36], [0.28, 0.6], [0.42, 0.34], [0.42, 0.56], [0.52, 0.26], [0.54, 0.46]],
      rival: [[0.92, 0.5], [0.66, 0.36], [0.68, 0.64], [0.58, 0.3], [0.52, 0.6], [0.36, 0.22], [0.34, 0.56]],
      flechas: [[5, 0.56, 0.28], [3, 0.44, 0.3]],
      tareas: ['Ubicate entre la pelota y el centro del arco, a la altura del área chica.', 'Vigilá al delantero rival del lado de la pelota.', 'Cerrá hacia adentro: la banda contraria no es peligro todavía.', 'Tapá el pase interior: no dejes recibir entre líneas.', 'Corrate hacia la pelota y quedá a 8–10 m del otro medio.', 'Sos el presionador: salí cuando el rival mire abajo.', 'Tapá el pase atrás para que no cambien de lado.'] },
    { id: 'bloque_bajo', grupo: 'defensiva', nombre: 'Bloque bajo', idea: 'Proteger el área: dos líneas juntas, nadie se sale sin cobertura.',
      pelota: [0.3, 0.22], nos: [[0.05, 0.46], [0.14, 0.34], [0.14, 0.56], [0.24, 0.28], [0.24, 0.5], [0.32, 0.3], [0.36, 0.5]],
      rival: [[0.9, 0.5], [0.5, 0.34], [0.52, 0.66], [0.3, 0.22], [0.34, 0.54], [0.16, 0.2], [0.16, 0.48]],
      flechas: [[3, 0.27, 0.24], [1, 0.12, 0.3]],
      tareas: ['Cubrí el primer palo y mandá a tu línea a gritos.', 'Cerrá el primer palo y al extremo rival.', 'Cuidá el centro del área: el delantero es tuyo.', 'Salí al poseedor solo con cobertura detrás.', 'Tapá el pase atrás y la entrada del medio rival.', 'Bajá hasta la línea de medios: no dejes un 2 contra 1 en la banda.', 'Quedate como salida para el contragolpe, pero tapando el pase al medio.'] },

    { id: 'trans_of', grupo: 'transicion', nombre: 'Transición ofensiva', idea: 'Recuperás: primer pase hacia adelante y carreras a la espalda antes de que se ordenen.',
      pelota: [0.36, 0.6], nos: [[0.08, 0.5], [0.24, 0.34], [0.24, 0.66], [0.4, 0.4], [0.36, 0.6], [0.46, 0.16], [0.5, 0.56]],
      rival: [[0.94, 0.5], [0.58, 0.3], [0.6, 0.7], [0.44, 0.62], [0.42, 0.46], [0.34, 0.26], [0.3, 0.52]],
      flechas: [[6, 0.74, 0.48], [5, 0.7, 0.12], [3, 0.52, 0.34]],
      tareas: ['Si la tenés vos, buscá ya al que corre: el pase rápido vale un gol.', 'Quedate atrás cuidando la contra de la contra.', 'Apoyá por detrás del que recuperó para darle salida.', 'Acompañá por dentro para el pase corto hacia adelante.', 'Levantá la cabeza y mirá la carrera del delantero primero.', 'Corré por la banda sin esperar: abrís el contragolpe.', 'Picá a la espalda de los centrales apenas se recupera.'] },
    { id: 'contrapresion', grupo: 'transicion', nombre: 'Transición defensiva: contrapresión', idea: 'Perdés cerca del arco rival y hay gente cerca: cinco segundos para recuperar.',
      pelota: [0.7, 0.4], nos: [[0.16, 0.5], [0.42, 0.34], [0.44, 0.66], [0.6, 0.46], [0.62, 0.3], [0.72, 0.22], [0.74, 0.48]],
      rival: [[0.94, 0.5], [0.82, 0.34], [0.82, 0.66], [0.7, 0.4], [0.68, 0.62], [0.54, 0.26], [0.5, 0.6]],
      flechas: [[6, 0.71, 0.42], [5, 0.72, 0.34], [3, 0.64, 0.44]],
      tareas: ['Adelantá para cortar el pelotazo a la espalda.', 'Subí y anticipá al delantero rival.', 'Cerrá la banda contraria sin regalar la espalda.', 'Cerrá el pase corto al medio rival.', 'Tapá el pase hacia atrás del poseedor.', 'Saltá de costado sobre el poseedor.', 'Presioná de frente, sos el más cerca: que no levante la cabeza.'] },
    { id: 'repliegue', grupo: 'transicion', nombre: 'Transición defensiva: repliegue', idea: 'Perdés lejos o sin gente cerca: corré hacia tu arco, por dentro y por detrás de la pelota.',
      pelota: [0.52, 0.66], nos: [[0.1, 0.5], [0.3, 0.36], [0.3, 0.62], [0.44, 0.44], [0.5, 0.7], [0.62, 0.22], [0.66, 0.5]],
      rival: [[0.93, 0.5], [0.7, 0.34], [0.7, 0.66], [0.52, 0.66], [0.56, 0.44], [0.36, 0.26], [0.32, 0.58]],
      flechas: [[3, 0.26, 0.5], [4, 0.34, 0.66], [5, 0.36, 0.3], [6, 0.44, 0.54], [1, 0.2, 0.4], [2, 0.2, 0.6]],
      tareas: ['Retrocedé a tu línea y ordená a los gritos quién toma a quién.', 'Corré hacia atrás cerrando el centro: no salgas a la pelota.', 'Retrocedé mirando la pelota y al delantero rival.', 'Volvé por dentro: el camino más corto al arco.', 'Temporizá al poseedor sin tirarte: ganá tiempo para los demás.', 'Corré a la línea de medios, no te quedes esperando la contra.', 'Bajá detrás de la pelota y tapá el pase atrás.'] },

    { id: 'saque_arco_contra', grupo: 'parada', nombre: 'Saque de arco rival', idea: 'Cada uno toma una salida corta: que tengan que jugar largo.',
      pelota: [0.94, 0.5], nos: [[0.2, 0.5], [0.48, 0.3], [0.48, 0.7], [0.62, 0.38], [0.62, 0.62], [0.76, 0.2], [0.78, 0.5]],
      rival: [[0.94, 0.5], [0.82, 0.2], [0.82, 0.8], [0.66, 0.36], [0.7, 0.62], [0.5, 0.12], [0.42, 0.56]],
      flechas: [[5, 0.8, 0.2], [6, 0.8, 0.46]],
      tareas: ['Adelantá hasta el borde del área: el pelotazo largo es tuyo.', 'Ganá el primer balón largo: estás de frente, el delantero de espaldas.', 'Cerrá al segundo receptor y atacá el rebote.', 'Tomá al medio rival: que no se perfile.', 'Tapá el pase interior de la salida.', 'Saltá al defensa que abre por tu lado.', 'Tapá el pase al otro defensa y al medio.'] },
    { id: 'saque_medio', grupo: 'parada', nombre: 'Saque del medio', idea: 'Salir con una jugada ensayada: atrás y cambio a la banda.',
      pelota: [0.5, 0.5], nos: [[0.06, 0.5], [0.22, 0.29], [0.22, 0.71], [0.39, 0.34], [0.44, 0.52], [0.47, 0.14], [0.49, 0.5]],
      rival: [[0.945, 0.5], [0.78, 0.71], [0.78, 0.29], [0.61, 0.66], [0.61, 0.34], [0.57, 0.75], [0.6, 0.25]],
      flechas: [[5, 0.72, 0.12], [4, 0.42, 0.56]],
      tareas: ['Atento a la devolución larga.', 'Ofrecé el apoyo para el cambio de lado.', 'Quedate de seguro detrás de la pelota.', 'Apoyá al medio y mirá la banda.', 'Recibís el primer pase hacia atrás y cambiás de lado.', 'Picá por la banda en cuanto se mueve la pelota.', 'Sacás hacia atrás y salís al espacio.'] },
    { id: 'corner_favor', grupo: 'parada', nombre: 'Córner a favor', idea: 'Tres atacando el área en carrera, uno al rebote y dos cuidando la contra.',
      pelota: [0.985, 0.03], nos: [[0.24, 0.5], [0.44, 0.36], [0.46, 0.64], [0.82, 0.42], [0.86, 0.62], [0.97, 0.06], [0.9, 0.5]],
      rival: [[0.96, 0.5], [0.9, 0.4], [0.92, 0.6], [0.86, 0.52], [0.82, 0.66], [0.88, 0.2], [0.56, 0.5]],
      flechas: [[6, 0.94, 0.46], [4, 0.92, 0.56], [3, 0.8, 0.34]],
      tareas: ['Adelantá hasta tres cuartos de cancha: sos el último hombre.', 'Quedate con ventaja sobre el delantero rival.', 'Cuidá la contra con tu compañero: nunca menos de dos.', 'Puerta del área: rebote y pase atrás.', 'Atacá el segundo palo en carrera.', 'Sacás el córner: señal antes y centro al punto penal.', 'Atacá el primer palo y peinala.'] },
    { id: 'corner_contra', grupo: 'parada', nombre: 'Córner en contra', idea: 'Dos en los palos, zona en el área chica y uno arriba para salir.',
      pelota: [0.015, 0.97], nos: [[0.04, 0.5], [0.05, 0.4], [0.08, 0.6], [0.1, 0.46], [0.12, 0.72], [0.18, 0.52], [0.44, 0.5]],
      rival: [[0.76, 0.5], [0.5, 0.5], [0.12, 0.52], [0.1, 0.4], [0.14, 0.66], [0.02, 0.94], [0.08, 0.5]],
      flechas: [[5, 0.2, 0.46]],
      tareas: ['Salí a descolgar solo si es tuya: gritá "¡mía!".', 'Palo lejano: te quedás hasta que salga la pelota.', 'Palo cercano: atacá el primer balón.', 'Zona del área chica: despejá de cabeza hacia afuera.', 'Cerrá el corto: no dejes un córner en pared.', 'Rebote: la primera pelota que caiga afuera es tuya.', 'Quedate arriba como salida para el contragolpe.'] },
    { id: 'libre_favor', grupo: 'parada', nombre: 'Tiro libre a favor', idea: 'Rematás o pasás a la carrera; dos atacan el rebote.',
      pelota: [0.76, 0.6], nos: [[0.2, 0.5], [0.46, 0.4], [0.48, 0.62], [0.76, 0.6], [0.7, 0.4], [0.86, 0.2], [0.88, 0.5]],
      rival: [[0.95, 0.52], [0.86, 0.6], [0.86, 0.56], [0.86, 0.52], [0.88, 0.38], [0.84, 0.28], [0.6, 0.5]],
      flechas: [[6, 0.93, 0.5], [5, 0.92, 0.3]],
      tareas: ['Adelantá hasta tres cuartos.', 'Cuidá la contra: te quedás abajo.', 'Cuidá la contra con tu compañero.', 'Ejecutás: remate directo o al que pica.', 'Amago: pasás por encima o tocás corto.', 'Atacá el palo lejano para el rebote.', 'Atacá el rebote frente al arquero.'] },
    { id: 'libre_contra', grupo: 'parada', nombre: 'Tiro libre en contra', idea: 'Barrera de tres alineada por el arquero y marcas a los que atacan el rebote.',
      pelota: [0.24, 0.38], nos: [[0.05, 0.46], [0.14, 0.5], [0.14, 0.46], [0.14, 0.42], [0.12, 0.66], [0.16, 0.28], [0.4, 0.5]],
      rival: [[0.8, 0.5], [0.5, 0.5], [0.24, 0.38], [0.2, 0.55], [0.12, 0.6], [0.12, 0.3], [0.12, 0.46]],
      flechas: [],
      tareas: ['Alineá la barrera tapando tu palo y quedate del otro lado.', 'Barrera: el del palo, no te corras.', 'Barrera: al medio.', 'Barrera: salí al rebote apenas patean.', 'Marcá al que entra por el segundo palo.', 'Marcá al que entra por el primer palo.', 'Quedate arriba para la contra.'] },
    { id: 'lateral_favor', grupo: 'parada', nombre: 'Lateral a favor', idea: 'Dos opciones cortas y una larga: el que saca siempre tiene devolución.',
      pelota: [0.55, 0.02], nos: [[0.12, 0.5], [0.3, 0.3], [0.34, 0.66], [0.5, 0.18], [0.54, 0.4], [0.55, 0.03], [0.7, 0.24]],
      rival: [[0.93, 0.5], [0.7, 0.3], [0.72, 0.6], [0.54, 0.16], [0.6, 0.42], [0.44, 0.3], [0.4, 0.56]],
      flechas: [[3, 0.46, 0.12], [6, 0.74, 0.14]],
      tareas: ['Sumate como salida para cambiar de lado.', 'Apoyo atrás para reiniciar.', 'Cerrá atrás por si perdemos.', 'Bajá a recibir y devolvé de primera.', 'Sé el pase interior.', 'Sacá rápido y entrá: el primero libre.', 'Picá a la espalda por la banda.'] },
    { id: 'lateral_contra', grupo: 'parada', nombre: 'Lateral en contra', idea: 'Cerrá las opciones cortas; que nadie reciba de frente.',
      pelota: [0.45, 0.98], nos: [[0.1, 0.5], [0.28, 0.66], [0.32, 0.86], [0.4, 0.62], [0.46, 0.82], [0.54, 0.44], [0.58, 0.66]],
      rival: [[0.92, 0.5], [0.66, 0.4], [0.64, 0.7], [0.5, 0.84], [0.45, 0.97], [0.36, 0.76], [0.34, 0.58]],
      flechas: [[4, 0.47, 0.86]],
      tareas: ['Adelantá con la línea.', 'Cerrá al delantero por dentro.', 'Tomá al receptor del lado de la banda.', 'Tapá la devolución al medio.', 'Pegate al receptor corto: que no gire.', 'Cerrá el cambio de lado.', 'Tapá el pase atrás.'] }
  ];
  const POR_ID = {}; PIZARRAS.forEach(b => { POR_ID[b.id] = b; });

  /* Fase del equipo t según el motor: la misma lectura que usa el entrenador para decidir qué pizarra aplica. */
  function faseActual(t) {
    const ph = S.phase[t].name, rel = u.rel(t, S.ball.x), car = S.carrier >= 0 ? S.ps[S.carrier] : null;
    if (car && car.role === 'ARQ' && S.carryTime < 2.2) {
      return car.team === t ? { id: 'parada', sit: 'balon_parado', conPelota: true, pizarra: 'salida', nombre: 'Saque de arco' } : { id: 'parada', sit: 'balon_parado', conPelota: false, pizarra: 'saque_arco_contra', nombre: 'Saque de arco rival' };
    }
    if (ph === 'RECUPERACION') return { id: 'trans_of', sit: 'trans_of', conPelota: true, pizarra: 'trans_of', nombre: 'Transición ofensiva' };
    if (ph === 'PERDIDA') {
      const cp = !!S.phase[t].cp;
      return { id: 'trans_def', sit: 'trans_def', conPelota: false, cp, pizarra: cp ? 'contrapresion' : 'repliegue', nombre: cp ? 'Contrapresión' : 'Repliegue' };
    }
    if (ph === 'ATAQUE') {
      const pz = rel < 0.34 ? 'salida' : rel < 0.67 ? 'creacion' : 'finalizacion';
      return { id: 'ataque', sit: 'pos_ataque', conPelota: true, pizarra: pz, nombre: POR_ID[pz].nombre };
    }
    const pz = rel >= 0.67 ? 'presion_alta' : rel >= 0.34 ? 'bloque_medio' : 'bloque_bajo';
    return { id: 'defensa', sit: 'pos_defensa', conPelota: false, pizarra: pz, nombre: POR_ID[pz].nombre };
  }

  /* Ediciones del entrenador: solo se guardan las pizarras que tocó.
   *   ed: posiciones de tus 7 · rv: posiciones de los 7 rivales · fl: flechas [posición, x destino, y destino], una por jugador como máximo */
  const clon = a => JSON.parse(JSON.stringify(a));
  const pt = (x, y) => [+u.clamp(x, 0.01, 0.99).toFixed(3), +u.clamp(y, 0.01, 0.99).toFixed(3)];
  function crear(guardado) {
    const g0 = guardado && guardado.v === 1 ? guardado : {}, ed = g0.ed || {}, rv = g0.rv || {}, fl = g0.fl || {};
    const nos = id => ed[id] || POR_ID[id].nos, rival = id => rv[id] || POR_ID[id].rival, flechas = id => fl[id] || POR_ID[id].flechas;
    const own = (store, id, base) => { if (!store[id]) store[id] = clon(base); return store[id]; };
    const hay = (id, i) => flechas(id).findIndex(f => f[0] === i);
    return {
      nos, rival, flechas,
      punto(id, i) { const q = nos(id)[i]; return { x: q[0], y: q[1] }; },
      tarea: (id, i) => POR_ID[id].tareas[i],
      mover(id, i, x, y) { own(ed, id, POR_ID[id].nos)[i] = pt(x, y); },
      moverRival(id, i, x, y) { own(rv, id, POR_ID[id].rival)[i] = pt(x, y); },
      flechaDe: hay,
      moverFlecha(id, k, x, y) { const f = own(fl, id, POR_ID[id].flechas); if (f[k]) { const q = pt(x, y); f[k][1] = q[0]; f[k][2] = q[1]; } },
      agregarFlecha(id, i) { // sale hacia el arco rival, un poco más corta que un pase; se ajusta arrastrando la punta
        if (hay(id, i) >= 0) return false;
        const q = nos(id)[i], d = pt(q[0] + 0.1, q[1]); own(fl, id, POR_ID[id].flechas).push([i, d[0], d[1]]); return true;
      },
      quitarFlecha(id, i) { const k = hay(id, i); if (k < 0) return false; own(fl, id, POR_ID[id].flechas).splice(k, 1); return true; },
      restablecer(id) { delete ed[id]; delete rv[id]; delete fl[id]; },
      editada: id => !!(ed[id] || rv[id] || fl[id]),
      reemplazar(j) { // importar: lo que trae el archivo pisa todo lo editado
        [ed, rv, fl].forEach(o => Object.keys(o).forEach(k => { delete o[k]; }));
        Object.keys(j.ed || {}).forEach(id => { ed[id] = clon(j.ed[id]); }); Object.keys(j.rv || {}).forEach(id => { rv[id] = clon(j.rv[id]); }); Object.keys(j.fl || {}).forEach(id => { fl[id] = clon(j.fl[id]); });
      },
      exportar: () => ({ v: 1, ed: clon(ed), rv: clon(rv), fl: clon(fl) })
    };
  }
  function valida(j) { // para importar: que sea una ficha nuestra, con 7 puntos por pizarra conocida y flechas dentro de la cancha
    if (!j || j.v !== 1 || typeof j.ed !== 'object' || !j.ed) return false;
    const unit = v => Number.isFinite(v) && v >= 0 && v <= 1;
    const sevenPts = o => o == null || (typeof o === 'object' && Object.keys(o).every(id => POR_ID[id] && Array.isArray(o[id]) && o[id].length === 7 && o[id].every(q => Array.isArray(q) && q.length === 2 && q.every(unit))));
    const arrows = o => o == null || (typeof o === 'object' && Object.keys(o).every(id => POR_ID[id] && Array.isArray(o[id]) && o[id].length <= 14 && o[id].every(f => Array.isArray(f) && f.length === 3 && Number.isInteger(f[0]) && f[0] >= 0 && f[0] < 7 && unit(f[1]) && unit(f[2]))
      && new Set(o[id].map(f => f[0])).size === o[id].length));
    return sevenPts(j.ed) && sevenPts(j.rv) && arrows(j.fl);
  }

  F7.ficha = { GRUPOS, NOMBRES, PIZARRAS, POR_ID, faseActual, crear, valida };
})(typeof window !== 'undefined' ? window : globalThis);
