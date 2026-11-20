// "Respira": escena de relajación (estrella que respira, luciérnagas, pajaritos que siguen la mirada) y música.
// Estilo suave: formas redondeadas, sombreado liso, brillos difusos. Nada se mueve rápido ni se pega a la cabeza.
import { RelaxMusic } from './musica.js';
import { breathAt, plan, WORDS, cycleSecs, starPose, birdPath, followCredit, FOLLOW_LAG_SECS, FOLLOW_NEED_MS, greetingOrder } from './respira_logica.js';
import { FONT } from './guia.js';

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

    // Rayos de luz suaves detrás de la estrella (giran muy lento)
    this.rays = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), new T.MeshBasicMaterial({ map: raysTexture(T), color: 0xffd98a, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.3 }));
    this.rays.position.z = -0.04;
    this.starGroup.add(this.rays);

    // Espiral de luz alrededor de la estrella (tipo galaxia): al inhalar las luces viajan hacia la estrella,
    // al exhalar se alejan y la espiral se abre. Gira lento (técnico: ~5°/s, para no marear).
    this.spiralN = 1200;
    this.spiral = [];
    const sp = new Float32Array(this.spiralN * 3);
    const sc = new Float32Array(this.spiralN * 3);
    for (let i = 0; i < this.spiralN; i++) {
      const g1 = (Math.random() + Math.random() + Math.random()) / 3 - 0.5; // reparto suave (más luces al centro del brazo)
      this.spiral.push({ arm: i % 3, u0: Math.random(), j: g1 * 1.1, rj: (Math.random() - 0.5), jz: (Math.random() - 0.5) * 0.08, warm: Math.random() });
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.BufferAttribute(sp, 3));
    sg.setAttribute('color', new T.BufferAttribute(sc, 3));
    this.spiralGeo = sg;
    this.spiralPoints = new T.Points(sg, new T.PointsMaterial({ size: 0.03, map: this.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.95, fog: false }));
    this.spiralPoints.position.z = -0.02;
    this.starGroup.add(this.spiralPoints);
    this.flow = 0;
    this.spin = 0;

    // Cielo de estrellas alrededor del paciente (aparece de a poco con la estrella, en todo el entorno)
    const skyN = 650;
    const kp = new Float32Array(skyN * 3);
    for (let i = 0; i < skyN; i++) {
      // solo sobre el horizonte, a 22–28 m
      const a = Math.random() * Math.PI * 2;
      const el = Math.asin(0.08 + Math.random() * 0.92);
      const r = 22 + Math.random() * 6;
      kp[i * 3] = Math.cos(el) * Math.sin(a) * r; kp[i * 3 + 1] = Math.sin(el) * r; kp[i * 3 + 2] = -Math.cos(el) * Math.cos(a) * r;
    }
    const kg = new T.BufferGeometry();
    kg.setAttribute('position', new T.BufferAttribute(kp, 3));
    this.skyStars = new T.Points(kg, new T.PointsMaterial({ size: 0.16, map: this.glowTex, color: 0xfff6dd, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0, fog: false }));
    this.skyStars.visible = false;
    this.group.add(this.skyStars);
    this.skyK = 0;

    // Estela de chispas que deja la estrella al volar
    this.trailN = 26;
    this.trail = [];
    const tpos = new Float32Array(this.trailN * 3);
    const tg = new T.BufferGeometry();
    tg.setAttribute('position', new T.BufferAttribute(tpos, 3));
    this.trailGeo = tg;
    this.trailPoints = new T.Points(tg, new T.PointsMaterial({ size: 0.07, map: this.glowTex, color: 0xffe2a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.7 }));
    this.group.add(this.trailPoints);

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
    // Anillo suave alrededor del pajarito: se va llenando mientras el paciente lo sigue con la mirada
    this.follow = new T.Group();
    const track = new T.Mesh(new T.RingGeometry(0.17, 0.18, 64), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: T.DoubleSide, depthWrite: false }));
    this.follow.add(track);
    this.fillRing = new T.Mesh(new T.RingGeometry(0.165, 0.185, 64, 1, 0, 0.001), new T.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
    this.follow.add(this.fillRing);
    this.follow.visible = false;
    this.group.add(this.follow);
    this.fillShown = -1;
    // Globo de diálogo del pajarito (aparece cuando saluda)
    this.sayCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : { width: 640, height: 260 };
    this.sayCanvas.width = 640; this.sayCanvas.height = 260;
    this.sayTex = new T.CanvasTexture(this.sayCanvas);
    if ('colorSpace' in this.sayTex) this.sayTex.colorSpace = T.SRGBColorSpace;
    this.say = new T.Mesh(new T.PlaneGeometry(0.78, 0.317), new T.MeshBasicMaterial({ map: this.sayTex, transparent: true, depthWrite: false, side: T.DoubleSide }));
    this.say.visible = false;
    this.say.renderOrder = 5;
    this.group.add(this.say);
    this._v = new T.Vector3();
  }

  // lookAt de three.js usa coordenadas del mundo; el jardín puede estar girado o desplazado (recentrar),
  // así que se convierte el punto desde las coordenadas del jardín antes de mirar.
  faceLocal(obj, x, y, z) {
    const v = this._v.set(x, y, z);
    this.group.localToWorld(v);
    obj.lookAt(v);
  }

  // Dónde está la cabeza del paciente (coordenadas del jardín). Si no se sabe, al centro.
  headPos(gaze) {
    return gaze && gaze.pos ? gaze.pos : { x: 0, y: this.eyeH, z: 0 };
  }

  // Ángulo del pajarito visto desde la cabeza (grados; positivo = derecha)
  yawFromHead(h, p) { return Math.atan2(p.x - h.x, -(p.z - h.z)) / DEG; }

  drawSay(text) {
    const c = this.sayCanvas; const g = c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    const r = 60; const w = c.width - 12; const h = c.height - 56;
    g.fillStyle = 'rgba(255,253,244,0.97)'; g.strokeStyle = '#ffd77a'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(6 + r, 6); g.arcTo(6 + w, 6, 6 + w, 6 + h, r); g.arcTo(6 + w, 6 + h, 6, 6 + h, r);
    g.lineTo(c.width / 2 + 26, 6 + h); g.lineTo(c.width / 2, c.height - 8); g.lineTo(c.width / 2 - 26, 6 + h);
    g.arcTo(6, 6 + h, 6, 6, r); g.arcTo(6, 6, 6 + w, 6, r); g.closePath(); g.fill(); g.stroke();
    let size = 76;
    g.font = '700 ' + size + 'px ' + FONT;
    while (g.measureText(text).width > w - 70 && size > 40) { size -= 4; g.font = '700 ' + size + 'px ' + FONT; }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const grd = g.createLinearGradient(0, 30, 0, h);
    grd.addColorStop(0, '#f08a5d'); grd.addColorStop(1, '#d9577a');
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.strokeText(text, c.width / 2, 6 + h / 2 + 4);
    g.fillStyle = grd; g.fillText(text, c.width / 2, 6 + h / 2 + 4);
    this.sayTex.needsUpdate = true;
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
    const p = starPose(0, 0);
    this.starGroup.position.set(p.x, this.eyeH + p.y, p.z);
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
    this.birdIdx = 0;
    this.gazeMs = 0;
    this.trail = [];
    this.skyK = 0; this.flow = 0;
    this.greetQueue = greetingOrder();
    this.starGroup.visible = this.stage === 'star';
    this.trailPoints.visible = this.stage === 'star';
    this.birds.forEach((b) => { b.root.visible = false; b.state = 'idle'; });
    this.follow.visible = false;
    this.say.visible = false;
    this.headSpeed = 0; this.yawHist = []; this.histT = 0;
    this.lastWord = '';
    if (this.host.musicOn()) this.music.start();
    this.host.onStage && this.host.onStage(this.stage);
    if (this.stage === 'birds') this.nextBird();
  }

  stop() {
    this.active = false;
    this.skyStars.visible = false; this.skyK = 0;
    this.music.stop();
    this.follow.visible = false;
    this.birds.forEach((b) => { b.root.visible = false; });
    if (this.say) this.say.visible = false;
  }

  // dt en s; gaze = { yawDeg, pitchDeg } de la cabeza en coordenadas del jardín
  step(dt, gaze) {
    if (!this.active) return;
    this.elapsed += dt;
    this.lastDt = dt;
    this.group.updateMatrixWorld(true);
    // Cielo de estrellas: aparece de a poco con la estrella y se va con los pajaritos
    const skyTarget = this.stage === 'star' ? 1 : 0;
    this.skyK += (skyTarget - this.skyK) * Math.min(1, dt * 0.35);
    this.skyStars.visible = this.skyK > 0.01;
    this.skyStars.material.opacity = 0.9 * this.skyK;
    const c = this.cfg || {};
    if (this.stage === 'star') {
      const b = breathAt(this.elapsed, c.breathPattern);
      this.drawStar(b);
      if (b.cycle > this.cycles) { this.cycles = b.cycle; this.host.onCycle && this.host.onCycle(this.cycles); }
      if (this.elapsed >= this.plan.star && this.plan.birds > 0) {
        // termina al completar la respiración en curso (plan.star ya son ciclos completos)
        this.stage = 'birds';
        this.starGroup.visible = false;
        this.trailPoints.visible = false;
        this.host.onStage && this.host.onStage('birds');
        this.nextBird();
      }
    } else {
      this.stepBirds(dt, gaze);
    }
    this.stepMotes(dt);
    this.music.breath(this.stage === 'star' ? breathAt(this.elapsed, c.breathPattern).size : 0.4);
  }

  drawStar(b) {
    // La estrella VUELA: al inhalar se acerca, al exhalar se aleja flotando (ver starPose).
    const p = starPose(b.size, this.elapsed);
    this.starGroup.position.set(p.x, this.eyeH + p.y, p.z);
    this.faceLocal(this.starGroup, 0, this.eyeH, 0);
    this.updateTrail();
    this.updateSpiral(b);
    this.rays.rotation.z += 0.0015;
    this.rays.scale.setScalar(0.75 + 0.5 * b.size);
    this.rays.material.opacity = 0.12 + 0.3 * b.size;
    const s = 0.8 + 0.3 * b.size;
    this.star.scale.setScalar(s);
    this.star.rotation.z += 0.004 + 0.01 * (1 - b.size); // gira más al alejarse
    this.starMat.emissiveIntensity = 0.35 + 0.65 * b.size;
    this.halo.scale.setScalar(0.7 + 0.6 * b.size);
    this.halo.material.opacity = 0.18 + 0.3 * b.size;
    this.ring.scale.setScalar(0.85 + 0.35 * b.size);
    this.ring.material.opacity = b.name === 'hold' || b.name === 'holdOut' ? 0.4 : 0.15;
    this.breathSize = b.size;
    const w = WORDS[b.name] || '';
    if (w !== this.lastWord) {
      this.lastWord = w;
      this.drawWord(w);
      this.host.onWord && this.host.onWord(b.name);
    }
  }

  // Espiral: cada luz recorre su brazo; u = 0 junto a la estrella, u = 1 en el borde.
  updateSpiral(b) {
    const dt = this.lastDt || 1 / 72;
    // Inhalar: las luces viajan hacia la estrella. Exhalar: se alejan. Sostener: casi quietas.
    const dir = b.name === 'inhale' ? -1 : b.name === 'exhale' ? 1 : 0;
    this.flow += dir * dt * 0.09;
    this.spin += dt * 0.09; // ~5°/s
    const rMax = 0.42 + 0.5 * (1 - b.size); // cerca: espiral más recogida; lejos: más abierta (tamaño aparente parecido)
    const pos = this.spiralGeo.attributes.position.array;
    const col = this.spiralGeo.attributes.color.array;
    const glow = 0.55 + 0.45 * b.size;
    for (let i = 0; i < this.spiralN; i++) {
      const q = this.spiral[i];
      let u = (q.u0 + this.flow) % 1; if (u < 0) u += 1;
      const r = (0.07 + rMax * Math.pow(u, 0.85)) * (1 + q.rj * 0.14);
      const th = q.arm * (2 * Math.PI / 3) + 3.2 * u + this.spin + q.j * (0.35 + 0.9 * u);
      pos[i * 3] = Math.cos(th) * r;
      pos[i * 3 + 1] = Math.sin(th) * r;
      pos[i * 3 + 2] = q.jz - 0.08 * u;
      // Brillo: más intenso cerca de la estrella, se apaga en el borde (sin cortes al reaparecer)
      const fade = Math.min(1, u * 8) * (1 - u) * glow;
      const w = q.warm;
      col[i * 3] = fade * (0.85 + 0.15 * w); col[i * 3 + 1] = fade * (0.75 + 0.15 * w); col[i * 3 + 2] = fade * (1 - 0.45 * w);
    }
    this.spiralGeo.attributes.position.needsUpdate = true;
    this.spiralGeo.attributes.color.needsUpdate = true;
  }

  // Estela: guarda las últimas posiciones de la estrella y las dibuja como chispas que se desvanecen
  updateTrail() {
    const g = this.starGroup.position;
    this.trail.unshift({ x: g.x, y: g.y, z: g.z });
    if (this.trail.length > this.trailN) this.trail.length = this.trailN;
    const a = this.trailGeo.attributes.position;
    for (let i = 0; i < this.trailN; i++) {
      const q = this.trail[Math.min(i * 2, this.trail.length - 1)] || g;
      a.array[i * 3] = q.x + Math.sin(i * 1.7 + this.elapsed) * 0.012 * i;
      a.array[i * 3 + 1] = q.y - 0.004 * i;
      a.array[i * 3 + 2] = q.z;
    }
    a.needsUpdate = true;
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

  // Posición en el vuelo de ida y vuelta (a 1,6 m, frente al paciente, dentro del rango de giro)
  pathPos(bird, t) {
    const p = birdPath(t, (this.cfg || {}).neckRange, bird.idx);
    const a = p.yawDeg * DEG;
    const r = 1.6;
    return { x: Math.sin(a) * r, y: this.eyeH + 0.05 + p.yOff, z: -Math.cos(a) * r, yawDeg: p.yawDeg };
  }

  nextBird() {
    const bird = this.birds[this.birdIdx % this.birds.length];
    bird.idx = this.birdIdx++;
    bird.state = 'enter';
    bird.t = 0;
    bird.pathT = 0;
    const to = this.pathPos(bird, 0);
    const side = bird.idx % 2 === 0 ? -1 : 1;
    bird.from = { x: side * 2.6, y: this.eyeH + 0.9, z: -2.6 };
    bird.to = to;
    bird.root.visible = true;
    bird.root.rotation.set(0, 0, 0);
    bird.root.position.set(bird.from.x, bird.from.y, bird.from.z);
    this.gazeMs = 0;
    this.setFill(0);
    this.follow.visible = false;
    this.active_bird = bird;
  }

  setFill(f) {
    const k = Math.round(f * 60) / 60;
    if (k === this.fillShown) return;
    this.fillShown = k;
    const T = this.T;
    const old = this.fillRing.geometry;
    this.fillRing.geometry = new T.RingGeometry(0.165, 0.185, 64, 1, Math.PI / 2, -Math.max(0.001, k) * Math.PI * 2);
    old.dispose();
  }

  stepBirds(dt, gaze) {
    const bird = this.active_bird;
    if (!bird) return;
    bird.t += dt;
    this.group.updateMatrixWorld(true);
    const pos = bird.root.position;
    const h = this.headPos(gaze);
    // Rapidez de giro de la cabeza, medida como cuánto avanzó en el último medio segundo: así un temblor
    // pequeño (va y vuelve) no cuenta, y acompañar el vuelo (avanza hacia un lado) sí.
    if (gaze) {
      const hist = this.yawHist || (this.yawHist = []);
      this.histT = (this.histT || 0) + dt;
      hist.push([this.histT, gaze.yawDeg]);
      while (hist.length > 2 && this.histT - hist[1][0] >= 0.5) hist.shift();
      const span = this.histT - hist[0][0];
      this.headSpeed = span > 0.2 ? Math.abs(gaze.yawDeg - hist[0][1]) / span : 0;
    }

    if (bird.state === 'enter') {
      // Llega volando desde un costado hasta el comienzo de su recorrido, mirando hacia el paciente
      const k = Math.min(1, bird.t / 2.5);
      const e = k * k * (3 - 2 * k);
      const a = bird.from; const b = bird.to;
      pos.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(Math.PI * k) * 0.25, a.z + (b.z - a.z) * e);
      this.faceBlend(bird, b.x - a.x, b.z - a.z, h, 0.5);
      this.flap(bird, 14, 0.9);
      if (k >= 1) { bird.state = 'roam'; bird.t = 0; bird.pathT = 0; }
      return;
    }

    if (bird.state === 'roam') {
      // Vuela de lado a lado sin parar; el paciente lo sigue girando suavemente la cabeza
      bird.pathT += dt;
      const p = this.pathPos(bird, bird.pathT);
      const nx = this.pathPos(bird, bird.pathT + 0.15);
      const lag = this.pathPos(bird, Math.max(0, bird.pathT - FOLLOW_LAG_SECS));
      pos.set(p.x, p.y, p.z);
      // De tres cuartos: mira hacia donde vuela, pero con la carita girada hacia el paciente (nunca de espaldas)
      this.faceBlend(bird, nx.x - p.x, nx.z - p.z, h, 0.65);
      this.flap(bird, 10, 0.75);
      this.birdYaw = p.yawDeg;
      // Anillo de seguimiento alrededor del pajarito, mirando al paciente
      this.follow.visible = true;
      this.follow.position.set(p.x, p.y + 0.005, p.z);
      this.faceLocal(this.follow, h.x, h.y, h.z);
      const f = gaze ? followCredit(gaze.yawDeg, this.yawFromHead(h, p), this.yawFromHead(h, lag), this.headSpeed) : { near: false, credit: false };
      if (f.credit) this.gazeMs += dt * 1000;
      else if (!f.near) this.gazeMs = Math.max(0, this.gazeMs - dt * 250);
      this.setFill(Math.min(1, this.gazeMs / FOLLOW_NEED_MS));
      // El anillo brilla un poco más mientras lo está siguiendo
      this.fillRing.material.opacity = f.near ? 1 : 0.7;
      if (this.gazeMs >= FOLLOW_NEED_MS) {
        // ¡Lo acompañó! El pajarito se detiene, se da vuelta hacia el paciente y lo saluda
        bird.state = 'greet';
        bird.t = 0;
        bird.greetPos = { x: p.x, y: p.y, z: p.z };
        this.follow.visible = false;
        this.birdsDone++;
        if (!this.greetQueue || !this.greetQueue.length) this.greetQueue = greetingOrder();
        this.drawSay(this.greetQueue.shift());
        if (this.host.sfx) this.host.sfx.birdChirp(p);
        this.host.onBird && this.host.onBird(this.birdsDone);
      }
      return;
    }

    if (bird.state === 'greet') {
      // Se queda tranquilo frente al paciente: saltitos, saluda con un ala, inclina la cabeza y "habla"
      const t = bird.t;
      const g = bird.greetPos;
      const hop = t < 1.4 ? Math.abs(Math.sin(t * 7)) * 0.04 * (1 - t / 1.4) : (t > 3 && t < 3.6 ? Math.abs(Math.sin((t - 3) * 10)) * 0.02 : 0);
      pos.set(g.x, g.y + hop, g.z);
      this.faceLocal(bird.root, h.x, h.y, h.z);
      bird.root.rotateZ(Math.sin(t * 2.2) * 0.18); // inclina la cabeza
      if (t > 0.6 && t < 3.2) {
        bird.wings[0].rotation.z = 0.15;
        bird.wings[1].rotation.z = -0.4 - 0.7 * Math.abs(Math.sin((t - 0.6) * 6)); // saludo con un ala
      } else {
        this.flap(bird, 2, 0.1);
      }
      // Globo con el saludo, sobre el pajarito y mirando al paciente (aparece con un pequeño rebote)
      const show = t > 0.35 && t < 4.6;
      this.say.visible = show;
      if (show) {
        const k = Math.min(1, (t - 0.35) / 0.35);
        const out = t > 4.2 ? Math.max(0, 1 - (t - 4.2) / 0.4) : 1;
        const sc = (0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.12) * out;
        this.say.scale.setScalar(Math.max(0.01, sc));
        this.say.position.set(g.x, g.y + 0.36, g.z);
        this.faceLocal(this.say, h.x, h.y, h.z);
      }
      if (t > 1.6 && !bird.secondChirp) { bird.secondChirp = true; if (this.host.sfx) this.host.sfx.birdChirp(g); }
      if (t > 4.8) {
        this.say.visible = false;
        bird.state = 'leave'; bird.t = 0; bird.secondChirp = false;
        bird.from = { ...g };
        const out = g.x >= 0 ? 1 : -1;
        bird.to = { x: g.x + out * 2.2, y: g.y + 1.3, z: g.z - 2.4 };
      }
      return;
    }

    if (bird.state === 'leave') {
      const k = Math.min(1, bird.t / 2.2);
      const e = k * k;
      const a = bird.from; const b = bird.to;
      pos.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e);
      this.faceLocal(bird.root, b.x, b.y, b.z);
      this.flap(bird, 14, 0.9);
      if (k >= 1) {
        bird.state = 'idle';
        bird.root.visible = false;
        this.nextBird();
      }
    }
  }

  // Orienta al pajarito entre la dirección de vuelo (dx, dz) y la cabeza del paciente (w: cuánto mira al paciente)
  faceBlend(bird, dx, dz, h, w) {
    const p = bird.root.position;
    const tl = Math.hypot(dx, dz) || 1;
    let hx = h.x - p.x; let hz = h.z - p.z;
    const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
    const fx = (dx / tl) * (1 - w) + hx * w; const fz = (dz / tl) * (1 - w) + hz * w;
    this.faceLocal(bird.root, p.x + fx, p.y, p.z + fz);
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

/* ================= utilidades ================= */

// Rayos suaves (para detrás de la estrella)
function raysTexture(T) {
  const c = makeCanvas(256, 256); const g = c.getContext && c.getContext('2d');
  if (g) {
    g.translate(128, 128);
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      const len = i % 2 ? 90 : 124;
      const grd = g.createLinearGradient(0, 0, 0, -len);
      grd.addColorStop(0, 'rgba(255,240,200,0.75)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(-7, 0); g.lineTo(0, -len); g.lineTo(7, 0); g.closePath(); g.fill();
    }
  }
  const t = new T.CanvasTexture(c);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  return t;
}

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

export { RelaxMusic };
