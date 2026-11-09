/* sw.js — service worker: la app abre sin conexión.
 * Estrategia: se guarda todo al instalar y después se busca primero en la red (versión nueva al instante); la caché solo
 * responde si no hay conexión o la red tarda más de 4 s. Subí VERSION si cambiás la lista de archivos. */
const VERSION = 'f7-v5';
const FILES = [
  './', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'css/partido.css',
  'js/team-model.js', 'js/debug.js', 'js/match.js', 'js/ball.js', 'js/tactics.js', 'js/team-intelligence.js', 'js/roles.js', 'js/defense.js', 'js/ai.js',
  'js/trainer.js', 'js/cam3d.js', 'js/ficha.js', 'js/puppet.js', 'js/coach.js', 'js/audio.js', 'js/perfil.js', 'js/render3d.js', 'js/partido-ui.js', 'js/pwa.js'
];

self.addEventListener('install', e => {
  // un archivo que falle no tiene que impedir la instalación del resto
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, url = new URL(r.url);
  if (r.method !== 'GET' || url.origin !== self.location.origin) return;
  // primero la red (así siempre ves la versión nueva); si no hay conexión o tarda más de 4 s, lo guardado
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const net = fetch(r, { cache: 'no-cache' }).then(res => { if (res && res.ok) c.put(r, res.clone()); return res; });
    net.catch(() => null); e.waitUntil(net.catch(() => null));
    try { return await Promise.race([net, new Promise((_, no) => setTimeout(no, 4000))]); } catch (err) { /* sin red o lenta */ }
    const hit = await c.match(r, { ignoreSearch: true }); if (hit) return hit;
    try { return await net; } catch (err) { return r.mode === 'navigate' ? (await c.match('./')) || Response.error() : Response.error(); }
  })());
});
