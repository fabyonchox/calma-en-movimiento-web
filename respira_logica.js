// "Respira": reglas puras (sin gráficos) del modo de relajación. Se prueban con node (pruebas/test_respira.mjs).
//
// IMPORTANTE: los patrones de respiración y los rangos de giro de cabeza son OPCIONES DE DISEÑO que elige el
// terapeuta en la tablet. No son recomendaciones clínicas: el equipo debe definir cuáles usar con cada paciente.

// Patrones: lista de tramos { name, secs }. name: 'inhale' | 'hold' | 'exhale' | 'holdOut'
export const BREATH_PATTERNS = {
  '4-6': { label: 'Inhalar 4 s · exhalar 6 s', steps: [{ name: 'inhale', secs: 4 }, { name: 'exhale', secs: 6 }] },
  '5-5': { label: 'Inhalar 5 s · exhalar 5 s', steps: [{ name: 'inhale', secs: 5 }, { name: 'exhale', secs: 5 }] },
  '4-2-6': { label: 'Inhalar 4 s · sostener 2 s · exhalar 6 s', steps: [{ name: 'inhale', secs: 4 }, { name: 'hold', secs: 2 }, { name: 'exhale', secs: 6 }] },
  'caja': { label: 'Caja: inhalar 4 · sostener 4 · exhalar 4 · sostener 4', steps: [{ name: 'inhale', secs: 4 }, { name: 'hold', secs: 4 }, { name: 'exhale', secs: 4 }, { name: 'holdOut', secs: 4 }] },
};
export const DEFAULT_PATTERN = '4-6';

// Giro de cabeza máximo (grados a cada lado) para los pajaritos. Valores de diseño, a confirmar por el equipo.
export const NECK_RANGES = {
  suave: { label: 'Suave (hasta 20° a cada lado)', deg: 20 },
  medio: { label: 'Medio (hasta 35° a cada lado)', deg: 35 },
  amplio: { label: 'Amplio (hasta 50° a cada lado)', deg: 50 },
};
export const DEFAULT_NECK = 'suave';

// Contenido de la sesión: solo estrella, solo pajaritos, o ambos (primero la estrella).
export const BREATH_CONTENT = ['ambos', 'estrella', 'pajaros'];

// Margen técnico de la mirada: la cabeza apunta al pajarito si está a 8° o menos
export const GAZE_TOLERANCE_DEG = 8;

export const WORDS = { inhale: 'Inhala', hold: 'Sostén', exhale: 'Exhala', holdOut: 'Pausa' };

export function patternOf(key) { return BREATH_PATTERNS[key] || BREATH_PATTERNS[DEFAULT_PATTERN]; }
export function cycleSecs(key) { return patternOf(key).steps.reduce((a, s) => a + s.secs, 0); }

// En qué tramo de la respiración se está a los `t` segundos de comenzar.
// Devuelve { name, progress (0..1 dentro del tramo), cycle (n.º de ciclos completos), size (0..1 tamaño de la estrella) }
export function breathAt(t, key) {
  const p = patternOf(key);
  const total = cycleSecs(key);
  const tt = Math.max(0, t);
  const cycle = Math.floor(tt / total);
  let r = tt - cycle * total;
  for (const s of p.steps) {
    if (r < s.secs) {
      const progress = r / s.secs;
      return { name: s.name, progress, cycle, size: sizeFor(s.name, progress), remaining: s.secs - r };
    }
    r -= s.secs;
  }
  const last = p.steps[p.steps.length - 1];
  return { name: last.name, progress: 1, cycle, size: sizeFor(last.name, 1), remaining: 0 };
}

// Suavizado (sube y baja sin tirones)
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

function sizeFor(name, progress) {
  if (name === 'inhale') return ease(progress);
  if (name === 'hold') return 1;
  if (name === 'exhale') return 1 - ease(progress);
  return 0; // holdOut
}

// Cuánto dura cada parte de la sesión (segundos). Con "ambos", la estrella ocupa ~60 % y los pajaritos el resto,
// redondeando la estrella a ciclos completos para que nunca se corte una respiración a la mitad.
export function plan(totalSecs, content, key) {
  const c = BREATH_CONTENT.includes(content) ? content : 'ambos';
  if (c === 'estrella') return { star: totalSecs, birds: 0 };
  if (c === 'pajaros') return { star: 0, birds: totalSecs };
  const cyc = cycleSecs(key);
  const cycles = Math.max(1, Math.round((totalSecs * 0.6) / cyc));
  const star = Math.min(totalSecs, cycles * cyc);
  return { star, birds: Math.max(0, totalSecs - star) };
}

// Ángulos (grados; negativo = izquierda) donde aparecen los pajaritos: alternan de lado, nunca más allá del rango,
// y empiezan cerca del centro para que el giro aumente poco a poco.
export function perchAngles(rangeKey, n, rng = Math.random) {
  const max = (NECK_RANGES[rangeKey] || NECK_RANGES[DEFAULT_NECK]).deg;
  const out = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const ramp = Math.min(1, 0.45 + i * 0.15); // los primeros, más cerca del centro
    // Nunca tan al centro que no haga falta girar (mínimo: el margen de la mirada + 4°), ni más allá del rango.
    const minA = Math.min(max, GAZE_TOLERANCE_DEG + 4);
    const a = Math.max(minA, max * ramp * (0.75 + 0.25 * rng()));
    out.push(side * Math.min(max, a));
  }
  return out;
}

// ¿La cabeza apunta al pajarito? (técnico: margen de 8° alrededor del punto)
export function looking(yawDeg, targetDeg, tol = GAZE_TOLERANCE_DEG) {
  return Math.abs(yawDeg - targetDeg) <= tol;
}

/* ---------------- Vuelo de los pajaritos (se siguen con la mirada) ---------------- */

// Margen técnico para "seguir" a un pajarito en movimiento (algo más amplio que para un punto quieto)
export const FOLLOW_TOLERANCE_DEG = 12;
// Tiempo acumulado siguiéndolo con la mirada para que se detenga a saludar (técnico, a confirmar en el Quest)
export const FOLLOW_NEED_MS = 3000;

// Recorrido suave de ida y vuelta, de lado a lado: nunca sale del rango de giro elegido.
// t en segundos desde que el pajarito empezó a volar; idx cambia el ritmo y el lado de partida de cada pajarito.
export function birdPath(t, rangeKey, idx = 0) {
  const max = (NECK_RANGES[rangeKey] || NECK_RANGES[DEFAULT_NECK]).deg;
  const amp = max * 0.85;
  // Movimiento lento: la cabeza nunca necesita girar más rápido que ~15°/s (técnico, a confirmar en el Quest).
  // Ida y vuelta completa en al menos 11 s; con rangos amplios, más lenta.
  const period = Math.max(11, (2 * Math.PI * amp) / 15) + (idx % 3) * 1.5;
  const dir = idx % 2 === 0 ? 1 : -1;
  const yawDeg = dir * amp * Math.sin((2 * Math.PI * t) / period);
  const yOff = 0.07 * Math.sin((4 * Math.PI * t) / period + idx); // sube y baja un poco
  return { yawDeg, yOff, max };
}

// Estrella que vuela: lejos al exhalar, cerca al inhalar, flotando de lado a lado.
// size: 0..1 (de breathAt). Devuelve la posición relativa (metros) frente al paciente.
export const STAR_NEAR = 1.35; // técnico: distancia más cercana (al terminar de inhalar)
export const STAR_FAR = 3.2; // técnico: distancia más lejana (al terminar de exhalar)
export function starPose(size, t) {
  const dist = STAR_FAR - (STAR_FAR - STAR_NEAR) * size;
  const sway = 0.35 * (1 - size) + 0.1; // lejos se pasea más; cerca, casi quieta frente al paciente
  return {
    x: sway * Math.sin(t * 0.32),
    y: 0.05 + 0.35 * (1 - size) * Math.max(0, Math.sin(t * 0.21 + 1)) + 0.04 * Math.sin(t * 0.9),
    z: -dist,
  };
}
