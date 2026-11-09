// Sonidos de interacción generados en el momento (Web Audio). No usan archivos: funcionan sin internet.
// Cada sonido se ubica a la izquierda o a la derecha según dónde ocurre (paneo estéreo suave).

export class Sfx {
  // getCtx: () => AudioContext | null ; enabled: () => boolean (por ejemplo, false si la retroalimentación es "solo visual")
  constructor(getCtx, enabled) {
    this.getCtx = getCtx;
    this.enabled = enabled || (() => true);
    this.noiseBuf = null;
  }

  ctx() {
    const c = this.getCtx && this.getCtx();
    if (!c || !this.enabled()) return null;
    return c;
  }

  out(c, x) {
    const g = c.createGain();
    g.gain.value = 1;
    if (c.createStereoPanner && typeof x === 'number') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-0.8, Math.min(0.8, x / 0.7));
      g.connect(p).connect(c.destination);
    } else {
      g.connect(c.destination);
    }
    return g;
  }

  noise(c) {
    if (this.noiseBuf && this.noiseBuf.sampleRate === c.sampleRate) return this.noiseBuf;
    const len = Math.floor(c.sampleRate * 1.0);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    return b;
  }

  // Ráfaga de ruido filtrado (hojas, mimbre, roce de aire)
  burst(c, dest, { t = 0, dur = 0.15, type = 'bandpass', freq = 2000, q = 1, vol = 0.2, freqEnd = null }) {
    const s = c.createBufferSource();
    s.buffer = this.noise(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, c.currentTime + t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, c.currentTime + t + dur);
    f.Q.value = q;
    const g = c.createGain();
    const t0 = c.currentTime + t;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random() * 0.5);
    s.stop(t0 + dur + 0.02);
  }

  // Tono con caída (madera, metal, campanita)
  tone(c, dest, { t = 0, freq = 440, dur = 0.3, vol = 0.1, type = 'sine', freqEnd = null, attack = 0.004 }) {
    const o = c.createOscillator();
    o.type = type;
    const t0 = c.currentTime + t;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  safe(fn) {
    const c = this.ctx();
    if (!c) return;
    try { fn(c); } catch (e) { /* el audio nunca debe detener el juego */ }
  }

  /* ---------- Manzano ---------- */

  // Sacar la manzana del árbol: crujido de hojas + "toc" del tallo al cortarse
  appleSnap(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      this.burst(c, d, { dur: 0.22, type: 'highpass', freq: 2500, vol: 0.12 });
      this.burst(c, d, { t: 0.03, dur: 0.12, type: 'bandpass', freq: 5000, q: 0.8, vol: 0.08 });
      this.tone(c, d, { t: 0.02, freq: 900, freqEnd: 300, dur: 0.06, vol: 0.18, type: 'triangle' });
    });
  }

  // La manzana cae en el canasto: golpe suave sordo + roce de mimbre
  appleBasket(x, count = 0) {
    this.safe((c) => {
      const d = this.out(c, x);
      this.tone(c, d, { freq: 140, freqEnd: 60, dur: 0.18, vol: 0.32 });
      this.burst(c, d, { dur: 0.12, type: 'bandpass', freq: 1400, q: 1.5, vol: 0.12 });
      this.burst(c, d, { t: 0.05, dur: 0.1, type: 'bandpass', freq: 2600, q: 2, vol: 0.06 });
      // con más manzanas, se oye un poco más "lleno"
      if (count > 2) this.tone(c, d, { t: 0.04, freq: 220, freqEnd: 120, dur: 0.1, vol: 0.08 });
    });
  }

  /* ---------- Luces ---------- */

  // Tocar una luz: destello brillante, una pequeña cascada de campanitas que sube
  sparkle(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      const base = [1046.5, 1318.5, 1568, 2093][Math.floor(Math.random() * 4)];
      [1, 1.26, 1.5, 2].forEach((m, i) => {
        this.tone(c, d, { t: i * 0.045, freq: base * m, dur: 0.6 - i * 0.08, vol: 0.05, attack: 0.006 });
      });
      this.burst(c, d, { dur: 0.35, type: 'highpass', freq: 7000, vol: 0.05 });
    });
  }

  // Una luz aparece: brillo muy suave
  lightAppear(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      this.tone(c, d, { freq: 660, freqEnd: 990, dur: 0.5, vol: 0.025, attack: 0.15 });
    });
  }

  // La luz se apaga sin tocarla: suspiro suave descendente (sin sonido de "error")
  lightFade(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      this.tone(c, d, { freq: 520, freqEnd: 340, dur: 0.45, vol: 0.025, attack: 0.05 });
    });
  }

  /* ---------- Feria ---------- */

  // Tomar una pelota de la bandeja
  ballGrab(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      this.tone(c, d, { freq: 320, freqEnd: 200, dur: 0.07, vol: 0.12, type: 'triangle' });
      this.burst(c, d, { dur: 0.06, type: 'bandpass', freq: 1800, vol: 0.05 });
    });
  }

  // Lanzar: soplido de aire según la fuerza
  throwWhoosh(x, speed = 2) {
    this.safe((c) => {
      const d = this.out(c, x);
      const k = Math.min(1, speed / 5);
      this.burst(c, d, { dur: 0.25 + 0.1 * k, type: 'bandpass', freq: 600, freqEnd: 1800 + 1500 * k, q: 0.7, vol: 0.04 + 0.08 * k });
    });
  }

  // Pelota contra tarro: "clang" metálico de lata (parciales inarmónicos)
  canHit(x, strength = 1) {
    this.safe((c) => {
      const d = this.out(c, x);
      const v = 0.05 + 0.07 * Math.min(1, strength);
      [523, 1187, 1873, 2690].forEach((f, i) => {
        this.tone(c, d, { freq: f * (0.97 + Math.random() * 0.06), dur: 0.35 - i * 0.05, vol: v / (i + 1), type: i ? 'sine' : 'triangle' });
      });
      this.burst(c, d, { dur: 0.05, type: 'highpass', freq: 3000, vol: v });
    });
  }

  // Tarro que cae y golpea el mostrador o el suelo: tintineo corto
  canLand(x, onFloor = false) {
    this.safe((c) => {
      const d = this.out(c, x);
      const f = onFloor ? 380 : 620;
      this.tone(c, d, { freq: f, dur: 0.16, vol: 0.06, type: 'triangle' });
      this.tone(c, d, { t: 0.07, freq: f * 1.7, dur: 0.12, vol: 0.03 });
      this.burst(c, d, { dur: 0.06, type: 'bandpass', freq: onFloor ? 900 : 2200, vol: 0.06 });
    });
  }

  // Pelota que rebota en el suelo o en el mostrador
  ballBounce(x, speed = 1) {
    this.safe((c) => {
      const d = this.out(c, x);
      const v = Math.min(0.2, 0.04 + speed * 0.05);
      this.tone(c, d, { freq: 180, freqEnd: 90, dur: 0.08, vol: v });
    });
  }

  // Se rearman los tarros / se rellena la bandeja
  rearm(x) {
    this.safe((c) => {
      const d = this.out(c, x);
      [0, 0.09, 0.18].forEach((t, i) => this.tone(c, d, { t, freq: 700 + i * 120, dur: 0.1, vol: 0.035, type: 'triangle' }));
    });
  }

  /* ---------- Guía ---------- */

  // Pequeño sonido cuando el guía va a hablar (avisa al paciente que mire)
  guideChime() {
    this.safe((c) => {
      const d = this.out(c, -0.5);
      this.tone(c, d, { freq: 880, dur: 0.25, vol: 0.03 });
      this.tone(c, d, { t: 0.08, freq: 1320, dur: 0.3, vol: 0.025 });
    });
  }
}
