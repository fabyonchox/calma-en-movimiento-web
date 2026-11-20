// Zonas de trabajo por flexión de hombro: node pruebas/test_zonas.mjs
import assert from 'node:assert/strict';
import { pickTarget, moveWaypoint, targetBounds, zoneBand, armPoint, normalizeConfig, REACH_ZONES } from '../logic.js';

const dist = { minD: 0.4, maxD: 0.62 };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
for (const eyeH of [1.15, 1.6]) {
  const ctx = { eyeH, armL: 0.62, flexAng: 150 };
  const ys = {};
  for (const z of Object.keys(REACH_ZONES)) {
    const cfg = { reachZone: z, reachMax: 'off', eyeH, side: 'right', zoneCtx: ctx };
    const arr = [];
    for (let i = 0; i < 300; i++) {
      const t = pickTarget(cfg, dist);
      assert.ok(Math.hypot(t.pos.x, t.pos.z) <= dist.maxD + 1e-9, 'nunca más lejos que el alcance cómodo');
      assert.ok(t.pos.z < 0, 'al frente');
      assert.ok(t.pos.x >= -0.1 * 0.35 - 1e-9, 'lado derecho');
      arr.push(t.pos.y);
    }
    ys[z] = mean(arr);
  }
  assert.ok(ys.bajo < ys.noventa && ys.noventa < ys.sobre, 'bajo < a 90° < sobre');
  const shoulder = eyeH - 0.25;
  assert.ok(Math.abs(ys.noventa - shoulder) < 0.08, 'a 90° queda a la altura del hombro');
  assert.ok(ys.sobre > shoulder + 0.1 && ys.bajo < shoulder - 0.1);
}
// Nunca sobre el máximo medido; con «rango máximo», en los últimos 12°
{
  const ctx = { eyeH: 1.2, armL: 0.6, flexAng: 118 };
  assert.deepEqual(zoneBand({ reachZone: 'sobre', reachMax: 'off' }, ctx), [105, 118]);
  assert.deepEqual(zoneBand({ reachZone: 'sobre', reachMax: 'on' }, ctx), [106, 118]);
  const top = armPoint(118, ctx).y;
  for (let i = 0; i < 300; i++) {
    const t = pickTarget({ reachZone: 'sobre', reachMax: 'on', eyeH: 1.2, zoneCtx: ctx }, dist);
    assert.ok(t.deg >= 106 - 1e-9 && t.deg <= 118 + 1e-9 && t.pos.y <= top + 1e-9, 'en el límite, sin pasarse');
  }
  // sin medición de flexión, «rango máximo» usa la zona sobre 90° completa
  assert.deepEqual(zoneBand({ reachZone: 'sobre', reachMax: 'on' }, { eyeH: 1.2 }), REACH_ZONES.sobre.deg);
}
// Nivel 2: la manzana que se mueve se queda en las alturas de la zona
{
  const ctx = { eyeH: 1.2, armL: 0.6, flexAng: 150 };
  const cfg = { reachZone: 'sobre', eyeH: 1.2, side: 'both', zoneCtx: ctx };
  const b = targetBounds(cfg, dist);
  let p = pickTarget(cfg, dist).pos;
  for (let i = 0; i < 400; i++) { p = moveWaypoint(cfg, dist, p); assert.ok(p.y >= b.minH - 1e-9 && p.y <= b.maxH + 1e-9); }
}
// Mixta: igual que antes (alturas ergonómicas)
for (let i = 0; i < 200; i++) { const t = pickTarget({ eyeH: 1.2 }, dist); assert.ok(t.pos.y >= 0.98 - 1e-9 && t.pos.y <= 1.3 + 1e-9); }
assert.equal(normalizeConfig({}).reachZone, 'mixto');
assert.equal(normalizeConfig({ reachZone: 'sobre', reachMax: 'on' }).reachMax, 'on');
console.log('OK: zonas de trabajo');
