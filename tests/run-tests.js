#!/usr/bin/env node
/* Pruebas reproducibles del motor de IA (Node, sin navegador). Uso:  node tests/run-tests.js
 * Cada prueba carga un motor nuevo con semilla fija, arma un escenario y mide el comportamiento real. Sin mocks del motor.
 * Sale con código 1 si alguna prueba falla. Las pruebas "de control" plantan a propósito un problema para demostrar que los diagnósticos lo detectan. */
const load = require('./engine.js');
const results = [];
function test(name, fn) {
  let r;
  try { r = { name, ok: true, info: fn() || '' }; } catch (e) { r = { name, ok: false, info: e.message }; }
  results.push(r);
  console.log((r.ok ? 'PASS ' : 'FAIL ') + name + (r.info ? '\n       ' + r.info : ''));
}
function ok(c, msg) { if (!c) throw new Error(msg); }
const fmt = (v, n) => (+v).toFixed(n == null ? 2 : n);
function mk(seed, flags) { const F7 = load(); F7.match.init({ seed, flags }); return F7; }
function run(F7, secs) { F7.debug.sim(secs); }
const dt = 1 / 60;

/* ---------- Escenarios ---------- */
function park(F7, team) { // manda a los jugadores de campo de un equipo a las esquinas lejanas (rivales "fuera de juego")
  F7.state.team[team].forEach(p => { if (p.i > 0) F7.debug.place(p.k, team === 1 ? 0.93 : 0.07, p.i % 2 ? 0.06 : 0.94); });
}
function blueAttackSetup(F7) { // azul con la pelota en el medio, rojo defendiendo normal
  const S = F7.state; F7.debug.place(3, 0.5, 0.5); F7.debug.give(3); return S;
}

/* ================= 1. Inicio y reinicio ================= */
test('Inicio y reinicio sin errores (20 semillas, 3 reinicios c/u)', () => {
  let n = 0;
  for (let s = 1; s <= 20; s++) {
    const F7 = mk(s); const S = F7.state;
    ok(S.ps.length === 14 && S.team[0].length === 7 && S.team[1].length === 7, 'debe haber 14 jugadores');
    ok(S.ps.filter(p => p.role === 'ARQ').length === 2, 'un arquero por equipo');
    for (let r = 0; r < 3; r++) {
      run(F7, 12);
      F7.match.cmd.reset(); // equivale al botón REINICIAR
      ok(F7.state.seconds === 0 && F7.state.score[0] === 0 && F7.state.score[1] === 0, 'el reinicio debe poner reloj y marcador en 0');
      ok(F7.state.owner === 0 && F7.state.carrier === 6, 'el reinicio devuelve la pelota al #7 azul');
      n++;
    }
    run(F7, 30);
    ok(F7.state.ps.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(F7.state.ball.x), 'posiciones finitas');
    ok(F7.debug.errors.length === 0, 'sin excepciones');
  }
  return n + ' reinicios verificados';
});

/* ================= 2. Arquero ================= */
function keeperCase(seed, team, pressured) {
  const F7 = mk(seed), S = F7.state, u = F7.u, kp = S.team[team][0];
  if (!pressured) park(F7, 1 - team);
  else { const o = S.team[1 - team][6]; F7.debug.place(o.k, u.abs(team, 0.12), kp.y + 0.05); }
  F7.debug.give(kp.k);
  let t = 0, maxRel = 0, dribbled = false;
  while (S.owner === team && S.carrier === kp.k && t < 8) {
    F7.match.update(dt); t += dt; maxRel = Math.max(maxRel, u.rel(team, kp.x));
    if (S.carrierIntent.type === 'dribble') dribbled = true;
  }
  return { t, maxRel, dribbled, owner: S.owner, kind: S.ball.kind, F7 };
}
test('Arquero: no conduce hacia el arco contrario y se desprende de la pelota rápido (ambos equipos, con y sin presión)', () => {
  let maxT = 0, maxRel = 0, kinds = {}, n = 0;
  for (let s = 1; s <= 15; s++) for (const team of [0, 1]) for (const pr of [false, true]) {
    const r = keeperCase(s, team, pr); n++;
    ok(!r.dribbled, 'el arquero nunca debe elegir conducir (semilla ' + s + ')');
    ok(r.t < 2.6, 'el arquero conservó la pelota ' + fmt(r.t) + ' s (semilla ' + s + ', equipo ' + team + ')');
    ok(r.maxRel < 0.2, 'el arquero se alejó a rel=' + fmt(r.maxRel) + ' con la pelota');
    const k = r.owner === -1 ? r.kind : (r.owner === team ? 'pase-completado' : 'robada'); kinds[k] = (kinds[k] || 0) + 1;
    maxT = Math.max(maxT, r.t); maxRel = Math.max(maxRel, r.maxRel);
  }
  return n + ' casos · máx. tiempo con pelota ' + fmt(maxT) + ' s · máx. avance rel ' + fmt(maxRel) + ' · desenlaces ' + JSON.stringify(kinds);
});
test('Arquero: bajo presión despeja o juega corto (nunca queda dudando)', () => {
  let clears = 0, passes = 0, robbed = 0, maxT = 0;
  for (let s = 1; s <= 15; s++) { const r = keeperCase(s, 0, true); maxT = Math.max(maxT, r.t); if (r.owner === -1 && r.kind === 'clear') clears++; else if (r.owner === -1 && r.kind === 'pass') passes++; else robbed++; }
  ok(clears + passes >= 10, 'solo ' + (clears + passes) + '/15 salidas por pase o despeje');
  ok(maxT < 2.6, 'el arquero dudó ' + fmt(maxT) + ' s');
  return 'despejes ' + clears + ' · pases cortos ' + passes + ' · robada por el rival pegado durante el control inicial ' + robbed + ' (de 15) · máx. tiempo ' + fmt(maxT) + ' s';
});
test('Arquero con compañero libre: prefiere pasar a un defensor/compañero libre antes que despejar', () => {
  let passes = 0, n = 0;
  for (let s = 1; s <= 15; s++) { const r = keeperCase(s, 0, false); n++; if (r.kind === 'pass') passes++; }
  ok(passes >= 8, 'solo ' + passes + '/' + n + ' salidas por pase');
  return 'salida por pase en ' + passes + ' de ' + n;
});

/* ================= 3. Poseedor ================= */
test('Poseedor: encuentra opciones de pase (≥3 opciones; la mejor con riesgo < 0.6 en ≥85% de los casos) desde la formación inicial', () => {
  let n = 0, minOpts = 9, worst = 0, good = 0;
  for (let s = 1; s <= 12; s++) {
    const F7 = mk(s); const S = F7.state; run(F7, 1);
    for (const k of [1, 2, 3, 4, 5, 6]) { // cada jugador de campo azul como poseedor teórico
      const o = F7.tactics.options(0, k); n++; minOpts = Math.min(minOpts, o.length);
      ok(o.length >= 3, 'solo ' + o.length + ' opciones'); worst = Math.max(worst, o[0].risk); if (o[0].risk < 0.6) good++;
    }
  }
  ok(good / n >= 0.85, 'la mejor opción tuvo riesgo < 0.6 solo en ' + good + '/' + n);
  return n + ' evaluaciones · mínimo de opciones ' + minOpts + ' · mejor opción con riesgo < 0.6 en ' + good + '/' + n + ' (peor caso ' + fmt(worst) + ': extremo marcado en el saque inicial)';
});

function matchStats(seed, secs, flags) { // simula un partido y registra posesiones, acciones y comportamiento del poseedor
  const F7 = mk(seed, flags), S = F7.state, u = F7.u, st = { acts: {}, carries: [], kcMax: 0, kcRel: 0, kcDribble: 0, backDribbles: 0, dribbles: 0 };
  for (const [mod, fn] of [['tactics', 'decide'], ['roles', 'keeperDecision']]) {
    const o = F7[mod][fn]; F7[mod][fn] = function (k) {
      const a = o(k), p = S.ps[k]; st.acts[a.type] = (st.acts[a.type] || 0) + 1;
      if (a.type === 'dribble') { st.dribbles++; if (a.prog < 0) st.backDribbles++; if (p.role === 'ARQ') st.kcDribble++; }
      return a;
    };
  }
  let lastP = S.possId, lastCarry = 0, lastRole = '', kc = 0;
  for (let i = 0, n = Math.round(secs / dt); i < n; i++) {
    F7.match.update(dt);
    if (S.possId !== lastP) { if (lastRole && lastRole !== 'ARQ') st.carries.push({ role: lastRole, t: lastCarry }); lastP = S.possId; }
    if (S.owner >= 0 && !S.passFlight) { lastCarry = S.carryTime; lastRole = S.ps[S.carrier].role; }
    if (S.owner >= 0 && S.carrier >= 0 && S.ps[S.carrier].role === 'ARQ') {
      kc += dt; st.kcMax = Math.max(st.kcMax, kc); st.kcRel = Math.max(st.kcRel, u.rel(S.owner, S.ps[S.carrier].x));
    } else kc = 0;
  }
  st.F7 = F7; return st;
}
test('Poseedor: no conduce demasiado (tiempo con pelota por rol ≤ límite duro del rol; arquero ≤ 2.5 s)', () => {
  const P = load().roles; // perfiles (sin partido)
  const by = {}; let kcMax = 0;
  for (let s = 1; s <= 12; s++) { const st = matchStats(s, 180); kcMax = Math.max(kcMax, st.kcMax); st.carries.forEach(c => { (by[c.role] = by[c.role] || []).push(c.t); }); }
  const lines = [];
  for (const role of Object.keys(by)) {
    const a = by[role].sort((x, y) => x - y), max = a[a.length - 1], p95 = a[Math.floor(a.length * 0.95)], hard = P.PROFILE[role].hard;
    lines.push(role + ': n=' + a.length + ' p95=' + fmt(p95) + 's máx=' + fmt(max) + 's (límite duro ' + hard + 's)');
    ok(max <= hard + 0.8, role + ' conservó ' + fmt(max) + ' s (> límite duro ' + hard + ' + 0.8)');
  }
  ok(kcMax <= 2.5, 'arquero conservó ' + fmt(kcMax) + ' s');
  return lines.join(' | ') + ' | arquero máx=' + fmt(kcMax) + 's';
});
test('Poseedor: evalúa y varía (pase, conducción, remate, protección y despeje se usan; no siempre lo mismo)', () => {
  const acts = {}; let drib = 0, back = 0, kcDr = 0;
  for (let s = 1; s <= 10; s++) { const st = matchStats(s, 180); Object.keys(st.acts).forEach(k => { acts[k] = (acts[k] || 0) + st.acts[k]; }); drib += st.dribbles; back += st.backDribbles; kcDr += st.kcDribble; }
  const total = Object.values(acts).reduce((a, b) => a + b, 0);
  ['pass', 'dribble', 'shoot', 'shield', 'clear'].forEach(k => ok((acts[k] || 0) > 0, 'nunca eligió ' + k));
  Object.keys(acts).forEach(k => ok(acts[k] / total < 0.7, k + ' domina (' + fmt(100 * acts[k] / total, 0) + '%)'));
  ok(kcDr === 0, 'el arquero eligió conducir ' + kcDr + ' veces');
  ok(back / Math.max(1, drib) < 0.15, 'conducciones hacia atrás: ' + back + '/' + drib);
  return 'decisiones ' + JSON.stringify(acts) + ' · conducciones hacia atrás ' + back + '/' + drib;
});

/* ================= 4. Compañeros sin pelota ================= */
test('Compañeros: se desmarcan, ofrecen línea de pase, no se amontonan ni quedan quietos (poseedor sostenido 6 s)', () => {
  let nOpen = 0, minPair = 9, moved = 0, crowd = 0, n = 0, avgD = 0;
  for (let s = 1; s <= 12; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state, u = F7.u;
    blueAttackSetup(F7); run(F7, 1.5);
    const before = S.team[0].filter(p => p.i > 0 && p.k !== S.carrier).map(p => ({ x: p.x, y: p.y }));
    run(F7, 4.5); n++;
    const mates = S.team[0].filter(p => p.i > 0 && p.k !== S.carrier), c = S.ps[S.carrier];
    const open = F7.tactics.options(0, c.k).filter(o => o.risk < 0.5).length; nOpen += open;
    ok(open >= 1, 'ninguna opción de pase abierta (semilla ' + s + ')');
    let mp = 9; for (let i = 0; i < mates.length; i++) for (let j = i + 1; j < mates.length; j++) mp = Math.min(mp, u.d(mates[i], mates[j]));
    minPair = Math.min(minPair, mp); ok(mp > 0.085, 'dos compañeros a ' + fmt(mp, 3) + ' uno del otro');
    const near = mates.filter(p => u.d(p, c) < 0.09).length; crowd = Math.max(crowd, near); ok(near <= 1, near + ' compañeros pegados al poseedor');
    moved += mates.filter((p, i) => Math.hypot(p.x - before[i].x, p.y - before[i].y) > 0.04).length / mates.length;
    avgD += mates.reduce((a, p) => a + u.d(p, c), 0) / mates.length;
    ok(c.k === S.carrier && S.owner === 0, 'la pelota debía seguir en el poseedor');
  }
  ok(nOpen / n >= 1.5, 'opciones abiertas promedio ' + fmt(nOpen / n));
  ok(moved / n > 0.5, 'solo ' + fmt(100 * moved / n, 0) + '% de los compañeros se movió');
  return n + ' escenarios · opciones abiertas promedio ' + fmt(nOpen / n) + ' · separación mínima entre compañeros ' + fmt(minPair, 3) + ' · máx. pegados al poseedor ' + crowd + ' · % que se mueve ' + fmt(100 * moved / n, 0) + ' · dist. media al poseedor ' + fmt(avgD / n);
});
test('Compañeros: roles — EXT mantiene amplitud, DEL ofrece profundidad, DEF queda detrás de la pelota', () => {
  let ext = 0, delAhead = 0, defBehind = 0, n = 0;
  for (let s = 1; s <= 12; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state, u = F7.u;
    blueAttackSetup(F7); run(F7, 5); n++;
    const c = S.ps[S.carrier];
    if (Math.abs(S.ps[5].y - 0.5) > 0.3) ext++;
    if (S.ps[6].x > c.x + 0.05) delAhead++;
    if (S.ps[1].x < c.x && S.ps[2].x < c.x) defBehind++;
  }
  ok(ext >= n * 0.8, 'EXT ancho en ' + ext + '/' + n); ok(delAhead >= n * 0.8, 'DEL por delante en ' + delAhead + '/' + n); ok(defBehind === n, 'DEF detrás de la pelota en ' + defBehind + '/' + n);
  return 'EXT ancho ' + ext + '/' + n + ' · DEL por delante ' + delAhead + '/' + n + ' · DEF detrás ' + defBehind + '/' + n;
});

/* ================= 5. Defensa ================= */
function defScenario(seed, bx, by, secs) { // rojo con la pelota (sostenida) en (bx,by); evalúa al azul defendiendo
  const F7 = mk(seed, { carrierHold: true, noTackle: true }), S = F7.state;
  F7.debug.place(10, bx, by); F7.debug.give(10); run(F7, secs); return F7;
}
test('Defensa: estructura coherente (1 presionador, cobertura, marcas distintas, nadie sin cerrar, arquero en su arco)', () => {
  const spots = [[0.5, 0.5], [0.35, 0.2], [0.3, 0.8], [0.5, 0.15], [0.62, 0.55], [0.22, 0.5]];
  let maxPress = 0, maxNear = 0, minGoalSide = 9, maxDepth = 0, n = 0, shapeDiag = 0, chaseDiag = 0;
  for (let s = 1; s <= 8; s++) for (const [bx, by] of spots) {
    const F7 = defScenario(s, bx, by, 6), S = F7.state, u = F7.u; n++;
    const field = S.team[0].filter(p => p.i > 0), c = S.ps[S.carrier], brel = u.rel(0, c.x);
    const press = field.filter(p => p.intent === 'press').length; maxPress = Math.max(maxPress, press);
    ok(press <= 1, press + ' presionadores simultáneos (balón ' + bx + ',' + by + ')');
    const near = field.filter(p => u.d(p, c) < 0.13).length; maxNear = Math.max(maxNear, near);
    ok(near <= 3, near + ' defensores a menos de .13 del poseedor');
    const marks = field.filter(p => p.intent === 'mark').map(p => ({ x: p.tx, y: p.ty }));
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++) ok(u.d(marks[i], marks[j]) > 0.03, 'dos marcadores al mismo rival');
    const gs = field.filter(p => u.rel(0, p.x) < brel - 0.02).length; minGoalSide = Math.min(minGoalSide, gs);
    if (brel < 0.5) ok(gs >= 1, 'nadie detrás de la pelota cerca del arco propio (balón ' + bx + ',' + by + ')');
    const rels = field.map(p => u.rel(0, p.x)), depth = Math.max(...rels) - Math.min(...rels); maxDepth = Math.max(maxDepth, depth);
    ok(depth < 0.62, 'equipo estirado: profundidad ' + fmt(depth));
    ok(field.some(p => p.intent === 'cover' || p.intent === 'mark'), 'sin coberturas ni marcas');
    const kp = S.ps[0]; ok(kp.x < 0.2 && kp.y > 0.33 && kp.y < 0.67, 'arquero fuera de su arco: ' + fmt(kp.x) + ',' + fmt(kp.y));
    shapeDiag += F7.debug.counts.DEFENSE_SHAPE_BROKEN; chaseDiag += F7.debug.counts.PLAYER_CHASING_BALL;
  }
  ok(shapeDiag === 0 && chaseDiag === 0, 'diagnósticos: forma=' + shapeDiag + ' persecución=' + chaseDiag);
  return n + ' escenarios · máx. presionadores ' + maxPress + ' · máx. cerca del poseedor ' + maxNear + ' · mín. detrás de la pelota ' + minGoalSide + ' · máx. profundidad ' + fmt(maxDepth);
});
test('Defensa: el bloque se desplaza con la pelota (línea defensiva más alta cuanto más avanza el rival; compresión lateral)', () => {
  let ok1 = 0, n = 0, dl = [], side = 0;
  for (let s = 1; s <= 8; s++) {
    const lo = defScenario(s, 0.30, 0.5, 5), hi = defScenario(s, 0.70, 0.5, 5); n++;
    const defLine = F7 => F7.state.team[0].filter(p => p.role === 'DEF').reduce((a, p) => a + p.x, 0) / 2;
    const a = defLine(lo), b = defLine(hi); dl.push(b - a); if (b > a + 0.05) ok1++;
    const L = defScenario(s, 0.4, 0.15, 5); const R = defScenario(s, 0.4, 0.85, 5);
    const my = F7 => F7.state.team[0].filter(p => p.i > 0).reduce((a, p) => a + p.y, 0) / 6; if (my(L) < my(R) - 0.1) side++;
  }
  ok(ok1 === n, 'la línea defensiva subió solo en ' + ok1 + '/' + n); ok(side === n, 'compresión lateral solo en ' + side + '/' + n);
  return 'línea defensiva sube con la pelota en ' + ok1 + '/' + n + ' (Δx medio ' + fmt(dl.reduce((a, b) => a + b, 0) / n) + ') · bloque se corre hacia el lado de la pelota en ' + side + '/' + n;
});
test('Defensa: repliegue — si el rival supera la línea, los superados vuelven por detrás de la pelota', () => {
  let n = 0, gsMin = 9, rec = 0;
  for (let s = 1; s <= 10; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state, u = F7.u;
    S.team[0].forEach(p => { if (p.i > 0) F7.debug.place(p.k, 0.72 + p.i * 0.02, 0.15 + p.i * 0.11); }); // todo el azul adelantado
    F7.debug.place(10, 0.34, 0.5); F7.debug.give(10); run(F7, 1.0);
    rec += S.team[0].filter(p => p.intent === 'recover').length; run(F7, 3.0); n++;
    const brel = u.rel(0, S.ps[S.carrier].x), gs = S.team[0].filter(p => p.i > 0 && u.rel(0, p.x) < brel - 0.02).length; gsMin = Math.min(gsMin, gs);
    ok(gs >= 2, 'solo ' + gs + ' jugadores lograron ponerse detrás de la pelota en 4 s');
  }
  ok(rec > 0, 'ningún jugador entró en modo repliegue');
  return n + ' escenarios · mínimo de jugadores detrás de la pelota a los 4 s: ' + gsMin + ' · jugadores en "recover" (a 1 s) acumulados: ' + rec;
});

/* ================= 6. Transiciones ================= */
function lose(F7, atBall, bx, by, tk) { // el azul pierde la pelota: toma el rojo (como un robo real)
  const S = F7.state; F7.debug.place(3, bx, by); F7.debug.give(3); F7.debug.place(tk, bx + 0.04, by); F7.debug.give(tk); return S;
}
test('Transiciones: PÉRDIDA/RECUPERACIÓN al cambiar la posesión y paso a DEFENSA/ATAQUE a los 2.4 s', () => {
  for (let s = 1; s <= 8; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state;
    ok(S.phase[0].name === 'ATAQUE' && S.phase[1].name === 'DEFENSA', 'estado inicial');
    lose(F7, 0, 0.5, 0.5, 10); const t0 = S.stats.turnovers;
    ok(S.phase[0].name === 'PERDIDA' && S.phase[1].name === 'RECUPERACION', 'tras perder: ' + S.phase.map(p => p.name)); ok(t0 === 1, 'turnovers=' + t0);
    run(F7, 1.0); ok(S.phase[0].name === 'PERDIDA', 'a 1 s sigue en PÉRDIDA');
    run(F7, 1.8); ok(S.phase[0].name === 'DEFENSA' && S.phase[1].name === 'ATAQUE', 'a 2.8 s: ' + S.phase.map(p => p.name));
    F7.debug.place(3, 0.4, 0.5); F7.debug.give(3); // recuperación del azul
    ok(S.phase[0].name === 'RECUPERACION' && S.phase[1].name === 'PERDIDA', 'al recuperar: ' + S.phase.map(p => p.name));
  }
  return '8 ciclos pérdida→recuperación verificados';
});
test('Transiciones: la PÉRDIDA cambia al equipo entero (contrapresión si se pierde arriba con apoyo; repliegue si se pierde abajo)', () => {
  let cpUp = 0, cpDown = 0, pressUp = 0, retreatSpeed = 0, n = 0, dx = 0;
  for (let s = 1; s <= 10; s++) {
    // A) pérdida en campo rival con compañeros cerca
    const A = mk(s, { carrierHold: true, noTackle: true }), SA = A.state, u = A.u;
    SA.team[0].forEach(p => { if (p.i >= 3) A.debug.place(p.k, 0.70 + (p.i - 3) * 0.04, 0.35 + (p.i - 3) * 0.1); });
    lose(A, 0, 0.72, 0.5, 10); run(A, 0.3);
    if (SA.phase[0].cp === true) cpUp++; pressUp += SA.team[0].filter(p => p.intent === 'press').length >= 2 ? 1 : 0;
    const ax = SA.team[0].filter(p => p.i > 0 && p.intent !== 'press').reduce((a, p) => a + u.rel(0, p.tx), 0) / 3;
    // B) pérdida en campo propio
    const B = mk(s, { carrierHold: true, noTackle: true }), SB = B.state;
    lose(B, 0, 0.30, 0.5, 10); run(B, 0.3);
    if (SB.phase[0].cp === false) cpDown++; retreatSpeed += SB.team[0].filter(p => p.i > 0 && p.speedMul > 1.2).length >= 3 ? 1 : 0;
    const bx = SB.team[0].filter(p => p.i > 0 && p.intent !== 'contain').reduce((a, p) => a + u.rel(0, p.tx), 0) / 4;
    dx += ax - bx; n++;
  }
  ok(cpUp === n, 'contrapresión en ' + cpUp + '/' + n); ok(pressUp === n, 'doble presión en ' + pressUp + '/' + n);
  ok(cpDown === n, 'repliegue en ' + cpDown + '/' + n); ok(retreatSpeed === n, 'repliegue acelerado en ' + retreatSpeed + '/' + n);
  ok(dx / n > 0.1, 'diferencia de altura del bloque ' + fmt(dx / n));
  return 'pérdida arriba → contrapresión ' + cpUp + '/' + n + ' (2 presionando ' + pressUp + '/' + n + ') · pérdida abajo → repliegue ' + cpDown + '/' + n + ' (≥3 jugadores acelerados ' + retreatSpeed + '/' + n + ') · el bloque en contrapresión queda ' + fmt(dx / n) + ' más alto';
});
test('Transiciones: RECUPERACIÓN lanza a los atacantes (más rápidos y más adelantados que en ATAQUE estable) y el poseedor progresa más', () => {
  let faster = 0, higher = 0, n = 0, fwdReco = 0, fwdAtk = 0, dReco = 0, dAtk = 0, dd = 0;
  for (let s = 1; s <= 12; s++) {
    const mkRun = secs => { // mismo reparto; el rojo recupera en (0.5,0.5)
      const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state; lose(F7, 1, 0.5, 0.5, 10); lose(F7, 1, 0.5, 0.5, 10); run(F7, secs); return F7;
    };
    const R = mkRun(0.5), A = mkRun(2.8); // R: recién recuperado · A: 2.8 s después (fase ATAQUE)
    ok(R.state.phase[1].name === 'RECUPERACION' && A.state.phase[1].name === 'ATAQUE', 'fases: ' + R.state.phase[1].name + '/' + A.state.phase[1].name);
    const att = F7 => F7.state.team[1].filter(p => (p.role === 'EXT' || p.role === 'DEL' || p.role === 'MED') && p.k !== F7.state.carrier);
    if (att(R).every(p => p.speedMul > 1.1) && att(A).every(p => p.speedMul < 1.1)) faster++;
    const adv = F7 => att(F7).reduce((a, p) => a + F7.u.rel(1, p.tx), 0) / att(F7).length;
    dd += adv(R) - adv(A); if (adv(R) >= adv(A)) higher++; n++;
  }
  ok(faster === n, 'velocidad de transición en ' + faster + '/' + n); ok(higher >= n * 0.75, 'más adelantados en ' + higher + '/' + n);
  // efecto en la decisión del poseedor (sin presión encima, compañeros ya ubicados): más pases de progresión en RECUPERACIÓN
  let prog = { R: 0, A: 0 }; const tot = 60;
  for (let s = 1; s <= tot; s++) for (const ph of ['RECUPERACION', 'ATAQUE']) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state;
    S.team[0].forEach(p => { if (p.i > 0) F7.debug.place(p.k, 0.2 + p.i * 0.03, 0.2 + p.i * 0.1); });
    F7.debug.place(11, 0.5, 0.5); F7.debug.give(11); S.phase[1] = { name: ph, t: 0 }; run(F7, 0.2); S.phase[1] = { name: ph, t: 0 };
    const a = F7.tactics.decide(11); if (a.type === 'pass' && a.opt.forward > 0.06) prog[ph === 'RECUPERACION' ? 'R' : 'A']++;
  }
  ok(prog.R > prog.A * 1.5, 'pases de progresión RECUPERACIÓN ' + prog.R + ' vs ATAQUE ' + prog.A + ' (sin diferencia clara)');
  return 'atacantes más rápidos en ' + faster + '/' + n + ' · más adelantados en ' + higher + '/' + n + ' (Δ rel medio ' + fmt(dd / n) + ') · pases de progresión elegidos: RECUPERACIÓN ' + prog.R + '/' + tot + ' vs ATAQUE ' + prog.A + '/' + tot;
});

/* ================= 7. Pases, recepción, intercepción, robo, remates y goles ================= */
test('Pases: con línea libre siempre terminan en recepción coherente del receptor (todos los receptores, 12 semillas)', () => {
  let n = 0, maxT = 0;
  for (let s = 1; s <= 12; s++) for (let rk = 1; rk <= 6; rk++) {
    if (rk === 3) continue; // el 3 es el pasador
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state; park(F7, 1); blueAttackSetup(F7);
    const sent = F7.ball.launchPass(3, rk), pf = S.passFlight; ok(pf && pf.toK === rk, 'el pase no salió');
    let t = 0, sawReceive = false; while (S.passFlight && t < 3) { F7.match.update(dt); t += dt; if (S.ps[rk].intent === 'receive') sawReceive = true; }
    ok(S.owner === 0 && S.carrier === rk, 'pase ' + (4) + '→' + (rk + 1) + ' no llegó (semilla ' + s + ')'); ok(sawReceive, 'el receptor no salió a recibir');
    ok(F7.debug.counts.PASS_NOT_RECEIVED === 0, 'PASS_NOT_RECEIVED'); ok(S.stats.passesDone[0] === 1, 'passesDone'); n++; maxT = Math.max(maxT, t);
  }
  return n + ' pases completados · el más lento tardó ' + fmt(maxT) + ' s (límite de seguridad 2.2 s)';
});
test('Pases: un rival en la línea intercepta y cambian las fases; un pase seguro no se intercepta', () => {
  let inter = 0, n = 0;
  for (let s = 1; s <= 8; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state; park(F7, 1); blueAttackSetup(F7);
    F7.debug.place(5, 0.8, 0.5); // receptor lejos
    F7.debug.place(11, 0.65, 0.5); // rival justo en la línea
    S.opts.aiOff = true; F7.ball.launchPass(3, 5); let t = 0; while (S.passFlight && t < 2) { F7.match.update(dt); t += dt; }
    n++; if (S.owner === 1) { inter++; ok(S.stats.interceptions[1] === 1 && S.phase[1].name === 'RECUPERACION' && S.phase[0].name === 'PERDIDA', 'transición tras intercepción'); }
  }
  ok(inter === n, 'interceptó ' + inter + '/' + n);
  return 'intercepciones ' + inter + '/' + n + ' con rival en la línea de pase';
});
test('Robo: un presionador pegado al poseedor termina quitándole la pelota (y cambia la posesión)', () => {
  let stolen = 0, n = 0, avg = 0;
  for (let s = 1; s <= 15; s++) {
    const F7 = mk(s, { carrierHold: true }), S = F7.state; park(F7, 1); blueAttackSetup(F7); F7.debug.place(11, 0.56, 0.5);
    let t = 0; while (S.owner === 0 && t < 12) { F7.match.update(dt); t += dt; } n++; if (S.owner === 1) { stolen++; avg += t; }
  }
  ok(stolen === n, 'robos ' + stolen + '/' + n);
  return 'robos ' + stolen + '/' + n + ' · tiempo medio hasta el robo ' + fmt(avg / Math.max(1, stolen)) + ' s';
});
test('Remates y goles: tiro al rincón con arquero lejos es gol, suma al marcador y reinicia el saque (saca quien recibió el gol)', () => {
  let goals = 0, n = 0;
  for (let s = 1; s <= 12; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state; park(F7, 1);
    F7.debug.place(6, 0.80, 0.5); F7.debug.give(6); F7.debug.place(7, 0.93, 0.2); // arquero rojo fuera de la línea del tiro
    S.opts.aiOff = true; ok(F7.match.cmd.shoot() === true, 'el comando de remate no se ejecutó'); let t = 0; while (S.score[0] === 0 && t < 2) { F7.match.update(dt); t += dt; } n++;
    if (S.score[0] === 1) { goals++; ok(S.owner === 1 && S.carrier === 13 && Math.abs(S.ps[6].x - S.ps[6].hx) < 1e-9 && S.stats.goals[0] === 1, 'el reinicio tras el gol no dejó a los equipos en su lugar'); }
  }
  ok(goals === n, 'goles ' + goals + '/' + n);
  return 'goles ' + goals + '/' + n + ' · reinicio con saque del rojo verificado';
});
test('Remates: tiros al centro con el arquero (IA activa) en su lugar, desde 0.28 del arco: la mayoría se ataja/rechaza/bloquea', () => {
  let goals = 0, saves = 0, n = 0;
  for (let s = 1; s <= 30; s++) {
    const F7 = mk(s, { carrierHold: true, noTackle: true }), S = F7.state; park(F7, 1); F7.debug.place(6, 0.72, 0.5); F7.debug.give(6);
    F7.ball.shoot(6, { aimY: 0.5 });
    let t = 0; while (S.score[0] === 0 && (S.owner === -1 || S.owner === 0) && t < 2.5) { F7.match.update(dt); t += dt; } n++; if (S.score[0] > 0) goals++; else saves++;
  }
  ok(goals <= n * 0.4, 'goles ' + goals + '/' + n);
  return 'tiros al centro: no son gol ' + saves + '/' + n + ' · goles ' + goals + '/' + n;
});
test('Pelota muerta detrás de la línea de fondo (fuera del arco) la toma el arquero (saque de arco)', () => {
  const F7 = mk(1, { noTackle: true }), S = F7.state; F7.debug.place(3, 0.9, 0.5); F7.debug.give(3);
  S.opts.aiOff = true; S.passFlight = null; S.owner = -1; S.carrier = -1; S.ball.x = 0.99; // pelota suelta fuera del arco, detrás de la línea de fondo
  S.ball.x = 0.99; S.ball.y = 0.2; S.ball.vx = 0.2; S.ball.vy = 0; S.ball.kind = ''; S.ball.shot = false; S.lock = 0;
  F7.match.update(dt); ok(S.owner === 1 && S.carrier === 7, 'la pelota debía quedar en el arquero rojo');
  return 'saque de arco OK';
});
test('Comandos del usuario: seleccionar, mover, pase óptimo, filtrado, remate, presión y reinicio funcionan', () => {
  const F7 = mk(3, { noTackle: true }), S = F7.state, c = F7.match.cmd; S.opts.carrierHold = false;
  c.select(4); ok(S.selected === 4, 'select'); c.moveTo(0.40, 0.80); ok(S.userTarget && S.userTarget.k === 4, 'moveTo');
  let minD = 9; for (let i = 0; i < 180; i++) { F7.match.update(dt); minD = Math.min(minD, Math.hypot(S.ps[4].x - 0.40, S.ps[4].y - 0.80)); } // llega al punto indicado (luego vuelve a su zona)
  ok(minD < 0.03, 'el jugador seleccionado no llegó al punto: distancia mínima ' + fmt(minD, 3));
  const F2 = mk(4, { carrierHold: true, noTackle: true }), S2 = F2.state, c2 = F2.match.cmd; F2.debug.give(3); S2.selected = 3;
  ok(c2.choosePass(false) === true && S2.passFlight, 'pase óptimo'); run(F2, 2); ok(S2.owner === 0 && S2.carrier !== 3, 'el pase del usuario debía completarse');
  const F3 = mk(5, { carrierHold: true, noTackle: true }), S3 = F3.state, c3 = F3.match.cmd; park(F3, 1); F3.debug.place(6, 0.7, 0.5); F3.debug.give(6); S3.selected = 6;
  const r = c3.choosePass(true); ok(r === true && S3.passFlight && S3.passFlight.through, 'filtrado');
  const F4 = mk(6, { carrierHold: true, noTackle: true }), S4 = F4.state; F4.debug.place(6, 0.8, 0.5); F4.debug.give(6); S4.selected = 6; ok(F4.match.cmd.shoot() === true && S4.ball.shot, 'remate');
  const F5 = mk(7); const before = F5.state.userPress; F5.match.cmd.togglePress(); ok(F5.state.userPress === !before, 'presión'); F5.match.cmd.reset(); ok(F5.state.userPress === false && F5.state.seconds === 0, 'reinicio');
  return 'select/moveTo/pase/filtrado/remate/presión/reinicio OK';
});
test('Presión del usuario (botón PRESIÓN): activa segundo presionador y sube la línea', () => {
  const run1 = flag => { const F7 = mk(2, { carrierHold: true, noTackle: true }), S = F7.state; S.userPress = flag; F7.debug.place(10, 0.45, 0.5); F7.debug.give(10); run(F7, 3); return S.team[0].filter(p => p.intent === 'press').length; };
  const a = run1(false), b = run1(true); ok(a === 1 && b === 2, 'presionadores sin/con botón: ' + a + '/' + b);
  return 'presionadores sin botón ' + a + ' · con botón ' + b;
});

/* ================= 8. Diagnósticos: controles negativos (el problema plantado DEBE detectarse) ================= */
test('Diagnóstico GOALKEEPER_CARRY_TOO_LONG se dispara si el arquero se queda con la pelota', () => {
  const F7 = mk(1, { carrierHold: true, noTackle: true }); park(F7, 1); F7.debug.give(0); run(F7, 4.5);
  ok(F7.debug.counts.GOALKEEPER_CARRY_TOO_LONG >= 1, 'no se detectó'); return 'detectado ' + F7.debug.counts.GOALKEEPER_CARRY_TOO_LONG + ' vez/veces';
});
test('Diagnóstico PASS_NOT_RECEIVED se dispara si un pase no llega (pelota lenta)', () => {
  const F7 = mk(1, { carrierHold: true, noTackle: true }); park(F7, 1); blueAttackSetup(F7); F7.debug.place(5, 0.9, 0.1); F7.state.opts.aiOff = true;
  F7.ball.launchPass(3, 5, { speed: 0.05 }); run(F7, 3); ok(F7.debug.counts.PASS_NOT_RECEIVED >= 1, 'no se detectó'); return 'detectado';
});
test('Diagnóstico PLAYER_CHASING_BALL se dispara con 3 rivales presionando a la vez', () => {
  const F7 = mk(1, { carrierHold: true, noTackle: true }), S = F7.state; blueAttackSetup(F7); S.opts.aiOff = true;
  [8, 9, 10].forEach((k, i) => { const p = F7.debug.place(k, 0.58 + i * 0.01, 0.45 + i * 0.05); p.intent = 'press'; });
  run(F7, 2.5); ok(F7.debug.counts.PLAYER_CHASING_BALL >= 1, 'no se detectó'); return 'detectado';
});
test('Diagnóstico DEFENSE_SHAPE_BROKEN se dispara si nadie queda detrás de la pelota', () => {
  const F7 = mk(1, { carrierHold: true, noTackle: true }), S = F7.state; F7.debug.place(10, 0.3, 0.5); F7.debug.give(10); S.opts.aiOff = true;
  S.team[0].forEach(p => { if (p.i > 0) F7.debug.place(p.k, 0.8, 0.2 + p.i * 0.1); }); run(F7, 3.5); ok(F7.debug.counts.DEFENSE_SHAPE_BROKEN >= 1, 'no se detectó'); return 'detectado';
});
test('Diagnóstico TEAMMATE_NOT_SUPPORTING se dispara si todos los compañeros están encimados por rivales', () => {
  const F7 = mk(1, { carrierHold: true, noTackle: true }), S = F7.state; blueAttackSetup(F7); S.opts.aiOff = true;
  S.team[0].filter(p => p.i > 0 && p.k !== 3).forEach((p, i) => { F7.debug.place(p.k, 0.3 + i * 0.1, 0.15 + i * 0.15); F7.debug.place(8 + i, p.x + 0.015, p.y); });
  F7.debug.place(13, 0.54, 0.5); run(F7, 3); ok(F7.debug.counts.TEAMMATE_NOT_SUPPORTING >= 1, 'no se detectó'); return 'detectado';
});

/* ================= 9. Regresión de partido completo ================= */
test('Partidos completos (20 semillas × 5 min): sin excepciones ni NaN; diagnósticos dentro de lo esperado', () => {
  const tot = { GOALKEEPER_CARRY_TOO_LONG: 0, PASS_NOT_RECEIVED: 0, TEAMMATE_NOT_SUPPORTING: 0, DEFENSE_SHAPE_BROKEN: 0, PLAYER_CHASING_BALL: 0 };
  const sum = { passes: 0, done: 0, shots: 0, goals: 0, tack: 0, inter: 0, turn: 0, clears: 0, saves: 0 }; let secs = 0;
  for (let s = 1; s <= 20; s++) {
    const F7 = mk(s), S = F7.state; run(F7, 300); secs += 300;
    ok(F7.debug.errors.length === 0, 'excepción: ' + F7.debug.errors[0]);
    ok(S.ps.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) && Number.isFinite(S.ball.x) && Number.isFinite(S.ball.y), 'NaN o fuera de cancha');
    Object.keys(tot).forEach(k => { tot[k] += F7.debug.counts[k]; });
    sum.passes += S.stats.passes[0] + S.stats.passes[1]; sum.done += S.stats.passesDone[0] + S.stats.passesDone[1]; sum.shots += S.stats.shots[0] + S.stats.shots[1];
    sum.goals += S.score[0] + S.score[1]; sum.tack += S.stats.tackles[0] + S.stats.tackles[1]; sum.inter += S.stats.interceptions[0] + S.stats.interceptions[1]; sum.turn += S.stats.turnovers;
    sum.clears += S.stats.clears[0] + S.stats.clears[1]; sum.saves += S.stats.saves[0] + S.stats.saves[1];
  }
  const per10 = k => tot[k] / (secs / 600);
  ok(tot.GOALKEEPER_CARRY_TOO_LONG === 0, 'arquero con la pelota de más: ' + tot.GOALKEEPER_CARRY_TOO_LONG);
  ok(tot.PASS_NOT_RECEIVED === 0, 'pases no recibidos: ' + tot.PASS_NOT_RECEIVED);
  ok(per10('PLAYER_CHASING_BALL') < 2, 'persecución ' + fmt(per10('PLAYER_CHASING_BALL')) + ' cada 10 min');
  ok(per10('DEFENSE_SHAPE_BROKEN') < 5, 'forma defensiva rota ' + fmt(per10('DEFENSE_SHAPE_BROKEN')) + ' cada 10 min');
  ok(per10('TEAMMATE_NOT_SUPPORTING') < 40, 'sin apoyo ' + fmt(per10('TEAMMATE_NOT_SUPPORTING')) + ' cada 10 min');
  ok(sum.done / sum.passes > 0.8, 'pases completados ' + fmt(100 * sum.done / sum.passes, 0) + '%');
  const m = secs / 60;
  return 'diagnósticos cada 10 min: ' + Object.keys(tot).map(k => k + '=' + fmt(per10(k), 1)).join(', ') + ' · por minuto (ambos equipos): pases ' + fmt(sum.passes / m, 1) + ' (' + fmt(100 * sum.done / sum.passes, 0) + '% completos), remates ' + fmt(sum.shots / m, 1) + ', goles ' + fmt(sum.goals / m, 1) + ', atajadas ' + fmt(sum.saves / m, 1) + ', robos ' + fmt(sum.tack / m, 1) + ', intercepciones ' + fmt(sum.inter / m, 1) + ', despejes ' + fmt(sum.clears / m, 1) + ', cambios de posesión ' + fmt(sum.turn / m, 1);
});
test('Reinicio limpio: tras jugar, init(semilla) se comporta idéntico a un motor nuevo (sin estado residual, p. ej. enfriamiento de robo)', () => {
  const fresh = mk(7); run(fresh, 90);
  const dirty = mk(99); run(dirty, 200); dirty.match.init({ seed: 7 }); run(dirty, 90);
  ok(JSON.stringify(fresh.debug.snapshot()) === JSON.stringify(dirty.debug.snapshot()) && fresh.state.ps.every((p, i) => p.x === dirty.state.ps[i].x && p.y === dirty.state.ps[i].y), 'el motor reiniciado difiere de uno nuevo');
  return 'idéntico tras reiniciar';
});
test('Guardar/restaurar el partido: volver a jugar desde una copia da exactamente lo mismo', () => {
  const F7 = mk(5); run(F7, 10); const S = F7.state, snap = F7.match.snapshot(); run(F7, 30);
  const a = JSON.stringify(F7.debug.snapshot()) + JSON.stringify(S.ps.map(p => [p.x, p.y, p.tx, p.ty]));
  F7.match.restore(snap); run(F7, 30);
  const b = JSON.stringify(F7.debug.snapshot()) + JSON.stringify(S.ps.map(p => [p.x, p.y, p.tx, p.ty]));
  ok(a === b, 'restaurar y re-jugar dio otro resultado');
  const ref = mk(5); run(ref, 10); run(ref, 30); ok(JSON.stringify(ref.debug.snapshot()) + JSON.stringify(ref.state.ps.map(p => [p.x, p.y, p.tx, p.ty])) === a, 'difiere de un partido que nunca se restauró');
  return 'idéntico (40 s de partido)';
});
test('Reproducibilidad: misma semilla ⇒ mismo partido', () => {
  const a = mk(42), b = mk(42); run(a, 120); run(b, 120);
  ok(JSON.stringify(a.debug.snapshot()) === JSON.stringify(b.debug.snapshot()) && a.state.ps.every((p, i) => p.x === b.state.ps[i].x), 'dos corridas con la misma semilla difieren');
  return 'idéntico';
});

/* ---------- Resumen ---------- */
const failed = results.filter(r => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' pruebas OK' + (failed.length ? ' — FALLARON: ' + failed.map(f => f.name).join(' | ') : ''));
process.exit(failed.length ? 1 : 0);
