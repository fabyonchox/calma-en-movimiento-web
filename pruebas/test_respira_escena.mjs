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
  createDelay: () => node({ delayTime: param() }),
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
  const starZ = [];
  for (let i = 0; i < secs / dt; i++) {
    sc.step(dt, gazeFn(sc));
    if (sc.stage === 'birds' && sc.active_bird && sc.active_bird.state === 'roam' && typeof sc.birdYaw === 'number') angles.push(sc.birdYaw);
    if (sc.stage === 'star') starZ.push(sc.starGroup.position.z);
  }
  sc.stop();
  return { sc, events, angles, starZ };
}

// 1) Estrella y luego pajaritos, mirando siempre hacia la luz
{
  const cfg = { minutes: 3, breathContent: 'ambos', breathPattern: '4-6', neckRange: 'medio' };
  // El paciente sigue al pajarito con la mirada (con un pequeño retraso, como una persona real)
  const { sc, events, angles, starZ } = run(cfg, (s) => (s.stage === 'birds' ? { yawDeg: (s.birdYaw || 0) * 0.9, pitchDeg: 0 } : { yawDeg: 0, pitchDeg: 0 }), 180);
  assert.ok(Math.max(...starZ) - Math.min(...starZ) > 1.2, 'la estrella se acerca y se aleja (vuela)');
  assert.deepEqual(events.stages, ['star', 'birds']);
  assert.ok(events.cycles >= 10, 'respiraciones contadas: ' + events.cycles);
  assert.ok(events.birds >= 2, 'pajaritos que saludaron: ' + events.birds);
  assert.ok(events.words.slice(0, 2).join() === 'inhale,exhale', 'palabras: ' + events.words.slice(0, 4));
  assert.ok(angles.length > 100 && angles.every((a) => Math.abs(a) <= NECK_RANGES.medio.deg), 'ningún pajarito fuera del rango de giro');
  assert.ok(started > 0, 'la música sonó');
  assert.equal(sc.active, false);
}

// 2) Si el paciente no gira la cabeza (mira siempre al frente), ningún pajarito se detiene a saludar
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
process.exit(0); // la música deja temporizadores activos
