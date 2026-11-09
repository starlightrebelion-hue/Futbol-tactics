/* ai.js — decide qué hace cada jugador en cada momento: coordina ataque (roles.js/tactics.js) y defensa (defense.js),
 * ejecuta las decisiones del poseedor y atiende pelota dividida y recepción de pases. */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state, setT = u.setT;
  const who = t => (t === 0 ? 'IA azul' : 'CPU');
  const say = (t, m) => F7.hooks.say(who(t) + ': ' + m);

  function carrierPlan(p) {
    const ci = S.carrierIntent, dir = u.dir(p.team);
    if (ci.type === 'dribble' && S.seconds < ci.until) setT(p, ci.tx, ci.ty, 'dribble', '➜', 1);
    else if (ci.type === 'shield') setT(p, p.x + dir * 0.006, p.y, 'shield', '◉', 1);
    else setT(p, p.x, p.y, 'control', '', 1);
  }
  function receivePlan(p) { // el receptor sale a buscar la pelota y se orienta hacia ella
    const b = S.ball; setT(p, b.x, b.y, 'receive', '◎', 1.05); p.face = Math.atan2(b.y - p.y, b.x - p.x);
  }
  function followPass(p) { // pase y desmarque: el pasador se proyecta hacia adelante
    const dir = u.dir(p.team); setT(p, p.x + dir * 0.08, p.y + (p.y < 0.5 ? 0.05 : -0.05), 'follow', '➜', 1.05);
  }

  function planAttack(t, dt) {
    const mine = S.team[t], f = S.passFlight, own = (S.owner === t && S.carrier >= 0) ? S.ps[S.carrier] : null;
    const cpt = own || (f && f.team === t ? S.ps[f.toK] : S.ball);
    const mode = S.phase[t].name === 'RECUPERACION' ? 'break' : 'attack';
    mine.forEach(p => {
      if (own && p === own) { carrierPlan(p); return; }
      if (f && f.team === t) {
        if (p.k === f.toK) { receivePlan(p); return; }
        if (p.k === f.fromK && p.role !== 'DEF' && p.role !== 'ARQ') { followPass(p); return; }
      }
      if (p.i === 0) { const kt = F7.defense.keeperTarget(p, S.ball); setT(p, kt.x, kt.y, kt.intent, '', kt.sm); return; }
      p.retarget -= dt;
      if (p.retarget > 0 && p.evalKey === S.possId && p.mode === mode) return; // mantiene el objetivo (evita temblores)
      const r = F7.roles.offBall(p, cpt, mode, own);
      setT(p, r.x, r.y, r.intent, r.think, r.sm);
      p.retarget = 0.35 + S.rnd() * 0.25; p.evalKey = S.possId; p.mode = mode;
    });
  }

  function assignChasers() { // pelota dividida: el más cercano de cada equipo va a buscarla
    for (let t = 0; t < 2; t++) {
      let best = null, bd = 9;
      S.team[t].forEach(p => {
        if (p.i === 0 && u.rel(t, S.ball.x) > 0.16) return;
        const dd = u.d(p, S.ball); if (dd < bd) { bd = dd; best = p; }
      });
      if (best) setT(best, S.ball.x + S.ball.vx * 0.3, S.ball.y + S.ball.vy * 0.3, 'chase', '●', 1.05);
    }
  }

  function execute(t, p, a) {
    const cdTime = () => 0.4 + S.rnd() * 0.25;
    S.decisionSeq = (S.decisionSeq || 0) + 1; S.lastDecision = { type: a.type === 'hold' ? 'shield' : a.type, k: p.k, to: a.opt ? a.opt.k : null }; // para el entrenador
    switch (a.type) {
      case 'pass': {
        const o = a.opt, to = S.ps[o.k], press = F7.tactics.nearestOpp(p, t).d;
        let msg;
        if (a.keeper) msg = 'el arquero juega corto con el #' + (to.i + 1) + '.';
        else if (press < 0.125) msg = 'el #' + (p.i + 1) + ' descarga hacia el #' + (to.i + 1) + ' para evitar la presión.';
        else if (Math.abs(to.y - p.y) > 0.38) msg = 'cambio de orientación al #' + (to.i + 1) + '.';
        else if (o.forward > 0.06) msg = 'pase de progresión al #' + (to.i + 1) + '.';
        else msg = 'pase de apoyo al #' + (to.i + 1) + '.';
        F7.ball.launchPass(p.k, o.k, { through: !!a.through, message: who(t) + ': ' + msg });
        break;
      }
      case 'shoot': F7.ball.shoot(p.k, { aimY: a.aimY }); break;
      case 'clear': F7.ball.clear(p.k); break;
      case 'dribble': S.carrierIntent = { type: 'dribble', tx: a.tx, ty: a.ty, until: S.seconds + 0.6 }; S.cd[t] = cdTime(); break;
      case 'shield': S.carrierIntent = { type: 'shield' }; S.cd[t] = 0.3; break;
      default: S.carrierIntent = { type: 'control' }; S.cd[t] = 0.25; // hold
    }
  }

  function carrierDecision(t, dt) {
    if (S.owner !== t || S.carrier < 0 || S.passFlight) return;
    S.cd[t] -= dt; if (S.cd[t] > 0) return;
    if (S.opts.carrierHold) { S.cd[t] = 0.3; return; }
    const p = S.ps[S.carrier];
    let a;
    if (p.role === 'ARQ') {
      a = F7.roles.keeperDecision(p.k);
      if (a.type === 'hold' && S.carryTime > F7.roles.profile('ARQ').hard) a = { type: 'clear' }; // límite duro
    } else a = F7.tactics.decide(p.k);
    execute(t, p, a);
  }

  function plan(dt) {
    if (S.opts.aiOff) return;
    const poss = F7.match.possTeam();
    for (let t = 0; t < 2; t++) {
      if (poss === t || (poss === -1 && S.lastOwner === t)) planAttack(t, dt); else F7.defense.plan(t);
    }
    if (S.owner === -1 && !S.passFlight) assignChasers();
    const h = S.hold; // entrenador: mantiene al jugador del usuario en el punto elegido
    if (h && h.k !== S.carrier) { const p = S.ps[h.k]; p.tx = h.x; p.ty = h.y; p.intent = 'user'; p.speedMul = 1; }
    const ut = S.userTarget;
    if (ut && ut.k === S.selected) { const p = S.ps[ut.k]; p.tx = ut.x; p.ty = ut.y; p.intent = 'user'; }
    carrierDecision(0, dt); carrierDecision(1, dt);
  }

  F7.ai = { plan, execute, carrierDecision };
})(typeof window !== 'undefined' ? window : globalThis);
