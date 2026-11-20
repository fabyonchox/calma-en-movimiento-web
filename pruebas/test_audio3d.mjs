// Prueba del audio 3D con un AudioContext simulado: ubicación de sonidos, oído que sigue la cabeza y apagado desde la tablet.
import * as THREE from '../libs/three.module.min.js';
import { Spatial } from '../audio3d.js';
import { Sfx } from '../sfx.js';

let fail = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLA') + ' ' + m); if (!c) fail++; };
const P = () => { const o = { value: 0, setValueAtTime(v) { o.value = v; } }; return o; };
const node = (extra = {}) => ({ connect(n) { return n; }, gain: P(), frequency: P(), Q: P(), pan: P(), start() {}, stop() {}, ...extra });
const made = { panners: [], stereo: 0 };
const ctx = {
  currentTime: 0, sampleRate: 8000, destination: node(),
  listener: { positionX: P(), positionY: P(), positionZ: P(), forwardX: P(), forwardY: P(), forwardZ: P(), upX: P(), upY: P(), upZ: P() },
  createGain: () => node(), createOscillator: () => node(), createBiquadFilter: () => node(), createBufferSource: () => node(),
  createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }),
  createStereoPanner: () => { made.stereo++; return node(); },
  createPanner: () => { const p = node({ positionX: P(), positionY: P(), positionZ: P() }); made.panners.push(p); return p; },
};
const anchor = new THREE.Group(); anchor.position.set(2, 0, -1); anchor.rotation.y = Math.PI / 2; anchor.updateMatrixWorld(true);
const sp = new Spatial(() => ctx, () => anchor, THREE.Vector3);
const sfx = new Sfx(() => ctx, () => true); sfx.spatial = sp;

// 1) un punto del juego se convierte a posición del mundo
sfx.sparkle({ x: 1, y: 1.5, z: 0 });
const p0 = made.panners[0];
// rotación Y de 90°: (1,·,0) -> (0,·,-1); más el origen (2,·,-1) => (2, 1.5, -2)
ok(made.panners.length === 1 && Math.abs(p0.positionX.value - 2) < 1e-6 && Math.abs(p0.positionY.value - 1.5) < 1e-6 && Math.abs(p0.positionZ.value + 2) < 1e-6, 'punto del juego -> mundo (2, 1.5, -2): (' + [p0.positionX.value, p0.positionY.value, p0.positionZ.value].map((v) => v.toFixed(2)) + ')');
ok(p0.panningModel === 'HRTF', 'usa HRTF');

// 2) un objeto 3D usa su posición real en el mundo
const child = new THREE.Group(); child.position.set(0, 1, 1); anchor.add(child); anchor.updateMatrixWorld(true);
sfx.appleSnap(child);
const p1 = made.panners[1];
ok(Math.abs(p1.positionX.value - 3) < 1e-6 && Math.abs(p1.positionZ.value + 1) < 1e-6, 'objeto 3D -> posición del mundo (3, 1, -1): (' + [p1.positionX.value, p1.positionY.value, p1.positionZ.value].map((v) => v.toFixed(2)) + ')');

// 3) el oído sigue a la cabeza
const cam = new THREE.PerspectiveCamera(); cam.position.set(0.5, 1.6, 0.3); cam.rotation.y = Math.PI / 2; cam.updateMatrixWorld(true);
sp.update(cam);
const L = ctx.listener;
ok(Math.abs(L.positionX.value - 0.5) < 1e-6 && Math.abs(L.positionY.value - 1.6) < 1e-6, 'el oído está en la cabeza');
ok(Math.abs(L.forwardX.value + 1) < 1e-6 && Math.abs(L.forwardZ.value) < 1e-6, 'mira hacia donde gira la cabeza (-X)');

// 4) legacy: un número sigue usando paneo estéreo
made.stereo = 0; const n = made.panners.length;
sfx.ballBounce(0.3, 1);
ok(made.stereo === 1 && made.panners.length === n, 'con un número solo usa el paneo izquierda/derecha');

// 5) apagado desde la tablet: aunque llegue un punto 3D, vuelve al paneo simple
sp.enabled = false; made.stereo = 0;
sfx.appleBasket({ x: -0.4, y: 1, z: -0.5 }, 3);
ok(made.stereo === 1 && made.panners.length === n, 'apagado: paneo simple, sin sonido 3D');
sp.enabled = true;

// 6) sin soporte del navegador no se cae
const sinPanner = { ...ctx, createPanner: undefined };
const sp2 = new Spatial(() => sinPanner, () => anchor, THREE.Vector3); const sfx2 = new Sfx(() => sinPanner, () => true); sfx2.spatial = sp2;
let err = null; try { sfx2.sparkle({ x: 1, y: 1, z: 1 }); } catch (e) { err = e; }
ok(!err, 'sin PannerNode no falla');

// 7) feedback "solo visual": silencio total
const mudo = new Sfx(() => ctx, () => false); mudo.spatial = sp; const k = made.panners.length; mudo.sparkle({ x: 0, y: 1, z: 0 });
ok(made.panners.length === k, 'retroalimentación "solo visual": no suena nada');
console.log(fail ? '\n' + fail + ' FALLAS' : '\nTodo OK'); process.exit(fail ? 1 : 0);
