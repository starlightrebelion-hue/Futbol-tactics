/* puppet.js — motor de animación de jugadores, portado de Vóley TV (puppet.js). Sin DOM: se prueba en Node.
 * Esqueleto con cinemática inversa de dos huesos: las piernas buscan su punto (en un remate o al recibir, el pie va a la pelota).
 * A diferencia del vóley (que se ve solo de costado), el esqueleto es 3D: sirve para cualquier cámara.
 * Marco del cuerpo: u = hacia adelante, w = hacia la derecha, v = arriba (en metros). Lee el partido pero nunca lo modifica.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u;
  const TH = 0.47, SH = 0.47, UA = 0.32, FA = 0.44, TORSO = 0.56, HIPW = 0.1, SHW = 0.21, HEAD = 0.2;
  const DUR = { pass: 0.42, shot: 0.5, clear: 0.55, slide: 0.75, dive: 0.8, catch: 0.5 };

  // dos huesos (a, b) desde S hasta T en el plano u-v. bend elige para qué lado dobla la rodilla o el codo.
  function ik2(S, T, a, b, bend) {
    const dx = T.u - S.u, dv = T.v - S.v, d = Math.hypot(dx, dv) || 1e-4, du = dx / d, vv = dv / d;
    const dd = u.clamp(d, Math.abs(a - b) + 0.05, a + b - 1e-3);
    const A = (a * a - b * b + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, a * a - A * A));
    return { mid: { u: S.u + du * A - vv * h * bend, v: S.v + vv * A + du * h * bend }, end: { u: S.u + du * dd, v: S.v + vv * dd } };
  }
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* Estado de animación por jugador. Se calcula de las posiciones, así sirve igual para el partido y para las pizarras. */
  function create() {
    const st = {}; let last = null;
    function get(p) {
      return st[p.k] || (st[p.k] = { x: p.x * F7.cam.L, y: p.y * F7.cam.W, spd: 0, mvx: 0, mvy: 0, stride: (p.k * 1.7) % 6.28, heading: p.team ? Math.PI : 0, gait: 'idle', act: null, actT: 0, actDur: 1, celebrate: 0, side: 1 });
    }
    function trigger(k, act, side) { const a = st[k]; if (!a) return; a.act = act; a.actT = 0; a.actDur = DUR[act] || 0.5; if (side) a.side = side; }

    // detecta en el partido lo que no se ve en las posiciones: pases, remates, robos, atajadas y goles
    function events(S) {
      const s = S.stats, sum = t => ({ pass: s.passes[t], shot: s.shots[t], clear: s.clears[t], tackle: s.tackles[t], save: s.saves[t], goal: s.goals[t] });
      const now = [sum(0), sum(1)];
      if (last) for (let t = 0; t < 2; t++) {
        const a = last[t], b = now[t], close = () => S.team[t].reduce((m, q) => (u.d(q, S.ball) < u.d(m, S.ball) ? q : m));
        if (b.pass > a.pass && S.passFlight) trigger(S.passFlight.fromK, 'pass');
        if (b.shot > a.shot) trigger(close().k, 'shot');
        if (b.clear > a.clear) trigger(close().k, 'clear');
        if (b.tackle > a.tackle && S.carrier >= 0) trigger(S.carrier, 'slide');
        if (b.save > a.save) { const kp = S.team[t][0]; trigger(kp.k, 'dive', S.ball.y >= kp.y ? 1 : -1); }
        if (b.goal > a.goal) S.team[t].forEach(q => { const e = st[q.k]; if (e) e.celebrate = 2.2; });
      }
      last = now;
    }

    function step(src, dt, S) {
      if (S) events(S);
      if (dt <= 0) return;
      const ball = src.ball, bx = ball.x * F7.cam.L, by = ball.y * F7.cam.W;
      src.ps.forEach(p => {
        const a = get(p), x = p.x * F7.cam.L, y = p.y * F7.cam.W, vx = (x - a.x) / dt, vy = (y - a.y) / dt, k = Math.min(1, dt * 9);
        a.x = x; a.y = y; a.mvx += (vx - a.mvx) * k; a.mvy += (vy - a.mvy) * k;
        a.spd = Math.hypot(a.mvx, a.mvy);
        const toBall = Math.atan2(by - y, bx - x), move = Math.atan2(a.mvy, a.mvx), slow = a.spd < 1.2;
        // con pelota o corriendo fuerte mira a donde va; el resto del tiempo mira la pelota (y se mueve de costado o de espaldas)
        const hasBall = src.carrier === p.k, sprint = a.spd > 6.5;
        const want = slow ? toBall : hasBall || sprint ? move : toBall;
        a.heading = wrapA(a.heading + wrapA(want - a.heading) * Math.min(1, dt * 8));
        const rel = slow ? 0 : wrapA(move - a.heading);
        a.gait = slow ? 'idle' : Math.abs(rel) < 0.8 ? 'run' : Math.abs(rel) > 2.3 ? 'back' : 'side';
        a.dirW = rel >= 0 ? 1 : -1;
        a.stride += Math.min(a.spd, 8.5) * dt * 1.55;
        if (a.act) { a.actT += dt; if (a.actT >= a.actDur) a.act = null; }
        if (a.celebrate > 0) a.celebrate -= dt;
      });
    }
    return { step, get, trigger, reset() { Object.keys(st).forEach(k => delete st[k]); last = null; } };
  }

  /* Arma las articulaciones en el marco del cuerpo. ball: posición de la pelota en metros, si está cerca y hace falta. */
  function pose(a, p, ball, clock) {
    const keeper = p.role === 'ARQ', ph = a.stride * 3, K = a.act ? u.clamp(a.actT / a.actDur, 0, 1) : 0;
    let hv = 0.9, lean = 0.1, roll = 0, z0 = 0, shiftW = 0;
    let fR = { u: 0.08, w: HIPW, v: 0 }, fL = { u: -0.08, w: -HIPW, v: 0 }, hR = { u: 0.2, w: 0.3, v: 0.85 }, hL = { u: 0.2, w: -0.3, v: 0.85 }, elbow = -1, act = a.gait;

    if (a.celebrate > 0) {
      const j = Math.abs(Math.sin(clock * 6)); act = 'celebrate'; z0 = 0.3 * j; lean = -0.05;
      hR = { u: 0.1, w: 0.35, v: 2.1 }; hL = { u: 0.1, w: -0.35, v: 2.1 }; elbow = 1;
    } else if (a.act === 'pass' || a.act === 'shot' || a.act === 'clear') {
      // tres tiempos: lleva la pierna atrás, golpea (el pie pasa por la pelota) y acompaña
      act = a.act; const pw = a.act === 'pass' ? 0.6 : 1, wind = 0.35, hit = 0.55;
      fL = { u: 0.14, w: -HIPW - 0.03, v: 0 }; lean = 0.18 - 0.2 * pw * K;
      if (K < wind) { const t = K / wind; fR = { u: 0.08 - 0.6 * pw * t, w: HIPW, v: 0.45 * pw * t }; lean = 0.15 + 0.12 * t; }
      else if (K < hit) { const t = (K - wind) / (hit - wind); fR = { u: -0.52 * pw + (0.34 + 0.52 * pw) * t, w: HIPW, v: 0.45 * pw * (1 - t) + 0.1 * t }; }
      else { const t = (K - hit) / (1 - hit), s = t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4 * 0.7; fR = { u: 0.34 + 0.4 * pw * s, w: HIPW, v: 0.1 + 0.7 * pw * s }; }
      hR = { u: -0.18, w: 0.34, v: 0.95 }; hL = { u: 0.32, w: -0.42, v: 1.05 }; hv = 0.86;
    } else if (a.act === 'slide') {
      // barrida: cae sobre la cadera, pierna adelante
      act = 'slide'; const t = Math.min(1, K / 0.25), up = K > 0.75 ? (K - 0.75) / 0.25 : 0;
      hv = 0.9 - 0.62 * t + 0.62 * up; lean = -0.75 * t * (1 - up);
      fR = { u: 0.85 * (1 - up), w: HIPW, v: 0.08 }; fL = { u: 0.3 * (1 - up), w: -HIPW - 0.08, v: 0.04 };
      hR = { u: -0.3, w: 0.4, v: 0.15 + 0.7 * up }; hL = { u: 0.2, w: -0.4, v: 0.4 + 0.45 * up };
    } else if (a.act === 'dive') {
      // estirada del arquero: se recuesta hacia el lado de la pelota con los brazos arriba
      act = 'dive'; const t = Math.min(1, K / 0.35), fall = K > 0.6 ? (K - 0.6) / 0.4 : 0, s = a.side || 1;
      roll = s * 1.25 * t; shiftW = s * 1.3 * t; z0 = 0.5 * Math.sin(Math.min(1, K / 0.6) * Math.PI) * (1 - fall); lean = 0.05; hv = 0.92;
      fR = { u: 0.04, w: HIPW, v: 0.05 }; fL = { u: -0.18, w: -HIPW, v: 0.22 };
      hR = { u: 0.12, w: 0.14, v: 2.0 }; hL = { u: 0.12, w: -0.14, v: 2.0 }; elbow = 1;
    } else if (keeper && a.gait === 'idle') {
      // arquero listo: rodillas flexionadas, brazos abiertos adelante
      act = 'keeper'; const b = 0.01 * Math.sin(clock * 3 + p.k); hv = 0.76 + b; lean = 0.32;
      fR = { u: 0.1, w: HIPW + 0.14, v: 0 }; fL = { u: 0.02, w: -HIPW - 0.14, v: 0 };
      hR = { u: 0.42, w: 0.36, v: 0.98 }; hL = { u: 0.42, w: -0.36, v: 0.98 };
    } else if (a.gait === 'back') {
      // de espaldas mirando la pelota: pasos cortos, tronco derecho
      const s = Math.sin(-ph * 1.1), c = Math.cos(ph * 1.1), A = 0.2;
      hv = 0.86; lean = 0.02;
      fR = { u: A * s, w: HIPW, v: 0.12 * Math.max(0, c) }; fL = { u: -A * s, w: -HIPW, v: 0.12 * Math.max(0, -c) };
      hR = { u: 0.3, w: 0.32, v: 0.9 }; hL = { u: 0.3, w: -0.32, v: 0.9 };
    } else if (a.gait === 'side') {
      // perfilado: pasos laterales bajos, como cuando temporizás al poseedor
      const s = Math.sin(ph * 1.2), d = a.dirW, A = 0.16;
      hv = 0.8 + 0.02 * Math.abs(s); lean = 0.24;
      fR = { u: 0.06, w: HIPW + 0.05 + A * s * d, v: 0.09 * Math.max(0, s) }; fL = { u: -0.06, w: -HIPW - 0.05 + A * s * d, v: 0.09 * Math.max(0, -s) };
      hR = { u: 0.3, w: 0.38, v: 0.88 }; hL = { u: 0.3, w: -0.38, v: 0.88 };
    } else if (a.gait === 'run') {
      // carrera: la amplitud crece con la velocidad, tronco más inclinado y braceo opuesto a las piernas
      const sp = u.clamp(a.spd / 8, 0.25, 1), A = 0.2 + 0.32 * sp, c = Math.cos(ph), s = Math.sin(ph);
      hv = 0.88 + 0.03 * Math.abs(s); lean = 0.1 + 0.24 * sp;
      const lift = 0.12 + 0.22 * sp; // el pie sube solo mientras avanza
      fR = { u: A * s, w: HIPW, v: lift * Math.max(0, c) }; fL = { u: -A * s, w: -HIPW, v: lift * Math.max(0, -c) };
      hR = { u: -0.32 * s * (0.5 + sp), w: 0.3, v: 0.92 + 0.1 * Math.abs(s) }; hL = { u: 0.32 * s * (0.5 + sp), w: -0.3, v: 0.92 + 0.1 * Math.abs(s) };
    } else {
      // quieto, listo: peso que se balancea apenas
      const b = 0.012 * Math.sin(clock * 2.4 + p.k); hv = 0.9 + b; lean = 0.12;
    }

    // al recibir, o si la pelota pasa al lado: el pie va a la pelota
    let reach = false;
    if (ball && !a.act && a.celebrate <= 0 && ball.u > -0.2 && ball.u < 0.9 && Math.abs(ball.w) < 0.55 && ball.v < 0.5) {
      const r = ball.w >= 0 ? 'R' : 'L', tgt = { u: ball.u, w: ball.w, v: Math.max(0.03, ball.v) };
      if (r === 'R') fR = tgt; else fL = tgt; reach = r;
    }

    const H = { u: 0, v: hv }, S = { u: Math.sin(lean) * TORSO, v: hv + Math.cos(lean) * TORSO }, C = { u: S.u + Math.sin(lean) * HEAD, v: S.v + Math.cos(lean) * HEAD };
    const legR = ik2(H, fR, TH, SH, 1), legL = ik2(H, fL, TH, SH, 1), armR = ik2(S, hR, UA, FA, elbow), armL = ik2(S, hL, UA, FA, elbow);
    const hip = w => ({ u: 0, w, v: hv }), sh = w => ({ u: S.u, w, v: S.v }), lerpW = (a0, b0) => (a0 + b0) / 2;
    const j = {
      hipR: hip(HIPW), hipL: hip(-HIPW), shR: sh(SHW), shL: sh(-SHW), head: { u: C.u, w: 0, v: C.v },
      knR: { u: legR.mid.u, w: lerpW(HIPW, fR.w), v: legR.mid.v }, knL: { u: legL.mid.u, w: lerpW(-HIPW, fL.w), v: legL.mid.v },
      anR: { u: legR.end.u, w: fR.w, v: legR.end.v }, anL: { u: legL.end.u, w: fL.w, v: legL.end.v },
      elR: { u: armR.mid.u, w: lerpW(SHW, hR.w), v: armR.mid.v }, elL: { u: armL.mid.u, w: lerpW(-SHW, hL.w), v: armL.mid.v },
      wrR: { u: armR.end.u, w: hR.w, v: armR.end.v }, wrL: { u: armL.end.u, w: hL.w, v: armL.end.v }
    };
    return { j, roll, z0, shiftW, act, reach };
  }

  /* De marco del cuerpo a metros del mundo, según hacia dónde mira el jugador */
  function toWorld(a, ps) {
    const cf = Math.cos(a.heading), sf = Math.sin(a.heading), rx = -sf, ry = cf, out = {}, cr = Math.cos(ps.roll), sr = Math.sin(ps.roll);
    Object.keys(ps.j).forEach(n => {
      const q = ps.j[n], w = q.w * cr + q.v * sr + ps.shiftW, v = -q.w * sr + q.v * cr;
      out[n] = { x: a.x + cf * q.u + rx * w, y: a.y + sf * q.u + ry * w, z: Math.max(0.02, v + ps.z0) };
    });
    return out;
  }
  // la pelota vista desde el cuerpo del jugador
  function ballLocal(a, bm) {
    const dx = bm.x - a.x, dy = bm.y - a.y, cf = Math.cos(a.heading), sf = Math.sin(a.heading);
    return { u: dx * cf + dy * sf, w: -dx * sf + dy * cf, v: bm.z || 0 };
  }

  F7.anim = { create, pose, toWorld, ballLocal, ik2, TH, SH, DUR };
})(typeof window !== 'undefined' ? window : globalThis);
