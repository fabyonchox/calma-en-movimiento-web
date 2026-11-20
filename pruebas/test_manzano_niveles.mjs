// Prueba de la lógica de los niveles 2 y 3 de la Cosecha del Manzano.
import { DEFAULTS, normalizeConfig, pickTarget, moveWaypoint, targetBounds, stepToward, fallStep, warnShake, APPLE_SPEEDS, APPLE_GROUND_Y } from '../logic.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fail++; };

// Configuración
ok(DEFAULTS.appleLevel === 1 && DEFAULTS.appleSpeed === 'slow', 'por defecto: nivel 1, velocidad lenta (nada cambia si no se elige)');
ok(normalizeConfig({ appleLevel: '3' }).appleLevel === 3 && normalizeConfig({ appleLevel: 9 }).appleLevel === 1 && normalizeConfig({ appleSpeed: 'rapida' }).appleSpeed === 'slow', 'se valida el nivel y la velocidad');

// Nivel 2: la manzana se mueve siempre dentro del alcance cómodo, del lado elegido y a velocidad baja
for (const side of ['right', 'left', 'both']) {
  for (const cap of [0.5, 0.65, 0.8]) {
    const cfg = normalizeConfig({ side, eyeH: 1.15 }); const dist = { minD: 0.4, maxD: cap };
    const b = targetBounds(cfg, dist);
    let base = pickTarget(cfg, dist).pos; let bad = 0; let maxStep = 0;
    let pos = { ...base }; let goal = moveWaypoint(cfg, dist, base);
    for (let i = 0; i < 4000; i++) {
      const st = stepToward(pos, goal, APPLE_SPEEDS.slow.move, 0.016);
      maxStep = Math.max(maxStep, Math.hypot(st.pos.x - pos.x, st.pos.y - pos.y, st.pos.z - pos.z));
      pos = st.pos; if (st.arrived) goal = moveWaypoint(cfg, dist, base);
      const r = Math.hypot(pos.x, pos.z);
      if (r > b.maxD + 1e-6 || r < b.minD - 0.02 || pos.y < b.minH - 1e-6 || pos.y > b.maxH + 1e-6 || pos.z >= 0) bad++;
      if (side === 'right' && pos.x < -0.1 * 0.35 - 1e-6) bad++;
      if (side === 'left' && pos.x > 0.1 * 0.35 + 1e-6) bad++;
    }
    ok(bad === 0, `nivel 2 (${side}, alcance ${cap} m): 4000 cuadros siempre dentro de los límites`);
    ok(maxStep <= APPLE_SPEEDS.slow.move * 0.016 + 1e-9, `nivel 2 (${side}, ${cap} m): nunca supera ${APPLE_SPEEDS.slow.move} m/s`);
  }
}
// se mueve en todas las direcciones
{
  const cfg = normalizeConfig({ side: 'both' }); const dist = { minD: 0.4, maxD: 0.8 }; const base = { x: 0, y: 1.1, z: -0.6 };
  let dx = 0; let dz = 0; let dy = 0;
  for (let i = 0; i < 300; i++) { const w = moveWaypoint(cfg, dist, base); dx = Math.max(dx, Math.abs(w.x - base.x)); dz = Math.max(dz, Math.abs(w.z - base.z)); dy = Math.max(dy, Math.abs(w.y - base.y)); }
  ok(dx > 0.1 && dz > 0.08 && dy > 0.05, `se mueve a los lados (${dx.toFixed(2)} m), adelante/atrás (${dz.toFixed(2)} m) y arriba/abajo (${dy.toFixed(2)} m)`);
}

// Nivel 3: caída lenta y con aviso
for (const k of ['slow', 'medium']) {
  const sp = APPLE_SPEEDS[k]; let vy = 0; let y = 1.2; let t = 0; let vmax = 0; let acc = 0;
  while (y > APPLE_GROUND_Y && t < 20) { const v2 = fallStep(vy, 0.016, sp); acc = Math.max(acc, Math.abs(v2 - vy) / 0.016); vy = v2; y += vy * 0.016; t += 0.016; vmax = Math.max(vmax, -vy); }
  ok(vmax <= sp.fall + 1e-9 && vmax > 0.3, `caída ${k}: velocidad máxima ${vmax.toFixed(2)} m/s (tope ${sp.fall})`);
  ok(t > 1.5 && t < 4.5, `caída ${k}: desde 1,2 m tarda ${t.toFixed(1)} s en llegar al suelo`);
  ok(sp.warn >= 1.5, `aviso ${k}: vibra ${sp.warn} s antes de caer`);
}
let amp = 0; for (let i = 0; i < 400; i++) { const s = warnShake(i * 0.005, 1); amp = Math.max(amp, Math.abs(s.x), Math.abs(s.z), Math.abs(s.y)); }
ok(amp > 0.004 && amp < 0.012, `la vibración de aviso es pequeña (hasta ${(amp * 1000).toFixed(1)} mm)`);
console.log(fail ? '\n' + fail + ' FALLAS' : '\nTodo OK'); process.exit(fail ? 1 : 0);
