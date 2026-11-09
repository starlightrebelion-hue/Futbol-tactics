/* audio.js — sonidos de acierto y error, sintetizados con WebAudio (sin archivos), como en Vóley TV.
 * Bien: tres notas que suben. Mal: dos notas graves que bajan, con un zumbido. Los navegadores solo dejan sonar
 * después de un toque del usuario: ensure() se llama desde un toque. Sin dependencias: se prueba en Node con un AudioContext falso. */
(function (g) {
  'use strict';
  const F7 = g.F7 = g.F7 || {};

  function create(o) {
    o = o || {};
    const A = { on: o.on !== false, ac: null, played: { ok: 0, bad: 0 }, vol: o.vol == null ? 0.22 : o.vol };

    // Se llama desde un toque: crea el contexto la primera vez y lo despierta si el navegador lo dejó dormido
    A.ensure = function () {
      try {
        if (!A.ac) { const AC = o.AC || g.AudioContext || g.webkitAudioContext; if (!AC) return false; A.ac = new AC(); }
        if (A.ac.state === 'suspended' && A.ac.resume) A.ac.resume();
        return true;
      } catch (e) { return false; }
    };

    // una nota: frecuencia (con deslizamiento opcional), forma de onda, volumen y envolvente corta para que no haga "click"
    function tone(t0, f0, dur, type, vol, f1) {
      const ac = A.ac, osc = ac.createOscillator(), gn = ac.createGain();
      osc.type = type; osc.frequency.setValueAtTime(f0, t0);
      if (f1) osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.linearRampToValueAtTime(vol * A.vol, t0 + 0.015);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gn); gn.connect(ac.destination); osc.start(t0); osc.stop(t0 + dur + 0.03);
    }
    function play(kind) {
      if (!A.on || !A.ensure()) return false;
      try {
        const t = A.ac.currentTime + 0.01;
        if (kind === 'ok') { [523.25, 659.25, 783.99].forEach((f, i) => tone(t + i * 0.09, f, 0.22, 'triangle', 1)); }
        else { tone(t, 196, 0.3, 'sawtooth', 0.9, 160); tone(t, 185, 0.3, 'square', 0.35, 150); tone(t + 0.17, 130, 0.38, 'sawtooth', 0.9, 98); }
        A.played[kind]++; return true;
      } catch (e) { return false; }
    }
    A.ok = () => play('ok');
    A.bad = () => play('bad');
    return A;
  }

  F7.audio = { create };
})(typeof window !== 'undefined' ? window : globalThis);
