// Lógica pura de "Calma en Movimiento" (sin Three.js ni WebXR). Se prueba con node: ver test.mjs
// Sigue el GDD MVP 1.0 y las guías de Fase 2 a 5 del proyecto.

export const ZONES = ['Hombro', 'Codo', 'Mano', 'Tronco', 'Cuello'];

// Radio de cada tamaño (m). La guía usa diámetros de 0,10 / 0,15 / 0,20 m.
export const SIZES = { small: 0.05, medium: 0.075, large: 0.10 };

// Valores iniciales "seguros" de la Fase 4. La permanencia (10 s) y el rango lateral (0,5 m)
// son valores medios/de la guía; el equipo debe confirmarlos.
export const DEFAULTS = {
  gameMode: 'apples', // apples | lights
  code: '',
  zone: 'Hombro',
  side: 'right', // right | left | both
  position: 'sitting', // sitting | standing
  minH: 0.8,
  maxH: 1.4,
  minD: 0.4,
  maxD: 0.9,
  lateral: 0.5,
  reps: 10,
  minutes: 3,
  size: 'medium',
  dwell: 10,
  feedback: 'both', // visual | sound | both
  ambient: true,
  limitReach: true,
};

// Mensajes neutros (Fase 5). Sin lenguaje competitivo ni punitivo.
export const MESSAGES = [
  'Toca las luces que aparezcan frente a ti.',
  'Buen trabajo.',
  'Sigamos explorando.',
  'Cada movimiento cuenta.',
  'Vamos a tu ritmo.',
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d);

export function normalizeConfig(raw = {}) {
  const c = { ...DEFAULTS, ...raw };
  c.gameMode = ['apples', 'lights'].includes(c.gameMode) ? c.gameMode : 'apples';
  c.code = String(c.code || '').replace(/[^\w\- ]/g, '').trim().slice(0, 20);
  if (!ZONES.includes(c.zone)) c.zone = DEFAULTS.zone;
  if (!['right', 'left', 'both'].includes(c.side)) c.side = DEFAULTS.side;
  if (!['sitting', 'standing'].includes(c.position)) c.position = DEFAULTS.position;
  c.reps = Math.round(clamp(num(c.reps, DEFAULTS.reps), 3, 50));
  c.minutes = Math.max(1, Math.min(30, num(c.minutes, DEFAULTS.minutes)));
  c.dwell = Math.round(clamp(num(c.dwell, DEFAULTS.dwell), 5, 60));
  if (!(c.size in SIZES)) c.size = DEFAULTS.size;
  if (!['visual', 'sound', 'both'].includes(c.feedback)) c.feedback = DEFAULTS.feedback;
  c.ambient = !!c.ambient;
  c.limitReach = !!c.limitReach;

  c.minH = clamp(num(c.minH, DEFAULTS.minH), 0.3, 2.0);
  c.maxH = clamp(num(c.maxH, DEFAULTS.maxH), 0.4, 2.2);
  if (c.maxH < c.minH + 0.1) c.maxH = Math.min(2.2, c.minH + 0.1);
  if (c.maxH < c.minH + 0.1) c.minH = c.maxH - 0.1;

  c.minD = clamp(num(c.minD, DEFAULTS.minD), 0.2, 1.2);
  c.maxD = clamp(num(c.maxD, DEFAULTS.maxD), 0.25, 1.3);
  if (c.maxD < c.minD + 0.05) c.maxD = Math.min(1.3, c.minD + 0.05);
  if (c.maxD < c.minD + 0.05) c.minD = c.maxD - 0.05;

  c.lateral = clamp(num(c.lateral, DEFAULTS.lateral), 0.1, 0.8);
  return c;
}

// Campos que la tablet del evaluador puede cambiar en el visor. Cualquier otro campo se ignora.
export const REMOTE_KEYS = ['gameMode', 'zone', 'side', 'position', 'minutes', 'reps', 'dwell', 'size', 'feedback', 'limitReach', 'ambient'];

// Mezcla la configuración actual del visor con la que manda la tablet y la normaliza.
export function mergeConfig(current, incoming) {
  const patch = {};
  if (incoming && typeof incoming === 'object') {
    for (const k of REMOTE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(incoming, k)) patch[k] = incoming[k];
    }
  }
  return normalizeConfig({ ...(current || {}), ...patch });
}

// Porcentaje de avance (0 a 100) por aciertos respecto de la meta de repeticiones.
export function progressPercent(hits, reps) {
  const h = Number(hits);
  const r = Number(reps);
  if (!Number.isFinite(h) || !Number.isFinite(r) || r <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((h / r) * 100)));
}

// Por qué terminó la parte de juego (se guarda en el registro para no tener que adivinar).
export const END_REASONS = {
  reps: 'Meta de repeticiones alcanzada',
  time: 'Se cumplió el tiempo programado',
  user: 'El usuario salió desde el visor',
  evaluator: 'Finalizada por el evaluador',
  removed: 'Visor retirado o sesión interrumpida',
};

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function horizontalDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Si el kinesiólogo activó "limitar al alcance cómodo", ningún objetivo queda más lejos
// de lo que el usuario marcó como cómodo al calibrar.
export function effectiveDistances(cfg, reach) {
  let maxD = cfg.maxD;
  let minD = cfg.minD;
  if (cfg.limitReach && reach) {
    // Regla de seguridad: ningún objetivo queda más lejos del alcance cómodo que marcó el usuario.
    maxD = Math.min(cfg.maxD, Math.max(0.25, reach));
    minD = Math.min(minD, maxD * 0.7);
  } else {
    // Sin límite por alcance, minD frontal no debe ser inferior a 0.40 m para evitar objetivos sobre el pecho
    minD = Math.max(0.40, minD);
    maxD = Math.max(minD + 0.10, maxD);
  }
  return { minD, maxD };
}

// Coordenadas locales: x lateral (+ derecha), y altura sobre el suelo, z hacia delante (negativa).
// El origen horizontal es la cabeza del usuario al calibrar.
// r = distancia horizontal cabeza-objetivo (el "alcance" de la guía).
export function pickTarget(cfg, dist, prev = null, rng = Math.random) {
  const eyeH = typeof cfg.eyeH === 'number' && cfg.eyeH > 0.5 ? cfg.eyeH : 1.15;
  // Altura clínica ergonómica frontal: entre mitad del pecho (eyeH - 0.22) y vista (eyeH + 0.10)
  const targetMinH = Math.max(0.75, eyeH - 0.22);
  const targetMaxH = Math.min(1.70, eyeH + 0.10);

  // Tope duro: la distancia horizontal nunca supera dist.maxD (alcance cómodo si está activado el límite).
  const cap = Math.max(0.25, dist.maxD || 0.75);
  const floor = cap < 0.42 ? cap * 0.8 : 0.42;
  const minD = Math.min(Math.max(floor, dist.minD || floor), cap);
  const maxD = cap;

  let best = null;
  for (let i = 0; i < 16; i++) {
    const r = minD + rng() * (maxD - minD);

    // Amplitud lateral controlada (cono frontal funcional antero-lateral de ~35° a cada lado)
    const maxLat = Math.min(0.35, r * 0.55);
    let lo = -maxLat;
    let hi = maxLat;
    if (cfg.side === 'right') {
      lo = -0.10 * maxLat; // mayoritariamente cuadrante antero-derecho
      hi = maxLat;
    } else if (cfg.side === 'left') {
      lo = -maxLat;
      hi = 0.10 * maxLat; // cuadrante antero-izquierdo
    }

    const l = lo + rng() * (hi - lo);
    const f = Math.sqrt(Math.max(0, r * r - l * l)); // así la distancia horizontal es exactamente r
    const y = targetMinH + rng() * (targetMaxH - targetMinH);

    const pos = { x: l, y, z: -f };
    best = { pos, reach: Math.hypot(l, f) };
    if (!prev || distance(pos, prev) >= 0.12) break;
  }
  return best;
}

export function formatTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/* ---------- Botones de los paneles en VR ---------- */

// Reparte botones en una cuadrícula dentro de area {x,y,w,h}. Devuelve [{id,label,x,y,w,h,...}].
export function layoutButtons(buttons, area, cols, gap = 14) {
  const n = buttons.length;
  if (!n) return [];
  const c = Math.min(cols || n, n);
  const rows = Math.ceil(n / c);
  const safeAreaW = Math.max(100, area.w || 100);
  const safeAreaH = Math.max(60, area.h || 60);
  const bw = Math.max(60, (safeAreaW - gap * (c - 1)) / c);
  const bh = Math.max(40, Math.min(110, (safeAreaH - gap * (rows - 1)) / rows));
  return buttons.map((b, i) => {
    const row = Math.floor(i / c);
    const inRow = row === rows - 1 ? n - row * c : c; // centra la última fila
    const col = i - row * c;
    const rowW = inRow * bw + (inRow - 1) * gap;
    const x0 = area.x + (safeAreaW - rowW) / 2;
    return { ...b, x: x0 + col * (bw + gap), y: area.y + row * (bh + gap), w: bw, h: bh };
  });
}

export function hitTestButtons(rects, x, y, pad = 12) {
  for (const r of rects) {
    if (x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad) return r.id;
  }
  return null;
}

/* ---------- Registro de sesión, CSV y resumen ---------- */

export function newRecord(cfg, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    uid: now.getTime() + '-' + Math.floor(Math.random() * 1e6),
    date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
    time: pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds()),
    code: cfg.code,
    zone: cfg.zone,
    side: cfg.side,
    position: cfg.position,
    gameMode: cfg.gameMode || 'apples',
    minutes: cfg.minutes,
    reps: cfg.reps,
    spawned: 0,
    hits: 0,
    activeSec: 0,
    avgReach: 0,
    maxReach: 0,
    comfortReach: null,
    pauses: 0,
    painBefore: null,
    painAfter: null,
    satisfaction: null,
    adverse: null,
    adverseDesc: '',
    endedEarly: false,
    endReason: '',
  };
}

const SIDE_ES = { right: 'Derecho', left: 'Izquierdo', both: 'Bilateral' };
const POS_ES = { sitting: 'Sentado', standing: 'De pie' };

export const CSV_COLUMNS = [
  'Fecha', 'Hora', 'Codigo', 'Zona', 'Lado', 'Posicion', 'ObjetivosGenerados', 'Aciertos', 'Duracion',
  'TiempoActivo', 'AlcancePromedio', 'AlcanceMaximo', 'AlcanceComodo', 'Pausas', 'DolorPre', 'DolorPost',
  'Satisfaccion', 'EfectoAdverso', 'DescripcionEfecto', 'FinalizadaAntes', 'MotivoFin',
];

function cell(v, decimals) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Si' : 'No';
  if (typeof v === 'number') return decimals !== undefined ? v.toFixed(decimals).replace('.', ',') : String(v);
  return String(v).replace(/[;\r\n]+/g, ' ');
}

export function recordToRow(r) {
  return [
    cell(r.date), cell(r.time), cell(r.code), cell(r.zone), cell(SIDE_ES[r.side] || r.side), cell(POS_ES[r.position] || r.position),
    cell(r.spawned), cell(r.hits), cell(r.minutes * 60, 1), cell(r.activeSec, 1),
    r.hits > 0 ? cell(r.avgReach, 2) : '', r.hits > 0 ? cell(r.maxReach, 2) : '', // sin aciertos no hay alcance: vacío, no 0
    r.comfortReach === null ? '' : cell(r.comfortReach, 2), cell(r.pauses), cell(r.painBefore), cell(r.painAfter),
    cell(r.satisfaction), r.adverse === null ? '' : cell(!!r.adverse), cell(r.adverseDesc), cell(!!r.endedEarly),
    cell(END_REASONS[r.endReason] || ''),
  ];
}

// Separador ";" y decimales con coma (Excel en español). BOM para que se vean las tildes.
export function buildCSV(records) {
  const lines = [CSV_COLUMNS.join(';')].concat(records.map((r) => recordToRow(r).join(';')));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function buildSummary(r) {
  const m = (v) => (v ? v.toFixed(2).replace('.', ',') + ' m' : '—');
  return [
    'Sesión Calma en Movimiento (prototipo web)',
    'Fecha: ' + r.date + ' ' + r.time + (r.code ? '   Código: ' + r.code : ''),
    'Zona: ' + r.zone + '   Lado: ' + (SIDE_ES[r.side] || r.side) + '   Posición: ' + (POS_ES[r.position] || r.position),
    'Duración programada: ' + r.minutes + ' min   Tiempo activo: ' + formatTime(r.activeSec),
    'Objetivos: ' + r.hits + ' alcanzados de ' + r.spawned + ' generados (programados ' + r.reps + ')',
    'Alcance cómodo medido: ' + m(r.comfortReach) + '   Alcance promedio: ' + m(r.avgReach) + '   Alcance máximo: ' + m(r.maxReach),
    'Pausas: ' + r.pauses,
    'Dolor (EVN 0-10) antes: ' + (r.painBefore === null ? 'no registrado' : r.painBefore) + '   después: ' + (r.painAfter === null ? 'no registrado' : r.painAfter),
    'Satisfacción (1-5): ' + (r.satisfaction === null ? 'no registrada' : r.satisfaction),
    'Malestar o efecto adverso: ' + (r.adverse === null ? 'no registrado' : r.adverse ? 'Sí. ' + (r.adverseDesc || '(sin descripción)') : 'No'),
    'Término: ' + (r.endedEarly ? 'finalizada antes del tiempo u objetivos programados' : 'completada') + (END_REASONS[r.endReason] ? ' (' + END_REASONS[r.endReason] + ')' : ''),
    '',
    'Completar en la ficha: tolerancia, observaciones funcionales y conducta posterior.',
  ].join('\n');
}
