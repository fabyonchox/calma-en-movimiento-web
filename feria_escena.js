// Feria de juegos: escena 3D y manejo de manos/mandos. La física vive en feria_fisica.js.
import { FairWorld, fairLayout, CAN, COUNTER, BIN, ballRadius } from './feria_fisica.js';

const BALL_COLORS = [0xffd166, 0xef8fa3, 0x7fd8be, 0x8ec5f0];
const CAN_COLORS = [0x6fb7e0, 0xf2c14e, 0xe07a8a];
const GRAB_DIST = 0.10; // distancia mano-pelota para poder tomarla (m)

export class FairScene {
  // host: { controllers(), handLocal(c), grasping(c), haptic(ms, k), sound(kind), onThrow(info) -> punto, onCan(info), onResolved() }
  constructor(THREE, anchor, host) {
    this.T = THREE;
    this.host = host;
    this.group = new THREE.Group();
    this.group.visible = false;
    anchor.add(this.group);
    this.statics = new THREE.Group();
    this.dynamic = new THREE.Group();
    this.group.add(this.statics, this.dynamic);
    this.world = null;
    this.layout = null;
    this.holds = new Map(); // control -> pelota
    this.ballMeshes = new Map();
    this.canMeshes = [];
    this.ballMats = BALL_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.0 }));
    this.glowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 0.6, roughness: 0.5 });
    this._q = new THREE.Quaternion();
    this._ax = new THREE.Vector3();
  }

  setVisible(v) { this.group.visible = !!v; }

  // Calcula y dibuja la feria dentro del alcance cómodo. Devuelve false si el alcance no alcanza para armarla.
  configure(cfg, dist, eyeH) {
    const layout = fairLayout(cfg, dist, eyeH);
    this.layout = layout;
    this.cfg = cfg;
    this.clearMeshes();
    if (!layout.ok) { this.world = null; return false; }
    this.buildStatics(layout);
    this.world = new FairWorld(layout, cfg.size);
    this.holds.clear();
    this.sync();
    return true;
  }

  ready() { return !!this.world; }

  clearMeshes() {
    const dispose = (g) => {
      while (g.children.length) {
        const ch = g.children[0];
        g.remove(ch);
        if (ch.geometry && !ch.userData.sharedGeo) ch.geometry.dispose();
      }
    };
    dispose(this.statics);
    dispose(this.dynamic);
    this.ballMeshes.clear();
    this.canMeshes = [];
  }

  buildStatics(L) {
    const T = this.T;
    const box = (w, h, d, color, x, y, z) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshStandardMaterial({ color, roughness: 0.8 }));
      m.position.set(x, y, z);
      this.statics.add(m);
      return m;
    };
    const c = L.counter;
    // Mostrador: cuerpo de madera con franjas de colores suaves al frente
    box(c.w, c.top - 0.025, c.d, 0xc99a68, c.cx, (c.top - 0.025) / 2, c.cz);
    box(c.w + 0.03, 0.025, c.d + 0.03, 0xe8cfa6, c.cx, c.top - 0.0125, c.cz);
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      const w = c.w / stripes;
      box(w * 0.98, c.top * 0.55, 0.01, i % 2 ? 0xfff1d6 : 0xe88a7a, c.minX + w * (i + 0.5), c.top * 0.45, c.maxZ + 0.006);
    }
    // Panel trasero con franjas y banderines (decoración; queda detrás de los tarros)
    const backZ = c.minZ - 0.03;
    const panelH = 0.5;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const w = (c.w + 0.1) / n;
      box(w * 0.98, panelH, 0.015, i % 2 ? 0xfff1d6 : 0x9fd3c7, c.cx - (c.w + 0.1) / 2 + w * (i + 0.5), c.top + panelH / 2 + 0.02, backZ);
    }
    for (let i = 0; i < 7; i++) {
      const flag = new T.Mesh(new T.ConeGeometry(0.035, 0.07, 3), new T.MeshStandardMaterial({ color: [0xf2c14e, 0xe88a7a, 0x8ec5f0][i % 3], roughness: 0.7 }));
      flag.rotation.z = Math.PI;
      flag.position.set(c.cx - 0.27 + i * 0.09, c.top + panelH + 0.06, backZ + 0.01);
      this.statics.add(flag);
    }

    // Bandejas de pelotas (cajas bajas abiertas)
    for (const b of L.bins) {
      const wall = BIN.wall; const wh = BIN.wallH;
      box(BIN.w, 0.02, BIN.d, 0xb98557, b.x, b.top - 0.01, b.z);
      box(BIN.w, wh, wall, 0xa8744a, b.x, b.top + wh / 2, b.z - BIN.d / 2 + wall / 2);
      box(BIN.w, wh, wall, 0xa8744a, b.x, b.top + wh / 2, b.z + BIN.d / 2 - wall / 2);
      box(wall, wh, BIN.d, 0xa8744a, b.x - BIN.w / 2 + wall / 2, b.top + wh / 2, b.z);
      box(wall, wh, BIN.d, 0xa8744a, b.x + BIN.w / 2 - wall / 2, b.top + wh / 2, b.z);
      // Soporte bajo la bandeja
      box(BIN.w * 0.8, b.top - 0.02, BIN.d * 0.8, 0x9b6c46, b.x, (b.top - 0.02) / 2, b.z);
    }

    // Tarros
    this.canMeshes = L.cans.map((cn) => {
      const g = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(CAN.r, CAN.r, CAN.h, 20), new T.MeshStandardMaterial({ color: CAN_COLORS[cn.row % 3], roughness: 0.45, metalness: 0.25 }));
      const band = new T.Mesh(new T.CylinderGeometry(CAN.r * 1.01, CAN.r * 1.01, CAN.h * 0.28, 20), new T.MeshStandardMaterial({ color: 0xfff6e3, roughness: 0.5 }));
      const top = new T.Mesh(new T.CylinderGeometry(CAN.r * 0.86, CAN.r * 0.86, 0.006, 20), new T.MeshStandardMaterial({ color: 0xd9dde0, roughness: 0.3, metalness: 0.6 }));
      top.position.y = CAN.h / 2;
      g.add(body, band, top);
      g.position.set(cn.home.x, cn.home.y, cn.home.z);
      this.dynamic.add(g);
      return g;
    });
  }

  /* ----- ciclo de una sesión ----- */

  start() {
    if (!this.world) return;
    this.release_all(true);
    this.world.reset();
    this.sync();
  }

  holding() { return this.holds.size > 0; }

  // Al terminar: se suelta lo que haya en las manos, se recogen las pelotas y los tarros vuelven a su lugar.
  clear() {
    this.holds.clear();
    if (!this.world) return;
    const ev = this.world.clearField();
    ev.forEach((e) => { if (e.type === 'resolved') this.host.onResolved(e.ball); });
    this.sync();
  }

  release_all(silent) {
    this.holds.clear();
    return silent;
  }

  /* ----- cada fotograma de juego ----- */

  step(dt, now) {
    const w = this.world;
    if (!w) return;
    const ctrls = this.host.controllers();
    const T = now / 1000;

    // 1) Manos y mandos: tomar, sostener, soltar
    for (const c of ctrls) {
      const held = this.holds.get(c);
      const grasp = this.host.grasping(c);
      const p = this.host.handLocal(c);
      if (!held) {
        if (grasp) {
          const ball = w.nearestBinBall(p, GRAB_DIST);
          if (ball && w.grab(ball, c, p, T)) {
            this.holds.set(c, ball);
            this.host.haptic(30, 0.3);
          }
        }
      } else if (grasp) {
        w.hold(held, p, T);
      } else {
        this.doRelease(c, held, T);
      }
    }
    // Si un control deja de detectarse mientras sostiene una pelota, se suelta tal como va.
    for (const [c, ball] of [...this.holds.entries()]) {
      if (!ctrls.includes(c)) this.doRelease(c, ball, T);
    }

    // 2) Física
    const events = w.step(dt, T * 1000);
    for (const e of events) {
      if (e.type === 'can') {
        this.host.onCan({ reach: e.reach, can: e.can });
        this.host.sound('can');
        this.host.haptic(40, 0.4);
      } else if (e.type === 'resolved') {
        this.host.onResolved(e.ball);
      }
    }
    this.sync(ctrls);
  }

  doRelease(c, ball, T) {
    this.holds.delete(c);
    const info = this.world.release(ball, T);
    if (info.thrown) ball.point = this.host.onThrow(info);
    this.host.haptic(20, 0.2);
  }

  /* ----- dibujo ----- */

  sync(ctrls) {
    const w = this.world;
    if (!w) return;
    const T = this.T;
    // Tarros
    w.cans.forEach((c, i) => {
      const m = this.canMeshes[i];
      if (!m) return;
      m.position.set(c.p.x, c.p.y, c.p.z);
      if (c.state === 'standing') m.quaternion.identity();
      else { this._ax.set(c.axis.x, c.axis.y, c.axis.z); m.quaternion.setFromAxisAngle(this._ax, c.tilt); }
    });
    // Pelotas (se crean las que faltan y se retiran las que ya no existen)
    const seen = new Set();
    const handPts = ctrls ? ctrls.map((c) => this.host.handLocal(c)) : [];
    for (const b of w.balls) {
      seen.add(b.id);
      let m = this.ballMeshes.get(b.id);
      if (!m) {
        m = new T.Mesh(new T.SphereGeometry(1, 14, 10), this.ballMats[b.id % this.ballMats.length]);
        m.userData.sharedGeo = false;
        this.dynamic.add(m);
        this.ballMeshes.set(b.id, m);
      }
      let k = b.r;
      if (b.state === 'bin' && handPts.length) {
        // Aviso suave: la pelota que se puede tomar se agranda un poco
        for (const hp of handPts) {
          if (Math.hypot(b.p.x - hp.x, b.p.y - hp.y, b.p.z - hp.z) < GRAB_DIST) { k = b.r * 1.18; break; }
        }
      }
      m.scale.setScalar(k);
      m.position.set(b.p.x, b.p.y, b.p.z);
    }
    for (const [id, m] of [...this.ballMeshes.entries()]) {
      if (!seen.has(id)) { this.dynamic.remove(m); if (m.geometry) m.geometry.dispose(); this.ballMeshes.delete(id); }
    }
  }
}

export { fairLayout, ballRadius, COUNTER };
