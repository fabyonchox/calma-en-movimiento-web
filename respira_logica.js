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
  // Patrones agregados en 0.11 (ver "Protocolo Respira 360"): sin retener el aire.
  'inicial': { label: 'Inicial: inhalar 3 s · exhalar 4 s', steps: [{ name: 'inhale', secs: 3 }, { name: 'exhale', secs: 4 }] },
  // Suspiro cíclico (Balban et al., 2023). El estudio no fija segundos: estos tiempos son una adaptación técnica.
  'suspiro': { label: 'Suspiro cíclico: inhalar 2 s · un poquito más 1 s · exhalar 6 s', steps: [{ name: 'inhale', secs: 2, to: 0.8 }, { name: 'inhale2', secs: 1, from: 0.8 }, { name: 'exhale', secs: 6 }] },
};
// Patrones que retienen el aire: opción avanzada (pueden no ser adecuados en pacientes cardíacos o respiratorios).
export const HOLD_PATTERNS = ['4-2-6', 'caja'];
export function patternHolds(key) { return HOLD_PATTERNS.includes(key); }
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

export const WORDS = { inhale: 'Inhala', inhale2: 'Un poquito más', hold: 'Sostén', exhale: 'Exhala', holdOut: 'Pausa' };

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
      return { name: s.name, progress, cycle, size: sizeFor(s, progress), remaining: s.secs - r };
    }
    r -= s.secs;
  }
  const last = p.steps[p.steps.length - 1];
  return { name: last.name, progress: 1, cycle, size: sizeFor(last, 1), remaining: 0 };
}

// Suavizado (sube y baja sin tirones)
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));

function sizeFor(step, progress) {
  const name = step.name;
  if (name === 'inhale' || name === 'inhale2') { const a = step.from || 0; const b = step.to ?? 1; return a + (b - a) * ease(progress); }
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

// Margen técnico para "seguir" a un pajarito en movimiento (más amplio que para un punto quieto; se amplió en 0.10.6
// porque en el Quest costaba llenar el anillo). Además se acepta mirar donde estaba el pajarito hace un instante,
// porque una persona sigue un objeto en movimiento con un pequeño retraso.
export const FOLLOW_TOLERANCE_DEG = 15;
export const FOLLOW_LAG_SECS = 0.6;
// Para que cuente, la cabeza debe estar girada (al menos 6°) o moviéndose (al menos 3°/s): mirar fijo al frente no llena el anillo.
export const FOLLOW_MIN_TURN_DEG = 6;
export const FOLLOW_MIN_SPEED_DEG = 3;

// ¿Está siguiendo al pajarito? headYaw: hacia dónde apunta la cabeza; birdYaw / lagYaw: dónde está el pajarito
// ahora y hace un instante (vistos desde la cabeza); headSpeed: rapidez de giro de la cabeza (°/s).
export function followCredit(headYaw, birdYaw, lagYaw, headSpeed) {
  const near = looking(headYaw, birdYaw, FOLLOW_TOLERANCE_DEG) || looking(headYaw, lagYaw, FOLLOW_TOLERANCE_DEG);
  const engaged = Math.abs(headYaw) >= FOLLOW_MIN_TURN_DEG || headSpeed >= FOLLOW_MIN_SPEED_DEG;
  return { near, credit: near && engaged };
}

// Lo que dice el pajarito al saludar. Se barajan al empezar y no se repiten hasta haber usado todas.
// Frases cortas (se leen de un vistazo), amables y sin exigir nada al paciente.
export const BIRD_GREETINGS = [
  '¡Hola! ¿Cómo estás?', '¡Gracias por acompañarme!', '¡Qué rico volar contigo!', '¡Hola! ¡Qué lindo día!',
  '¡Me encanta tu compañía!', '¡Pío pío! ¡Hola!', '¡Qué bien me seguiste!', '¡Respira tranquilo!',
  '¡Hoy el cielo está precioso!', '¡Volemos juntos otra vez!', '¡Qué calma se siente aquí!', '¡Hola, amigo!',
  '¡Me alegra verte!', '¡Qué suave es el viento!', '¡Tú lo haces muy bien!', '¡Escucha el canto del bosque!',
  '¡Gracias por mirarme!', '¡Qué bonito día para volar!', '¡Sigue a tu ritmo!', '¡Te traje una canción!',
  '¡Hola! Vengo del árbol grande', '¡Aquí todo está en calma!', '¡Qué gusto saludarte!', '¡Un respiro y seguimos!',
];

// Orden barajado de los saludos (Fisher-Yates). rng opcional para pruebas.
export function greetingOrder(rng = Math.random) {
  const a = BIRD_GREETINGS.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
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

/* ---------------- Respira 360: sesión en un paisaje 360° (ver documento "Protocolo Respira 360") ---------------- */

export const LANDSCAPES = {
  // Cielos 360° (Poly Haven, CC0; versión "puresky": solo cielo, sin suelo): calma y pocos distractores
  amanecer: { label: 'Amanecer sereno', sound: 'olas' },
  nubes: { label: 'Cielo con nubes', sound: 'viento' },
  atardecer: { label: 'Tarde despejada', sound: 'olas' },
  noche: { label: 'Noche estrellada', sound: 'noche' },
  // Paisajes (por ahora pintados por el juego, hasta tener sus fotos)
  playa: { label: 'Playa al amanecer', sound: 'olas' },
  cascada: { label: 'Río y cascada', sound: 'agua' },
  pradera: { label: 'Pradera', sound: 'pradera' },
  bosque: { label: 'Bosque', sound: 'bosque' },
};
export const DEFAULT_LANDSCAPE = 'amanecer';
export const GUIDED_MINUTES = [3, 5, 8, 10];
// Tiempos de llegada, vuelta a la calma y cierre (práctica habitual, no dato de estudio; a confirmar por el equipo)
export const SETTLE_SECS = 60;
export const BACK_SECS = 60;
export const CLOSE_SECS = 20;

// Reparto de la sesión: llegada · respiración guiada (ciclos completos) · vuelta a la calma · cierre.
export function landscapePlan(guidedMin, settleOn, key) {
  const cyc = cycleSecs(key);
  const want = Math.max(1, guidedMin || 5) * 60;
  const guided = Math.max(1, Math.round(want / cyc)) * cyc; // nunca corta una respiración a la mitad
  const settle = settleOn ? SETTLE_SECS : 0;
  const back = settleOn ? BACK_SECS : 0;
  return { settle, guided, back, close: CLOSE_SECS, total: settle + guided + back + CLOSE_SECS, cycles: Math.round(guided / cyc) };
}

// En qué fase está la sesión a los t segundos: 'llegada' | 'guiada' | 'vuelta' | 'cierre' | 'fin'
export function landscapePhaseAt(t, p) {
  if (t < p.settle) return { name: 'llegada', t, left: p.settle - t };
  let r = t - p.settle;
  if (r < p.guided) return { name: 'guiada', t: r, left: p.guided - r };
  r -= p.guided;
  if (r < p.back) return { name: 'vuelta', t: r, left: p.back - r };
  r -= p.back;
  if (r < p.close) return { name: 'cierre', t: r, left: p.close - r };
  return { name: 'fin', t: r, left: 0 };
}
