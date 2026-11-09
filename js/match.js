/* match.js — estado del partido, utilidades, transiciones (ATAQUE/DEFENSA/PÉRDIDA/RECUPERACIÓN),
 * movimiento de jugadores, reinicios y comandos del usuario.
 * Coordenadas normalizadas 0..1 (x: largo, y: ancho). Azul ataca a la derecha (x=1), rojo a la izquierda (x=0).
 */
(function (g) {
  'use strict';
  const F7 = g.F7 = g.F7 || {};

  /* ---------- Utilidades compartidas ---------- */
  const u = F7.u = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    d: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    dir: t => (t === 0 ? 1 : -1),          // sentido de ataque en x
    rel: (t, x) => (t === 0 ? x : 1 - x),  // x relativa al equipo: 0 = arco propio, 1 = arco rival
    abs: (t, r) => (t === 0 ? r : 1 - r),
    segDist(p, a, b) {
      const vx = b.x - a.x, vy = b.y - a.y, l = vx * vx + vy * vy;
      if (l < 1e-6) return u.d(p, a);
      const t = u.clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / l, 0, 1);
      return u.d(p, { x: a.x + t * vx, y: a.y + t * vy });
    },
    rng(seed) { // mulberry32: reproducible para las pruebas (el estado se puede leer/escribir para guardar y restaurar el partido)
      let a = seed >>> 0;
      const r = function () {
        a = (a + 0x6D2B79F5) >>> 0; let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      r.get = () => a; r.set = v => { a = v >>> 0; };
      return r;
    },
    setT(p, x, y, intent, think, sm) { // fija objetivo, intención, ícono y multiplicador de velocidad
      p.tx = u.clamp(x, 0.025, 0.975); p.ty = u.clamp(y, 0.04, 0.96);
      p.intent = intent; p.think = think || ''; p.speedMul = sm || 1;
    }
  };

  // La interfaz (partido-ui.js) reemplaza estos ganchos; en Node son no-ops.
  F7.hooks = { say() {}, onGoal() {} };

  const ROLES = ['ARQ', 'DEF', 'DEF', 'MED', 'MED', 'EXT', 'DEL'];
  // Formación 2-3-1 (igual que V5): [x, y] del equipo azul; el rojo se espeja.
  const FORM = [[0.055, 0.5], [0.22, 0.29], [0.22, 0.71], [0.39, 0.34], [0.39, 0.66], [0.57, 0.25], [0.60, 0.75]];
  const S = F7.state = {};

  function possTeam() { // equipo que controla la pelota (incluye pase en vuelo)
    if (S.owner >= 0) return S.owner;
    if (S.passFlight) return S.passFlight.team;
    return -1;
  }
  function say(m) { F7.hooks.say(m); }

  /* ---------- Inicio / reinicio ---------- */
  function newBall() { return { x: 0.5, y: 0.5, vx: 0, vy: 0, shot: false, kind: '', by: -1, saveDone: false, blocked: null, noPickK: -1, noPickUntil: 0 }; }

  function init(opts) {
    opts = opts || {};
    S.seed = opts.seed != null ? (opts.seed >>> 0) : ((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0);
    S.rnd = u.rng(S.seed);
    S.ps = [];
    for (let t = 0; t < 2; t++) for (let i = 0; i < 7; i++) {
      let x = FORM[i][0], y = FORM[i][1]; if (t) { x = 1 - x; y = 1 - y; }
      S.ps.push({
        k: t * 7 + i, team: t, i, role: ROLES[i],
        x, y, hx: x, hy: y, tx: x, ty: y,
        vx: 0, vy: 0,                       // velocidad actual (aceleración suave)
        face: t ? Math.PI : 0, stamina: 1,
        think: '', intent: 'hold', speedMul: 1,
        retarget: S.rnd() * 0.4, evalKey: -1, mode: ''
      });
    }
    S.team = [S.ps.slice(0, 7), S.ps.slice(7)];
    if (F7.teamModel) F7.teamModel.assign(S.ps);
    S.ball = newBall();
    S.score = [0, 0]; S.seconds = 0; S.selected = 6; S.userPress = false; S.userTarget = null;
    S.decisionCount = 0; S.possId = 0; S.presser = [-1, -1]; S.lastOwner = -1; S.carryTime = 0;
    S.stats = { passes: [0, 0], passesDone: [0, 0], shots: [0, 0], saves: [0, 0], tackles: [0, 0], interceptions: [0, 0], clears: [0, 0], goals: [0, 0], turnovers: 0 };
    S.opts = Object.assign({ carrierHold: false, aiOff: false, noTackle: false }, opts.flags || {}); // banderas solo para pruebas
    S.phase = [{ name: 'ATAQUE', t: 0 }, { name: 'DEFENSA', t: 0 }];
    S.cd = [0.65, 0.7]; S.carrierIntent = { type: 'control' }; S.manualUntil = 0; S.hold = null; S.tackleCdUntil = 0; S.decisionSeq = 0; S.lastDecision = null;
    S.owner = 0; S.carrier = 6; S.passFlight = null; S.lock = 0;
    if (F7.debug) F7.debug.reset();
    kickoff(0);
    say('Azul inicia con el #7. La IA va a evaluar conducción, pase y remate.');
  }

  function kickoff(team) { // todos a su posición; saca el equipo indicado (el que recibió el gol)
    S.ps.forEach(p => {
      p.x = p.hx; p.y = p.hy; p.tx = p.hx; p.ty = p.hy;
      p.vx = 0; p.vy = 0;
      p.think = ''; p.intent = 'hold'; p.speedMul = 1; p.evalKey = -1;
      p.face = p.team ? Math.PI : 0;
    });
    S.passFlight = null; S.userTarget = null; S.lock = 0; S.carryTime = 0;
    S.owner = team; S.carrier = team * 7 + 6; if (team === 0) S.selected = 6;
    const c = S.ps[S.carrier]; S.ball = newBall(); S.ball.x = c.x + u.dir(team) * 0.016; S.ball.y = c.y;
    S.cd = [0.65, 0.7]; S.carrierIntent = { type: 'control' }; S.possId++;
    S.lastOwner = team; S.phase = [{ name: team === 0 ? 'ATAQUE' : 'DEFENSA', t: 0 }, { name: team === 1 ? 'ATAQUE' : 'DEFENSA', t: 0 }];
  }

  function goal(team) { // team = quien anota
    S.score[team]++; S.stats.goals[team]++; S.decisionCount++;
    F7.hooks.onGoal(team);
    kickoff(1 - team);
    say('¡Gol! Los dos equipos vuelven a sus posiciones.');
  }

  /* ---------- Transiciones ---------- */
  // Se llama cada vez que un equipo toma la pelota (ball.gain).
  function noteOwner(team) {
    if (S.lastOwner === team) { if (S.phase[team].name === 'DEFENSA') S.phase[team] = { name: 'ATAQUE', t: 0 }; return; }
    if (S.lastOwner === -1) { S.phase[team] = { name: 'ATAQUE', t: 0 }; S.phase[1 - team] = { name: 'DEFENSA', t: 0 }; }
    else { // cambio de posesión: el que la tomaba entra en PÉRDIDA, el que la toma en RECUPERACIÓN
      S.phase[team] = { name: 'RECUPERACION', t: 0 }; S.phase[1 - team] = { name: 'PERDIDA', t: 0 }; S.stats.turnovers++;
    }
    S.lastOwner = team;
  }
  function updatePhases(dt) {
    const poss = possTeam();
    for (let t = 0; t < 2; t++) {
      const ph = S.phase[t]; ph.t += dt;
      if ((ph.name === 'PERDIDA' || ph.name === 'RECUPERACION') && ph.t > 2.4) { ph.name = poss === t ? 'ATAQUE' : 'DEFENSA'; ph.t = 0; }
    }
  }
  // Nombre de fase del equipo azul para el HUD
  function hudPhase() {
    if (S.owner === -1 && !S.passFlight) return 'BALÓN DIVIDIDO';
    return { ATAQUE: 'ATAQUE', DEFENSA: 'DEFENSA', PERDIDA: 'PÉRDIDA', RECUPERACION: 'RECUPERACIÓN' }[S.phase[0].name];
  }

  /* ---------- Movimiento de jugadores (aceleración + inercia ligera) ---------- */
  function movePlayers(dt) {
    const ACC = 2.8;           // aceleración base hacia el target
    const FRICTION = 0.82;     // amortiguación por frame (suave)
    const MAX_SPEED = 0.22;    // tope de velocidad absoluta

    S.ps.forEach(p => {
      const dx = p.tx - p.x, dy = p.ty - p.y, dd = Math.hypot(dx, dy);
      let maxSp = (p.team === 0 ? 0.195 : 0.175) * (p.speedMul || 1);
      if (p.k === S.selected && S.userTarget && p.team === 0) maxSp = 0.25;
      if (F7.teamModel) maxSp *= F7.teamModel.movementFactor(p); // ritmo y cansancio del perfil individual
      if (p.k === S.carrier && S.owner !== -1) maxSp *= 0.90;

      if (dd > 0.002) {
        // deseamos velocidad proporcional a la distancia (cierre suave)
        const desired = Math.min(maxSp, dd * 3.2);
        const ux = dx / dd, uy = dy / dd;
        // aceleramos hacia la velocidad deseada
        p.vx += (ux * desired - p.vx) * Math.min(1, ACC * dt);
        p.vy += (uy * desired - p.vy) * Math.min(1, ACC * dt);
      } else {
        // cerca del target: frenamos
        p.vx *= 0.55;
        p.vy *= 0.55;
      }

      // límite de velocidad
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAX_SPEED * (p.speedMul || 1)) {
        const s = (MAX_SPEED * (p.speedMul || 1)) / sp;
        p.vx *= s; p.vy *= s;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (sp > 0.01) p.face = Math.atan2(p.vy, p.vx);

      if (F7.teamModel) F7.teamModel.tickStamina(p, dt, dd > 0.002);

      p.x = u.clamp(p.x, 0.025, 0.975);
      p.y = u.clamp(p.y, 0.04, 0.96);
    });

    // separación gradual (el poseedor no es empujado)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < S.ps.length; i++) {
        for (let j = i + 1; j < S.ps.length; j++) {
          const a = S.ps[i], b = S.ps[j];
          let dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
          const min = a.team === b.team ? 0.044 : 0.049;
          if (dd < min) {
            if (dd < 0.0001) { dx = (i % 2 ? 0.01 : -0.01); dy = 0.01; dd = Math.hypot(dx, dy); }
            const push = (min - dd) * 0.36, ux = dx / dd, uy = dy / dd;
            const aF = (i === S.carrier && S.owner !== -1), bF = (j === S.carrier && S.owner !== -1);
            if (aF && !bF) { b.x += ux * push * 2; b.y += uy * push * 2; b.vx += ux * push * 4; b.vy += uy * push * 4; }
            else if (bF && !aF) { a.x -= ux * push * 2; a.y -= uy * push * 2; a.vx -= ux * push * 4; a.vy -= uy * push * 4; }
            else {
              a.x -= ux * push; a.y -= uy * push;
              b.x += ux * push; b.y += uy * push;
              a.vx -= ux * push * 2; a.vy -= uy * push * 2;
              b.vx += ux * push * 2; b.vy += uy * push * 2;
            }
            a.x = u.clamp(a.x, 0.025, 0.975); a.y = u.clamp(a.y, 0.04, 0.96);
            b.x = u.clamp(b.x, 0.025, 0.975); b.y = u.clamp(b.y, 0.04, 0.96);
          }
        }
      }
    }
  }

  /* ---------- Paso de simulación ---------- */
  function update(dt) {
    S.seconds += dt; S.lock = Math.max(0, S.lock - dt);
    if (S.owner >= 0 && !S.passFlight) S.carryTime += dt;
    updatePhases(dt);
    F7.ai.plan(dt);
    movePlayers(dt);
    if (S.userTarget && (S.seconds > S.userTarget.until || u.d(S.ps[S.userTarget.k], S.userTarget) < 0.015)) S.userTarget = null;
    F7.ball.update(dt);
    F7.debug.check(dt);
  }

  /* ---------- Guardar / restaurar el partido (el entrenador lo usa para "probar" una jugada varias veces sin alterar la real) ---------- */
  function clone(v) { // copia profunda de objetos simples, arrays y Set (sin depender de structuredClone)
    if (v === null || typeof v !== 'object') return v; if (v instanceof Set) return new Set(v); if (Array.isArray(v)) return v.map(clone);
    const o = {}; Object.keys(v).forEach(k => { o[k] = clone(v[k]); }); return o;
  }
  function snapshot() {
    const o = {}; Object.keys(S).forEach(k => { if (k !== 'rnd' && k !== 'team') o[k] = S[k]; });
    const snap = clone(o); snap.rngState = S.rnd.get(); return snap;
  }
  function restore(snap) {
    const c = clone(snap);
    Object.keys(c).forEach(k => {
      if (k === 'rngState') return;
      if (k === 'ps') c.ps.forEach((src, i) => Object.assign(S.ps[i], src)); else S[k] = c[k];
    });
    S.rnd.set(snap.rngState);
  }

  /* ---------- Comandos del usuario (los botones de la interfaz solo llaman a esto) ---------- */
  const cmd = {
    select(k) {
      const p = S.ps[k]; if (!p || p.team) return;
      S.selected = k; S.userTarget = null;
      if (k === S.carrier && S.owner === 0) { S.cd[0] = Math.max(S.cd[0], 1.4); say('Poseedor seleccionado. Opciones de pase calculadas.'); }
      else say('Seleccionaste ' + p.role + ' #' + (p.i + 1) + '. Tocá un espacio para moverlo.');
    },
    moveTo(x, y) {
      const p = S.ps[S.selected];
      S.userTarget = { k: S.selected, x: u.clamp(x, 0.025, 0.975), y: u.clamp(y, 0.04, 0.96), until: S.seconds + 4 };
      say('Movimiento indicado para ' + p.role + ' #' + (p.i + 1));
    },
    pass(k, through) {
      if (S.owner !== 0 || S.carrier !== S.selected) { say('Seleccioná al poseedor azul para pasar.'); return false; }
      const op = F7.tactics.options(0, S.carrier, !!through).find(o => o.k === k); if (!op) return false;
      const to = S.ps[k]; F7.ball.launchPass(S.carrier, k, { through: !!through, message: 'Pase a ' + to.role + ' #' + (to.i + 1) + '.' });
      return true;
    },
    choosePass(through) {
      if (S.owner !== 0 || S.carrier !== S.selected) { say('Para pasar, seleccioná el jugador que tiene la pelota.'); return false; }
      const arr = F7.tactics.options(0, S.carrier, !!through);
      if (!arr.length) { say('No hay pase disponible; conservá y generá apoyo.'); return false; }
      let pick = arr[0];
      if (through) { const valid = arr.filter(x => x.forward > 0.04 && x.risk < 0.38); if (valid.length) pick = valid[0]; }
      return cmd.pass(pick.k, through);
    },
    shoot() {
      if (S.owner !== 0 || S.carrier !== S.selected) { say('Necesitás tener la pelota para rematar.'); return false; }
      const p = S.ps[S.carrier];
      if (1 - p.x > 0.46) say('Remate lejano: la IA recomienda avanzar o combinar antes de tirar.');
      F7.ball.shoot(S.carrier, { message: 'Remate ejecutado; el rival intenta bloquear y el arquero cubrir el arco.' });
      return true;
    },
    togglePress() {
      S.userPress = !S.userPress;
      say(S.userPress ? 'Presión colectiva: el jugador cercano presiona y los demás cubren.' : 'Bloque medio: cerrar centro y proteger profundidad.');
      return S.userPress;
    },
    reset() { init(); }
  };

  F7.match = { ROLES, FORM, init, kickoff, goal, update, possTeam, noteOwner, hudPhase, cmd, snapshot, restore };
})(typeof window !== 'undefined' ? window : globalThis);
