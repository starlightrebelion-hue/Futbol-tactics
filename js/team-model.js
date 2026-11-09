/* team-model.js — perfiles individuales y catálogo de formatos/formaciones.
 * El motor ejecutable actual sigue siendo Fútbol 7; el catálogo 11v11 prepara datos de plantilla
 * sin fingir que la simulación de partido ya soporta 22 jugadores. */
(function (g) {
  'use strict';
  const F7 = g.F7 = g.F7 || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const FORMATS = {
    '7v7': { players: 7, pitch: { length: 1, width: 1 }, playable: true },
    '11v11': { players: 11, pitch: { length: 1, width: 1 }, playable: false }
  };
  // Coordenadas normalizadas desde el arco propio (x=0) al rival (x=1).
  // El orden siempre empieza por ARQ; el resto son posiciones de referencia, no movimientos rígidos.
  const FORMATIONS = {
    '7v7': {
      '2-3-1': [
        ['ARQ', .055, .50], ['DEF', .22, .29], ['DEF', .22, .71],
        ['MED', .39, .34], ['MED', .39, .66], ['EXT', .57, .25], ['DEL', .60, .75]
      ],
      '3-2-1': [
        ['ARQ', .055, .50], ['DEF', .19, .20], ['DEF', .22, .50], ['DEF', .19, .80],
        ['MED', .43, .34], ['MED', .43, .66], ['DEL', .68, .50]
      ],
      '2-2-2': [
        ['ARQ', .055, .50], ['DEF', .22, .30], ['DEF', .22, .70],
        ['MED', .43, .30], ['MED', .43, .70], ['DEL', .68, .30], ['DEL', .68, .70]
      ]
    },
    '11v11': {
      '4-3-3': [
        ['ARQ', .045, .50], ['DEF', .20, .14], ['DEF', .17, .38], ['DEF', .17, .62], ['DEF', .20, .86],
        ['MED', .42, .50], ['MED', .45, .28], ['MED', .45, .72],
        ['EXT', .72, .12], ['DEL', .78, .50], ['EXT', .72, .88]
      ],
      '4-4-2': [
        ['ARQ', .045, .50], ['DEF', .20, .14], ['DEF', .17, .38], ['DEF', .17, .62], ['DEF', .20, .86],
        ['MED', .42, .14], ['MED', .42, .38], ['MED', .42, .62], ['MED', .42, .86],
        ['DEL', .72, .36], ['DEL', .72, .64]
      ],
      '4-2-3-1': [
        ['ARQ', .045, .50], ['DEF', .20, .14], ['DEF', .17, .38], ['DEF', .17, .62], ['DEF', .20, .86],
        ['MED', .38, .38], ['MED', .38, .62],
        ['EXT', .65, .14], ['MED', .62, .50], ['EXT', .65, .86], ['DEL', .79, .50]
      ],
      '3-5-2': [
        ['ARQ', .045, .50], ['DEF', .19, .25], ['DEF', .16, .50], ['DEF', .19, .75],
        ['EXT', .43, .08], ['MED', .42, .30], ['MED', .45, .50], ['MED', .42, .70], ['EXT', .43, .92],
        ['DEL', .73, .38], ['DEL', .73, .62]
      ]
    }
  };

  const ROLE_BASE = {
    ARQ: { vision: .72, technique: .58, pace: .42, positioning: .88, decision: .78, stamina: .76, anticipation: .82 },
    DEF: { vision: .65, technique: .62, pace: .62, positioning: .84, decision: .72, stamina: .84, anticipation: .78 },
    MED: { vision: .86, technique: .82, pace: .68, positioning: .78, decision: .84, stamina: .88, anticipation: .80 },
    EXT: { vision: .72, technique: .80, pace: .90, positioning: .72, decision: .72, stamina: .82, anticipation: .68 },
    DEL: { vision: .70, technique: .82, pace: .78, positioning: .86, decision: .80, stamina: .78, anticipation: .84 }
  };
  const ATTRS = Object.keys(ROLE_BASE.MED);

  function profileFor(role, index, team) {
    const base = ROLE_BASE[role] || ROLE_BASE.MED;
    const variation = ((((index + 1) * 17 + team * 11) % 9) - 4) * .018;
    const out = {};
    ATTRS.forEach((key, n) => {
      const roleOffset = ((((index + n * 3 + team) % 5) - 2) * .012);
      out[key] = clamp(base[key] + variation + roleOffset, .25, .98);
    });
    return out;
  }

  function assign(players) {
    players.forEach(p => {
      p.attributes = profileFor(p.role, p.i, p.team);
      p.stamina = p.stamina == null ? 1 : p.stamina;
      p.style = p.role === 'MED' && p.attributes.vision > .82 ? 'organizador' :
        p.role === 'EXT' && p.attributes.pace > .84 ? 'profundo' :
        p.role === 'DEL' && p.attributes.positioning > .82 ? 'finalizador' : 'equilibrado';
    });
    return players;
  }

  function actionBias(player, action) {
    const a = player.attributes || ROLE_BASE[player.role] || ROLE_BASE.MED;
    const mean = keys => keys.reduce((sum, k) => sum + (a[k] || .5), 0) / keys.length;
    let skill = .5;
    if (action.type === 'pass') skill = mean(['vision', 'technique', 'decision']);
    else if (action.type === 'shoot') skill = mean(['technique', 'decision', 'anticipation']);
    else if (action.type === 'dribble') skill = mean(['technique', 'pace', 'decision']);
    else if (action.type === 'shield') skill = mean(['technique', 'positioning']);
    else if (action.type === 'clear') skill = mean(['decision', 'anticipation']);
    return (skill - .5) * .16; // influencia moderada: la situación sigue pesando más que el rating.
  }

  function movementFactor(player) {
    const a = player.attributes || ROLE_BASE[player.role] || ROLE_BASE.MED;
    return (.90 + a.pace * .20) * (.92 + clamp(player.stamina == null ? 1 : player.stamina, 0, 1) * .08);
  }

  function tickStamina(player, dt, moving) {
    const a = player.attributes || ROLE_BASE[player.role] || ROLE_BASE.MED;
    const capacity = .75 + a.stamina * .5;
    const delta = moving ? -(.000025 / capacity) * dt : .000012 * dt;
    player.stamina = clamp((player.stamina == null ? 1 : player.stamina) + delta, .45, 1);
  }

  function formation(format, name) {
    const list = FORMATIONS[format] && FORMATIONS[format][name];
    return list ? list.map(p => ({ role: p[0], x: p[1], y: p[2] })) : null;
  }

  F7.teamModel = { FORMATS, FORMATIONS, ROLE_BASE, ATTRS, profileFor, assign, actionBias, movementFactor, tickStamina, formation };
})(typeof window !== 'undefined' ? window : globalThis);
