/* perfil.js — ficha del jugador, portada de Vóley TV (profile.js). Sin DOM: arma el HTML como texto y se prueba en Node.
 * Registra lo que hace tu jugador (tarjetas, pases, remates, robos, pérdidas) y calcula nota general, radial por áreas,
 * lo que hacés bien y mal, y las tablas de métricas. Con pocos datos un área queda sin nota: un número con 2 acciones engañaría.
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u;
  const MAX_EVENTS = 4000, MIN = 4;
  const AXES = [['UBI', 'Ubicación'], ['TRA', 'Transición'], ['PRE', 'Presión'], ['LEC', 'Lectura'], ['DEC', 'Decisión'], ['PAS', 'Pase'], ['REM', 'Remate'], ['REA', 'Reacción']];
  // cuánto pesa cada área en la nota general según la posición
  const ROLE_W = {
    ARQ: { UBI: 3, TRA: 0.8, PRE: 0.5, LEC: 2, DEC: 2, PAS: 2, REM: 0, REA: 1 },
    DEF: { UBI: 3, TRA: 2, PRE: 2.5, LEC: 1, DEC: 1, PAS: 1.5, REM: 0.3, REA: 1 },
    MED: { UBI: 2, TRA: 2, PRE: 2, LEC: 1.5, DEC: 2.5, PAS: 2.5, REM: 0.8, REA: 1 },
    EXT: { UBI: 2, TRA: 2, PRE: 1, LEC: 1, DEC: 2, PAS: 1.5, REM: 2, REA: 1 },
    DEL: { UBI: 2, TRA: 1.5, PRE: 1, LEC: 1, DEC: 2, PAS: 1, REM: 3, REA: 1 }
  };
  const THIRD = ['Salida', 'Medio', 'Último tercio'];
  const SIT_BAD = {
    pos_ataque: 'Con la pelota del equipo te ubicás mal', pos_defensa: 'Cuando defendemos te ubicás mal', trans_of: 'Al recuperar no salís bien', trans_def: 'Al perder la pelota reaccionás mal',
    balon_parado: 'En la pelota parada no encontrás tu lugar', responsabilidad: 'No tenés claro cuándo presionar, cubrir o marcar', lectura: 'Te cuesta anticipar qué hace el poseedor',
    accion: 'Con la pelota elegís distinto de la mejor opción', apoyo: 'Después de pasar no vas al espacio', distribucion: 'Te cuesta ver qué le falta al equipo'
  };
  const SIT_GOOD = {
    pos_ataque: 'Buena ubicación en ataque', pos_defensa: 'Buena ubicación en defensa', trans_of: 'Buena transición ofensiva', trans_def: 'Buena transición defensiva', balon_parado: 'Conocés tu lugar en la pelota parada',
    responsabilidad: 'Tenés claro cuándo presionar, cubrir o marcar', lectura: 'Buena lectura del poseedor', accion: 'Buenas decisiones con la pelota', apoyo: 'Buen movimiento después del pase', distribucion: 'Ves bien la distribución del equipo'
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (a, b) => (b ? Math.round(100 * a / b) : null);
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const clamp99 = v => Math.round(u.clamp(v, 1, 99));
  const fresh = name => ({ v: 1, name: name || 'Jugador', created: Date.now(), events: [], matches: [] });
  const col = v => (v == null ? '#7c8aa3' : v >= 75 ? '#65ffb1' : v >= 60 ? '#ffdf50' : v >= 45 ? '#ff9f43' : '#ff7b7b');

  class Perfil {
    constructor(saved) { this.data = saved && saved.v === 1 && Array.isArray(saved.events) ? saved : fresh(); this.matchId = null; }
    reset() { this.data = fresh(this.data.name); this.matchId = null; }
    startMatch() { this.matchId = Date.now(); }
    add(e) {
      e.m = this.matchId; this.data.events.push(e);
      if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    }
    endMatch(o) { // los partidos muy cortos o sin acciones no cuentan
      const id = this.matchId, evs = this.data.events.filter(e => e.m === id); this.matchId = null;
      if (o.secs < 30 || !evs.length) return null;
      const m = { date: Date.now(), pos: o.pos, score: o.score.slice(), secs: Math.round(o.secs), n: evs.length, nota: this.ratings(evs, F7.match.ROLES[o.pos]).general };
      this.data.matches.push(m); this.data.matches = this.data.matches.slice(-40); return m;
    }
    events(pos) { return pos == null ? this.data.events : this.data.events.filter(e => e.pos === pos); }

    /* ---------- Cálculo ---------- */
    ratings(evs, role) {
      const out = {}, by = t => evs.filter(e => e.t === t), cards = by('card'), sits = a => cards.filter(e => a.includes(e.sit));
      const acc = (a, extraOk, extraN) => { const n = a.length + (extraN || 0); return n >= MIN ? 100 * (a.filter(e => e.ok).length + (extraOk || 0)) / n : null; };
      const pos = by('pos'), rec = by('rec');
      const put = (k, v) => { if (v != null) out[k] = clamp99(v); };
      put('UBI', acc(sits(['pos_ataque', 'pos_defensa', 'balon_parado']), pos.filter(e => e.ok).length, pos.length));
      put('TRA', acc(sits(['trans_of', 'trans_def'])));
      put('PRE', acc(sits(['responsabilidad']), rec.length, rec.length));
      put('LEC', acc(sits(['lectura', 'distribucion'])));
      put('DEC', acc(sits(['accion', 'apoyo'])));
      const ps = by('pass');
      if (ps.length >= MIN) put('PAS', 15 + 65 * ps.filter(e => e.ok).length / ps.length + 20 * ps.filter(e => e.ok && e.fw > 0.03).length / ps.length);
      const sh = by('shot');
      if (sh.length >= MIN) put('REM', 35 + 110 * sh.filter(e => e.result === 'gol').length / sh.length + 30 * sh.filter(e => e.result === 'atajado').length / sh.length);
      const dec = cards.filter(e => e.dec != null || e.out);
      if (dec.length >= MIN) {
        const t = mean(dec.filter(e => e.dec != null).map(e => e.dec)), late = dec.filter(e => e.out).length / dec.length;
        put('REA', 100 - 14 * Math.max(0, (t == null ? 4 : t) - 1.5) - 60 * late);
      }
      const r = role || this.mainRole(evs), w = ROLE_W[r] || ROLE_W.MED; let sw = 0, sv = 0, nAx = 0;
      AXES.forEach(a => { const k = a[0]; if (out[k] != null && w[k]) { sw += w[k]; sv += w[k] * out[k]; nAx++; } });
      out.general = sw && nAx >= 3 ? Math.round(sv / sw) : null; // con menos de 3 áreas la nota engañaría
      out.role = r;
      return out;
    }
    mainRole(evs) { const c = {}; evs.forEach(e => { if (e.role) c[e.role] = (c[e.role] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || 'MED'; }

    /* ---------- Lo que hacés bien y mal ---------- */
    review(evs) {
      const bad = [], good = [], cards = evs.filter(e => e.t === 'card'), group = (arr, f) => { const o = {}; arr.forEach(e => { const k = f(e); if (k != null) (o[k] = o[k] || []).push(e); }); return o; };
      const sit = group(cards, e => e.sit);
      Object.keys(sit).forEach(k => {
        const a = sit[k], n = a.length, ok = a.filter(e => e.ok).length; if (n < MIN) return;
        if (ok / n < 0.6) bad.push([1 - ok / n, SIT_BAD[k] + ' (' + pct(n - ok, n) + ' % de error en ' + n + ').']);
        else if (ok / n >= 0.75) good.push([ok / n, SIT_GOOD[k] + ' (' + pct(ok, n) + ' % de ' + n + ').']);
      });
      const piz = group(cards.filter(e => e.pizarra), e => e.pizarra);
      Object.keys(piz).forEach(k => { const a = piz[k], e = a.filter(x => !x.ok).length; if (a.length >= MIN && e / a.length >= 0.5 && F7.ficha.POR_ID[k]) bad.push([e / a.length * 0.85, 'Repasá la pizarra «' + F7.ficha.POR_ID[k].nombre + '»: ' + pct(e, a.length) + ' % de error ahí.']); });
      const th = group(cards, e => e.third);
      Object.keys(th).forEach(k => { const a = th[k], e = a.filter(x => !x.ok).length; if (a.length >= 6 && e / a.length >= 0.5) bad.push([e / a.length * 0.8, 'En la zona de ' + THIRD[k].toLowerCase() + ' te equivocás más (' + pct(e, a.length) + ' %).']); });
      const pick = group(cards.filter(e => e.pick), e => e.pick);
      // los dos errores más repetidos, por debajo de los problemas de fondo: si no, tapan lo importante
      Object.keys(pick).filter(k => pick[k].length >= 3).sort((a, b) => pick[b].length - pick[a].length).slice(0, 2).forEach((k, i) => bad.push([0.45 - i * 0.05, 'Error que repetís: «' + k + '» (' + pick[k].length + ' veces).']));
      const dec = cards.filter(e => e.dec != null).map(e => e.dec), out = cards.filter(e => e.out).length;
      if (dec.length >= MIN) { const t = mean(dec); if (t > 6) bad.push([0.5, 'Tardás en decidir: ' + t.toFixed(1) + ' s de promedio.']); else if (t < 3) good.push([0.7, 'Decidís rápido: ' + t.toFixed(1) + ' s de promedio.']); }
      if (out >= 2) bad.push([Math.min(1, out / 5), 'Se te acabó el tiempo en ' + out + ' tarjetas.']);
      const ps = evs.filter(e => e.t === 'pass'), okp = ps.filter(e => e.ok).length;
      if (ps.length >= MIN) { if (okp / ps.length < 0.7) bad.push([1 - okp / ps.length, 'Te cortan ' + pct(ps.length - okp, ps.length) + ' % de los pases: mirá la línea antes de soltarla.']); else if (okp / ps.length >= 0.85) good.push([okp / ps.length, 'Pase seguro: ' + pct(okp, ps.length) + ' % completos.']); }
      const lost = evs.filter(e => e.t === 'lost').length, rec = evs.filter(e => e.t === 'rec').length;
      if (lost >= 3) bad.push([Math.min(1, lost / 8), 'Te robaron la pelota ' + lost + ' veces: soltala antes o protegela.']);
      if (rec >= 3) good.push([Math.min(1, rec / 8), 'Recuperaste ' + rec + ' pelotas.']);
      const gl = evs.filter(e => e.t === 'shot' && e.result === 'gol').length; if (gl) good.push([Math.min(1, gl / 3), gl === 1 ? 'Hiciste 1 gol.' : 'Hiciste ' + gl + ' goles.']);
      const top = (a, n) => a.sort((x, y) => y[0] - x[0]).slice(0, n).map(x => x[1]);
      return { bad: top(bad, 6), good: top(good, 5) };
    }

    /* ---------- Tablas ---------- */
    tables(evs) {
      const cards = evs.filter(e => e.t === 'card'), sit = {}, third = [0, 1, 2].map(() => ({ n: 0, ok: 0 }));
      cards.forEach(e => {
        const s = sit[e.sit] = sit[e.sit] || { n: 0, ok: 0, out: 0, dec: [] }; s.n++; if (e.ok) s.ok++; if (e.out) s.out++; if (e.dec != null) s.dec.push(e.dec);
        if (third[e.third]) { third[e.third].n++; if (e.ok) third[e.third].ok++; }
      });
      const ps = evs.filter(e => e.t === 'pass'), sh = evs.filter(e => e.t === 'shot'), rc = evs.filter(e => e.t === 'rec'), res = r => sh.filter(e => e.result === r).length;
      return {
        sit, third,
        pass: { n: ps.length, ok: ps.filter(e => e.ok).length, prog: ps.filter(e => e.ok && e.fw > 0.03).length, cut: ps.filter(e => !e.ok).length },
        shot: { n: sh.length, gol: res('gol'), atajado: res('atajado'), otro: res('desviado') },
        rec: { robos: rc.filter(e => e.how === 'robo').length, cortes: rc.filter(e => e.how === 'corte').length, perdidas: evs.filter(e => e.t === 'lost').length }
      };
    }

    radarSvg(r, color) { // el radial: cada punta es un área y el polígono muestra lo que hacés bien y mal
      const Z = 240, c = Z / 2, R = 82, n = AXES.length, pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
      const ring = v => AXES.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
      // un área sin datos no es un cero: el polígono la saltea y su sigla queda gris
      const poly = AXES.map((a, i) => (r[a[0]] == null ? null : pt(i, r[a[0]] / 100).map(x => x.toFixed(1)).join(','))).filter(Boolean).join(' ');
      const spokes = AXES.map((_, i) => { const q = pt(i, 1); return '<line x1="' + c + '" y1="' + c + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" class="pf-l"/>'; }).join('');
      const labels = AXES.map((a, i) => { const q = pt(i, 1.2); return '<text x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" fill="' + col(r[a[0]]) + '">' + a[0] + '</text>'; }).join('');
      return '<svg viewBox="0 0 ' + Z + ' ' + Z + '" class="pf-svg" role="img" aria-label="Radial de habilidades">' + [0.25, 0.5, 0.75, 1].map(v => '<polygon points="' + ring(v) + '" class="pf-l"/>').join('') + spokes +
        '<polygon class="pf-poly" points="' + poly + '" fill="' + color + '" fill-opacity=".32" stroke="' + color + '" stroke-width="2.5"/>' + labels + '</svg>';
    }

    /* ---------- Pantalla ---------- */
    // o: { pos: posición a mostrar o null para todas, levels: data.lv del entrenador }
    html(o) {
      o = o || {}; const d = this.data, evs = this.events(o.pos), role = o.pos != null ? F7.match.ROLES[o.pos] : null, r = this.ratings(evs, role), w = this.review(evs), t = this.tables(evs), POS = F7.trainer.POS, CO = F7.coach;
      const row = (cells, head) => '<tr>' + cells.map(c => (head ? '<th>' + c + '</th>' : '<td>' + (c == null ? '—' : c) + '</td>')).join('') + '</tr>';
      const p = (a, b) => (b ? pct(a, b) + ' %' : '—');
      const list = (a, none) => (a.length ? '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<p>' + none + '</p>');
      const sitRows = Object.keys(t.sit).sort((a, b) => t.sit[b].n - t.sit[a].n).map(k => { const s = t.sit[k], m = mean(s.dec); return row([esc(CO.SIT[k] || k), s.n, p(s.ok, s.n), m == null ? '—' : m.toFixed(1) + ' s', s.out]); }).join('');
      const thirdRows = t.third.map((z, i) => row([THIRD[i], z.n, p(z.ok, z.n)])).join('');
      const matches = d.matches.filter(m => o.pos == null || m.pos === o.pos).slice(-10).reverse();
      const hist = matches.map(m => row([new Date(m.date).toLocaleDateString(), esc(POS[m.pos].name), m.score[0] + '-' + m.score[1] + (m.score[0] > m.score[1] ? ' Ganó' : m.score[0] < m.score[1] ? ' Perdió' : ' Empate'), Math.floor(m.secs / 60) + ' min', '<b style="color:' + col(m.nota) + '">' + (m.nota == null ? '—' : m.nota) + '</b>'])).join('');
      const lv = o.levels || {}, lvRows = Object.keys(lv).filter(k => !role || k.split(':')[1] === role).sort((a, b) => lv[b].n - lv[a].n).slice(0, 12).map(k => { const q = k.split(':'), e = lv[k], z = F7.ficha.POR_ID[q[2]]; return row([esc(CO.SIT[q[0]] || q[0]), esc(q[1] + (z ? ' · ' + z.nombre : '')), CO.LEVEL[e.lvl], e.ok + '/' + e.n]); }).join('');
      const nm = role ? POS[o.pos].name : 'Todas las posiciones', nMatch = matches.length;
      return '<div class="pf-head"><div class="pf-id"><input id="pfName" class="pf-name" value="' + esc(d.name) + '" maxlength="24" aria-label="Tu nombre">' +
        '<div class="pf-sub">' + esc(nm) + ' · ' + evs.length + ' acciones · ' + nMatch + ' partido' + (nMatch === 1 ? '' : 's') + '</div>' +
        '<div class="pf-nota" id="pfNota" style="color:' + col(r.general) + '">' + (r.general == null ? '—' : r.general) + '</div>' +
        '<div class="pf-sub">' + (r.general == null ? 'Jugá un poco más para tener nota (hacen falta 3 áreas).' : 'Nota general, ponderada por tu posición') + '</div></div>' +
        '<div class="pf-radar">' + this.radarSvg(r, col(r.general)) + '</div></div>' +
        '<div class="pf-axes">' + AXES.map(a => '<div class="pf-ax"><b style="color:' + col(r[a[0]]) + '">' + (r[a[0]] == null ? '—' : r[a[0]]) + '</b><span>' + a[1] + '</span></div>').join('') + '</div>' +
        '<div class="pf-grid">' +
        '<section class="pf-card pf-bad"><h3>Lo que tenés que mejorar</h3>' + list(w.bad, 'Todavía no hay datos suficientes, o lo estás haciendo bien.') + '</section>' +
        '<section class="pf-card pf-good"><h3>Lo que hacés bien</h3>' + list(w.good, '—') + '</section>' +
        '<section class="pf-card pf-wide"><h3>Tarjetas por situación</h3><table>' + row(['Situación', 'n', 'Aciertos', 'Decisión', 'Sin tiempo'], true) + (sitRows || row(['—', '', '', '', ''])) + '</table></section>' +
        '<section class="pf-card"><h3>Aciertos por zona</h3><table>' + row(['Zona', 'n', 'Aciertos'], true) + thirdRows + '</table></section>' +
        '<section class="pf-card"><h3>Pase</h3><table>' + row(['Pases', 'Completos', 'Progresivos', 'Cortados'], true) + row([t.pass.n, p(t.pass.ok, t.pass.n), p(t.pass.prog, t.pass.n), p(t.pass.cut, t.pass.n)]) + '</table></section>' +
        '<section class="pf-card"><h3>Remate</h3><table>' + row(['Remates', 'Goles', 'Atajados', 'Desviados'], true) + row([t.shot.n, t.shot.gol, t.shot.atajado, t.shot.otro]) + '</table></section>' +
        '<section class="pf-card"><h3>Recuperación</h3><table>' + row(['Robos', 'Cortes', 'Pelotas perdidas'], true) + row([t.rec.robos, t.rec.cortes, t.rec.perdidas]) + '</table></section>' +
        '<section class="pf-card pf-wide"><h3>Últimos partidos</h3><table>' + row(['Fecha', 'Posición', 'Resultado', 'Duración', 'Nota'], true) + (hist || row(['Terminá un partido para verlo acá', '', '', '', ''])) + '</table></section>' +
        '<section class="pf-card pf-wide"><h3>Entrenamiento · velocidad de corrección</h3><table>' + row(['Situación', 'Caso', 'Nivel', 'Aciertos'], true) + (lvRows || row(['Jugá con tarjetas para empezar', '', '', ''])) + '</table></section></div>';
    }
  }

  F7.perfil = { Perfil, AXES, ROLE_W, MIN, create: s => new Perfil(s) };
})(typeof window !== 'undefined' ? window : globalThis);
