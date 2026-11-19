// Ambiente más natural sin archivos pesados: texturas pintadas por el propio juego (pasto, corteza, hojas, piedra,
// agua, mimbre, pelaje), sombras suaves bajo los objetos, copas de árbol orgánicas y nubes.
// Todo es liviano para el Quest: texturas pequeñas y compartidas, y sombras "de contacto" (no sombras en tiempo real).

const cache = {};

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Generador pseudoaleatorio con semilla (las texturas salen siempre iguales)
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function shade(c, k) {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

function toTexture(T, canvas, repeatX = 1, repeatY = 1) {
  if (!canvas) return null;
  const t = new T.CanvasTexture(canvas);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------- Texturas ---------------- */

// Pasto: manchas suaves y pequeñas hojitas de distintos verdes
export function grassTexture(T, base = 0x80b878) {
  const key = 'grass' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(256, 256);
  if (c) {
    const g = c.getContext('2d'); const r = rng(7);
    g.fillStyle = hex(base); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { // manchas grandes y difusas
      const x = r() * 256; const y = r() * 256; const rad = 18 + r() * 40;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.5 ? 'rgba(255,255,220,0.10)' : 'rgba(20,60,20,0.10)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 2600; i++) { // hojitas
      const x = r() * 256; const y = r() * 256; const len = 2 + r() * 5; const a = -Math.PI / 2 + (r() - 0.5) * 0.9;
      g.strokeStyle = shade(base, 0.78 + r() * 0.45);
      g.globalAlpha = 0.55; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
    g.globalAlpha = 1;
  }
  return (cache[key] = toTexture(T, c, 34, 34));
}

// Corteza: vetas verticales irregulares
export function barkTexture(T, base = 0x6e5139) {
  const key = 'bark' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(128, 256);
  if (c) {
    const g = c.getContext('2d'); const r = rng(11);
    g.fillStyle = hex(base); g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) {
      let x = r() * 128; const w = 1 + r() * 3;
      g.strokeStyle = shade(base, 0.6 + r() * 0.6); g.lineWidth = w; g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) { x += (r() - 0.5) * 4; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  return (cache[key] = toTexture(T, c, 2, 1.5));
}

// Hojas: follaje con luces y sombras moteadas
export function leafTexture(T, base) {
  const key = 'leaf' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(256, 256);
  if (c) {
    const g = c.getContext('2d'); const r = rng(base % 997);
    g.fillStyle = hex(base); g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 520; i++) {
      const x = r() * 256; const y = r() * 256; const rad = 3 + r() * 9;
      g.fillStyle = shade(base, 0.72 + r() * 0.55); g.globalAlpha = 0.5;
      g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  return (cache[key] = toTexture(T, c, 2, 2));
}

// Piedra: moteado fino
export function stoneTexture(T, base = 0xc4cec6) {
  const key = 'stone' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(128, 128);
  if (c) {
    const g = c.getContext('2d'); const r = rng(5);
    g.fillStyle = hex(base); g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = shade(base, 0.75 + r() * 0.45); g.globalAlpha = 0.45;
      const s = 1 + r() * 2.5; g.fillRect(r() * 128, r() * 128, s, s);
    }
    g.globalAlpha = 1;
  }
  return (cache[key] = toTexture(T, c, 1, 1));
}

// Agua: degradé con ondas suaves
export function waterTexture(T, base = 0x62a49b) {
  const key = 'water' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(256, 128);
  if (c) {
    const g = c.getContext('2d'); const r = rng(3);
    g.fillStyle = hex(base); g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      const y = r() * 128; const x = r() * 256; const w = 20 + r() * 50;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
    }
  }
  return (cache[key] = toTexture(T, c, 3, 1));
}

// Mimbre tejido para los canastos
export function wickerTexture(T, base = 0xb58451) {
  const key = 'wicker' + base;
  if (cache[key] !== undefined) return cache[key];
  const c = makeCanvas(128, 128);
  if (c) {
    const g = c.getContext('2d');
    g.fillStyle = shade(base, 0.7); g.fillRect(0, 0, 128, 128);
    const s = 16;
    for (let y = 0; y < 128; y += s) {
      for (let x = 0; x < 128; x += s) {
        const horiz = ((x + y) / s) % 2 === 0;
        const grd = horiz ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
        grd.addColorStop(0, shade(base, 0.85)); grd.addColorStop(0.5, shade(base, 1.18)); grd.addColorStop(1, shade(base, 0.8));
        g.fillStyle = grd; g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }
  }
  return (cache[key] = toTexture(T, c, 4, 1.5));
}

// Pelaje/plumaje: textura muy sutil en tonos claros que se multiplica por el color de cada animal
export function furTexture(T) {
  if (cache.fur !== undefined) return cache.fur;
  const c = makeCanvas(128, 128);
  if (c) {
    const g = c.getContext('2d'); const r = rng(13);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const x = r() * 128; const y = r() * 128; const len = 2 + r() * 4; const a = Math.PI / 2 + (r() - 0.5) * 0.7;
      g.strokeStyle = `rgba(${200 + r() * 40},${195 + r() * 40},${190 + r() * 40},0.7)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
    }
  }
  return (cache.fur = toTexture(T, c, 2, 2));
}

/* ---------------- Sombras suaves ("de contacto") ---------------- */

function shadowTexture(T) {
  if (cache.shadow !== undefined) return cache.shadow;
  const c = makeCanvas(128, 128);
  if (c) {
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(20,35,20,0.55)');
    grd.addColorStop(0.55, 'rgba(20,35,20,0.25)');
    grd.addColorStop(1, 'rgba(20,35,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  }
  const t = c ? new T.CanvasTexture(c) : null;
  return (cache.shadow = t);
}

// Sombra difusa en el suelo, bajo un objeto (radio en metros; sx/sz para óvalos)
export function softShadow(T, radius, opacity = 0.6, sx = 1, sz = 1) {
  const m = new T.Mesh(
    new T.PlaneGeometry(radius * 2, radius * 2),
    new T.MeshBasicMaterial({ map: shadowTexture(T), color: 0xffffff, transparent: true, opacity, depthWrite: false, fog: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(sx, sz, 1);
  m.position.y = 0.006;
  m.renderOrder = -1;
  m.userData.shadow = true;
  return m;
}

/* ---------------- Formas orgánicas ---------------- */

// Esfera "esponjosa" (copa de árbol, roca): superficie con ondulaciones suaves, sin facetas
export function organicSphere(T, radius, material, { seed = 1, bump = 0.09, w = 32, h = 24 } = {}) {
  const geo = new T.SphereGeometry(radius, w, h);
  const p = geo.attributes.position;
  const s1 = seed * 1.7; const s2 = seed * 2.3; const s3 = seed * 0.9;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const nx = x / len; const ny = y / len; const nz = z / len;
    const n = Math.sin(nx * 4.1 + s1) * Math.cos(ny * 3.7 + s2) + 0.6 * Math.sin(nz * 5.3 + s3) * Math.sin(nx * 2.9 + ny * 3.1);
    const k = 1 + bump * n * 0.5;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return new T.Mesh(geo, material);
}

/* ---------------- Cielo ---------------- */

function cloudTexture(T) {
  if (cache.cloud !== undefined) return cache.cloud;
  const c = makeCanvas(256, 128);
  if (c) {
    const g = c.getContext('2d'); const r = rng(17);
    for (let i = 0; i < 26; i++) {
      const x = 40 + r() * 176; const y = 50 + r() * 40 - Math.abs(x - 128) * 0.15; const rad = 18 + r() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  return (cache.cloud = c ? new T.CanvasTexture(c) : null);
}

// Nubes suaves lejanas (no se mueven con la cabeza: están en el mundo)
export function addClouds(T, parent) {
  const tex = cloudTexture(T);
  const group = new T.Group();
  const spots = [[-40, 30, -70, 34], [10, 36, -80, 42], [48, 28, -60, 30], [-70, 26, -20, 28], [72, 32, -10, 32], [-20, 40, 60, 36], [40, 34, 70, 30]];
  spots.forEach(([x, y, z, s]) => {
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.5, 1);
    group.add(sp);
  });
  parent.add(group);
  return group;
}
