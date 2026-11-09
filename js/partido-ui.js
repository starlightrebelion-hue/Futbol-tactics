/* partido-ui.js — interfaz del partido con entrenador y de las pizarras (único módulo de esta página que toca el DOM).
 * Partido: bucle de juego, HUD, tarjetas y toques sobre la cancha. Pizarras: ver, animar, editar y rendir examen de cada fase. */
(function (g) {
  'use strict';
  const F7 = g.F7, S = F7.state, u = F7.u, FI = F7.ficha, T = F7.trainer, CO = F7.coach, $ = id => document.getElementById(id), DT = 1 / 60;
  const KEY = 'f7partido.v1', KEY_FICHA = 'f7ficha.v1', KEY_PERFIL = 'f7perfil.v1';
  const CAMS = [['tv', 'TV'], ['alta', '3D'], ['hombro', 'Hombro'], ['cenital', 'Pizarra']];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Guardado (si no hay localStorage, la app sigue andando) ---------- */
  const load = k => { try { const r = g.localStorage && g.localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
  const save = (k, v) => { try { if (g.localStorage) g.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignorar */ } };
  const saved = load(KEY) || {};
  const clampSpeed = v => Math.max(20, Math.min(120, Math.round((+v || 60) / 5) * 5));
  const st = { speed: clampSpeed(saved.speed), sound: saved.sound !== false, guideOn: false, me: saved.me != null ? saved.me : 5, mode: saved.mode || 'cartas', cam: saved.cam || 'tv', data: saved.data && saved.data.v === 1 ? saved.data : CO.emptyData(), screen: 'menu', paused: false, coach: null, acc: 0, last: 0, shapeOn: false, board: null };
  let fichaGuardada = load(KEY_FICHA); if (!FI.valida(fichaGuardada)) fichaGuardada = null;
  const fichas = FI.crear(fichaGuardada);
  const persist = () => save(KEY, { me: st.me, mode: st.mode, cam: st.cam, data: st.data, speed: st.speed, sound: st.sound });
  const persistFicha = () => save(KEY_FICHA, fichas.exportar());
  const perfil = F7.perfil.create(load(KEY_PERFIL));
  const persistPerfil = () => save(KEY_PERFIL, perfil.data);

  const R = F7.render.create($('cv'));
  const audio = F7.audio.create({ on: st.sound });

  function show(id) { st.screen = id; $('menu').hidden = id !== 'menu'; $('hud').hidden = id !== 'hud'; $('board').hidden = id !== 'board'; $('ficha').hidden = id !== 'ficha'; }

  /* ---------- Menú ---------- */
  function radarSvg(as) { // un sector por aspecto: rojo = todavía te falta, verde = ya lo manejás
    const Z = 240, c = Z / 2, r = Z * 0.32, n = as.length, pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v]; };
    const col = l => (l == null ? '#ffffff22' : 'hsl(' + Math.round(120 * u.clamp(l / 5, 0, 1)) + ',72%,48%)');
    const grid = [0.25, 0.5, 0.75, 1].map(v => '<polygon class="g" points="' + as.map((_, i) => pt(i, v).join(',')).join(' ') + '"/>').join('');
    const sec = as.map((a, i) => { const v = a.score == null ? 0.08 : Math.max(0.1, a.score / 100); return '<polygon points="' + c + ',' + c + ' ' + pt(i - 0.5, v * 0.98).join(',') + ' ' + pt(i, v).join(',') + ' ' + pt(i + 0.5, v * 0.98).join(',') + '" fill="' + col(a.lvl) + '" fill-opacity=".8"/>'; }).join('');
    const lab = as.map((a, i) => { const q = pt(i, 1.3); return '<text x="' + q[0] + '" y="' + q[1] + '" text-anchor="middle" dominant-baseline="middle" fill="' + (a.lvl == null ? '#9fb3c4' : col(a.lvl)) + '">' + esc(a.label) + (a.score == null ? '' : ' ' + a.score) + '</text>'; }).join('');
    return '<svg class="radar" viewBox="0 0 ' + Z + ' ' + Z + '" role="img" aria-label="Radar de progreso">' + grid + sec + lab + '</svg>';
  }
  function renderMenu() {
    show('menu');
    $('posGrid').innerHTML = T.POS.map(p => '<button class="chip' + (p.i === st.me ? ' on' : '') + '" data-i="' + p.i + '"><b>' + p.name + '</b><small>#' + (p.i + 1) + ' · ' + p.short + '</small></button>').join('');
    document.querySelectorAll('#modeSeg .chip').forEach(b => b.classList.toggle('on', b.dataset.v === st.mode));
    $('camSeg').innerHTML = CAMS.slice(0, 3).map(c => '<button class="chip' + (c[0] === st.cam ? ' on' : '') + '" data-v="' + c[0] + '"><b>' + c[1] + '</b></button>').join('');
    F7.match.init({ seed: 1 }); // el radar lee los datos guardados a través de un entrenador sin partido
    const c = CO.create({ me: st.me, data: st.data, fichas }), as = c.aspects(); c.stop();
    $('radar').innerHTML = as.some(a => a.n) ? radarSvg(as) : 'Todavía no hay datos. ¡Jugá un partido!';
  }
  $('posGrid').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { st.me = +b.dataset.i; persist(); renderMenu(); } });
  $('modeSeg').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { st.mode = b.dataset.v; persist(); renderMenu(); } });
  $('camSeg').addEventListener('click', e => { const b = e.target.closest('.chip'); if (b) { st.cam = b.dataset.v; persist(); renderMenu(); } });
  $('wipe').addEventListener('click', () => { if (g.confirm('¿Borrar todo tu progreso guardado?')) { st.data = CO.emptyData(); persist(); perfil.reset(); persistPerfil(); renderMenu(); } });
  $('start').addEventListener('click', () => { audio.ensure(); startMatch(); });
  $('boards').addEventListener('click', () => openBoard('salida', 'menu'));

  /* ---------- Partido ---------- */
  function viewButtons(box, cur, onPick) {
    box.innerHTML = CAMS.map(c => '<button data-v="' + c[0] + '" class="' + (c[0] === cur ? 'on' : '') + '">' + c[1] + '</button>').join('');
    box.onclick = e => { const b = e.target.closest('button'); if (b) onPick(b.dataset.v); };
  }
  function pickCam(v) { st.cam = v; persist(); viewButtons($('views'), st.cam, pickCam); }
  function startMatch() {
    F7.match.init({}); F7.hooks.say = m => { $('say').textContent = m; }; F7.hooks.onGoal = t => callout(t === 0 ? '¡GOOOL!' : 'Gol del rival', t === 0 ? 'good' : 'warn');
    audio.ensure(); R.resetPan(); st.guideOn = st.mode === 'manual'; paintHud();
    R.anim.reset(); st.paused = false; st.acc = 0; st.shapeOn = false; $('shape').hidden = true; $('pause').textContent = '⏸'; $('card').hidden = true;
    const c = st.coach = CO.create({ me: st.me, mode: st.mode, data: st.data, fichas, seed: Date.now() & 0xffff });
    perfil.startMatch();
    c.on('save', persist).on('stat', e => perfil.add(e)).on('callout', o => callout(o.text, o.kind)).on('panel', showCard).on('answer', showAnswer).on('verdict', v => { if (!v.ok) audio.bad(); })
      .on('resume', () => { $('card').hidden = true; }).on('cancel', () => { $('card').hidden = true; }).on('ask', () => { $('card').hidden = true; R.resetPan(); });
    viewButtons($('views'), st.cam, pickCam); show('hud'); st.last = performance.now();
  }
  function endMatch() { if (st.coach) { st.coach.stop(); st.coach = null; perfil.endMatch({ pos: st.me, score: S.score, secs: S.seconds }); } persist(); persistPerfil(); renderMenu(); }
  $('exit').addEventListener('click', endMatch);
  $('pause').addEventListener('click', () => { st.paused = !st.paused; $('pause').textContent = st.paused ? '▶' : '⏸'; });
  $('toShape').addEventListener('click', () => { st.shapeOn = !st.shapeOn; $('shape').hidden = !st.shapeOn; });
  const pizarraActual = () => (st.coach && st.coach.q && st.coach.q.pizarra) || FI.faseActual(0).pizarra;
  $('toBoard').addEventListener('click', () => { st.paused = true; $('pause').textContent = '▶'; openBoard(pizarraActual(), 'hud'); });
  $('cBoard').addEventListener('click', () => openBoard(pizarraActual(), 'hud'));

  let calloutT = 0;
  function callout(text, kind) { const e = $('callout'); e.textContent = text; e.className = kind || ''; e.hidden = false; clearTimeout(calloutT); calloutT = setTimeout(() => { e.hidden = true; }, 1700); }

  /* ---------- Tarjeta ---------- */
  function showCard(q) {
    const sp = CO.SLOW[q.lvl];
    $('cTag').textContent = CO.SIT[q.sit] + ' · lectura ' + (q.lvl + 1) + '/' + CO.SLOW.length + ' · ' + (sp === 0 ? 'congelado' : sp >= 1 ? 'velocidad real' : 'x' + sp.toFixed(2));
    $('cTitle').textContent = q.title; $('cText').textContent = q.text; $('cFb').textContent = ''; $('cFb').className = 'fb'; $('cGo').hidden = true;
    $('cBoard').hidden = !q.pizarra; $('cTimer').hidden = !q.deadline;
    const box = $('cOpts'); box.innerHTML = '';
    q.opts.forEach(o => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'opt'; b.innerHTML = '<b>' + o.letter + '</b><span></span>';
      b.lastChild.textContent = o.label; b.addEventListener('click', () => st.coach.answer(o)); box.appendChild(b);
    });
    $('card').hidden = false;
  }
  function showAnswer(r) {
    const fb = $('cFb'); fb.className = 'fb ' + (r.ok ? 'good' : 'bad'); fb.textContent = (r.ok ? '✓ ' : '✗ ') + r.text;
    if (r.ok) audio.ok(); else audio.bad();
    $('cOpts').querySelectorAll('.opt').forEach((b, i) => { const x = r.q.opts[i]; b.disabled = true; b.classList.toggle('ok', !!x.ok); b.classList.toggle('bad', x === r.o && !x.ok); });
    $('cTimer').hidden = true; if (r.q.lvl === 0) $('cGo').hidden = false;
    $('card').scrollTop = $('card').scrollHeight;
  }
  $('cGo').addEventListener('click', () => { if (st.coach) st.coach.resume(); });

  /* El encuadre deja afuera lo que tapa la tarjeta: así los círculos siempre se ven */
  function safeRect(panel) {
    const w = g.innerWidth, h = g.innerHeight;
    if (!panel || panel.hidden) return { x: 0, y: 0, w, h };
    const r = panel.getBoundingClientRect();
    return w > h ? { x: 0, y: 0, w: Math.max(200, r.left), h } : { x: 0, y: 0, w, h: Math.max(200, r.top) };
  }
  /* ---------- Velocidad, guía y sonido ---------- */
  function setSpeed(v) { st.speed = clampSpeed(v); ['optSpeed', 'hudSpeed'].forEach(id => { $(id).value = String(st.speed); $(id + 'Out').textContent = st.speed + ' %' + (st.speed === 100 ? ' · normal' : ''); }); persist(); }
  $('optSpeed').addEventListener('input', e => setSpeed(e.target.value)); $('hudSpeed').addEventListener('input', e => setSpeed(e.target.value));
  $('toSpeed').addEventListener('click', () => { $('speedPop').hidden = !$('speedPop').hidden; });
  $('speedPop').addEventListener('click', e => { const b = e.target.closest('button[data-sp]'); if (b) setSpeed(+b.dataset.sp); });
  $('toGuide').addEventListener('click', () => { st.guideOn = !st.guideOn; paintHud(); });
  $('toSound').addEventListener('click', () => { st.sound = !st.sound; audio.on = st.sound; audio.ensure(); if (st.sound) audio.ok(); persist(); paintHud(); });
  $('toCenter').addEventListener('click', () => R.resetPan());
  $('guideBar').addEventListener('click', () => { $('gLegend').hidden = !$('gLegend').hidden; });
  $('gLegend').innerHTML = Object.keys(CO.GUIDE).map(k => '<div><i style="background:' + CO.GUIDE[k].col + '"></i><span><b>' + esc(CO.GUIDE[k].name) + '</b><small>' + esc(CO.GUIDE[k].hint) + '</small></span></div>').join('');
  function paintHud() { $('toGuide').classList.toggle('off', !st.guideOn); $('toSound').textContent = st.sound ? '🔊' : '🔇'; $('toSound').classList.toggle('off', !st.sound); if (!st.guideOn) { $('guide').hidden = true; } }
  setSpeed(st.speed);
  function guideNow() { // lo que tenés que hacer ahora (solo con la guía prendida y sin tarjeta abierta)
    const c = st.coach; if (!st.guideOn || !c || c.q) return null;
    return c.guide();
  }
  function hud() {
    const c = st.coach, t = Math.floor(S.seconds), fase = FI.faseActual(0);
    $('scoreB').textContent = S.score[0]; $('scoreR').textContent = S.score[1]; $('clock').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    const gd = guideNow(); st.guide = gd; $('guide').hidden = !gd; $('toCenter').hidden = !R.panned();
    if (gd) { $('gDot').style.background = gd.col; $('guideBar').style.borderColor = gd.col; $('gName').textContent = gd.name + ' ·'; $('gName').style.color = gd.col; $('gText').textContent = gd.text; }
    $('phase').textContent = fase.nombre; $('rate').textContent = c.asked ? c.right + '/' + c.asked : '';
    const q = c.q; if (q && q.deadline && !q.done) $('cTimer').firstChild.style.width = Math.max(0, (q.deadline - c.real) / 4 * 100) + '%';
    if (st.shapeOn) {
      const sh = CO.shape(0, fase.conPelota);
      $('shape').innerHTML = '<b>Distribución · ' + esc(fase.nombre) + '</b><br>Ancho ' + Math.round(sh.amplitud) + ' m · Largo ' + Math.round(sh.profundidad) + ' m<br>Entre líneas ' + sh.lineas.map(v => Math.round(v)).join(' / ') + ' m · ' + sh.carriles + ' carriles · ' + sh.detras + ' detrás de la pelota' +
        (sh.issues.length ? sh.issues.slice(0, 2).map(i => '<div class="is">• ' + esc(i.text) + '</div>').join('') : '<div class="fine">Bien repartido para esta fase.</div>');
    }
  }
  function matchView() {
    const c = st.coach, v = c.view, me = S.ps[st.me], rings = [];
    const safe = safeRect($('card')), arrows = [];
    const gd = st.guide;
    if (gd && !c.q) {
      const d = Math.hypot(gd.x - me.x, gd.y - me.y);
      arrows.push({ a: { x: me.x, y: me.y }, b: { x: gd.x, y: gd.y }, col: gd.col, w: 5.5, label: gd.name, noline: d < 0.03 });
      rings.push({ x: gd.x, y: gd.y, r: 1.2, col: gd.col, w: 3, dash: [5, 4], fill: gd.col + '33' });
    }
    if (c.target && c.target.until > S.seconds) rings.push({ x: c.target.x, y: c.target.y, r: 0.7, col: '#ffdf50', w: 2, dash: [6, 5] });
    if ((v && v.shape) || st.shapeOn) S.team[0].forEach(p => { if (p !== me && p.i > 0) rings.push({ x: p.tx, y: p.ty, r: 0.8, col: 'rgba(143,208,255,.9)', w: 2, dash: [4, 4] }); });
    return { mode: (v && v.cam && st.cam !== 'cenital' ? v.cam : st.cam), focus: v ? v.focus : null, zoom: v ? v.zoom : 1, marks: v ? v.marks : null, rings, arrows, safe };
  }

  /* ---------- Bucle ---------- */
  const src = { get ps() { return S.ps; }, get ball() { return S.ball; }, get carrier() { return S.owner >= 0 ? S.carrier : -1; }, get me() { return st.me; } };
  function loop(now) {
    g.requestAnimationFrame(loop);
    const rdt = Math.max(0, Math.min(0.05, (now - st.last) / 1000)); st.last = now;
    if (st.screen === 'hud' && st.coach) {
      const c = st.coach; let sim = 0;
      if (!st.paused) { const sdt = c.frame(rdt) * (st.speed / 100); st.acc += sdt; while (st.acc >= DT) { F7.match.update(DT); c.afterStep(); st.acc -= DT; sim += DT; } }
      hud(); R.draw(src, matchView(), sim, S, rdt);
    } else if (st.screen === 'board') boardFrame(rdt);
  }

  /* Tocar la cancha: elegir un círculo o mover a tu jugador. Arrastrar con el dedo en las vistas 3D (3D y Hombro): mirar para otro lado. */
  const cv = $('cv'), TAP = 12;
  let touch = null;
  function tapMatch(x, y) {
    const c = st.coach; if (!c) return;
    const q = c.q;
    if (q && !q.done) { const m = R.markAt(x, y); if (m && $('card').hidden === false) { const o = q.opts.find(k => k.letter === m.label); if (o) c.answer(o); } return; }
    if (q) return;
    const w = R.floorAt(x, y); if (w && w.x >= 0 && w.x <= 1 && w.y >= 0 && w.y <= 1) c.moveTo(w.x, w.y);
  }
  cv.addEventListener('pointerdown', ev => {
    if (st.screen === 'board') return boardDown(ev);
    if (st.screen !== 'hud' || !st.coach) return;
    audio.ensure(); $('speedPop').hidden = true;
    touch = { id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, pan: false };
  });
  cv.addEventListener('pointermove', ev => {
    if (st.screen === 'board') return boardMove(ev);
    if (!touch || ev.pointerId !== touch.id) return;
    const dx = ev.clientX - touch.x, dy = ev.clientY - touch.y; touch.x = ev.clientX; touch.y = ev.clientY;
    if (!touch.pan && R.pannable() && Math.hypot(ev.clientX - touch.x0, ev.clientY - touch.y0) > TAP) touch.pan = true;
    if (touch.pan) R.panBy(dx, dy);
  });
  const release = ev => {
    if (st.board) st.board.drag = null;
    const t = touch; if (!t || (ev && ev.pointerId !== t.id)) return; touch = null;
    if (ev && ev.type === 'pointercancel') return;
    if (!t.pan && Math.hypot(t.x - t.x0, t.y - t.y0) <= TAP * 2) tapMatch(t.x0, t.y0);
  };
  g.addEventListener('pointerup', release); g.addEventListener('pointercancel', release);

  /* ---------- Ficha del jugador ---------- */
  let fichaFrom = 'menu', fichaPos = null;
  function openFicha(from) { fichaFrom = from; fichaPos = st.me; persistPerfil(); renderFicha(); show('ficha'); }
  function renderFicha() {
    $('pfPos').innerHTML = '<button data-p="" class="' + (fichaPos == null ? 'on' : '') + '">Todas</button>' + T.POS.map(p => '<button data-p="' + p.i + '" class="' + (p.i === fichaPos ? 'on' : '') + '">' + esc(p.name) + '</button>').join('');
    $('pfBody').innerHTML = perfil.html({ pos: fichaPos, levels: st.data.lv });
    $('pfName').addEventListener('change', e => { perfil.data.name = e.target.value.trim().slice(0, 24) || 'Jugador'; persistPerfil(); });
  }
  $('toFicha').addEventListener('click', () => openFicha('menu'));
  $('toFicha2').addEventListener('click', () => { st.paused = true; $('pause').textContent = '▶'; openFicha('hud'); });
  $('pfPos').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { fichaPos = b.dataset.p === '' ? null : +b.dataset.p; renderFicha(); } });
  $('pfBack').addEventListener('click', () => { if (fichaFrom === 'hud' && st.coach) { show('hud'); st.last = performance.now(); } else renderMenu(); });
  $('pfReset').addEventListener('click', e => {
    const b = e.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tocá de nuevo para confirmar'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Reiniciar ficha'; }, 3000); return; }
    b.dataset.armed = ''; b.textContent = 'Reiniciar ficha'; perfil.reset(); if (st.coach) perfil.startMatch(); persistPerfil(); renderFicha();
  });

  /* ---------- Pizarras ---------- */
  const ANIM = { delay: 0.7, move: 2.4, hold: 1.1 };   // segundos: quieto · se mueve · quieto
  const ANIM_TOTAL = ANIM.delay + ANIM.move + ANIM.hold;
  const ease = k => k * k * (3 - 2 * k);
  // los 14 jugadores a los t segundos de la animación: tus 7 siguen sus flechas y los rivales quedan quietos
  function animAt(id, t) {
    const k = ease(u.clamp((t - ANIM.delay) / ANIM.move, 0, 1)), nos = fichas.nos(id), fl = fichas.flechas(id);
    const mine = nos.map((q, i) => { const f = fl.find(x => x[0] === i); return { k: i, i, team: 0, role: F7.match.ROLES[i], x: f ? q[0] + (f[1] - q[0]) * k : q[0], y: f ? q[1] + (f[2] - q[1]) * k : q[1] }; });
    return mine.concat(fichas.rival(id).map((q, i) => ({ k: 7 + i, i, team: 1, role: F7.match.ROLES[i], x: q[0], y: q[1] })));
  }
  const flechasVista = (id, handle) => fichas.flechas(id).map(f => ({ a: fichas.punto(id, f[0]), b: { x: f[1], y: f[2] }, col: '#ffdf50', dash: [7, 5], handle: !!handle }));
  const boardNote = (msg, bad) => { const b = $('bFb'); b.className = 'fb ' + (bad ? 'bad' : 'good'); b.textContent = msg; };

  function openBoard(id, from) {
    if (!st.board || from) st.board = { from: from || 'menu', cam: 'cenital', sel: -1, drag: null, exam: null, anim: null, rec: null };
    const B = st.board; if (B.rec) return;
    B.id = id; B.sel = -1; B.exam = null; B.anim = null; B.drag = null; B.ps = animAt(id, 0); B.video = null;
    R.anim.reset(); renderBoard(); show('board');
  }
  function renderBoard() {
    const B = st.board, b = FI.POR_ID[B.id];
    $('bTitle').textContent = b.nombre + (fichas.editada(B.id) ? ' ✎' : '');
    $('bGroups').innerHTML = FI.GRUPOS.map(x => '<button data-g="' + x[0] + '" class="' + (x[0] === b.grupo ? 'on' : '') + '">' + x[1] + '</button>').join('');
    $('bList').innerHTML = FI.PIZARRAS.filter(x => x.grupo === b.grupo).map(x => '<button data-b="' + x.id + '" class="' + (x.id === B.id ? 'on' : '') + '">' + esc(x.nombre) + '</button>').join('');
    $('bIdea').textContent = b.idea; $('bFb').textContent = ''; $('bFb').className = 'fb'; $('bExam').classList.toggle('on', !!B.exam); $('bShare').hidden = true;
    viewButtons($('bViews'), B.cam, v => { if (!B.rec) { B.cam = v; renderBoard(); } });
    task();
  }
  function task() {
    const B = st.board, i = B.exam ? st.me : B.sel >= 0 && B.sel < 7 ? B.sel : st.me, mine = B.sel < 0 || B.sel < 7;
    $('bTask').innerHTML = B.exam ? '<b>Examen · ' + esc(FI.NOMBRES[st.me]) + ':</b> tocá la cancha donde te parás.'
      : B.sel >= 7 ? '<b>Rival ' + esc(FI.NOMBRES[B.sel - 7]) + ':</b> arrastralo para mover dónde se para el rival.'
      : '<b>' + esc(FI.NOMBRES[i]) + ':</b> ' + esc(fichas.tarea(B.id, i)) + (B.sel < 0 ? ' <small>(tocá un jugador para elegirlo y arrastralo; arrastrá el círculo amarillo para mover la flecha)</small>' : '');
    const sel = B.sel >= 0 && B.sel < 7 && !B.exam, has = sel && fichas.flechaDe(B.id, B.sel) >= 0;
    $('bEditRow').hidden = !sel; $('bArrow').hidden = has; $('bNoArrow').hidden = !has;
    void mine;
  }
  $('bGroups').addEventListener('click', e => { const x = e.target.closest('button'); if (x) openBoard(FI.PIZARRAS.find(k => k.grupo === x.dataset.g).id); });
  $('bList').addEventListener('click', e => { const x = e.target.closest('button'); if (x) openBoard(x.dataset.b); });
  $('bBack').addEventListener('click', () => { if (st.board.rec) return; const f = st.board.from; R.anim.reset(); if (f === 'hud' && st.coach) { show('hud'); st.last = performance.now(); } else renderMenu(); });
  $('bPlay').addEventListener('click', () => { const B = st.board; if (B.rec) return; B.exam = null; B.sel = -1; B.anim = { t: 0 }; renderBoard(); });
  $('bExam').addEventListener('click', () => {
    const B = st.board; if (B.rec) return; if (B.exam) { B.exam = null; openBoard(B.id); return; }
    B.anim = null; B.ps = animAt(B.id, 0); B.exam = { done: false, spot: null }; B.sel = -1; B.ps[st.me].x = -1; renderBoard();
  });
  $('bReset').addEventListener('click', () => { if (st.board.rec) return; fichas.restablecer(st.board.id); persistFicha(); openBoard(st.board.id); });
  $('bArrow').addEventListener('click', () => { const B = st.board; if (B.sel >= 0 && fichas.agregarFlecha(B.id, B.sel)) { persistFicha(); $('bTitle').textContent = FI.POR_ID[B.id].nombre + ' ✎'; task(); } });
  $('bNoArrow').addEventListener('click', () => { const B = st.board; if (B.sel >= 0 && fichas.quitarFlecha(B.id, B.sel)) { persistFicha(); $('bTitle').textContent = FI.POR_ID[B.id].nombre + ' ✎'; task(); } });
  $('bExport').addEventListener('click', () => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(fichas.exportar(), null, 1)], { type: 'application/json' })); a.download = 'pizarras-futbol7.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('bImport').addEventListener('click', () => $('bFile').click());
  $('bFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => {
      let j = null; try { j = JSON.parse(r.result); } catch (x) { /* inválido */ }
      if (!FI.valida(j)) { boardNote('Ese archivo no es una pizarra válida.', true); return; }
      fichas.reemplazar(j); persistFicha(); openBoard(st.board.id);
    }; r.readAsText(f); e.target.value = '';
  });

  /* ---------- Guardar la animación como video ----------
   * Se dibuja en un canvas aparte de 1280×720 (no depende del tamaño de tu pantalla) y se graba con MediaRecorder.
   * Chrome (Android y PC) y Safari graban MP4; Firefox solo WebM: en ese caso se guarda WebM y se avisa. */
  const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  function recordVideo() {
    const B = st.board; if (!B || B.rec) return;
    if (typeof g.MediaRecorder === 'undefined' || !g.HTMLCanvasElement.prototype.captureStream) return boardNote('Este navegador no puede grabar video. Probá con Chrome o Safari.', true);
    const mime = VIDEO_TYPES.find(m => g.MediaRecorder.isTypeSupported(m)); if (!mime) return boardNote('Este navegador no tiene un formato de video para grabar.', true);
    const mp4 = /mp4/.test(mime), id = B.id, b = FI.POR_ID[id], mode = B.cam, W = 1280, H = 720;
    const cv2 = document.createElement('canvas'), R2 = F7.render.create(cv2, { w: W, h: H });
    let stream = cv2.captureStream(0); const manual = !!stream.getVideoTracks()[0].requestFrame; if (!manual) stream = cv2.captureStream(30);
    const track = stream.getVideoTracks()[0], chunks = []; let rec;
    try { rec = new g.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 }); } catch (e) { return boardNote('No se pudo iniciar la grabación: ' + e.message, true); }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    B.rec = { t: 0 }; B.anim = null; B.sel = -1; B.exam = null; B.ps = animAt(id, 0); task();
    document.querySelectorAll('#bPanel .btn').forEach(x => { x.disabled = true; }); $('bShare').hidden = true;
    const t0 = performance.now(); let last = t0, timer = 0;
    const finish = () => {
      document.querySelectorAll('#bPanel .btn').forEach(x => { x.disabled = false; }); B.rec = null;
      const blob = new Blob(chunks, { type: mp4 ? 'video/mp4' : 'video/webm' }), name = 'pizarra-' + id + (mp4 ? '.mp4' : '.webm');
      if (blob.size < 2000) return boardNote('No se pudo generar el video. Probá de nuevo.', true);
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      B.video = { blob, name, file: typeof g.File === 'function' ? new g.File([blob], name, { type: blob.type }) : null };
      boardNote('✓ Video guardado: ' + name + ' (' + (blob.size / 1048576).toFixed(1) + ' MB)' + (mp4 ? '' : '. Este navegador graba WebM, no MP4: si lo necesitás en MP4, grabalo desde Chrome o Safari.'));
      if (g.navigator.canShare && B.video.file && g.navigator.canShare({ files: [B.video.file] })) $('bShare').hidden = false;
    };
    rec.onstop = finish; rec.onerror = () => { clearInterval(timer); document.querySelectorAll('#bPanel .btn').forEach(x => { x.disabled = false; }); B.rec = null; boardNote('Falló la grabación.', true); };
    rec.start();
    timer = setInterval(() => {
      const now = performance.now(), t = (now - t0) / 1000, dt = Math.min(0.1, (now - last) / 1000); last = now;
      R2.draw({ ps: animAt(id, Math.min(t, ANIM_TOTAL)), ball: { x: b.pelota[0], y: b.pelota[1], z: 0.17 }, carrier: -1, me: -1 }, { mode, fit: true, arrows: flechasVista(id, false), caption: { title: b.nombre, sub: b.idea } }, dt, null, dt);
      if (manual) track.requestFrame();
      B.rec.t = t; $('bFb').className = 'fb'; $('bFb').textContent = '🔴 Grabando… ' + Math.max(0, Math.ceil(ANIM_TOTAL - t)) + ' s';
      if (t >= ANIM_TOTAL + 0.3) { clearInterval(timer); rec.stop(); }
    }, 1000 / 30);
  }
  $('bMp4').addEventListener('click', recordVideo);
  $('bShare').addEventListener('click', () => { const v = st.board.video; if (v && v.file) g.navigator.share({ files: [v.file], title: FI.POR_ID[st.board.id].nombre }).catch(() => { /* cancelado */ }); });

  /* ---------- Tocar y arrastrar en la pizarra ---------- */
  function boardDown(ev) {
    const B = st.board; if (!B || B.rec) return; const x = ev.clientX, y = ev.clientY;
    if (B.exam) {
      if (B.exam.done) return; const w = R.floorAt(x, y); if (!w) return;
      const goal = fichas.punto(B.id, st.me), d = T.metric(w, goal), grade = T.grade(d), pts = Math.round(100 * u.clamp(1 - (d - 0.04) / 0.3, 0, 1));
      B.exam = { done: true, spot: { x: u.clamp(w.x, 0, 1), y: u.clamp(w.y, 0, 1) }, goal };
      B.ps[st.me].x = goal.x; B.ps[st.me].y = goal.y;
      const fb = $('bFb'); fb.className = 'fb ' + (d <= 0.17 ? 'good' : 'bad'); fb.textContent = grade + ' · ' + pts + ' pts. ' + fichas.tarea(B.id, st.me);
      return;
    }
    if (B.anim) { B.anim = null; B.ps = animAt(B.id, 0); }               // tocar durante la animación la corta
    const w = R.floorAt(x, y), off = (px, py) => (w ? { x: px - w.x, y: py - w.y } : { x: 0, y: 0 });
    const h0 = R.handleAt(x, y), p0 = R.playerAt(x, y, null);
    // la punta de una flecha y un jugador pueden quedar pegados: se agarra lo que está más cerca del dedo
    const h = h0 && (!p0 || Math.hypot(x - h0.x, y - h0.y) <= Math.hypot(x - p0.x, y - p0.y)) ? h0 : null;
    if (h) { const f = fichas.flechas(B.id)[h.k]; B.sel = f[0]; B.drag = { t: 'f', idx: h.k, off: off(f[1], f[2]) }; task(); return; }
    const p = p0;
    if (p) {
      const q = B.ps[p.k]; B.sel = p.k; B.drag = p.k < 7 ? { t: 'p', i: p.k, off: off(q.x, q.y) } : { t: 'r', i: p.k - 7, off: off(q.x, q.y) }; task();
    } else { B.sel = -1; task(); }
  }
  function boardMove(ev) {
    const B = st.board; if (!B || !B.drag || B.rec) return; const w = R.floorAt(ev.clientX, ev.clientY); if (!w) return;
    const d = B.drag, id = B.id, x = w.x + d.off.x, y = w.y + d.off.y;
    if (d.t === 'f') fichas.moverFlecha(id, d.idx, x, y);
    else if (d.t === 'p') { fichas.mover(id, d.i, x, y); const q = fichas.punto(id, d.i); B.ps[d.i].x = q.x; B.ps[d.i].y = q.y; }
    else { fichas.moverRival(id, d.i, x, y); const q = fichas.rival(id)[d.i]; B.ps[7 + d.i].x = q[0]; B.ps[7 + d.i].y = q[1]; }
    persistFicha(); $('bTitle').textContent = FI.POR_ID[id].nombre + ' ✎';
  }
  function boardFrame(rdt) {
    const B = st.board, b = FI.POR_ID[B.id], a = B.anim;
    if (a && !B.rec) { a.t += rdt; B.ps = animAt(B.id, a.t); if (a.t >= ANIM_TOTAL) { B.anim = null; B.ps = animAt(B.id, 0); } }
    const hide = B.exam && !B.exam.done, ps = hide ? B.ps.filter(p => p.k !== st.me) : B.ps;
    const arrows = hide ? [] : flechasVista(B.id, !B.anim && !B.exam && !B.rec);
    const rings = []; if (B.sel >= 0 && !B.rec) rings.push({ x: B.ps[B.sel].x, y: B.ps[B.sel].y, r: 1.5, col: '#ffdf50', w: 3 });
    const marks = B.exam && B.exam.done ? [{ x: B.exam.goal.x, y: B.exam.goal.y, label: '✓', ok: true }].concat(T.metric(B.exam.spot, B.exam.goal) > 0.09 ? [{ x: B.exam.spot.x, y: B.exam.spot.y, label: '✕', bad: true }] : []) : null;
    const top = $('bList').getBoundingClientRect().bottom, side = safeRect($('bPanel')), safe = { x: 0, y: top, w: side.w, h: Math.max(160, side.h - top) };
    R.draw({ ps, ball: { x: b.pelota[0], y: b.pelota[1], z: 0.17 }, carrier: -1, me: -1 }, { mode: B.cam, marks, rings, arrows, safe }, rdt, null);
  }

  renderMenu(); st.last = performance.now(); g.requestAnimationFrame(loop);
  g.addEventListener('pagehide', persistPerfil);
  g.F7partido = { st, R, audio, fichas, perfil, openBoard, startMatch };
})(window);
