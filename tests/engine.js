// Carga el motor (sin DOM) en un contexto aislado de Node. Cada llamada devuelve un F7 nuevo.
const vm = require('vm'), fs = require('fs'), path = require('path');
const FILES = ['team-model', 'debug', 'match', 'ball', 'tactics', 'team-intelligence', 'roles', 'defense', 'ai', 'trainer'];
module.exports = function load() {
  const ctx = vm.createContext({ console, Math, Date });
  FILES.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' }));
  return ctx.F7;
};
