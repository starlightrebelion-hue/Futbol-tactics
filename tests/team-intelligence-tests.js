// Pruebas de la nueva capa de perfiles y coordinación colectiva.
const load = require('./engine.js');
function ok(c, m) { if (!c) throw new Error(m); }
const F7 = load();
F7.match.init({ seed: 24017 });
const S = F7.state;

ok(S.ps.length === 14, 'el motor Fútbol 7 debe seguir creando 14 jugadores');
ok(S.ps.every(p => p.attributes && F7.teamModel.ATTRS.every(k => p.attributes[k] >= .25 && p.attributes[k] <= .98)), 'cada jugador debe tener siete atributos acotados');
ok(F7.teamModel.ATTRS.join(',') === 'vision,technique,pace,positioning,decision,stamina,anticipation', 'esquema de atributos estable');

['2-3-1','3-2-1','2-2-2'].forEach(name => {
  const f = F7.teamModel.formation('7v7', name);
  ok(f && f.length === 7 && f[0].role === 'ARQ', 'formación 7v7 válida: ' + name);
});
['4-3-3','4-4-2','4-2-3-1','3-5-2'].forEach(name => {
  const f = F7.teamModel.formation('11v11', name);
  ok(f && f.length === 11 && f.filter(p => p.role === 'ARQ').length === 1, 'catálogo 11v11 válido: ' + name);
});
ok(F7.teamModel.FORMATS['11v11'].playable === false, 'no declarar 11v11 jugable antes de ampliar el motor');
ok(F7.teamIntelligence.setStrategy(0, 'possession'), 'acepta estrategia válida');
ok(!F7.teamIntelligence.setStrategy(0, 'magic'), 'rechaza estrategia desconocida');

const player = S.team[0][3], carrier = S.ps[S.carrier];
const base = { x: .44, y: .40 };
const refined = F7.teamIntelligence.refineSupportSpot(player, base, carrier, F7.roles.profile(player.role), { band: [.12,.32] });
ok(Number.isFinite(refined.x) && Number.isFinite(refined.y), 'refinamiento colectivo produce coordenadas finitas');
ok(Math.abs(refined.x - base.x) <= .066 && Math.abs(refined.y - base.y) <= .076, 'refinamiento colectivo limitado');
ok(F7.teamModel.actionBias(player, { type: 'pass' }) >= -.05 && F7.teamModel.actionBias(player, { type: 'pass' }) <= .08, 'el perfil individual ajusta moderadamente las decisiones');
console.log('PASS team intelligence: perfiles individuales, catálogo 7v7/11v11 y coordinación colectiva');
