// Cosecha del Manzano, nivel 3: la manzana cae desde más arriba y a distintas profundidades. node pruebas/test_manzano_caida.mjs
import assert from 'node:assert/strict';
import { fallStart, targetBounds, FALL_DEPTHS } from '../logic.js';

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
      if (side === 'right') assert.ok(p.x >= -0.1 * 0.35 - 1e-9, 'respeta el lado derecho');
      if (side === 'left') assert.ok(p.x <= 0.1 * 0.35 + 1e-9, 'respeta el lado izquierdo');
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
console.log('OK: manzana que cae con profundidad');
