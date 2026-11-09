/* ball.js — pelota: posesión, pases en vuelo, recepción, intercepciones, robos, remates, atajadas, despejes y goles. */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;
  const say = m => F7.hooks.say(m);

  function attach() { // el poseedor lleva la pelota pegada al pie
    const c = S.ps[S.carrier], b = S.ball;
    b.x = c.x + u.dir(S.owner) * 0.018; b.y = c.y; b.vx = b.vy = 0;
  }

  // Un jugador toma la pelota: reinicia el estado del poseedor y avisa a match.js para las transiciones.
  function gain(k) {
    const p = S.ps[k], b = S.ball;
    S.owner = p.team; S.carrier = k; S.passFlight = null; S.lock = 0;
    b.vx = b.vy = 0; b.shot = false; b.kind = '';
    S.carryTime = 0; S.possId++; S.carrierIntent = { type: 'control' };
    S.cd[p.team] = p.role === 'ARQ' ? 0.5 : 0.34 + S.rnd() * 0.2; // tiempo de control/lectura antes de decidir
    if (p.team === 0) { if (S.selected !== k) S.userTarget = null; S.selected = k; }
    S.ps.forEach(q => { q.think = ''; q.evalKey = -1; });
    F7.match.noteOwner(p.team);
    attach();
  }

  function release() { S.owner = -1; S.carrier = -1; S.passFlight = null; }

  // Pase con trayectoria hasta el receptor (V5): el receptor sale a recibir y la pelota lo busca.
  function launchPass(fromK, toK, o) {
    o = o || {}; const from = S.ps[fromK], to = S.ps[toK], team = from.team, b = S.ball;
    release();
    S.passFlight = { fromK, toK, team, elapsed: 0, through: !!o.through, speed: o.speed || 0.95 };
    b.x = from.x + u.dir(team) * 0.018; b.y = from.y; b.vx = b.vy = 0; b.shot = false; b.kind = 'pass';
    S.lock = 0; S.decisionCount++; S.stats.passes[team]++;
    say(o.message || ('Pase ejecutado hacia ' + to.role + ' #' + (to.i + 1) + '.'));
  }

  function noTouch(k, secs) { S.ball.noPickK = k; S.ball.noPickUntil = S.seconds + secs; }

  // Remate al arco rival, apuntando al lado contrario del arquero.
  function shoot(k, o) {
    o = o || {}; const p = S.ps[k], team = p.team, b = S.ball, gx = team === 0 ? 0.999 : 0.001;
    const kp = S.ps[(1 - team) * 7];
    let aimY = o.aimY;
    if (aimY == null) aimY = kp.y < 0.5 - 0.02 ? 0.5 + 0.075 : (kp.y > 0.5 + 0.02 ? 0.5 - 0.075 : (S.rnd() < 0.5 ? 0.575 : 0.425));
    const pr = F7.tactics.nearestOpp(p, team).d, err = (0.02 + 0.05 * Math.max(0, 0.08 - pr) / 0.08) * (S.rnd() * 2 - 1);
    aimY = u.clamp(aimY + err, 0.34, 0.66);
    const dx = gx - p.x, dy = aimY - p.y, len = Math.hypot(dx, dy) || 1, sp = 0.85 + S.rnd() * 0.15;
    release(); S.passFlight = null;
    b.x = p.x + u.dir(team) * 0.018; b.y = p.y; b.vx = dx / len * sp; b.vy = dy / len * sp;
    b.shot = true; b.kind = 'shot'; b.by = team; b.saveDone = false; b.blocked = new Set();
    S.lock = 0.1; S.decisionCount++; S.stats.shots[team]++; noTouch(k, 0.4);
    say(o.message || (team === 0 ? 'IA azul: remate en zona de finalización.' : 'CPU: remate por zona de finalización.'));
  }

  // Despeje largo hacia un costado/adelante, lejos de los rivales.
  function clear(k, o) {
    o = o || {}; const p = S.ps[k], team = p.team, b = S.ball;
    let best = null, bs = -9;
    [0.14, 0.5, 0.86].forEach(y => {
      const tgt = { x: u.abs(team, 0.66), y }; let s = -Math.abs(y - p.y) * 0.2 + (y === 0.5 ? -0.15 : 0);
      S.team[1 - team].forEach(q => { s += Math.min(0.3, u.d(q, tgt)); });
      if (s > bs) { bs = s; best = tgt; }
    });
    const dx = best.x - p.x, dy = best.y - p.y, len = Math.hypot(dx, dy) || 1, kf = -Math.log(0.42), v0 = len * kf * 1.05;
    release();
    b.x = p.x + u.dir(team) * 0.018; b.y = p.y; b.vx = dx / len * v0; b.vy = dy / len * v0; b.shot = false; b.kind = 'clear';
    S.lock = 0.1; S.decisionCount++; S.stats.clears[team]++; noTouch(k, 0.5);
    say(o.message || ((team === 0 ? 'IA azul' : 'CPU') + ': despeje largo para sacarse la presión.'));
  }

  /* ---------- Robo: un rival pegado al poseedor puede quitarle la pelota ---------- */
  function tackle(dt) {
    const c = S.ps[S.carrier]; if (S.opts.noTackle || S.seconds < (S.tackleCdUntil || 0)) return;
    let tk = null, bd = 0.054; // la separación mínima entre rivales es 0.047: el robo se evalúa a esa distancia de contacto
    S.team[1 - c.team].forEach(q => { const dd = u.d(q, c); if (dd < (q.role === 'ARQ' ? 0.058 : bd)) { bd = dd; tk = q; } });
    if (!tk) return;
    const shield = S.carrierIntent && S.carrierIntent.type === 'shield';
    let rate = (tk.intent === 'press' ? 0.6 : 0.3) * (shield ? 0.45 : 1);
    if (S.rnd() < 1 - Math.exp(-rate * dt)) {
      S.tackleCdUntil = S.seconds + 0.7; S.stats.tackles[tk.team]++;
      gain(tk.k);
      say(tk.team === 0 ? 'Recuperación: el #' + (tk.i + 1) + ' azul roba la pelota.' : 'El rival #' + (tk.i + 1) + ' roba la pelota.');
    }
  }

  /* ---------- Pase en vuelo ---------- */
  function flight(dt) {
    const f = S.passFlight, rcv = S.ps[f.toK], b = S.ball, team = f.team;
    f.elapsed += dt;
    const tx = u.clamp(rcv.x + u.dir(team) * 0.018, 0.025, 0.975), ty = rcv.y, dx = tx - b.x, dy = ty - b.y, dist = Math.hypot(dx, dy);
    if (dist < 0.034) { // recepción
      S.stats.passesDone[team]++; gain(f.toK);
      say((team === 0 ? 'Pase completado: ' : 'CPU recibe: ') + rcv.role + ' #' + (rcv.i + 1) + '.'); return;
    }
    const step = Math.min(dist, f.speed * dt); b.x += dx / dist * step; b.y += dy / dist * step;
    let ik = -1, nearest = 0.027;
    S.team[1 - team].forEach(q => { const dd = u.d(q, b); if (dd < nearest) { nearest = dd; ik = q.k; } });
    if (ik >= 0) {
      const q = S.ps[ik]; S.stats.interceptions[q.team]++; gain(ik);
      say(team === 0 ? 'Pase interceptado por el rival #' + (q.i + 1) + '.' : 'Interceptaste el pase: el #' + (q.i + 1) + ' azul recupera.');
    } else if (f.elapsed > 2.2) { // salvaguarda: no debería ocurrir; si ocurre queda registrado
      F7.debug.report('PASS_NOT_RECEIVED', 'pase de #' + (S.ps[f.fromK].i + 1) + ' a #' + (rcv.i + 1) + ' no llegó en 2.2 s', f.fromK);
      S.stats.passesDone[team]++; gain(f.toK); say('Recepción de emergencia del #' + (rcv.i + 1) + '.');
    }
  }

  /* ---------- Remate en vuelo: bloqueos y atajadas ---------- */
  function shotEvents() {
    const b = S.ball, kp = S.ps[(1 - b.by) * 7];
    if (!b.saveDone && u.d(kp, b) < 0.075) {
      b.saveDone = true; const gap = u.d(kp, b), r = S.rnd(), pc = gap < 0.04 ? 0.62 : 0.34;
      if (r < pc) { S.stats.saves[kp.team]++; gain(kp.k); say('¡Atajada del arquero!'); return; }
      if (r < pc + 0.2) { S.stats.saves[kp.team]++; b.shot = false; b.vx = -b.vx * 0.35; b.vy = (S.rnd() - 0.5) * 0.7; S.lock = 0.18; b.noPickK = -1; say('Rechazo del arquero.'); return; }
    }
    for (const q of S.team[1 - b.by]) {
      if (q.i === 0 || b.blocked.has(q.k)) continue;
      if (u.d(q, b) < 0.03) {
        b.blocked.add(q.k);
        if (S.rnd() < 0.4) { b.shot = false; b.vx *= -0.25; b.vy = (S.rnd() - 0.5) * 0.5; S.lock = 0.1; b.noPickK = -1; say('Remate bloqueado.'); return; }
      }
    }
  }

  function checkGoal() {
    const b = S.ball, sp = Math.hypot(b.vx, b.vy), right = b.x > 0.987, left = b.x < 0.013;
    if (!right && !left) return false;
    if (b.y > 0.39 && b.y < 0.61 && sp > 0.12) { F7.match.goal(right ? 0 : 1); return true; }
    gain(right ? 7 : 0); say('Saque de arco.'); return true; // pelota muerta detrás de la línea: la toma el arquero
  }

  function pickup() {
    const b = S.ball, sp = Math.hypot(b.vx, b.vy), best = sp > 0.10 ? 0.034 : 0.048;
    let n = -1, bd = best;
    S.ps.forEach(p => {
      if (p.k === b.noPickK && S.seconds < b.noPickUntil) return;
      const dd = u.d(p, b) - (p.i === 0 ? 0.02 : 0); // el arquero llega más lejos
      if (dd < bd) { bd = dd; n = p.k; }
    });
    if (n >= 0) { gain(n); say(S.owner === 0 ? 'Azul controla la pelota: buscará apoyo y pase.' : 'El rival controla la pelota y reorganiza sus apoyos.'); }
  }

  function loose(dt) {
    const b = S.ball, sp = Math.hypot(b.vx, b.vy);
    if (sp > 0.01) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      const m = Math.pow(b.shot ? 0.55 : (b.kind === 'clear' ? 0.42 : 0.22), dt); b.vx *= m; b.vy *= m;
      b.x = u.clamp(b.x, 0.005, 0.995); b.y = u.clamp(b.y, 0.02, 0.98);
    }
    if (b.shot && sp < 0.09) b.shot = false;
    if (b.shot) { shotEvents(); if (S.owner >= 0) return; }
    if (checkGoal()) return;
    if (!b.shot && S.lock <= 0) pickup();
  }

  function update(dt) {
    if (S.carrier >= 0 && S.owner !== -1 && !S.passFlight) { tackle(dt); if (S.owner >= 0 && S.carrier >= 0) attach(); }
    else if (S.passFlight) flight(dt);
    else loose(dt);
  }

  F7.ball = { attach, gain, launchPass, shoot, clear, update };
})(typeof window !== 'undefined' ? window : globalThis);
