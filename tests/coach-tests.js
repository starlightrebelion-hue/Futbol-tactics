#!/usr/bin/env node
/* Pruebas del entrenador en vivo, las pizarras, la cámara y la animación, en Node y con el motor real. Uso:  node tests/coach-tests.js */
const vm = require('vm'), fs = require('fs'), path = require('path');
const FILES = ['team-model', 'debug', 'match', 'ball', 'tactics', 'team-intelligence', 'roles', 'defense', 'ai', 'trainer', 'cam3d', 'ficha', 'puppet', 'coach', 'audio', 'perfil'];
function load() {
  const ctx = vm.createContext({ console, Math, Date });
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
  return ctx.F7;
}
const results = [];
function test(name, fn) { let r; try { r = { name, ok: true, info: fn() || '' }; } catch (e) { r = { name, ok: false, info: e.message }; } results.push(r); console.log((r.ok ? 'PASS ' : 'FAIL ') + name + '\n       ' + (r.info || 'OK')); }
function ok(c, msg) { if (!c) throw new Error(msg); }
const DT = 1 / 60;

// Juega el partido con el entrenador. onQ decide qué contestar; devuelve las tarjetas vistas.
function play(F7, c, secs, onQ) {
  const S = F7.state, seen = []; let acc = 0, t = 0, cur = null;
  while (S.seconds < secs && t < secs * 40) {
    const sdt = c.frame(DT); t += DT; acc += sdt;
    while (acc >= DT) { F7.match.update(DT); c.afterStep(); acc -= DT; }
    const q = c.q;
    if (q && q !== cur && c.panelAt === null) { cur = q; seen.push(q); onQ(q); }
    if (q && q.done && !q.resumeAt) c.resume();
  }
  return seen;
}
const right = c => q => c.answer(q.opts.find(o => o.ok));
const wrong = c => q => c.answer(q.opts.find(o => !o.ok) || q.opts[0]);

test('Pizarras: las 17 están completas y dentro de la cancha', () => {
  const F7 = load(), P = F7.ficha.PIZARRAS, ids = new Set();
  P.forEach(b => {
    ok(!ids.has(b.id), 'id repetido ' + b.id); ids.add(b.id);
    ok(F7.ficha.GRUPOS.some(x => x[0] === b.grupo), 'grupo desconocido en ' + b.id);
    ok(b.nos.length === 7 && b.rival.length === 7 && b.tareas.length === 7, b.id + ': faltan posiciones');
    b.nos.concat(b.rival, [b.pelota]).forEach(q => ok(q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 1, b.id + ': punto fuera'));
    b.tareas.forEach(t => ok(t.length > 8, b.id + ': tarea vacía'));
    b.flechas.forEach(f => ok(f[0] >= 0 && f[0] < 7 && f[1] >= 0 && f[1] <= 1 && f[2] >= 0 && f[2] <= 1, b.id + ': flecha inválida'));
  });
  ok(P.length === 17, 'son ' + P.length);
  F7.ficha.GRUPOS.forEach(gp => ok(P.some(b => b.grupo === gp[0]), 'grupo vacío ' + gp[0]));
  return P.length + ' pizarras en ' + F7.ficha.GRUPOS.length + ' grupos';
});

test('Pizarras: editar, restablecer, exportar e importar', () => {
  const F7 = load(), f = F7.ficha.crear(null);
  f.mover('salida', 3, 0.4, 0.3); ok(f.punto('salida', 3).x === 0.4 && f.editada('salida'), 'no se movió');
  ok(F7.ficha.PIZARRAS[0].nos[3][0] === 0.33, 'la edición no debe tocar la pizarra original');
  const j = JSON.parse(JSON.stringify(f.exportar())); ok(F7.ficha.valida(j), 'la exportación debe ser válida');
  ok(F7.ficha.crear(j).punto('salida', 3).x === 0.4, 'no se recuperó lo guardado');
  ok(!F7.ficha.valida({ v: 1, ed: { salida: [[0, 0]] } }) && !F7.ficha.valida({ v: 1, ed: { nada: [] } }) && !F7.ficha.valida(null), 'debe rechazar datos inválidos');
  f.restablecer('salida'); ok(f.punto('salida', 3).x === 0.33, 'no se restableció');
});

test('Pizarras: mover jugadores, rivales y flechas, agregar y quitar flechas, exportar e importar', () => {
  const F7 = load(), FI = F7.ficha, f = FI.crear(null), id = 'corner_favor', orig = JSON.stringify(FI.POR_ID[id]);
  const a0 = FI.POR_ID[id].flechas.map(x => x.slice()); ok(a0.length >= 2, 'la pizarra de prueba necesita flechas');
  f.moverFlecha(id, 0, 0.5, 0.25); ok(f.flechas(id)[0][1] === 0.5 && f.flechas(id)[0][2] === 0.25 && f.flechas(id)[0][0] === a0[0][0], 'la flecha se movió o perdió su jugador');
  ok(JSON.stringify(FI.POR_ID[id]) === orig, 'editar no debe tocar la pizarra original');
  f.moverFlecha(id, 0, 5, -3); ok(f.flechas(id)[0][1] === 0.99 && f.flechas(id)[0][2] === 0.01, 'la flecha debe quedar dentro de la cancha');
  f.moverRival(id, 2, 0.31, 0.62); ok(f.rival(id)[2][0] === 0.31 && f.rival(id)[3][0] === FI.POR_ID[id].rival[3][0], 'solo se mueve el rival elegido');
  const libre = [0, 1, 2, 3, 4, 5, 6].find(i => f.flechaDe(id, i) < 0);
  ok(f.agregarFlecha(id, libre) && f.flechaDe(id, libre) >= 0 && !f.agregarFlecha(id, libre), 'agregar una flecha, y no duplicarla');
  const n = f.flechas(id).length; ok(f.quitarFlecha(id, libre) && f.flechas(id).length === n - 1 && !f.quitarFlecha(id, libre), 'quitar la flecha');
  ok(f.quitarFlecha(id, a0[1][0]) && f.flechaDe(id, a0[1][0]) < 0, 'se puede quitar una flecha de la pizarra original');
  f.mover(id, 3, 0.4, 0.3); const j = JSON.parse(JSON.stringify(f.exportar())); ok(FI.valida(j) && j.fl[id] && j.rv[id] && j.ed[id], 'la exportación debe incluir jugadores, rivales y flechas');
  const g2 = FI.crear(null); g2.reemplazar(j); ok(JSON.stringify(g2.exportar()) === JSON.stringify(j) && g2.flechas(id)[0][1] === 0.99, 'no se recuperó lo importado');
  ok(FI.crear(j).rival(id)[2][1] === 0.62, 'crear desde lo guardado debe conservar los rivales');
  const viejo = { v: 1, ed: { salida: FI.POR_ID.salida.nos } }; ok(FI.valida(viejo) && FI.crear(viejo).flechas('salida').length === FI.POR_ID.salida.flechas.length, 'los guardados anteriores (sin flechas) siguen valiendo');
  const mal = x => { const c = JSON.parse(JSON.stringify(j)); x(c); return FI.valida(c); };
  ok(!mal(c => { c.fl[id][0][0] = 9; }) && !mal(c => { c.fl[id][0][1] = 2; }) && !mal(c => { c.fl[id].push(c.fl[id][0].slice()); }) && !mal(c => { c.fl.nada = []; }) && !mal(c => { c.rv[id] = [[0, 0]]; }), 'debe rechazar flechas y rivales inválidos');
  f.restablecer(id); ok(!f.editada(id) && JSON.stringify(f.flechas(id)) === JSON.stringify(a0) && f.rival(id)[2][0] === FI.POR_ID[id].rival[2][0], 'restablecer debe volver a lo original');
  return 'flechas, rivales, jugadores; ' + a0.length + ' flechas originales';
});

test('Fases: el partido pasa por ataque, defensa y las dos transiciones y el saque de arco', () => {
  const seen = {}, boards = {};
  [7, 8, 9].forEach(sd => { // la unión de 3 partidos: depende de la semilla si en 3 minutos hubo saque de arco
    const F7 = load(); F7.match.init({ seed: sd });
    for (let t = 0; t < 180; t += DT) { F7.match.update(DT); const f = F7.ficha.faseActual(0); seen[f.id] = 1; boards[f.pizarra] = 1; ok(F7.ficha.POR_ID[f.pizarra], 'pizarra inexistente ' + f.pizarra); }
  });
  ['ataque', 'defensa', 'trans_of', 'trans_def', 'parada'].forEach(k => ok(seen[k], 'nunca apareció ' + k));
  return Object.keys(boards).length + ' pizarras distintas en 9 minutos: ' + Object.keys(boards).join(', ');
});

test('Cámara: proyectar y volver al piso da el mismo punto, en las 3 orientaciones', () => {
  const F7 = load(), C = F7.cam, rect = { x: 0, y: 0, w: 800, h: 450 };
  [[{ x: 30, y: 67, z: 16 }, { x: 30, y: 19, z: 0 }], [{ x: -17, y: 20, z: 25 }, { x: 28, y: 20, z: 0 }], [{ x: 10, y: 8, z: 3.5 }, { x: 28, y: 15, z: 0.7 }]].forEach(e => {
    const c = C.camera(e[0], e[1], 45, rect);
    [[30, 20], [12, 5], [50, 33]].forEach(p => {
      const s = C.proj(c, { x: p[0], y: p[1], z: 0 }); if (!s) return;
      const w = C.unprojFloor(c, s.x, s.y); ok(Math.hypot(w.x - p[0], w.y - p[1]) < 1e-6, 'no vuelve al punto');
    });
  });
  const tv = C.camera({ x: 30, y: 67, z: 16 }, { x: 30, y: 19, z: 0 }, 40, rect);
  ok(C.proj(tv, { x: 50, y: 20, z: 0 }).x > C.proj(tv, { x: 10, y: 20, z: 0 }).x, 'de costado, azul debe atacar hacia la derecha');
  ok(C.proj(tv, { x: 30, y: 20, z: 3 }).y < C.proj(tv, { x: 30, y: 20, z: 0 }).y, 'arriba debe ser arriba');
  const top = C.camera({ x: 29.98, y: 20, z: 80 }, { x: 30, y: 20, z: 0 }, 40, { x: 0, y: 0, w: 400, h: 800 });
  ok(C.proj(top, { x: 50, y: 20, z: 0 }).y < C.proj(top, { x: 10, y: 20, z: 0 }).y, 'en vertical, azul debe atacar hacia arriba');
  ok(C.proj(top, { x: 30, y: 5, z: 0 }).x < C.proj(top, { x: 30, y: 35, z: 0 }).x, 'la izquierda del que ataca debe quedar a la izquierda');
  ok(C.clipSeg(tv, { x: 30, y: 80, z: 1 }, { x: 30, y: 90, z: 1 }) === null, 'lo que está detrás de la cámara no se dibuja');
});

test('Animación: huesos de largo fijo y pie que llega a la pelota', () => {
  const F7 = load(), A = F7.anim, an = A.create(), p = { k: 3, i: 3, x: 0.5, y: 0.5, team: 0, role: 'MED' };
  const src = { ps: [p], ball: { x: 0.6, y: 0.5 }, carrier: -1 };
  for (let i = 0; i < 90; i++) { p.x += 0.002; an.step(src, DT); const a = an.get(p), ps = A.pose(a, p, null, i * DT), j = ps.j;
    ['R', 'L'].forEach(s => {
      const h = j['hip' + s], k = j['kn' + s], f = j['an' + s], th = Math.hypot(k.u - h.u, k.v - h.v), sh = Math.hypot(f.u - k.u, f.v - k.v);
      ok(Math.abs(th - A.TH) < 0.02 && Math.abs(sh - A.SH) < 0.02, 'el hueso cambió de largo: ' + th.toFixed(3) + '/' + sh.toFixed(3));
      ok(f.v >= -1e-6, 'el pie atraviesa el piso');
    });
    Object.values(A.toWorld(a, ps)).forEach(q => ok(Number.isFinite(q.x + q.y + q.z), 'articulación inválida'));
  }
  const a = an.get(p); ok(a.gait === 'run', 'debería correr: ' + a.gait); ok(a.spd > 3, 'velocidad medida ' + a.spd);
  const ps = A.pose(Object.assign({}, a, { heading: 0 }), p, { u: 0.45, w: 0.2, v: 0.1 }, 0);
  ok(ps.reach === 'R' && Math.hypot(ps.j.anR.u - 0.45, ps.j.anR.v - 0.1) < 0.01, 'el pie debe ir a la pelota');
});

test('Animación: en un partido real se disparan pases, remates, robos y goles', () => {
  const F7 = load(), S = F7.state, an = F7.anim.create(), acts = {}; F7.match.init({ seed: 3 });
  for (let t = 0; t < 240; t += DT) {
    F7.match.update(DT); an.step({ ps: S.ps, ball: S.ball, carrier: S.carrier }, DT, S);
    S.ps.forEach(p => { const a = an.get(p); if (a.act) acts[a.act] = 1; if (a.celebrate > 0) acts.celebrate = 1; const ps = F7.anim.pose(a, p, null, t); ok(ps.j.head.v > 0, 'cabeza inválida'); });
  }
  ['pass', 'shot', 'slide'].forEach(k => ok(acts[k], 'nunca se animó ' + k));
  return 'animaciones vistas: ' + Object.keys(acts).join(', ');
});

test('Control: mover a tu jugador no rompe el motor y la IA sigue calculando tu lugar ideal', () => {
  const F7 = load(), S = F7.state; F7.match.init({ seed: 5 });
  const c = F7.coach.create({ me: 3, mode: 'manual' }); let moved = 0, n = 0;
  for (let t = 0; t < 40; t += DT) {
    c.target = { x: 0.2, y: 0.2, until: Infinity }; F7.match.update(DT); const me = S.ps[3];
    ok(c.ideal && Number.isFinite(c.ideal.x), 'sin lugar ideal');
    if (me.intent === 'user') { n++; if (Math.hypot(c.ideal.x - 0.2, c.ideal.y - 0.2) > 0.05) moved++; }
  }
  ok(n > 500, 'tu punto casi no mandó: ' + n); ok(moved / n > 0.8, 'la IA se quedó pegada a tu punto: ' + moved + '/' + n);
  ok(Math.hypot(S.ps[3].x - 0.2, S.ps[3].y - 0.2) < 0.08 || S.carrier === 3 || S.ps[3].intent !== 'user', 'el jugador no fue a tu punto');
  c.stop(); return n + ' pasos con tu punto; el ideal estuvo en otro lado en el ' + Math.round(100 * moved / n) + '%';
});

test('Tarjetas: en todas las posiciones hay una correcta, opciones distintas y círculos dentro de la cancha', () => {
  const sits = {}; let n = 0;
  for (let me = 0; me < 7; me++) {
    const F7 = load(); F7.match.init({ seed: 100 + me }); const c = F7.coach.create({ me, seed: me });
    const qs = play(F7, c, 150, right(c)); ok(qs.length >= 4, 'pocas tarjetas para la posición ' + me + ': ' + qs.length);
    qs.forEach(q => {
      n++; sits[q.sit] = (sits[q.sit] || 0) + 1;
      ok(q.opts.length >= 2 && q.opts.some(o => o.ok), q.sit + ': sin respuesta correcta');
      ok(new Set(q.opts.map(o => o.label)).size === q.opts.length, q.sit + ': opciones repetidas: ' + q.opts.map(o => o.label));
      q.opts.forEach(o => { ok(o.why && o.why.length > 5, q.sit + ': opción sin explicación'); if (o.w) ok(o.w.x >= 0 && o.w.x <= 1 && o.w.y >= 0 && o.w.y <= 1, 'círculo fuera'); });
      ok(q.title && q.text, 'tarjeta sin texto');
    });
    c.stop();
  }
  ['pos_ataque', 'pos_defensa', 'trans_of', 'trans_def', 'accion'].forEach(s => ok(sits[s], 'nunca salió ' + s));
  return n + ' tarjetas: ' + Object.keys(sits).map(k => k + ' ' + sits[k]).join(', ');
});

test('Tarjetas: el juego frena con la curva y va a la velocidad del nivel, con tiempo límite', () => {
  const F7 = load(), S = F7.state; F7.match.init({ seed: 9 });
  const SLOW = F7.coach.SLOW, c = F7.coach.create({ me: 5 }), k = 'pos_ataque:EXT:x';
  ok(SLOW.join() === '0,0.06,0.14,0.28,0.5,1', 'las velocidades deben ser las de Vóley TV: ' + SLOW);
  const mkq = () => ({ key: k, sit: 'pos_ataque', title: 't', text: 'x', opts: [{ label: 'a', ok: true, why: 'bien', w: { x: 0.5, y: 0.5 } }, { label: 'b', ok: false, why: 'mal', w: { x: 0.2, y: 0.2 } }], focus: { x: 0.5, y: 0.5 } });
  let q = mkq(); c.ask(q); ok(c.mul === 1 && S.opts.carrierHold, 'debe arrancar a velocidad normal y retener la decisión');
  for (let i = 0; i < 30; i++) c.frame(DT); ok(c.mul > 0 && c.mul < 1, 'tiene que ir frenando de a poco: ' + c.mul);
  for (let i = 0; i < 30; i++) c.frame(DT); ok(c.mul === 0 && !q.deadline, 'nivel 0: congelado y sin límite de tiempo, va ' + c.mul);
  ok(c.view.zoom > 1.5 && c.view.marks.length === 2, 'zoom y círculos');
  const r = c.answer(q.opts.find(o => !o.ok)); ok(!r.ok && r.text.includes('Lo correcto'), 'debe corregir: ' + r.text);
  ok(c.view.marks.some(x => x.ok) && c.view.marks.some(x => x.bad), 'los círculos deben marcar acierto y error');
  ok(!q.resumeAt, 'en nivel 0 se espera a tocar Seguir'); c.resume();
  for (let i = 0; i < 60 * 4; i++) c.frame(DT); ok(c.mul === 1 && c.view === null, 'debe volver a tiempo real de a poco');
  for (let lv = 1; lv <= 5; lv++) { // cada nivel: velocidad propia, tiempo límite propio, y el límite corre a velocidad real
    // sin errores por zona: eso baja un nivel aparte
    c.data.zn = {}; c.data.lv[k] = { lvl: lv, streak: 0, ok: 0, n: 0 }; q = mkq(); c.ask(q); for (let i = 0; i < 90; i++) c.frame(DT);
    ok(Math.abs(c.mul - SLOW[lv]) < 1e-9, 'nivel ' + lv + ' debe ir a ' + SLOW[lv] + ' y va ' + c.mul);
    const dl = F7.coach.DEADLINE[lv]; ok(dl ? Math.abs(q.deadline - q.shownAt - dl) < 1e-9 : !q.deadline, 'tiempo límite del nivel ' + lv);
    if (dl) { for (let i = 0; i < 60 * (dl + 1); i++) c.frame(DT); ok(q.done, 'nivel ' + lv + ': se tiene que acabar el tiempo'); ok(c.data.lv[k].lvl === lv - 1, 'el tiempo agotado cuenta como error y baja un nivel'); }
    else { c.answer(q.opts[0]); }
    c.resume(); for (let i = 0; i < 60 * 4; i++) c.frame(DT);
  }
});

test('Niveles: cada acierto sube un nivel de lectura, cada error baja uno, y el radar los muestra', () => {
  const F7 = load(); F7.match.init({ seed: 1 }); const c = F7.coach.create({ me: 3 }), k = 'lectura:MED:rival', msgs = []; c.on('callout', o => msgs.push(o.text));
  for (let i = 1; i <= 5; i++) { c.record(k, true); ok(c.data.lv[k].lvl === i, 'tras ' + i + ' aciertos debe estar en ' + i + ' y está en ' + c.data.lv[k].lvl); }
  c.record(k, true); ok(c.data.lv[k].lvl === 5, 'el tope es 5 (tiempo real)');
  c.record(k, false); ok(c.data.lv[k].lvl === 4, 'un error baja uno'); c.record(k, false); c.record(k, false); ok(c.data.lv[k].lvl === 2, 'dos errores más bajan dos');
  for (let i = 0; i < 9; i++) c.record(k, false); ok(c.data.lv[k].lvl === 0, 'el piso es 0');
  ok(msgs.some(m => /Subiste a .* \(lectura \d\/6\)/.test(m)) && msgs.some(m => /Bajás a .* \(lectura \d\/6\)/.test(m)), 'avisa de cada cambio: ' + msgs.slice(0, 2));
  const z = c.zoneKey('lectura'); c.data.zn[z] = { n: 10, ok: 3 }; c.data.lv[k].lvl = 3; ok(c.level(k) === 2, 'zona con 70% de errores: un nivel menos');
  const a = c.aspect('lectura'); ok(a.n > 0 && a.score > 0 && a.score <= 100, 'radar inválido: ' + JSON.stringify(a));
  ok(c.aspect('pelota').score === null, 'sin datos debe ser null'); ok(c.aspects().length === F7.coach.ASPECTS.length, 'aspectos');
});

test('Acción con pelota: lo que elegís se ejecuta de verdad en el partido', () => {
  const seen = { pass: 0, shoot: 0, other: 0 };
  [1, 2, 3, 4].forEach(sd => {
    const F7 = load(), S = F7.state; F7.match.init({ seed: sd }); const c = F7.coach.create({ me: 6, seed: sd });
    play(F7, c, 120, q => {
      if (q.sit !== 'accion') return c.answer(q.opts[0]);
      const o = q.opts[0], passes = S.stats.passes[0], shots = S.stats.shots[0]; c.answer(o);
      if (o.key.indexOf('pass:') === 0) { if (q.next) { seen.pass++; return; } ok(S.stats.passes[0] === passes + 1 && S.passFlight && S.passFlight.toK === +o.key.slice(5), 'el pase no salió'); seen.pass++; }
      else if (o.key === 'shoot') { ok(S.stats.shots[0] === shots + 1, 'el remate no salió'); seen.shoot++; } else seen.other++;
      ok(q.next || !S.opts.carrierHold, 'la decisión debe liberarse');
    }); c.stop();
  });
  ok(seen.pass > 0, 'no hubo pases'); return JSON.stringify(seen);
});

test('Pared: elegir el espacio correcto hace que el compañero te la devuelva', () => {
  let asked = 0, sent = 0, back = 0;
  for (let sd = 1; sd <= 8; sd++) {
    const F7 = load(), S = F7.state; F7.match.init({ seed: sd }); const c = F7.coach.create({ me: 3, seed: sd }); let to = -1, wait = false;
    const after = c.afterStep.bind(c);
    c.afterStep = () => {
      const had = !!c.wall; after();
      if (had && !c.wall && S.passFlight && S.passFlight.fromK === to && S.passFlight.toK === 3) { sent++; wait = true; }
      if (wait && !S.passFlight) { wait = false; if (S.carrier === 3) back++; }
    };
    play(F7, c, 100, q => {
      if (q.sit === 'apoyo') { asked++; const passes = S.stats.passes[0]; c.answer(q.opts.find(o => o.ok)); ok(S.stats.passes[0] === passes + 1, 'el pase no salió'); ok(c.wall, 'falta la pared'); to = c.wall.to; return; }
      if (q.sit === 'accion') { const o = q.opts.find(x => x.key.indexOf('pass:') === 0) || q.opts[0]; return c.answer(o); }
      c.answer(q.opts[0]);
    });
    c.stop();
  }
  ok(asked > 0, 'nunca preguntó a dónde ir'); ok(sent > 0, 'el compañero nunca devolvió'); ok(back > 0, 'nunca volvió la pelota');
  return asked + ' preguntas de "a dónde vas": ' + sent + ' devoluciones, ' + back + ' recibidas';
});

test('Distribución: mide el equipo y detecta un equipo mal repartido', () => {
  const F7 = load(), S = F7.state, sh = F7.coach.shape; F7.match.init({ seed: 2 });
  const base = sh(0, true); ok(base.amplitud > 15 && base.profundidad > 10 && base.carriles >= 2, 'métricas raras: ' + JSON.stringify(base));
  S.team[0].forEach(p => { if (p.i) { p.x = 0.5; p.y = 0.5 + p.i * 0.005; } }); S.ball.x = 0.45;
  const bad = sh(0, true), ids = bad.issues.map(i => i.id); ok(ids.includes('amplitud') && ids.includes('profundidad') && ids.includes('carriles'), 'no detectó: ' + ids);
  S.team[0].forEach((p, i) => { if (p.i) { p.x = 0.1 + 0.15 * i; p.y = 0.5; } }); S.ball.x = 0.05;
  const open = sh(0, false), ids2 = open.issues.map(i => i.id); ok(ids2.includes('partido'), 'no vio el equipo partido: ' + ids2);
  return 'ancho ' + base.amplitud.toFixed(0) + ' m, largo ' + base.profundidad.toFixed(0) + ' m al inicio';
});

test('Modo manual: quedarte quieto te marca el error; seguir a la IA no', () => {
  const run = follow => {
    const F7 = load(), S = F7.state; F7.match.init({ seed: 21 }); const c = F7.coach.create({ me: 5, mode: 'manual', seed: 1 }); let bad = 0;
    if (follow) c.target = null;
    play(F7, c, 90, q => { if (q.sit !== 'accion' && q.sit !== 'apoyo') bad++; c.answer(q.opts.find(o => o.ok)); if (!follow) c.target = { x: 0.1, y: 0.1, until: Infinity }; else c.target = null; }); c.stop(); return bad;
  };
  const still = run(false), auto = run(true); ok(still >= 3, 'quieto debería corregirte varias veces: ' + still); ok(auto <= still / 2, 'siguiendo a la IA casi no debería: ' + auto + ' vs ' + still);
  return 'correcciones: quieto ' + still + ', en tu lugar ' + auto;
});

test('Ficha: registra pases, remates y tarjetas reales de tu jugador y arma nota, radial y tablas', () => {
  const F7 = load(), S = F7.state, P = F7.perfil.create(null); F7.match.init({ seed: 40 }); P.startMatch();
  const c = F7.coach.create({ me: 6, seed: 4 }); c.on('stat', e => P.add(e));
  let passes = 0, shots = 0; const orig = F7.ball.launchPass, sh0 = F7.ball.shoot;
  F7.ball.launchPass = (a, b, o) => { if (a === 6) passes++; return orig(a, b, o); }; F7.ball.shoot = (k, o) => { if (k === 6) shots++; return sh0(k, o); };
  const seen = play(F7, c, 300, right(c)); c.stop();
  const evs = P.data.events, t = P.tables(evs), r = P.ratings(evs, 'DEL'), answered = seen.filter(q => q.done).length;
  ok(evs.filter(e => e.t === 'card').length === answered, 'tarjetas registradas ' + evs.filter(e => e.t === 'card').length + ' de ' + answered);
  ok(Math.abs(t.pass.n - passes) <= 1, 'pases registrados ' + t.pass.n + ' de ' + passes); ok(Math.abs(t.shot.n - shots) <= 1, 'remates registrados ' + t.shot.n + ' de ' + shots);
  ok(t.shot.gol + t.shot.atajado + t.shot.otro === t.shot.n, 'remates sin resultado');
  evs.forEach(e => ok(e.pos === 6 && e.role === 'DEL' && e.third >= 0 && e.third <= 2, 'evento incompleto ' + JSON.stringify(e)));
  ok(r.general >= 1 && r.general <= 99 && r.DEC >= 90, 'siempre acertando debe dar DEC alta: ' + JSON.stringify(r));
  const m = P.endMatch({ pos: 6, score: S.score, secs: S.seconds }); ok(m && m.n === evs.length && P.data.matches.length === 1, 'partido no registrado');
  const h = P.html({ pos: 6, levels: c.data.lv }); ok(/pf-poly/.test(h) && /Lo que hacés bien/.test(h) && /Tarjetas por situación/.test(h) && !/undefined|NaN/.test(h), 'la ficha salió mal');
  return evs.length + ' acciones · nota ' + r.general + ' · ' + t.pass.n + ' pases, ' + t.shot.n + ' remates';
});

test('Ficha: separa lo bueno de lo malo, sin nota con pocos datos y sin inyectar HTML', () => {
  const F7 = load(), P = F7.perfil.create(null), card = (sit, ok, x) => Object.assign({ t: 'card', sit, ok, pos: 3, role: 'MED', third: 1, dec: 2, out: false, pick: ok ? null : 'Ir yo también a la pelota', pizarra: 'bloque_medio' }, x);
  ok(P.ratings([card('accion', true)], 'MED').DEC === undefined, 'con 1 dato no hay nota de área');
  for (let i = 0; i < 6; i++) { P.add(card('trans_def', false)); P.add(card('accion', true, { pizarra: null, third: 2 })); P.add({ t: 'pass', ok: true, fw: 0.1, pos: 3, role: 'MED', third: 1 }); }
  const r = P.ratings(P.data.events, 'MED'), w = P.review(P.data.events);
  ok(r.TRA < 10 && r.DEC > 90 && r.PAS > 80, 'notas: ' + JSON.stringify(r));
  ok(w.bad.some(x => /Al perder la pelota/.test(x)) && w.bad.some(x => /Error que repetís/.test(x)) && w.bad.some(x => /Bloque medio/.test(x)), 'malo: ' + w.bad);
  ok(w.good.some(x => /decisiones/.test(x)) && w.good.some(x => /Pase seguro/.test(x)), 'bueno: ' + w.good);
  ok(w.bad.filter(x => /Error que repetís/.test(x)).length <= 2 && /Al perder la pelota/.test(w.bad[0]), 'lo de fondo va primero: ' + w.bad);
  const pts = /pf-poly" points="([^"]*)"/.exec(P.radarSvg({ UBI: 50, TRA: 50, PRE: 50 }, '#fff'))[1].trim().split(' '); ok(pts.length === 3, 'un área sin datos no debe dibujarse como cero: ' + pts.length);
  const lo = P.ratings(P.data.events, 'DEF').general, hi = P.ratings(P.data.events, 'DEL').general; ok(lo !== hi, 'la nota debe depender de la posición: ' + lo + ' vs ' + hi);
  ok(P.events(3).length === 18 && P.events(5).length === 0, 'el filtro por posición falla');
  P.data.name = '"><img src=x onerror=1>'; ok(!/<img/.test(P.html({})), 'el nombre tiene que escaparse');
  const big = F7.perfil.create(null); for (let i = 0; i < 4100; i++) big.add(card('accion', true)); ok(big.data.events.length === 4000, 'tope de eventos');
  ok(F7.perfil.create({ v: 9 }).data.events.length === 0, 'datos viejos no deben romper'); ok(P.endMatch({ pos: 3, score: [0, 0], secs: 5 }) === null, 'un partido de 5 s no cuenta');
  P.reset(); ok(P.data.events.length === 0 && P.data.name.length > 0, 'reiniciar debe conservar el nombre');
  return 'nota de un mismo jugador: ' + lo + ' como defensa, ' + hi + ' como delantero';
});

test('Guía: en cada situación dice qué hacer, con su color y su leyenda, y apunta adentro de la cancha', () => {
  const kinds = {}; let n = 0;
  [1, 2, 3, 4, 5, 6].forEach(sd => [0, 3, 5, 6].forEach(me => {
    const F7 = load(), S = F7.state, G = F7.coach.GUIDE; F7.match.init({ seed: 700 + sd }); const c = F7.coach.create({ me, mode: 'manual', seed: sd });
    for (let i = 0; i < 60 * 70; i++) {
      F7.match.update(DT); c.afterStep(); if (c.q) { c.answer(c.q.opts[0]); c.resume(); }
      if (i % 20) continue; const g = c.guide(); if (!g) continue; n++; kinds[g.kind] = (kinds[g.kind] || 0) + 1;
      ok(G[g.kind] && g.col === G[g.kind].col && g.name === G[g.kind].name, 'tipo o color inválido: ' + JSON.stringify(g));
      ok(g.x >= 0 && g.x <= 1 && g.y >= 0 && g.y <= 1 && Number.isFinite(g.x + g.y), 'el destino de la flecha está fuera de la cancha');
      ok(g.text.length > 8 && !/undefined|NaN|null/.test(g.text), 'leyenda rota: ' + g.text);
    }
    c.stop();
  }));
  ok(Object.keys(kinds).length >= 4, 'en 24 partidos debió haber al menos 4 tipos de acción: ' + JSON.stringify(kinds));
  const F7 = load(), S = F7.state, G = F7.coach.GUIDE; F7.match.init({ seed: 5 }); const c = F7.coach.create({ me: 3, mode: 'manual' }); c.stop();
  ok(new Set(Object.keys(G).map(k => G[k].col)).size === 6 && Object.keys(G).length === 6, 'cada acción tiene su propio color');
  const as = (intent, extra) => { c.ideal = { x: 0.4, y: 0.5, intent, think: '', sm: 1 }; S.owner = 1; S.carrier = 7 + 3; S.passFlight = null; Object.assign(S, extra || {}); return c.guide(); };
  ok(as('press').kind === 'disputar' && /presioná al #4/.test(as('press').text), 'presionar es disputar la pelota: ' + as('press').text);
  ok(as('chase').kind === 'disputar', 'ir a la pelota dividida es disputar');
  const ic = as('intercept', { passFlight: { fromK: 7, toK: 9, team: 1 } }); ok(ic.kind === 'interceptar' && /Cortá el pase del #1 al #3/.test(ic.text), 'interceptar: ' + ic.text);
  ['cover', 'contain', 'mark', 'keeper', 'save'].forEach(i => ok(as(i).kind === 'bloquear', i + ' es bloquear'));
  ['support', 'run', 'width', 'check-run', 'zone', 'recover', 'receive', 'follow'].forEach(i => ok(as(i).kind === 'mover', i + ' es desplazarse'));
  S.passFlight = null; S.owner = 0; S.carrier = c.me;
  const withKey = key => { c._bk = { poss: S.possId, t: Math.floor(S.seconds * 3), key }; return c.guide(); };
  const sh = withKey('shoot'); ok(sh.kind === 'disparo' && sh.x > 0.95 && /Rematá/.test(sh.text), 'con la pelota y lo mejor es rematar: ' + JSON.stringify(sh));
  const ps = withKey('pass:5'); ok(ps.kind === 'pase' && Math.abs(ps.x - S.ps[5].x) < 1e-9 && /Pase al #6/.test(ps.text), 'pase al compañero: ' + JSON.stringify(ps));
  ok(withKey('dribble').kind === 'mover' && withKey('shield').kind === 'mover' && withKey('clear').kind === 'pase', 'conducir/proteger es desplazarse y despejar es pase');
  return n + ' guías válidas: ' + Object.keys(kinds).map(k => k + ' ' + kinds[k]).join(', ');
});

test('Audio: bien y mal suenan distinto, respetan el silencio y no rompen sin audio', () => {
  const F7 = load(), log = { osc: [], resumed: 0 };
  class AC {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.destination = {}; }
    resume() { log.resumed++; this.state = 'running'; }
    createOscillator() { const o = { type: '', frequency: { setValueAtTime(f) { o.f0 = f; }, linearRampToValueAtTime(f) { o.f1 = f; } }, connect() {}, start() { o.started = true; }, stop() {} }; log.osc.push(o); return o; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  const A = F7.audio.create({ AC });
  ok(A.ok() && log.osc.length === 3 && log.resumed === 1 && log.osc.every(o => o.started), 'bien: 3 notas y despierta el audio');
  const up = log.osc.map(o => o.f0); ok(up[0] < up[1] && up[1] < up[2], 'bien: las notas suben ' + up);
  const n = log.osc.length; ok(A.bad() && log.osc.length - n === 3, 'mal: 3 tonos');
  const down = log.osc.slice(n); ok(down.every(o => o.f0 < Math.min.apply(null, up)) && down.every(o => o.f1 < o.f0), 'mal: graves y bajando ' + down.map(o => o.f0 + '→' + o.f1));
  ok(A.played.ok === 1 && A.played.bad === 1, 'contadores'); A.on = false; const m = log.osc.length;
  ok(!A.ok() && !A.bad() && log.osc.length === m, 'en silencio no suena nada');
  ok(F7.audio.create({}).ok() === false, 'sin AudioContext no debe romper'); ok(F7.audio.create({ AC: class { constructor() { throw new Error('x'); } } }).bad() === false, 'si el audio falla, no debe romper');
});

test('Veredicto: con el nivel máximo, estar fuera de lugar en modo manual avisa y marca error', () => {
  const F7 = load(), S = F7.state; F7.match.init({ seed: 31 }); const c = F7.coach.create({ me: 5, mode: 'manual', seed: 2 }); c.level = () => 5; const v = [], co = []; c.on('verdict', x => v.push(x)).on('callout', x => co.push(x.text));
  c.target = { x: 0.1, y: 0.1, until: Infinity }; let bad = 0; c.on('stat', e => { if (e.t === 'pos' && !e.ok) bad++; });
  for (let i = 0; i < 60 * 90; i++) { c.frame(DT); F7.match.update(DT); c.afterStep(); } c.stop();
  ok(v.length >= 2 && v.every(x => x.ok === false), 'debió haber errores sin tarjeta: ' + v.length); ok(bad === v.length && co.filter(t => /Fuera de tu lugar/.test(t)).length === v.length, 'cada veredicto lleva su aviso y su registro');
  return v.length + ' errores avisados en 90 s';
});

test('20 partidos de 3 minutos con tarjetas: sin errores, sin trabas y con goles', () => {
  let cards = 0, goals = 0, diag = 0;
  for (let sd = 0; sd < 20; sd++) {
    const F7 = load(), S = F7.state; F7.match.init({ seed: 500 + sd }); const c = F7.coach.create({ me: sd % 7, seed: sd });
    cards += play(F7, c, 180, sd % 2 ? right(c) : wrong(c)).length; goals += S.stats.goals[0] + S.stats.goals[1];
    ok(!S.opts.carrierHold || c.q, 'la decisión del poseedor quedó retenida'); ok(c.q === null || !c.q.done || c.q.lvl >= 0, 'tarjeta colgada');
    ok(S.ps.every(p => Number.isFinite(p.x + p.y)), 'posición inválida'); ok(S.seconds >= 170, 'el partido se trabó en ' + S.seconds);
    diag += F7.debug.counts.PASS_NOT_RECEIVED || 0; c.stop();
  }
  ok(cards > 200, 'pocas tarjetas: ' + cards); ok(goals > 10, 'pocos goles: ' + goals);
  return cards + ' tarjetas, ' + goals + ' goles, ' + diag + ' pases sin recibir';
});

const pass = results.filter(r => r.ok).length;
const out = results.map(r => (r.ok ? 'PASS ' : 'FAIL ') + r.name + '\n       ' + (r.info || 'OK')).join('\n') + '\n\n' + pass + '/' + results.length + ' pruebas OK\n';
fs.writeFileSync(path.join(__dirname, 'coach-last-run.txt'), out);
console.log('\n' + pass + '/' + results.length + ' pruebas OK');
process.exit(pass === results.length ? 0 : 1);
