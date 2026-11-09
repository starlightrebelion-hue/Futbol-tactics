/* roles.js — comportamiento por posición (ARQ, DEF, MED, EXT, DEL): perfiles, anclas dinámicas,
 * movimiento sin pelota en ataque y distribución del arquero. Los roles son sesgos, no reglas rígidas. */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;

  // minRel/maxRel: zona permitida (0 = arco propio, 1 = arco rival). shootMul/dribMul/passBias: sesgos del poseedor.
  // anchorW: apego a la posición base · fwd: gusto por estar por delante de la pelota · wide/goal: amplitud y amenaza.
  const PROFILE = {
    ARQ: { minRel: 0.03, maxRel: 0.13, anchorW: 3, fwd: 0, wide: 0, goal: 0, shootMul: 0, dribMul: 0, passBias: 0.2, maxCarry: 1.6, hard: 2.2, band: [0.10, 0.30], follow: 0.15 },
    DEF: { minRel: 0.12, maxRel: 0.52, anchorW: 2.0, fwd: 0.35, wide: 0.12, goal: 0, shootMul: 0.5, dribMul: 0.5, passBias: 0.15, maxCarry: 2.4, hard: 3.4, band: [0.12, 0.30], follow: 0.55 },
    MED: { minRel: 0.22, maxRel: 0.80, anchorW: 1.25, fwd: 0.85, wide: 0.22, goal: 0.22, shootMul: 0.9, dribMul: 0.9, passBias: 0.1, maxCarry: 2.8, hard: 3.8, band: [0.12, 0.33], follow: 0.82 },
    EXT: { minRel: 0.28, maxRel: 0.94, anchorW: 0.9, fwd: 1.15, wide: 1.4, goal: 0.32, shootMul: 1.0, dribMul: 1.15, passBias: 0.0, maxCarry: 3.2, hard: 4.2, band: [0.13, 0.38], follow: 1.05 },
    DEL: { minRel: 0.38, maxRel: 0.96, anchorW: 0.7, fwd: 1.55, wide: -0.35, goal: 0.85, shootMul: 1.25, dribMul: 1.0, passBias: -0.05, maxCarry: 3.2, hard: 4.2, band: [0.14, 0.40], follow: 1.05 }
  };
  const profile = r => PROFILE[r];

  // Ancla dinámica: la posición base se desplaza con la pelota según el rol (el bloque sube y baja junto).
  // Un poco más de variación lateral para que no se vea todo el equipo "en bloque rígido".
  function anchor(p, boost) {
    const prof = PROFILE[p.role], brel = u.rel(p.team, S.ball.x);
    let rx = u.rel(p.team, p.hx) + (brel - 0.5) * prof.follow + (boost || 0);
    rx = u.clamp(rx, prof.minRel, prof.maxRel);
    // ligera variación personal (estable por jugador) para personalidad
    const pers = ((p.k * 17) % 11 - 5) * 0.006;
    return {
      x: u.abs(p.team, rx),
      y: u.clamp(0.5 + (p.hy - 0.5) * 0.92 + (S.ball.y - 0.5) * 0.28 + pers, 0.08, 0.92)
    };
  }

  /* Movimiento sin pelota con el equipo en ataque. mode: 'attack' | 'break' (RECUPERACIÓN: salir rápido hacia adelante). */
  function offBall(p, cpt, mode, car) {
    const team = p.team, dir = u.dir(team), prof = PROFILE[p.role], brk = mode === 'break';
    const brel = u.rel(team, cpt.x), buildUp = brel < 0.35;
    const pr = car ? F7.tactics.nearestOpp(car, team).d : 1;
    let band = buildUp ? [0.10, 0.26] : prof.band;
    if (pr < 0.12) band = [0.08, 0.19];          // bajo presión: apoyos más cortos

    const anc = anchor(p, brk && p.role !== 'DEF' ? 0.07 : 0);
    const ex = { band, maxRel: prof.maxRel, fwdMul: brk && p.role !== 'DEF' ? 2.3 : 1 };

    if (p.role === 'DEF') {
      // defensores: dan salida y mantienen base detrás de la pelota
      ex.maxRel = Math.min(prof.maxRel, Math.max(prof.minRel, brel - 0.05));
      if (buildUp) anc.y = p.hy < 0.5 ? 0.23 : 0.77;
    } else if (p.role === 'EXT') {
      // extremo: amplitud + solapamiento (se proyecta por fuera y un poco por delante)
      const side = p.hy < 0.5 ? 0.11 : 0.89;
      anc.y = side;
      anc.x = u.abs(team, u.clamp(Math.max(u.rel(team, anc.x), brel + 0.10), prof.minRel, prof.maxRel));
      // solapamiento cuando hay espacio: se mete un poco más adentro o se proyecta
      if (pr > 0.14 && brel > 0.42) {
        anc.y = p.hy < 0.5 ? 0.18 : 0.82;
        anc.x = u.abs(team, u.clamp(brel + 0.14, prof.minRel, prof.maxRel));
      }
    } else if (p.role === 'DEL') {
      // delantero: profundidad / espalda + check-run cuando está marcado
      anc.x = u.abs(team, u.clamp(Math.max(u.rel(team, anc.x), brel + 0.13), prof.minRel, prof.maxRel));
      anc.y = u.clamp(0.5 + (p.hy - 0.5) * 0.45, 0.22, 0.78);
      const mk = F7.tactics.nearestOpp(p, team);
      if (mk.d < 0.11) {
        // check-run: se mueve en diagonal para generar espacio
        anc.y = u.clamp(anc.y + (p.hy < 0.5 ? 0.12 : -0.12), 0.18, 0.82);
        anc.x = u.abs(team, u.clamp(brel + 0.06, prof.minRel, prof.maxRel));
      }
    } else if (p.role === 'MED') {
      // mediocampistas: apoyo triangular y un poco de llegada
      if (pr < 0.13) {
        // descarga corta
        band = [0.08, 0.18];
      } else if (brel > 0.55) {
        // llegada al área
        anc.x = u.abs(team, u.clamp(brel + 0.08, prof.minRel, prof.maxRel));
      }
    }

    const mk = F7.tactics.nearestOpp(p, team);
    let spot = F7.tactics.bestSpot(p, anc, cpt, prof, ex);
    if (F7.teamIntelligence) spot = F7.teamIntelligence.refineSupportSpot(p, spot, cpt, prof, ex);

    let intent = 'support', think = '○', sm = 1;
    if (p.role === 'DEF') { intent = 'cover'; think = 'C'; }
    if (prof.wide > 1 && Math.abs(spot.y - 0.5) > 0.28) { intent = 'width'; think = '↗'; }
    if ((spot.x - cpt.x) * dir > 0.09) {
      intent = (p.role === 'DEL' && mk.d < 0.11) ? 'check-run' : 'run';
      think = '➜';
      sm = 1.07;
    }
    if (brk && p.role !== 'DEF') sm = 1.16;

    return { x: spot.x, y: spot.y, intent, think, sm };
  }

  // Distribución del arquero: pase seguro a un compañero libre, o despeje si está presionado / agotó el tiempo.
  function keeperDecision(k) {
    const p = S.ps[k], team = p.team, t = S.carryTime, pr = F7.tactics.nearestOpp(p, team).d;
    const opts = F7.tactics.options(team, k, false).filter(o => o.risk < 0.35 && o.free > 0.10 && u.rel(team, o.p.x) < 0.65 && o.distance < 0.55);
    if (opts.length) {
      opts.forEach(o => { o._s = o.score - (o.distance > 0.45 ? 0.2 : 0) + (o.p.role === 'DEF' ? 0.1 : 0) + o.free * 0.5; });
      opts.sort((a, b) => b._s - a._s);
      return { type: 'pass', opt: opts[0], through: false, keeper: true };
    }
    if (pr < 0.14 || t > 1.2) return { type: 'clear' };
    return { type: 'hold' };
  }

  F7.roles = { PROFILE, profile, anchor, offBall, keeperDecision };
})(typeof window !== 'undefined' ? window : globalThis);
