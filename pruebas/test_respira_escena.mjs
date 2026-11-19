// Escena de Respira con Three.js real (sin dibujar en pantalla): node pruebas/test_respira_escena.mjs
import assert from 'node:assert/strict';
import * as THREE from '../libs/three.module.min.js';
import { BreathScene } from '../respira.js';
import { NECK_RANGES, cycleSecs } from '../respira_logica.js';

// Audio falso y estricto (para la música)
let started = 0;
const param = () => ({ value: 0, setValueAtTime() { return this; }, exponentialRampToValueAtTime(v) { assert.ok(v > 0); return this; }, setTargetAtTime() { return this; }, cancelScheduledValues() { return this; } });
const node = (x = {}) => ({ connect(n) { return n; }, ...x });
const ctx = {
  currentTime: 0, destination: node(),
  createGain: () => node({ gain: param() }),
  createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
  createOscillator: () => node({ type: '', frequency: param(), start() { started++; }, stop() {} }),
};

function run(cfg, gazeFn, secs) {
  const anchor = new THREE.Group();
  const events = { cycles: 0, birds: 0, stages: [], words: [] };
  const sc = new BreathScene(THREE, anchor, {
    audioCtx: () => ctx, musicOn: () => true, sfx: { birdChirp() {} },
    onCycle: (n) => { events.cycles = n; }, onBird: (n) => { events.birds = n; },
    onStage: (s) => events.stages.push(s), onWord: (w) => events.words.push(w),
  });
  sc.configure(cfg, 1.15);
  sc.start(0);
  const dt = 1 / 72;
  const angles = [];
  for (let i = 0; i < secs / dt; i++) {
    if (sc.perch.visible) angles.push(sc.perchAngle);
    sc.step(dt, gazeFn(sc));
  }
  sc.stop();
  return { sc, events, angles };
}

// 1) Estrella y luego pajaritos, mirando siempre hacia la luz
{
  const cfg = { minutes: 3, breathContent: 'ambos', breathPattern: '4-6', neckRange: 'medio' };
  const { sc, events, angles } = run(cfg, (s) => (s.stage === 'birds' ? { yawDeg: s.perchAngle, pitchDeg: 0 } : { yawDeg: 0, pitchDeg: 0 }), 180);
  assert.deepEqual(events.stages, ['star', 'birds']);
  assert.ok(events.cycles >= 10, 'respiraciones contadas: ' + events.cycles);
  assert.ok(events.birds >= 5, 'pajaritos que llegaron: ' + events.birds);
  assert.ok(events.words.slice(0, 2).join() === 'inhale,exhale', 'palabras: ' + events.words.slice(0, 4));
  assert.ok(angles.every((a) => Math.abs(a) <= NECK_RANGES.medio.deg), 'ningún pajarito fuera del rango de giro');
  assert.ok(started > 0, 'la música sonó');
  assert.equal(sc.active, false);
}

// 2) Si el paciente no mira la luz, no llega ningún pajarito (y no pasa nada malo)
{
  const cfg = { minutes: 1, breathContent: 'pajaros', neckRange: 'suave' };
  const { events } = run(cfg, () => ({ yawDeg: 0, pitchDeg: 0 }), 60);
  assert.equal(events.birds, 0);
}

// 3) Solo estrella: no aparecen pajaritos y la estrella crece/achica
{
  const cfg = { minutes: 1, breathContent: 'estrella', breathPattern: 'caja' };
  const anchor = new THREE.Group();
  const sc = new BreathScene(THREE, anchor, { audioCtx: () => null, musicOn: () => false });
  sc.configure(cfg, 1.15); sc.start(0);
  const sizes = [];
  for (let i = 0; i < 72 * cycleSecs('caja'); i++) { sc.step(1 / 72, null); sizes.push(sc.star.scale.x); }
  assert.ok(Math.max(...sizes) - Math.min(...sizes) > 0.3, 'la estrella cambia de tamaño');
  assert.equal(sc.stage, 'star');
  assert.ok(sc.birds.every((b) => !b.root.visible));
}

console.log('OK: escena de Respira');
