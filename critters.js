// Animalitos del jardín para la pantalla de espera: conejo, ardilla, pájaro y mariposa.
// - Aparecen de a poco, desde cualquier lado (360°), no todos a la vez, y se van solos al cabo de un rato.
// - Esquivan farolas, rocas, árboles, la mesa y al propio paciente (no atraviesan nada).
// - Interacción: si el paciente levanta la mano quieta, la mariposa se posa en su dedo. En la mesita de comida hay
//   zanahorias, bellotas y semillas: el paciente toma una (pellizco) y la deja en el plato; el animal que corresponde
//   se acerca, salta a la mesa y se la come.
// Coordenadas locales del jardín: origen en el suelo bajo la cabeza del paciente, -z hacia adelante, y hacia arriba.

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Obstáculos del jardín (de buildEnvironment en game.js): x, z, radio (con margen) y altura. Las piedras del sendero
// y las flores son bajas y se pisan sin problema. El paciente cuenta como obstáculo para no pasar entre sus piernas.
export const ENV_OBSTACLES = [
  { x: -1.4, z: -1.7, r: 0.3, h: 0.9 }, { x: 1.4, z: -1.9, r: 0.3, h: 0.9 }, // farolillos
  { x: -2.0, z: -2.6, r: 0.7, h: 0.5 }, { x: 2.3, z: -2.8, r: 0.8, h: 0.55 }, // rocas
  { x: -2.8, z: -4.4, r: 1.1, h: 0.8 }, { x: 3.3, z: -4.8, r: 1.25, h: 0.9 },
  { x: -3.8, z: -5.5, r: 0.4, h: 3 }, { x: -6.2, z: -8.0, r: 0.45, h: 3 }, { x: 4.2, z: -6.0, r: 0.4, h: 3 }, // árboles
  { x: 6.8, z: -9.2, r: 0.5, h: 3 }, { x: -8.5, z: -4.5, r: 0.4, h: 3 }, { x: 8.2, z: -5.2, r: 0.4, h: 3 },
  { x: 0, z: -12.5, r: 0.55, h: 3 }, { x: -2.2, z: -15, r: 0.5, h: 3 }, { x: 3.5, z: -14.2, r: 0.5, h: 3 },
  { x: 0, z: 0, r: 0.55, h: 3 }, // paciente
];

const KINDS = ['rabbit', 'squirrel', 'bird', 'butterfly'];
const FOOD_FOR = { carrot: 'rabbit', acorn: 'squirrel', seed: 'bird' };
const MAX_VISIBLE = 3;

export class Critters {
  // host: { hands() -> [{id, p:{x,y,z}, grasp}], eyeH() -> m, side() -> 'left'|'right'|'both', reach() -> m o null, haptic?(ms,k) }
  constructor(THREE, parent, host = {}) {
    this.T = THREE;
    this.host = host;
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.props = new THREE.Group();
    this.group.add(this.props);

    this.time = 0;
    this.active = false;
    this.nextSpawnAt = 0;
    this.order = [];
    this.obstacles = ENV_OBSTACLES.slice();
    this.table = null;
    this.supply = null;
    this.items = []; // alimentos sueltos o en mano
    this.plate = null; // alimento sobre el plato
    this.handState = new Map();

    this.animals = {
      rabbit: this.makeRabbit(),
      squirrel: this.makeSquirrel(),
      bird: this.makeBird(),
      butterfly: this.makeButterfly(),
    };
    for (const a of Object.values(this.animals)) { a.g.visible = false; this.group.add(a.g); }
  }

  /* ---------------- Modelos ---------------- */

  mats() {
    const T = this.T;
    const cache = {};
    return (color) => (cache[color] || (cache[color] = new T.MeshLambertMaterial({ color })));
  }

  parts() {
    const T = this.T; const mat = this.mats();
    return {
      mat,
      sph: (r, color, sx = 1, sy = 1, sz = 1) => { const m = new T.Mesh(new T.SphereGeometry(r, 14, 10), mat(color)); m.scale.set(sx, sy, sz); return m; },
      box: (w, h, d, color) => new T.Mesh(new T.BoxGeometry(w, h, d), mat(color)),
      cone: (r, h, color) => new T.Mesh(new T.ConeGeometry(r, h, 10), mat(color)),
      cyl: (rt, rb, h, color) => new T.Mesh(new T.CylinderGeometry(rt, rb, h, 16), mat(color)),
    };
  }

  makeRabbit() {
    const T = this.T; const { sph } = this.parts();
    const g = new T.Group();
    const body = sph(0.11, 0xf2ece4, 1, 0.9, 1.35); body.position.set(0, 0.11, 0);
    const head = new T.Group();
    const headMesh = sph(0.07, 0xf2ece4); head.add(headMesh);
    const earL = sph(0.022, 0xf6d9d9, 1, 4.2, 0.6); earL.position.set(-0.035, 0.11, 0.01);
    const earR = sph(0.022, 0xf6d9d9, 1, 4.2, 0.6); earR.position.set(0.035, 0.11, 0.01);
    const eyeL = sph(0.011, 0x2b2b2b); eyeL.position.set(-0.04, 0.015, -0.055);
    const eyeR = sph(0.011, 0x2b2b2b); eyeR.position.set(0.04, 0.015, -0.055);
    const nose = sph(0.012, 0xe58fa0); nose.position.set(0, -0.005, -0.068);
    head.add(earL, earR, eyeL, eyeR, nose);
    head.position.set(0, 0.2, -0.13);
    const tail = sph(0.04, 0xffffff); tail.position.set(0, 0.14, 0.16);
    g.add(body, head, tail);
    return { kind: 'rabbit', g, head, earL, earR, parts: { body }, ground: true, pad: 0.14, speed: 0.75, hop: { len: 0.2, h: 0.09 } };
  }

  makeSquirrel() {
    const T = this.T; const { sph, cone } = this.parts();
    const g = new T.Group();
    const body = sph(0.075, 0xc8702f, 1, 1.35, 1); body.position.set(0, 0.14, 0);
    const belly = sph(0.05, 0xf3dcc0, 0.9, 1.2, 0.6); belly.position.set(0, 0.13, -0.05);
    const head = new T.Group();
    head.add(sph(0.055, 0xd9843c));
    const eL = cone(0.016, 0.04, 0xc8702f); eL.position.set(-0.032, 0.055, 0);
    const eR = cone(0.016, 0.04, 0xc8702f); eR.position.set(0.032, 0.055, 0);
    const yL = sph(0.009, 0x222222); yL.position.set(-0.025, 0.012, -0.048);
    const yR = sph(0.009, 0x222222); yR.position.set(0.025, 0.012, -0.048);
    const nose = sph(0.009, 0x333333); nose.position.set(0, -0.012, -0.056);
    head.add(eL, eR, yL, yR, nose);
    head.position.set(0, 0.26, -0.02);
    const tail = new T.Group();
    const tm = sph(0.075, 0xb85f25, 0.8, 1.9, 0.8); tm.position.set(0, 0.14, 0);
    tail.add(tm); tail.position.set(0, 0.08, 0.07);
    g.add(body, belly, head, tail);
    return { kind: 'squirrel', g, head, tail, parts: { body }, ground: true, pad: 0.13, speed: 1.0, hop: { len: 0.26, h: 0.05 } };
  }

  makeBird() {
    const T = this.T; const { sph, box, cone } = this.parts();
    const g = new T.Group();
    const body = sph(0.05, 0x4f8fd6, 1, 0.9, 1.5);
    const head = sph(0.035, 0x6aa6e6); head.position.set(0, 0.025, -0.07);
    const beak = cone(0.012, 0.035, 0xf2a93b); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.02, -0.11);
    const tail = box(0.04, 0.008, 0.07, 0x356aa8); tail.position.set(0, 0.005, 0.1);
    const wingL = new T.Group(); const wl = box(0.13, 0.008, 0.06, 0x3f7bc4); wl.position.x = -0.065; wingL.add(wl);
    const wingR = new T.Group(); const wr = box(0.13, 0.008, 0.06, 0x3f7bc4); wr.position.x = 0.065; wingR.add(wr);
    wingL.position.set(-0.03, 0.02, 0); wingR.position.set(0.03, 0.02, 0);
    g.add(body, head, beak, tail, wingL, wingR);
    return { kind: 'bird', g, wingL, wingR, head, ground: false, pad: 0.1, speed: 1.5, ang: 0, rad: 4, h: 1.7 };
  }

  makeButterfly() {
    const T = this.T; const { box } = this.parts();
    const g = new T.Group();
    const body = box(0.008, 0.008, 0.05, 0x3a2f2f);
    const wl = new T.Group(); const l = box(0.05, 0.004, 0.04, 0xf5a742); l.position.x = -0.025; wl.add(l);
    const wr = new T.Group(); const r = box(0.05, 0.004, 0.04, 0xf5a742); r.position.x = 0.025; wr.add(r);
    g.add(body, wl, wr);
    return { kind: 'butterfly', g, wl, wr, ground: false, pad: 0.05, speed: 0.9, calm: 0 };
  }

  /* ---------------- Mesita de comida ---------------- */

  buildProps() {
    const T = this.T; const { box, cyl, sph, cone, mat } = this.parts();
    // Se limpian las props anteriores
    while (this.props.children.length) { const c = this.props.children[0]; this.props.remove(c); }
    this.items = []; this.plate = null;

    const eyeH = clamp((this.host.eyeH && this.host.eyeH()) || 1.15, 0.8, 1.9);
    const h = clamp(eyeH * 0.62, 0.6, 0.95); // altura de las mesitas
    // Regla de seguridad del proyecto: plato y provisiones dentro del ALCANCE CÓMODO calibrado.
    // El diseño original (plato a 0,65 m) cabe con un alcance de 0,70 m; con menos alcance todo se acerca a escala.
    // Antes de calibrar se usa el alcance mínimo aceptado (0,35 m), lo más cerca posible.
    const k = this.layoutScale();
    this.layoutK = k;
    const side = (this.host.side && this.host.side()) || 'right';
    const sides = side === 'both' ? ['right', 'left'] : [side === 'left' ? 'left' : 'right'];

    // Mesa de comer (centro, delante)
    const tz = -0.65 * k;
    const tr = 0.27 * k;
    const top = cyl(tr, tr, 0.03, 0xc9a26b); top.position.set(0, h - 0.015, tz);
    const leg = cyl(0.05, 0.07, h - 0.03, 0x8a6a4a); leg.position.set(0, (h - 0.03) / 2, tz);
    const plate = cyl(0.09, 0.09, 0.012, 0xfdf6e8); plate.position.set(0, h + 0.006, tz);
    this.props.add(top, leg, plate);
    this.table = { x: 0, z: tz, h, r: tr, plateY: h + 0.012 };

    // Mesa(s) de provisiones al lado de trabajo (en bilateral, una a cada lado)
    this.spots = {};
    this.supplies = [];
    this.obstacles = ENV_OBSTACLES.slice();
    this.tableObs = { x: 0, z: tz, r: tr + 0.03, h };
    this.obstacles.push(this.tableObs);
    for (const sd of sides) {
      const sx = 0.45 * k * (sd === 'left' ? -1 : 1); const sz = -0.4 * k;
      const sr = 0.21 * k;
      const stop = cyl(sr, sr, 0.03, 0xb98557); stop.position.set(sx, h - 0.015, sz);
      const sleg = cyl(0.045, 0.06, h - 0.03, 0x8a6a4a); sleg.position.set(sx, (h - 0.03) / 2, sz);
      this.props.add(stop, sleg);
      this.supplies.push({ x: sx, z: sz, h, r: sr });
      this.obstacles.push({ x: sx, z: sz, r: sr + 0.06, h });

      // Tres recipientes sobre la mesa de provisiones
      const o = 0.11 * k;
      const spots = { carrot: [sx - o, sz - 0.02 * k], acorn: [sx, sz + 0.08 * k], seed: [sx + o, sz - 0.02 * k] };
      const jar = new T.Mesh(new T.CylinderGeometry(0.05, 0.045, 0.1, 16), new T.MeshLambertMaterial({ color: 0xcfe9ef, transparent: true, opacity: 0.55 }));
      jar.position.set(spots.carrot[0], h + 0.05, spots.carrot[1]);
      const bowl = new T.Mesh(new T.SphereGeometry(0.055, 14, 10, 0, TAU, Math.PI / 2, Math.PI / 2), mat(0x8a5a3a));
      bowl.position.set(spots.acorn[0], h + 0.055, spots.acorn[1]);
      const cup = cyl(0.04, 0.035, 0.06, 0xd9c08a); cup.position.set(spots.seed[0], h + 0.03, spots.seed[1]);
      this.props.add(jar, bowl, cup);
      for (const kind of Object.keys(spots)) {
        const key = sd + '-' + kind;
        this.spots[key] = { kind, x: spots[kind][0], y: h + (kind === 'carrot' ? 0.13 : 0.075), z: spots[kind][1] };
        this.spawnItem(key);
      }
    }
    this.supply = this.supplies[0];
  }

  // Escala de la mesita según el alcance cómodo: 1 con 0,70 m o más; menos alcance, todo más cerca.
  layoutScale() {
    const r = this.host.reach && this.host.reach();
    const cap = r && r > 0 ? r : 0.35;
    return clamp(cap / 0.70, 0.5, 1);
  }

  makeFoodMesh(kind) {
    const T = this.T; const { sph, cone, cyl } = this.parts();
    const g = new T.Group();
    if (kind === 'carrot') {
      const c = cone(0.017, 0.11, 0xf08a24); c.rotation.x = Math.PI; g.add(c);
      const leaf = cone(0.012, 0.04, 0x4fa05a); leaf.position.y = 0.075; g.add(leaf);
    } else if (kind === 'acorn') {
      g.add(sph(0.022, 0xa8672f, 1, 1.2, 1));
      const cap = sph(0.024, 0x6b4423, 1, 0.6, 1); cap.position.y = 0.02; g.add(cap);
    } else {
      for (let i = 0; i < 6; i++) {
        const s = sph(0.011, i % 2 ? 0xe8c24a : 0xb08a3a, 1, 0.7, 1.4);
        s.position.set(Math.cos(i * 1.05) * 0.02, 0.005 * (i % 3), Math.sin(i * 1.05) * 0.02);
        g.add(s);
      }
    }
    return g;
  }

  spawnItem(key) {
    const spot = this.spots[key];
    if (!spot) return null;
    const kind = spot.kind;
    const mesh = this.makeFoodMesh(kind);
    mesh.position.set(spot.x, spot.y, spot.z);
    this.props.add(mesh);
    const it = { kind, spotKey: key, mesh, state: 'home', holder: null, home: { x: spot.x, y: spot.y, z: spot.z }, back: 0 };
    this.items.push(it);
    return it;
  }

  /* ---------------- Ciclo ---------------- */

  // Si la altura de ojos cambió (por «Recentrar»), se rearma la mesita a la altura nueva, salvo que haya algo en curso.
  refreshHeight() {
    if (!this.active || !this.table) return;
    const eyeH = clamp((this.host.eyeH && this.host.eyeH()) || 1.15, 0.8, 1.9);
    const h = clamp(eyeH * 0.62, 0.6, 0.95);
    // También se rearma si cambió el alcance calibrado (la mesita se acerca o se aleja dentro del alcance cómodo).
    if (Math.abs(h - this.table.h) < 0.02 && Math.abs(this.layoutScale() - (this.layoutK || 0)) < 0.01) return;
    if (this.items.some((i) => i.state === 'held') || Object.values(this.animals).some((a) => a.feeding)) return;
    this.buildProps();
  }

  setVisible(v) {
    v = !!v;
    if (v === this.group.visible) return;
    this.group.visible = v;
    if (v) this.begin(); else this.end();
  }

  begin() {
    this.active = true;
    this.time = 0;
    this.handState.clear();
    this.buildProps();
    this.order = this.shuffle(KINDS.slice());
    this.nextSpawnAt = 1.5;
    for (const a of Object.values(this.animals)) this.hide(a);
  }

  end() {
    this.active = false;
    for (const a of Object.values(this.animals)) this.hide(a);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  hide(a) { a.state = 'away'; a.g.visible = false; a.feeding = false; }

  visibleCount() { return Object.values(this.animals).filter((a) => a.state !== 'away').length; }

  /* ---------------- Obstáculos y movimiento en el suelo ---------------- */

  blocked(x, z, pad) {
    for (const o of this.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + pad) return true;
    return false;
  }

  // Avanza al animal de suelo hacia (tx,tz) esquivando obstáculos. Devuelve la distancia restante al objetivo.
  // fieldSkip: obstáculos cuyo CAMPO de rechazo no empuja (la restricción dura de no entrar en ellos sí se mantiene).
  // Se usa en el último tramo hacia el plato: el rechazo del paciente y de las mesas de provisiones cancelaba la atracción
  // del destino y el animal se quedaba parado a medio camino.
  steer(a, tx, tz, speed, dt, ignore = null, fieldSkip = null) {
    const dx = tx - a.x; const dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return 0;
    const ux = dx / d; const uz = dz / d;
    let rx = 0; let rz = 0;
    for (const o of this.obstacles) {
      if (o === ignore || (fieldSkip && fieldSkip.has(o))) continue;
      const ox = a.x - o.x; const oz = a.z - o.z;
      const od = Math.hypot(ox, oz);
      const lim = o.r + a.pad + 0.35;
      if (od < lim && od > 1e-4) {
        const k = (lim - od) / 0.35;
        rx += (ox / od) * k; rz += (oz / od) * k;
        const tx2 = -oz / od; const tz2 = ox / od;
        const s = Math.sign(tx2 * ux + tz2 * uz) || 1;
        rx += tx2 * s * k * 0.9; rz += tz2 * s * k * 0.9;
      }
    }
    // Otros animales: se les rodea (no se pasa por encima de ellos).
    const mates = this.groundMates(a);
    for (const b of mates) {
      const ox = a.x - b.x; const oz = a.z - b.z;
      const od = Math.hypot(ox, oz);
      const lim = 0.6;
      if (od < lim && od > 1e-4) {
        const k = (lim - od) / lim;
        rx += (ox / od) * k * 1.6; rz += (oz / od) * k * 1.6;
        const tx2 = -oz / od; const tz2 = ox / od;
        const s2 = Math.sign(tx2 * ux + tz2 * uz) || 1;
        rx += tx2 * s2 * k; rz += tz2 * s2 * k;
      }
    }
    let vx = ux + rx * 1.4; let vz = uz + rz * 1.4;
    const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
    const step = Math.min(speed * dt, d + 0.5);
    a.x += vx * step; a.z += vz * step;
    // Restricción dura: nunca se entra en un obstáculo
    for (const o of this.obstacles) {
      if (o === ignore) continue;
      const ox = a.x - o.x; const oz = a.z - o.z;
      const od = Math.hypot(ox, oz);
      const min = o.r + a.pad * 0.4;
      if (od < min) {
        const k = od > 1e-4 ? min / od : 1;
        a.x = od > 1e-4 ? o.x + ox * k : o.x + min; a.z = od > 1e-4 ? o.z + oz * k : o.z;
      }
    }
    // Separación firme: dos animales nunca quedan a menos de 30 cm uno del otro.
    for (const b of mates) {
      const ox = a.x - b.x; const oz = a.z - b.z;
      const od = Math.hypot(ox, oz);
      const min = 0.3;
      if (od < min) {
        const k = od > 1e-4 ? min / od : 1;
        a.x = od > 1e-4 ? b.x + ox * k : b.x + min; a.z = od > 1e-4 ? b.z + oz * k : b.z;
      }
    }
    // Los obstáculos mandan: si la separación empujó al animal contra uno, se le saca de nuevo.
    for (const o of this.obstacles) {
      if (o === ignore) continue;
      const ox = a.x - o.x; const oz = a.z - o.z;
      const od = Math.hypot(ox, oz);
      const min = o.r + a.pad * 0.4;
      if (od < min && od > 1e-4) { a.x = o.x + (ox / od) * min; a.z = o.z + (oz / od) * min; }
    }
    a.g.rotation.y = Math.atan2(-vx, -vz);
    a.moved = (a.moved || 0) + step;
    return Math.hypot(tx - a.x, tz - a.z);
  }

  // Otros animales de suelo presentes (distintos de a). Sirve para que no se amontonen ni se pisen.
  groundMates(a) {
    const out = [];
    for (const b of Object.values(this.animals)) {
      if (b === a || !b.ground || b.state === 'away') continue;
      if ((b.y || 0) > 0.3) continue; // subido a la mesa
      out.push(b);
    }
    return out;
  }

  pickWander(a) {
    for (let i = 0; i < 40; i++) {
      const ang = rnd(-1.6, 1.6); const r = rnd(1.1, 2.6);
      const x = Math.sin(ang) * r; const z = -Math.cos(ang) * r;
      if (this.blocked(x, z, a.pad + 0.3)) continue;
      const crowded = this.groundMates(a).some((b) => Math.hypot(x - b.x, z - b.z) < 1.0 || (b.target && Math.hypot(x - b.target.x, z - b.target.z) < 1.0));
      if (!crowded) return { x, z };
    }
    return { x: 0.9, z: -1.2 };
  }

  pickSpawn(a) {
    for (let i = 0; i < 60; i++) {
      const ang = rnd(-Math.PI, Math.PI); const r = rnd(3.4, 4.2); // 360°: adelante, costados y atrás
      const x = Math.sin(ang) * r; const z = -Math.cos(ang) * r;
      if (this.blocked(x, z, a.pad + 0.5)) continue;
      if (this.groundMates(a).some((b) => Math.hypot(x - b.x, z - b.z) < 1.5)) continue;
      return { x, z, ang };
    }
    return { x: 3.5, z: 1, ang: 1.9 };
  }

  /* ---------------- Aparición ---------------- */

  appear(kind) {
    const a = this.animals[kind];
    if (!a || a.state !== 'away') return false;
    a.g.visible = true; a.feeding = false; a.t = 0; a.moved = 0; a.phase = 0;
    a.leaveAt = this.time + rnd(45, 75);
    a.restUntil = 0;
    if (a.ground) {
      const sp = this.pickSpawn(a);
      a.x = sp.x; a.z = sp.z; a.y = 0; a.spawn = { x: sp.x, z: sp.z };
      a.target = this.pickWander(a);
      a.state = 'walk';
    } else if (kind === 'bird') {
      a.ang = rnd(-Math.PI, Math.PI); a.rad = rnd(4, 4.6); a.h = rnd(2.2, 2.8);
      a.x = Math.sin(a.ang) * a.rad; a.z = -Math.cos(a.ang) * a.rad; a.y = a.h;
      a.state = 'orbit';
    } else {
      const ang = rnd(-Math.PI, Math.PI);
      a.x = Math.sin(ang) * 4; a.z = -Math.cos(ang) * 4; a.y = rnd(1.0, 1.6);
      a.home = { x: rnd(-1.0, 1.0), y: rnd(1.0, 1.4), z: rnd(-1.9, -1.2) };
      a.state = 'flutter';
    }
    this.place(a);
    return true;
  }

  place(a) { a.g.position.set(a.x, a.y || 0, a.z); }

  scheduleSpawns() {
    if (this.time < this.nextSpawnAt || this.visibleCount() >= MAX_VISIBLE) return;
    for (let i = 0; i < this.order.length; i++) {
      const k = this.order.shift(); this.order.push(k);
      if (this.animals[k].state === 'away') { this.appear(k); break; }
    }
    this.nextSpawnAt = this.time + rnd(7, 13);
  }

  /* ---------------- Manos y comida ---------------- */

  handInfo(dt) {
    const out = [];
    const list = (this.host.hands && this.host.hands()) || [];
    const seen = new Set();
    for (const h of list) {
      seen.add(h.id);
      let st = this.handState.get(h.id);
      if (!st) { st = { p: { ...h.p }, speed: 0, calm: 0, held: null }; this.handState.set(h.id, st); }
      const sp = dt > 0 ? Math.hypot(h.p.x - st.p.x, h.p.y - st.p.y, h.p.z - st.p.z) / dt : 0;
      st.speed = st.speed * 0.7 + sp * 0.3;
      st.p = { x: h.p.x, y: h.p.y, z: h.p.z };
      st.grasp = !!h.grasp;
      const eyeH = (this.host.eyeH && this.host.eyeH()) || 1.15;
      const raised = !h.grasp && h.p.y > eyeH * 0.55 && h.p.y < eyeH + 0.35 && Math.hypot(h.p.x, h.p.z) > 0.25 && Math.hypot(h.p.x, h.p.z) < 1.0;
      st.calm = raised && st.speed < 0.35 ? st.calm + dt : 0;
      st.id = h.id;
      out.push(st);
    }
    for (const id of [...this.handState.keys()]) {
      if (!seen.has(id)) { const st = this.handState.get(id); if (st.held) this.dropItem(st.held); this.handState.delete(id); }
    }
    return out;
  }

  updateItems(hands, dt) {
    const GRAB = 0.11;
    for (const st of hands) {
      if (!st.held) {
        if (st.grasp) {
          let best = null; let bd = GRAB;
          for (const it of this.items) {
            if (it.state === 'held' || it.state === 'eating') continue;
            const d = Math.hypot(it.mesh.position.x - st.p.x, it.mesh.position.y - st.p.y, it.mesh.position.z - st.p.z);
            if (d < bd) { bd = d; best = it; }
          }
          if (best) {
            if (this.plate === best) this.plate = null;
            best.state = 'held'; best.holder = st.id; st.held = best;
            if (this.host.haptic) this.host.haptic(25, 0.25);
            if (best.home && !best.replaced) { best.replaced = true; this.pendingRespawn = this.pendingRespawn || []; this.pendingRespawn.push({ key: best.spotKey, at: this.time + 1.0 }); }
          }
        }
      } else if (st.grasp) {
        st.held.mesh.position.set(st.p.x, st.p.y, st.p.z);
      } else {
        this.dropItem(st.held); st.held = null;
      }
    }
    // Reposición de provisiones (siempre hay más)
    if (this.pendingRespawn) {
      this.pendingRespawn = this.pendingRespawn.filter((p) => {
        if (this.time >= p.at) { this.spawnItem(p.key); return false; }
        return true;
      });
    }
    // Alimentos que vuelven solos a su lugar o se acomodan en el plato
    for (const it of this.items) {
      if (it.state === 'return') {
        const m = it.mesh.position;
        const k = Math.min(1, dt * 6);
        m.x += (it.target.x - m.x) * k; m.y += (it.target.y - m.y) * k; m.z += (it.target.z - m.z) * k;
        if (Math.hypot(it.target.x - m.x, it.target.y - m.y, it.target.z - m.z) < 0.004) {
          m.set(it.target.x, it.target.y, it.target.z);
          it.state = it.target.plate ? 'plate' : 'home';
        }
      }
    }
    this.items = this.items.filter((it) => {
      if (it.state === 'gone') { this.props.remove(it.mesh); return false; }
      return true;
    });
  }

  dropItem(it) {
    const t = this.table;
    const p = it.mesh.position;
    it.holder = null;
    const onPlate = t && Math.hypot(p.x - t.x, p.z - t.z) < 0.2 && Math.abs(p.y - t.plateY) < 0.28 && !this.plate;
    if (onPlate) {
      this.plate = it;
      it.state = 'return';
      it.target = { x: t.x, y: t.plateY + (it.kind === 'carrot' ? 0.02 : 0.012), z: t.z, plate: true };
      if (it.kind === 'carrot') it.mesh.rotation.z = Math.PI / 2;
      this.summon(FOOD_FOR[it.kind]);
    } else if (this.items.indexOf(it) >= 0) {
      // Fuera del plato: la comida se devuelve a su recipiente y se retira la copia de repuesto
      it.state = 'gone';
      if (it.replaced) { /* ya hay repuesto programado */ }
    }
  }

  summon(kind) {
    const a = this.animals[kind];
    if (!a) return;
    if (a.state === 'away') this.appear(kind);
    a.leaveAt = Math.max(a.leaveAt || 0, this.time + 25);
  }

  /* ---------------- Actualización ---------------- */

  update(dt) {
    if (!this.group.visible || !this.active) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const hands = this.handInfo(dt);
    this.updateItems(hands, dt);
    this.scheduleSpawns();
    // Si hay comida en el plato y su animal ya se fue, vuelve a aparecer a comérsela.
    if (this.plate && this.plate.state === 'plate' && this.time > (this.nextCall || 0)) {
      this.nextCall = this.time + 3;
      const who = this.animals[FOOD_FOR[this.plate.kind]];
      if (who && who.state === 'away') this.summon(who.kind);
    }
    for (const a of Object.values(this.animals)) {
      if (a.state === 'away') continue;
      if (a.kind === 'rabbit' || a.kind === 'squirrel') this.updateGround(a, dt);
      else if (a.kind === 'bird') this.updateBird(a, dt);
      else this.updateButterfly(a, dt, hands);
    }
  }

  wantsFood(a) {
    return !!(this.plate && this.plate.state === 'plate' && FOOD_FOR[this.plate.kind] === a.kind && !a.feeding);
  }

  // Punto de paso al frente de la mesa (por el lado de la especie), despejado de la mesa de provisiones y del paciente.
  stagePoint(a) {
    const t = this.table;
    const side = a.kind === 'rabbit' ? -1 : a.kind === 'squirrel' ? 1 : (a.x < t.x ? -1 : 1);
    return { x: side * 0.9, z: t.z - 1.0 };
  }

  approachPoint(a) {
    const t = this.table;
    // Cada especie tiene su lado fijo de la mesa (conejo a la izquierda, ardilla a la derecha), así nunca llegan al mismo punto.
    const side = a.kind === 'rabbit' ? -1 : a.kind === 'squirrel' ? 1 : (a.x < t.x ? -1 : 1);
    return { x: t.x + side * 0.38, z: t.z - 0.22, side };
  }

  updateGround(a, dt) {
    const t = this.table;
    a.t += dt;
    let moving = false;
    switch (a.state) {
      case 'walk': {
        const left = this.steer(a, a.target.x, a.target.z, a.speed, dt);
        moving = true;
        if (left < 0.12 || a.t > 14) { a.state = 'rest'; a.t = 0; a.restFor = rnd(1.5, 4); }
        break;
      }
      case 'rest':
        if (a.t > a.restFor) {
          if (this.time > a.leaveAt) { a.state = 'leave'; a.t = 0; } else { a.target = this.pickWander(a); a.state = 'walk'; a.t = 0; }
        }
        break;
      case 'leave': {
        const left = this.steer(a, a.spawn.x, a.spawn.z, a.speed * 1.2, dt);
        moving = true;
        if (left < 0.3 || a.t > 25) this.hide(a);
        break;
      }
      case 'toFeed': {
        const ap = a.ap;
        // Primero el punto de paso al frente de la mesa; después, su lugar junto al plato.
        const wp = a.route && a.route.length ? a.route[0] : ap;
        const finalLeg = !(a.route && a.route.length);
        // En el último tramo no empujan los campos de rechazo de lo que rodea a la mesa (paciente y mesas de provisiones).
        const skip = finalLeg ? new Set(this.obstacles.filter((o) => Math.hypot(o.x - this.table.x, o.z - this.table.z) < 1.0)) : null;
        const left = this.steer(a, wp.x, wp.z, a.speed * 1.3, dt, finalLeg ? this.tableObs : null, skip);
        moving = true;
        if (a.route && a.route.length) { if (left < 0.3) a.route.shift(); } else if (left < 0.08 || a.t > 25) { a.state = 'jumpUp'; a.t = 0; a.from = { x: a.x, z: a.z }; }
        break;
      }
      case 'jumpUp': {
        const k = clamp(a.t / 0.6, 0, 1);
        const to = { x: t.x + ap2(a).side * 0.12, z: t.z };
        a.x = a.from.x + (to.x - a.from.x) * k; a.z = a.from.z + (to.z - a.from.z) * k;
        a.y = t.h * k + Math.sin(k * Math.PI) * 0.16;
        a.g.rotation.y = Math.atan2(-(t.x - a.x), -(t.z - a.z));
        if (k >= 1) { a.state = 'eat'; a.t = 0; a.y = t.h; }
        break;
      }
      case 'eat': {
        const it = this.plate;
        a.y = t.h;
        a.g.rotation.y = Math.atan2(-(t.x - a.x), -(t.z - a.z));
        if (a.head) a.head.rotation.x = 0.5 + Math.sin(a.t * 9) * 0.2;
        if (it) { const s = clamp(1 - a.t / 3.2, 0.02, 1); it.mesh.scale.setScalar(s); }
        if (a.t > 3.2) {
          if (it) { it.state = 'gone'; this.plate = null; }
          if (a.head) a.head.rotation.x = 0;
          a.state = 'jumpDown'; a.t = 0; a.from = { x: a.x, z: a.z };
          if (this.host.haptic) this.host.haptic(15, 0.2);
        }
        break;
      }
      case 'jumpDown': {
        const k = clamp(a.t / 0.6, 0, 1);
        const to = a.ap;
        a.x = a.from.x + (to.x - a.from.x) * k; a.z = a.from.z + (to.z - a.from.z) * k;
        a.y = t.h * (1 - k) + Math.sin(k * Math.PI) * 0.12;
        if (k >= 1) { a.y = 0; a.feeding = false; a.state = 'rest'; a.t = 0; a.restFor = rnd(2, 4); a.leaveAt = Math.max(a.leaveAt, this.time + 12); }
        break;
      }
      default: break;
    }
    // ¿Hay comida esperándolo? (solo si está tranquilo, en el suelo)
    if ((a.state === 'rest' || a.state === 'walk') && this.wantsFood(a)) {
      a.feeding = true; a.ap = this.approachPoint(a); a.route = [this.stagePoint(a)]; a.state = 'toFeed'; a.t = 0;
    }
    // Animación de caminar/saltitos y gestos
    if (a.state === 'walk' || a.state === 'leave' || a.state === 'toFeed') {
      a.phase = (a.moved || 0) / a.hop.len;
      a.y = Math.abs(Math.sin(a.phase * Math.PI)) * a.hop.h;
    } else if (a.state === 'rest') {
      a.y = 0;
    }
    if (a.kind === 'rabbit') {
      const tw = a.state === 'rest' ? Math.sin(this.time * 9) * 0.08 : 0;
      a.earL.rotation.z = 0.12 + tw; a.earR.rotation.z = -0.12 - tw;
    } else {
      a.tail.rotation.z = Math.sin(this.time * 2.4) * 0.35;
      a.tail.rotation.x = Math.sin(this.time * 1.3) * 0.12;
      if (a.state === 'rest') a.head.rotation.y = Math.sin(this.time * 1.1 + a.leaveAt) * 0.6;
      else if (a.state !== 'eat') a.head.rotation.y = 0;
    }
    void moving;
    this.place(a);
  }

  updateBird(a, dt) {
    const t = this.table;
    a.t = (a.t || 0) + dt;
    const flap = (rate) => { const f = Math.sin(this.time * rate) * 0.7; a.wingL.rotation.z = f; a.wingR.rotation.z = -f; };
    if (a.state === 'orbit') {
      // Entra en espiral desde el borde y luego vuela en círculos alrededor del paciente
      a.rad += (1.9 - a.rad) * Math.min(1, dt * 0.35);
      a.h += (1.75 + Math.sin(this.time * 0.9) * 0.15 - a.h) * Math.min(1, dt * 0.6);
      a.ang += dt * 0.5;
      a.x = Math.sin(a.ang) * a.rad; a.z = -Math.cos(a.ang) * a.rad; a.y = a.h;
      a.g.rotation.y = Math.atan2(-Math.cos(a.ang), Math.sin(a.ang));
      flap(14);
      if (this.wantsFood(a)) { a.feeding = true; a.state = 'toFeed'; a.t = 0; }
      else if (this.time > a.leaveAt) { a.state = 'away_fly'; a.t = 0; }
    } else if (a.state === 'toFeed') {
      const tx = t.x + 0.12; const ty = t.plateY + 0.04; const tz = t.z;
      const d = Math.hypot(tx - a.x, ty - a.y, tz - a.z);
      const sp = Math.min(1.6 * dt, d);
      if (d > 1e-4) { a.x += ((tx - a.x) / d) * sp; a.y += ((ty - a.y) / d) * sp; a.z += ((tz - a.z) / d) * sp; }
      a.g.rotation.y = Math.atan2(-(tx - a.x), -(tz - a.z));
      flap(16);
      if (d < 0.03) { a.state = 'eat'; a.t = 0; }
    } else if (a.state === 'eat') {
      a.g.rotation.y = Math.atan2(-(t.x - a.x), -(t.z - a.z));
      a.wingL.rotation.z = 0; a.wingR.rotation.z = 0;
      a.g.rotation.x = Math.sin(a.t * 10) * 0.35; // picotea
      const it = this.plate;
      if (it) it.mesh.scale.setScalar(clamp(1 - a.t / 3, 0.02, 1));
      if (a.t > 3) {
        if (it) { it.state = 'gone'; this.plate = null; }
        a.g.rotation.x = 0; a.state = 'takeoff'; a.t = 0;
        a.ang = Math.atan2(a.x, -a.z); a.rad = Math.hypot(a.x, a.z); a.h = a.y;
        a.leaveAt = Math.max(a.leaveAt, this.time + 15);
      }
    } else if (a.state === 'takeoff') {
      a.rad += (1.9 - a.rad) * Math.min(1, dt * 1.2);
      a.h += (1.8 - a.h) * Math.min(1, dt * 1.5);
      a.x = Math.sin(a.ang) * a.rad; a.z = -Math.cos(a.ang) * a.rad; a.y = a.h;
      flap(16);
      if (Math.abs(a.h - 1.8) < 0.1 && Math.abs(a.rad - 1.9) < 0.1) { a.feeding = false; a.state = 'orbit'; }
    } else if (a.state === 'away_fly') {
      a.rad += dt * 1.3; a.h += dt * 0.35; a.ang += dt * 0.3;
      a.x = Math.sin(a.ang) * a.rad; a.z = -Math.cos(a.ang) * a.rad; a.y = a.h;
      a.g.rotation.y = Math.atan2(-Math.cos(a.ang), Math.sin(a.ang));
      flap(14);
      if (a.rad > 5) this.hide(a);
    }
    this.place(a);
  }

  airClear(a) {
    // Una criatura voladora baja no atraviesa farolas ni rocas: se sube por encima si pasa sobre una.
    for (const o of this.obstacles) {
      if (o.h >= 3 || o === this.tableObs) continue;
      if (Math.hypot(a.x - o.x, a.z - o.z) < o.r && a.y < o.h + 0.1) a.y = o.h + 0.1;
    }
  }

  updateButterfly(a, dt, hands) {
    a.t = (a.t || 0) + dt;
    const tm = this.time;
    const moveTo = (tx, ty, tz, speed) => {
      const d = Math.hypot(tx - a.x, ty - a.y, tz - a.z);
      const sp = Math.min(speed * dt, d);
      if (d > 1e-4) { a.x += ((tx - a.x) / d) * sp; a.y += ((ty - a.y) / d) * sp; a.z += ((tz - a.z) / d) * sp; }
      return d;
    };
    const flap = (rate) => { const f = Math.sin(tm * rate) * 0.9; a.wl.rotation.z = f; a.wr.rotation.z = -f; };

    if (a.state === 'flutter') {
      const hv = a.home;
      const tx = hv.x + Math.sin(tm * 0.8 + a.leaveAt) * 0.5; const ty = hv.y + Math.sin(tm * 1.7) * 0.15; const tz = hv.z + Math.cos(tm * 0.6) * 0.4;
      moveTo(tx, ty, tz, 0.8);
      a.g.rotation.y += (Math.atan2(-(tx - a.x), -(tz - a.z)) - a.g.rotation.y) * Math.min(1, dt * 3);
      flap(18);
      // ¿Hay una mano levantada y quieta? Se acerca a posarse en el dedo
      const calmHand = hands.find((h) => h.calm > 0.6 && !h.held);
      if (calmHand && !(a.cooldown > tm)) { a.state = 'toHand'; a.hand = calmHand.id; a.t = 0; }
      else if (tm > a.leaveAt) { a.state = 'leave'; a.t = 0; }
    } else if (a.state === 'toHand' || a.state === 'perched') {
      const h = hands.find((x) => x.id === a.hand);
      if (!h || h.speed > 1.0 || (a.state === 'toHand' && h.calm < 0.2) || a.t > 14 || h.grasp) {
        a.state = 'flutter'; a.cooldown = tm + 8; a.t = 0;
        a.home = { x: rnd(-1.0, 1.0), y: rnd(1.0, 1.4), z: rnd(-1.9, -1.2) };
      } else if (a.state === 'toHand') {
        const d = moveTo(h.p.x, h.p.y + 0.03, h.p.z, 1.1);
        flap(18);
        if (d < 0.03) { a.state = 'perched'; a.t = 0; if (this.host.haptic) this.host.haptic(20, 0.15); }
      } else {
        a.x = h.p.x; a.y = h.p.y + 0.03; a.z = h.p.z;
        flap(2.2); // alas lentas, posada
      }
    } else if (a.state === 'leave') {
      const ang = Math.atan2(a.x, -a.z);
      moveTo(Math.sin(ang) * 5, a.y + 0.6, -Math.cos(ang) * 5, 1.2);
      flap(18);
      if (Math.hypot(a.x, a.z) > 4.6) this.hide(a);
    }
    if (a.state !== 'perched' && a.state !== 'toHand') this.airClear(a);
    this.place(a);
  }
}

// Lado de la mesa por el que el animal subió (se calcula a partir de su punto de aproximación).
function ap2(a) { return { side: a.ap ? a.ap.side : 1 }; }
