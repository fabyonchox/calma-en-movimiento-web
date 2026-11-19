// "Viaje por el espacio" para la etapa de la estrella de Respira.
// Mientras el paciente respira con la estrella, el jardín se desvanece y aparece el espacio: nebulosa de colores
// suaves, cielo lleno de estrellas, planetas que flotan lejos, una galaxia en remolino y polvo de estrellas que
// pasa lento (da la sensación de ir viajando, sin moverse de verdad).
//
// Seguridad (valores técnicos, a confirmar en el Quest):
// - Nada se acerca rápido: el polvo avanza a ~0,25 m/s y nunca pasa por la cara (deja libre un túnel frente a la cabeza).
// - Todo gira muy lento (la galaxia ~1°/s, los planetas aún menos).
// - Bajo los pies queda un círculo de luz: un "suelo" de referencia para no sentirse flotando en el vacío.
// Todo se dibuja con texturas pintadas por el juego (sin archivos, funciona sin internet).

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function tex(T, canvas, opts = {}) {
  if (!canvas) return null;
  const t = new T.CanvasTexture(canvas);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  if (opts.wrap) { t.wrapS = T.RepeatWrapping; }
  return t;
}

// Cielo de fondo: degradé azul noche → violeta, con nubes de nebulosa muy suaves y estrellas finas pintadas
function nebulaTexture(T) {
  const c = makeCanvas(1024, 512); if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(77);
  const bg = g.createLinearGradient(0, 0, 0, c.height);
  bg.addColorStop(0, '#0c1030'); bg.addColorStop(0.45, '#161a46'); bg.addColorStop(0.6, '#1d1a4a'); bg.addColorStop(1, '#0a0c22');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  // Nubes de nebulosa: muchas manchas grandes y transparentes (violeta, azul, rosa suave)
  const cols = ['120,90,200', '70,120,210', '200,110,170', '90,170,200', '160,120,220'];
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 80; i++) {
    const x = R() * c.width; const y = c.height * (0.15 + R() * 0.7); const r = 40 + R() * 170;
    const col = cols[Math.floor(R() * cols.length)];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${col},${0.025 + R() * 0.045})`); grd.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grd;
    // repetir en el borde para que no se note la costura
    [x, x - c.width, x + c.width].forEach((xx) => { g.beginPath(); g.ellipse(xx, y, r * 1.6, r, 0, 0, Math.PI * 2); g.fill(); });
  }
  g.globalCompositeOperation = 'source-over';
  return tex(T, c, { wrap: true });
}

// Brillo redondo suave (para estrellas y polvo)
function dotTexture(T) {
  const c = makeCanvas(64, 64); if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(T, c);
}

// Planeta: bandas suaves (gaseoso) o manchas (rocoso), colores pastel
function planetTexture(T, kind, seed) {
  const c = makeCanvas(256, 128); if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(seed);
  const pal = {
    gas: ['#e8c9a0', '#d9a77c', '#f2dcc0', '#c99a78', '#ecd2b0'],
    ice: ['#a9d4ea', '#8cc0e0', '#c8e6f2', '#9fcbe3', '#b7dcee'],
    rose: ['#e6a8b4', '#d48fa0', '#f0c4cc', '#c98494', '#e9b6c0'],
    mint: ['#a8dcc4', '#8ccab0', '#c4ead8', '#98d2b8', '#b6e2cc'],
  }[kind];
  g.fillStyle = pal[0]; g.fillRect(0, 0, 256, 128);
  if (kind === 'gas' || kind === 'ice') {
    for (let y = 0; y < 128; y += 2) {
      const k = Math.sin(y * 0.18 + R() * 0.6) * 0.5 + 0.5;
      g.fillStyle = pal[1 + Math.floor(k * 3.99)];
      g.globalAlpha = 0.35 + R() * 0.25;
      g.fillRect(0, y, 256, 2 + R() * 3);
    }
  } else {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = pal[1 + Math.floor(R() * 4)]; g.globalAlpha = 0.25 + R() * 0.3;
      const x = R() * 256; const y = 10 + R() * 108; const r = 4 + R() * 18;
      g.beginPath(); g.ellipse(x, y, r * 1.5, r, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.globalAlpha = 1;
  return tex(T, c, { wrap: true });
}

// Galaxia en remolino (brazos espirales de puntitos con núcleo cálido)
function galaxyTexture(T) {
  const c = makeCanvas(512, 512); if (!c) return null;
  const g = c.getContext('2d');
  const R = rng(9);
  g.translate(256, 256);
  g.globalCompositeOperation = 'lighter';
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 120);
  core.addColorStop(0, 'rgba(255,236,200,0.95)'); core.addColorStop(0.25, 'rgba(255,200,170,0.35)'); core.addColorStop(1, 'rgba(160,120,255,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 9000; i++) {
    const arm = i % 4; const u = Math.pow(R(), 0.7);
    const r = 14 + u * 236;
    const th = arm * (Math.PI / 2) + u * 5.2 + (R() - 0.5) * (0.5 + u * 0.6);
    const x = Math.cos(th) * r; const y = Math.sin(th) * r;
    const warm = 1 - u;
    const a = (0.08 + 0.3 * (1 - u)) * (0.5 + R() * 0.5);
    g.fillStyle = `rgba(${Math.round(170 + 85 * warm)},${Math.round(170 + 60 * warm)},255,${a})`;
    g.fillRect(x, y, R() < 0.92 ? 1.4 : 2.6, R() < 0.92 ? 1.4 : 2.6);
  }
  const fade = g.createRadialGradient(0, 0, 180, 0, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade; g.fillRect(-256, -256, 512, 512);
  return tex(T, c);
}

// Círculo de luz bajo los pies
function padTexture(T) {
  const c = makeCanvas(256, 256); if (!c) return null;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(190,200,255,0.55)'); grd.addColorStop(0.55, 'rgba(150,160,240,0.25)'); grd.addColorStop(0.85, 'rgba(200,190,255,0.45)'); grd.addColorStop(1, 'rgba(150,150,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return tex(T, c);
}

export class SpaceScene {
  constructor(T, parent) {
    this.T = T;
    this.group = new T.Group();
    this.group.visible = false;
    parent.add(this.group);
    this.amount = 0;
    this.t = 0;
    this.mats = []; // [material, opacidad completa]
    this.build();
  }

  addMat(m, full) { m.transparent = true; m.fog = false; m.depthWrite = false; this.mats.push([m, full]); m.opacity = 0; return m; }

  build() {
    const T = this.T;
    const dot = dotTexture(T);

    // Fondo: esfera grande con la nebulosa (por fuera del cielo del jardín, que se desvanece encima)
    this.dome = new T.Mesh(new T.SphereGeometry(105, 48, 24), this.addMat(new T.MeshBasicMaterial({ map: nebulaTexture(T), side: T.BackSide }), 1));
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    // Estrellas brillantes (dos capas: blancas-azuladas y cálidas)
    const R = rng(5);
    [[1800, 0.3, 0xdfe8ff], [600, 0.5, 0xffe6c4], [140, 0.95, 0xfff4e0]].forEach(([n, size, color]) => {
      const p = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2; const el = Math.asin(R() * 2 - 1); const r = 80 + R() * 20;
        p[i * 3] = Math.cos(el) * Math.sin(a) * r; p[i * 3 + 1] = Math.sin(el) * r; p[i * 3 + 2] = -Math.cos(el) * Math.cos(a) * r;
      }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(p, 3));
      const pts = new T.Points(geo, this.addMat(new T.PointsMaterial({ size, map: dot, color, blending: T.AdditiveBlending, sizeAttenuation: true }), 0.95));
      this.group.add(pts);
    });

    // Galaxia en remolino, lejos y un poco inclinada, girando muy lento
    this.galaxy = new T.Mesh(new T.PlaneGeometry(46, 46), this.addMat(new T.MeshBasicMaterial({ map: galaxyTexture(T), blending: T.AdditiveBlending, side: T.DoubleSide }), 0.9));
    this.galaxyPivot = new T.Group();
    this.galaxyPivot.position.set(-14, 22, -72);
    this.galaxyPivot.lookAt(0, 1.2, 0);
    this.galaxyPivot.rotateX(-0.9);
    this.galaxyPivot.add(this.galaxy);
    this.group.add(this.galaxyPivot);

    // Luz propia del espacio para los planetas (como un sol lejano)
    this.light = new T.DirectionalLight(0xfff1dd, 0);
    this.light.position.set(30, 20, 10);
    this.group.add(this.light);
    this.group.add(this.light.target);

    // Planetas: lejos, en distintas direcciones (algunos se descubren al girar la cabeza), tamaño aparente moderado
    this.planets = [];
    const defs = [
      { kind: 'gas', r: 4.2, pos: [26, 10, -40], ring: true, spin: 0.02, seed: 11 },
      { kind: 'ice', r: 2.2, pos: [-20, 5, -30], spin: 0.03, seed: 23 },
      { kind: 'rose', r: 1.3, pos: [-7, 1.0, -18], spin: 0.04, seed: 37 },
      { kind: 'mint', r: 3, pos: [-34, 14, 16], spin: 0.025, seed: 51 },
      { kind: 'gas', r: 2.6, pos: [30, 6, 20], spin: 0.02, seed: 63 },
    ];
    defs.forEach((d) => {
      const pivot = new T.Group();
      pivot.position.set(...d.pos);
      const mat = this.addMat(new T.MeshStandardMaterial({ map: planetTexture(T, d.kind, d.seed), roughness: 1, metalness: 0, emissive: 0x3a3358, emissiveIntensity: 0.7 }), 1);
      mat.depthWrite = true;
      const ball = new T.Mesh(new T.SphereGeometry(d.r, 40, 28), mat);
      ball.rotation.z = 0.3;
      pivot.add(ball);
      // halo de atmósfera
      const atm = new T.Sprite(this.addMat(new T.SpriteMaterial({ map: dot, color: d.kind === 'ice' ? 0x9fd0ff : d.kind === 'rose' ? 0xffb3c6 : d.kind === 'mint' ? 0xaaffdd : 0xffd9a8, blending: T.AdditiveBlending }), 0.35));
      atm.scale.setScalar(d.r * 3.2);
      pivot.add(atm);
      if (d.ring) {
        const ringMat = this.addMat(new T.MeshBasicMaterial({ color: 0xf0dcc0, side: T.DoubleSide }), 0.45);
        const ring = new T.Mesh(new T.RingGeometry(d.r * 1.4, d.r * 2.2, 96), ringMat);
        ring.rotation.x = Math.PI / 2 - 0.35; ring.rotation.y = 0.2;
        pivot.add(ring);
      }
      this.group.add(pivot);
      this.planets.push({ pivot, ball, spin: d.spin, base: d.pos.slice(), ph: d.seed });
    });

    // Polvo de estrellas que pasa lento hacia el paciente (sensación suave de ir viajando)
    this.dustN = 260;
    this.dust = [];
    const dp = new Float32Array(this.dustN * 3);
    const dc = new Float32Array(this.dustN * 3);
    for (let i = 0; i < this.dustN; i++) { this.dust.push(this.spawnDust(R, true)); }
    const dg = new T.BufferGeometry();
    dg.setAttribute('position', new T.BufferAttribute(dp, 3));
    dg.setAttribute('color', new T.BufferAttribute(dc, 3));
    this.dustGeo = dg;
    this.dustR = R;
    this.dustPts = new T.Points(dg, this.addMat(new T.PointsMaterial({ size: 0.06, map: dot, vertexColors: true, blending: T.AdditiveBlending }), 0.9));
    this.group.add(this.dustPts);

    // Círculo de luz bajo los pies (referencia de "suelo")
    this.pad = new T.Mesh(new T.CircleGeometry(1.1, 64), this.addMat(new T.MeshBasicMaterial({ map: padTexture(T), blending: T.AdditiveBlending }), 0.8));
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.y = 0.02;
    this.group.add(this.pad);
  }

  // Nuevo granito de polvo: lejos al frente, nunca en el "túnel" frente a la cara
  spawnDust(R, anywhere) {
    let x = (R() - 0.5) * 14;
    const y = 0.2 + R() * 4.5;
    if (Math.abs(x) < 1.2 && y > 0.4 && y < 2.2) x = (x < 0 ? -1 : 1) * (1.2 + R() * 2);
    return { x, y, z: anywhere ? -24 + R() * 25 : -24 - R() * 3, w: 0.5 + R() * 0.5 };
  }

  // k: 0 (sin espacio) .. 1 (espacio completo)
  setAmount(k) {
    this.amount = k;
    this.group.visible = k > 0.002;
    this.mats.forEach(([m, full]) => { m.opacity = full * k; });
    this.light.intensity = 1.3 * k;
  }

  // breathSize 0..1: el polvo pasa un poquito más lento al exhalar (más calma)
  step(dt, breathSize = 0.5) {
    if (!this.group.visible) return;
    this.t += dt;
    this.galaxy.rotation.z += dt * 0.017; // ~1°/s
    this.planets.forEach((p) => {
      p.ball.rotation.y += dt * p.spin;
      p.pivot.position.y = p.base[1] + Math.sin(this.t * 0.05 + p.ph) * 0.6; // flotan muy lento
    });
    const speed = 0.18 + 0.1 * breathSize; // técnico: lento, para no marear
    const a = this.dustGeo.attributes.position.array;
    const c = this.dustGeo.attributes.color.array;
    for (let i = 0; i < this.dustN; i++) {
      const d = this.dust[i];
      d.z += speed * dt;
      if (d.z > 1.5) this.dust[i] = this.spawnDust(this.dustR, false);
      const q = this.dust[i];
      a[i * 3] = q.x; a[i * 3 + 1] = q.y; a[i * 3 + 2] = q.z;
      // aparece de a poco a lo lejos y se apaga antes de llegar
      const f = Math.min(1, (q.z + 24) / 6) * Math.min(1, (1.5 - q.z) / 3) * q.w;
      c[i * 3] = 0.85 * f; c[i * 3 + 1] = 0.88 * f; c[i * 3 + 2] = f;
    }
    this.dustGeo.attributes.position.needsUpdate = true;
    this.dustGeo.attributes.color.needsUpdate = true;
  }
}
