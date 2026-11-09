#!/usr/bin/env node
/* Prueba de la app instalable: manifiesto, íconos, service worker y que abra SIN conexión (Playwright; no es dependencia del juego).
 * Sirve la carpeta por http como lo hace Vercel con cleanUrls (/partido sin .html). Uso:  node tests/ui-pwa.js   (F7_CHANNEL=chrome usa el Chrome instalado) */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(path.join(__dirname, '..')), res = [];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
let stamp = 1; // cambia lo que sirve el servidor, para probar que la versión nueva llega al instante
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index'; let f = path.join(root, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('no'); }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); if (p === '/js/audio.js') return r.end(fs.readFileSync(f, 'utf8') + '\n// build ' + stamp); fs.createReadStream(f).pipe(r);
});
const ok = (n, c, d) => res.push((c ? 'OK   ' : 'FAIL ') + n + (d ? '  ' + d : ''));
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port, errs = [];
  const b = await chromium.launch(process.env.F7_CHANNEL ? { channel: process.env.F7_CHANNEL } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'allow' }), pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });

  const mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  ok('manifiesto: nombre, standalone y colores', !!mf.name && !!mf.short_name && mf.display === 'standalone' && !!mf.theme_color && !!mf.background_color);
  const need = ['192x192', '512x512'], purposes = mf.icons.map(i => i.sizes + ':' + i.purpose);
  ok('manifiesto: íconos 192, 512 y maskable', need.every(s => mf.icons.some(i => i.sizes === s && i.type === 'image/png')) && mf.icons.some(i => i.purpose === 'maskable'), purposes.join(' '));
  ok('manifiesto: los archivos de los íconos existen y miden lo que dicen', mf.icons.filter(i => i.type === 'image/png').every(i => { const f = path.join(root, i.src); if (!fs.existsSync(f)) return false; const w = fs.readFileSync(f).readUInt32BE(16); return w === parseInt(i.sizes); }));
  ok('manifiesto: start_url y atajos responden', await Promise.all([mf.start_url, ...mf.shortcuts.map(s => s.url)].map(u => pg.request.get(base + u).then(r => r.ok()))).then(a => a.every(Boolean)));

  for (const page of ['/']) {
    await pg.goto(base + page); await pg.waitForLoadState('load');
    ok(page + ': enlaza el manifiesto y el ícono de iPhone', await pg.evaluate(() => !!document.querySelector('link[rel=manifest]') && !!document.querySelector('link[rel=apple-touch-icon]')));
  }
  await pg.goto(base + '/');
  const sw = await pg.evaluate(async () => { const r = await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
  ok('service worker activo', sw.active, sw.scope);
  const keys = await pg.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
  const must = ['/', '/js/coach.js', '/js/perfil.js', '/css/partido.css', '/manifest.webmanifest', '/icons/icon-192.png', '/js/audio.js'];
  ok('se guardó todo para usar sin conexión', must.every(m => keys.includes(m)), keys.length + ' archivos' + (must.filter(m => !keys.includes(m)).length ? ' · faltan ' + must.filter(m => !keys.includes(m)) : ''));

  await pg.goto(base + '/'); await pg.waitForTimeout(300);
  const front = await pg.evaluate(() => { const r = document.getElementById('install').getBoundingClientRect(); return { top: r.top, vis: !document.getElementById('install').hidden, h: innerHeight }; });
  ok('el aviso de instalar se ve arriba, en la primera pantalla', front.vis && front.top > 0 && front.top < front.h * 0.6, 'a ' + Math.round(front.top) + ' px de ' + front.h);
  // la versión nueva se ve al instante (no a la segunda apertura) y, sin conexión, responde lo último que bajó
  const build = () => pg.evaluate(async () => (await (await fetch('/js/audio.js')).text()).match(/build (\d+)/)[1]);
  const b1 = await build(); stamp = 2; const b2 = await build(); await pg.reload(); await pg.waitForTimeout(300); const b3 = await pg.evaluate(async () => (await (await fetch('/js/audio.js')).text()).match(/build (\d+)/)[1]);
  ok('estando en línea ves la versión nueva enseguida', b1 === '1' && b2 === '2' && b3 === '2', 'build ' + b1 + ' → ' + b2 + ' → ' + b3);
  await ctx.setOffline(true); const b4 = await build().catch(() => 'error'); await ctx.setOffline(false);
  ok('sin conexión responde lo último que bajó', b4 === '2', 'build ' + b4);
  // lo importante: sin internet la app abre, el partido corre y el progreso sigue
  await pg.reload(); await pg.waitForTimeout(400); await ctx.setOffline(true);
  for (const page of ['/']) {
    const r = await pg.goto(base + page).catch(() => null); await pg.waitForTimeout(300);
    ok('sin conexión abre ' + page, !!r && r.ok() && (await pg.title()).length > 3, await pg.title());
  }
  await pg.goto(base + '/'); await pg.waitForTimeout(300); await pg.tap('#posGrid .chip[data-i="3"]'); await pg.tap('#start'); await pg.waitForTimeout(1800);
  ok('sin conexión el partido corre', await pg.evaluate(() => F7.state.seconds > 0.8 && !document.getElementById('hud').hidden));
  const inst = await pg.evaluate(() => ({ box: !!document.getElementById('install') }));
  ok('hay lugar para el aviso de instalar', inst.box);
  await ctx.setOffline(false); await pg.goto(base + '/'); await pg.waitForTimeout(300);
  const txt = await pg.evaluate(() => document.getElementById('install').innerText);
  ok('el menú explica cómo instalarla', /instal|pantalla de inicio/i.test(txt), txt.replace(/\n/g, ' ').slice(0, 70));
  // Android/Chrome: aparece el botón nativo y al tocarlo se pide instalar
  await pg.evaluate(() => { window.__prompted = 0; const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted++; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  ok('con el aviso del navegador aparece el botón "Instalar la app"', await pg.isVisible('#installBtn') && /Instalar la app en el celular o tablet/.test(await pg.textContent('#installBtn')));
  await pg.tap('#installBtn'); ok('tocar el botón pide instalar', await pg.evaluate(() => window.__prompted === 1));
  await b.close(); srv.close();
  const fail = res.filter(r => r.startsWith('FAIL')).length, out = res.join('\n') + '\n\nErrores de consola: ' + (errs.length ? errs.join(' | ') : 'ninguno') + '\n' + (res.length - fail) + '/' + res.length + ' OK\n';
  console.log(out); fs.writeFileSync(path.join(__dirname, 'ui-pwa-last-run.txt'), out); process.exit(fail || errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
