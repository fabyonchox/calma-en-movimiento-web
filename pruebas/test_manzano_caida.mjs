// Cosecha del Manzano, nivel 3: la manzana cae desde más arriba y a distintas profundidades. node pruebas/test_manzano_caida.mjs
import assert from 'node:assert/strict';
import { fallStart, targetBounds, FALL_DEPTHS, APPLE_ARCS, normalizeConfig } from '../logic.js';

for (const side of ['right', 'left', 'both']) {
  for (const eyeH of [1.1, 1.25, 1.6]) {
    const cfg = { side, eyeH };
    const dist = { minD: 0.42, maxD: 0.7 };
    const b = targetBounds(cfg, dist);
    const rs = [];
    for (let n = 0; n < 30; n++) {
      const p = fallStart(cfg, dist, n);
      const r = Math.hypot(p.x, p.z);
      assert.ok(r <= b.maxD + 1e-9 && r >= b.minD - 1e-9, `profundidad fuera del alcance cómodo: ${r}`);
      assert.ok(p.z < 0, 'siempre al frente');
      assert.ok(p.y > eyeH + 0.25 - 1e-9 && p.y <= 2.05, 'empieza sobre la línea de los ojos');
      assert.ok(Math.abs(p.azDeg) <= APPLE_ARCS.amplio + 1e-9, 'dentro del arco elegido');
      if (side === 'right') assert.ok(p.azDeg >= -0.16 * APPLE_ARCS.amplio, 'respeta el lado derecho');
      if (side === 'left') assert.ok(p.azDeg <= 0.16 * APPLE_ARCS.amplio, 'respeta el lado izquierdo');
      rs.push(r);
    }
    // tres seguidas a profundidades distintas (cerca, lejos, media)
    for (let n = 0; n + 2 < rs.length; n += 3) {
      const [a, c, m] = rs.slice(n, n + 3);
      assert.ok(c - a > (b.maxD - b.minD) * 0.25, 'la segunda cae más lejos que la primera');
      assert.ok(m > a && m < c + 0.05, 'la tercera queda entremedio');
    }
  }
}
assert.equal(FALL_DEPTHS.length, 3);
// Arco: con "muy amplio" hay manzanas a más de 70° (girar cabeza y tronco); con "al frente", nunca más de 35°
for (const [arc, lo, hi] of [['completo', 70, 85], ['frente', 0, 35]]) {
  const az = Array.from({ length: 18 }, (_, n) => Math.abs(fallStart({ side: 'both', eyeH: 1.2, appleArc: arc }, { minD: 0.42, maxD: 0.7 }, n).azDeg));
  assert.ok(Math.max(...az) >= lo && Math.max(...az) <= hi + 1e-9, `${arc}: máximo ${Math.max(...az).toFixed(0)}°`);
}
// Ambos lados: alterna derecha e izquierda
{ const s1 = Array.from({ length: 6 }, (_, n) => Math.sign(fallStart({ side: 'both', appleArc: 'amplio' }, { minD: 0.42, maxD: 0.7 }, n).azDeg));
  assert.ok(s1.includes(1) && s1.includes(-1), 'ambos lados'); }
assert.equal(normalizeConfig({}).appleArc, 'amplio');
assert.equal(normalizeConfig({ appleArc: 'x' }).appleArc, 'amplio');
console.log('OK: manzana que cae con profundidad');
