/* debug.js — diagnóstico y herramientas de prueba de la IA.
 * No depende de ningún otro módulo (usa F7.state / F7.match / F7.tactics en tiempo de ejecución, nunca al cargar).
 * Códigos de diagnóstico:
 *   GOALKEEPER_CARRY_TOO_LONG · PASS_NOT_RECEIVED · TEAMMATE_NOT_SUPPORTING · DEFENSE_SHAPE_BROKEN · PLAYER_CHASING_BALL
 */
(function (g) {
  'use strict';
  const F7 = g.F7 = g.F7 || {};
  const CODES = ['GOALKEEPER_CARRY_TOO_LONG', 'PASS_NOT_RECEIVED', 'TEAMMATE_NOT_SUPPORTING', 'DEFENSE_SHAPE_BROKEN', 'PLAYER_CHASING_BALL'];
  const dbg = F7.debug = { CODES, counts: {}, log: [], errors: [], maxLog: 400, cool: {}, timers: null, verbose: false };
  let acc = 0;

  dbg.reset = function () {
    CODES.forEach(c => { dbg.counts[c] = 0; });
    dbg.log.length = 0; dbg.errors.length = 0; dbg.cool = {};
    dbg.timers = { kc: 0, sup: [0, 0], shape: [0, 0], chase: [0, 0] };
    acc = 0;
  };
  dbg.reset();

  // Registra un diagnóstico (con enfriamiento de 2.5 s de partido por código+clave para no inundar el log).
  dbg.report = function (code, info, key) {
    const S = F7.state, t = (S && S.seconds) || 0, ck = code + ':' + (key == null ? '' : key);
    if (dbg.cool[ck] != null && t - dbg.cool[ck] < 2.5) return false;
    dbg.cool[ck] = t;
    dbg.counts[code] = (dbg.counts[code] || 0) + 1;
    dbg.log.push({ t: +t.toFixed(2), code, info: info || '' });
    if (dbg.log.length > dbg.maxLog) dbg.log.shift();
    if (dbg.verbose && g.console) console.warn('[F7]', code, info || '');
    return true;
  };

  dbg.error = function (e) {
    const msg = (e && e.stack) ? e.stack : String(e);
    if (dbg.errors.length < 50) dbg.errors.push(msg);
    if (g.console) console.error('[F7 error]', msg);
  };

  // Comprobaciones periódicas (cada 0.25 s de partido) sobre el estado real del partido.
  dbg.check = function (dt) {
    const S = F7.state;
    if (!S || !S.ps || !F7.tactics) return;
    acc += dt; if (acc < 0.25) return;
    const step = acc; acc = 0;
    const u = F7.u, T = dbg.timers, poss = F7.match.possTeam();

    // 1) Arquero con la pelota demasiado tiempo / lejos de su arco
    if (S.owner >= 0 && S.carrier >= 0 && S.ps[S.carrier].role === 'ARQ') {
      const c = S.ps[S.carrier]; T.kc += step;
      if (T.kc > 3.0 || u.rel(c.team, c.x) > 0.30) dbg.report('GOALKEEPER_CARRY_TOO_LONG', 'ARQ ' + (c.team ? 'rojo' : 'azul') + ' con la pelota ' + T.kc.toFixed(1) + 's', c.team);
    } else T.kc = 0;

    for (let t = 0; t < 2; t++) {
      const field = S.team[t].filter(p => p.i > 0);
      if (poss === t) {
        // 2) Poseedor presionado sin ninguna opción de pase razonable
        T.chase[t] = 0; T.shape[t] = 0;
        if (S.owner === t && S.carrier >= 0 && !S.passFlight) {
          const c = S.ps[S.carrier], pr = F7.tactics.nearestOpp(c, t).d;
          const open = F7.tactics.options(t, c.k, false).filter(o => o.risk < 0.5 && o.free > 0.07 && o.distance < 0.55).length;
          if (pr < 0.12 && open === 0) T.sup[t] += step; else T.sup[t] = 0;
          if (T.sup[t] > 1.2) dbg.report('TEAMMATE_NOT_SUPPORTING', (t ? 'rojo' : 'azul') + ': ' + c.role + ' #' + (c.i + 1) + ' sin opciones', t);
        }
      } else {
        T.sup[t] = 0;
        const ph = S.phase[t], grace = ph.name === 'PERDIDA' && ph.t < 1.8;
        const ref = (S.owner === 1 - t && S.carrier >= 0) ? S.ps[S.carrier] : S.ball;
        const brel = u.rel(t, ref.x);
        // 3) Varios jugadores persiguiendo la pelota a la vez (los marcadores y coberturas no cuentan: tienen una tarea).
        //    Se permite 1 presionador (2 con contrapresión o presión colectiva del usuario).
        const allowed = ((ph.name === 'PERDIDA' && ph.cp) || (t === 0 && S.userPress)) ? 2 : 1;
        const chasers = field.filter(p => (p.intent === 'press' || p.intent === 'chase') && u.d(p, S.ball) < 0.30).length;
        const crowd = field.filter(p => u.d(p, S.ball) < 0.09).length;
        if ((chasers > allowed || crowd >= 4) && !grace && poss !== -1) T.chase[t] += step; else T.chase[t] = 0;
        if (T.chase[t] > 1.0) dbg.report('PLAYER_CHASING_BALL', (t ? 'rojo' : 'azul') + ': ' + chasers + ' presionando, ' + crowd + ' encima de la pelota', t);
        // 4) Estructura defensiva rota: nadie detrás de la pelota cerca de su arco, o equipo demasiado estirado
        const goalSide = field.filter(p => u.rel(t, p.x) < brel - 0.02).length;
        const rels = field.map(p => u.rel(t, p.x)), depth = Math.max.apply(null, rels) - Math.min.apply(null, rels);
        const broken = !grace && ((brel < 0.5 && goalSide < 1) || depth > 0.62);
        if (poss !== -1 && broken) T.shape[t] += step; else T.shape[t] = 0;
        if (T.shape[t] > 1.5) dbg.report('DEFENSE_SHAPE_BROKEN', (t ? 'rojo' : 'azul') + ': detrás de la pelota=' + goalSide + ' profundidad=' + depth.toFixed(2), t);
      }
    }
  };

  /* ---------- Herramientas de prueba (consola del navegador y tests de Node) ---------- */
  dbg.sim = function (seconds, dt) { // avanza el partido de forma determinista
    dt = dt || 1 / 60; const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) F7.match.update(dt);
  };
  dbg.place = function (k, x, y) { const p = F7.state.ps[k]; p.x = p.tx = x; p.y = p.ty = y; return p; };
  dbg.give = function (k) { // entrega la pelota al jugador k
    const S = F7.state, p = S.ps[k]; S.ball.x = p.x; S.ball.y = p.y; F7.ball.gain(k, 'debug'); return p;
  };
  dbg.snapshot = function () {
    const S = F7.state;
    return {
      t: +S.seconds.toFixed(2), owner: S.owner, carrier: S.carrier, phase: [S.phase[0].name, S.phase[1].name], score: S.score.slice(),
      stats: JSON.parse(JSON.stringify(S.stats)), counts: Object.assign({}, dbg.counts)
    };
  };

  /* ---------- Panel visual opcional (tecla D o ?debug) ---------- */
  dbg.panel = function (on) {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('f7-debug');
    if (on === undefined) on = !el;
    if (!on) { if (el) { el.remove(); clearInterval(dbg._iv); } return; }
    if (el) return;
    el = document.createElement('pre'); el.id = 'f7-debug';
    el.style.cssText = 'position:fixed;right:6px;bottom:6px;z-index:99;max-width:92vw;max-height:45vh;overflow:auto;margin:0;padding:8px;background:#000c;color:#9fe;font:11px/1.35 monospace;border:1px solid #3a6;border-radius:8px;pointer-events:none';
    document.body.appendChild(el);
    dbg._iv = setInterval(function () {
      const S = F7.state; if (!S || !S.ps) return;
      const sn = dbg.snapshot();
      el.textContent = 'F7 DEBUG  t=' + sn.t + 's  seed=' + S.seed + '\nfases azul/rojo: ' + sn.phase.join(' / ') + '\n' +
        CODES.map(c => c + ': ' + dbg.counts[c]).join('\n') + '\n' +
        'pases ' + S.stats.passesDone.join('/') + ' de ' + S.stats.passes.join('/') + ' · remates ' + S.stats.shots.join('/') +
        ' · robos ' + S.stats.tackles.join('/') + ' · intercep. ' + S.stats.interceptions.join('/') + '\n' +
        dbg.log.slice(-6).map(l => l.t + 's ' + l.code + ' ' + l.info).join('\n') +
        (dbg.errors.length ? '\nERRORES: ' + dbg.errors.length : '');
    }, 400);
  };

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', function (ev) { dbg.error(ev.error || ev.message); });
    window.addEventListener('keydown', function (ev) { if (ev.key === 'd' || ev.key === 'D') dbg.panel(); });
    if (/[?&]debug/.test(window.location.search)) window.addEventListener('DOMContentLoaded', function () { dbg.panel(true); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
