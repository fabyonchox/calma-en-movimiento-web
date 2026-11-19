// "Respira": escena de relajación (estrella que respira, luciérnagas, pajaritos que siguen la mirada) y música.
// Estilo suave: formas redondeadas, sombreado liso, brillos difusos. Nada se mueve rápido ni se pega a la cabeza.
import { breathAt, plan, perchAngles, looking, WORDS, cycleSecs } from './respira_logica.js';

const DEG = Math.PI / 180;
const BIRD_COLORS = [
  { body: 0x9ec9e8, wing: 0x7fb2d9, belly: 0xf3efe2 },
  { body: 0xf2b8a2, wing: 0xe39a84, belly: 0xfbeee4 },
  { body: 0xf5d98b, wing: 0xe8c467, belly: 0xfdf6e3 },
];

export class BreathScene {
  // host: { audioCtx(), musicOn(), sfx, onCycle(n), onBird(n), onStage(name), onWord(name) }
  constructor(THREE, anchor, host) {
    this.T = THREE;
    this.host = host;
    this.group = new THREE.Group();
    this.group.visible = false;
    anchor.add(this.group);
    this.active = false;
    this.music = new RelaxMusic(host.audioCtx);
    this.glowTex = glowTexture(THREE);
    this.build();
  }

  build() {
    const T = this.T;
    // --- Estrella de puntas redondeadas (extruida con bisel: se ve lisa, no facetada) ---
    this.starGroup = new T.Group();
    this.group.add(this.starGroup);
    const geo = new T.ExtrudeGeometry(roundedStar(T, 5, 0.19, 0.085, 0.022), {
      depth: 0.03, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 8, curveSegments: 24,
    });
    geo.center();
    geo.computeVertexNormals();
    this.starMat = new T.MeshStandardMaterial({ color: 0xffe7a3, emissive: 0xffc860, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.05 });
    this.star = new T.Mesh(geo, this.starMat);
    this.starGroup.add(this.star);
    // Halo difuso (sprite aditivo)
    this.halo = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: 0xffc46b, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.4 }));
    this.halo.scale.setScalar(1.1);
    this.starGroup.add(this.halo);
    // Anillo suave que marca el ritmo
    this.ring = new T.Mesh(new T.TorusGeometry(0.42, 0.006, 12, 96), new T.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.35, depthWrite: false }));
    this.starGroup.add(this.ring);
    // Palabra guía ("Inhala", "Exhala") bajo la estrella
    this.wordCanvas = makeCanvas(512, 160);
    this.wordTex = new T.CanvasTexture(this.wordCanvas);
    if (T.SRGBColorSpace) this.wordTex.colorSpace = T.SRGBColorSpace;
    this.word = new T.Mesh(new T.PlaneGeometry(0.75, 0.234), new T.MeshBasicMaterial({ map: this.wordTex, transparent: true, depthWrite: false }));
    this.word.position.set(0, -0.6, 0);
    this.word.userData.guide = true;
    this.starGroup.add(this.word);
    this.lastWord = '';

    // --- Luciérnagas: suben al inhalar, bajan al exhalar ---
    const N = 70;
    const pos = new Float32Array(N * 3);
    this.motes = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 1.8;
      const m = { x: Math.cos(a) * r, z: -1.2 - Math.random() * 2.2 + Math.sin(a) * 0.4, base: 0.2 + Math.random() * 1.6, ph: Math.random() * 6.28, amp: 0.15 + Math.random() * 0.35 };
      this.motes.push(m);
      pos[i * 3] = m.x; pos[i * 3 + 1] = m.base; pos[i * 3 + 2] = m.z;
    }
    const mg = new T.BufferGeometry();
    mg.setAttribute('position', new T.BufferAttribute(pos, 3));
    this.moteGeo = mg;
    this.motePoints = new T.Points(mg, new T.PointsMaterial({ size: 0.05, map: this.glowTex, color: 0xfff0b5, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.85 }));
    this.group.add(this.motePoints);

    // --- Pajaritos ---
    this.birdGroup = new T.Group();
    this.group.add(this.birdGroup);
    this.birds = BIRD_COLORS.map((c) => this.makeBird(c));
    this.birds.forEach((b) => { b.root.visible = false; this.birdGroup.add(b.root); });
    // Punto de luz donde se posará el pajarito + anillo que se llena al mirarlo
    this.perch = new T.Group();
    const perchGlow = new T.Sprite(new T.SpriteMaterial({ map: this.glowTex, color: 0xbfe8ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 }));
    perchGlow.scale.setScalar(0.35);
    this.perch.add(perchGlow);
    this.perchBranch = new T.Mesh(new T.CapsuleGeometry(0.012, 0.28, 6, 12), new T.MeshStandardMaterial({ color: 0x9a7b5b, roughness: 0.8 }));
    this.perchBranch.rotation.z = Math.PI / 2;
    this.perchBranch.position.y = -0.1;
    this.perch.add(this.perchBranch);
    this.fillRing = new T.Mesh(new T.RingGeometry(0.15, 0.17, 64, 1, 0, 0.001), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }));
    this.perch.add(this.fillRing);
    this.perch.visible = false;
    this.group.add(this.perch);
  }

  makeBird(c) {
    const T = this.T;
    const root = new T.Group();
    // Un leve brillo propio para que se vean bien también con la luz del atardecer
    const smooth = (color) => new T.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, emissive: color, emissiveIntensity: 0.28 });
    const body = new T.Mesh(new T.SphereGeometry(0.05, 32, 24), smooth(c.body));
    body.scale.set(1, 0.9, 1.35);
    const belly = new T.Mesh(new T.SphereGeometry(0.043, 32, 24), smooth(c.belly));
    belly.scale.set(0.9, 0.8, 1.15); belly.position.set(0, -0.012, 0.008);
    const head = new T.Mesh(new T.SphereGeometry(0.034, 32, 24), smooth(c.body));
    head.position.set(0, 0.035, 0.05);
    const beak = new T.Mesh(new T.ConeGeometry(0.009, 0.024, 16), smooth(0xf0b45a));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.03, 0.088);
    const eyeM = new T.MeshBasicMaterial({ color: 0x2f2a26 });
    const eyes = [-1, 1].map((s) => { const e = new T.Mesh(new T.SphereGeometry(0.006, 12, 8), eyeM); e.position.set(s * 0.02, 0.045, 0.075); return e; });
    const tail = new T.Mesh(new T.ConeGeometry(0.025, 0.06, 16), smooth(c.wing));
    tail.rotation.x = -Math.PI / 2 - 0.3; tail.position.set(0, 0.01, -0.075); tail.scale.set(1.3, 1, 0.45);
    const wingShape = new T.Shape();
    wingShape.moveTo(0, 0); wingShape.quadraticCurveTo(0.05, 0.03, 0.095, -0.005); wingShape.quadraticCurveTo(0.05, -0.02, 0, -0.03); wingShape.closePath();
    const wingGeo = new T.ShapeGeometry(wingShape, 16);
    const wings = [-1, 1].map((s) => {
      const piv = new T.Group();
      piv.position.set(s * 0.035, 0.02, 0.0);
      const w = new T.Mesh(wingGeo, new T.MeshStandardMaterial({ color: c.wing, roughness: 0.6, side: T.DoubleSide }));
      w.rotation.x = -Math.PI / 2;
      w.scale.x = s;
      piv.add(w);
      return piv;
    });
    root.add(body, belly, head, beak, ...eyes, tail, ...wings);
    root.scale.setScalar(1.8); // tamaño visible a 1,5 m
    return { root, wings, state: 'idle', t: 0 };
  }

  // Ubica todo frente al paciente (coordenadas locales del jardín; -z hacia adelante)
  configure(cfg, eyeH) {
    this.cfg = cfg;
    this.eyeH = eyeH || 1.15;
    this.starGroup.position.set(0, this.eyeH + 0.05, -1.7);
  }

  setVisible(v) { this.group.visible = !!v; }

  start(nowMs) {
    const c = this.cfg || {};
    this.active = true;
    this.t0 = nowMs;
    this.elapsed = 0;
    this.plan = plan((c.minutes || 3) * 60, c.breathContent, c.breathPattern);
    this.stage = this.plan.star > 0 ? 'star' : 'birds';
    this.cycles = 0;
    this.birdsDone = 0;
    this.angles = perchAngles(c.neckRange, 40);
    this.perchIdx = 0;
    this.gazeMs = 0;
    this.birdTarget = null;
    this.starGroup.visible = this.stage === 'star';
    this.birds.forEach((b) => { b.root.visible = false; b.state = 'idle'; });
    this.perch.visible = false;
    this.lastWord = '';
    if (this.host.musicOn()) this.music.start();
    this.host.onStage && this.host.onStage(this.stage);
    if (this.stage === 'birds') this.nextPerch();
  }

  stop() {
    this.active = false;
    this.music.stop();
    this.perch.visible = false;
    this.birds.forEach((b) => { b.root.visible = false; });
  }

  // dt en s; gaze = { yawDeg, pitchDeg } de la cabeza en coordenadas del jardín
  step(dt, gaze) {
    if (!this.active) return;
    this.elapsed += dt;
    const c = this.cfg || {};
    if (this.stage === 'star') {
      const b = breathAt(this.elapsed, c.breathPattern);
      this.drawStar(b);
      if (b.cycle > this.cycles) { this.cycles = b.cycle; this.host.onCycle && this.host.onCycle(this.cycles); }
      if (this.elapsed >= this.plan.star && this.plan.birds > 0) {
        // termina al completar la respiración en curso (plan.star ya son ciclos completos)
        this.stage = 'birds';
        this.starGroup.visible = false;
        this.host.onStage && this.host.onStage('birds');
        this.nextPerch();
      }
    } else {
      this.stepBirds(dt, gaze);
    }
    this.stepMotes(dt);
    this.music.breath(this.stage === 'star' ? breathAt(this.elapsed, c.breathPattern).size : 0.4);
  }

  drawStar(b) {
    const s = 0.62 + 0.45 * b.size;
    this.star.scale.setScalar(s);
    this.star.rotation.z += 0.0015;
    this.starMat.emissiveIntensity = 0.35 + 0.65 * b.size;
    this.halo.scale.setScalar(0.7 + 0.6 * b.size);
    this.halo.material.opacity = 0.18 + 0.3 * b.size;
    this.ring.scale.setScalar(0.85 + 0.35 * b.size);
    this.ring.material.opacity = b.name === 'hold' || b.name === 'holdOut' ? 0.55 : 0.3;
    this.breathSize = b.size;
    const w = WORDS[b.name] || '';
    if (w !== this.lastWord) {
      this.lastWord = w;
      this.drawWord(w);
      this.host.onWord && this.host.onWord(b.name);
    }
  }

  drawWord(text) {
    const c = this.wordCanvas; const g = c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.font = '600 76px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,214,140,0.9)'; g.shadowBlur = 24;
    g.fillStyle = '#fff8e6';
    g.fillText(text, c.width / 2, c.height / 2);
    this.wordTex.needsUpdate = true;
  }

  stepMotes(dt) {
    const p = this.moteGeo.attributes.position;
    const lift = this.stage === 'star' ? (this.breathSize || 0) : 0.4;
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.ph += dt * 0.6;
      p.array[i * 3] = m.x + Math.sin(m.ph * 0.7) * 0.05;
      p.array[i * 3 + 1] = m.base + lift * m.amp + Math.sin(m.ph) * 0.03;
      p.array[i * 3 + 2] = m.z + Math.cos(m.ph * 0.5) * 0.05;
    }
    p.needsUpdate = true;
  }

  /* ----- Pajaritos ----- */

  perchPos(angleDeg) {
    const r = 1.5;
    const a = angleDeg * DEG;
    return { x: Math.sin(a) * r, y: this.eyeH + 0.05, z: -Math.cos(a) * r };
  }

  nextPerch() {
    const ang = this.angles[this.perchIdx % this.angles.length];
    this.perchIdx++;
    this.perchAngle = ang;
    const p = this.perchPos(ang);
    this.perch.position.set(p.x, p.y, p.z);
    this.perch.lookAt(0, this.eyeH, 0);
    this.perch.visible = true;
    this.gazeMs = 0;
    this.setFill(0);
  }

  setFill(f) {
    const T = this.T;
    const old = this.fillRing.geometry;
    this.fillRing.geometry = new T.RingGeometry(0.15, 0.17, 64, 1, Math.PI / 2, -Math.max(0.001, f) * Math.PI * 2);
    old.dispose();
  }

  stepBirds(dt, gaze) {
    // Pajarito volando hacia la rama
    const flying = this.birds.find((b) => b.state === 'flying');
    if (flying) {
      flying.t += dt / 2.4;
      const k = Math.min(1, flying.t);
      const e = k * k * (3 - 2 * k);
      const a = flying.from; const b = flying.to;
      const arc = Math.sin(Math.PI * k) * 0.35;
      flying.root.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + arc, a.z + (b.z - a.z) * e);
      flying.root.lookAt(b.x, flying.root.position.y, b.z);
      this.flap(flying, 14, 0.9);
      if (k >= 1) {
        flying.state = 'perched';
        flying.perchT = 0;
        flying.root.lookAt(0, this.eyeH, 0);
        this.birdsDone++;
        if (this.host.sfx) this.host.sfx.birdChirp(b.x);
        this.host.onBird && this.host.onBird(this.birdsDone);
      }
      return;
    }
    // Pajarito posado: se queda un rato, canta y luego se va volando suave
    const perched = this.birds.find((b) => b.state === 'perched');
    if (perched) {
      perched.perchT += dt;
      this.flap(perched, 1.2, 0.08);
      perched.root.rotation.z = Math.sin(perched.perchT * 2) * 0.05;
      if (perched.perchT > 3) {
        perched.state = 'idle';
        perched.root.visible = false;
        this.nextPerch();
      }
      return;
    }
    // Esperando la mirada: la cabeza debe apuntar a la luz un momento (se llena el anillo)
    if (!this.perch.visible || !gaze) return;
    if (looking(gaze.yawDeg, this.perchAngle)) this.gazeMs += dt * 1000;
    else this.gazeMs = Math.max(0, this.gazeMs - dt * 600);
    const need = 1500;
    this.setFill(Math.min(1, this.gazeMs / need));
    if (this.gazeMs >= need) {
      this.perch.visible = false;
      const bird = this.birds[this.birdsDone % this.birds.length];
      const to = this.perchPos(this.perchAngle);
      to.y -= 0.02; // queda posado sobre la rama
      const side = this.perchAngle >= 0 ? 1 : -1;
      bird.from = { x: to.x + side * 1.6, y: to.y + 0.9, z: to.z - 1.4 };
      bird.to = to;
      bird.t = 0;
      bird.state = 'flying';
      bird.root.visible = true;
      bird.root.position.set(bird.from.x, bird.from.y, bird.from.z);
    }
  }

  flap(bird, speed, amp) {
    bird.wt = (bird.wt || 0) + 0.016 * speed;
    const a = Math.sin(bird.wt * 2 * Math.PI) * amp;
    bird.wings[0].rotation.z = a;
    bird.wings[1].rotation.z = -a;
  }

  // Para la tablet y las pruebas
  summary() { return { stage: this.stage, cycles: this.cycles, birds: this.birdsDone, cycleSecs: cycleSecs((this.cfg || {}).breathPattern) }; }
}

/* ================= Música de relajación (generada, sin archivos) ================= */

export class RelaxMusic {
  constructor(getCtx) { this.getCtx = getCtx; this.on = false; this.timer = null; }

  start() {
    const c = this.getCtx && this.getCtx();
    if (!c || this.on) return;
    this.on = true;
    this.c = c;
    this.master = c.createGain();
    this.master.gain.setValueAtTime(0.0001, c.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 4);
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.connect(this.master).connect(c.destination);
    // Progresión lenta y luminosa (Do mayor 7 → La menor 7 → Fa mayor 7 → Sol sus)
    this.chords = [[130.81, 196.0, 246.94, 329.63], [110.0, 164.81, 196.0, 261.63], [87.31, 130.81, 164.81, 220.0], [98.0, 146.83, 196.0, 261.63]];
    this.ci = 0;
    this.playChord();
    this.timer = setInterval(() => this.playChord(), 9000);
  }

  playChord() {
    const c = this.c; if (!c || !this.on) return;
    const t = c.currentTime;
    const notes = this.chords[this.ci++ % this.chords.length];
    notes.forEach((f, i) => {
      [0, 1].forEach((d) => {
        const o = c.createOscillator();
        o.type = d ? 'triangle' : 'sine';
        o.frequency.value = f * (d ? 1.003 : 1);
        const g = c.createGain();
        const v = 0.05 / (i + 1.4) / (d ? 2 : 1);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 3);
        g.gain.setValueAtTime(v, t + 7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 11.5);
        o.connect(g).connect(this.filter);
        o.start(t); o.stop(t + 12);
      });
    });
    // De vez en cuando, un cuenco suave
    if (this.ci % 2 === 0) this.bowl(t + 1.5, notes[0] * 4);
  }

  bowl(t, f) {
    const c = this.c;
    [1, 2.71, 5.15].forEach((m, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03 / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 6 - i);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + 6.2);
    });
  }

  // La música "respira" con la estrella: se abre un poco al inhalar
  breath(size) {
    if (!this.on || !this.filter) return;
    try { this.filter.frequency.setTargetAtTime(700 + 900 * size, this.c.currentTime, 0.4); } catch (e) { /* ok */ }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.on) return;
    this.on = false;
    try {
      const t = this.c.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.8);
    } catch (e) { /* ok */ }
  }
}

/* ================= utilidades ================= */

// Estrella de puntas redondeadas
function roundedStar(T, points, rOut, rIn, round) {
  const sh = new T.Shape();
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const n = pts.length;
  const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]; const cur = pts[i]; const next = pts[(i + 1) % n];
    const dPrev = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    const dNext = Math.hypot(next[0] - cur[0], next[1] - cur[1]);
    const a = lerp(cur, prev, Math.min(0.45, round / dPrev));
    const b = lerp(cur, next, Math.min(0.45, round / dNext));
    if (i === 0) sh.moveTo(a[0], a[1]); else sh.lineTo(a[0], a[1]);
    sh.quadraticCurveTo(cur[0], cur[1], b[0], b[1]);
  }
  sh.closePath();
  return sh;
}

function makeCanvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : { width: w, height: h, getContext: () => null };
  c.width = w; c.height = h;
  return c;
}

function glowTexture(T) {
  const c = makeCanvas(128, 128);
  const g = c.getContext && c.getContext('2d');
  if (g && g.createRadialGradient) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new T.CanvasTexture(c);
  return tex;
}
