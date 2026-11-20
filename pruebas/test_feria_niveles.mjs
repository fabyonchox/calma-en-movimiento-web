// Prueba de los niveles de la Feria de Juegos: el puesto cambia de lugar y de cantidad de tarros sin salir del alcance cómodo.
import * as THREE from '../libs/three.module.min.js';
import { fairLayout, fairVariant, FAIR_COUNTS } from '../feria_fisica.js';
import { FairScene } from '../feria_escena.js';
import { normalizeConfig, DEFAULTS } from '../logic.js';

let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fail++; };
const hyp = Math.hypot;

ok(DEFAULTS.fairLevel === 1 && normalizeConfig({ fairLevel: '3' }).fairLevel === 3 && normalizeConfig({ fairLevel: 7 }).fairLevel === 1, 'configuración: por defecto nivel 1; se valida');

// Nivel 1: idéntico al de siempre
for (const side of ['right', 'left', 'both']) {
  const cfg = normalizeConfig({ side, fairLevel: 1 });
  const a = fairLayout(cfg, { maxD: 0.65 }, 1.15); const b = fairLayout(cfg, { maxD: 0.65 }, 1.15, fairVariant(cfg, 5));
  ok(JSON.stringify(a) === JSON.stringify(b) && a.cans.length === 6, `nivel 1 (${side}): siempre el mismo puesto con 6 tarros`);
}

// Niveles 2 y 3: ningún tarro ni bandeja pasa el alcance cómodo, en cualquier ronda
for (const level of [2, 3]) for (const side of ['right', 'left', 'both']) for (const cap of [0.45, 0.55, 0.7, 0.85]) {
  const cfg = normalizeConfig({ side, fairLevel: level }); let bad = 0; let okAll = 0; const xs = new Set(); const counts = [];
  for (let r = 0; r < 12; r++) {
    const L = fairLayout(cfg, { maxD: cap }, 1.15, fairVariant(cfg, r));
    if (!L.ok) continue; okAll++;
    xs.add(L.counter.cx.toFixed(2)); counts.push(L.cans.length);
    for (const c of L.cans) if (hyp(c.home.x, c.home.z) > cap + 1e-6) bad++;
    for (const b of L.bins) if (hyp(b.x, b.z) > cap + 1e-6) bad++;
  }
  ok(bad === 0 && (cap < 0.5 ? okAll >= 1 : okAll >= 10), `nivel ${level} (${side}, alcance ${cap} m): ${okAll}/12 rondas válidas y siempre dentro del alcance`);
  if (cap === 0.7) {
    ok(xs.size >= 3, `nivel ${level} (${side}): el puesto usa ${xs.size} lugares distintos`);
    if (side !== 'both') ok([...xs].every((x) => side === 'right' ? Number(x) >= 0.05 : Number(x) <= -0.05), `nivel ${level} (${side}): solo se mueve hacia el lado elegido`);
    if (level === 3) ok(JSON.stringify(counts.slice(0, 5)) === JSON.stringify([3, 4, 5, 6, 6]), `nivel 3 (${side}): cantidad de tarros por ronda ${counts.slice(0, 5)}`);
    if (level === 2) ok(counts.every((n) => n === 6), `nivel 2 (${side}): siempre 6 tarros`);
  }
}
// Los soportes de cada tarro existen siempre (ninguno queda "flotando")
for (const n of FAIR_COUNTS) {
  const L = fairLayout(normalizeConfig({ fairLevel: 3 }), { maxD: 0.7 }, 1.15, { shift: 0, count: n });
  ok(L.cans.length === n && L.cans.every((c) => c.supports.every((i) => i < n)), `${n} tarros: todos tienen su apoyo`);
}

// Escena completa: al rearmar, el puesto cambia de lugar y de cantidad
for (const level of [2, 3]) {
  const anchor = new THREE.Group(); const resolved = []; const sounds = [];
  const host = { controllers: () => [], handLocal: () => ({ x: 0, y: 0, z: 0 }), grasping: () => false, haptic() {}, sound: (k) => sounds.push(k), onThrow: () => null, onCan() {}, onResolved: (b) => resolved.push(b) };
  const sc = new FairScene(THREE, anchor, host);
  const cfg = normalizeConfig({ side: 'both', fairLevel: level, gameMode: 'fair' });
  ok(sc.configure(cfg, { maxD: 0.7 }, 1.15), `escena nivel ${level}: se arma`);
  sc.start(); sc.setVisible(true);
  const seen = []; let now = 1000; let err = null;
  const snap = () => seen.push(sc.layout.counter.cx.toFixed(2) + '/' + sc.layout.cans.length);
  snap();
  try {
    for (let round = 0; round < 5; round++) {
      sc.world.cans.forEach((c) => { c.state = 'down'; c.counted = true; }); // todos los tarros caídos
      for (let i = 0; i < 400; i++) { now += 16; sc.step(0.016, now); if (sc.layout.counter.cx.toFixed(2) + '/' + sc.layout.cans.length !== seen[seen.length - 1]) { snap(); break; } }
    }
  } catch (e) { err = e; }
  ok(!err, `escena nivel ${level}: sin errores (${err ? err.message : 'ok'})`);
  ok(new Set(seen.map((s) => s.split('/')[0])).size >= 3, `escena nivel ${level}: lugares ${seen.join(' → ')}`);
  if (level === 3) ok(seen.map((s) => s.split('/')[1]).slice(0, 4).join() === '3,4,5,6', `escena nivel 3: cantidades ${seen.map((s) => s.split('/')[1]).join(',')}`);
  ok(sc.canMeshes.length === sc.layout.cans.length && sc.world.cans.length === sc.layout.cans.length, `escena nivel ${level}: dibujo y física con la misma cantidad de tarros`);
  // al terminar y volver a empezar, parte del primer lugar
  sc.clear(); sc.start();
  ok(sc.layout.counter.cx.toFixed(2) === '0.00' && sc.layout.cans.length === (level === 3 ? 3 : 6), `escena nivel ${level}: una sesión nueva parte del primer lugar y cantidad`);
}
// Si hay una pelota en la mano, no se mueve el puesto hasta soltarla
{
  const anchor = new THREE.Group(); const host = { controllers: () => [], handLocal: () => ({ x: 0, y: 0, z: 0 }), grasping: () => false, haptic() {}, sound() {}, onThrow: () => null, onCan() {}, onResolved() {} };
  const sc = new FairScene(THREE, anchor, host); sc.configure(normalizeConfig({ fairLevel: 2, side: 'both' }), { maxD: 0.7 }, 1.15); sc.start(); sc.setVisible(true);
  sc.holds.set({}, {}); sc.pendingMove = true; const cx0 = sc.layout.counter.cx;
  ok(sc.tryMove(5000) === false && sc.layout.counter.cx === cx0 && sc.pendingMove, 'con una pelota en la mano el puesto espera (no se mueve de golpe)');
  sc.holds.clear();
  ok(sc.tryMove(5100) === true && sc.layout.counter.cx !== cx0, 'al soltarla, el puesto cambia de lugar');
}
// Alcance muy corto: nunca falla; usa un desplazamiento menor o se queda donde está, siempre dentro del alcance
{
  const anchor = new THREE.Group(); const host = { controllers: () => [], handLocal: () => ({ x: 0, y: 0, z: 0 }), grasping: () => false, haptic() {}, sound() {}, onThrow: () => null, onCan() {}, onResolved() {} };
  const cap = 0.45; const sc = new FairScene(THREE, anchor, host);
  const okCfg = sc.configure(normalizeConfig({ fairLevel: 3, side: 'both' }), { maxD: cap }, 1.15);
  if (okCfg) {
    sc.start(); sc.setVisible(true); let bad = 0; let err = null;
    try { for (let r = 0; r < 8; r++) { sc.pendingMove = true; sc.tryMove(1000 + r * 1000); for (const c of sc.layout.cans) if (Math.hypot(c.home.x, c.home.z) > cap + 1e-6) bad++; for (const b of sc.layout.bins) if (Math.hypot(b.x, b.z) > cap + 1e-6) bad++; } } catch (e) { err = e; }
    ok(!err && bad === 0, `alcance muy corto (${cap} m): 8 cambios sin errores y siempre dentro del alcance`);
  } else ok(true, `alcance muy corto (${cap} m): la feria no se arma (igual que antes)`);
}
console.log(fail ? '\n' + fail + ' FALLAS' : '\nTodo OK'); process.exit(fail ? 1 : 0);
