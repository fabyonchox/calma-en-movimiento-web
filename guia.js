// Guía del juego: una luz con carita que acompaña al paciente con texto y voz.
// Voz: si existe el audio grabado (audio/guia/<id>.mp3, listado en audio/guia/manifest.json) se usa ese;
// si no, la voz del navegador en español (si el visor la tiene); si tampoco, solo texto.

/* ================= Frases (id -> texto) =================
   Para grabar las voces: un archivo .mp3 por frase, con el id como nombre, en audio/guia/.
   Luego agregar los ids grabados a audio/guia/manifest.json. */

const HAND = {
  right: 'con tu mano derecha',
  left: 'con tu mano izquierda',
  both: 'con cualquiera de tus manos',
};

export const PHRASES = {
  bienvenida: 'Hola, bienvenido a tu sesión de rehabilitación virtual. Yo soy tu guía y te acompañaré durante el juego.',
  calibra: 'Primero vamos a medir tu alcance. Estira el brazo hacia adelante hasta donde te sientas cómodo, y mantenlo quieto un momento.',
  espera_animales: 'Estás en la sala de espera. Mientras tu kinesiólogo prepara la sesión, puedes alimentar a los animalitos con la comida de la mesa.',
  espera: 'Estás en la sala de espera. Tu kinesiólogo está preparando la sesión.',
  dolor_antes: 'Antes de comenzar, cuéntanos cómo te sientes.',

  inst_apples_right: 'Vamos a cosechar manzanas. ' + cap(HAND.right) + ', toma cada manzana del árbol y déjala en el canasto.',
  inst_apples_left: 'Vamos a cosechar manzanas. ' + cap(HAND.left) + ', toma cada manzana del árbol y déjala en el canasto.',
  inst_apples_both: 'Vamos a cosechar manzanas. ' + cap(HAND.both) + ', toma cada manzana del árbol y déjala en el canasto.',
  inst_lights_right: 'Estás en el jardín de luces. Toca cada luz ' + HAND.right + ' cuando aparezca, a tu propio ritmo.',
  inst_lights_left: 'Estás en el jardín de luces. Toca cada luz ' + HAND.left + ' cuando aparezca, a tu propio ritmo.',
  inst_lights_both: 'Estás en el jardín de luces. Toca cada luz ' + HAND.both + ' cuando aparezca, a tu propio ritmo.',
  inst_fair_right: 'Bienvenido a la feria. Toma una pelota de la bandeja ' + HAND.right + ' y lánzala para botar los tarros.',
  inst_fair_left: 'Bienvenido a la feria. Toma una pelota de la bandeja ' + HAND.left + ' y lánzala para botar los tarros.',
  inst_fair_both: 'Bienvenido a la feria. Toma una pelota de la bandeja ' + HAND.both + ' y lánzala para botar los tarros.',

  comenzar: '¡Comencemos!',
  bien_1: '¡Muy bien!',
  bien_2: '¡Excelente!',
  bien_3: '¡Así se hace!',
  bien_4: '¡Lo estás haciendo muy bien!',
  bien_5: '¡Genial, sigue así!',
  bien_6: '¡Perfecto!',
  casi_1: 'Casi, te faltó un poquito.',
  casi_2: 'Ups, a la siguiente lo harás mejor.',
  casi_3: 'Tranquilo, tómate tu tiempo.',
  casi_4: 'No pasa nada, sigamos.',
  casi_feria: 'Casi. Intenta lanzar un poco más hacia los tarros.',
  mitad: '¡Vas en la mitad! Sigue así.',
  falta_una: '¡Te falta solo una!',
  pausa: 'Tomemos un descanso. Cuando quieras, seguimos.',
  seguimos: '¡Seguimos!',
  fin_meta: '¡Lo lograste! Completaste la meta de hoy.',
  fin_tiempo: 'Se terminó el tiempo. ¡Buen trabajo!',
  fin_otro: 'Terminamos por hoy. ¡Gracias por tu esfuerzo!',
  encuesta: 'Ahora tu kinesiólogo te hará unas preguntas.',
  descanso: 'Puedes descansar. Gracias por tu esfuerzo de hoy.',
  adios: '¡Hasta la próxima!',

  // Respira (relajación)
  inst_breath: 'Este es un momento para relajarte. Mira la estrella: cuando se acerca, toma aire; cuando se aleja volando, suéltalo despacio.',
  resp_inhala: 'Inhala…',
  resp_exhala: 'Exhala…',
  resp_sosten: 'Sostén un momento…',
  resp_bien_1: 'Muy bien, sigue a tu ritmo.',
  resp_bien_2: 'Así, con calma.',
  resp_bien_3: 'Deja que el aire entre y salga suavemente.',
  pajaros_intro: 'Ahora sigue al pajarito con la mirada, girando suavemente la cabeza. Si lo acompañas un momento, se detendrá a saludarte.',
  pajaro_1: '¡Mira, el pajarito te saluda!',
  pajaro_2: 'Qué bonito, escucha cómo canta.',
  pajaro_3: 'Muy bien, ahora sigue al próximo pajarito.',
  resp_fin: 'Terminamos este momento de calma. Gracias por regalarte este tiempo.',
  // Respira 360 (ver documento "Protocolo Respira 360"): voz suave, nunca "profundo" (evita respirar de más)
  inst_p360: 'Este es un momento para ti. Siéntate cómodo y deja descansar tus manos. Vamos a respirar suave, a tu ritmo.',
  p360_llegada: 'Observa este lugar y respira como lo haces normalmente.',
  p360_guiada: 'Ahora sigue la luz: cuando crece, toma aire suave; cuando se achica, suéltalo despacio. Sin forzar.',
  p360_vuelta: 'Deja que tu respiración vuelva a su ritmo natural. Quédate un momento aquí.',
  p360_cierre: 'Mueve suavemente los dedos de las manos y de los pies. Cuando estés listo, terminamos.',
  resp_un_poco_mas: 'Un poquito más…',
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export const PRAISE_IDS = ['bien_1', 'bien_2', 'bien_3', 'bien_4', 'bien_5', 'bien_6'];
export const MISS_IDS = ['casi_1', 'casi_2', 'casi_3', 'casi_4'];

/* ================= Voz ================= */

export class GuideVoice {
  constructor(base = 'audio/guia/') {
    this.base = base;
    this.recorded = new Set();
    this.current = null;
    this.esVoice = null;
    this.ready = this.load();
  }

  async load() {
    try {
      if (typeof fetch === 'function') {
        const r = await fetch(this.base + 'manifest.json', { cache: 'no-cache' });
        if (r.ok) {
          const list = await r.json();
          if (Array.isArray(list)) list.forEach((id) => this.recorded.add(String(id)));
        }
      }
    } catch (e) { /* sin audios grabados: se usa la voz del navegador */ }
    this.pickVoice();
    try {
      if (typeof speechSynthesis !== 'undefined' && speechSynthesis.addEventListener) {
        speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
      }
    } catch (e) { /* ok */ }
  }

  pickVoice() {
    try {
      if (typeof speechSynthesis === 'undefined') return;
      const voices = speechSynthesis.getVoices() || [];
      const es = voices.filter((v) => /^es/i.test(v.lang));
      const pref = ['es-CL', 'es-419', 'es-US', 'es-MX', 'es-AR', 'es-ES'];
      this.esVoice = pref.map((l) => es.find((v) => v.lang === l || v.lang.replace('_', '-') === l)).find(Boolean) || es[0] || null;
    } catch (e) { this.esVoice = null; }
  }

  stop() {
    try { if (this.current && this.current.pause) this.current.pause(); } catch (e) { /* ok */ }
    this.current = null;
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) { /* ok */ }
  }

  // Devuelve 'grabado', 'navegador' o 'texto' (para saber qué se usó)
  speak(id, text) {
    this.stop();
    if (this.recorded.has(id) && typeof Audio !== 'undefined') {
      try {
        const a = new Audio(this.base + id + '.mp3');
        a.volume = 0.9;
        this.current = a;
        const p = a.play();
        if (p && p.catch) p.catch(() => this.speakTTS(text));
        return 'grabado';
      } catch (e) { /* sigue con la voz del navegador */ }
    }
    return this.speakTTS(text);
  }

  speakTTS(text) {
    try {
      if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return 'texto';
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.esVoice ? this.esVoice.lang : 'es-CL';
      if (this.esVoice) u.voice = this.esVoice;
      u.rate = 0.95;
      u.pitch = 1.05;
      speechSynthesis.speak(u);
      return 'navegador';
    } catch (e) { return 'texto'; }
  }
}

/* ================= Letra redondeada (Fredoka, licencia libre OFL, incluida en fonts/) ================= */

export const FONT = "'Fredoka', 'Nunito', 'Trebuchet MS', 'Segoe UI', sans-serif";
let fontReady = false;
export function loadGuideFont(onReady) {
  try {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
    const faces = [['600', 'fonts/fredoka-latin-600-normal.woff2'], ['700', 'fonts/fredoka-latin-700-normal.woff2']]
      .map(([w, url]) => new FontFace('Fredoka', `url(${url}) format('woff2')`, { weight: w }));
    Promise.all(faces.map((f) => f.load().then((ff) => document.fonts.add(ff)))).then(() => { fontReady = true; if (onReady) onReady(); }).catch(() => {});
  } catch (e) { /* sin la fuente se usa la letra del sistema */ }
}

// Frases que se celebran con un cartel grande y animado (además de la voz)
export const POP_TEXT = {
  bien_1: '¡Muy bien!', bien_2: '¡Excelente!', bien_3: '¡Así se hace!', bien_4: '¡Muy bien hecho!', bien_5: '¡Genial!', bien_6: '¡Perfecto!',
  mitad: '¡Vas en la mitad!', falta_una: '¡Te falta una!', fin_meta: '¡Lo lograste!',
  pajaro_1: '¡Hola, pajarito!', resp_bien_1: '¡Muy bien!', resp_bien_2: '¡Con calma!', comenzar: '¡Comencemos!',
};
const POP_COLORS = [['#ffd45c', '#ff9a5a'], ['#9be7c4', '#3fb8a0'], ['#ffb6d0', '#ff7aa8'], ['#b9d8ff', '#6fa8ff']];

/* ================= Luz con carita ================= */

export class Guide {
  // opts: { sfx, voice, enabled(): bool, progressEnabled(): bool, eyeH(): m }
  constructor(THREE, anchor, opts) {
    this.T = THREE;
    this.opts = opts;
    this.voice = opts.voice || null;
    this.group = new THREE.Group();
    this.group.visible = false;
    anchor.add(this.group);
    this.anchor = anchor;
    this.queue = [];
    this.current = null;
    this.lastCoachAt = -1e9;
    this.lastPraise = '';
    this.lastMiss = '';
    this.log = []; // historial (para pruebas)
    this.time = 0;
    this.build();
  }

  build() {
    const T = this.T;
    // Cuerpo: lucecita cálida y lisa, con un halo difuso, un brotecito de hojas, alitas y chispas alrededor
    this.body = new T.Group();
    this.group.add(this.body);
    this.glowTex = glowTex(T);
    const coreMat = new T.MeshStandardMaterial({ color: 0xfff6d6, emissive: 0xffcf6b, emissiveIntensity: 0.85, roughness: 0.35 });
    const core = new T.Mesh(new T.SphereGeometry(0.075, 48, 32), coreMat);
    core.scale.set(1, 0.96, 0.92);
    this.body.add(core);
    this.coreMat = coreMat;
    this.halo = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: 0xffe2a0, transparent: true, depthWrite: false, opacity: 0.55 }));
    this.halo.scale.setScalar(0.34);
    this.halo.position.z = -0.02;
    this.body.add(this.halo);
    // Brotecito en la cabeza: tallo + dos hojitas
    const leafMat = new T.MeshStandardMaterial({ color: 0x7ccf8a, roughness: 0.5, emissive: 0x2f6b3a, emissiveIntensity: 0.25, side: T.DoubleSide });
    const stem = new T.Mesh(new T.CylinderGeometry(0.0035, 0.0045, 0.03, 10), leafMat);
    stem.position.set(0, 0.083, 0);
    this.body.add(stem);
    const leafShape = new T.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.018, 0.012, 0.034, 0); leafShape.quadraticCurveTo(0.018, -0.012, 0, 0);
    const leafGeo = new T.ShapeGeometry(leafShape, 12);
    this.leaves = [-1, 1].map((sgn) => {
      const l = new T.Mesh(leafGeo, leafMat);
      l.position.set(0, 0.097, 0);
      l.rotation.set(0, sgn < 0 ? Math.PI : 0, 0.5);
      this.body.add(l);
      return l;
    });
    // Alitas translúcidas detrás
    const wingMat = new T.MeshBasicMaterial({ color: 0xe9f6ff, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false });
    const wingShape = new T.Shape();
    wingShape.moveTo(0, 0); wingShape.quadraticCurveTo(0.05, 0.06, 0.085, 0.03); wingShape.quadraticCurveTo(0.06, -0.01, 0, 0);
    const wingGeo = new T.ShapeGeometry(wingShape, 16);
    this.wings = [-1, 1].map((sgn) => {
      const piv = new T.Group();
      piv.position.set(sgn * 0.045, 0.01, -0.04);
      const w = new T.Mesh(wingGeo, wingMat);
      w.scale.x = sgn;
      piv.add(w);
      this.body.add(piv);
      return piv;
    });
    // Ojos grandes con brillo
    const dark = new T.MeshBasicMaterial({ color: 0x4a3a2a });
    const shine = new T.MeshBasicMaterial({ color: 0xffffff });
    this.eyes = [-0.025, 0.025].map((x) => {
      const e = new T.Group();
      const ball = new T.Mesh(new T.SphereGeometry(0.0125, 20, 14), dark);
      ball.scale.z = 0.6;
      const sp = new T.Mesh(new T.SphereGeometry(0.0042, 10, 8), shine);
      sp.position.set(0.004, 0.005, 0.006);
      e.add(ball, sp);
      e.position.set(x, 0.016, 0.066);
      this.body.add(e);
      return e;
    });
    // Ojitos felices (^ ^) para cuando celebra
    this.happyEyes = [-0.025, 0.025].map((x) => {
      const h = new T.Mesh(new T.TorusGeometry(0.011, 0.0035, 8, 20, Math.PI), dark);
      h.position.set(x, 0.012, 0.07);
      h.visible = false;
      this.body.add(h);
      return h;
    });
    this.mouth = new T.Mesh(new T.TorusGeometry(0.017, 0.0042, 10, 24, Math.PI), dark);
    this.mouth.rotation.z = Math.PI; // sonrisa
    this.mouth.position.set(0, -0.014, 0.07);
    this.body.add(this.mouth);
    const cheekMat = new T.MeshBasicMaterial({ color: 0xffa7a0, transparent: true, opacity: 0.55 });
    [-0.047, 0.047].forEach((x) => {
      const ch = new T.Mesh(new T.CircleGeometry(0.012, 20), cheekMat);
      ch.position.set(x, -0.006, 0.062);
      ch.rotation.y = x > 0 ? 0.5 : -0.5;
      this.body.add(ch);
    });
    // Chispitas que giran alrededor
    this.sparkles = [];
    for (let i = 0; i < 6; i++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: [0xfff2b0, 0xffd1e6, 0xc9f0ff][i % 3], transparent: true, depthWrite: false, opacity: 0.9 }));
      sp.scale.setScalar(0.022);
      sp.userData = { a: (i / 6) * Math.PI * 2, r: 0.11 + (i % 2) * 0.02, sp: 0.6 + (i % 3) * 0.2, y: (i % 3 - 1) * 0.03 };
      this.group.add(sp);
      this.sparkles.push(sp);
    }
    this.joyT = 0; // tiempo restante de "celebración"

    // Cartel de felicitación (grande, con letra redondeada, aparece y se desvanece)
    this.popCanvas = makeCanvas(1024, 300);
    this.popTex = new T.CanvasTexture(this.popCanvas);
    if ('colorSpace' in this.popTex && T.SRGBColorSpace) this.popTex.colorSpace = T.SRGBColorSpace;
    this.pop = new T.Mesh(new T.PlaneGeometry(0.9, 0.264), new T.MeshBasicMaterial({ map: this.popTex, transparent: true, depthWrite: false }));
    this.pop.visible = false;
    this.pop.renderOrder = 10;
    this.pop.userData.guide = true;
    this.popT = -1;
    this.popColor = 0;

    // Globo de texto (arriba del guía)
    this.bubbleCanvas = makeCanvas(768, 360);
    this.bubbleTex = new T.CanvasTexture(this.bubbleCanvas);
    if ('colorSpace' in this.bubbleTex && T.SRGBColorSpace) this.bubbleTex.colorSpace = T.SRGBColorSpace;
    this.bubble = new T.Mesh(new T.PlaneGeometry(0.62, 0.29), new T.MeshBasicMaterial({ map: this.bubbleTex, transparent: true, depthWrite: false }));
    this.bubble.position.set(-0.04, 0.255, 0);
    this.bubble.visible = false;
    this.bubble.userData.guide = true;
    this.group.add(this.bubble);

    // Ventanita de progreso (debajo del guía)
    this.progCanvas = makeCanvas(384, 144);
    this.progTex = new T.CanvasTexture(this.progCanvas);
    if ('colorSpace' in this.progTex && T.SRGBColorSpace) this.progTex.colorSpace = T.SRGBColorSpace;
    this.prog = new T.Mesh(new T.PlaneGeometry(0.24, 0.09), new T.MeshBasicMaterial({ map: this.progTex, transparent: true, depthWrite: false }));
    this.prog.position.set(0, -0.15, 0);
    this.prog.visible = false;
    this.prog.userData.guide = true;
    this.group.add(this.prog);
    this.progKey = '';
    this.anchor.add(this.pop);
    loadGuideFont(() => { if (this.current) this.drawBubble(this.current.text); this.progKey = ''; });
  }

  // Ubicación: arriba a la izquierda, lejos de las manos y del botón de pausa (que está a la derecha).
  // Si hay un menú a la vista en el visor, el guía se corre más a la izquierda para no taparlo.
  place(eyeH) {
    this.eyeH = eyeH;
    this.pop.position.set(0, eyeH + 0.42, -1.45);
    this.pop.lookAt(0, eyeH, 0);
    this.home = { x: this.wide ? -0.86 : -0.56, y: eyeH + 0.08, z: -1.08 };
    this.group.position.set(this.home.x, this.home.y, this.home.z);
    this.aim();
  }

  setWide(wide) {
    if (this.wide === !!wide) return;
    this.wide = !!wide;
    if (this.eyeH !== undefined) this.home.x = this.wide ? -0.86 : -0.56;
  }

  aim() { this.group.rotation.y = Math.atan2(-this.group.position.x, -this.group.position.z); } // la carita mira al paciente

  setVisible(v) { this.group.visible = !!v; if (!v) this.pop.visible = false; }

  enabled() { return !this.opts.enabled || this.opts.enabled(); }

  // priority: 'high' (instrucciones, se encolan) | 'coach' (comentarios del juego, se saltan si está ocupado)
  say(id, priority = 'high') {
    if (!this.enabled()) return false;
    const text = PHRASES[id];
    if (!text) return false;
    if (priority === 'coach') {
      if (this.current || this.queue.length) return false;
      if (this.time - this.lastCoachAt < 2.5) return false;
      this.lastCoachAt = this.time;
    }
    this.queue.push({ id, text });
    if (!this.current) this.next();
    return true;
  }

  // Interrumpe lo que esté diciendo (por ejemplo, al pausar)
  sayNow(id) {
    if (!this.enabled()) return false;
    this.queue = [];
    this.current = null;
    if (this.voice) this.voice.stop();
    return this.say(id, 'high');
  }

  // Descarta lo que estaba esperando turno (por ejemplo, la instrucción de una fase que ya pasó)
  dropQueued() { this.queue = []; }

  clear() {
    this.queue = [];
    this.current = null;
    this.bubble.visible = false;
    if (this.voice) this.voice.stop();
  }

  next() {
    const m = this.queue.shift();
    if (!m) { this.current = null; return; }
    const words = m.text.split(/\s+/).length;
    m.until = this.time + Math.max(2.2, words * 0.42 + 0.8);
    this.current = m;
    this.log.push(m.id);
    if (POP_TEXT[m.id]) {
      // Felicitación: cartel grande + carita feliz (el globo de texto no hace falta)
      this.celebrate(POP_TEXT[m.id]);
      this.bubble.visible = false;
      m.until = this.time + 1.9;
    } else {
      this.drawBubble(m.text);
      this.bubble.visible = true;
    }
    if (this.opts.sfx) this.opts.sfx.guideChime();
    if (this.voice) m.via = this.voice.speak(m.id, m.text);
  }

  praise() {
    const pool = PRAISE_IDS.filter((x) => x !== this.lastPraise);
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (this.say(id, 'coach')) this.lastPraise = id;
  }

  miss(fair) {
    const pool = fair ? ['casi_feria', ...MISS_IDS] : MISS_IDS;
    const opts = pool.filter((x) => x !== this.lastMiss);
    const id = opts[Math.floor(Math.random() * opts.length)];
    if (this.say(id, 'coach')) this.lastMiss = id;
  }

  // hits de reps, y los intentos (presentados o lanzados)
  setProgress(hits, reps, attempts, show) {
    const on = !!show && this.enabled() && (!this.opts.progressEnabled || this.opts.progressEnabled());
    this.prog.visible = on;
    if (!on) return;
    const key = hits + '/' + reps + '/' + attempts;
    if (key === this.progKey) return;
    this.progKey = key;
    const c = this.progCanvas; const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    roundRect(g, 4, 4, c.width - 8, c.height - 8, 36, 'rgba(18,48,44,0.82)', 'rgba(127,216,190,0.9)');
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 54px ' + FONT;
    g.fillText(hits + ' de ' + reps, c.width / 2, 62);
    g.font = '600 30px ' + FONT;
    g.fillStyle = '#cfeee4';
    g.fillText('aciertos · intentos: ' + attempts, c.width / 2, 112);
    this.progTex.needsUpdate = true;
  }

  celebrate(text) {
    this.joyT = 1.6;
    this.popColor = (this.popColor + 1) % POP_COLORS.length;
    this.drawPop(text, POP_COLORS[this.popColor]);
    this.popT = 0;
    this.pop.visible = true;
  }

  // Letra grande, redondeada, con degradé de color, borde blanco grueso, sombra y estrellitas
  drawPop(text, [c1, c2]) {
    const c = this.popCanvas; const g = c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    let size = 150;
    g.font = '700 ' + size + 'px ' + FONT;
    while (g.measureText(text).width > c.width - 140 && size > 70) { size -= 6; g.font = '700 ' + size + 'px ' + FONT; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const cx = c.width / 2; const cy = c.height / 2 + 8;
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(40,30,20,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
    g.lineWidth = 26; g.strokeStyle = '#ffffff'; g.strokeText(text, cx, cy);
    g.shadowColor = 'transparent';
    const grd = g.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
    grd.addColorStop(0, c1); grd.addColorStop(1, c2);
    g.fillStyle = grd; g.fillText(text, cx, cy);
    g.lineWidth = 4; g.strokeStyle = 'rgba(90,60,30,0.35)'; g.strokeText(text, cx, cy);
    // estrellitas a los lados
    const w = g.measureText(text).width;
    [[cx - w / 2 - 50, cy - 40, 26], [cx + w / 2 + 48, cy - 30, 22], [cx + w / 2 + 30, cy + 50, 14], [cx - w / 2 - 34, cy + 46, 15]].forEach(([x, y, r]) => star(g, x, y, r, '#ffe27a'));
    this.popTex.needsUpdate = true;
  }

  drawBubble(text) {
    const c = this.bubbleCanvas; const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    roundRect(g, 6, 6, c.width - 12, c.height - 40, 40, 'rgba(255,252,240,0.96)', 'rgba(255,215,122,1)');
    // colita del globo hacia el guía (abajo a la izquierda)
    g.fillStyle = 'rgba(255,252,240,0.96)';
    g.beginPath(); g.moveTo(150, c.height - 36); g.lineTo(120, c.height - 4); g.lineTo(200, c.height - 36); g.closePath(); g.fill();
    g.fillStyle = '#3d3326';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 46;
    let lines = [];
    for (; size >= 26; size -= 2) {
      g.font = '600 ' + size + 'px ' + FONT;
      lines = wrap(g, text, c.width - 80);
      if (lines.length * size * 1.22 <= c.height - 80 && lines.length <= 4) break;
    }
    const lh = size * 1.22;
    const top = (c.height - 34) / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => g.fillText(l, c.width / 2, top + i * lh));
    this.bubbleTex.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (this.home) {
      this.group.position.y = this.home.y + Math.sin(t * 1.6) * 0.012; // flota suave
      this.group.position.x += (this.home.x - this.group.position.x) * Math.min(1, dt * 3); // se desliza al cambiar de lugar
      this.aim();
    }
    // parpadeo cada ~4 s; al celebrar, ojitos felices (^ ^) y un saltito con giro
    const joy = this.joyT > 0;
    this.joyT = Math.max(0, this.joyT - dt);
    const blink = (t % 4) < 0.12 ? 0.15 : 1;
    this.eyes.forEach((e) => { e.visible = !joy; e.scale.y = blink; });
    this.happyEyes.forEach((h) => { h.visible = joy; });
    this.body.position.y = joy ? Math.abs(Math.sin(this.joyT * 9)) * 0.03 : 0;
    this.body.rotation.y = joy ? Math.sin(this.joyT * 6) * 0.35 : Math.sin(t * 0.7) * 0.08;
    // alitas que aletean suave (más rápido al celebrar), hojitas que se mecen
    const flap = Math.sin(t * (joy ? 16 : 5)) * (joy ? 0.6 : 0.3);
    this.wings[0].rotation.y = 0.5 + flap; this.wings[1].rotation.y = -0.5 - flap;
    this.leaves.forEach((l, i) => { l.rotation.z = 0.5 + Math.sin(t * 1.8 + i) * 0.15; });
    // chispitas girando
    this.sparkles.forEach((sp) => {
      const u = sp.userData; const a = u.a + t * u.sp * (joy ? 3 : 1);
      sp.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 2 + u.a) * 0.01, Math.sin(a) * u.r);
      sp.material.opacity = 0.5 + 0.4 * Math.sin(t * 3 + u.a);
    });
    // brillo del halo y "boca que habla"
    const talking = !!this.current;
    this.halo.material.opacity = 0.45 + Math.sin(t * 2.2) * 0.08 + (talking ? 0.1 : 0) + (joy ? 0.2 : 0);
    this.halo.scale.setScalar(0.34 + (joy ? 0.06 : 0) + Math.sin(t * 2.2) * 0.01);
    this.coreMat.emissiveIntensity = 0.85 + (joy ? 0.35 : 0);
    this.mouth.scale.set(joy ? 1.35 : 1, talking ? 1 + Math.abs(Math.sin(t * 11)) * 0.9 : (joy ? 1.4 : 1), 1);
    // Cartel de felicitación: aparece con un rebote, sube un poco y se desvanece
    if (this.popT >= 0) {
      this.popT += dt;
      const k = this.popT;
      const sc = k < 0.25 ? 0.4 + (k / 0.25) * 0.75 : k < 0.45 ? 1.15 - ((k - 0.25) / 0.2) * 0.15 : 1;
      this.pop.scale.setScalar(sc);
      this.pop.material.opacity = k < 1.3 ? 1 : Math.max(0, 1 - (k - 1.3) / 0.6);
      if (this.eyeH !== undefined) this.pop.position.y = this.eyeH + 0.42 + Math.min(1.9, k) * 0.03;
      if (k > 1.9) { this.popT = -1; this.pop.visible = false; }
    }
    if (this.current && this.time >= this.current.until) {
      this.current = null;
      this.bubble.visible = false;
      this.next();
    }
  }
}

/* ---------- utilidades de dibujo ---------- */

function glowTex(T) {
  const c = makeCanvas(128, 128);
  const g = c.getContext && c.getContext('2d');
  if (g && g.createRadialGradient) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  return new T.CanvasTexture(c);
}

function star(g, x, y, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r; const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr; const py = y + Math.sin(a) * rr;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
  g.fillStyle = color; g.fill();
  g.lineWidth = 3; g.strokeStyle = '#ffffff'; g.stroke();
}

function makeCanvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : { width: w, height: h, getContext: () => null };
  c.width = w; c.height = h;
  return c;
}

function roundRect(g, x, y, w, h, r, fill, stroke) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = 5; g.strokeStyle = stroke; g.stroke(); }
}

function wrap(g, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}
