// Respira 360: node pruebas/test_paisaje360.mjs
import assert from 'node:assert/strict';
import * as THREE from '../libs/three.module.min.js';
import { landscapePlan, landscapePhaseAt, breathAt, cycleSecs, patternHolds, BREATH_PATTERNS } from '../respira_logica.js';
import { normalizeConfig, DEFAULTS } from '../logic.js';
import { LandscapeScene } from '../paisaje360.js';

// 1) Reparto de la sesión: ciclos completos, llegada y vuelta de 1 min, cierre 20 s
{
  const p = landscapePlan(5, true, '4-6');
  assert.deepEqual([p.settle, p.guided, p.back, p.close, p.total, p.cycles], [60, 300, 60, 20, 440, 30]);
  const q = landscapePlan(5, false, 'suspiro');
  assert.equal(q.settle + q.back, 0);
  assert.equal(q.guided % cycleSecs('suspiro'), 0, 'nunca corta una respiración a la mitad');
  assert.equal(landscapePhaseAt(30, p).name, 'llegada');
  assert.equal(landscapePhaseAt(61, p).name, 'guiada');
  assert.equal(landscapePhaseAt(361, p).name, 'vuelta');
  assert.equal(landscapePhaseAt(421, p).name, 'cierre');
  assert.equal(landscapePhaseAt(441, p).name, 'fin');
}
// 2) Suspiro cíclico: dos inhalaciones (la segunda llena el resto) y exhalación larga
{
  const a = breathAt(1.9, 'suspiro'); const b = breathAt(2.9, 'suspiro'); const c = breathAt(8.9, 'suspiro');
  assert.equal(a.name, 'inhale'); assert.equal(b.name, 'inhale2'); assert.equal(c.name, 'exhale');
  assert.ok(a.size < 0.81 && b.size > a.size && b.size <= 1 && c.size < 0.05);
}
// 3) Patrones con retención de aire marcados como avanzados; los nuevos no retienen
assert.equal(patternHolds('caja'), true); assert.equal(patternHolds('4-2-6'), true);
['4-6', '5-5', 'inicial', 'suspiro'].forEach((k) => { assert.equal(patternHolds(k), false); assert.ok(BREATH_PATTERNS[k].steps.every((s) => !s.name.startsWith('hold'))); });
// 4) Configuración: valores válidos pasan, inválidos vuelven al defecto
{
  const c = normalizeConfig({ gameMode: 'breath', breathContent: 'paisaje', breathLandscape: 'bosque', breathGuidedMin: '8', breathPattern: 'suspiro' });
  assert.deepEqual([c.breathContent, c.breathLandscape, c.breathGuidedMin, c.breathPattern], ['paisaje', 'bosque', 8, 'suspiro']);
  const d = normalizeConfig({ breathLandscape: 'luna', breathGuidedMin: 7, breathVoice: 'x', breathCount: 'x' });
  assert.deepEqual([d.breathLandscape, d.breathGuidedMin, d.breathVoice, d.breathCount], [DEFAULTS.breathLandscape, 5, 'inicio', 'off']);
}
// 5) Escena: recorre las fases, cuenta respiraciones y termina sola; la luz guía solo en la fase guiada
{
  const phases = []; const words = []; let cyc = 0;
  const sc = new LandscapeScene(THREE, new THREE.Group(), { audioCtx: () => null, soundOn: () => false, onPhase: (n) => phases.push(n), onCycle: (n) => { cyc = n; }, onWord: (w) => words.push(w) });
  sc.configure({ breathLandscape: 'playa', breathGuidedMin: 3, breathSettle: 'on', breathPattern: '4-6', breathCount: 'on' }, 1.15);
  sc.start();
  let glowInSettle = 0; let glowInGuided = 0;
  for (let i = 0; i < 72 * 400 && !sc.done; i++) {
    sc.step(1 / 72);
    if (sc.phase === 'llegada') glowInSettle = Math.max(glowInSettle, sc.glowMat.opacity);
    if (sc.phase === 'guiada' && sc.elapsed > 70) glowInGuided = Math.max(glowInGuided, sc.glowMat.opacity);
  }
  assert.deepEqual(phases, ['llegada', 'guiada', 'vuelta', 'cierre', 'fin']);
  assert.ok(sc.done && Math.abs(sc.elapsed - sc.totalSecs()) < 0.1, 'termina sola al tiempo total');
  assert.equal(cyc, 18, '3 min a 6 resp/min = 18 respiraciones');
  assert.equal(glowInSettle, 0, 'sin luz guía durante la llegada');
  assert.ok(glowInGuided > 0.3, 'luz guía visible al respirar');
  assert.equal(words.slice(0, 2).join(), 'inhale,exhale');
}
console.log('OK: Respira 360');
