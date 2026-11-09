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
    // Cuerpo: esfera luminosa cálida + halo
    this.body = new T.Group();
    this.group.add(this.body);
    const core = new T.Mesh(new T.SphereGeometry(0.075, 32, 20), new T.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd77a, emissiveIntensity: 0.9, roughness: 0.4 }));
    this.body.add(core);
    this.halo = new T.Mesh(new T.SphereGeometry(0.11, 24, 16), new T.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22, depthWrite: false }));
    this.body.add(this.halo);
    // Carita (mira hacia +z, hacia el paciente)
    const dark = new T.MeshBasicMaterial({ color: 0x5a4632 });
    this.eyes = [-0.024, 0.024].map((x) => {
      const e = new T.Mesh(new T.SphereGeometry(0.0095, 12, 8), dark);
      e.position.set(x, 0.014, 0.07);
      this.body.add(e);
      return e;
    });
    this.mouth = new T.Mesh(new T.TorusGeometry(0.02, 0.0045, 8, 20, Math.PI), dark);
    this.mouth.rotation.z = Math.PI; // sonrisa
    this.mouth.position.set(0, -0.012, 0.071);
    this.body.add(this.mouth);
    const cheekMat = new T.MeshBasicMaterial({ color: 0xffb3a7, transparent: true, opacity: 0.6 });
    [-0.045, 0.045].forEach((x) => {
      const ch = new T.Mesh(new T.CircleGeometry(0.011, 16), cheekMat);
      ch.position.set(x, -0.006, 0.066);
      this.body.add(ch);
    });

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
  }

  // Ubicación: arriba a la izquierda, lejos de las manos y del botón de pausa (que está a la derecha).
  // Si hay un menú a la vista en el visor, el guía se corre más a la izquierda para no taparlo.
  place(eyeH) {
    this.eyeH = eyeH;
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

  setVisible(v) { this.group.visible = !!v; }

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
    this.drawBubble(m.text);
    this.bubble.visible = true;
    this.log.push(m.id);
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
    g.font = '700 52px sans-serif';
    g.fillText(hits + ' de ' + reps, c.width / 2, 62);
    g.font = '600 30px sans-serif';
    g.fillStyle = '#cfeee4';
    g.fillText('aciertos · intentos: ' + attempts, c.width / 2, 112);
    this.progTex.needsUpdate = true;
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
      g.font = '600 ' + size + 'px sans-serif';
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
    // parpadeo cada ~4 s
    const blink = (t % 4) < 0.12 ? 0.15 : 1;
    this.eyes.forEach((e) => { e.scale.y = blink; });
    // brillo del halo y "boca que habla"
    const talking = !!this.current;
    this.halo.material.opacity = 0.2 + Math.sin(t * 2.2) * 0.04 + (talking ? 0.06 : 0);
    this.mouth.scale.y = talking ? 1 + Math.abs(Math.sin(t * 11)) * 0.9 : 1;
    if (this.current && this.time >= this.current.until) {
      this.current = null;
      this.bubble.visible = false;
      this.next();
    }
  }
}

/* ---------- utilidades de dibujo ---------- */

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
