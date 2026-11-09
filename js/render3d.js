/* render3d.js — dibujo en canvas de la cancha y los jugadores con perspectiva real. Portado de Vóley TV (view3d.js).
 * Cuatro cámaras: tv (de costado, como la transmisión), alta (3D detrás del arco), hombro (detrás de tu jugador) y cenital (pizarra).
 * La fuente es genérica: { ps, ball, carrier, me }. Así el mismo dibujo sirve para el partido y para las pizarras.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, C = F7.cam, L = C.L, W = C.W, A = F7.anim;
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const GOAL_Y0 = 0.39 * W, GOAL_Y1 = 0.61 * W, GOAL_H = 2.4, GOAL_D = 1.6, BALL_R = 0.17; // el arco mide lo mismo que en el motor
  const KIT = {
    0: { shirt: '#1d8fe0', shorts: '#0d3a63', socks: '#e9f2fa', num: '#fff' }, 1: { shirt: '#e0434f', shorts: '#fff', socks: '#7c1f27', num: '#fff' },
    k0: { shirt: '#39d67e', shorts: '#14532f', socks: '#39d67e', num: '#0c2b1a' }, k1: { shirt: '#ffc531', shorts: '#2a2a2a', socks: '#ffc531', num: '#2a2a2a' }
  };
  const SKIN = ['#e0ac82', '#c68a5e', '#8d5a3c', '#f0c6a0', '#6e4630'], HAIR = ['#20160f', '#3b2a1a', '#0f0f0f', '#7a5230', '#1a1a1a'];
  const lerp = (a, b, t) => a + (b - a) * t;

  // opt.w / opt.h: tamaño fijo en píxeles (para grabar video sin depender de la pantalla)
  function create(canvas, opt) {
    const ctx = canvas.getContext('2d'), anim = A.create();
    const R = { pan: { yaw: 0, pitch: 0 }, canvas, ctx, anim, Wd: 0, Hd: 0, cam: null, eye: null, look: null, mode: 'tv', clock: 0, safe: null, marksScreen: [], playersScreen: [] };

    R.resize = function () {
      if (opt && opt.w) { if (canvas.width !== opt.w || canvas.height !== opt.h) { canvas.width = opt.w; canvas.height = opt.h; } R.Wd = opt.w; R.Hd = opt.h; ctx.setTransform(1, 0, 0, 1, 0, 0); return; }
      const dpr = Math.min(2, g.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
      R.Wd = r.width; R.Hd = r.height;
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /* ---------- Cámaras ---------- */
    function camFor(mode, src, rect, view) {
      const land = rect.w > rect.h, b = src.ball, bm = { x: b.x * L, y: b.y * W }, foc = view && view.focus ? { x: view.focus.x * L, y: view.focus.y * W } : null, mk = view && view.marks ? view.marks : [];
      const zoom = (view && view.zoom) || 1;
      if (mode === 'cenital') {
        const span = land ? L + 8 : W + 6, spanV = land ? W + 8 : L + 8, fov = 36, t = Math.tan(fov * Math.PI / 360);
        const h = Math.max(spanV / 2 / t, span / 2 / t * (rect.h / rect.w));
        if (view && view.fit) { // el video: se acerca a donde pasa la jugada (jugadores y flechas), con un margen
          const pts = src.ps.map(q => [q.x * L, q.y * W]).concat((view.arrows || []).map(q => [q.b.x * L, q.b.y * W]));
          const x0 = Math.min.apply(null, pts.map(q => q[0])), x1 = Math.max.apply(null, pts.map(q => q[0])), y0 = Math.min.apply(null, pts.map(q => q[1])), y1 = Math.max.apply(null, pts.map(q => q[1]));
          const sh = Math.max(x1 - x0 + 10, 36), sv = Math.max(y1 - y0 + 9, 21), asp = rect.w / rect.h, hh = Math.max(sv / 2 / t, sh / 2 / (t * asp)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          return { eye: { x: cx - (land ? 0 : 0.02), y: cy + (land ? 0.02 : 0), z: Math.min(hh, Math.max(spanV / 2 / t, span / 2 / t * (rect.h / rect.w))) }, look: { x: cx, y: cy, z: 0 }, fov };
        }
        // apaisado: azul ataca a la derecha; vertical: ataca hacia arriba
        return { eye: { x: L / 2 - (land ? 0 : 0.02), y: W / 2 + (land ? 0.02 : 0), z: h }, look: { x: L / 2, y: W / 2, z: 0 }, fov };
      }
      if (mode === 'alta') {
        const cy = W / 2 + (bm.y - W / 2) * 0.35;
        return { eye: { x: -17, y: cy, z: 25 }, look: { x: L * 0.46, y: W / 2 + (bm.y - W / 2) * 0.15, z: 0 }, fov: (land ? 40 : 58) / zoom };
      }
      if (mode === 'hombro') {
        const me = src.ps[src.me] || src.ps[6], mm = { x: me.x * L, y: me.y * W };
        let dx = L - mm.x, dy = W / 2 - mm.y; const far = Math.hypot(bm.x - mm.x, bm.y - mm.y);
        if (mk.length) { dx = mk.reduce((a, q) => a + q.x * L, 0) / mk.length - mm.x; dy = mk.reduce((a, q) => a + q.y * W, 0) / mk.length - mm.y; } // con opciones, mira hacia ellas
        else if (far > 2.5) { dx = lerp(dx, bm.x - mm.x, 0.7); dy = lerp(dy, bm.y - mm.y, 0.7); }
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        return { eye: { x: mm.x - dx * 6.8 - dy * 1.3, y: mm.y - dy * 6.8 + dx * 1.3, z: 3.5 }, look: { x: mm.x + dx * 11, y: mm.y + dy * 11, z: 0.7 }, fov: land ? 56 : 72 };
      }
      // tv: de costado, sigue la pelota como una transmisión; cuando el entrenador frena, encuadra lo que importa
      let tx = u.clamp(lerp(L / 2, bm.x, 0.85), 14, L - 14), ty = W * 0.47;
      if (foc) {
        const pts = [foc].concat(mk.map(q => ({ x: q.x * L, y: q.y * W })));
        tx = u.clamp(pts.reduce((s, q) => s + q.x, 0) / pts.length, 8, L - 8); ty = u.clamp(pts.reduce((s, q) => s + q.y, 0) / pts.length, 6, W - 6);
      }
      return { eye: { x: tx * 0.94 + 1.8, y: W + 27, z: 16 }, look: { x: tx, y: ty, z: 0 }, fov: (land ? 37 : 54) / zoom };
    }
    /* Encuadre: aleja la cámara hasta que entren todos los círculos. Desde el hombro solo se puede abrir el lente:
     * si una opción queda a tu espalda devuelve null y se usa la vista de costado. */
    function fitted(cfg, mode, rect, pts) {
      if (!pts.length || mode === 'cenital') return cfg;
      const m = 30, top = rect.y + 96, out = Object.assign({}, cfg);
      const inside = c => pts.every(p => { const q = C.proj(c, p); return q && q.x > rect.x + m && q.x < rect.x + rect.w - m && q.y > top && q.y < rect.y + rect.h - m; });
      for (let i = 0; i < 16; i++) {
        if (inside(C.camera(out.eye, out.look, out.fov, rect))) return out;
        if (mode === 'hombro') out.fov = Math.min(100, out.fov * 1.12);
        else out.eye = { x: out.look.x + (out.eye.x - out.look.x) * 1.13, y: out.look.y + (out.eye.y - out.look.y) * 1.13, z: out.look.z + (out.eye.z - out.look.z) * 1.13 };
      }
      return mode === 'hombro' ? null : out;
    }

    /* ---------- Primitivas ---------- */
    function poly(pts, fill, stroke, lw) {
      const q = C.clipPoly(R.cam, pts); if (q.length < 3) return;
      ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i].x, q[i].y); ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
    }
    function line(a, b, col, w, dash) {
      const s = C.clipSeg(R.cam, a, b); if (!s) return;
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(s[0].x, s[0].y); ctx.lineTo(s[1].x, s[1].y); ctx.stroke(); ctx.setLineDash([]);
    }
    function ring(x, y, r, col, w, dash, fill) {
      const pts = []; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, z: 0.02 }); }
      ctx.setLineDash(dash || []); poly(pts, fill || null, col, w); ctx.setLineDash([]);
    }
    function tag(sp, text, bg, fg, size) {
      if (!sp) return null;
      ctx.font = '800 ' + (size || 13) + 'px ' + FONT;
      const w = ctx.measureText(text).width + 12, h = (size || 13) + 8, x = sp.x - w / 2, y = sp.y - h;
      ctx.fillStyle = bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, sp.x, y + h / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      return { x, y, w, h };
    }
    function arrow(a, b, col, dash, w) { // flecha en el piso, en metros; w = grosor (3 por defecto)
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, k = (w || 3) / 3, hl = 1.3 * Math.min(1.6, k), hw = 0.7 * Math.min(1.6, k), tip = { x: b.x, y: b.y, z: 0.03 };
      line({ x: a.x, y: a.y, z: 0.03 }, { x: b.x - ux * hl * 0.8, y: b.y - uy * hl * 0.8, z: 0.03 }, col, w || 3, dash);
      poly([tip, { x: b.x - ux * hl - uy * hw, y: b.y - uy * hl + ux * hw, z: 0.03 }, { x: b.x - ux * hl + uy * hw, y: b.y - uy * hl - ux * hw, z: 0.03 }], col);
    }

    /* ---------- Cancha ---------- */
    function ground() {
      const full = { x: 0, y: 0, w: R.Wd, h: R.Hd };
      const sky = ctx.createLinearGradient(0, 0, 0, full.h); sky.addColorStop(0, '#0a1422'); sky.addColorStop(0.5, '#16283f'); sky.addColorStop(1, '#0e3a24');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, full.w, full.h);
      // tribuna y carteles del lado de enfrente
      poly([{ x: -30, y: -9, z: 0 }, { x: L + 30, y: -9, z: 0 }, { x: L + 30, y: -22, z: 13 }, { x: -30, y: -22, z: 13 }], '#223349');
      for (let i = 0; i < 5; i++) { const y = -10.5 - i * 2.4, z = 1.5 + i * 2.4; line({ x: -30, y, z }, { x: L + 30, y, z }, 'rgba(255,255,255,0.09)', 2, [3, 5]); }
      poly([{ x: -40, y: -60, z: 0 }, { x: L + 40, y: -60, z: 0 }, { x: L + 40, y: W + 60, z: 0 }, { x: -40, y: W + 60, z: 0 }], '#114d2b');
      for (let i = 0; i < 12; i++) { const x0 = i * L / 12, x1 = (i + 1) * L / 12; poly([{ x: x0, y: 0, z: 0 }, { x: x1, y: 0, z: 0 }, { x: x1, y: W, z: 0 }, { x: x0, y: W, z: 0 }], i % 2 ? '#1b8a4c' : '#187e45'); }
      poly([{ x: 4, y: -3.4, z: 0 }, { x: L - 4, y: -3.4, z: 0 }, { x: L - 4, y: -3.4, z: 0.9 }, { x: 4, y: -3.4, z: 0.9 }], '#0f2740', 'rgba(255,255,255,0.25)', 1);
      const lw = Math.max(1.5, R.cam.focal / 340), LC = '#f5f7f2', seg = (x0, y0, x1, y1) => line({ x: x0, y: y0, z: 0.01 }, { x: x1, y: y1, z: 0.01 }, LC, lw);
      seg(0, 0, L, 0); seg(L, 0, L, W); seg(L, W, 0, W); seg(0, W, 0, 0); seg(L / 2, 0, L / 2, W);
      const bx = 0.12 * L, by0 = 0.27 * W, by1 = 0.73 * W;
      [[0, bx], [L, L - bx]].forEach(q => { seg(q[0], by0, q[1], by0); seg(q[1], by0, q[1], by1); seg(q[1], by1, q[0], by1); });
      ring(L / 2, W / 2, 5.6, LC, lw); ring(L / 2, W / 2, 0.22, LC, 1, null, LC); ring(9, W / 2, 0.2, LC, 1, null, LC); ring(L - 9, W / 2, 0.2, LC, 1, null, LC);
    }
    function goal(x, s) { // s: hacia dónde queda la red, afuera de la cancha
      const col = '#f4f6fa', k = Math.max(2, R.cam.focal / 150), net = 'rgba(232,238,246,0.3)';
      for (let y = GOAL_Y0; y <= GOAL_Y1 + 0.01; y += 1.1) line({ x, y, z: GOAL_H }, { x: x + s * GOAL_D, y, z: 0 }, net, 1);
      for (let z = 0; z <= GOAL_H; z += 0.6) line({ x: x + s * GOAL_D * (1 - z / GOAL_H), y: GOAL_Y0, z }, { x: x + s * GOAL_D * (1 - z / GOAL_H), y: GOAL_Y1, z }, net, 1);
      line({ x, y: GOAL_Y0, z: 0 }, { x, y: GOAL_Y0, z: GOAL_H }, col, k); line({ x, y: GOAL_Y1, z: 0 }, { x, y: GOAL_Y1, z: GOAL_H }, col, k);
      line({ x, y: GOAL_Y0, z: GOAL_H }, { x, y: GOAL_Y1, z: GOAL_H }, col, k);
    }

    /* ---------- Jugador ---------- */
    function kitOf(p) { return p.role === 'ARQ' ? KIT['k' + p.team] : KIT[p.team]; }
    function figure(p, a, bm, opt) {
      const local = bm ? A.ballLocal(a, bm) : null, ps = A.pose(a, p, local, R.clock), w = A.toWorld(a, ps), cam = R.cam, kit = kitOf(p);
      const P = {}; let bad = false;
      Object.keys(w).forEach(n => { const q = C.proj(cam, w[n]); if (!q) bad = true; P[n] = q; });
      if (bad) return;
      const k = cam.focal / P.head.d, lw = Math.max(2, 0.11 * k), skin = SKIN[p.k % 5], hair = HAIR[(p.k * 3) % 5];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ring(a.x + (ps.shiftW ? ps.shiftW * -Math.sin(a.heading) : 0), a.y + (ps.shiftW ? ps.shiftW * Math.cos(a.heading) : 0), 0.42, null, 0, null, 'rgba(0,0,0,0.32)');
      const st = (x, y, c, t) => { ctx.strokeStyle = c; ctx.lineWidth = t; ctx.beginPath(); ctx.moveTo(x.x, x.y); ctx.lineTo(y.x, y.y); ctx.stroke(); };
      const mix = (x, y, t) => ({ x: lerp(x.x, y.x, t), y: lerp(x.y, y.y, t) });
      const leg = s => {
        const h = P['hip' + s], n = P['kn' + s], f = P['an' + s], sh = mix(h, n, 0.62);
        st(n, mix(n, f, 0.18), skin, lw); st(mix(n, f, 0.18), f, kit.socks, lw * 0.92); st(h, sh, kit.shorts, lw * 1.25); st(sh, n, skin, lw);
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(f.x, f.y, lw * 0.62, 0, 7); ctx.fill();
      };
      const arm = s => { const sh = P['sh' + s], e = P['el' + s], h = P['wr' + s], up = mix(sh, e, 0.45); st(up, e, skin, lw * 0.78); st(e, h, skin, lw * 0.72); st(sh, up, kit.shirt, lw * 0.9); };
      const body = () => {
        ctx.fillStyle = kit.shirt; ctx.beginPath(); ctx.moveTo(P.shL.x, P.shL.y); ctx.lineTo(P.shR.x, P.shR.y); ctx.lineTo(P.hipR.x, P.hipR.y); ctx.lineTo(P.hipL.x, P.hipL.y); ctx.closePath(); ctx.fill();
        ctx.lineWidth = lw * 0.5; ctx.strokeStyle = kit.shirt; ctx.stroke();
        if (k > 9) {
          const c = mix(mix(P.shL, P.shR, 0.5), mix(P.hipL, P.hipR, 0.5), 0.45);
          ctx.fillStyle = kit.num; ctx.font = '800 ' + Math.max(8, 0.3 * k) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(p.i + 1), c.x, c.y); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        }
      };
      // primero lo que queda más lejos de la cámara
      const rFar = P.anR.d > P.anL.d, far = rFar ? 'R' : 'L', near = rFar ? 'L' : 'R';
      leg(far); arm(far); body(); leg(near); arm(near);
      const hr = Math.max(2.2, 0.125 * k);
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(P.head.x, P.head.y, hr, 0, 7); ctx.fill();
      ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(P.head.x, P.head.y - hr * 0.12, hr * 1.02, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      if (opt.label) tag({ x: P.head.x, y: P.head.y - hr - 3 }, opt.label, opt.labelBg || '#ffdf50', opt.labelFg || '#1b1500', 12);
      else if (k < 12) tag({ x: P.head.x, y: P.head.y - hr - 2 }, String(p.i + 1), p.team ? 'rgba(160,30,40,.85)' : 'rgba(14,70,120,.85)', '#fff', 10);
      R.playersScreen.push({ k: p.k, x: (P.head.x + P.anR.x) / 2, y: (P.head.y + P.anR.y) / 2, r: Math.max(20, k * 0.9) });
    }
    function ballDraw(bm) {
      const sp = C.proj(R.cam, bm), sh = C.proj(R.cam, { x: bm.x, y: bm.y, z: 0 }); if (!sp) return;
      const rad = Math.max(3, R.cam.focal * BALL_R / sp.d);
      if (sh) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, rad * 1.15, rad * 0.42, 0, 0, 7); ctx.fill(); }
      const gr = ctx.createRadialGradient(sp.x - rad * 0.35, sp.y - rad * 0.35, rad * 0.1, sp.x, sp.y, rad);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c9d2dc'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sp.x, sp.y, rad, 0, 7); ctx.fill();
      ctx.fillStyle = '#16202b'; ctx.beginPath(); ctx.arc(sp.x, sp.y, rad * 0.34, 0, 7); ctx.fill();
      ctx.strokeStyle = '#16202b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sp.x, sp.y, rad, 0, 7); ctx.stroke();
    }

    /* Altura de la pelota: el motor es 2D; se le da una parábola solo para el dibujo */
    let flightKey = null, flightFrom = null, flightLen = 1;
    function ballHeight(S) {
      const b = S.ball, f = S.passFlight;
      if (f) {
        if (flightKey !== f) { flightKey = f; flightFrom = { x: b.x, y: b.y }; const t = S.ps[f.toK]; flightLen = Math.max(0.05, Math.hypot((t.x - b.x) * L, (t.y - b.y) * W)); }
        const t = S.ps[f.toK], rest = Math.hypot((t.x - b.x) * L, (t.y - b.y) * W), k = u.clamp(1 - rest / Math.max(flightLen, rest), 0, 1);
        return Math.min(3.6, Math.max(0, flightLen - 14) * 0.16) * 4 * k * (1 - k) + BALL_R;
      }
      flightKey = null;
      const sp = Math.hypot(b.vx, b.vy) * L;
      if (b.kind === 'shot') return BALL_R + Math.min(1.7, sp * 0.03);
      if (b.kind === 'clear') return BALL_R + Math.min(5, sp * 0.3);
      return BALL_R;
    }

    /* ---------- Cuadro ---------- */
    // src: { ps, ball, carrier, me }; view: { mode, focus, zoom, marks, rings, arrows, safe }
    // dt = tiempo del partido (mueve a los jugadores); rdt = tiempo real (mueve la cámara, también con el juego congelado)
    R.draw = function (src, view, dt, S, rdt) {
      R.resize(); if (rdt == null) rdt = dt; R.clock += rdt;
      const v = view || {}, target = v.safe || { x: 0, y: 0, w: R.Wd, h: R.Hd };
      anim.step(src, dt, S);
      const z = S ? ballHeight(S) : (src.ball.z || BALL_R), bm = { x: src.ball.x * L, y: src.ball.y * W, z };
      const k = Math.min(1, rdt * 5), mixN = (a, b) => a + (b - a) * k;
      R.rect = R.rect ? { x: mixN(R.rect.x, target.x), y: mixN(R.rect.y, target.y), w: mixN(R.rect.w, target.w), h: mixN(R.rect.h, target.h) } : target;
      const pts = (v.marks || []).map(q => ({ x: q.x * L, y: q.y * W, z: 0 }));
      let mode = v.mode || 'tv', cfg = fitted(camFor(mode, src, target, v), mode, target, pts);
      if (!cfg) { mode = 'tv'; cfg = fitted(camFor(mode, src, target, v), mode, target, pts); }
      if (mode !== R.mode || !R.eye) { R.mode = mode; R.eye = cfg.eye; R.look = cfg.look; R.fov = cfg.fov; R.rect = target; R.pan = { yaw: 0, pitch: 0 }; } // corte directo, como en la tele
      const mix = (a, b) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
      R.eye = mix(R.eye, cfg.eye); R.look = mix(R.look, cfg.look); R.fov = lerp(R.fov, cfg.fov, k);
      const rect = R.rect;
      // paneo: se gira la dirección de la mirada alrededor del ojo (solo en las vistas 3D); no pasa por el suavizado para que siga al dedo
      let look = R.look;
      if (R.pannable() && (R.pan.yaw || R.pan.pitch)) {
        const dx = R.look.x - R.eye.x, dy = R.look.y - R.eye.y, dz = R.look.z - R.eye.z, hl = Math.hypot(dx, dy), len = Math.hypot(hl, dz);
        const ang = Math.atan2(dy, dx) + R.pan.yaw, el = u.clamp(Math.atan2(dz, hl) + R.pan.pitch, -1.45, 0.5);
        look = { x: R.eye.x + Math.cos(ang) * Math.cos(el) * len, y: R.eye.y + Math.sin(ang) * Math.cos(el) * len, z: R.eye.z + Math.sin(el) * len };
      }
      R.cam = C.camera(R.eye, look, R.fov, rect);
      R.marksScreen = []; R.playersScreen = []; R.handlesScreen = [];

      ground(); ctx.save();
      (v.rings || []).forEach(q => ring(q.x * L, q.y * W, q.r || 0.9, q.col || '#fff', q.w || 2, q.dash, q.fill));
      (v.arrows || []).forEach(q => { if (!q.noline) arrow({ x: q.a.x * L, y: q.a.y * W }, { x: q.b.x * L, y: q.b.y * W }, q.col || '#ffdf50', q.dash, q.w); });
      const pulse = 1 + 0.07 * Math.sin(R.clock * 5);
      (v.marks || []).forEach(q => {
        const col = q.ok ? '#65ffb1' : q.bad ? '#ff7b7b' : '#ffffff', fill = q.ok ? 'rgba(101,255,177,0.24)' : q.bad ? 'rgba(255,123,123,0.22)' : 'rgba(255,255,255,0.13)';
        ring(q.x * L, q.y * W, 1.7 * pulse, col, 3.5, null, fill);
      });
      const me = src.ps[src.me];
      if (me && mode !== 'cenital') ring(me.x * L, me.y * W, 1, '#ffdf50', 3);
      if (src.carrier >= 0 && src.ps[src.carrier]) { const c = src.ps[src.carrier]; ring(c.x * L, c.y * W, 0.75, 'rgba(255,255,255,0.85)', 2, [5, 4]); }

      const items = [], dist = p => C.toCam(R.cam, p).Z;
      src.ps.forEach(p => {
        const a = anim.get(p), d = dist({ x: a.x, y: a.y, z: 1 });
        if (d < 0.5) return;
        items.push({ d, draw: () => figure(p, a, bm, { label: p === me ? 'VOS' : null }) });
      });
      items.push({ d: dist({ x: 0, y: W / 2, z: 1 }), draw: () => goal(0, -1) }, { d: dist({ x: L, y: W / 2, z: 1 }), draw: () => goal(L, 1) });
      const bd = dist(bm); if (bd > 0.3) items.push({ d: bd - 0.2, draw: () => ballDraw(bm) });
      items.sort((a, b) => b.d - a.d); items.forEach(it => it.draw());

      // leyendas de las flechas de guía (qué hacer), encima de todo
      (v.arrows || []).forEach(q => { if (!q.label) return; const sp = C.proj(R.cam, { x: q.b.x * L, y: q.b.y * W, z: 0 }); if (sp) tag({ x: sp.x, y: sp.y - 10 }, q.label, q.col || '#ffdf50', '#10151c', 13); });
      // la punta de cada flecha editable: un círculo que se arrastra
      (v.arrows || []).forEach((q, idx) => {
        if (!q.handle) return;
        ring(q.b.x * L, q.b.y * W, 1.25 * pulse, '#ffdf50', 3, null, 'rgba(255,223,80,0.3)');
        const sp = C.proj(R.cam, { x: q.b.x * L, y: q.b.y * W, z: 0 }); if (sp) R.handlesScreen.push({ k: idx, x: sp.x, y: sp.y });
      });
      // las letras de las opciones van encima de todo y se pueden tocar
      (v.marks || []).forEach(q => {
        const sp = C.proj(R.cam, { x: q.x * L, y: q.y * W, z: 0 }); if (!sp) return;
        const box = tag({ x: sp.x, y: sp.y + 11 }, q.label, q.ok ? '#17805f' : q.bad ? '#a32a30' : '#ffdf50', q.ok || q.bad ? '#fff' : '#1b1500', 15);
        R.marksScreen.push({ label: q.label, x: sp.x, y: sp.y, box });
      });
      if (v.caption) { // leyenda para el video: nombre de la pizarra y su idea
        const fs = Math.max(13, Math.round(R.Hd / 32)), pad = fs * 0.7;
        ctx.font = '800 ' + fs + 'px ' + FONT; const w1 = ctx.measureText(v.caption.title).width;
        ctx.font = '600 ' + Math.round(fs * 0.82) + 'px ' + FONT; const w2 = ctx.measureText(v.caption.sub || '').width, bw = Math.min(R.Wd - pad * 2, Math.max(w1, w2) + pad * 2), bh = fs * 2.5 + pad;
        ctx.fillStyle = 'rgba(9,16,24,0.82)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(pad, R.Hd - bh - pad, bw, bh, 10); else ctx.rect(pad, R.Hd - bh - pad, bw, bh); ctx.fill();
        ctx.fillStyle = '#ffdf50'; ctx.font = '800 ' + fs + 'px ' + FONT; ctx.fillText(v.caption.title, pad * 2, R.Hd - bh - pad + fs * 1.25);
        ctx.fillStyle = '#e6edf7'; ctx.font = '600 ' + Math.round(fs * 0.82) + 'px ' + FONT; ctx.fillText(v.caption.sub || '', pad * 2, R.Hd - bh - pad + fs * 2.4);
      }
      ctx.restore();
    };

    /* ---------- Toques ---------- */
    R.floorAt = function (sx, sy) { if (!R.cam) return null; const w = C.unprojFloor(R.cam, sx, sy); return w ? C.fromM(w) : null; };
    R.markAt = function (sx, sy) {
      let best = null, bd = 44;
      R.marksScreen.forEach(q => { const d = Math.hypot(sx - q.x, sy - q.y); if (d < bd) { bd = d; best = q; } });
      return best;
    };
    // paneo con el dedo: arrastrar a la derecha mueve la escena a la derecha (la cámara gira hacia la izquierda)
    R.pannable = () => R.mode === 'alta' || R.mode === 'hombro';
    R.panBy = function (dx, dy) {
      if (!R.pannable()) return false;
      R.pan.yaw = u.clamp(R.pan.yaw - dx * 0.0042, -2.2, 2.2); R.pan.pitch = u.clamp(R.pan.pitch + dy * 0.0036, -0.8, 0.9); return true;
    };
    R.panned = () => R.pannable() && (Math.abs(R.pan.yaw) > 0.02 || Math.abs(R.pan.pitch) > 0.02);
    R.resetPan = () => { R.pan = { yaw: 0, pitch: 0 }; };
    R.handleAt = function (sx, sy) {
      let best = null, bd = 40;
      (R.handlesScreen || []).forEach(q => { const d = Math.hypot(sx - q.x, sy - q.y); if (d < bd) { bd = d; best = q; } });
      return best;
    };
    R.playerAt = function (sx, sy, team) {
      let best = null, bd = 1e9;
      R.playersScreen.forEach(q => { if (team != null && Math.floor(q.k / 7) !== team) return; const d = Math.hypot(sx - q.x, sy - q.y); if (d < q.r * 1.6 && d < bd) { bd = d; best = q; } });
      return best;
    };
    return R;
  }

  F7.render = { create };
})(typeof window !== 'undefined' ? window : globalThis);
