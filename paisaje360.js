// Respira 360: sesión de respiración guiada dentro de un paisaje 360° quieto (foto, sin movimiento de cámara).
// Ver el documento "Protocolo Respira 360". Fases: llegada → respiración guiada → vuelta a la calma → cierre.
//
// Pocos distractores a propósito: el paisaje no se mueve, no hay objetos que seguir; solo una luz suave que crece
// al inhalar y se achica al exhalar, una palabra y (si se elige) la cuenta de segundos.
//
// Fotos: paisajes/<id>.jpg (equirectangulares 2:1, licencia CC0, por ejemplo de Poly Haven). Si la foto no está,
// se usa un paisaje pintado por el juego, para que la sesión funcione igual.

import { breathAt, WORDS, LANDSCAPES, DEFAULT_LANDSCAPE, landscapePlan, landscapePhaseAt } from './respira_logica.js';
import { FONT } from './guia.js';

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// Elementos 3D sobre cada cielo, para que el lugar se distinga (las fotos "puresky" son solo cielo):
// agua en calma bajo el horizonte, islas lejanas y, de noche, estrellas nítidas.
const LOOK = {
  amanecer: { water: 0x7472c0, waterHi: 0xf4d6e6, island: 0x4f4a86, stars: 0 },
  nubes: { water: 0x7d9cc0, waterHi: 0xf2f6fb, island: 0x56708c, stars: 0 },
  atardecer: { water: 0x35507c, waterHi: 0xeaf0f6, island: 0x26364f, stars: 0 },
  noche: { water: 0x0c1222, waterHi: 0x6d7fa8, island: 0x05080f, stars: 1 },
};

// Giro de cada foto para que lo más bonito quede al frente (grados; se ajusta al ver la foto en el Quest)
const YAW = { amanecer: 0, nubes: 0, atardecer: 0, noche: 140, playa: 0, cascada: 0, pradera: 0, bosque: 0 };

/* ---------- Paisajes pintados (reemplazo mientras no estén las fotos) ---------- */
function paintLandscape(id) {
  const c = makeCanvas(2048, 1024); if (!c) return null;
  const g = c.getContext('2d');
  const W = c.width; const H = c.height; const hz = H * 0.54; // horizonte un poco bajo el centro
  const R = rng(id.length * 97 + 13);
  const sky = {
    playa: ['#f6c7a1', '#f9e2c8', '#cfe1ef', '#8fb3d6'],
    cascada: ['#dbe9f2', '#c4dcea', '#a9cbe0', '#8ab6d4'],
    pradera: ['#e9f1f6', '#cfe4f1', '#acd0e8', '#8dbbe0'],
    bosque: ['#e3ecef', '#cfe0e6', '#b7d0da', '#9bbccb'],
  }[id] || ['#e9f1f6', '#cfe4f1', '#acd0e8', '#8dbbe0'];
  const sg = g.createLinearGradient(0, hz, 0, 0);
  sg.addColorStop(0, sky[0]); sg.addColorStop(0.25, sky[1]); sg.addColorStop(0.6, sky[2]); sg.addColorStop(1, sky[3]);
  g.fillStyle = sg; g.fillRect(0, 0, W, hz + 2);
  // nubes suaves
  for (let i = 0; i < 26; i++) {
    const x = R() * W; const y = hz * (0.35 + R() * 0.5); const r = 40 + R() * 120;
    const cg = g.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, 'rgba(255,255,255,0.35)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg; [x, x - W, x + W].forEach((xx) => { g.beginPath(); g.ellipse(xx, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2); g.fill(); });
  }
  if (id === 'playa') {
    // sol bajo al frente (centro del lienzo = frente)
    const sx = W / 2; const sy = hz - 60;
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
    sun.addColorStop(0, 'rgba(255,244,214,0.95)'); sun.addColorStop(0.12, 'rgba(255,226,180,0.7)'); sun.addColorStop(1, 'rgba(255,210,170,0)');
    g.fillStyle = sun; g.fillRect(sx - 260, sy - 260, 520, 520);
    // mar
    const sea = g.createLinearGradient(0, hz, 0, H * 0.78);
    sea.addColorStop(0, '#9fbfd4'); sea.addColorStop(1, '#5f8fae');
    g.fillStyle = sea; g.fillRect(0, hz, W, H * 0.78 - hz);
    for (let i = 0; i < 900; i++) { // brillos del sol en el agua
      const y = hz + Math.pow(R(), 1.6) * (H * 0.24); const spread = 60 + (y - hz) * 1.6;
      const x = W / 2 + (R() - 0.5) * spread * 2;
      g.fillStyle = `rgba(255,236,200,${0.25 + R() * 0.4})`; g.fillRect(x, y, 6 + R() * 18, 1.5);
    }
    // espuma y arena
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, H * 0.775, W, 6);
    const sand = g.createLinearGradient(0, H * 0.78, 0, H);
    sand.addColorStop(0, '#e9d6b8'); sand.addColorStop(1, '#cdb08a');
    g.fillStyle = sand; g.fillRect(0, H * 0.78, W, H * 0.22);
  } else {
    // cerros lejanos con bruma
    [[hz - 70, '#9fb9c4', 0.6], [hz - 30, '#86a98f', 0.8]].forEach(([base, col, a], k) => {
      g.fillStyle = col; g.globalAlpha = a; g.beginPath(); g.moveTo(0, hz + 2);
      for (let x = 0; x <= W; x += 16) { const t = x / W * Math.PI * 2; g.lineTo(x, base - 40 * Math.sin(t * (3 + k) + k) - 24 * Math.sin(t * 7 + 2 * k)); }
      g.lineTo(W, hz + 2); g.closePath(); g.fill(); g.globalAlpha = 1;
    });
    const ground = g.createLinearGradient(0, hz, 0, H);
    const gc = id === 'bosque' ? ['#6f8f66', '#4f6e4a'] : ['#93b57c', '#6f9a5e'];
    ground.addColorStop(0, gc[0]); ground.addColorStop(1, gc[1]);
    g.fillStyle = ground; g.fillRect(0, hz, W, H - hz);
    if (id === 'cascada') {
      // río que viene desde el frente
      g.fillStyle = '#8fb8cc';
      g.beginPath(); g.moveTo(W / 2 - 30, hz); g.lineTo(W / 2 + 30, hz); g.lineTo(W / 2 + 420, H); g.lineTo(W / 2 - 420, H); g.closePath(); g.fill();
      for (let i = 0; i < 500; i++) { const y = hz + R() * (H - hz); const half = 30 + (y - hz) / (H - hz) * 390; g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.35})`; g.fillRect(W / 2 + (R() - 0.5) * half * 2, y, 10 + R() * 30, 2); }
      // cascada en el cerro
      const fx = W / 2; g.fillStyle = 'rgba(240,248,252,0.85)'; g.fillRect(fx - 26, hz - 150, 52, 150);
    }
    if (id === 'bosque' || id === 'cascada') {
      for (let i = 0; i < 160; i++) { // árboles alrededor
        const x = R() * W; const h = 26 + R() * 70; const y = hz + 4 + R() * 14; // árboles lejanos, bajos en el horizonte
        if (id === 'cascada' && Math.abs(x - W / 2) < 200) continue;
        g.fillStyle = ['#4d6b4a', '#5c7d55', '#426040'][Math.floor(R() * 3)];
        g.beginPath(); g.ellipse(x, y - h * 0.6, h * 0.28, h * 0.6, 0, 0, Math.PI * 2); g.fill();
      }
    }
    if (id === 'pradera') {
      for (let i = 0; i < 2500; i++) { // flores
        const y = hz + Math.pow(R(), 0.7) * (H - hz); const s = 1 + (y - hz) / (H - hz) * 5;
        g.fillStyle = ['#f6e7ef', '#f2c6d6', '#fff3c4', '#d9cdf2'][Math.floor(R() * 4)]; g.globalAlpha = 0.8;
        g.beginPath(); g.arc(R() * W, y, s, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
  }
  return c;
}


// Agua: degradado radial (claro hacia el horizonte), reflejo suave al frente y borde que se funde con el cielo
function waterCanvas(look) {
  const c = makeCanvas(1024, 1024); if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(7);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  const grd = g.createRadialGradient(512, 512, 0, 512, 512, 512);
  grd.addColorStop(0, hex(look.water)); grd.addColorStop(0.75, hex(look.water)); grd.addColorStop(0.97, hex(look.waterHi)); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 1024);
  // ondas suaves (anillos y trazos claros), más finas a lo lejos
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 1600; i++) {
    const a = R() * Math.PI * 2; const r = 40 + Math.sqrt(R()) * 460;
    const len = 6 + (r / 512) * 26; const x = 512 + Math.cos(a) * r; const y = 512 + Math.sin(a) * r;
    g.strokeStyle = `rgba(255,255,255,${0.03 + R() * 0.06})`; g.lineWidth = 1 + R() * 1.5;
    g.beginPath(); g.moveTo(x - Math.sin(a) * len, y + Math.cos(a) * len); g.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); g.stroke();
  }
  // reflejo de luz hacia el frente (el frente es -z: hacia arriba del lienzo)
  const ref = g.createLinearGradient(512, 512, 512, 0);
  ref.addColorStop(0, 'rgba(255,240,220,0)'); ref.addColorStop(1, 'rgba(255,240,220,0.09)');
  g.fillStyle = ref; g.beginPath(); g.moveTo(492, 512); g.lineTo(532, 512); g.lineTo(600, 0); g.lineTo(424, 0); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  return c;
}

// Islas lejanas: siluetas bajas repartidas por el horizonte (dejan libre el frente, donde está la guía)
function islandsGeometry(T, radius, seed) {
  const R = rng(seed);
  const pos = []; const idx = [];
  const segs = 220; let v = 0;
  const ph = [R() * 6.28, R() * 6.28, R() * 6.28];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const front = Math.cos(a); // 1 = frente
    const n = 0.5 * Math.sin(a * 3 + ph[0]) + 0.3 * Math.sin(a * 7 + ph[1]) + 0.2 * Math.sin(a * 17 + ph[2]);
    let h = Math.max(0, n - 0.15) * 9;
    if (front > 0.9) h *= Math.max(0, (1 - front) / 0.1); // frente despejado
    const x = Math.sin(a) * radius; const z = -Math.cos(a) * radius;
    pos.push(x, -0.3, z, x, h, z);
    if (i < segs) idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 2;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function petalShape(T, len, wid) {
  const sh = new T.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(wid, len * 0.25, wid * 0.8, len * 0.8, 0, len);
  sh.bezierCurveTo(-wid * 0.8, len * 0.8, -wid, len * 0.25, 0, 0);
  return sh;
}

function roundRectShape(T, w, h, r) {
  const sh = new T.Shape(); const x = -w / 2; const y = -h / 2;
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
  sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
  sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  return sh;
}

/* ---------- Sonido del lugar (Web Audio, sin graves sostenidos bajo 200 Hz) ---------- */
function noiseBuffer(c, secs = 6) {
  const len = Math.floor(c.sampleRate * secs);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
  return b;
}

export class PlaceSound {
  constructor(getCtx) { this.getCtx = getCtx; this.on = false; }
  start(kind) { try { this._start(kind); } catch (e) { this.on = false; } }
  _start(kind) {
    const c = this.getCtx && this.getCtx();
    if (!c || this.on) return;
    this.on = true; this.c = c; this.kind = kind;
    const t = c.currentTime;
    this.master = c.createGain(); this.master.gain.setValueAtTime(0.0001, t); this.master.gain.exponentialRampToValueAtTime(1, t + 5);
    this.master.connect(c.destination);
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c); src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    const g = c.createGain();
    const lfo = c.createOscillator(); const lg = c.createGain();
    if (kind === 'olas') { lp.frequency.value = 1100; g.gain.value = 0.09; lfo.frequency.value = 1 / 10; lg.gain.value = 0.07; } // olas cada ~10 s
    else if (kind === 'agua') { lp.frequency.value = 2600; g.gain.value = 0.07; lfo.frequency.value = 0.13; lg.gain.value = 0.012; } // río constante
    else if (kind === 'noche') { lp.frequency.value = 900; g.gain.value = 0.03; lfo.frequency.value = 0.05; lg.gain.value = 0.015; } // brisa nocturna suave
    else { lp.frequency.value = 1300; g.gain.value = 0.045; lfo.frequency.value = 0.06; lg.gain.value = 0.025; } // brisa
    lfo.connect(lg).connect(g.gain);
    src.connect(hp).connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start();
    this.nodes = [src, lfo];
    if (kind === 'pradera' || kind === 'bosque') {
      const tick = () => {
        if (!this.on) return;
        try { this.chirp(); } catch (e) { /* ok */ }
        this.timer = setTimeout(tick, (kind === 'bosque' ? 5000 : 8000) + Math.random() * 9000);
      };
      this.timer = setTimeout(tick, 3000);
    }
    if (kind === 'noche') {
      const tick = () => {
        if (!this.on) return;
        try { this.cricket(); } catch (e) { /* ok */ }
        this.timer = setTimeout(tick, 900 + Math.random() * 1400);
      };
      this.timer = setTimeout(tick, 2000);
    }
  }
  // Grillo lejano: 3–4 pulsos cortos y agudos, muy bajito
  cricket() {
    const c = this.c; const t = c.currentTime + 0.03; const f = 4300 + Math.random() * 500;
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); const g = c.createGain(); const ti = t + i * 0.055;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ti); g.gain.exponentialRampToValueAtTime(0.004, ti + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.035);
      o.connect(g).connect(this.master); o.start(ti); o.stop(ti + 0.05);
    }
  }
  chirp() {
    const c = this.c; const t = c.currentTime + 0.05;
    const n = 2 + Math.floor(Math.random() * 3); const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); const g = c.createGain(); const ti = t + i * (0.11 + Math.random() * 0.05);
      o.frequency.setValueAtTime(base, ti); o.frequency.exponentialRampToValueAtTime(base * 1.3, ti + 0.07);
      g.gain.setValueAtTime(0.0001, ti); g.gain.exponentialRampToValueAtTime(0.01, ti + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.09);
      o.connect(g).connect(this.master); o.start(ti); o.stop(ti + 0.12);
    }
  }
  stop() {
    if (!this.on) return;
    this.on = false; clearTimeout(this.timer);
    try { const t = this.c.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(0.0001, t, 0.8); this.nodes.forEach((n) => n.stop(t + 4)); } catch (e) { /* ok */ }
  }
}

/* ---------- Escena ---------- */
export class LandscapeScene {
  // host: { audioCtx(), soundOn(), onPhase(name), onCycle(n), onWord(name) }
  constructor(T, parent, host = {}) {
    this.T = T; this.host = host;
    this.group = new T.Group(); this.group.visible = false;
    parent.add(this.group);
    this.amount = 0; this.active = false; this.done = false;
    this.sound = new PlaceSound(host.audioCtx);
    this.textures = {};
    this.build();
  }

  build() {
    const T = this.T;
    // Esfera del paisaje (vista desde adentro). Radio grande: se ve "en el infinito" y sin distorsión al mover la cabeza.
    const geo = new T.SphereGeometry(60, 64, 32);
    geo.scale(-1, 1, 1);
    this.domeMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.dome = new T.Mesh(geo, this.domeMat);
    this.dome.renderOrder = -5;
    this.group.add(this.dome);
    // Luz guía: un brillo suave y un anillo fino, frente al paciente, un poco bajo la línea de los ojos
    this.guideGroup = new T.Group();
    this.group.add(this.guideGroup);
    const glow = makeCanvas(128, 128);
    if (glow) {
      const g = glow.getContext('2d'); const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.3, 'rgba(255,250,235,0.55)'); grd.addColorStop(1, 'rgba(255,245,225,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    }
    this.glowMat = new T.SpriteMaterial({ map: glow ? new T.CanvasTexture(glow) : null, color: 0xffd88a, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.glow = new T.Sprite(this.glowMat);
    this.guideGroup.add(this.glow);
    this.ringMat = new T.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.ring = new T.Mesh(new T.RingGeometry(0.29, 0.3, 96), this.ringMat);
    this.guideGroup.add(this.ring);
    // --- Barra de respiración: se llena al inhalar y se vacía (y apaga) al exhalar ---
    this.bar = new T.Group();
    const BW = 0.2; const BH = 0.8;
    const frameSh = roundRectShape(T, BW + 0.03, BH + 0.03, 0.115);
    frameSh.holes.push(roundRectShape(T, BW, BH, 0.1));
    this.barFrameMat = new T.MeshBasicMaterial({ color: 0xfff3dc, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.bar.add(new T.Mesh(new T.ShapeGeometry(frameSh, 24), this.barFrameMat));
    this.barBackMat = new T.MeshBasicMaterial({ color: 0x1b2440, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const back = new T.Mesh(new T.ShapeGeometry(roundRectShape(T, BW, BH, 0.1), 24), this.barBackMat);
    back.position.z = -0.002; this.bar.add(back);
    // relleno: degradado de turquesa (abajo) a dorado (arriba); crece desde abajo
    const fillGeo = new T.PlaneGeometry(BW - 0.04, 1, 1, 8);
    fillGeo.translate(0, 0.5, 0);
    const cols = []; const pa = fillGeo.attributes.position;
    const lo = new T.Color(0x5fd0c8); const hi = new T.Color(0xffd27a);
    for (let i = 0; i < pa.count; i++) { const c = lo.clone().lerp(hi, pa.getY(i)); cols.push(c.r, c.g, c.b); }
    fillGeo.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
    this.barFillMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.barFill = new T.Mesh(fillGeo, this.barFillMat);
    this.barFill.position.set(0, -BH / 2 + 0.03, 0.002);
    this.barFillMax = BH - 0.06;
    this.bar.add(this.barFill);
    this.barTipMat = new T.SpriteMaterial({ map: this.glowMat.map, color: 0xffe9b0, transparent: true, depthWrite: false, fog: false, opacity: 0, blending: T.AdditiveBlending });
    this.barTip = new T.Sprite(this.barTipMat); this.barTip.scale.setScalar(0.3);
    this.bar.add(this.barTip);
    this.guideGroup.add(this.bar);

    // --- Flor de luz: se abre al inhalar y se cierra al exhalar ---
    this.flower = new T.Group();
    this.petals = [];
    this.petalMat = new T.MeshBasicMaterial({ color: 0xffc6d9, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, fog: false });
    this.petalMat2 = new T.MeshBasicMaterial({ color: 0xfff0f5, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false, fog: false });
    [[8, 0.26, 0.085, this.petalMat, 0], [6, 0.17, 0.065, this.petalMat2, Math.PI / 6]].forEach(([n, len, wid, mat, off], layer) => {
      const geo = new T.ShapeGeometry(petalShape(T, len, wid), 12);
      for (let i = 0; i < n; i++) {
        const spin = new T.Group(); spin.rotation.z = off + (i / n) * Math.PI * 2;
        const hinge = new T.Group(); spin.add(hinge);
        const m = new T.Mesh(geo, mat); m.position.z = 0.001 * layer; hinge.add(m);
        this.flower.add(spin); this.petals.push({ hinge, layer });
      }
    });
    this.flowerCoreMat = new T.SpriteMaterial({ map: this.glowMat.map, color: 0xffe2a0, transparent: true, depthWrite: false, fog: false, opacity: 0, blending: T.AdditiveBlending });
    this.flowerCore = new T.Sprite(this.flowerCoreMat);
    this.flower.add(this.flowerCore);
    this.flower.scale.setScalar(1.5);
    this.guideGroup.add(this.flower);

    // --- Farolillos: cada respiración completa suelta uno que sube despacio al cielo ---
    this.lanterns = [];
    this.lanternMat = new T.SpriteMaterial({ map: this.glowMat.map, color: 0xffc47a, transparent: true, depthWrite: false, fog: false, blending: T.AdditiveBlending });

    // --- Agua, islas y estrellas (escenario de los cielos) ---
    this.scenery = new T.Group();
    this.group.add(this.scenery);

    // Palabra (y cuenta) bajo la luz
    this.wordCanvas = makeCanvas(512, 160);
    this.wordTex = this.wordCanvas ? new T.CanvasTexture(this.wordCanvas) : null;
    if (this.wordTex && T.SRGBColorSpace) this.wordTex.colorSpace = T.SRGBColorSpace;
    this.wordMat = new T.MeshBasicMaterial({ map: this.wordTex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.word = new T.Mesh(new T.PlaneGeometry(0.78, 0.244), this.wordMat);
    this.word.position.y = 0.5; // sobre la luz: no choca con el botón de pausa, que está más abajo
    this.guideGroup.add(this.word);
    this.lastText = '';
  }

  configure(cfg, eyeH) {
    this.cfg = cfg || {};
    this.eyeH = eyeH || 1.15;
    const id = LANDSCAPES[this.cfg.breathLandscape] ? this.cfg.breathLandscape : DEFAULT_LANDSCAPE;
    this.id = id;
    this.dome.position.set(0, this.eyeH, 0);
    this.dome.rotation.y = (YAW[id] || 0) * Math.PI / 180;
    this.guideGroup.position.set(0, this.eyeH - 0.12, -2.2);
    this.plan = landscapePlan(this.cfg.breathGuidedMin, this.cfg.breathSettle !== 'off', this.cfg.breathPattern);
    this.visual = ['barra', 'flor', 'luz'].includes(this.cfg.breathVisual) ? this.cfg.breathVisual : 'barra';
    this.bar.visible = this.visual === 'barra';
    this.flower.visible = this.visual === 'flor';
    this.glow.visible = this.ring.visible = this.visual === 'luz';
    this.word.position.y = this.visual === 'barra' ? 0.56 : 0.5;
    this.buildScenery(id);
    this.setTexture(id);
  }

  buildScenery(id) {
    const T = this.T;
    while (this.scenery.children.length) this.scenery.remove(this.scenery.children[0]);
    this.sceneryMats = [];
    const look = LOOK[id];
    if (!look) return; // los paisajes pintados ya traen su suelo
    const add = (mesh, full) => { mesh.material.transparent = true; mesh.material.fog = false; mesh.material.opacity = 0; this.sceneryMats.push([mesh.material, full]); this.scenery.add(mesh); return mesh; };
    const wc = waterCanvas(look);
    const wt = wc ? new T.CanvasTexture(wc) : null;
    if (wt && T.SRGBColorSpace) wt.colorSpace = T.SRGBColorSpace;
    const water = add(new T.Mesh(new T.CircleGeometry(57, 96), new T.MeshBasicMaterial({ map: wt, color: wt ? 0xffffff : look.water, depthWrite: false })), 0.95);
    water.rotation.x = -Math.PI / 2; water.position.y = 0.02; water.renderOrder = -4;
    const isl = add(new T.Mesh(islandsGeometry(T, 46, id.length * 31), new T.MeshBasicMaterial({ color: look.island, side: T.DoubleSide, depthWrite: false })), 0.85);
    isl.renderOrder = -3;
    if (look.stars) {
      const R = rng(99); const n = 900; const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2; const el = Math.asin(0.12 + R() * 0.88); const r = 50; p[i * 3] = Math.cos(el) * Math.sin(a) * r; p[i * 3 + 1] = this.eyeH + Math.sin(el) * r; p[i * 3 + 2] = -Math.cos(el) * Math.cos(a) * r; }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(p, 3));
      add(new T.Points(geo, new T.PointsMaterial({ size: 0.16, map: this.glowMat.map, color: 0xf3f6ff, blending: T.AdditiveBlending, depthWrite: false })), 0.95);
    }
  }

  // Primero el paisaje pintado (inmediato); si la foto existe, la reemplaza al cargar.
  setTexture(id) {
    const T = this.T;
    if (!this.textures[id]) {
      const c = paintLandscape(id);
      const tex = c ? new T.CanvasTexture(c) : null;
      if (tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      this.textures[id] = tex;
      if (typeof document !== 'undefined' && T.TextureLoader) {
        try {
          new T.TextureLoader().load('paisajes/' + id + '.jpg', (photo) => {
            if (T.SRGBColorSpace) photo.colorSpace = T.SRGBColorSpace;
            this.textures[id] = photo;
            if (this.id === id) { this.domeMat.map = photo; this.domeMat.needsUpdate = true; }
          }, undefined, () => { /* sin foto: queda el paisaje pintado */ });
        } catch (e) { /* ok */ }
      }
    }
    this.domeMat.map = this.textures[id];
    this.domeMat.needsUpdate = true;
  }

  setVisible(v) { this.group.visible = !!v && this.amount > 0.001; this.wantVisible = !!v; }

  // k 0..1: el paisaje aparece y desaparece de a poco
  setAmount(k) {
    this.amount = k;
    this.domeMat.opacity = k;
    (this.sceneryMats || []).forEach(([m, full]) => { m.opacity = full * k; });
    this.group.visible = k > 0.001 && this.wantVisible !== false;
  }

  start() {
    this.active = true; this.done = false;
    this.elapsed = 0; this.cycles = 0; this.phase = ''; this.lastText = ''; this.guideK = 0;
    this.lanterns.forEach((l) => this.group.remove(l.s)); this.lanterns = [];
    if (this.host.soundOn && this.host.soundOn()) this.sound.start(LANDSCAPES[this.id].sound);
  }

  stop() {
    this.active = false;
    this.sound.stop();
  }

  totalSecs() { return this.plan ? this.plan.total : 0; }

  step(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    const ph = landscapePhaseAt(this.elapsed, this.plan);
    if (ph.name !== this.phase) {
      // Al terminar la respiración guiada, la última respiración también cuenta
      if (this.phase === 'guiada' && this.cycles < this.plan.cycles) { this.cycles = this.plan.cycles; this.host.onCycle && this.host.onCycle(this.cycles); }
      this.phase = ph.name;
      if (ph.name === 'fin') { this.done = true; this.active = false; this.sound.stop(); }
      this.host.onPhase && this.host.onPhase(ph.name);
    }
    // La guía se ve desde la llegada (más tenue, con la cuenta para empezar) y a pleno en la respiración guiada
    const want = ph.name === 'guiada' ? 1 : ph.name === 'llegada' ? 0.6 : 0;
    this.guideK += Math.sign(want - this.guideK) * Math.min(Math.abs(want - this.guideK), dt / 3);
    let size = 0.3;
    if (ph.name === 'llegada') {
      // Antes de empezar: "Respira normal" y los segundos que faltan; la guía respira muy suave por sí sola
      size = 0.15 + 0.1 * (0.5 - 0.5 * Math.cos(this.elapsed * 0.6));
      const left = Math.ceil(ph.left);
      const text = 'Comenzamos en ' + left;
      if (text !== this.lastText) { this.lastText = text; this.drawWord('Comenzamos en', left); }
      this.breathName = '';
    } else if (ph.name === 'guiada') {
      const b = breathAt(ph.t, this.cfg.breathPattern);
      size = b.size;
      if (b.cycle > this.cycles) { this.cycles = b.cycle; this.host.onCycle && this.host.onCycle(this.cycles); this.releaseLantern(); }
      this.breathName = b.name;
      const word = WORDS[b.name] || '';
      const count = this.cfg.breathCount === 'on' ? Math.max(1, Math.ceil(b.remaining - 1e-6)) : 0;
      const text = word + (count ? '  ' + count : '');
      if (word !== this.lastWord) { this.lastWord = word; this.host.onWord && this.host.onWord(b.name, this.cycles); }
      if (text !== this.lastText) { this.lastText = text; this.drawWord(word, count); }
    }
    const k = this.guideK;
    this.drawBar(k, size, dt);
    this.drawFlower(k, size);
    this.stepLanterns(dt);
    this.glow.scale.setScalar(0.35 + 0.55 * size);
    this.glowMat.opacity = k * (0.35 + 0.4 * size);
    this.ring.scale.setScalar(0.75 + 0.5 * size);
    this.ringMat.opacity = k * 0.55; // visible también sobre cielos claros
    this.wordMat.opacity = Math.min(1, k * 1.5) * 0.95;
  }

  drawBar(k, size, dt) {
    if (!this.bar.visible) return;
    const hold = this.breathName === 'hold' || this.breathName === 'holdOut';
    this.pulse = (this.pulse || 0) + dt;
    const h = Math.max(0.001, this.barFillMax * size);
    this.barFill.scale.y = h;
    this.barFillMat.opacity = k * (0.45 + 0.55 * size); // al exhalar se vacía y se apaga
    this.barFrameMat.opacity = k * 0.9;
    this.barBackMat.opacity = k * 0.35;
    this.barTip.position.set(0, this.barFill.position.y + h, 0.004);
    this.barTip.scale.setScalar((0.2 + 0.18 * size) * (hold ? 1 + 0.12 * Math.sin(this.pulse * 5) : 1));
    this.barTipMat.opacity = k * (0.3 + 0.6 * size);
  }

  drawFlower(k, size) {
    if (!this.flower.visible) return;
    // cerrada = pétalos doblados hacia el paciente (capullo); abierta = estrella de pétalos
    this.petals.forEach((p) => { p.hinge.rotation.x = -(1 - size) * (p.layer ? 1.35 : 1.2) - 0.08; });
    this.flower.rotation.z += 0.0008;
    this.petalMat.opacity = k * (0.55 + 0.35 * size);
    this.petalMat2.opacity = k * (0.6 + 0.35 * size);
    this.flowerCore.scale.setScalar(0.08 + 0.2 * size);
    this.flowerCoreMat.opacity = k * (0.4 + 0.6 * size);
  }

  // Un farolillo por respiración completa: sube despacio y se aleja (técnico: ~0,1 m/s, sin acercarse a la cara)
  releaseLantern() {
    if (this.visual === 'luz') return;
    const T = this.T;
    if (this.lanterns.length >= 14) { const old = this.lanterns.shift(); this.group.remove(old.s); }
    const s = new T.Sprite(this.lanternMat.clone());
    s.scale.setScalar(0.12);
    const gp = this.guideGroup.position;
    s.position.set(gp.x + (Math.random() - 0.5) * 0.3, gp.y + 0.1, gp.z);
    this.group.add(s);
    this.lanterns.push({ s, t: 0, vx: (Math.random() - 0.5) * 0.06, ph: Math.random() * 6 });
  }

  stepLanterns(dt) {
    for (let i = this.lanterns.length - 1; i >= 0; i--) {
      const l = this.lanterns[i]; l.t += dt;
      l.s.position.x += (l.vx + 0.02 * Math.sin(l.t * 0.7 + l.ph)) * dt;
      l.s.position.y += 0.1 * dt;
      l.s.position.z -= 0.12 * dt;
      const life = 90; // se ven subir y quedarse un rato en el cielo, como progreso
      l.s.material.opacity = Math.min(1, l.t / 1.5) * Math.min(1, (life - l.t) / 8) * (0.75 + 0.25 * Math.sin(l.t * 3 + l.ph)) * this.amount;
      if (l.t > life) { this.group.remove(l.s); this.lanterns.splice(i, 1); }
    }
  }

  drawWord(word, count) {
    const c = this.wordCanvas; const g = c && c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(40,40,60,0.55)'; g.shadowBlur = 14;
    g.fillStyle = '#fffaf0';
    g.font = '600 64px ' + FONT;
    let ww = g.measureText(word).width;
    if (ww > c.width - 150) { g.font = '600 52px ' + FONT; ww = g.measureText(word).width; }
    const cx = c.width / 2 - (count ? 34 : 0);
    // fondo suave detrás del texto: se lee igual sobre cielos claros u oscuros
    g.shadowBlur = 0; g.fillStyle = 'rgba(25,30,55,0.45)';
    const bw = ww + (count ? 130 : 60); const bx = c.width / 2 - bw / 2;
    g.beginPath(); g.moveTo(bx + 40, 30); g.arcTo(bx + bw, 30, bx + bw, 130, 40); g.arcTo(bx + bw, 130, bx, 130, 40); g.arcTo(bx, 130, bx, 30, 40); g.arcTo(bx, 30, bx + bw, 30, 40); g.closePath(); g.fill();
    g.shadowColor = 'rgba(40,40,60,0.55)'; g.shadowBlur = 10; g.fillStyle = '#fffaf0';
    g.fillText(word, cx, c.height / 2);
    if (count) { g.font = '500 54px ' + FONT; g.globalAlpha = 0.8; g.fillText(String(count), cx + ww / 2 + 44, c.height / 2 + 2); g.globalAlpha = 1; }
    this.wordTex.needsUpdate = true;
  }
}
