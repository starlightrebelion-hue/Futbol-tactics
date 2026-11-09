/* coach.js — entrenador en vivo, portado de Vóley TV (trainer.js) al fútbol 7. Sin DOM: se prueba en Node.
 * Mientras corre el partido mira la fase y, en el momento justo, frena el juego con una curva suave, muestra una tarjeta
 * con opciones A/B/C (cada una es un círculo en el piso), corrige y vuelve a acelerar.
 * Cada situación tiene su nivel: con 3 aciertos seguidos la corrección se hace más rápida
 * (hiperlento → lento → casi normal → tiempo real); con un error, baja.
 * La respuesta correcta sale del motor: la ubicación es la que la IA elige para tu posición y la acción, la más probable
 * al repetir la decisión del poseedor. Son reglas tácticas heurísticas, no estadísticas de partidos reales.
 * Bucle de la interfaz:  simDt = coach.frame(realDt);  por cada paso: F7.match.update(DT); coach.afterStep();
 */
(function (g) {
  'use strict';
  const F7 = g.F7, u = F7.u, S = F7.state;
  const T = () => F7.trainer, TA = () => F7.tactics, FI = () => F7.ficha;

  // Igual que Vóley TV (DEF_LV): 6 niveles de lectura; el juego va a esa velocidad mientras decidís. Acierto: sube un nivel. Error: baja uno.
  const DOWN = 0.7, UP = [2.8, 2.2, 1.8, 1.4, 0.9, 0.5];
  const SLOW = [0, 0.06, 0.14, 0.28, 0.5, 1], MAXLV = SLOW.length - 1;
  const DEADLINE = [0, 0, 10, 8, 6, 4];   // segundos reales para decidir (0 = sin límite)
  const smooth = k => k * k * (3 - 2 * k), accel = k => k * k, linear = k => k;
  const LEVEL = ['Congelado', 'Hiperlento', 'Lento', 'Medio', 'Casi normal', 'Tiempo real'];
  const GAP = [6, 7, 8, 10, 12, 15];     // segundos de partido entre chequeos, según el nivel
  const OK_DIST = 0.13;           // hasta acá estás bien ubicado (modo manual)
  const MIN_GAP = 5;              // segundos mínimos entre tarjetas, aunque cambie la fase
  const SIT = {
    pos_ataque: 'Ubicación en ataque', pos_defensa: 'Ubicación en defensa', trans_of: 'Transición ofensiva', trans_def: 'Transición defensiva',
    balon_parado: 'Pelota parada', responsabilidad: '¿De quién es?', lectura: 'Leer la jugada', accion: 'Con la pelota', apoyo: 'Después del pase', distribucion: 'Distribución del equipo'
  };
  const ASPECTS = [
    { id: 'ubicacion', label: 'Ubicación', sits: ['pos_ataque', 'pos_defensa'] },
    { id: 'transicion', label: 'Transición', sits: ['trans_of', 'trans_def'] },
    { id: 'presion', label: 'Presión', sits: ['responsabilidad'] },
    { id: 'lectura', label: 'Lectura', sits: ['lectura'] },
    { id: 'pelota', label: 'Con pelota', sits: ['accion'] },
    { id: 'apoyo', label: 'Apoyo', sits: ['apoyo'] },
    { id: 'equipo', label: 'Equipo', sits: ['distribucion'] },
    { id: 'parada', label: 'Pelota parada', sits: ['balon_parado'] }
  ];
  const INTENT = {
    support: 'Ofrecer línea de pase acá', run: 'Atacar el espacio', width: 'Abrirme a la banda', cover: 'Quedar detrás de la pelota, cubriendo', 'check-run': 'Desmarcarme en diagonal',
    press: 'Presionar al poseedor', contain: 'Temporizar sin tirarme', mark: 'Tomar la marca', zone: 'Mantener mi zona del bloque', recover: 'Replegar detrás de la pelota',
    keeper: 'Ubicarme entre la pelota y el arco', save: 'Ubicarme entre la pelota y el arco', intercept: 'Cortar la línea de pase', follow: 'Seguir la jugada al espacio', hold: 'Mantener mi posición', control: 'Mantener mi posición', chase: 'Ir a la pelota', receive: 'Ir a recibir'
  };
  const AI_OWNS = { receive: 1, chase: 1, dribble: 1, shield: 1, control: 1 }; // estas acciones las ejecuta la IA aunque estés moviendo a tu jugador
  const num = p => '#' + (p.i + 1);
  const m = v => Math.round(v * 50); // distancia normalizada a metros aproximados (cancha de 60 × 40)
  const clampPt = p => ({ x: u.clamp(p.x, 0.03, 0.97), y: u.clamp(p.y, 0.05, 0.95) });

  /* La flecha de guía: qué tenés que hacer ahora y adónde. Cada tipo de acción tiene su color y su leyenda. */
  const GUIDE = {
    bloquear: { col: '#b388ff', name: 'Bloquear', hint: 'Cerrar el camino al arco o la línea de pase' },
    mover: { col: '#ffffff', name: 'Desplazarte', hint: 'Moverte al espacio, sin disputar la pelota' },
    disputar: { col: '#ff6b6b', name: 'Disputar la pelota', hint: 'Presionar al poseedor o ir a la pelota dividida' },
    pase: { col: '#65ffb1', name: 'Hacer el pase', hint: 'Soltar la pelota a un compañero libre' },
    interceptar: { col: '#ffd23f', name: 'Interceptar el pase', hint: 'Cortar la línea de un pase rival' },
    disparo: { col: '#ff9f43', name: 'Disparar al arco', hint: 'Rematar a puerta' }
  };
  const INTENT_KIND = { press: 'disputar', chase: 'disputar', intercept: 'interceptar', cover: 'bloquear', contain: 'bloquear', mark: 'bloquear', keeper: 'bloquear', save: 'bloquear' };

  function emptyData() { return { v: 1, lv: {}, zn: {}, errs: {} }; }

  /* ---------- Distribución del equipo: mide si el equipo está bien repartido para su fase ---------- */
  function shape(t, conPelota) {
    const field = S.team[t].filter(p => p.i > 0), xs = field.map(p => u.rel(t, p.x)), ys = field.map(p => p.y);
    const avg = rs => { const a = field.filter(p => rs.includes(p.role)).map(p => u.rel(t, p.x)); return a.reduce((s, v) => s + v, 0) / (a.length || 1); };
    const amplitud = (Math.max(...ys) - Math.min(...ys)) * F7.cam.W, profundidad = (Math.max(...xs) - Math.min(...xs)) * F7.cam.L;
    const lineas = [(avg(['MED']) - avg(['DEF'])) * F7.cam.L, (avg(['EXT', 'DEL']) - avg(['MED'])) * F7.cam.L];
    const carriles = [0, 1, 2].filter(c => ys.some(y => (y < 0.34 ? 0 : y < 0.67 ? 1 : 2) === c)).length;
    const relB = u.rel(t, S.ball.x), detras = field.filter(p => u.rel(t, p.x) < relB).length, issues = [];
    if (conPelota) {
      if (amplitud < 22) issues.push({ id: 'amplitud', text: 'Falta amplitud: el equipo ocupa ' + Math.round(amplitud) + ' m de ancho. Alguien tiene que abrirse a la banda.' });
      if (carriles < 3) issues.push({ id: 'carriles', text: 'Hay carriles vacíos: tiene que haber alguien por izquierda, centro y derecha.' });
      if (profundidad < 18) issues.push({ id: 'profundidad', text: 'Falta profundidad: nadie amenaza la espalda de la defensa.' });
      if (detras < 2) issues.push({ id: 'equilibrio', text: 'Sin equilibrio: menos de dos jugadores detrás de la pelota si la perdemos.' });
    } else {
      if (profundidad > 30) issues.push({ id: 'partido', text: 'Equipo partido: ' + Math.round(profundidad) + ' m entre el primero y el último. Hay que acortar.' });
      if (Math.max(lineas[0], lineas[1]) > 15) issues.push({ id: 'lineas', text: 'Mucha distancia entre líneas: el rival recibe cómodo en el medio.' });
      if (amplitud > 30) issues.push({ id: 'ancho', text: 'Bloque muy abierto: hay que cerrar hacia el lado de la pelota.' });
      if (detras < 3) issues.push({ id: 'detras', text: 'Poca gente detrás de la pelota: hay que replegar.' });
    }
    return { amplitud, profundidad, lineas, carriles, detras, issues };
  }

  /* ---------- Control de tu jugador ----------
   * Se envuelve F7.ai.plan (sin tocar el motor): la IA calcula igual tu lugar ideal y, si moviste a tu jugador, tu punto manda.
   * El objetivo de la IA se restaura antes de cada plan: si no, su caché de objetivos se quedaría con tu punto. */
  let active = null;
  function installControl() {
    if (F7.ai._coachWrapped) return;
    const orig = F7.ai.plan;
    F7.ai.plan = function (dt) {
      const c = active;
      if (!c) return orig(dt);
      const me = S.ps[c.me];
      if (c.ideal) { me.tx = c.ideal.x; me.ty = c.ideal.y; me.intent = c.ideal.intent; me.think = c.ideal.think; me.speedMul = c.ideal.sm; }
      orig(dt);
      c.ideal = { x: me.tx, y: me.ty, intent: me.intent, think: me.think, sm: me.speedMul };
      const t = c.target;
      if (t && S.seconds >= t.until) c.target = null;
      else if (t && me.k !== S.carrier && !AI_OWNS[me.intent]) { me.tx = t.x; me.ty = t.y; me.intent = 'user'; me.speedMul = 1.1; }
    };
    F7.ai._coachWrapped = true;
  }

  class Coach {
    constructor(o) {
      o = o || {};
      this.me = o.me != null ? o.me : 5; this.mode = o.mode || 'cartas'; this.data = o.data && o.data.v === 1 ? o.data : emptyData();
      this.fichas = o.fichas || FI().crear(null); this.rnd = u.rng(o.seed != null ? o.seed : 1234); this.listeners = {};
      this.real = 0; this.mul = 1; this.ramp = null; this.q = null; this.view = null; this.up = null; this.zoomAnim = null; this.panelAt = null;
      this.target = null; this.ideal = null; this.handled = -1; this.nextAt = 3; this.lastFase = ''; this.wall = null; this.asked = 0; this.right = 0; this.lastAsk = -99;
      installControl(); active = this;
      if (this.mode === 'manual') { const p = S.ps[this.me]; this.target = { x: p.x, y: p.y, until: Infinity }; }
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); return this; }
    emit(ev, a) { (this.listeners[ev] || []).forEach(fn => fn(a)); }
    stop() { if (active === this) active = null; S.opts.carrierHold = false; }

    get player() { return S.ps[this.me]; }
    get role() { return this.player.role; }
    zoneKey(sit) { const r = this.player.x; return sit + ':t' + (r < 0.34 ? 0 : r < 0.67 ? 1 : 2); }
    key(sit, extra) { return sit + ':' + this.role + ':' + (extra || 'general'); }
    sitOf(k) { return k.split(':')[0]; }
    zoneErr(sit) { const z = this.data.zn[this.zoneKey(sit)]; return z && z.n >= 4 ? 1 - z.ok / z.n : null; }
    level(k) { const base = (this.data.lv[k] || {}).lvl || 0, e = this.zoneErr(this.sitOf(k)); return e != null && e > 0.4 ? Math.max(0, base - 1) : base; }

    record(k, ok) {
      const zk = this.zoneKey(this.sitOf(k)), z = this.data.zn[zk] = this.data.zn[zk] || { n: 0, ok: 0 };
      z.n++; if (ok) z.ok++;
      const e = this.data.lv[k] = this.data.lv[k] || { lvl: 0, streak: 0, ok: 0, n: 0 };
      e.n++; let msg = null;
      if (ok) { e.ok++; if (e.lvl < MAXLV) { e.lvl++; msg = 'Subiste a ' + LEVEL[e.lvl].toLowerCase() + ' (lectura ' + (e.lvl + 1) + '/' + SLOW.length + ')'; } }
      else if (e.lvl > 0) { e.lvl--; msg = 'Bajás a ' + LEVEL[e.lvl].toLowerCase() + ' (lectura ' + (e.lvl + 1) + '/' + SLOW.length + ')'; }
      this.emit('save', this.data);
      if (msg) this.emit('callout', { text: msg, kind: ok ? 'good' : 'warn' });
      return e;
    }

    /* Progreso por aspecto, igual que el radar de Vóley TV */
    aspect(id) {
      const a = ASPECTS.find(x => x.id === id); let n = 0, ok = 0, lv = 0;
      Object.keys(this.data.lv).forEach(k => { if (!a.sits.includes(this.sitOf(k))) return; const e = this.data.lv[k]; n += e.n; ok += e.ok; lv += e.lvl * e.n; });
      if (!n) return { id, label: a.label, n: 0, lvl: null, acc: null, score: null };
      const lvl = lv / n, acc = ok / n;
      return { id, label: a.label, n, lvl, acc, score: Math.round(100 * (0.5 * acc + 0.5 * (lvl / MAXLV))) };
    }
    aspects() { return ASPECTS.map(a => this.aspect(a.id)); }

    /* ---------- Guía: qué hacer y adónde ---------- */
    bestKey() { // lo más probable con la pelota; se recalcula 3 veces por segundo, no en cada cuadro
      const c = this._bk, t = Math.floor(S.seconds * 3);
      if (c && c.poss === S.possId && c.t === t) return c.key;
      const probs = TA().decideProbs(this.me, 60), key = Object.keys(probs).sort((a, b) => probs[b] - probs[a])[0];
      this._bk = { poss: S.possId, t, key }; return key;
    }
    guide() {
      const me = this.player, id = this.ideal, car = S.carrier >= 0 ? S.ps[S.carrier] : null;
      const mk = (kind, pt, text) => ({ kind, x: u.clamp(pt.x, 0.02, 0.98), y: u.clamp(pt.y, 0.03, 0.97), text, col: GUIDE[kind].col, name: GUIDE[kind].name });
      if (S.owner === 0 && S.carrier === this.me && !S.passFlight) { // con la pelota: lo más probable según el motor
        const key = this.bestKey();
        if (key.indexOf('pass:') === 0) { const q = S.ps[+key.slice(5)]; return mk('pase', q, 'Pase al ' + num(q)); }
        if (key === 'shoot') return mk('disparo', { x: me.team === 0 ? 0.99 : 0.01, y: 0.5 }, 'Rematá al arco');
        if (key === 'clear') return mk('pase', this.keyPoint('clear', me), 'Despejá largo');
        if (key === 'dribble') return mk('mover', this.keyPoint('dribble', me), 'Conducí hacia el espacio libre');
        return mk('mover', { x: me.x, y: me.y }, 'Protegé la pelota');
      }
      if (!id) return null;
      const pt = { x: id.x, y: id.y }, kind = INTENT_KIND[id.intent] || 'mover', rival = car && car.team === 1 ? car : null;
      const opp = () => S.team[1].filter(q => q.i > 0).sort((a, b) => u.d(a, pt) - u.d(b, pt))[0];
      let text;
      if (id.intent === 'press') text = rival ? 'Disputá la pelota: presioná al ' + num(rival) : 'Disputá la pelota';
      else if (id.intent === 'chase') text = 'Andá a buscar la pelota dividida';
      else if (id.intent === 'intercept') { const f = S.passFlight; text = f ? 'Cortá el pase del ' + num(S.ps[f.fromK]) + ' al ' + num(S.ps[f.toK]) : 'Cortá el pase'; }
      else if (id.intent === 'contain') text = 'Frená al poseedor sin tirarte: ganá tiempo';
      else if (id.intent === 'cover') text = 'Bloqueá el camino al arco, detrás del que presiona';
      else if (id.intent === 'mark') text = 'Bloqueá y marcá al ' + num(opp());
      else if (id.intent === 'save') text = 'Atajá el remate';
      else if (id.intent === 'keeper') text = 'Ubicate entre la pelota y el arco';
      else if (id.intent === 'receive') text = 'Andá a recibir el pase';
      else if (id.intent === 'recover') text = 'Replegá por detrás de la pelota';
      else if (id.intent === 'zone') text = 'Mantené tu zona del bloque';
      else text = INTENT[id.intent] || 'Moverte al espacio';
      return mk(kind, pt, text);
    }

    /* ---------- Reloj real: curva de velocidad, zoom y tiempos de la tarjeta ---------- */
    rampTo(to, dur, ease) { this.ramp = { from: this.mul, to, t0: this.real, dur, ease }; }
    frame(rdt) {
      this.real += rdt;
      const r = this.ramp;
      if (r) { const k = u.clamp((this.real - r.t0) / r.dur, 0, 1); this.mul = r.from + (r.to - r.from) * r.ease(k); if (k >= 1) this.ramp = null; }
      const za = this.zoomAnim;
      if (za && this.view) { const k = u.clamp((this.real - za.t0) / za.dur, 0, 1); this.view.zoom = za.from + (za.to - za.from) * za.ease(k); if (k >= 1) this.zoomAnim = null; }
      const q = this.q;
      if (q && this.panelAt != null && this.real >= this.panelAt) { this.panelAt = null; if (DEADLINE[q.lvl]) q.deadline = this.real + DEADLINE[q.lvl]; q.shownAt = this.real; this.emit('panel', q); }
      if (q && !q.done && q.deadline && this.real >= q.deadline) this.answer(null);
      if (q && q.done && q.resumeAt && this.real >= q.resumeAt) this.resume();
      if (this.up && !this.q && this.real >= this.up.until) { this.up = null; this.view = null; this.zoomAnim = null; }
      return rdt * this.mul;
    }

    /* ---------- Después de cada paso del partido: ¿hay que preguntar? ---------- */
    afterStep() {
      this.wallTick(); this.track();
      const q = this.q;
      if (q) { if (!q.done && q.valid && !q.valid()) this.cancel(); return; }
      const fase = FI().faseActual(0);
      if (fase.id !== this.lastFase) { // el cambio de fase es el momento de mirar: se chequea apenas pasa el tiempo de reacción
        if (fase.id === 'trans_of' || fase.id === 'trans_def' || fase.id === 'parada') this.nextAt = Math.min(this.nextAt, Math.max(S.seconds + (fase.id === 'parada' ? 0.1 : 0.8), this.lastAsk + MIN_GAP));
        this.lastFase = fase.id;
      }
      if (S.owner === 0 && S.carrier === this.me && !S.passFlight) {
        if (this.handled !== S.possId) { this.handled = S.possId; this.onBall(); }
        return;
      }
      if (S.opts.carrierHold) S.opts.carrierHold = false;
      if (S.seconds < this.nextAt || S.carrier < 0 || S.owner < 0 || S.passFlight) return;
      this.check(fase);
    }

    /* ---------- Métricas para la ficha: lo que hizo tu jugador de verdad en el partido ---------- */
    third() { const x = this.player.x; return x < 0.34 ? 0 : x < 0.67 ? 1 : 2; }
    stat(e) { e.pos = this.me; e.role = this.role; if (e.third == null) e.third = this.third(); this.emit('stat', e); }
    track() {
      const st = S.stats, me = this.me, f = S.passFlight, p = this.prev;
      const now = { carrier: S.carrier, flight: f, tk0: st.tackles[0], ic0: st.interceptions[0], tk1: st.tackles[1], shots: st.shots[0] };
      if (p) {
        if (S.carrier === me && p.carrier !== me) { if (now.tk0 > p.tk0) this.stat({ t: 'rec', how: 'robo' }); else if (now.ic0 > p.ic0) this.stat({ t: 'rec', how: 'corte' }); }
        if (p.carrier === me && S.owner === 1 && now.tk1 > p.tk1) this.stat({ t: 'lost' });
        if (f && f !== p.flight && f.fromK === me) this.myPass = { fw: S.ps[f.toK].x - this.player.x, third: this.third() };
        if (this.myPass && !f) { this.stat({ t: 'pass', ok: S.owner === 0, fw: +this.myPass.fw.toFixed(3), third: this.myPass.third }); this.myPass = null; }
        if (now.shots > p.shots && p.carrier === me) this.myShot = { goals: st.goals[0], saves: st.saves[1], third: this.third() };
        const sh = this.myShot;
        if (sh) {
          const result = st.goals[0] > sh.goals ? 'gol' : st.saves[1] > sh.saves ? 'atajado' : !S.ball.shot ? 'desviado' : null;
          if (result) { this.stat({ t: 'shot', result, third: sh.third }); this.myShot = null; }
        }
      }
      this.prev = now;
    }

    check(fase) {
      const me = this.player, ideal = this.ideal; if (!ideal) return;
      const sit = fase.sit, k = this.key(sit, fase.pizarra), lvl = this.level(k);
      this.nextAt = S.seconds + GAP[lvl];
      if (this.mode === 'manual') {
        // se juzga a dónde vas, no dónde estás: si vas bien encaminado no se corta el juego (igual que en Vóley TV)
        const goal = this.spotFor(fase), going = this.target || goal;
        if (Math.min(T().metric(me, goal), T().metric(going, goal)) <= OK_DIST) { this.record(k, true); this.stat({ t: 'pos', ok: true }); return; }
        if (lvl >= MAXLV) { this.record(k, false); this.stat({ t: 'pos', ok: false }); this.emit('verdict', { ok: false }); this.emit('callout', { text: 'Fuera de tu lugar', kind: 'warn' }); return; }
        return this.askPosition(fase, k);
      }
      if (lvl >= MAXLV && this.rnd() < 0.7) return;
      const r = this.rnd(), rival = S.owner === 1;
      if (fase.id === 'parada' || fase.id === 'trans_of' || fase.id === 'trans_def') return this.askPosition(fase, k);
      if (rival && this.askResponsibility(fase)) return;
      if (r < 0.2 && this.askShape(fase)) return;
      if (r < 0.45 && this.askRead(fase)) return;
      this.askPosition(fase, k);
    }

    // En pelota parada el lugar lo da la pizarra; en juego, el motor
    spotFor(fase) { return fase.id === 'parada' ? this.fichas.punto(fase.pizarra, this.me) : { x: this.ideal.x, y: this.ideal.y }; }

    /* ---------- 1) Ubicación: ¿dónde tenés que estar? ---------- */
    wrongSpots(fase, ideal) {
      const me = this.player, role = me.role, car = S.ps[S.carrier], side = me.y < car.y ? -1 : 1, out = [];
      const add = (label, w, why) => out.push({ label, w: clampPt(w), why });
      const presser = S.presser[0] >= 0 ? S.ps[S.presser[0]] : null;
      if (fase.conPelota) {
        if (role === 'DEF') add('Subir a sumarme al ataque', { x: car.x + 0.1, y: ideal.y }, 'Si un defensor se adelanta a la pelota y la perdemos, la espalda queda libre.');
        if (role === 'MED') add('Pegarme al poseedor', { x: car.x - 0.03, y: car.y + side * 0.07 }, 'Tan cerca le quitás espacio y un rival marca a los dos: el apoyo va a media distancia.');
        if (role === 'EXT') add('Cerrarme hacia el medio', { x: ideal.x, y: 0.5 + (ideal.y - 0.5) * 0.2 }, 'Sin extremo abierto la defensa rival se cierra y el centro queda tapado.');
        if (role === 'DEL') add('Bajar a pedirla al pie', { x: car.x - 0.04, y: car.y + side * 0.1 }, 'Si bajás, nadie amenaza la espalda y la defensa rival sube tranquila.');
        if (role === 'ARQ') add('Adelantarme como un jugador más', { x: 0.32, y: 0.5 }, 'Tan lejos del arco, un pelotazo o una pérdida te deja vendido.');
        add('Esperar atrás de la jugada', { x: ideal.x - 0.17, y: ideal.y }, 'Muy lejos de la pelota: no sos opción de pase y el equipo queda partido.');
        add('Ir al mismo lugar que un compañero', this.nearestMateSpot(), 'Dos en el mismo lugar ocupan un solo espacio: el pase a cualquiera de los dos se marca con un rival.');
      } else {
        if (role === 'ARQ') add('Quedarme sobre la línea', { x: 0.03, y: 0.5 }, 'Muy atrás te achican el ángulo a favor del que remata.');
        else {
          if (presser && presser !== me) add('Ir yo también a la pelota', { x: car.x - 0.03, y: car.y }, 'Ya presiona ' + num(presser) + ': dos encima de la pelota dejan un hombre libre a la espalda.');
          add('Quedarme arriba esperando la contra', { x: ideal.x + 0.18, y: ideal.y }, 'Quedaste por delante de la pelota: no cubrís el camino al arco.');
          add('Retroceder hasta el área', { x: 0.14, y: ideal.y }, 'Tan atrás partís al equipo: el rival recibe cómodo entre líneas.');
        }
      }
      if (T().metric(me, ideal) > 0.14) out.unshift({ label: 'Quedarme donde estoy', w: { x: me.x, y: me.y }, why: null });
      return out;
    }
    nearestMateSpot() {
      const me = this.player; let b = null, bd = 9;
      S.team[0].forEach(q => { if (q.i === 0 || q === me || q.k === S.carrier) return; const d = u.d(q, me); if (d < bd) { bd = d; b = q; } });
      return b ? { x: b.x, y: b.y } : { x: me.x, y: me.y };
    }
    askPosition(fase, k) {
      const me = this.player, ideal = this.spotFor(fase), parada = fase.id === 'parada', tarea = this.fichas.tarea(fase.pizarra, this.me);
      const label = parada ? 'Mi lugar en la pizarra' : INTENT[this.ideal.intent] || 'Mi lugar en la jugada';
      const good = { label, ok: true, w: clampPt(ideal), why: tarea };
      const wrong = []; // que los círculos no se pisen entre sí ni con el correcto
      this.wrongSpots(fase, ideal).forEach(o => { if (wrong.length < 2 && T().metric(o.w, ideal) >= 0.1 && wrong.every(x => T().metric(x.w, o.w) >= 0.08)) wrong.push(o); });
      if (!wrong.length) return false;
      const play = { me: this.me, ideal: { x: ideal.x, y: ideal.y, intent: this.ideal.intent }, carrier: S.carrier, attack: S.owner === 0 };
      wrong.forEach(o => { if (!o.why) { const e = T().diagnose(play, o.w); o.why = e.length ? T().ERR_TEXT[e[0]] : 'Lejos del lugar que pide la jugada.'; } });
      const titles = {
        trans_of: '¡Recuperamos! ¿A dónde vas?', trans_def: fase.cp ? '¡La perdimos cerca del arco rival! ¿A dónde vas?' : '¡La perdimos! ¿A dónde vas?',
        pos_ataque: 'Tenemos la pelota: ¿dónde tenés que estar?', pos_defensa: 'Defendemos: ¿dónde tenés que estar?', balon_parado: fase.nombre + ': ¿dónde te parás?'
      };
      const nm = T().POS[this.me].name, car = S.ps[S.carrier];
      this.ask({
        key: k, sit: fase.sit, title: titles[fase.sit], text: 'Sos ' + nm + '. ' + fase.nombre + '. La tiene ' + (car.team === 0 ? 'tu ' : 'el rival ') + num(car) + '.', opts: this.mix([good].concat(wrong)),
        focus: ideal, pizarra: fase.pizarra, shape: true
      });
      return true;
    }

    /* ---------- 2) Rival con pelota cerca: ¿de quién es? ---------- */
    askResponsibility(fase) {
      const me = this.player, car = S.ps[S.carrier], intent = this.ideal.intent;
      if (me.i === 0 || u.d(me, car) > 0.3 || !['press', 'contain', 'cover', 'mark'].includes(intent)) return false;
      const k = this.key('responsabilidad', intent), presser = S.presser[0] >= 0 ? S.ps[S.presser[0]] : null, own = -1;
      const pressPt = { x: car.x + own * 0.035, y: car.y }, coverPt = { x: car.x + own * 0.11, y: car.y + (0.5 - car.y) * 0.25 };
      const mark = S.team[1].filter(q => q.i > 0 && q !== car).sort((a, b) => u.d(a, me) - u.d(b, me))[0], markPt = { x: mark.x + own * 0.05, y: mark.y + (car.y - mark.y) * 0.12 };
      const ans = intent === 'press' || intent === 'contain' ? 'press' : intent;
      const other = presser && presser !== me ? num(presser) : 'un compañero';
      const why = {
        press: 'Sos el más cerca: te toca salir a la pelota' + (intent === 'contain' ? ', sin tirarte, para dar tiempo al repliegue.' : ' y cerrarle el pase hacia adelante.'),
        cover: 'Presiona ' + other + ': vos cubrís el camino al arco por detrás de él.',
        mark: 'Presiona ' + other + ': lo que falta es tomar a ' + num(mark) + ', el rival libre más peligroso.'
      };
      const wrongTxt = 'No: ' + why[ans];
      this.ask({
        key: k, sit: 'responsabilidad', title: 'Viene el rival: ¿qué te toca?', text: 'La tiene el rival ' + num(car) + ' a ' + m(u.d(me, car)) + ' m de vos.',
        opts: this.mix([
          { label: 'Salir a presionar', ok: ans === 'press', w: clampPt(pressPt), why: ans === 'press' ? why.press : wrongTxt },
          { label: 'Cubrir la espalda', ok: ans === 'cover', w: clampPt(coverPt), why: ans === 'cover' ? why.cover : wrongTxt },
          { label: 'Marcar al ' + num(mark), ok: ans === 'mark', w: clampPt(markPt), why: ans === 'mark' ? why.mark : wrongTxt }
        ]), focus: car, pizarra: fase.pizarra
      });
      return true;
    }

    /* ---------- 3) Lectura: ¿qué va a hacer el poseedor? (probabilidades reales del motor) ---------- */
    keyLabel(key) { return key.indexOf('pass:') === 0 ? 'Pase al ' + num(S.ps[+key.slice(5)]) + (S.ps[+key.slice(5)].team === 0 ? '' : ' rival') : { shoot: 'Remata', dribble: 'Conduce', shield: 'Protege la pelota', clear: 'Despeja largo' }[key]; }
    keyPoint(key, p) {
      if (key.indexOf('pass:') === 0) { const q = S.ps[+key.slice(5)]; return { x: q.x, y: q.y }; }
      if (key === 'shoot') return { x: p.team === 0 ? 0.96 : 0.04, y: 0.5 };
      if (key === 'clear') return { x: u.abs(p.team, 0.66), y: 0.5 };
      if (key === 'dribble') { const d = TA().dribbleChoice(p.k); return { x: d.tx, y: d.ty }; }
      return { x: p.x, y: p.y };
    }
    askRead(fase) {
      const car = S.ps[S.carrier]; if (car.role === 'ARQ') return false;
      const k = this.key('lectura', car.team === 0 ? 'nuestro' : 'rival'), probs = TA().decideProbs(S.carrier, 200);
      const keys = Object.keys(probs).sort((a, b) => probs[b] - probs[a]);
      if (keys.length < 2 || probs[keys[0]] - probs[keys[1]] < 0.08) return false; // si está parejo no hay una respuesta que enseñar
      const pc = key => Math.round(probs[key] * 100) + ' %', best = keys[0];
      this.ask({
        key: k, sit: 'lectura', title: '¿Qué va a hacer el ' + num(car) + (car.team ? ' rival' : '') + '?', text: 'Mirá su perfil y quién está libre. ' + fase.nombre + '.',
        opts: this.mix(keys.slice(0, 3).map(key => ({ label: this.keyLabel(key), ok: key === best, w: clampPt(this.keyPoint(key, car)), why: this.keyLabel(key) + ': ' + pc(key) + ' de las veces en esta situación.' }))),
        focus: car
      });
      return true;
    }

    /* ---------- 4) Distribución: ¿qué le falta al equipo? ---------- */
    askShape(fase) {
      const sh = shape(0, fase.conPelota); if (!sh.issues.length) return false;
      const main = sh.issues[0], k = this.key('distribucion', main.id);
      const pool = fase.conPelota ? [['amplitud', 'Más amplitud'], ['profundidad', 'Más profundidad'], ['equilibrio', 'Más gente detrás de la pelota'], ['carriles', 'Ocupar los tres carriles']] : [['partido', 'Acortar el equipo'], ['lineas', 'Juntar las líneas'], ['ancho', 'Cerrar hacia la pelota'], ['detras', 'Replegar detrás de la pelota']];
      const good = pool.find(x => x[0] === main.id), rest = pool.filter(x => x !== good && !sh.issues.some(i => i.id === x[0]));
      if (rest.length < 2) return false;
      const fix = 'Ancho ' + Math.round(sh.amplitud) + ' m · largo ' + Math.round(sh.profundidad) + ' m · ' + sh.carriles + ' carriles · ' + sh.detras + ' detrás de la pelota.';
      this.ask({
        key: k, sit: 'distribucion', title: '¿Qué le falta a tu equipo ahora?', text: 'Mirá cómo está repartido. ' + fase.nombre + '.',
        opts: this.mix([{ label: good[1], ok: true, why: main.text + ' ' + fix }].concat(rest.slice(0, 2).map(x => ({ label: x[1], ok: false, why: 'Eso está bien por ahora. ' + fix })))),
        focus: S.ball, shape: true, wide: true, pizarra: fase.pizarra
      });
      return true;
    }

    /* ---------- 5) Con la pelota: ¿qué hacés? ---------- */
    optionWhy(key, probs) {
      const me = this.player, pc = Math.round((probs[key] || 0) * 100) + ' % de las veces la IA elige esto. ';
      if (key.indexOf('pass:') === 0) {
        const o = TA().options(0, me.k).find(x => x.k === +key.slice(5));
        if (!o) return pc;
        return pc + 'Riesgo de corte ' + Math.round(o.risk * 100) + ' %, receptor libre a ' + m(o.free) + ' m, ' + (o.forward > 0.02 ? 'gana ' + Math.round(o.forward * 60) + ' m.' : 'no gana metros.');
      }
      if (key === 'shoot') { const s = TA().shotInfo(me.k); return pc + 'A ' + Math.round(s.gd * 60) + ' m del arco, con ' + s.blockers + ' rival' + (s.blockers === 1 ? '' : 'es') + ' en la línea.'; }
      if (key === 'dribble') { const d = TA().dribbleChoice(me.k); return pc + (me.role === 'ARQ' ? 'El arquero no conduce: una pérdida ahí es gol.' : 'Hay ' + m(d.free) + ' m libres hacia donde conducís.'); }
      if (key === 'clear') return pc + 'Sacás el peligro, pero regalás la posesión.';
      return pc + 'Ganás tiempo para que lleguen los apoyos, con el rival encima.';
    }
    onBall() {
      const me = this.player, third = me.x < 0.34 ? 'salida' : me.x < 0.67 ? 'medio' : 'ultimo', k = this.key('accion', third);
      if (this.level(k) >= 3) return; // ya lo manejás: decide la IA y seguís jugando
      S.opts.carrierHold = true;
      const probs = TA().decideProbs(me.k, 200), keys = Object.keys(probs).sort((a, b) => probs[b] - probs[a]), best = keys[0];
      TA().options(0, me.k).slice().reverse().forEach(o => { const key = 'pass:' + o.k; if (keys.length < 3 && !keys.includes(key)) keys.push(key); });
      ['clear', 'shield'].forEach(key => { if (keys.length < 3 && !keys.includes(key)) keys.push(key); });
      const opts = keys.slice(0, 3).map(key => ({ label: this.keyLabel(key).replace(/^Remata$/, 'Rematar').replace(/^Conduce$/, 'Conducir').replace(/^Protege/, 'Proteger').replace(/^Despeja/, 'Despejar'), key, ok: key === best || (probs[key] || 0) >= probs[best] * 0.85, w: clampPt(this.keyPoint(key, me)), why: this.optionWhy(key, probs) }));
      this.ask({
        key: k, sit: 'accion', title: 'Tenés la pelota: ¿qué hacés?', text: 'Mirá quién está libre y a qué distancia está el rival más cerca (' + m(TA().nearestOpp(me, 0).d) + ' m).', opts: this.mix(opts),
        focus: me, cam: 'hombro', valid: () => S.carrier === this.me, after: (lvl, o) => this.exec(o ? o.key : best)
      });
    }
    exec(key) {
      const me = this.player; S.opts.carrierHold = false;
      if (S.carrier !== this.me) return;
      if (key.indexOf('pass:') === 0) {
        const to = +key.slice(5), r = me.role !== 'ARQ' ? T().wallSpot(me.k, to) : null, k = this.key('apoyo');
        if (r && r.geo && this.level(k) < 3) { this.q.next = () => this.askRun(to, r, k); S.opts.carrierHold = true; return; }
        F7.ball.launchPass(me.k, to, { message: '' });
      } else if (key === 'shoot') F7.ball.shoot(me.k, {});
      else if (key === 'clear') F7.ball.clear(me.k, {});
      else if (key === 'dribble') { const d = TA().dribbleChoice(me.k); S.carrierIntent = { type: 'dribble', tx: d.tx, ty: d.ty, until: S.seconds + 1.6 }; S.cd[0] = 0.8; }
      else { S.carrierIntent = { type: 'shield' }; S.cd[0] = 0.6; }
    }

    /* ---------- 6) Después del pase: ¿a dónde vas? (pared) ---------- */
    askRun(to, r, k) {
      const me = this.player, mate = S.ps[to], dir = 1, play = { runs: { [to]: Object.assign({}, r, { viable: true }) }, carrier: me.k };
      const stay = { x: me.x, y: me.y }, back = clampPt({ x: me.x - dir * 0.12, y: me.y }), why = sp => { const t = T().scoreRun(play, to, sp, false).texts; return t.length ? t[0] : 'Lejos del lugar que pedía la pared.'; };
      this.ask({
        key: k, sit: 'apoyo', title: 'Le pasás al ' + num(mate) + ': ¿a dónde vas?', text: 'Después de pasar no te quedes mirando: pensá en la devolución.',
        opts: this.mix([
          { label: 'Picar al espacio para la pared', ok: true, w: clampPt(r.spot), why: 'Libre de rivales, por delante de la pelota y con línea para que te la devuelva.' },
          { label: 'Quedarme donde estoy', ok: false, w: stay, why: why(stay) },
          { label: 'Volver atrás', ok: false, w: back, why: why(back) }
        ]), focus: r.spot, valid: () => S.carrier === this.me,
        after: (lvl, o) => {
          S.opts.carrierHold = false; if (S.carrier !== this.me) return;
          const spot = o ? o.w : { x: me.x, y: me.y };
          this.target = { x: spot.x, y: spot.y, until: S.seconds + 2.6 };
          F7.ball.launchPass(me.k, to, { message: '' });
          if (o && o.ok) this.wall = { to, t0: null };
        }
      });
    }
    wallTick() { // pared: el compañero devuelve a los 0.25 s de recibir
      const w = this.wall; if (!w) return;
      if (S.owner === 0 && S.carrier === w.to) { if (w.t0 === null) w.t0 = S.seconds; if (S.seconds - w.t0 >= 0.25) { F7.ball.launchPass(w.to, this.me, { through: true, message: '' }); this.wall = null; } }
      else if (S.owner === 1 || (w.t0 !== null && S.carrier !== w.to)) this.wall = null;
    }

    /* ---------- Tarjeta: congelar, mostrar, corregir ---------- */
    mix(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    ask(q) {
      const lvl = this.level(q.key); this.q = q; q.lvl = lvl; this.asked++; this.lastAsk = S.seconds;
      S.opts.carrierHold = true; // mientras frena, el poseedor no decide: si no, la pregunta llegaría tarde
      q.opts.forEach((o, i) => { o.letter = 'ABCDE'[i]; });
      this.up = null;
      this.rampTo(SLOW[lvl], DOWN, smooth);
      const z = q.wide ? 1 : lvl <= 1 ? 1.7 : lvl <= 3 ? 1.4 : 1.15;
      this.view = { focus: { x: q.focus.x, y: q.focus.y }, zoom: this.view ? this.view.zoom : 1, marks: q.opts.filter(o => o.w).map(o => ({ x: o.w.x, y: o.w.y, label: o.letter })), shape: !!q.shape && lvl <= 2, cam: q.cam || null };
      this.zoomAnim = { t0: this.real, dur: DOWN, from: this.view.zoom, to: z, ease: smooth };
      this.panelAt = this.real + DOWN * 0.6;
      this.emit('ask', q);
    }
    answer(o) {
      const q = this.q; if (!q || q.done) return null;
      q.done = true; const right = q.opts.find(x => x.ok), ok = !!(o && o.ok);
      this.record(q.key, ok); if (ok) this.right++;
      this.stat({ t: 'card', sit: q.sit, ok, lvl: q.lvl, pizarra: q.pizarra || null, dec: o && q.shownAt != null ? +(this.real - q.shownAt).toFixed(2) : null, out: !o, pick: o && !ok ? o.label : null });
      if (q.sit !== 'accion' && q.sit !== 'apoyo') S.opts.carrierHold = false;
      if (!ok) { const c = q.sit; this.data.errs[c] = (this.data.errs[c] || 0) + 1; }
      const text = ok ? (o.why || right.why) : (o ? o.why + ' ' : 'Se acabó el tiempo. ') + 'Lo correcto: ' + right.label.toLowerCase() + '. ' + right.why;
      if (this.view) this.view.marks = q.opts.filter(x => x.w).map(x => ({ x: x.w.x, y: x.w.y, label: x.letter, ok: x.ok, bad: x === o && !x.ok }));
      // tu jugador va al lugar: mientras aprendés, al correcto; después, al que elegiste (y ves qué pasa)
      if (q.sit !== 'accion' && q.sit !== 'apoyo' && q.sit !== 'lectura' && q.sit !== 'distribucion') {
        const pick = q.lvl <= 2 ? right : (o || right);
        if (pick.w) this.target = { x: pick.w.x, y: pick.w.y, until: this.mode === 'manual' ? Infinity : S.seconds + 3 };
      }
      if (q.after) q.after(q.lvl, o);
      if (q.lvl >= 1) q.resumeAt = this.real + (q.lvl <= 2 ? 2.6 : q.lvl <= 4 ? 1.8 : 1.2);
      this.emit('answer', { q, o, ok, right, text, slow: SLOW[Math.max(0, Math.min(MAXLV, this.level(q.key)))], lvl: this.level(q.key) });
      return { ok, text };
    }
    resume() {
      const q = this.q; if (!q) return;
      this.q = null;
      if (q.next) { const nx = q.next; q.next = null; nx(); if (this.q) return; S.opts.carrierHold = false; }
      this.emit('resume', q);
      const dur = UP[q.lvl];
      this.rampTo(1, dur, accel);
      this.zoomAnim = { t0: this.real, dur, from: this.view ? this.view.zoom : 1, to: 1, ease: linear };
      this.up = { until: this.real + dur };
      if (this.view) { this.view.shape = false; this.view.cam = null; }
    }
    cancel() { // la jugada cambió antes de que contestes: la tarjeta ya no tiene sentido
      this.q = null; this.panelAt = null; S.opts.carrierHold = false; this.view = null; this.zoomAnim = null; this.rampTo(1, 0.4, accel); this.emit('cancel');
    }
    moveTo(x, y) { // tocaste la cancha
      const p = clampPt({ x, y });
      this.target = { x: p.x, y: p.y, until: this.mode === 'manual' ? Infinity : S.seconds + 3 };
    }
  }

  F7.coach = { Coach, ASPECTS, SIT, LEVEL, SLOW, DEADLINE, GUIDE, INTENT, shape, emptyData, create: o => new Coach(o) };
})(typeof window !== 'undefined' ? window : globalThis);
