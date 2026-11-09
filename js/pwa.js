/* pwa.js — app instalable: registra el service worker (funciona sin conexión) y ofrece "Instalar en el celular".
 * En Android/Chrome usa el aviso nativo; en iPhone no existe, así que se explican los pasos. Si ya está instalada, no muestra nada. */
(function (g) {
  'use strict';
  const doc = g.document, nav = g.navigator;
  const standalone = () => (g.matchMedia && g.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;

  if ('serviceWorker' in nav && /^https?:$/.test(g.location.protocol)) {
    // cuando una versión nueva toma el control, se recarga sola (salvo en pleno partido, para no cortártelo)
    const had = !!nav.serviceWorker.controller; let reloaded = false;
    nav.serviceWorker.addEventListener('controllerchange', () => {
      const hud = doc.getElementById('hud');
      if (!had || reloaded || (hud && !hud.hidden)) return; reloaded = true; g.location.reload();
    });
    g.addEventListener('load', () => { nav.serviceWorker.register('sw.js').catch(() => { /* sin SW la app sigue andando, solo que con conexión */ }); });
  }

  let deferred = null;
  g.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; paint(); });
  g.addEventListener('appinstalled', () => { deferred = null; paint(); });

  const ios = /iphone|ipad|ipod/i.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  function paint() {
    const box = doc.getElementById('install'); if (!box) return;
    if (standalone()) { box.hidden = true; return; }
    box.hidden = false;
    if (deferred) box.innerHTML = '<button class="go" id="installBtn">📲 Instalar la app en el celular o tablet</button>';
    else if (ios) box.innerHTML = '<div class="card install-card">📲 <b>Instalá la app en tu iPhone o iPad:</b> tocá <b>Compartir</b> (el cuadrado con la flecha) y elegí <b>Agregar a pantalla de inicio</b>.</div>';
    else box.innerHTML = '<div class="card install-card">📲 <b>Instalá la app en tu celular o tablet:</b> abrí el menú del navegador (⋮) y elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</div>';
    const b = doc.getElementById('installBtn');
    if (b) b.addEventListener('click', () => { const d = deferred; deferred = null; d.prompt(); d.userChoice.finally(paint); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', paint); else paint();
  g.F7pwa = { standalone };
})(window);
