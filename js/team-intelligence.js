/* team-intelligence.js — coordinación colectiva ligera sobre la capa de roles existente.
 * No sustituye los planes individuales: los corrige para conservar apoyos, triángulos y distancias útiles. */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;
  const STYLES = ['balanced', 'possession', 'direct', 'pressing', 'compact'];
  const styleByTeam = ['balanced', 'balanced'];

  function setStrategy(team, style) {
    if (team !== 0 && team !== 1) return false;
    if (STYLES.indexOf(style) < 0) return false;
    styleByTeam[team] = style;
    return true;
  }
  function getStrategy(team) { return styleByTeam[team] || 'balanced'; }

  function refineSupportSpot(p, spot, carrier, prof, ex) {
    if (!spot || !carrier || !F7.tactics) return spot;
    const team = p.team, style = getStrategy(team);
    const vision = p.attributes ? p.attributes.vision : .5;
    const offsets = [[0,0],[.035,0],[-.035,0],[0,.045],[0,-.045],[.035,.045],[.035,-.045],[-.035,.045],[-.035,-.045],[.065,0],[0,.075],[0,-.075]];
    const low = ex.band[0], high = ex.band[1];
    let best = { x: spot.x, y: spot.y, score: -Infinity };
    offsets.forEach(o => {
      const point = { x: u.clamp(spot.x + u.dir(team) * o[0], .04, .96), y: u.clamp(spot.y + o[1], .07, .93) };
      const distance = u.d(point, carrier);
      const nearest = F7.tactics.nearestOpp(point, team).d;
      const lane = F7.tactics.laneClear(carrier, point, team);
      let separation = 0;
      S.team[team].forEach(q => {
        if (q === p || q.k === S.carrier) return;
        const qx = q.tx == null ? q.x : q.tx, qy = q.ty == null ? q.y : q.ty;
        const d = Math.hypot(point.x - qx, point.y - qy);
        if (d < .14) separation += (.14 - d) * 3.5;
      });
      let bandPenalty = distance < low ? (low - distance) * 4 : distance > high ? (distance - high) * 2.5 : 0;
      let score = Math.min(lane, .22) * (2.4 + vision) + Math.min(nearest, .24) * 1.8 - separation - bandPenalty;
      score -= u.d(point, spot) * 2.2; // no destruye la estructura que ya decidió el rol.
      if (style === 'possession') score += Math.min(lane, .22) * .7 - Math.abs(distance - (low + high) / 2) * .25;
      if (style === 'direct') score += (point.x - carrier.x) * u.dir(team) * .55;
      if (style === 'compact') score -= Math.max(0, distance - high * .85) * 1.2;
      if (style === 'pressing' && S.phase[team].name === 'RECUPERACION') score += (point.x - carrier.x) * u.dir(team) * .35;
      if (score > best.score) best = { x: point.x, y: point.y, score };
    });
    // Limita el ajuste colectivo: el rol mantiene la responsabilidad posicional.
    const dx = u.clamp(best.x - spot.x, -.065, .065), dy = u.clamp(best.y - spot.y, -.075, .075);
    return { x: u.clamp(spot.x + dx, .04, .96), y: u.clamp(spot.y + dy, .07, .93) };
  }

  function teamShape(team) {
    const players = S.team[team] || [], field = players.filter(p => p.i > 0);
    if (!field.length) return { width: 0, depth: 0, compactness: 0 };
    const xs = field.map(p => u.rel(team, p.x)), ys = field.map(p => p.y);
    const width = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    const depth = Math.max.apply(null, xs) - Math.min.apply(null, xs);
    return { width, depth, compactness: 1 - Math.min(1, (width + depth) / 2) };
  }

  F7.teamIntelligence = { STYLES, setStrategy, getStrategy, refineSupportSpot, teamShape };
})(typeof window !== 'undefined' ? window : globalThis);
