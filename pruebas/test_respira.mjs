// Pruebas del modo "Respira" (sin visor): node pruebas/test_respira.mjs
import assert from 'node:assert/strict';
import {
  BREATH_PATTERNS, breathAt, cycleSecs, plan, perchAngles, NECK_RANGES, looking, birdPath, starPose, STAR_NEAR, STAR_FAR, followCredit, BIRD_GREETINGS,
} from '../respira_logica.js';

// 1) Cada patrón: tramos en orden, tamaño de la estrella sube al inhalar y baja al exhalar
for (const [key, p] of Object.entries(BREATH_PATTERNS)) {
  const total = cycleSecs(key);
  assert.equal(total, p.steps.reduce((a, s) => a + s.secs, 0));
  let t = 0;
  for (const s of p.steps) {
    const mid = breathAt(t + s.secs / 2, key);
    assert.equal(mid.name, s.name, `${key}: a mitad del tramo debe ser ${s.name}`);
    t += s.secs;
  }
  const a = breathAt(0.5, key); const b = breathAt(3.5, key);
  assert.ok(b.size > a.size, `${key}: la estrella crece al inhalar`);
  assert.equal(breathAt(total + 0.1, key).cycle, 1, `${key}: cuenta los ciclos`);
  // tamaño siempre entre 0 y 1
  for (let x = 0; x < total * 2; x += 0.13) {
    const s = breathAt(x, key).size;
    assert.ok(s >= 0 && s <= 1, 'tamaño fuera de rango');
  }
}
// Exhalación: la estrella se achica
{
  const e1 = breathAt(4.5, '4-6'); const e2 = breathAt(9.5, '4-6');
  assert.equal(e1.name, 'exhale'); assert.ok(e2.size < e1.size);
}
// Patrón desconocido: usa el predeterminado
assert.equal(breathAt(1, 'no-existe').name, 'inhale');

// 2) Reparto de la sesión
{
  const p = plan(180, 'ambos', '4-6');
  assert.equal(p.star + p.birds, 180);
  assert.equal(p.star % 10, 0, 'la estrella dura ciclos completos');
  assert.ok(p.star > 0 && p.birds > 0);
  assert.deepEqual(plan(120, 'estrella', '4-6'), { star: 120, birds: 0 });
  assert.deepEqual(plan(120, 'pajaros', '4-6'), { star: 0, birds: 120 });
}

// 3) Seguridad: los pajaritos nunca piden girar la cabeza más allá del rango elegido
for (const [key, r] of Object.entries(NECK_RANGES)) {
  for (let trial = 0; trial < 50; trial++) {
    const angs = perchAngles(key, 12);
    angs.forEach((a) => assert.ok(Math.abs(a) <= r.deg + 1e-9, `${key}: ${a}° supera ${r.deg}°`));
    // alternan de lado
    for (let i = 1; i < angs.length; i++) assert.ok(Math.sign(angs[i]) !== Math.sign(angs[i - 1]));
    // los primeros, más cerca del centro
    assert.ok(Math.abs(angs[0]) <= Math.max(r.deg * 0.45, 12) + 1e-9);
    // siempre hay que girar algo: ningún pajarito queda justo al frente
    angs.forEach((a) => assert.ok(Math.abs(a) >= 12 - 1e-9, 'pajarito demasiado al centro: ' + a));
  }
}
assert.ok(perchAngles('desconocido', 3).every((a) => Math.abs(a) <= 20), 'rango desconocido usa el suave');

// 4) Mirada
assert.equal(looking(18, 20), true);
assert.equal(looking(5, 20), false);

// 5) El pajarito en vuelo nunca sale del rango de giro elegido, y sí recorre de lado a lado
for (const [key, r] of Object.entries(NECK_RANGES)) {
  for (let idx = 0; idx < 6; idx++) {
    let mn = 0; let mx = 0;
    for (let t = 0; t < 30; t += 0.05) {
      const p = birdPath(t, key, idx);
      assert.ok(Math.abs(p.yawDeg) <= r.deg + 1e-9, `${key}: vuelo fuera del rango`);
      mn = Math.min(mn, p.yawDeg); mx = Math.max(mx, p.yawDeg);
    }
    assert.ok(mx > r.deg * 0.6 && mn < -r.deg * 0.6, 'el pajarito debe recorrer ambos lados');
  }
  // movimiento lento: no más de 20°/s
  for (let t = 0; t < 20; t += 0.05) {
    const v = Math.abs(birdPath(t + 0.05, key, 0).yawDeg - birdPath(t, key, 0).yawDeg) / 0.05;
    assert.ok(v <= 20, `${key}: el pajarito se mueve muy rápido (${v.toFixed(1)}°/s)`);
  }
}

// 6) La estrella se acerca al inhalar y se aleja al exhalar
{
  const lejos = starPose(0, 5); const cerca = starPose(1, 5);
  assert.ok(Math.abs(lejos.z) > Math.abs(cerca.z));
  assert.ok(Math.abs(cerca.z - -STAR_NEAR) < 1e-9 && Math.abs(lejos.z - -STAR_FAR) < 1e-9);
  for (let t = 0; t < 60; t += 0.1) for (const sz of [0, 0.5, 1]) {
    const p = starPose(sz, t);
    assert.ok(Math.abs(p.x) < 0.5 && p.y > -0.1 && p.y < 0.5, 'la estrella se mantiene frente al paciente');
  }
}

// 7) Seguir al pajarito: tolerante con el retraso, pero mirar fijo al frente no cuenta
{
  assert.equal(followCredit(10, 22, 12, 8).credit, true, 'sigue con retraso: cuenta');
  assert.equal(followCredit(0, 10, 9, 0).credit, false, 'cabeza quieta al frente: no cuenta');
  assert.equal(followCredit(0, 3, 2, 0.5).credit, false, 'pajarito pasando por el centro y cabeza quieta: no cuenta');
  assert.equal(followCredit(-2, 4, -6, 12).credit, true, 'acompañando el paso por el centro: cuenta');
  assert.equal(followCredit(30, -10, -12, 10).credit, false, 'mirando al otro lado: no cuenta');
  assert.ok(BIRD_GREETINGS.length >= 3 && BIRD_GREETINGS.every((t) => t.length <= 28), 'saludos cortos');
}

console.log('OK: pruebas de Respira');
