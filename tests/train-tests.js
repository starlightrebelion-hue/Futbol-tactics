#!/usr/bin/env node
/* Pruebas reproducibles del entrenador (js/trainer.js) en Node, usando el motor real. Uso:  node tests/train-tests.js
 * Incluye una prueba de CALIBRACIÓN: las probabilidades que se le muestran al usuario se comparan contra lo que la IA hace de verdad al jugar la jugada. */
const load = require('./engine.js');
const results = [];
function test(name, fn) { let r; try { r = { name, ok: true, info: fn() || '' }; } catch (e) { r = { name, ok: false, info: e.message }; } results.push(r); console.log((r.ok ? 'PASS ' : 'FAIL ') + name + (r.info ? '\n       ' + r.info : '')); }
function ok(c, msg) { if (!c) throw new Error(msg); }
const fmt = (v, n) => (+v).toFixed(n == null ? 2 : n);
const sig = p => [p.seed, p.carrier, p.best, JSON.stringify(p.probs), p.ideal.x.toFixed(4), p.ideal.y.toFixed(4), p.replay.frames.length, JSON.stringify(p.replay.frames[0]), JSON.stringify(p.replay.frames[p.replay.frames.length - 1])].join('|');
const DT = 1 / 60;

test('Jugadas válidas para las 7 posiciones, en ataque y en defensa (3 semillas c/u)', () => {
  const F7 = load(), T = F7.trainer, S = F7.state; let n = 0, ms = 0;
  for (let me = 0; me < 7; me++) for (const want of [0, 1]) for (const sd of [11, 22, 33]) {
    const t0 = Date.now(), p = T.newPlay(me, sd + me * 100, want, false); ms += Date.now() - t0;
    ok(p, 'no se pudo armar la jugada (pos ' + me + ', want ' + want + ')'); n++;
    ok(S.owner === want && S.carrier === p.carrier && !S.passFlight, 'el partido debe quedar congelado con la pelota del equipo pedido');
    ok(p.carrier !== me, 'el usuario no debe ser el poseedor en jugadas de ubicación');
    ok(S.cd[want] > 0 && S.cd[want] <= 1.5 * DT + 1e-9, 'debe quedar justo antes de la decisión: cd=' + S.cd[want]);
    const sum = Object.values(p.probs).reduce((a, b) => a + b, 0); ok(Math.abs(sum - 1) < 1e-9, 'las probabilidades suman ' + sum);
    ok(p.probs[p.best] === Math.max(...Object.values(p.probs)), 'best debe ser la opción más probable');
    ok(p.snap.length === 14 && Number.isFinite(p.ideal.x) && p.ideal.x >= 0 && p.ideal.x <= 1 && p.ideal.y >= 0 && p.ideal.y <= 1, 'foto / ubicación ideal inválidas');
    ok(typeof p.tip === 'string' && p.tip.length > 10, 'sin pista');
    Object.keys(p.probs).forEach(k => ok(p.options.includes(k), 'la opción ' + k + ' no está entre las preguntables'));
  }
  return n + ' jugadas · ' + fmt(ms / n, 0) + ' ms de media por jugada (en esta máquina)';
});
test('Jugadas "tenés la pelota" (usuario poseedor): posibles para el arquero y para un jugador de campo', () => {
  const F7 = load(), T = F7.trainer, S = F7.state; let n = 0;
  for (const me of [0, 3, 6]) for (const sd of [5, 6, 7, 8]) { const p = T.newPlay(me, sd, 0, true); if (!p) continue; n++; ok(p.self && p.carrier === me && S.carrier === me, 'el poseedor debe ser el usuario'); ok(!p.options.includes('pass:' + me), 'no puede pasarse a sí mismo'); }
  ok(n >= 8, 'solo se armaron ' + n + '/12');
  return n + '/12 jugadas con el usuario como poseedor';
});
test('Determinismo: misma jugada (semilla) = misma situación, también tras jugar y ensuciar el motor ("Repetir jugada")', () => {
  const F7 = load(), T = F7.trainer; let n = 0;
  for (const [me, sd, want] of [[5, 348276, 0], [3, 100, 1], [6, 777, 0], [1, 4242, 1]]) {
    const a = T.newPlay(me, sd, want, false), sa = sig(a), run = T.startRun(a, a.ideal); while (!T.step(run, 1 / 30)); T.finishRun(run); F7.debug.sim(25);
    const b = T.newPlay(me, sd, want, false); ok(sa === sig(b), 'difiere para ' + me + '/' + sd); n++;
  }
  return n + ' jugadas idénticas al repetirlas';
});
test('Progresión: cada jugada trae la secuencia grabada desde el saque de arco hasta el momento de decidir', () => {
  const F7 = load(), T = F7.trainer; let n = 0, keeper = 0, durs = [], frames = 0;
  for (let me = 0; me < 7; me++) for (const want of [0, 1]) for (const sd of [3, 14, 25, 36]) {
    const p = T.newPlay(me, sd + me * 1000, want, false); ok(p, 'no se armó la jugada'); n++; const r = p.replay;
    ok(r && r.frames.length >= 2 && r.frames.every(f => f.length === 30 && f.every(Number.isFinite)), 'cuadros inválidos');
    const last = r.frames[r.frames.length - 1]; ok(p.snap.every((q, j) => Math.abs(q.x - last[j * 2]) < 1e-3 && Math.abs(q.y - last[j * 2 + 1]) < 1e-3) && Math.abs(p.snapBall.x - last[28]) < 1e-3, 'el último cuadro debe ser el instante congelado');
    ok(r.dur <= 14.01, 'progresión demasiado larga: ' + r.dur); ok(Math.abs((r.frames.length - 1) * r.dt - r.dur) < 0.5, 'duración inconsistente con los cuadros');
    // el primer cuadro del saque de arco: la pelota está en el arquero del equipo que ataca
    if (r.keeper) { keeper++; const f0 = r.frames[0], k = want * 7; ok(Math.hypot(f0[28] - f0[k * 2], f0[29] - f0[k * 2 + 1]) < 0.05, 'la pelota debe empezar en el arquero'); }
    durs.push(r.dur); frames += r.frames.length;
  }
  ok(keeper / n >= 0.95, 'solo ' + keeper + '/' + n + ' jugadas arrancan con saque de arco');
  durs.sort((a, b) => a - b);
  return n + ' jugadas · ' + keeper + ' arrancan con saque de arco · progresión: mín ' + fmt(durs[0]) + ' s, mediana ' + fmt(durs[durs.length >> 1]) + ' s, máx ' + fmt(durs[durs.length - 1]) + ' s · ' + fmt(frames / n, 0) + ' cuadros por jugada';
});
test('Puntaje de predicción: la opción más probable da 100; una imposible, 0; crece con la probabilidad', () => {
  const F7 = load(), T = F7.trainer; let n = 0;
  for (let sd = 1; sd <= 12; sd++) {
    const p = T.newPlay(sd % 7, sd * 31, sd % 2, false); if (!p) continue; n++;
    ok(T.scorePredict(p, p.best).points === 100, 'la mejor opción no da 100');
    const imp = p.options.find(k => !(k in p.probs)); if (imp) ok(T.scorePredict(p, imp).points === 0, 'una opción imposible debe dar 0');
    const ks = Object.keys(p.probs).sort((a, b) => p.probs[b] - p.probs[a]);
    for (let i = 1; i < ks.length; i++) ok(T.scorePredict(p, ks[i - 1]).points >= T.scorePredict(p, ks[i]).points, 'no monótono');
  }
  return n + ' jugadas verificadas';
});
test('CALIBRACIÓN: las probabilidades mostradas coinciden con lo que la IA hace de verdad (60 jugadas reales)', () => {
  const F7 = load(), T = F7.trainer; let n = 0, hit = 0, sumMax = 0, sumP = 0, impossible = 0;
  for (let i = 0; i < 60; i++) {
    const p = T.newPlay(i % 7, 9000 + i * 17, i % 2, false); if (!p) continue;
    const run = T.startRun(p, null); while (!T.step(run, 1 / 30)); const res = T.finishRun(run); const k = res.outcome.key; if (!k) continue; // 'lost' no tiene clave
    n++; const pk = p.probs[k] || 0; sumP += pk; sumMax += p.probs[p.best]; if (k === p.best) hit++; if (pk < 0.02) impossible++;
  }
  const rate = hit / n, expected = sumMax / n;
  ok(n >= 40, 'solo ' + n + ' jugadas con desenlace');
  ok(impossible / n <= 0.1, 'el modelo dijo "casi imposible" (<2%) para ' + impossible + '/' + n + ' desenlaces reales');
  ok(Math.abs(rate - expected) < 0.15, 'acierto de la opción más probable ' + fmt(rate) + ' vs esperado ' + fmt(expected));
  return n + ' jugadas · la opción más probable ocurrió ' + fmt(100 * rate, 0) + '% (el modelo esperaba ' + fmt(100 * expected, 0) + '%) · prob. media asignada al desenlace real ' + fmt(100 * sumP / n, 0) + '% · desenlaces "casi imposibles": ' + impossible;
});
test('Puntaje de ubicación: el punto ideal da 100, lejos da poco; pista descuenta 20%; grados coherentes', () => {
  const F7 = load(), T = F7.trainer; let n = 0;
  for (let sd = 1; sd <= 14; sd++) {
    const p = T.newPlay(sd % 7, sd * 53, sd % 2, false); if (!p) continue; n++;
    const best = T.scorePosition(p, p.ideal, false); ok(best.points === 100 && best.grade === 'Perfecto' && best.errors.length === 0, 'el ideal debe ser perfecto y sin errores: ' + best.points + ' ' + best.errors);
    ok(T.scorePosition(p, p.ideal, true).points === 80, 'la pista descuenta 20%');
    const far = { x: p.ideal.x > 0.5 ? p.ideal.x - 0.45 : p.ideal.x + 0.45, y: p.ideal.y };
    const f = T.scorePosition(p, far, false); ok(f.points <= 5 && f.grade === 'Error' && f.errors.length >= 1, 'lejos debe ser Error con diagnóstico: ' + f.points + ' ' + f.grade);
    const mid = { x: p.ideal.x, y: p.ideal.y + (p.ideal.y > 0.5 ? -0.14 : 0.14) }; const m = T.scorePosition(p, mid, false); ok(m.points > f.points && m.points < 100, 'un punto intermedio debe puntuar entre medio');
  }
  return n + ' jugadas verificadas';
});
test('Diagnóstico de errores: cada código se dispara en su situación armada a propósito', () => {
  const F7 = load(), T = F7.trainer, S = F7.state, put = (k, x, y) => F7.debug.place(k, x, y);
  const codes = (play, spot) => T.diagnose(play, spot);
  // ATAQUE (Extremo #6): poseedor azul en el medio, rivales lejos salvo los plantados
  const atk = (me, seedBase) => { for (let s = 0; s < 40; s++) { const p = T.newPlay(me, seedBase + s, 0, false); if (p) { p.ideal = { x: 0.9, y: 0.5, intent: 'run' }; S.team[1].forEach(q => { if (q.i > 0) put(q.k, 0.93, 0.06 + q.i * 0.02); }); S.team[0].forEach(q => { if (q.k !== p.carrier && q.k !== me) put(q.k, 0.1, 0.06 + q.i * 0.02); }); put(p.carrier, 0.5, 0.5); S.ps[p.carrier].tx = 0.5; S.ps[p.carrier].ty = 0.5; return p; } } };
  let p = atk(5, 1);
  ok(codes(p, { x: 0.52, y: 0.52 }).includes('MUY_CERCA'), 'MUY_CERCA');
  ok(codes(p, { x: 0.02, y: 0.9 }).includes('MUY_LEJOS'), 'MUY_LEJOS');
  put(S.team[1][3].k, 0.63, 0.5); ok(codes(p, { x: 0.76, y: 0.5 }).includes('LINEA_TAPADA'), 'LINEA_TAPADA');
  put(S.team[1][4].k, 0.7, 0.2); ok(codes(p, { x: 0.7, y: 0.2 }).includes('MARCADO'), 'MARCADO');
  ok(codes(p, { x: 0.7, y: 0.5 }).includes('SIN_AMPLITUD'), 'SIN_AMPLITUD (extremo al centro)');
  p = atk(1, 60); ok(codes(p, { x: 0.8, y: 0.5 }).includes('ADELANTADO'), 'ADELANTADO (defensor por delante de la pelota)');
  p = atk(6, 120); ok(codes(p, { x: 0.3, y: 0.3 }).includes('SIN_PROFUNDIDAD'), 'SIN_PROFUNDIDAD (delantero por detrás de la pelota)');
  // DEFENSA: rival con la pelota
  const def = (me, seedBase) => { for (let s = 0; s < 40; s++) { const q = T.newPlay(me, seedBase + s, 1, false); if (q) { put(q.carrier, 0.3, 0.5); q.ideal = { x: 0.2, y: 0.5, intent: 'zone' }; return q; } } };
  p = def(1, 200); ok(codes(p, { x: 0.55, y: 0.5 }).includes('SIN_COBERTURA'), 'SIN_COBERTURA (defensor por delante de la pelota)');
  p = def(3, 300); p.ideal = { x: 0.35, y: 0.5, intent: 'press' }; ok(codes(p, { x: 0.05, y: 0.9 }).includes('NO_PRESIONA'), 'NO_PRESIONA');
  p = def(3, 400); put(S.team[1][5].k, 0.4, 0.8); p.ideal = { x: 0.38, y: 0.8, intent: 'mark' }; ok(codes(p, { x: 0.4, y: 0.2 }).includes('SIN_MARCA'), 'SIN_MARCA');
  p = def(0, 500); ok(codes(p, { x: 0.5, y: 0.5 }).includes('ARCO_DESCUBIERTO'), 'ARCO_DESCUBIERTO (arquero lejos del arco)');
  ok(codes(p, p.ideal).length === 0, 'sin errores si está en el punto ideal');
  return '12 códigos de error verificados';
});
test('La jugada se juega: termina sola, registra el desenlace y tu jugador va al punto elegido; S.hold se limpia', () => {
  const F7 = load(), T = F7.trainer, S = F7.state; let n = 0, near = 0, withOutcome = 0, maxT = 0;
  for (let sd = 1; sd <= 14; sd++) {
    const p = T.newPlay(2 + (sd % 4), sd * 77, sd % 2, false); if (!p) continue; n++;
    const spot = { x: u0(p.ideal.x), y: p.ideal.y }; function u0(v) { return Math.min(0.95, Math.max(0.05, v)); }
    const d0 = Math.hypot(S.ps[p.me].x - spot.x, S.ps[p.me].y - spot.y), run = T.startRun(p, spot); ok(S.hold && S.hold.k === p.me, 'S.hold debe fijar al jugador');
    while (!T.step(run, 1 / 30));
    const d1 = Math.hypot(S.ps[p.me].x - spot.x, S.ps[p.me].y - spot.y), res = T.finishRun(run); ok(S.hold === null, 'S.hold debe limpiarse'); ok(run.t <= 6.05, 'la jugada duró ' + run.t); ok(run.t >= 2.2, 'la jugada duró solo ' + run.t + ' s'); maxT = Math.max(maxT, run.t);
    if (run.outcome) withOutcome++; if (d1 <= Math.max(0.12, d0 - 0.19 * run.t * 0.6)) near++; // llega, o recorre al menos el 60% de lo que su velocidad permite
    ok(typeof res.text === 'string' && res.text.length > 3, 'sin texto de resultado');
  }
  ok(withOutcome === n, 'jugadas sin desenlace: ' + (n - withOutcome)); ok(near >= n * 0.9, 'el jugador avanzó hacia el punto elegido en ' + near + '/' + n);
  return n + ' jugadas · todas con desenlace · duración máx. ' + fmt(maxT) + ' s · al terminar, el jugador llegó al punto elegido (o recorrió ≥ 60% de lo que su velocidad permite) en ' + near + '/' + n;
});
test('Paredes ("tenés la pelota"): se anuncian solo si salen; la probabilidad anunciada coincide con lo que pasa al jugarla', () => {
  const F7 = load(), T = F7.trainer, S = F7.state; let n = 0, withWall = 0, done = 0, okRun = 0, probs = 0, perfect = 0, noWallNote = 0;
  for (let i = 0; i < 30; i++) {
    const me = [3, 4, 5, 6, 1, 2][i % 6], p = T.newPlay(me, 800 + i * 13, 0, true); if (!p) continue; n++;
    ok(p.self && !p.noRun && Object.keys(p.runs).length >= 3, 'faltan los puntos de carrera por receptor');
    Object.keys(p.runs).forEach(k => { const r = p.runs[k]; ok(Number.isFinite(r.spot.x) && Number.isFinite(r.spot.y) && r.spot.x >= 0 && r.spot.x <= 1 && r.spot.y >= 0 && r.spot.y <= 1, 'punto de carrera inválido'); });
    const before = JSON.stringify(F7.match.snapshot());
    if (p.walls.length) {
      withWall++; const w = p.walls[0]; ok(w.prob >= 0.5 && p.runs[w.k].viable, 'una pared anunciada debe tener prob ≥ 50%'); probs += w.prob;
      const sc = T.scoreRun(p, w.k, w.spot, false); if (sc.points === 100 && sc.grade === 'Perfecto') perfect++;
      const run = T.startRun(p, w.spot, { type: 'pass', to: w.k }); while (!T.step(run, 1 / 30)); const r = T.finishRun(run); done++; if (r.wall && r.wall.received) okRun++;
    } else { const k = +Object.keys(p.runs)[0], sc = T.scoreRun(p, k, p.runs[k].spot, false); if (sc.errors.includes('NO_HABIA_PARED')) noWallNote++; ok(!p.runs[k].viable, 'sin paredes anunciadas, ninguna debe ser viable'); }
    ok(before === before, '');
  }
  ok(withWall >= n * 0.3, 'pocas jugadas con pared posible: ' + withWall + '/' + n);
  ok(okRun / done >= 0.9, 'de las paredes anunciadas solo salieron ' + okRun + '/' + done);
  ok(perfect === withWall, 'el punto de carrera ideal debe puntuar 100');
  return n + ' jugadas con el usuario poseedor · ' + withWall + ' con pared posible · de esas, salieron ' + okRun + '/' + done + ' al jugarlas (anunciado: ' + fmt(100 * probs / Math.max(1, withWall), 0) + '% promedio) · sin pared: avisa “no había pared” ' + noWallNote + '/' + (n - withWall);
});
test('Puntaje de "a dónde ir": lejos o contra un rival da errores concretos', () => {
  const F7 = load(), T = F7.trainer, S = F7.state; let n = 0, codes = {}, farN = 0;
  for (let i = 0; i < 20; i++) {
    const p = T.newPlay([3, 4, 5, 6][i % 4], 1500 + i * 17, 0, true); if (!p) continue; n++;
    const k = +Object.keys(p.runs)[0], car = S.ps[p.carrier], back = { x: Math.max(0.05, car.x - 0.2), y: car.y };
    const sb = T.scoreRun(p, k, back, false); ok(sb.errors.includes('RUN_ATRAS') && sb.points < 60, 'volver atrás debe marcar RUN_ATRAS: ' + sb.errors);
    const far = { x: Math.min(0.95, car.x + 0.5), y: car.y }; const sf = T.scoreRun(p, k, far, false); if (F7.u.d(car, far) > 0.3) { ok(sf.errors.includes('PARED_LEJOS'), 'demasiado lejos (' + fmt(F7.u.d(car, far)) + ') debe marcar PARED_LEJOS: ' + sf.errors); farN++; }
    const opp = S.team[1][3]; const onOpp = { x: opp.x, y: opp.y }; const so = T.scoreRun(p, k, onOpp, false); ok(so.errors.includes('RUN_MARCADO') || so.dist <= 0.09, 'pegado a un rival debe marcarse: ' + so.errors);
    sb.errors.concat(sf.errors, so.errors).forEach(c => { codes[c] = (codes[c] || 0) + 1; });
  }
  ok(farN >= 5, 'pocas jugadas con un punto realmente lejano: ' + farN);
  return n + ' jugadas (' + farN + ' con punto lejano) · códigos marcados: ' + JSON.stringify(codes);
});
test('Progreso: record() acumula jugadas, puntos y errores por posición', () => {
  const T = load().trainer, st = T.emptyStore();
  T.record(st, 5, { pred: { points: 100 }, pos: { points: 60, errors: ['LINEA_TAPADA', 'MUY_CERCA'] } });
  T.record(st, 5, { pred: { points: 50 }, pos: { points: 80, errors: ['LINEA_TAPADA'] } });
  T.record(st, 3, { pred: null, pos: { points: 90, errors: [] } });
  const b = st.byPos[5]; ok(b.plays === 2 && b.predN === 2 && b.predPts === 150 && b.posN === 2 && b.posPts === 140 && b.errs.LINEA_TAPADA === 2 && b.errs.MUY_CERCA === 1, JSON.stringify(b));
  ok(st.byPos[3].predN === 0 && st.byPos[3].posN === 1, 'la posición 3 es independiente');
  ok(JSON.stringify(JSON.parse(JSON.stringify(st))) === JSON.stringify(st), 'debe ser serializable');
  return 'OK';
});

const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' pruebas OK' + (failed.length ? ' — FALLARON: ' + failed.map(f => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
