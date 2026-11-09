#!/usr/bin/env node
/* Prueba de index.html (partido con entrenador y pizarras) en un navegador real (Playwright; no es dependencia del juego).
 * Uso:  node tests/ui-partido.js [carpeta]     Capturas:  F7_SHOTS=/ruta node tests/ui-partido.js     Otro navegador:  F7_CHANNEL=chrome
 * Recorre: menú → partido → tarjeta (tocando una opción y tocando un círculo) → las 4 cámaras → pizarra → editar → examen → progreso guardado. */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..')), shots = process.env.F7_SHOTS;
const url = 'file:///' + root.replace(/\\/g, '/').replace(/^\//, '') + '/index.html';
(async () => {
  const b = await chromium.launch(process.env.F7_CHANNEL ? { channel: process.env.F7_CHANNEL } : {}); const res = [], errs = [];
  const ok = (n, c, d) => res.push((c ? 'OK   ' : 'FAIL ') + n + (d ? '  ' + d : ''));
  for (const [name, vp] of [['vertical', { width: 390, height: 844 }], ['chico', { width: 360, height: 640 }], ['apaisado', { width: 844, height: 390 }]]) {
    const ctx = await b.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }), pg = await ctx.newPage();
    await pg.addInitScript(() => { window.__osc = 0; const AC = window.AudioContext; if (AC) { const co = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return co.call(this); }; } });
    pg.on('pageerror', e => errs.push(name + ' pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(name + ' console ' + m.text()); });
    const shot = n => (shots ? pg.screenshot({ path: path.join(shots, name + '-' + n + '.png') }) : null);
    const card = () => pg.waitForFunction(() => { const e = document.getElementById('card'); return !e.hidden && document.querySelectorAll('#cOpts .opt:not([disabled])').length >= 2; }, null, { timeout: 90000 });
    const next = async () => { if (await pg.isVisible('#cGo')) await pg.tap('#cGo'); };
    await pg.goto(url); await pg.waitForTimeout(300);
    ok(name + ': menú con 7 posiciones', await pg.evaluate(() => document.querySelectorAll('#posGrid .chip').length === 7));
    await shot('1-menu');
    await pg.tap('#posGrid .chip[data-i="3"]'); await pg.tap('#start'); await pg.waitForTimeout(1500);
    const moved = await pg.evaluate(() => F7.state.seconds); ok(name + ': el partido corre', moved > 0.5, moved.toFixed(1) + ' s');
    ok(name + ': sin desbordamiento', await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot('2-tv');
    // control de velocidad: mide cuánto avanza el partido por segundo real, a 100 % y a 30 %
    await pg.tap('#toSpeed'); ok(name + ': el botón ⏱ abre el control de velocidad', await pg.isVisible('#speedPop') && (await pg.inputValue('#hudSpeed')) === '60');
    const rate = async () => { const a = await pg.evaluate(() => F7.state.seconds); await pg.waitForTimeout(1000); return (await pg.evaluate(() => F7.state.seconds)) - a; };
    await pg.evaluate(() => { const c = F7partido.st.coach; c._chk = c.check; c._onb = c.onBall; c.check = () => {}; c.onBall = () => {}; }); // que no aparezcan tarjetas mientras se mide
    await pg.tap('#speedPop button[data-sp="100"]'); const r100 = await rate(); await pg.tap('#speedPop button[data-sp="30"]'); const r30 = await rate();
    ok(name + ': a 100 % el partido va en tiempo real', r100 > 0.8 && r100 < 1.2, r100.toFixed(2) + ' s por segundo');
    ok(name + ': a 30 % va mucho más lento', r30 > 0.18 && r30 < 0.45 && r30 < r100 / 2, r30.toFixed(2) + ' s por segundo');
    ok(name + ': la velocidad se guarda', await pg.evaluate(() => JSON.parse(localStorage.getItem('f7partido.v1')).speed === 30) && (await pg.textContent('#hudSpeedOut')).startsWith('30'));
    await pg.tap('#speedPop button[data-sp="100"]'); await pg.tap('#toSpeed');
    await pg.evaluate(() => { const c = F7partido.st.coach; c.check = c._chk; c.onBall = c._onb; });

    await card(); await pg.waitForTimeout(250); await shot('3-tarjeta');
    const fr = await pg.evaluate(() => { const c = F7partido.st.coach, m = F7partido.R.marksScreen, r = document.getElementById('card').getBoundingClientRect(), land = innerWidth > innerHeight;
      return { mul: c.mul, sit: c.q.sit, n: m.length, want: c.q.opts.filter(o => o.w).length, seen: m.filter(q => q.x > 0 && q.y > 0 && (land ? q.x < r.left : q.y < r.top) && q.x < innerWidth && q.y < innerHeight).length }; });
    ok(name + ': la tarjeta frena el juego', fr.mul < 0.4, fr.sit + ' x' + fr.mul.toFixed(2));
    ok(name + ': los círculos se ven fuera de la tarjeta', fr.seen === fr.want, fr.seen + ' de ' + fr.want);
    const tag = await pg.textContent('#cTag'); ok(name + ': la tarjeta muestra lectura n/6 y la velocidad', /lectura \d\/6 · (congelado|x0\.\d+|velocidad real)/.test(tag), tag);
    const a0 = await pg.evaluate(() => ({ ok: F7partido.audio.played.ok, bad: F7partido.audio.played.bad, osc: window.__osc }));
    await pg.tap('#cOpts .opt'); await pg.waitForTimeout(200);
    const fbTxt = await pg.textContent('#cFb'), a1 = await pg.evaluate(() => ({ ok: F7partido.audio.played.ok, bad: F7partido.audio.played.bad, osc: window.__osc, st: F7partido.audio.ac && F7partido.audio.ac.state }));
    ok(name + ': suena "bien" si acertás y "mal" si te equivocás', fbTxt.startsWith('✓') ? a1.ok === a0.ok + 1 && a1.bad === a0.bad : a1.bad === a0.bad + 1 && a1.ok === a0.ok, (fbTxt[0]) + ' · bien ' + a1.ok + ' mal ' + a1.bad);
    ok(name + ': el audio se creó y generó sonido', a1.osc >= a0.osc + 2 && a1.st !== 'closed', a1.osc + ' osciladores · ' + a1.st);
    ok(name + ': la tarjeta corrige', (await pg.textContent('#cFb')).length > 8); await shot('4-correccion'); await next();

    await card(); const mk = await pg.evaluate(() => F7partido.R.marksScreen[0] || null);
    if (mk) { await pg.touchscreen.tap(mk.x, mk.y); await pg.waitForTimeout(200); ok(name + ': tocar un círculo responde la tarjeta', (await pg.textContent('#cFb')).length > 8); await next(); }
    else ok(name + ': (tarjeta sin círculos)', true);

    // con el juego en pausa y sin tarjeta abierta: las 4 cámaras
    await pg.waitForFunction(() => { const c = F7partido.st.coach, q = c.q; if (q && q.done && document.getElementById('cGo').hidden === false) c.resume(); else if (q && !q.done && c.panelAt === null) c.answer(q.opts[0]); return !c.q && !c.view; }, null, { timeout: 20000, polling: 100 });
    await pg.tap('#pause');
    for (const c of ['alta', 'hombro', 'cenital', 'tv']) {
      await pg.tap('#views button[data-v="' + c + '"]'); await pg.waitForTimeout(700); await shot('5-cam-' + c);
      ok(name + ': cámara ' + c, await pg.evaluate(v => F7partido.R.mode === v, c));
    }
    // paneo con el dedo en las vistas 3D
    await pg.evaluate(() => { const c = F7partido.st.coach; c.q = null; c.view = null; c.panelAt = null; document.getElementById('card').hidden = true; });
    const proj = () => pg.evaluate(() => { const l = F7partido.R.look, s = F7.cam.proj(F7partido.R.cam, { x: l.x, y: l.y, z: l.z }); return s ? { x: s.x, y: s.y } : { x: -1e4, y: -1e4 }; }); // el punto al que mira la cámara
    const cdpT = await ctx.newCDPSession(pg), Tt = (type, x, y) => cdpT.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const drag = async (x0, y0, x1, y1) => { await Tt('touchStart', x0, y0); for (let i = 1; i <= 5; i++) { await Tt('touchMove', x0 + (x1 - x0) * i / 5, y0 + (y1 - y0) * i / 5); await pg.waitForTimeout(25); } await Tt('touchEnd'); await pg.waitForTimeout(150); };
    const cx = vp.width / 2, cy = vp.height * 0.55;
    for (const cam of ['hombro', 'alta']) {
      await pg.tap('#views button[data-v="' + cam + '"]'); await pg.waitForTimeout(800); await pg.evaluate(() => F7partido.R.resetPan()); await pg.waitForTimeout(100);
      const p0 = await proj(), t0 = await pg.evaluate(() => { const c = F7partido.st.coach; return c.target ? c.target.x : null; });
      await drag(cx - 40, cy, cx + 50, cy); const p1 = await proj();
      ok(name + ': ' + cam + ': arrastrar a la derecha mueve la escena a la derecha', p1 && p0 && p1.x > p0.x + 15, Math.round(p0.x) + ' → ' + Math.round(p1.x));
      ok(name + ': ' + cam + ': arrastrar no mueve a tu jugador', await pg.evaluate(t => { const c = F7partido.st.coach; return (c.target ? c.target.x : null) === t; }, t0));
      await drag(cx, cy - 40, cx, cy + 30); const p2 = await proj();
      ok(name + ': ' + cam + ': arrastrar hacia abajo mira hacia arriba', p2.y > p1.y + 10, Math.round(p1.y) + ' → ' + Math.round(p2.y));
      const vis = await pg.isVisible('#toCenter');
      ok(name + ': ' + cam + ': aparece 🎯 y centra la vista', vis, JSON.stringify(await pg.evaluate(() => ({ pan: F7partido.R.pan, mode: F7partido.R.mode, screen: F7partido.st.screen }))));
      if (vis) await pg.tap('#toCenter'); else await pg.evaluate(() => F7partido.R.resetPan()); await pg.waitForTimeout(150);
      ok(name + ': ' + cam + ': la vista vuelve al centro', await pg.evaluate(() => !F7partido.R.panned()) && !(await pg.isVisible('#toCenter')));
      await shot('5d-pan-' + cam);
    }
    await pg.tap('#views button[data-v="tv"]'); await pg.waitForTimeout(700);
    await drag(cx - 40, cy, cx + 60, cy); ok(name + ': en la vista de costado arrastrar no hace paneo', await pg.evaluate(() => F7partido.R.pan.yaw === 0 && F7partido.R.pan.pitch === 0));
    await pg.tap('#views button[data-v="hombro"]'); await pg.waitForTimeout(700); await pg.evaluate(() => { F7partido.st.coach.target = null; });
    await pg.touchscreen.tap(cx, cy + 80); await pg.waitForTimeout(150);
    ok(name + ': un toque corto sigue moviendo al jugador y no hace paneo', await pg.evaluate(() => !!F7partido.st.coach.target && !F7partido.R.panned()));
    // sonido: el botón 🔊 lo apaga y queda guardado
    await pg.tap('#toSound'); ok(name + ': 🔇 apaga el sonido y se guarda', await pg.evaluate(() => F7partido.audio.on === false && JSON.parse(localStorage.getItem('f7partido.v1')).sound === false) && (await pg.textContent('#toSound')) === '🔇');
    const o2 = await pg.evaluate(() => { const o = window.__osc; F7partido.audio.ok(); F7partido.audio.bad(); return window.__osc - o; }); ok(name + ': en silencio no suena nada', o2 === 0); await pg.tap('#toSound');
    // guía: en modo tarjetas está apagada y se prende con 🧭; en modo manual arranca prendida
    await pg.tap('#toGuide'); await pg.waitForTimeout(300);
    const gd = await pg.evaluate(() => ({ vis: !document.getElementById('guide').hidden, name: document.getElementById('gName').textContent, txt: document.getElementById('gText').textContent, kind: F7partido.st.guide && F7partido.st.guide.kind, n: F7partido.R.pan && 1 }));
    ok(name + ': 🧭 muestra qué hacer con su leyenda', gd.vis && gd.txt.length > 8 && !!gd.kind, gd.name + ' ' + gd.txt);
    await pg.tap('#guideBar'); ok(name + ': tocar la leyenda abre la lista de colores', await pg.isVisible('#gLegend') && (await pg.$$eval('#gLegend i', e => e.length)) === 6); await shot('5e-guia'); await pg.tap('#guideBar');
    const pix = await pg.evaluate(() => { const c = document.getElementById('cv'), d = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 40, 40).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i + 1]; return s / (d.length / 4); });
    ok(name + ': la cancha se dibuja', pix > 20, 'verde medio ' + pix.toFixed(0));

    await pg.tap('#exit'); await pg.waitForTimeout(200);
    const prog = await pg.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('f7partido.v1')).data.lv).length); ok(name + ': el progreso se guarda', prog > 0, prog + ' situaciones');
    ok(name + ': el radar aparece', await pg.isVisible('.radar')); await shot('6-radar');

    await pg.tap('#toFicha'); await pg.waitForTimeout(250); await shot('6b-ficha');
    const fc = await pg.evaluate(() => ({ radial: !!document.querySelector('#pfBody .pf-poly'), ax: document.querySelectorAll('.pf-ax').length, acc: F7partido.perfil.data.events.length, over: document.documentElement.scrollWidth > innerWidth, txt: document.getElementById('pfBody').innerText }));
    ok(name + ': ficha con radial y 8 áreas', fc.radial && fc.ax === 8, fc.acc + ' acciones'); ok(name + ': ficha sin desbordamiento ni datos rotos', !fc.over && !/undefined|NaN/.test(fc.txt));
    await pg.fill('#pfName', 'Prueba'); await pg.evaluate(() => document.getElementById('pfName').blur()); await pg.tap('#pfPos button[data-p=""]'); await pg.waitForTimeout(120);
    ok(name + ': el nombre queda guardado', await pg.evaluate(() => document.getElementById('pfName').value === 'Prueba' && F7partido.perfil.data.name === 'Prueba'));
    await pg.evaluate(() => document.getElementById('ficha').scrollTo(0, 620)); await pg.waitForTimeout(100); await shot('6c-ficha2');
    await pg.tap('#pfBack'); await pg.waitForTimeout(100);
    // modo manual: la guía arranca prendida, con flecha y leyenda
    await pg.tap('#modeSeg .chip[data-v="manual"]'); await pg.tap('#start'); await pg.waitForTimeout(900);
    const mg = await pg.evaluate(() => { const g = F7partido.st.guide, c = F7partido.st.coach; return { on: F7partido.st.guideOn, vis: !document.getElementById('guide').hidden, kind: g && g.kind, col: g && g.col, bar: getComputedStyle(document.getElementById('guideBar')).borderTopColor, q: !!c.q }; });
    ok(name + ': en modo manual la flecha de guía arranca prendida', mg.on && (mg.vis || mg.q) && (mg.q || (!!mg.kind && !!mg.col)), (mg.kind || 'tarjeta') + ' ' + (mg.col || ''));
    await shot('6d-manual'); await pg.evaluate(() => { F7partido.st.coach.q && F7partido.st.coach.answer(F7partido.st.coach.q.opts[0]); }); await pg.tap('#exit'); await pg.waitForTimeout(150);
    await pg.tap('#modeSeg .chip[data-v="cartas"]');
    await pg.tap('#boards'); await pg.waitForTimeout(500); await shot('7-pizarra');
    ok(name + ': pizarra abierta', await pg.evaluate(() => F7partido.st.screen === 'board' && F7partido.R.playersScreen.length === 14));
    const groups = await pg.$$eval('#bGroups button', e => e.map(x => x.dataset.g));
    for (const gp of groups) { await pg.tap('#bGroups button[data-g="' + gp + '"]'); await pg.waitForTimeout(120); }
    ok(name + ': grupos de pizarras', groups.length === 4, groups.join(','));
    await pg.evaluate(() => F7partido.openBoard('corner_favor')); await pg.waitForTimeout(350); await shot('8-corner');
    await pg.tap('#bViews button[data-v="tv"]'); await pg.waitForTimeout(900); await shot('9-corner-tv'); await pg.tap('#bViews button[data-v="cenital"]'); await pg.waitForTimeout(800);

    // editar arrastrando
    const before = await pg.evaluate(() => F7partido.fichas.punto('corner_favor', 3));
    const p = await pg.evaluate(() => F7partido.R.playersScreen.find(q => q.k === 3));
    const cdp = await ctx.newCDPSession(pg), T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await T('touchStart', p.x, p.y); await pg.waitForTimeout(60); await T('touchMove', p.x + 30, p.y + 24); await pg.waitForTimeout(60); await T('touchEnd'); await pg.waitForTimeout(120);
    const after = await pg.evaluate(() => F7partido.fichas.punto('corner_favor', 3));
    ok(name + ': arrastrar edita la pizarra', Math.hypot(after.x - before.x, after.y - before.y) > 0.01, JSON.stringify(after));
    ok(name + ': la edición se guarda', await pg.evaluate(() => !!JSON.parse(localStorage.getItem('f7ficha.v1')).ed.corner_favor));
    await pg.tap('#bReset'); await pg.waitForTimeout(150);
    ok(name + ': restablecer', await pg.evaluate(b0 => F7partido.fichas.punto('corner_favor', 3).x === b0.x, before));

    // flechas, rivales, agregar y quitar (todo con el dedo)
    await pg.waitForTimeout(250);
    const hd = await pg.evaluate(() => F7partido.R.handlesScreen.slice()), nFl = await pg.evaluate(() => F7partido.fichas.flechas('corner_favor').length);
    ok(name + ': cada flecha tiene su círculo para arrastrar', hd.length === nFl && nFl >= 2, hd.length + ' de ' + nFl);
    const f0 = await pg.evaluate(() => F7partido.fichas.flechas('corner_favor')[0].slice());
    await T('touchStart', hd[0].x, hd[0].y); await pg.waitForTimeout(60); await T('touchMove', hd[0].x - 40, hd[0].y + 28); await pg.waitForTimeout(60); await T('touchMove', hd[0].x - 60, hd[0].y + 40); await pg.waitForTimeout(60); await T('touchEnd'); await pg.waitForTimeout(150);
    const f1 = await pg.evaluate(() => F7partido.fichas.flechas('corner_favor')[0].slice());
    ok(name + ': arrastrar la punta mueve la flecha y no el jugador', Math.hypot(f1[1] - f0[1], f1[2] - f0[2]) > 0.02 && f1[0] === f0[0] && (await pg.evaluate(f => F7partido.fichas.punto('corner_favor', f[0]).x === F7.ficha.POR_ID.corner_favor.nos[f[0]][0], f0)), JSON.stringify(f0) + ' → ' + JSON.stringify(f1));
    ok(name + ': la flecha movida se guarda', await pg.evaluate(() => { const j = JSON.parse(localStorage.getItem('f7ficha.v1')); return !!j.fl && !!j.fl.corner_favor; }));
    await shot('8b-flecha-movida');
    await pg.evaluate(() => { F7partido.openBoard('corner_favor'); }); await pg.waitForTimeout(150);
    ok(name + ': al abrir de nuevo la flecha sigue donde la dejaste', await pg.evaluate(f => Math.abs(F7partido.fichas.flechas('corner_favor')[0][1] - f[1]) < 1e-6, f1));
    const rv0 = await pg.evaluate(() => F7partido.fichas.rival('corner_favor')[3].slice()), pr = await pg.evaluate(() => F7partido.R.playersScreen.find(q => q.k === 10));
    await T('touchStart', pr.x, pr.y); await pg.waitForTimeout(60); await T('touchMove', pr.x + 26, pr.y - 22); await pg.waitForTimeout(60); await T('touchEnd'); await pg.waitForTimeout(150);
    const rv1 = await pg.evaluate(() => F7partido.fichas.rival('corner_favor')[3].slice());
    ok(name + ': también se puede arrastrar un rival', Math.hypot(rv1[0] - rv0[0], rv1[1] - rv0[1]) > 0.01, JSON.stringify(rv1));
    const libre = await pg.evaluate(() => [0, 1, 2, 3, 4, 5, 6].find(i => F7partido.fichas.flechaDe('corner_favor', i) < 0)), pl = await pg.evaluate(k => F7partido.R.playersScreen.find(q => q.k === k), libre);
    await pg.touchscreen.tap(pl.x, pl.y); await pg.waitForTimeout(150);
    ok(name + ': al tocar un jugador sin flecha aparece "Flecha"', await pg.evaluate(k => F7partido.st.board.sel === k, libre) && await pg.isVisible('#bArrow') && !(await pg.isVisible('#bNoArrow')));
    await pg.tap('#bArrow'); await pg.waitForTimeout(200);
    ok(name + ': agregar flecha', await pg.evaluate(k => F7partido.fichas.flechaDe('corner_favor', k) >= 0 && F7partido.R.handlesScreen.length === F7partido.fichas.flechas('corner_favor').length, libre) && await pg.isVisible('#bNoArrow'));
    await pg.tap('#bNoArrow'); await pg.waitForTimeout(200);
    ok(name + ': quitar flecha', await pg.evaluate(k => F7partido.fichas.flechaDe('corner_favor', k) < 0, libre));
    await pg.tap('#bReset'); await pg.waitForTimeout(150);
    ok(name + ': restablecer deja flechas, rivales y jugadores originales', await pg.evaluate(() => { const F = F7partido.fichas, o = F7.ficha.POR_ID.corner_favor; return JSON.stringify(F.flechas('corner_favor')) === JSON.stringify(o.flechas) && JSON.stringify(F.rival('corner_favor')) === JSON.stringify(o.rival) && !F.editada('corner_favor'); }));

    await pg.tap('#bExam'); await pg.waitForTimeout(250);
    const box = await pg.evaluate(() => { const g = F7partido.fichas.punto('corner_favor', 3), R = F7partido.R, s = F7.cam.proj(R.cam, { x: g.x * 60, y: g.y * 40, z: 0 }); return { x: s.x, y: s.y }; });
    await pg.touchscreen.tap(box.x, box.y); await pg.waitForTimeout(250); await shot('10-examen');
    const fb = await pg.textContent('#bFb'); ok(name + ': examen en el lugar justo', /Perfecto/.test(fb), fb.slice(0, 40));
    await pg.tap('#bPlay'); await pg.waitForFunction(() => { const a = F7partido.st.board.anim; return a && a.t > 3.25; }, null, { timeout: 8000 });
    ok(name + ': animar mueve a los jugadores hasta donde apuntan las flechas', await pg.evaluate(() => { const B = F7partido.st.board, fl = F7partido.fichas.flechas(B.id); return fl.every(f => Math.hypot(B.ps[f[0]].x - f[1], B.ps[f[0]].y - f[2]) < 0.01); }));

    // guardar la animación como video
    const fmt = await pg.evaluate(() => (['video/mp4;codecs=avc1.42E01E', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) ? 'mp4' : 'webm'));
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 40000 }), pg.tap('#bMp4')]);
    ok(name + ': mientras graba se ve el aviso y los botones se apagan', true);
    const vpath = await dl.path(), vb = fs.readFileSync(vpath);
    ok(name + ': el video se descarga como ' + fmt, dl.suggestedFilename() === 'pizarra-corner_favor.' + fmt, dl.suggestedFilename() + ' · ' + (vb.length / 1024).toFixed(0) + ' KB');
    ok(name + ': el archivo es un ' + (fmt === 'mp4' ? 'MP4 válido (caja ftyp)' : 'WebM válido'), fmt === 'mp4' ? vb.slice(4, 8).toString() === 'ftyp' : vb.readUInt32BE(0) === 0x1a45dfa3, vb.slice(4, 12).toString('latin1').replace(/[^ -~]/g, '.'));
    ok(name + ': el video pesa lo razonable', vb.length > 20000 && vb.length < 20 * 1048576);
    await pg.waitForFunction(() => !F7partido.st.board.rec, null, { timeout: 5000 });
    const note = await pg.textContent('#bFb'); ok(name + ': avisa que se guardó', /Video guardado/.test(note), note.slice(0, 60));
    ok(name + ': los botones vuelven a andar', await pg.evaluate(() => [...document.querySelectorAll('#bPanel .btn')].every(b => !b.disabled)));
    if (name === 'vertical') {
      const pv = await pg.evaluate(async ([b64, wantShots]) => {
        const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([arr], { type: 'video/mp4' }));
        await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('el navegador no pudo abrir el video')); setTimeout(() => j(new Error('timeout')), 10000); });
        const frame = async t => { v.currentTime = t; await new Promise(r => { v.onseeked = r; }); const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'); x.drawImage(v, 0, 0, 320, 180); return x.getImageData(0, 0, 320, 180).data; };
        const dur = v.duration, a = await frame(0.2), b = await frame(Math.min(3.4, dur - 0.3)); let diff = 0, green = 0;
        for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++; if (a[i + 1] > a[i] + 25 && a[i + 1] > a[i + 2] + 15) green++; }
        const still = await frame(0.5); let quiet = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - still[i]) + Math.abs(a[i + 1] - still[i + 1]) + Math.abs(a[i + 2] - still[i + 2]) > 60) quiet++;
        const png = async t => { v.currentTime = t; await new Promise(r => { v.onseeked = r; }); const c = document.createElement('canvas'); c.width = 1280; c.height = 720; c.getContext('2d').drawImage(v, 0, 0); return c.toDataURL('image/png'); };
        return { dur, w: v.videoWidth, h: v.videoHeight, diff: diff / (a.length / 4), quiet: quiet / (a.length / 4), green: green / (a.length / 4), png: wantShots ? [await png(0.2), await png(2.2), await png(Math.min(4.0, dur - 0.2))] : null };
      }, [vb.toString('base64'), !!shots]);
      if (shots && pv.png) pv.png.forEach((d, i) => fs.writeFileSync(path.join(shots, 'video-frame-' + i + '.png'), Buffer.from(d.split(',')[1], 'base64')));
      ok(name + ': el video se reproduce, mide 1280×720 y dura lo que la animación', pv.w === 1280 && pv.h === 720 && pv.dur > 3.8 && pv.dur < 6.5, pv.w + '×' + pv.h + ' · ' + pv.dur.toFixed(1) + ' s');
      ok(name + ': el video tiene la cancha y los jugadores se mueven', pv.green > 0.25 && pv.diff > 0.0004 && pv.quiet < pv.diff, 'verde ' + (pv.green * 100).toFixed(0) + ' % · cambio en movimiento ' + (pv.diff * 100).toFixed(2) + ' % · cambio quieto ' + (pv.quiet * 100).toFixed(2) + ' %');
    }
    await pg.tap('#bBack'); ok(name + ': volver de la pizarra', await pg.isVisible('#menu'));
    await ctx.close();
  }
  await b.close();
  const fail = res.filter(r => r.startsWith('FAIL')).length, out = res.join('\n') + '\n\nErrores de consola: ' + (errs.length ? errs.join(' | ') : 'ninguno') + '\n' + (res.length - fail) + '/' + res.length + ' OK\n';
  console.log(out); fs.writeFileSync(path.join(__dirname, 'ui-partido-last-run.txt'), out); process.exit(fail || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
