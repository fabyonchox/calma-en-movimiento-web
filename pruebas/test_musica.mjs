// Música y ambiente (con un sistema de audio falso y estricto): node pruebas/test_musica.mjs
import assert from 'node:assert/strict';
import { RelaxMusic, NatureAmbience } from '../musica.js';

const made = { osc: [], gains: 0 };
const param = () => ({
  value: 0,
  setValueAtTime(v, t) { assert.ok(Number.isFinite(v) && Number.isFinite(t)); return this; },
  exponentialRampToValueAtTime(v) { assert.ok(v > 0, 'rampa exponencial con valor <= 0'); return this; },
  setTargetAtTime() { return this; }, cancelScheduledValues() { return this; },
});
const node = (x = {}) => ({ connect(n) { assert.ok(n); return n; }, ...x });
const ctx = {
  currentTime: 1, sampleRate: 22050, destination: node(),
  createGain: () => { made.gains++; return node({ gain: param() }); },
  createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
  createDelay: () => node({ delayTime: param() }),
  createOscillator: () => { const o = node({ type: '', frequency: param(), start() {}, stop() {} }); made.osc.push(o); return o; },
  createBuffer: (ch, len, sr) => ({ sampleRate: sr, getChannelData: () => new Float32Array(len) }),
  createBufferSource: () => node({ buffer: null, loop: false, start() {}, stop() {} }),
};

// Respira: ninguna nota grave sostenida (el "zumbido" que se sentía como un motor)
const m = new RelaxMusic(() => ctx);
m.start();
assert.equal(m.on, true);
for (let i = 0; i < 12; i++) { m.playChord(); m.playNote(); m.breath(i % 2); }
const freqs = made.osc.map((o) => o.frequency.value).filter((f) => f > 0);
assert.ok(freqs.length > 20);
assert.ok(Math.min(...freqs) >= 200, 'nota demasiado grave: ' + Math.min(...freqs) + ' Hz');
m.stop();
assert.equal(m.on, false);

// Jardín: brisa y pajaritos, sin tonos graves
made.osc.length = 0;
const n = new NatureAmbience(() => ctx);
n.start();
assert.equal(n.on, true);
const lowTones = made.osc.filter((o) => o.frequency.value > 1 && o.frequency.value < 200);
assert.equal(lowTones.length, 0, 'el ambiente no debe tener tonos graves');
n.stop();
assert.equal(n.on, false);

// Sin audio o con un audio incompleto: no falla
new RelaxMusic(() => null).start();
const roto = { ...ctx, createDelay: undefined };
const m2 = new RelaxMusic(() => roto); m2.start(); assert.equal(m2.on, false);

console.log('OK: música y ambiente');
process.exit(0);
