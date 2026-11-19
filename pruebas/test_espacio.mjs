// Viaje por el espacio (etapa de la estrella): node pruebas/test_espacio.mjs
import assert from 'node:assert/strict';
import * as THREE from '../libs/three.module.min.js';
import { SpaceScene } from '../espacio.js';

const parent = new THREE.Group();
const sp = new SpaceScene(THREE, parent);
assert.equal(sp.group.visible, false, 'empieza oculto');
sp.setAmount(0.5);
assert.ok(sp.group.visible && sp.mats.every(([m, full]) => Math.abs(m.opacity - full * 0.5) < 1e-9), 'aparece de a poco');
sp.setAmount(1);
// El polvo nunca pasa por la cara: túnel libre frente a la cabeza, y avanza lento
let maxStep = 0;
for (let i = 0; i < 72 * 120; i++) {
  const before = sp.dust.map((d) => d.z);
  sp.step(1 / 72, (i % 720) / 720);
  sp.dust.forEach((d, k) => {
    assert.ok(!(Math.abs(d.x) < 1.2 && d.y > 0.4 && d.y < 2.2), 'polvo en la cara');
    if (d.z > before[k]) maxStep = Math.max(maxStep, (d.z - before[k]) * 72);
  });
}
assert.ok(maxStep <= 0.3 + 1e-9, 'el polvo avanza lento: ' + maxStep.toFixed(2) + ' m/s');
// La galaxia gira lento (técnico: menos de 2°/s)
const r0 = sp.galaxy.rotation.z; sp.step(1, 0.5);
assert.ok((sp.galaxy.rotation.z - r0) * 180 / Math.PI < 2);
// Planetas lejos (nada grande cerca del paciente)
sp.planets.forEach((p) => assert.ok(p.pivot.position.length() > 15, 'planeta muy cerca'));
sp.setAmount(0);
assert.equal(sp.group.visible, false, 'se oculta al volver al jardín');
console.log('OK: viaje por el espacio');
