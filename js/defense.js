/* defense.js — equipo sin pelota: bloque compacto, un solo presionador, cobertura, marcas por peligrosidad,
 * repliegue de jugadores superados, intercepción de pases, arquero, y comportamiento en PÉRDIDA (contrapresión o repliegue). */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state, setT = u.setT;

  // Posición del arquero: entre la pelota y el arco; si hay remate, se dirige al punto de llegada.
  function keeperTarget(kp, threat) {
    const team = kp.team, brel = u.rel(team, threat.x), b = S.ball;
    let rx = 0.055 + u.clamp(brel, 0, 1) * 0.075, y = u.clamp(0.5 + (threat.y - 0.5) * 0.5, 0.37, 0.63), intent = 'keeper', sm = 1;
    if (b.shot && b.by === 1 - team && b.vx !== 0) {
      const dx = u.abs(team, 0) - b.x;
      if (Math.sign(dx) === Math.sign(b.vx)) { y = u.clamp(b.y + b.vy * (dx / b.vx), 0.38, 0.62); rx = 0.045; intent = 'save'; sm = 1.8; }
    }
    return { x: u.abs(team, rx), y, intent, sm };
  }

  function shouldCounterpress(team, threat, brel) { // pérdida cerca del arco rival y con compañeros cerca → presionar ya
    if (brel < 0.45) return false;
    return S.team[team].filter(p => p.i > 0 && u.d(p, threat) < 0.28).length >= 2;
  }

  function plan(team) {
    const mine = S.team[team], opp = S.team[1 - team], own = -u.dir(team);
    const phs = S.phase[team], ph = phs.name, f = S.passFlight, b = S.ball, userPress = team === 0 && S.userPress;
    let carrier = null, threat = b;
    if (S.owner === 1 - team && S.carrier >= 0) { carrier = S.ps[S.carrier]; threat = carrier; }
    else if (f && f.team === 1 - team) threat = S.ps[f.toK];
    const brel = u.rel(team, threat.x), field = mine.filter(p => p.i > 0);
    let line = u.clamp(0.17 + brel * 0.40, 0.2, 0.47), cp = false;
    if (userPress) line = Math.min(0.55, line + 0.06);
    if (ph === 'PERDIDA') {
      if (phs.cp === undefined) phs.cp = shouldCounterpress(team, threat, brel);
      cp = phs.cp; line = cp ? Math.min(0.55, line + 0.05) : Math.max(0.18, line - 0.03);
    }
    const retreat = ph === 'PERDIDA' && !cp, mid = line + 0.17, fwd = Math.min(0.72, line + 0.30);
    const T = {};
    // 1) Zonas base: bloque que se desplaza y comprime hacia el lado de la pelota
    field.forEach(p => {
      const lr = p.role === 'DEF' ? line : p.role === 'MED' ? mid : p.role === 'EXT' ? fwd : fwd + 0.02;
      T[p.k] = { x: u.abs(team, lr), y: u.clamp(0.5 + (p.hy - 0.5) * 0.85 + (threat.y - 0.5) * 0.35, 0.1, 0.9), intent: 'zone', think: '', sm: retreat ? 1.25 : (cp ? 1.1 : 1) };
    });
    // 2) Presionador único (con histéresis); en retirada solo contiene a distancia
    const eff = p => u.d(p, threat) + (p.role === 'DEF' && brel > 0.5 ? 0.25 : 0) + (p.role === 'EXT' ? 0.04 : 0);
    let pk = -1, pe = 1e9; field.forEach(p => { const e = eff(p); if (e < pe) { pe = e; pk = p.k; } });
    const prev = S.presser[team];
    if (prev >= 0 && prev !== pk && S.ps[prev].team === team && prev % 7 > 0 && eff(S.ps[prev]) < pe * 1.3) { pk = prev; pe = eff(S.ps[prev]); }
    S.presser[team] = pk;
    const taken = new Set();
    // pase rival en vuelo: el defensor mejor ubicado sobre la línea intercepta
    let ik = -1;
    if (f && f.team === 1 - team) {
      let bd = 0.22; field.forEach(p => { const sd = u.segDist(p, b, threat); if (sd < bd) { bd = sd; ik = p.k; } });
      if (ik >= 0) {
        const p = S.ps[ik], vx = threat.x - b.x, vy = threat.y - b.y, l2 = vx * vx + vy * vy || 1;
        const t = u.clamp(((p.x - b.x) * vx + (p.y - b.y) * vy) / l2, 0.15, 0.9);
        T[ik] = { x: b.x + vx * t, y: b.y + vy * t, intent: 'intercept', think: '✂', sm: 1.12 }; taken.add(ik); if (pk === ik) pk = -1;
      }
    }
    if (pk >= 0 && (pe < 0.5 || brel < 0.5 || userPress) && !taken.has(pk)) {
      const cx = retreat ? 0.09 : 0.035;
      T[pk] = { x: threat.x + own * cx, y: threat.y, intent: retreat ? 'contain' : 'press', think: retreat ? '◆' : '!', sm: 1.08 }; taken.add(pk);
    }
    if ((cp || userPress) && brel > 0.3) { // segundo presionador (contrapresión / presión colectiva)
      let k2 = -1, d2 = 0.3; field.forEach(p => { if (!taken.has(p.k)) { const dd = u.d(p, threat); if (dd < d2) { d2 = dd; k2 = p.k; } } });
      if (k2 >= 0) { T[k2] = { x: threat.x + own * 0.05, y: threat.y + (0.5 - threat.y) * 0.15, intent: 'press', think: '!', sm: 1.1 }; taken.add(k2); }
    }
    // 3) Cobertura: protege el camino al arco por detrás del presionador
    let ck = -1;
    if (brel < 0.62) {
      const cpnt = { x: threat.x + own * 0.11, y: threat.y + (0.5 - threat.y) * 0.25 }; let cd = 1e9;
      field.forEach(p => { if (!taken.has(p.k) && (p.role === 'DEF' || p.role === 'MED')) { const dd = u.d(p, cpnt); if (dd < cd) { cd = dd; ck = p.k; } } });
      if (ck >= 0) { T[ck] = { x: cpnt.x, y: cpnt.y, intent: 'cover', think: 'C', sm: 1 }; taken.add(ck); }
    }
    // 4) Marcas por peligrosidad (un marcador por rival, sin duplicar)
    const free = field.filter(p => !taken.has(p.k));
    const danger = q => (1 - u.rel(team, q.x)) * 1.2 + 0.4 * (1 - Math.abs(q.y - 0.5) * 2) + (u.d(q, threat) < 0.3 ? 0.3 : 0);
    opp.filter(q => q.i > 0 && q !== carrier && u.rel(team, q.x) <= 0.78).sort((a, c) => danger(c) - danger(a)).forEach(q => {
      let bi = -1, bs = 1e9;
      free.forEach((p, ix) => {
        const pref = p.role === 'DEF' ? (q.role === 'DEL' || q.role === 'EXT') : (p.role === 'MED' ? q.role === 'MED' : true);
        const sc = u.d(p, q) + (pref ? 0 : 0.08); if (sc < bs) { bs = sc; bi = ix; }
      });
      if (bi < 0) return;
      const p = free[bi]; if (u.d(p, q) > 0.5) return; free.splice(bi, 1);
      const w = u.d(q, threat) < 0.28 ? 1 : 0.6, z = T[p.k];
      const mx = q.x + own * 0.05, my = q.y + (threat.y - q.y) * 0.12;
      T[p.k] = { x: z.x * (1 - w) + mx * w, y: z.y * (1 - w) + my * w, intent: 'mark', think: 'M', sm: z.sm };
    });
    // 5) Repliegue: si quedan menos de 2 jugadores por detrás de la pelota, los superados corren a posición de cierre
    const goalSide = field.filter(p => u.rel(team, p.x) < brel - 0.02).length;
    if (goalSide < 2) {
      field.filter(p => u.rel(team, p.x) > brel + 0.04 && p.k !== pk && p.k !== ik).sort((a, c) => u.rel(team, a.x) - u.rel(team, c.x)).slice(0, 2 - goalSide).forEach((p, i) => {
        T[p.k] = { x: u.abs(team, Math.max(0.1, brel - 0.06 - i * 0.05)), y: u.clamp(threat.y + (0.5 - threat.y) * (0.3 + i * 0.25), 0.1, 0.9), intent: 'recover', think: '↩', sm: 1.3 };
      });
    }
    field.forEach(p => { const t = T[p.k]; setT(p, t.x, t.y, t.intent, t.think, t.sm); });
    const kt = keeperTarget(mine[0], threat); setT(mine[0], kt.x, kt.y, kt.intent, '', kt.sm);
  }

  F7.defense = { plan, keeperTarget, shouldCounterpress };
})(typeof window !== 'undefined' ? window : globalThis);
