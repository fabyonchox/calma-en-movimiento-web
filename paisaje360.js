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

// Giro de cada foto para que lo más bonito quede al frente (grados; se ajusta al ver la foto en el Quest)
const YAW = { playa: 0, cascada: 0, pradera: 0, bosque: 0 };

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
    this.glowMat = new T.SpriteMaterial({ map: glow ? new T.CanvasTexture(glow) : null, color: 0xfff6e2, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.glow = new T.Sprite(this.glowMat);
    this.guideGroup.add(this.glow);
    this.ringMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.ring = new T.Mesh(new T.RingGeometry(0.29, 0.3, 96), this.ringMat);
    this.guideGroup.add(this.ring);
    // Palabra (y cuenta) bajo la luz
    this.wordCanvas = makeCanvas(512, 160);
    this.wordTex = this.wordCanvas ? new T.CanvasTexture(this.wordCanvas) : null;
    if (this.wordTex && T.SRGBColorSpace) this.wordTex.colorSpace = T.SRGBColorSpace;
    this.wordMat = new T.MeshBasicMaterial({ map: this.wordTex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
    this.word = new T.Mesh(new T.PlaneGeometry(0.62, 0.194), this.wordMat);
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
    this.setTexture(id);
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
    this.group.visible = k > 0.001 && this.wantVisible !== false;
  }

  start() {
    this.active = true; this.done = false;
    this.elapsed = 0; this.cycles = 0; this.phase = ''; this.lastText = ''; this.guideK = 0;
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
    // La luz guía solo durante la respiración guiada (aparece y se va en ~3 s)
    const want = ph.name === 'guiada' ? 1 : 0;
    this.guideK += Math.sign(want - this.guideK) * Math.min(Math.abs(want - this.guideK), dt / 3);
    let size = 0.3;
    if (ph.name === 'guiada') {
      const b = breathAt(ph.t, this.cfg.breathPattern);
      size = b.size;
      if (b.cycle > this.cycles) { this.cycles = b.cycle; this.host.onCycle && this.host.onCycle(this.cycles); }
      const word = WORDS[b.name] || '';
      const count = this.cfg.breathCount === 'on' ? Math.max(1, Math.ceil(b.remaining - 1e-6)) : 0;
      const text = word + (count ? '  ' + count : '');
      if (word !== this.lastWord) { this.lastWord = word; this.host.onWord && this.host.onWord(b.name, this.cycles); }
      if (text !== this.lastText) { this.lastText = text; this.drawWord(word, count); }
    }
    const k = this.guideK;
    this.glow.scale.setScalar(0.35 + 0.55 * size);
    this.glowMat.opacity = k * (0.35 + 0.4 * size);
    this.ring.scale.setScalar(0.75 + 0.5 * size);
    this.ringMat.opacity = k * 0.35;
    this.wordMat.opacity = k * 0.9;
  }

  drawWord(word, count) {
    const c = this.wordCanvas; const g = c && c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(40,40,60,0.55)'; g.shadowBlur = 14;
    g.fillStyle = '#fffaf0';
    g.font = '600 64px ' + FONT;
    g.fillText(word, c.width / 2 - (count ? 30 : 0), c.height / 2);
    if (count) { g.font = '500 54px ' + FONT; g.globalAlpha = 0.75; g.fillText(String(count), c.width / 2 + g.measureText(word).width / 2 + 40, c.height / 2 + 2); g.globalAlpha = 1; }
    this.wordTex.needsUpdate = true;
  }
}
