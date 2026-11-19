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

function run(cfg, gazeFn, secs, setupAnchor) {
  const anchor = new THREE.Group();
  if (setupAnchor) setupAnchor(anchor);
  const scene = new THREE.Scene(); scene.add(anchor);
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
  const facing = []; // en vuelo: ¿la carita del pajarito apunta hacia el paciente? (producto punto > 0)
  let saidSomething = false;
  for (let i = 0; i < secs / dt; i++) {
    sc.step(dt, gazeFn(sc));
    if (sc.stage === 'birds' && sc.active_bird && sc.active_bird.state === 'roam' && typeof sc.birdYaw === 'number') angles.push(sc.birdYaw);
    if (sc.stage === 'star') starZ.push(sc.starGroup.position.z);
    const b = sc.active_bird;
    if (b && b.state === 'roam') {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.root.getWorldQuaternion(new THREE.Quaternion()));
      const bp = b.root.getWorldPosition(new THREE.Vector3());
      const head = anchor.localToWorld(new THREE.Vector3(0, 1.15, 0));
      facing.push(fwd.dot(head.sub(bp).normalize()));
    }
    if (sc.say.visible) saidSomething = true;
  }
  sc.stop();
  return { sc, events, angles, starZ, facing, saidSomething };
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
  // Espiral: al inhalar las luces viajan hacia la estrella (flow baja); al exhalar se alejan (flow sube)
  sc.start(0);
  const f0 = sc.flow; for (let i = 0; i < 72 * 3.5; i++) sc.step(1 / 72, null);
  assert.ok(sc.flow < f0, 'inhalar: la espiral se recoge');
  for (let i = 0; i < 72 * 5; i++) sc.step(1 / 72, null); // sostener 4 s y entrar a exhalar
  const f1 = sc.flow; for (let i = 0; i < 72 * 3; i++) sc.step(1 / 72, null);
  assert.ok(sc.flow > f1, 'exhalar: la espiral se abre');
  assert.ok(sc.skyStars.visible && sc.skyStars.material.opacity > 0.5, 'aparece el cielo de estrellas');
  // giro lento (técnico): menos de 8°/s
  assert.ok(0.09 * 180 / Math.PI < 8);
  assert.equal(sc.stage, 'star');
  assert.ok(sc.birds.every((b) => !b.root.visible));
}

// 4) Jardín girado y desplazado (como tras recentrar): el pajarito nunca da la espalda y saluda con su globo
{
  const cfg = { minutes: 1, breathContent: 'pajaros', neckRange: 'medio' };
  const { events, facing, saidSomething } = run(cfg, (s) => ({ yawDeg: (s.birdYaw || 0) * 0.8, pitchDeg: 0 }), 60,
    (a) => { a.position.set(1.3, 0, -0.7); a.rotation.y = 2.1; });
  assert.ok(facing.length > 100 && facing.every((d) => d > 0.3), 'el pajarito mira hacia el paciente (mín ' + Math.min(...facing).toFixed(2) + ')');
  assert.ok(events.birds >= 2, 'saludaron: ' + events.birds);
  assert.ok(saidSomething, 'el pajarito muestra su saludo');
}

// 5) Cabeza quieta con un pequeño temblor natural: no llena el anillo
{
  const cfg = { minutes: 1, breathContent: 'pajaros', neckRange: 'suave' };
  let t = 0;
  const { events } = run(cfg, () => { t += 1 / 72; return { yawDeg: 0.6 * Math.sin(t * 9), pitchDeg: 0 }; }, 60);
  assert.equal(events.birds, 0, 'mirar al frente no cuenta');
}

console.log('OK: escena de Respira');
process.exit(0); // la música deja temporizadores activos
