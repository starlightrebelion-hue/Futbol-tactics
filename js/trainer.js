/* trainer.js — lógica del entrenador de posiciones (sin DOM, probada en Node).
 * Usa el motor de la IA como "entrenador": congela el partido justo antes de que el poseedor decida y pregunta:
 *   1) PREDICCIÓN: ¿qué va a hacer el poseedor / a quién le pasa? La "respuesta correcta" es una PROBABILIDAD:
 *      se repite la decisión de la IA 400 veces con ese mismo estado y se cuenta (F7.tactics.decideProbs).
 *   2) UBICACIÓN: ¿dónde tiene que estar tu posición fija? La ubicación ideal es la que elige la IA para ese jugador.
 * Después se juega la jugada con tu jugador en el punto elegido y se marcan los errores.
 * Todas las coordenadas son del motor: x = largo (azul ataca hacia x=1), y = ancho.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state, DT = 1 / 60;

  const POS = [
    { i: 0, name: 'Arquero', short: 'ARQ' }, { i: 1, name: 'Defensa izq', short: 'DEF' }, { i: 2, name: 'Defensa der', short: 'DEF' },
    { i: 3, name: 'Medio izq', short: 'MED' }, { i: 4, name: 'Medio der', short: 'MED' }, { i: 5, name: 'Extremo', short: 'EXT' }, { i: 6, name: 'Delantero', short: 'DEL' }
  ];
  const TIPS = {
    attack: {
      ARQ: 'Ofrecé la salida corta y quedate cerca del arco, listo para el pase atrás.',
      DEF: 'Dá salida segura y quedate DETRÁS de la pelota: si la perdemos, sos el último cierre.',
      MED: 'Ofrecé una línea de pase libre, a media distancia, sin pisar el espacio de un compañero.',
      EXT: 'Abrite a la banda y dá amplitud: estirás la defensa y dejás el centro libre.',
      DEL: 'Buscá la espalda de la defensa, POR DELANTE de la pelota, y cerca del área.'
    },
    defense: {
      ARQ: 'Ubicate entre la pelota y el centro del arco; salí solo si la pelota es tuya.',
      DEF: 'Mantené la línea, cubrí el camino al arco y no dejes espaldas.',
      MED: 'Cerrá líneas de pase y marcá al rival más peligroso; quedá del lado del arco.',
      EXT: 'Cerrá la salida de tu banda y volvé detrás de la pelota si te superan.',
      DEL: 'Presioná o cerrá la salida; si te superan, repleguate detrás de la pelota.'
    }
  };
  const ERR_TEXT = {
    LINEA_TAPADA: 'Un rival tapa la línea de pase hasta ese punto: no te pueden encontrar.',
    MARCADO: 'Quedás pegado a un rival: sin espacio para recibir.',
    MUY_CERCA: 'Muy cerca del poseedor: le quitás espacio y no abrís línea.',
    MUY_LEJOS: 'Muy lejos del poseedor: no sos opción de pase.',
    AMONTONADO: 'Te amontonás con un compañero: ocupen espacios distintos.',
    ADELANTADO: 'Un defensor no se adelanta a la pelota: dejás la espalda libre.',
    SIN_AMPLITUD: 'Extremo: te faltó abrirte a la banda.',
    SIN_PROFUNDIDAD: 'Delantero: tenés que estar por delante de la pelota, buscando la espalda.',
    SIN_COBERTURA: 'Quedaste por delante de la pelota: no cubrís el camino al arco.',
    NO_PRESIONA: 'Te tocaba presionar al poseedor y quedaste lejos.',
    SIN_MARCA: 'Dejaste libre al rival que te tocaba marcar.',
    ARCO_DESCUBIERTO: 'El arquero tiene que quedar entre la pelota y el arco.',
    DEVOLUCION_TAPADA: 'Tu compañero no tendría línea para devolverte la pelota ahí: hay un rival en medio.',
    RUN_MARCADO: 'Te vas a un lugar pegado a un rival: recibirías sin espacio.',
    RUN_ATRAS: 'Después de pasar te quedás o volvés atrás: una pared termina con vos por delante de la pelota.',
    PARED_LEJOS: 'Demasiado lejos para una pared: la devolución tiene que ser corta.',
    NO_HABIA_PARED: 'Con ese compañero no había pared posible (línea tapada, muy lejos o rival encima): convenía otro pase.',
    LEJOS_DEL_IDEAL: 'Estás lejos del lugar que pedía la jugada.'
  };

  const label = p => '#' + (p.i + 1) + ' ' + POS[p.i].name;
  // distancia "como se ve en pantalla": el largo del campo se dibuja 1.5 veces más largo que el ancho
  const metric = (a, b) => Math.hypot((a.x - b.x) * 1.5, a.y - b.y) / 1.5;
  const GRADES = [[0.09, 'Perfecto'], [0.17, 'Bien'], [0.27, 'Mejorable'], [9, 'Error']];
  const grade = d => GRADES.find(x => d <= x[0])[1];

  /* ---------- Armado de una jugada ---------- */
  // Reproduce el partido con una semilla hasta el instante justo antes de que decida el poseedor.
  // me: índice (0..6) de la posición fija del usuario. want: 0 = ataca el equipo del usuario, 1 = ataca el rival.
  // self: true = el usuario es el poseedor ("¿qué hacés con la pelota?").
  // Busca primero jugadas con una progresión desde el ARCO (saque de arco / salida del arquero) y con opciones repartidas
  // (la más probable ≤ 80%, así hay algo que aprender); si no hay, relaja los requisitos de a poco.
  // Mientras simula va grabando la "cadena de posesión" del equipo (cuadros a 15 por segundo) para poder mostrarla antes de preguntar.
  const REC_EVERY = 4; // 1 cuadro grabado cada 4 pasos de 1/60 s
  function frame() { const f = []; S.ps.forEach(p => { f.push(+p.x.toFixed(4), +p.y.toFixed(4)); }); f.push(+S.ball.x.toFixed(4), +S.ball.y.toFixed(4)); return f; }
  function track(ch) { // llamar después de cada update
    const goals = S.stats.goals[0] + S.stats.goals[1];
    if (goals !== ch.goals) { ch.goals = goals; ch.team = -1; ch.frames = []; }
    if (S.owner >= 0 && S.owner !== ch.team) { ch.team = S.owner; ch.frames = []; ch.n = 0; ch.t0 = S.seconds; ch.keeper = S.ps[S.carrier].role === 'ARQ'; }
    if (ch.team >= 0) { if (ch.n % REC_EVERY === 0) ch.frames.push(frame()); ch.n++; }
  }
  function newPlay(me, seed, want, self) {
    // Niveles de exigencia: la jugada arranca con SAQUE DE ARCO del equipo (attempt < 8) y se juega hasta que decide un poseedor;
    // si no sale una buena, se prueba arrancando desde una posesión al azar (attempt >= 8).
    const LEVELS = [{ prob: true, min: 2.5, wall: true }, { prob: true, min: 2.5, wall: true }, { prob: false, min: 2, wall: true }, { prob: false, min: 2 }, { prob: false, min: 2 }, { prob: false, min: 1.2 }, { prob: false, min: 0.6 }, { prob: false, min: 0 }];
    for (let attempt = 0; attempt < 14; attempt++) {
      const goalKick = attempt < 8, lv = goalKick ? LEVELS[attempt] : { prob: attempt < 11, min: 0 }, sd = (seed + attempt * 7919) >>> 0;
      F7.match.init({ seed: sd }); F7.hooks.say = function () {}; S.hold = null;
      const ch = { team: -1, frames: [], n: 0, t0: 0, keeper: false, goals: 0 };
      if (goalKick) { // saque de arco: el arquero del equipo que ataca tiene la pelota
        const kp = S.team[want][0]; S.ball.x = kp.x; S.ball.y = kp.y; F7.ball.gain(kp.k); track(ch);
      } else for (let i = 0, n = Math.round((4 + S.rnd() * 8) / DT); i < n; i++) { F7.match.update(DT); track(ch); }
      for (let t = 0; t < (goalKick ? 18 : 25); t += DT) {
        F7.match.update(DT); track(ch);
        if (S.owner !== want || S.passFlight || S.carrier < 0 || S.carryTime < 0.3) continue;
        if (!(S.cd[want] > 0 && S.cd[want] <= 1.5 * DT)) continue; // la próxima actualización es la decisión
        if ((S.carrier === me && want === 0) !== !!self) continue;
        if (!self && S.carrier === me) continue;
        const dur = S.seconds - ch.t0;
        if (ch.team !== want || dur > 14 || dur < lv.min || (goalKick && !ch.keeper)) continue; // la cadena debe seguir siendo la del saque de arco (sin pérdidas en el medio)
        if (lv.prob) { // filtro barato (60 decisiones); la probabilidad definitiva se calcula con 400
          const q = F7.tactics.decideProbs(S.carrier, 60);
          if (Math.max.apply(null, Object.keys(q).map(k => q[k])) > 0.8) continue;
        }
        const pl = build(me, sd, want, !!self); if (self && lv.wall && !pl.noRun && !pl.walls.length) continue; // quien tiene la pelota practica sobre jugadas donde hay una pared posible
        pl.args = { me, seed, want, self: !!self };
        const frames = ch.frames.slice(); frames.push(frame()); // último cuadro = el instante congelado
        pl.replay = { frames, dt: REC_EVERY * DT, keeper: ch.keeper, dur, origin: ch.keeper ? 'Saque de arco' : 'Recuperación de la pelota' };
        return pl;
      }
    }
    return null;
  }
  function build(me, seed, want, self) {
    const mep = S.ps[me], car = S.ps[S.carrier], probs = F7.tactics.decideProbs(S.carrier, 400);
    const best = Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0];
    const options = F7.tactics.options(want, S.carrier).map(o => 'pass:' + o.k);
    ['shoot', 'dribble', 'shield', 'clear'].forEach(k => options.push(k));
    const runs = {}, walls = [];
    if (self && mep.role !== 'ARQ') {
      const geo = []; options.forEach(k => { if (k.indexOf('pass:') !== 0) return; const r = wallSpot(S.carrier, +k.slice(5)); runs[+k.slice(5)] = r; if (r.geo) geo.push(+k.slice(5)); });
      geo.sort((a, b) => runs[b].score - runs[a].score).slice(0, 3).forEach(qk => { // se prueban de verdad (3 simulaciones c/u)
        const r = runs[qk]; r.prob = wallProb({ me, team: want, carrier: S.carrier, self: true }, qk, r.spot, 3); r.viable = r.prob >= 0.5; if (r.viable) walls.push({ k: qk, spot: r.spot, prob: r.prob });
      });
      walls.sort((a, b) => b.prob - a.prob);
    } else if (self) options.forEach(k => { if (k.indexOf('pass:') === 0) runs[+k.slice(5)] = wallSpot(S.carrier, +k.slice(5)); });
    return {
      runs, walls, noRun: self && mep.role === 'ARQ',
      seed, me, want, self, attack: want === 0, snap: S.ps.map(p => ({ x: p.x, y: p.y, team: p.team, i: p.i, role: p.role })), snapBall: { x: S.ball.x, y: S.ball.y },
       carrier: S.carrier, team: want, probs, best, options,
      ideal: { x: mep.tx, y: mep.ty, intent: mep.intent }, role: mep.role, ball: { x: S.ball.x, y: S.ball.y }, tip: TIPS[want === 0 ? 'attack' : 'defense'][mep.role]
    };
  }
  function describe(play) {
    const car = S.ps[play.carrier], side = play.attack ? 'Tu equipo (azul) ataca' : 'Ataca el rival (rojo)';
    return play.self ? 'Tenés la pelota. ¿Qué hacés?' : side + ': la tiene el ' + label(car) + '.';
  }
  function keyLabel(key) {
    if (key.indexOf('pass:') === 0) return 'Pase al ' + label(S.ps[+key.slice(5)]);
    return { shoot: 'Remate al arco', dribble: 'Conduce', shield: 'Protege la pelota', clear: 'Despeje largo' }[key] || key;
  }

  /* ---------- Paredes y "a dónde ir" (cuando el usuario tiene la pelota) ---------- */
  // Pared (pase-devolución): le pasás a qk, te movés a un espacio libre por delante y él te la devuelve.
  // Elige el mejor punto de carrera entre 6 candidatos: libre de rivales, con línea de devolución abierta y hacia adelante.
  function wallSpot(k, qk) {
    const p = S.ps[k], q = S.ps[qk], team = p.team, dir = u.dir(team), mk = F7.tactics.nearestOpp(p, team).q, side = mk ? (mk.y < p.y ? 1 : -1) : (p.y < 0.5 ? 1 : -1);
    let best = null;
    [[0.12, 0], [0.14, 0.10 * side], [0.14, -0.10 * side], [0.10, 0.16 * side], [0.18, 0], [0.08, 0.2 * side]].forEach(o => {
      const sp = { x: u.clamp(p.x + dir * o[0], 0.04, 0.96), y: u.clamp(p.y + o[1], 0.06, 0.94) };
      const free = F7.tactics.nearestOpp(sp, team).d, ret = F7.tactics.laneClear(q, sp, team), out = F7.tactics.laneClear(p, q, team);
      const ed = Math.min(sp.y, 1 - sp.y, sp.x, 1 - sp.x); // las paredes no se hacen contra la raya
      const score = Math.min(free, 0.2) * 4 + Math.min(ret, 0.12) * 8 + Math.min(out, 0.12) * 5 + o[0] * 2 - (ed < 0.12 ? (0.12 - ed) * 25 : 0);
      if (!best || score > best.score) best = { spot: sp, free, ret, out, score };
    });
    // geo = filtro geométrico barato (primer pase de bajo riesgo, compañero libre, línea de devolución, destino libre, lejos de la raya).
    // Que la pared SALGA se mide simulándola (wallProb): ahí se decide si es "posible".
    const d = u.d(p, q), o = F7.tactics.options(team, k).find(x => x.k === qk); best.risk = o ? o.risk : 1; best.qfree = o ? o.free : 0;
    best.geo = q.i > 0 && !!o && o.risk < 0.6 && o.free > 0.05 && best.ret >= 0.04 && best.free >= 0.06 && d >= 0.07 && d <= 0.36 && Math.min(best.spot.y, 1 - best.spot.y) >= 0.07;
    best.viable = false; best.prob = null;
    return best;
  }
  // Simula la pared n veces (la 1.ª con el mismo azar que verá el usuario, las demás con otro) y devuelve la fracción en que el compañero devuelve y vos recibís.
  function wallProb(tmp, qk, spot, n) {
    const snap = F7.match.snapshot(); let ok = 0;
    for (let i = 0; i < n; i++) {
      F7.match.restore(snap); if (i > 0) S.rnd.set((snap.rngState + i * 2654435761) >>> 0);
      const run = startRun(tmp, spot, { type: 'pass', to: qk }); let g = 0; while (!step(run, 0.1) && g++ < 200) { /* avanza */ }
      if (run.wall && run.wall.received) ok++; finishRun(run);
    }
    F7.match.restore(snap); return ok / n;
  }
  function scoreRun(play, toK, spot, hintUsed) { // "¿a dónde vas después de pasar?"
    const r = play.runs[toK], p = S.ps[play.carrier], q = S.ps[toK], team = p.team, ideal = { x: r.spot.x, y: r.spot.y, intent: 'wall' }, d = metric(spot, ideal), errs = [];
    if (d > 0.09) {
      if ((spot.x - p.x) * u.dir(team) < 0.03) errs.push('RUN_ATRAS');                  // (de más a menos importante)
      if (u.d(p, spot) > 0.30) errs.push('PARED_LEJOS');
      if (F7.tactics.laneClear(q, spot, team) < 0.05) errs.push('DEVOLUCION_TAPADA');
      if (F7.tactics.nearestOpp(spot, team).d < 0.07) errs.push('RUN_MARCADO');
      if (!errs.length) errs.push('LEJOS_DEL_IDEAL');
    }
    if (!r.viable) errs.push('NO_HABIA_PARED');
    let points = Math.round(100 * u.clamp(1 - (d - 0.04) / 0.30, 0, 1)); if (hintUsed) points = Math.round(points * 0.8);
    return { dist: d, grade: grade(d), points, errors: errs.slice(0, 4), texts: errs.slice(0, 4).map(c => ERR_TEXT[c]), ideal, spot, wall: r, isRun: true };
  }

  /* ---------- 1) Predicción ---------- */
  function scorePredict(play, key) {
    const p = play.probs[key] || 0, pmax = play.probs[play.best];
    return { key, p, pmax, best: play.best, points: pmax > 0 ? Math.round(100 * p / pmax) : 0 };
  }

  /* ---------- 2) Ubicación ---------- */
  function diagnose(play, spot) {
    const me = S.ps[play.me], role = me.role, ideal = play.ideal, errs = [], add = c => { if (!errs.includes(c)) errs.push(c); };
    if (metric(spot, ideal) <= 0.09) return errs;
    const car = S.ps[play.carrier], rb = u.rel(0, car.x), rs = u.rel(0, spot.x);
    if (play.attack) {
      const prof = F7.roles.profile(role), dc = u.d(car, spot);
      if (F7.tactics.laneClear(car, spot, 0) < 0.06) add('LINEA_TAPADA');
      if (F7.tactics.nearestOpp(spot, 0).d < 0.07) add('MARCADO');
      if (dc < 0.09) add('MUY_CERCA'); else if (dc > prof.band[1] + 0.12) add('MUY_LEJOS');
      if (S.team[0].some(q => q.k !== me.k && q.k !== car.k && Math.hypot(spot.x - q.tx, spot.y - q.ty) < 0.09)) add('AMONTONADO');
      if (role === 'DEF' && rs > rb + 0.04) add('ADELANTADO');
      if (role === 'EXT' && Math.abs(spot.y - 0.5) < 0.25) add('SIN_AMPLITUD');
      if (role === 'DEL' && rs < rb) add('SIN_PROFUNDIDAD');
    } else {
      if (role === 'ARQ') { if (Math.abs(spot.y - 0.5) > 0.2 || rs > 0.2) add('ARCO_DESCUBIERTO'); }
      else if ((role === 'DEF' || role === 'MED') && rb < 0.6 && rs > rb + 0.02) add('SIN_COBERTURA');
      if (ideal.intent === 'press' && metric(spot, car) > 0.15) add('NO_PRESIONA');
      if (ideal.intent === 'mark') { const opp = S.team[1].reduce((b, q) => (u.d(q, ideal) < u.d(b, ideal) ? q : b)); if (u.d(spot, opp) > 0.14) add('SIN_MARCA'); }
      if (ideal.intent === 'cover' && metric(spot, ideal) > 0.16) add('SIN_COBERTURA');
    }
    if (!errs.length) add('LEJOS_DEL_IDEAL');
    return errs.slice(0, 3);
  }
  function scorePosition(play, spot, hintUsed) {
    const d = metric(spot, play.ideal);
    let points = Math.round(100 * u.clamp(1 - (d - 0.04) / 0.30, 0, 1));
    if (hintUsed) points = Math.round(points * 0.8);
    const errors = diagnose(play, spot);
    return { dist: d, grade: grade(d), points, errors, texts: errors.map(c => ERR_TEXT[c]), ideal: play.ideal, spot };
  }

  /* ---------- 3) Jugar la jugada ---------- */
  // action (solo si el usuario es el poseedor): lo que eligió hacer → { type:'pass', to:k } | { type:'shoot'|'dribble'|'shield'|'clear' }
  function startRun(play, spot, action) {
    S.selected = play.me; const t = play.team;
    const run = { play, t: 0, acc: 0, outcome: null, at: 0, done: false, base: { seq: S.decisionSeq }, wall: null };
    S.hold = (spot && !play.self) ? { k: play.me, x: spot.x, y: spot.y } : null;
    if (play.self && action) { // se ejecuta lo que eligió el usuario (la IA no decide por él)
      const k = play.carrier; S.opts.carrierHold = true; run.at = 0;
      if (action.type === 'pass') {
        F7.ball.launchPass(k, action.to, { message: '' }); run.outcome = { type: 'pass', key: 'pass:' + action.to, toK: action.to, fromK: k };
        if (spot) { S.hold = { k: play.me, x: spot.x, y: spot.y }; run.wall = { to: action.to, fired: false, t0: null, cancelled: false, received: false }; }
      } else if (action.type === 'shoot') { F7.ball.shoot(k, {}); run.outcome = { type: 'shoot', key: 'shoot' }; }
      else if (action.type === 'clear') { F7.ball.clear(k, {}); run.outcome = { type: 'clear', key: 'clear' }; }
      else if (action.type === 'dribble') { const d = F7.tactics.dribbleChoice(k); S.carrierIntent = { type: 'dribble', tx: d.tx, ty: d.ty, until: S.seconds + 1.6 }; run.outcome = { type: 'dribble', key: 'dribble' }; }
      else { S.carrierIntent = { type: 'shield' }; run.outcome = { type: 'shield', key: 'shield' }; }
    }
    return run;
  }
  function oneStep(run) {
    const play = run.play, t = play.team;
    F7.match.update(DT); run.t += DT;
    if (!run.outcome) {
      let o = null;
      if (S.decisionSeq > run.base.seq && S.lastDecision && S.lastDecision.k === play.carrier) { // primera decisión nueva del poseedor
        const d = S.lastDecision; o = d.type === 'pass' ? { type: 'pass', key: 'pass:' + d.to, toK: d.to, fromK: d.k } : { type: d.type, key: d.type };
      } else if (S.owner !== t || S.carrier !== play.carrier) o = { type: 'lost', key: null };
      if (o) { run.outcome = o; run.at = run.t; }
    } else {
      const since = run.t - run.at, w = run.wall;
      if (w && !w.cancelled) { // pared: cuando el compañero recibe, a los 0.25 s te devuelve la pelota
        if (!w.fired) {
          if (S.owner === t && S.carrier === w.to) { if (w.t0 === null) w.t0 = run.t; if (run.t - w.t0 >= 0.25) { F7.ball.launchPass(w.to, play.me, { through: true, message: '' }); w.fired = true; } }
          else if (S.owner === 1 - t || run.t > 3.2) w.cancelled = true; // el primer pase se cortó
        } else if (!S.passFlight && !w.over) { w.received = S.owner === t && S.carrier === play.me; w.fired = true; w.cancelled = !w.received; w.over = true; }
      }
      const wallBusy = w && !w.cancelled && !w.over;
      if (run.outcome.type === 'pass') { if (!wallBusy && ((S.owner >= 0 && !S.passFlight && since > 1.0) || since > 2.6)) run.done = true; }
      else if (since > 1.6) run.done = true;
      if (run.done && run.t < 2.2) run.done = false; // que se alcance a ver cómo se mueve tu jugador
    }
    if (run.t > 7) run.done = true;
  }
  // Avanza la jugada dt segundos reales (pasos fijos de 1/60 s: determinista).
  function step(run, dt) { run.acc += dt; while (run.acc >= DT && !run.done) { oneStep(run); run.acc -= DT; } return run.done; }
  function finishRun(run) {
    S.hold = null; S.opts.carrierHold = false; const play = run.play, o = run.outcome || { type: 'none', key: null }, res = { outcome: o, text: '' };
    if (o.type === 'pass') {
      res.completed = (S.owner === play.team && S.carrier === o.toK) || !!(run.wall && run.wall.fired); res.intercepted = S.owner === 1 - play.team;
      res.toMe = o.toK === play.me; res.to = label(S.ps[o.toK]);
      res.text = 'Salió pase al ' + res.to + (res.completed ? ': llegó.' : res.intercepted ? ': lo interceptaron.' : ': quedó dividida.');
      if (run.wall) { const w = run.wall; res.wall = { fired: w.fired, received: w.received, cancelled: w.cancelled };
        res.text += w.received ? ' 🔁 Pared completa: te devolvió la pelota y la recibís en espacio.' : w.fired ? ' 🔁 La devolución no llegó: se cortó.' : ' 🔁 La pared no se pudo hacer.'; }
    } else if (o.type === 'lost') res.text = 'El poseedor perdió la pelota antes de decidir.';
    else res.text = { shoot: 'Remató al arco.', dribble: 'Siguió conduciendo.', shield: 'Protegió la pelota.', clear: 'Despejó largo.', none: 'La jugada quedó abierta.' }[o.type];
    return res;
  }

  /* ---------- Progreso (el almacenamiento real lo hace la interfaz) ---------- */
  function emptyStore() { return { v: 1, byPos: {} }; }
  function record(store, me, r) {
    const b = store.byPos[me] || (store.byPos[me] = { plays: 0, predN: 0, predPts: 0, posN: 0, posPts: 0, errs: {} });
    b.plays++;
    if (r.pred) { b.predN++; b.predPts += r.pred.points; }
    if (r.pos) { b.posN++; b.posPts += r.pos.points; r.pos.errors.forEach(c => { b.errs[c] = (b.errs[c] || 0) + 1; }); }
    return store;
  }

  F7.trainer = { POS, TIPS, ERR_TEXT, DT, label, metric, grade, newPlay, describe, keyLabel, scorePredict, scorePosition, diagnose, startRun, step, finishRun, emptyStore, record, wallSpot, wallProb, scoreRun };
})(typeof window !== 'undefined' ? window : globalThis);
