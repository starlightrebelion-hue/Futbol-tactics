/* tactics.js — evaluación táctica: pases (opciones y riesgo), remates, conducción, decisión del poseedor
 * y búsqueda de espacios/desmarques para los jugadores sin pelota.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;

  function nearestOpp(pt, team) { // rival más cercano a un punto/jugador
    let m = 9, q0 = null; const o = S.team[1 - team];
    for (let i = 0; i < o.length; i++) { const dd = u.d(o[i], pt); if (dd < m) { m = dd; q0 = o[i]; } }
    return { d: m, q: q0 };
  }
  function laneClear(a, b, team) { // distancia mínima de un rival al segmento de pase a→b
    let m = 0.5; const o = S.team[1 - team];
    for (let i = 0; i < o.length; i++) { const sd = u.segDist(o[i], a, b); if (sd < m) m = sd; }
    return m;
  }

  /* Opciones de pase desde fromK, ordenadas por puntuación.
   * Considera: progresión, distancia, riesgo de intercepción, marca sobre el receptor, apoyos cercanos y cambios de orientación. */
  function options(team, fromK, through) {
    if (fromK < 0) return [];
    const from = S.ps[fromK], dir = u.dir(team), arr = [], mates = S.team[team];
    S.team[team].forEach(p => {
      if (p === from || p.i === 0) return;
      const forward = (p.x - from.x) * dir, dist = u.d(from, p);
      let risk = 0;
      // el rival pegado al pasador no cuenta como bloqueo salvo que esté justo en la línea: se mide desde 0.05 del pasador
      // (y del receptor: el marcador que está detrás de él no cierra la línea; eso lo penaliza 'marked')
      const o0 = Math.min(0.05, dist * 0.3) / (dist || 1), o1 = Math.min(0.04, dist * 0.2) / (dist || 1);
      const st = { x: from.x + (p.x - from.x) * o0, y: from.y + (p.y - from.y) * o0 }, en = { x: p.x + (from.x - p.x) * o1, y: p.y + (from.y - p.y) * o1 };
      S.team[1 - team].forEach(q => { const seg = u.segDist(q, st, en); if (seg < 0.09) risk += (0.09 - seg) * 11; });
      risk = u.clamp(risk, 0, 1);
      const free = nearestOpp(p, team).d, marked = Math.max(0, 0.13 - free);
      let support = 0; mates.forEach(q => { if (q !== p && q !== from && u.d(q, p) < 0.18) support += 0.08; });
      const angle = Math.abs(p.y - from.y) * 0.18;
      const sw = (Math.abs(p.y - from.y) > 0.38 && risk < 0.2 && free > 0.12 && dist < 0.62) ? 0.16 : 0; // cambio de orientación
      const tb = through ? (forward > 0.05 ? 0.22 : -0.15) : 0;
      let score = forward * 1.6 - dist * 0.42 - risk * 1.8 - marked * 3.2 - angle + support + sw + tb + u.rel(team, p.x) * 0.2;
      if (u.rel(team, p.x) < 0.2 && risk > 0.1) score -= 0.3; // no se pasa por delante del propio arco con riesgo
      arr.push({ k: p.k, p, score, risk, forward, distance: dist, free, clear: laneClear(st, en, team) });
    });
    return arr.sort((a, b) => b.score - a.score);
  }

  // Calidad de remate desde la posición del jugador k
  function shotInfo(k) {
    const p = S.ps[k], team = p.team, gx = team === 0 ? 1 : 0, gd = Math.abs(gx - p.x), kp = S.ps[(1 - team) * 7];
    const goalPt = { x: gx, y: 0.5 }; let blockers = 0;
    S.team[1 - team].forEach(q => { if (q.i > 0 && u.segDist(q, p, goalPt) < 0.05) blockers++; });
    const angle = Math.abs(p.y - 0.5), pr = nearestOpp(p, team).d;
    const value = u.clamp(1 - gd / 0.34, 0, 1) * 1.1 - angle * 0.9 - blockers * 0.45 - (pr < 0.05 ? 0.2 : 0);
    const aimY = kp.y < 0.48 ? 0.575 : (kp.y > 0.52 ? 0.425 : (S.rnd() < 0.5 ? 0.575 : 0.425));
    return { value, gd, angle, blockers, aimY };
  }

  // Mejor punto de conducción (7 direcciones): prefiere espacio libre y progresión, evita bandas, retroceso y rivales
  function dribbleChoice(k) {
    const p = S.ps[k], team = p.team, dir = u.dir(team); let best = null;
    [-70, -45, -22, 0, 22, 45, 70].forEach(a => {
      const ang = a * Math.PI / 180, L = 0.10;
      const tx = u.clamp(p.x + dir * Math.cos(ang) * L, 0.04, 0.96), ty = u.clamp(p.y + Math.sin(ang) * L * 0.9, 0.07, 0.93);
      const pt = { x: tx, y: ty }; let free = nearestOpp(pt, team).d, crowd = 0;
      S.team[1 - team].forEach(q => { if (u.d(q, pt) < 0.12) crowd++; });
      free = Math.min(free, 0.22);
      const prog = (tx - p.x) * dir, ed = Math.min(ty, 1 - ty, tx, 1 - tx), edge = ed < 0.18 ? (0.18 - ed) * 8 : 0; // evita acorralarse en bandas/fondo
      const central = u.rel(team, tx) > 0.55 ? Math.abs(ty - 0.5) * 0.9 : 0; // en el último tercio se busca el carril central
      let score = free * 2 + prog * 3 - edge - central - crowd * 0.25 - (laneClear(p, pt, team) < 0.05 ? 0.3 : 0);
      if (!best || score > best.score) best = { tx, ty, score, free, prog };
    });
    return best;
  }

  /* Decide la acción del poseedor de campo: remate / pase / conducción / protección / despeje.
   * Las puntuaciones llevan ruido y dependen del rol, la presión, el tiempo de conducción y la fase (RECUPERACIÓN prioriza la progresión). */
  function decide(k) {
    const p = S.ps[k], team = p.team, prof = F7.roles.profile(p.role), relx = u.rel(team, p.x);
    const press = nearestOpp(p, team).d, carry = S.carryTime, ph = S.phase[team].name;
    const arr = options(team, k, false), cand = [], sh = shotInfo(k);
    if (sh.gd < 0.34 && Math.abs(p.y - 0.5) < 0.36) {
      let s = sh.value * prof.shootMul * 1.3 + (sh.gd < 0.3 ? 0.12 : 0); if (press < 0.06) s -= 0.1;
      cand.push({ type: 'shoot', score: s, aimY: sh.aimY });
    }
    arr.slice(0, 3).forEach((o, idx) => {
      let s = o.score * 0.9 + prof.passBias - idx * 0.12;
      if (press < 0.14) s += 0.38 * (1 - press / 0.14) + 0.12; // bajo presión se prioriza soltar la pelota
      if (ph === 'RECUPERACION' && o.forward > 0.07) s += 0.28;  // transición ofensiva: progresar rápido
      s -= o.risk * 0.7;
      cand.push({ type: 'pass', score: s, opt: o, through: o.forward > 0.12 && o.free > 0.1 && o.risk < 0.3 });
    });
    const dr = dribbleChoice(k);
    let ds = dr.score * prof.dribMul * 0.7 - Math.max(0, carry - prof.maxCarry * 0.4) * 0.6;
    if (press < 0.06) ds -= 0.45; else if (press < 0.09) ds -= 0.2;
    if (relx < 0.28 && dr.prog <= 0.01) ds -= 0.5;       // nunca conducir hacia atrás/zona propia peligrosa
    if (p.role === 'DEF' && relx > prof.maxRel && dr.prog > 0) ds -= 0.7; // el defensor no se proyecta conduciendo
    const gdist = Math.abs((team === 0 ? 1 : 0) - p.x);
    if (gdist < 0.22) ds -= (0.22 - gdist) * 5;          // no hay que seguir conduciendo hasta la línea de fondo: se remata o se combina
    if (ph === 'RECUPERACION' && dr.prog > 0.03) ds += 0.1;
    cand.push({ type: 'dribble', score: ds, tx: dr.tx, ty: dr.ty, prog: dr.prog });
    if (press < 0.09 && carry < 1.2) cand.push({ type: 'shield', score: 0.05 + (arr.length ? 0 : 0.4) });
    if ((relx < 0.22 && press < 0.11 && (!arr[0] || arr[0].risk > 0.45)) || (relx < 0.45 && carry > prof.hard && (!arr[0] || arr[0].risk > 0.7))) cand.push({ type: 'clear', score: 0.95 });
    cand.forEach(c => {
      if (F7.teamModel) c.score += F7.teamModel.actionBias(p, c);
      c.score += (S.rnd() - 0.5) * 0.24;
    });
    if (carry > prof.maxCarry) cand.forEach(c => { if (c.type === 'dribble' || c.type === 'shield') c.score -= 1.5; });
    if (carry > prof.hard) cand.forEach(c => { if (c.type === 'dribble' || c.type === 'shield') c.score -= 3; }); // límite duro: hay que soltarla
    cand.sort((a, b) => b.score - a.score);
    return cand[0];
  }

  /* Mejor punto de apoyo/desmarque para un jugador sin pelota, alrededor de su ancla.
   * Puntúa: línea de pase libre, libertad respecto a rivales, banda de distancia al poseedor, separación de compañeros,
   * cercanía al ancla de su rol, progresión, amplitud y amenaza de gol. Con histéresis para no temblar.
   * Candidatos ampliados (más diagonales y profundidades) para un motor de espacios más rico. */
  const OFFS = [
    [0, 0], [0.06, 0], [0.12, 0], [0.18, 0], [-0.06, 0], [-0.12, 0],
    [0, -0.08], [0, 0.08], [0, -0.16], [0, 0.16], [0, -0.24], [0, 0.24],
    [0.08, -0.10], [0.08, 0.10], [0.14, -0.14], [0.14, 0.14],
    [0.10, -0.20], [0.10, 0.20], [-0.08, -0.10], [-0.08, 0.10],
    [0.20, -0.08], [0.20, 0.08], [0.22, 0], [-0.14, -0.12], [-0.14, 0.12],
    [0.05, -0.28], [0.05, 0.28], [0.16, -0.22], [0.16, 0.22]
  ];

  function bestSpot(p, anchor, cpt, prof, ex) {
    const team = p.team, dir = u.dir(team); let best = null, bs = -1e9;
    const lo = ex.band[0], hi = ex.band[1], gx = team === 0 ? 1 : 0;
    const mates = S.team[team];

    OFFS.forEach(o => {
      const rx = u.clamp(u.rel(team, anchor.x) + o[0], prof.minRel, ex.maxRel != null ? ex.maxRel : prof.maxRel);
      const cp = { x: u.abs(team, rx), y: u.clamp(anchor.y + o[1], 0.07, 0.93) };

      const lane = laneClear(cpt, cp, team);
      const free = nearestOpp(cp, team).d;
      const dc = u.d(cp, cpt);

      // espacio libre + línea de pase
      let s = Math.min(lane, 0.15) * 7.5 + Math.min(free, 0.22) * 6.5;

      // distancia ideal al poseedor
      if (dc < lo) s -= (lo - dc) * 9.5;
      else if (dc > hi) s -= (dc - hi) * 3.8;

      // separación de compañeros (evitar amontonarse)
      mates.forEach(q => {
        if (q === p || q.k === S.carrier) return;
        const dd = Math.hypot(cp.x - q.tx, cp.y - q.ty);
        if (dd < 0.13) s -= (0.13 - dd) * 10;
      });

      // apego al ancla del rol
      s -= u.d(cp, anchor) * prof.anchorW;

      // progresión (más fuerte en RECUPERACIÓN)
      s += (cp.x - cpt.x) * dir * prof.fwd * (ex.fwdMul || 1);

      // amenaza de gol y amplitud
      s += prof.goal * (1 - Math.abs(gx - cp.x));
      s += prof.wide * Math.abs(cp.y - 0.5);

      // histéresis: preferir quedarse cerca del target actual
      if (u.d(cp, { x: p.tx, y: p.ty }) < 0.045) s += 0.28;

      // pequeño bonus si el punto está "a la espalda" de un rival (desmarque puro)
      const mk = nearestOpp(cp, team);
      if (mk.q && (cp.x - mk.q.x) * dir > 0.04 && free > 0.11) s += 0.18;

      if (s > bs) { bs = s; best = cp; }
    });
    return best;
  }

  /* Probabilidad de cada desenlace de la decisión del poseedor k: se repite la decisión N veces con un RNG aparte
   * (no altera el partido) y se cuentan resultados. Claves: 'pass:<k>', 'shoot', 'dribble', 'shield', 'clear'. */
  function outcomeKey(a) { if (a.type === 'pass') return 'pass:' + a.opt.k; return a.type === 'hold' ? 'shield' : a.type; }
  function decideProbs(k, N) {
    N = N || 300; const p = S.ps[k], saved = S.rnd, cnt = {};
    S.rnd = u.rng((S.seed ^ (k * 7919) ^ 0x9e3779b9) >>> 0);
    try { for (let i = 0; i < N; i++) { const a = p.role === 'ARQ' ? F7.roles.keeperDecision(k) : decide(k), key = outcomeKey(a); cnt[key] = (cnt[key] || 0) + 1; } }
    finally { S.rnd = saved; }
    Object.keys(cnt).forEach(key => { cnt[key] /= N; });
    return cnt;
  }

  F7.tactics = { nearestOpp, laneClear, options, shotInfo, dribbleChoice, decide, decideProbs, outcomeKey, bestSpot };
})(typeof window !== 'undefined' ? window : globalThis);
