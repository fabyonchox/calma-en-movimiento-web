// Música y ambiente sonoro generados por el juego (sin archivos: funcionan sin internet).
// Criterio: nada de tonos graves sostenidos (se sienten como un motor o un zumbido y ponen en alerta).
// Todo es suave, en registro medio-alto, con notas que nacen y se apagan despacio.

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66]; // Do mayor pentatónica (Do5 a Re6)

function now(c) { return c.currentTime; }

// Ruido rosado suave (brisa, agua)
function noiseBuffer(c, secs = 4) {
  const len = Math.floor(c.sampleRate * secs);
  const b = c.createBuffer(1, len, c.sampleRate);
  const d = b.getChannelData(0);
  let b0 = 0; let b1 = 0; let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  return b;
}

// Nota pulsada suave (kalimba / arpa): un tono con un armónico, ataque corto y caída larga
function pluck(c, dest, f, t, vol = 0.05, len = 2.6) {
  [[1, vol], [2.01, vol * 0.28], [3.98, vol * 0.08]].forEach(([m, v]) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len / m);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + len + 0.1);
  });
}

// Pajarito lejano (para el ambiente del jardín)
function distantChirp(c, dest, t) {
  const n = 2 + Math.floor(Math.random() * 3);
  const base = 2800 + Math.random() * 1200;
  for (let i = 0; i < n; i++) {
    const o = c.createOscillator(); o.type = 'sine';
    const g = c.createGain();
    const ti = t + i * (0.11 + Math.random() * 0.05);
    o.frequency.setValueAtTime(base, ti);
    o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.2), ti + 0.07);
    g.gain.setValueAtTime(0.0001, ti);
    g.gain.exponentialRampToValueAtTime(0.012, ti + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.09);
    o.connect(g).connect(dest);
    o.start(ti); o.stop(ti + 0.12);
  }
}

/* ================= Ambiente del jardín: brisa + pajaritos lejanos ================= */

export class NatureAmbience {
  constructor(getCtx, spatial) { this.getCtx = getCtx; this.spatial = spatial || null; this.on = false; }

  start() {
    try { this._start(); } catch (e) { this.on = false; /* el audio nunca debe detener el juego */ }
  }

  _start() {
    const c = this.getCtx && this.getCtx();
    if (!c || this.on) return;
    this.on = true; this.c = c;
    this.master = c.createGain();
    this.master.gain.setValueAtTime(0.0001, now(c));
    this.master.gain.exponentialRampToValueAtTime(1, now(c) + 3);
    this.master.connect(c.destination);
    // Brisa: ruido rosado filtrado (sin graves), que sube y baja muy lento
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 6); src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = c.createGain(); g.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg).connect(g.gain);
    src.connect(hp).connect(lp).connect(g).connect(this.master);
    src.start(); lfo.start();
    this.nodes = [src, lfo];
    // Pajaritos lejanos cada tanto
    const tick = () => {
      if (!this.on) return;
      // Con audio 3D, cada pajarito canta desde un lugar distinto del jardín (alrededor, entre las copas); si no, suena de frente.
      let dest = this.master;
      if (this.spatial && this.spatial.on()) {
        const az = Math.random() * Math.PI * 2; const r = 5 + Math.random() * 5;
        const pn = this.spatial.panner(this.c, { x: Math.sin(az) * r, y: 2.5 + Math.random() * 3, z: -Math.cos(az) * r }, { ref: 2, rolloff: 0.5 });
        pn.connect(this.master);
        dest = pn;
      }
      distantChirp(this.c, dest, now(this.c) + 0.05);
      this.timer = setTimeout(tick, 6000 + Math.random() * 9000);
    };
    this.timer = setTimeout(tick, 2500);
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    clearTimeout(this.timer);
    try {
      const t = now(this.c);
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.6);
      this.nodes.forEach((n) => n.stop(t + 3));
    } catch (e) { /* ya detenido */ }
  }
}

/* ================= Música de Respira: acordes suaves + melodía tipo kalimba ================= */

export class RelaxMusic {
  constructor(getCtx) { this.getCtx = getCtx; this.on = false; this.timer = null; this.size = 0.4; }

  start() {
    try { this._start(); } catch (e) { this.on = false; /* el audio nunca debe detener el juego */ }
  }

  _start() {
    const c = this.getCtx && this.getCtx();
    if (!c || this.on) return;
    this.on = true; this.c = c;
    this.master = c.createGain();
    this.master.gain.setValueAtTime(0.0001, now(c));
    this.master.gain.exponentialRampToValueAtTime(0.9, now(c) + 4);
    this.master.connect(c.destination);
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1600;
    // Eco suave (da sensación de espacio abierto)
    this.delay = c.createDelay(1.5); this.delay.delayTime.value = 0.42;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const wet = c.createGain(); wet.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);
    this.filter.connect(this.master);
    // Acordes en registro medio (sin graves): Do mayor 9 → La menor 7 → Fa mayor 9 → Sol suspendido
    this.chords = [[261.63, 329.63, 392.0, 587.33], [220.0, 261.63, 329.63, 392.0], [261.63, 349.23, 440.0, 523.25], [293.66, 392.0, 440.0, 587.33]];
    this.ci = 0;
    this.mi = 2;
    this.playChord();
    this.chordTimer = setInterval(() => this.playChord(), 10000);
    const melody = () => {
      if (!this.on) return;
      this.playNote();
      this.timer = setTimeout(melody, 1600 + Math.random() * 1600);
    };
    this.timer = setTimeout(melody, 2200);
  }

  playChord() {
    try { this._playChord(); } catch (e) { /* sin sonido, el juego sigue */ }
  }

  _playChord() {
    const c = this.c; if (!c || !this.on) return;
    const t = now(c);
    const notes = this.chords[this.ci++ % this.chords.length];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.004;
      const g = c.createGain();
      const v = 0.022 / (1 + i * 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 3.5);
      g.gain.setValueAtTime(v, t + 7.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 12.5);
      const g2 = c.createGain(); g2.gain.value = 0.35;
      o.connect(g); o2.connect(g2).connect(g); g.connect(this.filter);
      o.start(t); o2.start(t); o.stop(t + 13); o2.stop(t + 13);
    });
  }

  // Melodía: camina suavemente por la escala pentatónica (siempre armoniosa); más notas cuando la estrella está cerca
  playNote() {
    try { this._playNote(); } catch (e) { /* sin sonido, el juego sigue */ }
  }

  _playNote() {
    const c = this.c; if (!c) return;
    const step = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
    this.mi = Math.max(0, Math.min(PENTA.length - 1, this.mi + step));
    const t = now(c) + 0.02;
    const vol = 0.035 + 0.02 * this.size;
    pluck(c, this.filter, PENTA[this.mi], t, vol);
    pluck(c, this.delay, PENTA[this.mi], t, vol * 0.6);
    if (Math.random() < 0.25) pluck(c, this.filter, PENTA[Math.max(0, this.mi - 2)], t + 0.32, vol * 0.7);
  }

  // La música "respira" con la estrella: se abre un poco al inhalar
  breath(size) {
    this.size = size;
    if (!this.on || !this.filter) return;
    try { this.filter.frequency.setTargetAtTime(1300 + 1200 * size, now(this.c), 0.5); } catch (e) { /* ok */ }
  }

  stop() {
    clearInterval(this.chordTimer); clearTimeout(this.timer);
    this.chordTimer = null; this.timer = null;
    if (!this.on) return;
    this.on = false;
    try {
      const t = now(this.c);
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0.0001, t, 0.8);
    } catch (e) { /* ok */ }
  }
}
