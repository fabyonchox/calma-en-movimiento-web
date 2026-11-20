// Manos del paciente en el visor. Se dibujan a partir de las 25 articulaciones que entrega el seguimiento de manos del Quest:
// dedos que se afinan hacia la punta, nudillos y yemas redondeadas, y una palma con volumen. Es solo la apariencia
// (el tacto y los agarres usan las articulaciones, no estas formas). Se puede cambiar el tono de piel o volver al aspecto luminoso.
import * as THREE from './libs/three.module.min.js';

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

const FINGERS = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];

// Huesos: cada dedo es una cadena de articulaciones; además el arco de los metacarpianos.
export const BONE_PAIRS = [];
for (const f of FINGERS) {
  const chain = f === 'thumb'
    ? ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip']
    : ['wrist', f + '-metacarpal', f + '-phalanx-proximal', f + '-phalanx-intermediate', f + '-phalanx-distal', f + '-tip'];
  for (let i = 0; i < chain.length - 1; i++) BONE_PAIRS.push([chain[i], chain[i + 1]]);
}
BONE_PAIRS.push(['thumb-metacarpal', 'index-finger-metacarpal'], ['index-finger-metacarpal', 'middle-finger-metacarpal'],
  ['middle-finger-metacarpal', 'ring-finger-metacarpal'], ['ring-finger-metacarpal', 'pinky-finger-metacarpal']);

// Contorno de la palma (de la muñeca, por el pulgar, a lo largo de los nudillos, hasta el meñique)
const PALM_OUTLINE = ['wrist', 'thumb-metacarpal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal',
  'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'];

// Grosor (radio, en metros) de cada dedo y cuánto se afina en cada tramo
const FINGER_R = { thumb: 0.0108, 'index-finger': 0.0088, 'middle-finger': 0.0092, 'ring-finger': 0.0086, 'pinky-finger': 0.0074 };
const SEG_K = { metacarpal: 1.15, proximal: 1.0, intermediate: 0.9, distal: 0.8, tip: 0.66 };

export function jointRadius(name) {
  if (name === 'wrist') return 0.0145;
  const f = FINGERS.find((x) => name.startsWith(x));
  const seg = Object.keys(SEG_K).find((s) => name.endsWith(s) || name.includes('-' + s));
  // los metacarpianos quedan dentro de la palma (salvo el del pulgar, que forma la base del pulgar)
  const k = seg === 'metacarpal' ? (f === 'thumb' ? 1.1 : 0.8) : (SEG_K[seg] || 1);
  return (FINGER_R[f] || 0.009) * k;
}

// Aspectos disponibles. Los tonos de piel son neutros y se eligen desde la tablet del terapeuta.
export const HAND_LOOKS = {
  skin1: { color: 0xf0c6a6, rough: 0.72 }, // piel clara
  skin2: { color: 0xd6a07b, rough: 0.72 }, // piel media
  skin3: { color: 0x8f5d40, rough: 0.72 }, // piel oscura
  glow: { glow: true }, // aspecto luminoso anterior
};
export const DEFAULT_HAND_LOOK = 'skin2';

export function buildHandVisuals(hd) {
  if (hd.userData.built) return;
  hd.userData.built = true;
  hd.joints = hd.joints || {};

  const body = new THREE.MeshStandardMaterial({ color: 0xd6a07b, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
  const tip = new THREE.MeshStandardMaterial({ color: 0xd6a07b, roughness: 0.65, metalness: 0 });
  const halo = new THREE.MeshBasicMaterial({ color: 0xfff1e0, transparent: true, opacity: 0.2, depthWrite: false });

  const sphereGeos = new Map();
  for (const name of JOINT_NAMES) {
    let g = hd.joints[name];
    if (!g) {
      g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.visible = true;
      hd.joints[name] = g;
      hd.add(g);
    }
    const r = jointRadius(name);
    if (!sphereGeos.has(r)) sphereGeos.set(r, new THREE.SphereGeometry(r, 12, 9));
    g.add(new THREE.Mesh(sphereGeos.get(r), name.endsWith('-tip') ? tip : body));
    if (name === 'index-finger-tip') { // punto de toque: un halo suave en la yema del índice
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), halo);
      g.add(h);
      hd.userData.haloMesh = h;
    }
  }

  // Dedos: cilindros que se afinan de una articulación a la siguiente (extremos tapados por las esferas de las articulaciones)
  const bones = [];
  const bonesGroup = new THREE.Group();
  hd.add(bonesGroup);
  const geoCache = new Map();
  for (const [a, b] of BONE_PAIRS) {
    const ra = jointRadius(a) * 0.98; const rb = jointRadius(b) * 0.98;
    const key = ra.toFixed(5) + '/' + rb.toFixed(5);
    if (!geoCache.has(key)) {
      const geo = new THREE.CylinderGeometry(rb, ra, 1, 10, 1, true); // arriba = hacia b
      geo.translate(0, 0.5, 0);
      geo.rotateX(Math.PI / 2); // el eje del cilindro queda en +Z, de a hacia b
      geoCache.set(key, geo);
    }
    const mesh = new THREE.Mesh(geoCache.get(key), body);
    mesh.visible = false;
    bonesGroup.add(mesh);
    bones.push({ mesh, a, b });
  }

  // Palma: dos capas (palma y dorso) con volumen, que siguen a los nudillos y la muñeca
  const n = PALM_OUTLINE.length;
  const pos = new Float32Array((2 + 2 * n) * 3);
  const idx = [];
  const T0 = 0; const B0 = 1; const T1 = 2; const B1 = 2 + n; // índices: centro arriba/abajo, contorno arriba/abajo
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(T0, T1 + i, T1 + j); // cara superior
    idx.push(B0, B1 + j, B1 + i); // cara inferior
    idx.push(T1 + i, B1 + i, B1 + j, T1 + i, B1 + j, T1 + j); // borde
  }
  const palmGeo = new THREE.BufferGeometry();
  palmGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  palmGeo.setIndex(idx);
  const palm = new THREE.Mesh(palmGeo, body);
  palm.frustumCulled = false; // la forma cambia cada cuadro
  palm.visible = false;
  hd.add(palm);

  hd.userData.bones = bones;
  hd.userData.palm = palm;
  hd.userData.mats = { body, tip, halo };
  setHandLook(hd, DEFAULT_HAND_LOOK);
}

// Cambia el aspecto (solo si cambió)
export function setHandLook(hd, look) {
  if (!hd || !hd.userData.mats) return;
  const key = HAND_LOOKS[look] ? look : DEFAULT_HAND_LOOK;
  if (hd.userData.look === key) return;
  hd.userData.look = key;
  const L = HAND_LOOKS[key];
  const { body, tip, halo } = hd.userData.mats;
  if (L.glow) {
    body.color.setHex(0xdbf5ea); body.emissive.setHex(0x1d4d3e); body.emissiveIntensity = 0.45; body.roughness = 0.35; body.metalness = 0.08;
    body.transparent = true; body.opacity = 0.9;
    tip.color.setHex(0xa8f5df); tip.emissive.setHex(0x56e2b6); tip.emissiveIntensity = 0.85; tip.roughness = 0.25; tip.metalness = 0.1;
    tip.transparent = true; tip.opacity = 0.95;
    halo.color.setHex(0x76eed3); halo.opacity = 0.38;
  } else {
    body.color.setHex(L.color); body.emissive.setHex(L.color); body.emissiveIntensity = 0.16; body.roughness = L.rough; body.metalness = 0;
    body.transparent = false; body.opacity = 1;
    // yemas apenas más rosadas y suaves, como en una mano real
    tip.color.setHex(L.color).lerp(new THREE.Color(0xe8908a), 0.18); tip.emissive.setHex(L.color); tip.emissiveIntensity = 0.16; tip.roughness = 0.6; tip.metalness = 0;
    tip.transparent = false; tip.opacity = 1;
    halo.color.setHex(0xfff1e0); halo.opacity = 0.2;
  }
  body.needsUpdate = true; tip.needsUpdate = true;
}

const _n = new THREE.Vector3(); const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3();

export function updateHandBones(hd) {
  if (!hd || !hd.visible || !hd.userData.bones) return;
  const joints = hd.joints;
  if (!joints) return;

  for (const b of hd.userData.bones) {
    const jA = joints[b.a]; const jB = joints[b.b];
    if (jA && jB && jA.visible && jB.visible) {
      const dist = jA.position.distanceTo(jB.position);
      if (dist > 0.002 && dist < 0.15) {
        b.mesh.position.copy(jA.position);
        b.mesh.lookAt(jB.position);
        b.mesh.scale.set(1, 1, dist);
        b.mesh.visible = true;
        continue;
      }
    }
    b.mesh.visible = false;
  }

  // Palma
  const palm = hd.userData.palm;
  if (!palm) return;
  const pts = PALM_OUTLINE.map((nm) => joints[nm]);
  if (pts.some((p) => !p || !p.visible)) { palm.visible = false; return; }
  const arr = palm.geometry.attributes.position.array;
  // Centro y dirección "hacia afuera de la palma" (perpendicular a la mano)
  _c.set(0, 0, 0);
  pts.forEach((p) => _c.add(p.position));
  _c.multiplyScalar(1 / pts.length);
  _a.subVectors(joints['index-finger-phalanx-proximal'].position, joints['wrist'].position);
  _b.subVectors(joints['pinky-finger-phalanx-proximal'].position, joints['wrist'].position);
  _n.crossVectors(_a, _b);
  if (_n.lengthSq() < 1e-10) { palm.visible = false; return; }
  _n.normalize();
  const edge = 0.0075; const mid = 0.0100; // grosor: algo más abultada al centro
  const set = (i, p, off) => { arr[i * 3] = p.x + _n.x * off; arr[i * 3 + 1] = p.y + _n.y * off; arr[i * 3 + 2] = p.z + _n.z * off; };
  const nP = pts.length;
  set(0, _c, mid); set(1, _c, -mid);
  for (let i = 0; i < nP; i++) { set(2 + i, pts[i].position, edge); set(2 + nP + i, pts[i].position, -edge); }
  palm.geometry.attributes.position.needsUpdate = true;
  palm.geometry.computeVertexNormals();
  palm.visible = true;
}
