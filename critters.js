// Animalitos del jardín para la pantalla de espera: conejo, ardilla, pájaro y mariposa.
// Solo adornan el jardín mientras el paciente espera (las preguntas y menús los maneja el terapeuta en su pantalla).
// Coordenadas locales del jardín: origen en el suelo bajo la cabeza del paciente, -z hacia adelante.

export class Critters {
  constructor(THREE, parent) {
    this.T = THREE;
    this.group = new THREE.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.t = 0;

    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const sph = (r, color, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(color));
      m.scale.set(sx, sy, sz);
      return m;
    };
    const box = (w, h, d, color) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    const cone = (r, h, color) => new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), mat(color));

    // ----- Conejo -----
    const rabbit = new THREE.Group();
    const rBody = sph(0.11, 0xf2ece4, 1, 0.9, 1.35); rBody.position.set(0, 0.11, 0);
    const rHead = sph(0.07, 0xf2ece4); rHead.position.set(0, 0.2, -0.13);
    const earL = sph(0.022, 0xf6d9d9, 1, 4.2, 0.6); earL.position.set(-0.035, 0.31, -0.12);
    const earR = sph(0.022, 0xf6d9d9, 1, 4.2, 0.6); earR.position.set(0.035, 0.31, -0.12);
    const rTail = sph(0.04, 0xffffff); rTail.position.set(0, 0.14, 0.16);
    const rEyeL = sph(0.011, 0x2b2b2b); rEyeL.position.set(-0.04, 0.215, -0.185);
    const rEyeR = sph(0.011, 0x2b2b2b); rEyeR.position.set(0.04, 0.215, -0.185);
    const rNose = sph(0.012, 0xe58fa0); rNose.position.set(0, 0.195, -0.2);
    rabbit.add(rBody, rHead, earL, earR, rTail, rEyeL, rEyeR, rNose);
    rabbit.position.set(-1.0, 0, -1.9);
    this.rabbit = { g: rabbit, earL, earR, head: rHead, cx: -1.0, cz: -1.9 };

    // ----- Ardilla sobre un tocón -----
    const squirrel = new THREE.Group();
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.32, 14), mat(0x8a6a4a));
    stump.position.y = 0.16;
    const stumpTop = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 14), mat(0xc9a26b));
    stumpTop.position.y = 0.33;
    const sBody = sph(0.075, 0xc8702f, 1, 1.35, 1); sBody.position.set(0, 0.46, 0);
    const sHead = new THREE.Group();
    const sHeadMesh = sph(0.055, 0xd9843c); sHead.add(sHeadMesh);
    const sEarL = cone(0.016, 0.04, 0xc8702f); sEarL.position.set(-0.032, 0.055, 0);
    const sEarR = cone(0.016, 0.04, 0xc8702f); sEarR.position.set(0.032, 0.055, 0);
    const sEyeL = sph(0.009, 0x222222); sEyeL.position.set(-0.025, 0.012, -0.048);
    const sEyeR = sph(0.009, 0x222222); sEyeR.position.set(0.025, 0.012, -0.048);
    const sNose = sph(0.009, 0x333333); sNose.position.set(0, -0.012, -0.056);
    sHead.add(sEarL, sEarR, sEyeL, sEyeR, sNose);
    sHead.position.set(0, 0.58, -0.02);
    const sBelly = sph(0.05, 0xf3dcc0, 0.9, 1.2, 0.6); sBelly.position.set(0, 0.45, -0.05);
    const tail = new THREE.Group();
    const tailMesh = sph(0.075, 0xb85f25, 0.8, 1.9, 0.8); tailMesh.position.set(0, 0.14, 0);
    tail.add(tailMesh);
    tail.position.set(0, 0.4, 0.07);
    squirrel.add(stump, stumpTop, sBody, sBelly, sHead, tail);
    squirrel.position.set(1.0, 0, -2.0);
    squirrel.rotation.y = 0.5;
    this.squirrel = { g: squirrel, head: sHead, tail };

    // ----- Pájaro volando en círculos -----
    const bird = new THREE.Group();
    const bBody = sph(0.05, 0x4f8fd6, 1, 0.9, 1.5);
    const bHead = sph(0.035, 0x6aa6e6); bHead.position.set(0, 0.025, -0.07);
    const beak = cone(0.012, 0.035, 0xf2a93b); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.02, -0.11);
    const bTail = box(0.04, 0.008, 0.07, 0x356aa8); bTail.position.set(0, 0.005, 0.1);
    const wingL = new THREE.Group(); const wl = box(0.13, 0.008, 0.06, 0x3f7bc4); wl.position.x = -0.065; wingL.add(wl);
    const wingR = new THREE.Group(); const wr = box(0.13, 0.008, 0.06, 0x3f7bc4); wr.position.x = 0.065; wingR.add(wr);
    wingL.position.set(-0.03, 0.02, 0); wingR.position.set(0.03, 0.02, 0);
    bird.add(bBody, bHead, beak, bTail, wingL, wingR);
    this.bird = { g: bird, wingL, wingR };

    // ----- Mariposa -----
    const bf = new THREE.Group();
    const bfBody = box(0.008, 0.008, 0.05, 0x3a2f2f);
    const bfL = new THREE.Group(); const bl = box(0.05, 0.004, 0.04, 0xf5a742); bl.position.x = -0.025; bfL.add(bl);
    const bfR = new THREE.Group(); const br = box(0.05, 0.004, 0.04, 0xf5a742); br.position.x = 0.025; bfR.add(br);
    bf.add(bfBody, bfL, bfR);
    this.butterfly = { g: bf, wl: bfL, wr: bfR };

    this.group.add(rabbit, squirrel, bird, bf);
  }

  setVisible(v) { this.group.visible = !!v; }

  // dt en segundos. Solo anima si está visible (no gasta nada mientras se juega).
  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const t = this.t;

    // Conejo: ciclo de 5 s: 2.4 s saltando en un círculo pequeño, el resto sentado moviendo orejas
    {
      const r = this.rabbit;
      const ph = t % 5;
      const hopping = ph < 2.4;
      const ang = Math.floor(t / 5) * 1.3 + (hopping ? ph * 0.5 : 2.4 * 0.5);
      const x = r.cx + Math.cos(ang) * 0.35;
      const z = r.cz + Math.sin(ang) * 0.25;
      r.g.position.set(x, hopping ? Math.abs(Math.sin(ph * Math.PI * 2.2)) * 0.1 : 0, z);
      r.g.rotation.y = -ang - Math.PI / 2 + 0.3;
      const twitch = hopping ? 0 : Math.sin(t * 9) * 0.08;
      r.earL.rotation.z = 0.12 + twitch;
      r.earR.rotation.z = -0.12 - twitch;
      r.head.position.y = 0.2 + (hopping ? 0 : Math.sin(t * 6) * 0.004);
    }

    // Ardilla: mueve la cola y mira a los lados
    {
      const s = this.squirrel;
      s.tail.rotation.z = Math.sin(t * 2.2) * 0.35;
      s.tail.rotation.x = Math.sin(t * 1.3) * 0.12;
      s.head.rotation.y = Math.sin(t * 0.9) * 0.6;
      s.head.rotation.x = Math.sin(t * 1.7) * 0.08;
    }

    // Pájaro: vuela en círculo al frente, aleteando
    {
      const b = this.bird;
      const a = t * 0.55;
      const cx = 0.2; const cz = -2.3; const rad = 1.0;
      b.g.position.set(cx + Math.cos(a) * rad, 1.65 + Math.sin(t * 1.6) * 0.12, cz + Math.sin(a) * rad * 0.6);
      b.g.rotation.y = -a;
      const flap = Math.sin(t * 14) * 0.7;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = -flap;
    }

    // Mariposa: revolotea cerca, del lado del conejo
    {
      const m = this.butterfly;
      const a = t * 0.9;
      m.g.position.set(-0.5 + Math.sin(a) * 0.5 + Math.sin(a * 2.3) * 0.1, 0.9 + Math.sin(a * 1.7) * 0.18, -1.5 + Math.cos(a * 0.8) * 0.4);
      m.g.rotation.y = a * 0.8;
      const f = Math.sin(t * 18) * 0.9;
      m.wl.rotation.z = f;
      m.wr.rotation.z = -f;
    }
  }
}
