// Feria de juegos: física simple de pelotas y tarros, SIN gráficos (se puede probar con node).
// Coordenadas locales del jardín: origen en el suelo bajo la cabeza del paciente, -z hacia adelante, y hacia arriba.
// Todo está en metros y segundos.

export const GRAVITY = 9.81;
// Filtro técnico contra saltos del seguimiento de manos (no es un valor clínico): ninguna pelota sale a más de esto.
export const MAX_THROW_SPEED = 8;
// Si la pelota se suelta casi sin velocidad sobre la bandeja, se considera que la devolvió (no es un lanzamiento).
export const RETURN_SPEED = 0.6;
// Velocidad mínima (perpendicular al tarro) para que un golpe lo derribe. Un roce suave no lo tumba.
export const KNOCK_SPEED = 0.3;

export const CAN = { r: 0.05, h: 0.12 };
export const COUNTER = { w: 0.6, d: 0.24 };
export const BIN = { w: 0.32, d: 0.32, wall: 0.02, wallH: 0.05 };
// Pelotas por bandeja: pila de 3x3 + 2x2 + 1.
export const BIN_BALLS = 14;
export const MAX_BALLS = 90;

const R_BY_SIZE = { small: 0.030, medium: 0.038, large: 0.048 };
export function ballRadius(size) { return R_BY_SIZE[size] || R_BY_SIZE.medium; }

const hyp = Math.hypot;

/* ---------- Distribución de la feria dentro del alcance cómodo ---------- */

// Devuelve dónde van el mostrador, los tarros y las bandejas.
// Regla de seguridad del proyecto: ningún tarro ni bandeja queda más lejos que el alcance cómodo calibrado.
export function fairLayout(cfg, dist, eyeH = 1.15) {
  const cap = Math.max(0.25, (dist && dist.maxD) || 0.75);
  const side = cfg.side === 'left' ? 'left' : cfg.side === 'right' ? 'right' : 'both';
  const top = Math.min(1.1, Math.max(0.72, eyeH * 0.68)); // altura del mostrador
  const cx = side === 'right' ? 0.06 : side === 'left' ? -0.06 : 0;

  const offsets = [
    { row: 0, x: -0.105 }, { row: 0, x: 0 }, { row: 0, x: 0.105 },
    { row: 1, x: -0.0525 }, { row: 1, x: 0.0525 },
    { row: 2, x: 0 },
  ];
  const farthest = (dz) => Math.max(...offsets.map((o) => hyp(cx + o.x, dz)));

  // Profundidad del mostrador: lo más lejos posible sin pasar el alcance cómodo.
  let dz = cap;
  while (dz > 0.05 && farthest(dz) > cap) dz -= 0.005;
  // Hay que dejar espacio delante del mostrador para las bandejas.
  const binFrontZ = 0.12 + BIN.d / 2; // borde trasero de la bandeja (distancia desde el paciente)
  const ok = dz - COUNTER.d / 2 >= binFrontZ + 0.005;

  const counter = {
    cx, cz: -dz, w: COUNTER.w, d: COUNTER.d, top,
    minX: cx - COUNTER.w / 2, maxX: cx + COUNTER.w / 2,
    minZ: -dz - COUNTER.d / 2, maxZ: -dz + COUNTER.d / 2,
  };

  const cans = offsets.map((o, i) => ({
    id: i, row: o.row,
    home: { x: cx + o.x, y: top + CAN.h / 2 + o.row * CAN.h, z: -dz },
    supports: o.row === 0 ? [] : o.row === 1 ? (o.x < 0 ? [0, 1] : [1, 2]) : [3, 4],
  }));

  const binX = Math.min(0.27, cap * 0.5);
  const bins = [];
  if (side === 'right' || side === 'both') bins.push({ side: 'right', x: binX, z: -0.12, top });
  if (side === 'left' || side === 'both') bins.push({ side: 'left', x: -binX, z: -0.12, top });

  return { ok, cap, side, top, counter, cans, bins, dz };
}

/* ---------- Velocidad de lanzamiento a partir del recorrido de la mano ---------- */

// trail: [{t (s), x, y, z}] ordenado en el tiempo. Se usa una ventana que termina un poco ANTES de soltar,
// porque al abrir los dedos la punta se mueve y ensucia la medición.
export function estimateVelocity(trail, now, opts = {}) {
  const endOffset = opts.endOffset ?? 0.05;
  const window = opts.window ?? 0.10;
  const tEnd = now - endOffset;
  const tStart = tEnd - window;
  const pts = trail.filter((s) => s.t >= tStart - 0.02 && s.t <= tEnd + 0.02);
  if (pts.length < 2) return { x: 0, y: 0, z: 0 };
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dt = b.t - a.t;
  if (dt < 0.03) return { x: 0, y: 0, z: 0 };
  const v = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt, z: (b.z - a.z) / dt };
  const sp = Math.hypot(v.x, v.y, v.z);
  if (sp > MAX_THROW_SPEED) {
    const k = MAX_THROW_SPEED / sp;
    v.x *= k; v.y *= k; v.z *= k;
  }
  return v;
}

/* ---------- Mundo de la feria ---------- */

export class FairWorld {
  constructor(layout, size = 'medium', rng = Math.random) {
    this.rng = rng;
    this.layout = layout;
    this.r = ballRadius(size);
    this.nextBallId = 1;
    this.reset();
  }

  reset() {
    this.balls = [];
    this.cans = this.layout.cans.map((c) => ({
      id: c.id, row: c.row, home: { ...c.home }, supports: c.supports,
      p: { ...c.home }, v: { x: 0, y: 0, z: 0 }, state: 'standing', tilt: 0, axis: { x: 1, y: 0, z: 0 },
      cause: null, counted: false, rearmAt: 0,
    }));
    this.bins = this.layout.bins.map((b) => ({ ...b, emptySince: null }));
    this.bins.forEach((b) => this.fillBin(b));
    this.allDownAt = null;
    this.events = [];
  }

  setBallSize(size) {
    this.r = ballRadius(size);
    this.balls.forEach((b) => { b.r = this.r; });
  }

  binSlots(bin) {
    const r = this.r;
    const sp = r * 2 + 0.004;
    const y0 = bin.top + r + 0.004;
    const slots = [];
    const grid = (n, y, off) => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        slots.push({ x: bin.x + (i - (n - 1) / 2) * sp + off, y, z: bin.z + (j - (n - 1) / 2) * sp + off });
      }
    };
    grid(3, y0, 0);
    grid(2, y0 + sp * 0.8, 0);
    slots.push({ x: bin.x, y: y0 + sp * 1.6, z: bin.z });
    return slots.slice(0, BIN_BALLS);
  }

  fillBin(bin) {
    const slots = this.binSlots(bin);
    slots.forEach((s, idx) => {
      this.balls.push({
        id: this.nextBallId++, r: this.r, p: { ...s }, v: { x: 0, y: 0, z: 0 },
        state: 'bin', bin: bin.side, slot: idx, holder: null, trail: [], thrown: false, resolved: false,
        releaseReach: 0, point: null, born: 0, age: 0, bounces: 0,
      });
    });
    bin.emptySince = null;
    this.trimBalls();
  }

  trimBalls() {
    if (this.balls.length <= MAX_BALLS) return;
    // Se recicla primero lo más antiguo que ya quedó quieto en el suelo.
    const resting = this.balls.filter((b) => b.state === 'rest');
    let excess = this.balls.length - MAX_BALLS;
    for (const b of resting) {
      if (excess <= 0) break;
      b.state = 'gone';
      excess--;
    }
    this.balls = this.balls.filter((b) => b.state !== 'gone');
  }

  ballsInBin(side) { return this.balls.filter((b) => b.state === 'bin' && b.bin === side); }

  // La pelota más alta de la pila cercana al punto (la que se ve más fácil de tomar).
  nearestBinBall(p, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const b of this.balls) {
      if (b.state !== 'bin') continue;
      const d = Math.hypot(b.p.x - p.x, b.p.y - p.y, b.p.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  grab(ball, holderId, p, now) {
    if (!ball || ball.state !== 'bin') return false;
    ball.state = 'held';
    ball.holder = holderId;
    ball.trail = [{ t: now, x: p.x, y: p.y, z: p.z }];
    ball.p = { x: p.x, y: p.y, z: p.z };
    return true;
  }

  // Mientras se sostiene: sigue a la mano y guarda el recorrido.
  hold(ball, p, now) {
    ball.p = { x: p.x, y: p.y, z: p.z };
    ball.trail.push({ t: now, x: p.x, y: p.y, z: p.z });
    while (ball.trail.length > 24 || (ball.trail.length > 2 && now - ball.trail[0].t > 0.4)) ball.trail.shift();
  }

  // Soltar: o la devuelve a la bandeja (sin contar lanzamiento) o sale lanzada.
  release(ball, now) {
    const v = estimateVelocity(ball.trail, now);
    const sp = Math.hypot(v.x, v.y, v.z);
    // ¿Sobre una bandeja y casi quieta? Se devuelve.
    for (const bin of this.bins) {
      const over = Math.abs(ball.p.x - bin.x) < BIN.w / 2 && Math.abs(ball.p.z - bin.z) < BIN.d / 2 && ball.p.y < bin.top + 0.25;
      if (over && sp < RETURN_SPEED) {
        ball.v = { x: 0, y: -0.3, z: 0 };
        ball.state = 'flying';
        ball.thrown = false;
        ball.holder = null;
        ball.returning = bin.side;
        return { thrown: false };
      }
    }
    ball.v = v;
    ball.state = 'flying';
    ball.thrown = true;
    ball.holder = null;
    ball.releaseReach = Math.hypot(ball.p.x, ball.p.z);
    ball.age = 0;
    return { thrown: true, reach: ball.releaseReach, speed: sp, pos: { ...ball.p } };
  }

  /* ----- paso de simulación ----- */

  step(dt, now) {
    this.events = [];
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, now);
    this.refill(now);
    this.rearm(now);
    return this.events;
  }

  sub(h, now) {
    // Pelotas
    for (const b of this.balls) {
      if (b.state !== 'flying') continue;
      b.age += h;
      b.v.y -= GRAVITY * h;
      b.p.x += b.v.x * h; b.p.y += b.v.y * h; b.p.z += b.v.z * h;
      this.ballVsCounter(b);
      this.ballVsBins(b);
      if (b.state !== 'flying') { b.onCounter = false; continue; } // ya volvió a la bandeja
      this.ballVsCans(b);
      if (b.p.y < b.r) { // suelo
        b.p.y = b.r;
        if (b.v.y < 0) { b.v.y = -b.v.y * 0.45; b.bounces++; }
        const f = Math.max(0, 1 - 2.2 * h);
        b.v.x *= f; b.v.z *= f;
        if (Math.abs(b.v.y) < 0.35) b.v.y = 0;
      }
      const sp = Math.hypot(b.v.x, b.v.y, b.v.z);
      const onSurface = b.p.y <= b.r + 0.002 || b.onCounter;
      if ((onSurface && sp < 0.08) || b.age > 8 || Math.abs(b.p.x) > 8 || b.p.z < -9 || b.p.z > 6) {
        b.v = { x: 0, y: 0, z: 0 };
        if (b.returning) { b.state = 'rest'; } else { b.state = 'rest'; }
        if (b.thrown && !b.resolved) { b.resolved = true; this.events.push({ type: 'resolved', ball: b }); }
      }
      b.onCounter = false;
    }
    // Tarros
    for (const c of this.cans) if (c.state === 'falling') this.stepCan(c, h);
    this.supportCheck();
  }

  ballVsCounter(b) {
    const c = this.layout.counter;
    // Caja: x en [minX,maxX], z en [minZ,maxZ], y de 0 a top.
    const qx = Math.min(Math.max(b.p.x, c.minX), c.maxX);
    const qy = Math.min(Math.max(b.p.y, 0), c.top);
    const qz = Math.min(Math.max(b.p.z, c.minZ), c.maxZ);
    let dx = b.p.x - qx; let dy = b.p.y - qy; let dz = b.p.z - qz;
    let d = Math.hypot(dx, dy, dz);
    if (d >= b.r) return;
    if (d < 1e-6) { dx = 0; dy = 1; dz = 0; d = 1; } // centro dentro de la caja: se empuja hacia arriba
    const nx = dx / d; const ny = dy / d; const nz = dz / d;
    b.p.x = qx + nx * b.r; b.p.y = qy + ny * b.r; b.p.z = qz + nz * b.r;
    const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
    if (vn < 0) {
      const e = 0.4;
      b.v.x -= (1 + e) * vn * nx; b.v.y -= (1 + e) * vn * ny; b.v.z -= (1 + e) * vn * nz;
      b.v.x *= 0.92; b.v.z *= 0.92;
    }
    if (ny > 0.7) b.onCounter = true;
  }

  ballVsBins(b) {
    // La bandeja es una caja baja abierta: la pelota que cae encima se queda sobre su fondo.
    for (const bin of this.bins) {
      const inX = Math.abs(b.p.x - bin.x) < BIN.w / 2;
      const inZ = Math.abs(b.p.z - bin.z) < BIN.d / 2;
      if (inX && inZ && b.p.y < bin.top + b.r && b.p.y > bin.top - 0.1 && b.v.y < 0) {
        b.p.y = bin.top + b.r;
        b.v.y = -b.v.y * 0.35;
        b.v.x *= 0.85; b.v.z *= 0.85;
        b.onCounter = true;
        // Una pelota devuelta se acomoda otra vez en la bandeja.
        if (b.returning === bin.side && Math.abs(b.v.y) < 0.3) {
          b.state = 'rest';
          b.returning = null;
          this.reseat(b, bin);
        }
      }
    }
  }

  reseat(b, bin) {
    const used = new Set(this.ballsInBin(bin.side).map((x) => x.slot));
    const slots = this.binSlots(bin);
    let idx = 0;
    while (idx < slots.length && used.has(idx)) idx++;
    if (idx >= slots.length) return; // bandeja llena: queda en reposo donde cayó
    b.state = 'bin'; b.bin = bin.side; b.slot = idx; b.p = { ...slots[idx] }; b.v = { x: 0, y: 0, z: 0 };
  }

  ballVsCans(b) {
    for (const c of this.cans) {
      if (c.state !== 'standing') continue;
      const dx = b.p.x - c.p.x; const dz = b.p.z - c.p.z;
      const dh = Math.hypot(dx, dz);
      const yb = c.p.y - CAN.h / 2; const yt = c.p.y + CAN.h / 2;
      if (b.p.y < yb - b.r || b.p.y > yt + b.r) continue;
      if (dh >= CAN.r + b.r) continue;
      const nx = dh > 1e-6 ? dx / dh : 0; const nz = dh > 1e-6 ? dz / dh : 1;
      const vn = -(b.v.x * nx + b.v.z * nz); // rapidez con la que se acerca al tarro
      // Se empuja la pelota fuera del tarro
      b.p.x = c.p.x + nx * (CAN.r + b.r); b.p.z = c.p.z + nz * (CAN.r + b.r);
      if (vn > KNOCK_SPEED) {
        const info = b.thrown ? { reach: b.releaseReach, point: b.point, ballId: b.id } : null;
        this.knock(c, { x: b.v.x * 0.55, y: 0.25 + Math.max(0, b.v.y) * 0.2, z: b.v.z * 0.55 }, info);
        // La pelota pierde energía y rebota
        const e = 0.3;
        const vnr = b.v.x * nx + b.v.z * nz;
        b.v.x -= (1 + e) * vnr * nx; b.v.z -= (1 + e) * vnr * nz;
        b.v.x *= 0.6; b.v.z *= 0.6;
      } else if (vn > 0) {
        const vnr = b.v.x * nx + b.v.z * nz;
        b.v.x -= 1.3 * vnr * nx; b.v.z -= 1.3 * vnr * nz;
      }
    }
  }

  // info: { reach, point, ballId } de la pelota que originó la caída (o de la cadena de tarros), o null.
  knock(can, v, info) {
    if (can.state !== 'standing') return;
    can.state = 'falling';
    can.v = { x: v.x, y: v.y, z: v.z };
    const sp = Math.hypot(v.x, v.z);
    // Eje de giro horizontal perpendicular al movimiento: el tarro cae "de lado".
    can.axis = sp > 1e-4 ? { x: v.z / sp, y: 0, z: -v.x / sp } : { x: 1, y: 0, z: 0 };
    can.tilt = 0;
    if (info) can.cause = info;
    if (!can.counted) {
      can.counted = true;
      if (can.cause && can.cause.point) can.cause.point.hit = true;
      this.events.push({
        type: 'can', can,
        reach: can.cause ? can.cause.reach : Math.hypot(can.home.x, can.home.z),
        ballId: can.cause ? can.cause.ballId : null,
      });
    }
  }

  stepCan(c, h) {
    const L = this.layout.counter;
    c.v.y -= GRAVITY * h;
    c.p.x += c.v.x * h; c.p.y += c.v.y * h; c.p.z += c.v.z * h;
    c.tilt = Math.min(Math.PI / 2, c.tilt + 7 * h);
    const lying = c.tilt / (Math.PI / 2);
    const rest = (surface) => surface + CAN.h / 2 + (CAN.r - CAN.h / 2) * lying;
    const onCounter = c.p.x > L.minX - CAN.r * 0.5 && c.p.x < L.maxX + CAN.r * 0.5 && c.p.z > L.minZ - CAN.r * 0.5 && c.p.z < L.maxZ + CAN.r * 0.5
      && c.p.y > L.top - 0.05;
    const surface = onCounter ? L.top : 0;
    const yRest = rest(surface);
    if (c.p.y <= yRest) {
      c.p.y = yRest;
      if (c.v.y < 0) c.v.y = -c.v.y * 0.25;
      if (Math.abs(c.v.y) < 0.3) c.v.y = 0;
      const f = Math.max(0, 1 - 4 * h);
      c.v.x *= f; c.v.z *= f;
    }
    // Choque con otros tarros que siguen en pie: los arrastra
    for (const o of this.cans) {
      if (o === c || o.state !== 'standing') continue;
      if (Math.abs(o.p.y - c.p.y) < CAN.h * 0.9 && Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z) < CAN.r * 1.9) {
        this.knock(o, { x: c.v.x * 0.6, y: 0.1, z: c.v.z * 0.6 }, c.cause);
      }
    }
    const sp = Math.hypot(c.v.x, c.v.y, c.v.z);
    if (c.tilt >= Math.PI / 2 && sp < 0.06 && c.p.y <= yRest + 1e-3) {
      c.state = 'down'; c.v = { x: 0, y: 0, z: 0 };
    }
  }

  // Un tarro de arriba cae si ya no queda en pie ninguno de los que lo sostienen.
  supportCheck() {
    for (const c of this.cans) {
      if (c.state !== 'standing' || c.row === 0) continue;
      const alive = c.supports.some((id) => this.cans[id].state === 'standing');
      if (!alive) {
        const base = this.cans[c.supports[0]];
        const dir = c.p.x - base.p.x >= 0 ? 1 : -1;
        this.knock(c, { x: dir * 0.15, y: 0, z: 0.1 }, base.cause);
      }
    }
  }

  // Bandeja vacía: se vuelve a llenar poco después. Pila de tarros caída: se rearma.
  refill(now) {
    for (const bin of this.bins) {
      const inBin = this.ballsInBin(bin.side).length;
      const heldFrom = this.balls.some((b) => b.state === 'held');
      const flyingBack = this.balls.some((b) => b.returning === bin.side && b.state === 'flying');
      if (inBin === 0 && !heldFrom && !flyingBack) {
        if (bin.emptySince === null) bin.emptySince = now;
        else if (now - bin.emptySince > 1200) { this.fillBin(bin); this.events.push({ type: 'refill', side: bin.side }); }
      } else {
        bin.emptySince = null;
      }
    }
  }

  rearm(now) {
    const allDown = this.cans.every((c) => c.state === 'down');
    const noneStanding = this.cans.every((c) => c.state !== 'standing');
    if (allDown || (noneStanding && this.cans.every((c) => c.state !== 'falling'))) {
      if (this.allDownAt === null) this.allDownAt = now;
      else if (now - this.allDownAt > 1600) { this.standCans(); this.events.push({ type: 'rearm' }); }
    } else {
      this.allDownAt = null;
    }
  }

  standCans() {
    this.cans.forEach((c) => {
      c.p = { ...c.home }; c.v = { x: 0, y: 0, z: 0 }; c.state = 'standing'; c.tilt = 0; c.cause = null; c.counted = false;
    });
    this.allDownAt = null;
  }

  // Al terminar: se limpia la zona.
  clearField() {
    const pending = this.balls.filter((b) => b.thrown && !b.resolved);
    pending.forEach((b) => { b.resolved = true; this.events.push({ type: 'resolved', ball: b }); });
    const ev = this.events;
    this.reset();
    return ev;
  }

  anyBallMoving() { return this.balls.some((b) => b.state === 'flying'); }
  canMoving() { return this.cans.some((c) => c.state === 'falling'); }
}
