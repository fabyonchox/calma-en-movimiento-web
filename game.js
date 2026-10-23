import * as THREE from './libs/three.module.min.js';
import { FairScene } from './feria_escena.js';
import {
  DEFAULTS, ZONES, SIZES, MESSAGES, normalizeConfig, mergeConfig, REMOTE_KEYS, effectiveDistances, pickTarget,
  horizontalDistance, distance, formatTime, newRecord, buildCSV, buildSummary,
} from './logic.js';
import { VRPanel } from './vrui.js';
import { HeadsetSyncClient } from './sync-client.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'cem_sessions_v1';
const CFG_KEY = 'cem_config_v1';
const SETTLE_MS = 1200;
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
const f2 = (n) => n.toFixed(2);
const ORB_COLORS = [0xfff3a0, 0xa0e3ff, 0xa8f0cf]; // amarillo claro, celeste, verde menta

let renderer, scene, camera, anchor, menuPanel, hudPanel, orb, popRing, session, audioCtx, ambient;
let fairScene = null; // escenario Feria de juegos
let treeGroup, basketGroup, targetAppleGroup, harvestedApplesGroup, basketRimGlow;
const baskets = []; // canasto izquierdo y derecho

let syncClient = null;
let lastMetricsBroadcast = 0;
let lastBroadcastedPhase = null;

function broadcastState() {
  if (!syncClient) return;
  const pm = phaseModel();
  syncClient.sendState(S.phase, pm.model, S.cfg ? S.cfg.gameMode : 'apples');
}

// Configuración activa en el visor (solo los campos que la tablet puede cambiar).
function activeConfig() {
  const out = {};
  if (S.cfg) REMOTE_KEYS.forEach((k) => { out[k] = S.cfg[k]; });
  return out;
}

// Qué manos ve el visor en este momento (para que el evaluador sepa si la mano de trabajo está detectada).
function handsSeen() {
  const seen = { left: false, right: false };
  for (const c of controllers) {
    const side = ctrlSide(c);
    const active = !!((c.hand && c.hand.visible) || (c.grip && c.grip.visible));
    if (active && (side === 'left' || side === 'right')) seen[side] = true;
  }
  return seen;
}

function broadcastMetrics() {
  if (!syncClient) return;
  syncClient.sendMetrics({
    phase: S.phase,
    sessionEnded: S.phase === 'idle' && S.ended,
    endReason: S.endReason || '',
    config: activeConfig(),
    handsSeen: handsSeen(),
    inVR: !!session,
    resolved: S.resolved,
    hits: S.hits,
    spawned: S.spawned,
    reps: S.cfg ? S.cfg.reps : DEFAULTS.reps,
    minutes: S.cfg ? S.cfg.minutes : DEFAULTS.minutes,
    activeSec: S.activeMs / 1000,
    maxReach: S.maxReach,
    avgReach: S.hits ? S.reachSum / S.hits : 0,
    painBefore: S.rec ? S.rec.painBefore : null,
    painAfter: S.rec ? S.rec.painAfter : null,
    satisfaction: S.rec ? S.rec.satisfaction : null,
    pauses: S.pauses,
    adverse: S.rec ? S.rec.adverse : null,
  });
}

let fireflies = null;
let sparkPoints = null;
const SPARK_COUNT = 16;
const sparkVel = [];
let initialized = false;
let last = performance.now();
const controllers = [];
const hands = [];
const raycaster = new THREE.Raycaster();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

const S = {
  phase: 'idle', // idle settle calib painBefore ready play pause painAfter satisfaction adverse results bye
  cfg: null, rec: null, runRecords: [], committed: false,
  hasFloor: true, eyeH: 1.2, reach: null, calibHint: '', dist: null,
  activeMs: 0, spawned: 0, resolved: 0, hits: 0, pauses: 0, reachSum: 0, maxReach: 0,
  target: null, prevPos: null, age: 0, popT: -1, popDur: 0.3, nextSpawnAt: 0, msgIdx: 0,
  endedEarly: false, endReason: '', settleUntil: 0, byeAt: 0, ended: false, orbOpacity: 0.95,
  targetPoints: [], sparkT: -1,
  heldApple: null, droppingApple: null, harvestedCount: 0, basketPos: new THREE.Vector3(),
};

/* ================= Pantalla 2D del kinesiólogo ================= */

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch (e) { return []; }
}
function saveRecords(all) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch (e) { /* sin almacenamiento */ }
}

const FIELDS = ['gameMode', 'code', 'zone', 'side', 'position', 'minH', 'maxH', 'minD', 'maxD', 'lateral', 'reps', 'minutes', 'size', 'dwell', 'feedback'];
const CHECKS = ['ambient', 'limitReach'];

function readForm() {
  if (!$('zone')) {
    return S.cfg || normalizeConfig();
  }
  const raw = {};
  FIELDS.forEach((k) => { if ($(k)) raw[k] = $(k).value; });
  CHECKS.forEach((k) => { if ($(k)) raw[k] = $(k).checked; });
  return raw;
}

function writeForm(cfg) {
  if (!$('zone')) return;
  FIELDS.forEach((k) => { if ($(k)) $(k).value = cfg[k]; });
  CHECKS.forEach((k) => { if ($(k)) $(k).checked = cfg[k]; });
  if ($('repsOut')) $('repsOut').textContent = cfg.reps;
  if ($('dwellOut')) $('dwellOut').textContent = cfg.dwell + ' s';
}

function initForm() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { saved = {}; }
  delete saved.code;
  S.cfg = normalizeConfig(saved);

  if ($('zone')) {
    ZONES.forEach((z) => { const o = document.createElement('option'); o.value = z; o.textContent = z; $('zone').appendChild(o); });
    writeForm(S.cfg);
    if ($('reps') && $('repsOut')) $('reps').addEventListener('input', () => { $('repsOut').textContent = $('reps').value; });
    if ($('dwell') && $('dwellOut')) $('dwell').addEventListener('input', () => { $('dwellOut').textContent = $('dwell').value + ' s'; });
    if ($('consent') && $('enterBtn')) $('consent').addEventListener('change', () => { $('enterBtn').disabled = !$('consent').checked; });
    if ($('copyBtn')) $('copyBtn').addEventListener('click', copySummary);
    if ($('downloadBtn')) $('downloadBtn').addEventListener('click', downloadCSV);
    if ($('clearBtn')) $('clearBtn').addEventListener('click', () => {
      if (confirm('¿Borrar el historial de sesiones guardado en este dispositivo? Descarga el CSV antes si lo necesitas.')) {
        saveRecords([]);
        refreshCounts();
      }
    });
  }

  if ($('enterBtn')) {
    $('enterBtn').disabled = false;
    $('enterBtn').addEventListener('click', enterVR);
  }

  refreshCounts();

  // Inicializar cliente WebSocket invisible para el paciente
  if (!syncClient) {
    syncClient = new HeadsetSyncClient({
      onCommand: (buttonId, isRemote) => {
        onButton(buttonId, null, isRemote);
        chime();
      },
      onConfigUpdate: (newCfg) => {
        const wasApples = S.cfg ? S.cfg.gameMode === 'apples' : true;
        const wasMode = S.cfg ? S.cfg.gameMode : 'apples';
        // La tablet manda: solo se aceptan los campos permitidos y se normalizan (rangos, textos válidos).
        S.cfg = mergeConfig(S.cfg, newCfg);
        try { localStorage.setItem(CFG_KEY, JSON.stringify({ ...S.cfg, code: '' })); } catch (e) { /* ok */ }
        // El registro de la sesión en curso debe reflejar lo realmente programado.
        if (S.rec && !S.committed) {
          ['zone', 'side', 'position', 'gameMode', 'minutes', 'reps'].forEach((k) => { S.rec[k] = S.cfg[k]; });
        }
        if (S.reach) S.dist = effectiveDistances(S.cfg, S.reach);

        const isApples = S.cfg.gameMode === 'apples';
        // Feria: se rearma con el lado/tamaño nuevos, pero nunca en pleno juego (se cambia al terminar).
        if (isFair() && S.reach && S.phase !== 'play' && S.phase !== 'pause') layoutFair();
        if (wasMode !== S.cfg.gameMode && (wasMode === 'fair' || isFair()) && S.phase === 'play') {
          // Cambiar desde o hacia la feria a mitad del juego: se cierra la ronda limpiamente.
          if (fairScene) fairScene.clear();
          if (isFair() && !layoutFair()) S.cfg.gameMode = wasMode;
          else if (isFair()) fairScene.start();
        }
        if (wasApples !== isApples) {
          if (treeGroup) treeGroup.visible = isApples;
          if (basketGroup) basketGroup.visible = isApples;
          if (targetAppleGroup) targetAppleGroup.visible = false;
          if (orb) orb.visible = false;
          S.target = null;
          S.popT = -1;
          S.nextSpawnAt = performance.now() + 500;
        }

        broadcastState();
        broadcastMetrics();
        if (syncClient) syncClient.sendConfigApplied(activeConfig());
      },
      onRequestSync: () => {
        broadcastState();
        broadcastMetrics();
      },
      onSessionReset: () => {
        // La tablet pidió partir de cero. Nunca se borra una sesión en curso: solo si el visor está fuera de VR.
        if (S.phase !== 'idle' || !S.cfg) return;
        resetCounters();
        S.ended = false;
        S.endReason = '';
        broadcastMetrics();
        broadcastState();
      },
    });
    syncClient.connect();
  }
}

function setStatus(msg) { if ($('status')) $('status').textContent = msg; }
function refreshCounts() { if ($('storedCount')) $('storedCount').textContent = String(loadRecords().length); }

function downloadCSV() {
  const blob = new Blob([buildCSV(loadRecords())], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'calma_en_movimiento_metricas.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function copySummary() {
  if (!$('summaryText')) return;
  try {
    await navigator.clipboard.writeText($('summaryText').value);
    $('copyBtn').textContent = 'Copiado';
  } catch (e) {
    $('summaryText').select();
    $('copyBtn').textContent = 'Selecciona y copia manualmente';
  }
}

function drawReachMap(points, reach) {
  const canvas = $('reachCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2;
  const cy = H - 35;
  const scale = 220; // 1 metro = 220 px

  // Círculos concéntricos de distancia
  [0.4, 0.8, 1.2].forEach((r) => {
    ctx.strokeStyle = 'rgba(82, 107, 100, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, Math.PI, 0, false);
    ctx.stroke();

    ctx.fillStyle = 'rgba(82, 107, 100, 0.65)';
    ctx.font = '11px sans-serif';
    ctx.fillText(r.toFixed(1) + ' m', cx + 4, cy - r * scale + 12);
  });

  // Arco del alcance confortable
  if (reach) {
    ctx.strokeStyle = 'rgba(30, 123, 94, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, reach * scale, Math.PI, 0, false);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Posición del paciente
  ctx.fillStyle = '#1e7b5e';
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();

  // Puntos alcanzados y no alcanzados
  points.forEach((p) => {
    const px = cx + p.x * scale;
    const py = cy + p.z * scale;
    ctx.fillStyle = p.hit ? '#38b88f' : '#f0be5c';
    ctx.beginPath();
    ctx.arc(px, py, p.hit ? 6 : 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (p.hit) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  // Leyenda
  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#38b88f';
  ctx.beginPath(); ctx.arc(16, 18, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'var(--ink, #142823)';
  ctx.fillText('Alcanzado', 28, 22);

  ctx.fillStyle = '#f0be5c';
  ctx.beginPath(); ctx.arc(110, 18, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'var(--ink, #142823)';
  ctx.fillText('No tocado', 122, 22);
}

function showResults2D() {
  if (!$('resultsBody')) return;
  const tb = $('resultsBody');
  tb.textContent = '';
  S.runRecords.forEach((r, i) => {
    const tr = document.createElement('tr');
    const cells = [
      String(i + 1), r.time, r.hits + ' de ' + r.spawned, formatTime(r.activeSec),
      r.painBefore === null ? '-' : r.painBefore, r.painAfter === null ? '-' : r.painAfter,
      r.satisfaction === null ? '-' : r.satisfaction, r.adverse === null ? '-' : r.adverse ? 'Sí' : 'No',
    ];
    cells.forEach((v) => { const td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); });
    tb.appendChild(tr);
  });
  const lastRec = S.runRecords[S.runRecords.length - 1];
  if ($('adverseDesc')) $('adverseDesc').value = lastRec ? lastRec.adverseDesc : '';
  if ($('summaryText')) $('summaryText').value = lastRec ? buildSummary(lastRec) : 'No se registraron datos en esta ocasión.';
  if ($('copyBtn')) $('copyBtn').textContent = 'Copiar resumen para la ficha';
  if ($('resultsSection')) $('resultsSection').hidden = false;
  refreshCounts();

  if (lastRec) {
    if ($('chipHits')) $('chipHits').textContent = lastRec.hits + ' / ' + lastRec.spawned;
    if ($('chipTime')) $('chipTime').textContent = formatTime(lastRec.activeSec);
    if ($('chipReach')) $('chipReach').textContent = (lastRec.maxReach ? lastRec.maxReach.toFixed(2) : '0.00') + ' m';
    if ($('chipPain')) {
      if (lastRec.painBefore !== null && lastRec.painAfter !== null) {
        const diff = lastRec.painAfter - lastRec.painBefore;
        if (diff < 0) {
          $('chipPain').textContent = diff + ' (Alivio)';
          $('chipPain').style.color = '#38b88f';
        } else if (diff === 0) {
          $('chipPain').textContent = '0 (Estable)';
          $('chipPain').style.color = '#1e7b5e';
        } else {
          $('chipPain').textContent = '+' + diff + ' (Aumento)';
          $('chipPain').style.color = diff >= 2 ? '#d9534f' : '#f0be5c';
        }
      } else {
        $('chipPain').textContent = '-';
        $('chipPain').style.color = 'var(--ink, #142823)';
      }
    }
  }

  if (lastRec && lastRec.targetPoints) {
    drawReachMap(lastRec.targetPoints, lastRec.comfortReach);
  }
  $('resultsSection').scrollIntoView();
}

/* ================= Retroalimentación Háptica ================= */

function triggerHaptic(duration = 40, intensity = 0.35) {
  if (!session || !session.inputSources) return;
  for (const source of session.inputSources) {
    if (source.gamepad && source.gamepad.hapticActuators && source.gamepad.hapticActuators.length > 0) {
      try {
        source.gamepad.hapticActuators[0].pulse(intensity, duration);
      } catch (e) { /* sin soporte háptico */ }
    }
  }
}

/* ================= Escena y Entorno 3D ================= */



/* ================= Sistema de Cosecha del Manzano Zen ================= */

function snapStem() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(460, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.05);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  } catch (e) { /* audio protegido */ }
}

function thudBasket() {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.20);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.22);
  } catch (e) { /* audio protegido */ }
}

function addBranch(parent, mat, from, to, r0, r1) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, 1, 8);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.position.copy(from).add(to).multiplyScalar(0.5);
  parent.add(m);
  return m;
}

// Manzana sin halo (decorativa o guardada en el canasto)
function makeAppleMesh(scale = 1) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.06, 18, 14);
  geo.scale(1.0, 0.9, 1.0);
  g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd92534, roughness: 0.32, metalness: 0.08, emissive: 0x3a0508 })));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x4a3319 }));
  stem.position.y = 0.06;
  g.add(stem);
  g.scale.setScalar(scale);
  return g;
}

// Copa ALTA (sobre 1,75 m) para que las manzanas cuelguen visibles debajo, nunca dentro del follaje
const CANOPY_BOTTOM = 1.8;

function buildAppleTree() {
  treeGroup = new THREE.Group();
  treeGroup.position.set(0, 0, -1.6);

  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x614835 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 2.1, 12), trunkMat);
  trunk.position.y = 1.05;
  treeGroup.add(trunk);

  for (let r = 0; r < 4; r++) {
    const ang = (r * Math.PI) / 2 + 0.35;
    addBranch(treeGroup, trunkMat, new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(Math.cos(ang) * 0.45, 0.0, Math.sin(ang) * 0.45), 0.08, 0.03);
  }

  // Ramas que se extienden hacia el paciente, por encima de la zona de alcance
  const top = new THREE.Vector3(0, 1.95, 0);
  [[0.75, 2.0, 0.9], [-0.75, 2.0, 0.9], [0, 2.05, 1.05], [0.6, 2.1, 0.2], [-0.6, 2.1, 0.2]].forEach(([x, y, z]) => {
    addBranch(treeGroup, trunkMat, top, new THREE.Vector3(x, y, z), 0.07, 0.035);
  });

  const leafMats = [0x488b4f, 0x5ba363, 0x3d7844].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const clusters = [
    [0, 2.55, 0, 0.75], [0.55, 2.4, 0.35, 0.55], [-0.55, 2.4, 0.35, 0.55],
    [0.7, 2.35, 0.9, 0.5], [-0.7, 2.35, 0.9, 0.5], [0, 2.4, 1.0, 0.55], [0, 2.75, 0.5, 0.6],
  ];
  clusters.forEach(([x, y, z, r], i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), leafMats[i % 3]);
    s.scale.y = 0.75;
    s.position.set(x, Math.max(y, CANOPY_BOTTOM + r * 0.75), z);
    treeGroup.add(s);
  });

  // Manzanas decorativas colgando por FUERA del follaje (fuera del alcance, solo ambiente)
  const twigMat = new THREE.MeshLambertMaterial({ color: 0x4a3319 });
  [[0.9, 0.6], [-0.9, 0.55], [0.35, -0.2], [-0.4, -0.25], [1.1, 1.1], [-1.1, 1.05]].forEach(([x, z], i) => {
    const y = CANOPY_BOTTOM - 0.12 - (i % 3) * 0.06;
    const a = makeAppleMesh(0.8);
    a.position.set(x, y, z);
    treeGroup.add(a);
    addBranch(treeGroup, twigMat, new THREE.Vector3(x, y + 0.04, z), new THREE.Vector3(x, CANOPY_BOTTOM + 0.15, z), 0.004, 0.004);
  });

  anchor.add(treeGroup);
}

function buildOneBasket(x) {
  const group = new THREE.Group();
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.6, 16), new THREE.MeshLambertMaterial({ color: 0x584332 }));
  stump.position.y = 0.3;
  group.add(stump);

  const rattan = new THREE.MeshStandardMaterial({ color: 0xb58451, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.22, 24, 1, true), rattan);
  body.position.y = 0.71;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), rattan);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.61;
  group.add(body, bottom);

  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9945b, roughness: 0.5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 12, 32), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.82;
  group.add(rim);
  [-0.19, 0.19].forEach((hx) => {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 16), rimMat);
    h.position.set(hx, 0.79, 0);
    h.rotation.y = Math.PI / 2;
    group.add(h);
  });

  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.18, 32),
    new THREE.MeshBasicMaterial({ color: 0x56e2b6, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.83;
  group.add(glow);

  group.position.set(x, 0, -0.45);
  basketGroup.add(group);
  baskets.push({ group, glow, x, pos: new THREE.Vector3(x, 0.7, -0.45), count: 0 });
}

function buildBasket() {
  // Contenedor en el origen del anchor: sus hijos usan coordenadas del anchor
  basketGroup = new THREE.Group();
  buildOneBasket(-0.45); // izquierda
  buildOneBasket(0.45);  // derecha
  basketRimGlow = baskets[1].glow;
  harvestedApplesGroup = new THREE.Group();
  basketGroup.add(harvestedApplesGroup);
  anchor.add(basketGroup);
}

function buildTargetApple() {
  targetAppleGroup = new THREE.Group();
  const appleGeo = new THREE.SphereGeometry(0.06, 20, 16);
  appleGeo.scale(1.0, 0.9, 1.0);
  const body = new THREE.Mesh(appleGeo, new THREE.MeshStandardMaterial({ color: 0xe0293a, roughness: 0.3, metalness: 0.08, emissive: 0x4a0710 }));
  targetAppleGroup.add(body);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0x4a3319 }));
  stem.position.y = 0.06;
  targetAppleGroup.add(stem);

  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), new THREE.MeshStandardMaterial({ color: 0x40916c, roughness: 0.5 }));
  leaf.position.set(0.012, 0.068, 0);
  leaf.rotation.z = -0.9;
  targetAppleGroup.add(leaf);

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.3, depthWrite: false })
  );
  targetAppleGroup.add(aura);

  // Ramita vertical: hace que la manzana "cuelgue" de la copa
  const twigGeo = new THREE.CylinderGeometry(0.004, 0.004, 1, 6);
  twigGeo.translate(0, 0.5, 0);
  const twig = new THREE.Mesh(twigGeo, new THREE.MeshLambertMaterial({ color: 0x4a3319 }));
  twig.position.y = 0.07;
  targetAppleGroup.add(twig);

  targetAppleGroup.userData = { body, stem, leaf, aura, twig, radius: 0.07 };
  targetAppleGroup.visible = false;
  anchor.add(targetAppleGroup);
}

function updateAppleTwig(y) {
  const tw = targetAppleGroup && targetAppleGroup.userData.twig;
  if (!tw) return;
  tw.scale.y = Math.max(0.04, CANOPY_BOTTOM + 0.1 - y - 0.07);
  tw.visible = true;
}

function isControllerGrasping(c) {
  if (!c) return false;
  // 1. Manos libres (Hand Tracking)
  if (c.hand && c.hand.visible && c.hand.joints) {
    if (c.hand.inputState && c.hand.inputState.pinching) return true;
    const th = c.hand.joints['thumb-tip'];
    const idx = c.hand.joints['index-finger-tip'];
    if (th && idx && th.visible && idx.visible) {
      if (th.position.distanceTo(idx.position) < 0.042) return true;
    }
    const mid = c.hand.joints['middle-finger-tip'];
    const wr = c.hand.joints['wrist'];
    if (mid && wr && mid.visible && wr.visible) {
      if (mid.position.distanceTo(wr.position) < 0.13) return true;
    }
    return false;
  }
  // 2. Mandos Touch
  return !!c.obj.userData.triggerPressed || !!c.obj.userData.gripPressed;
}

/* ================= Articulaciones y Modelos Visuales 3D ================= */

const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'
];

const BONE_PAIRS = [
  // Pulgar
  ['wrist', 'thumb-metacarpal'],
  ['thumb-metacarpal', 'thumb-phalanx-proximal'],
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal'],
  ['thumb-phalanx-distal', 'thumb-tip'],
  // Índice
  ['wrist', 'index-finger-metacarpal'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal'],
  ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate'],
  ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'],
  ['index-finger-phalanx-distal', 'index-finger-tip'],
  // Medio
  ['wrist', 'middle-finger-metacarpal'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal'],
  ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate'],
  ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'],
  ['middle-finger-phalanx-distal', 'middle-finger-tip'],
  // Anular
  ['wrist', 'ring-finger-metacarpal'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal'],
  ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate'],
  ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'],
  ['ring-finger-phalanx-distal', 'ring-finger-tip'],
  // Meñique
  ['wrist', 'pinky-finger-metacarpal'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal'],
  ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate'],
  ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'],
  ['pinky-finger-phalanx-distal', 'pinky-finger-tip'],
  // Palma / Arco metacarpiano
  ['thumb-metacarpal', 'index-finger-metacarpal'],
  ['index-finger-metacarpal', 'middle-finger-metacarpal'],
  ['middle-finger-metacarpal', 'ring-finger-metacarpal'],
  ['ring-finger-metacarpal', 'pinky-finger-metacarpal']
];

function buildControllerVisual(g) {
  if (g.userData.built) return;
  g.userData.built = true;
  const group = new THREE.Group();

  // Mango ergonómico mate
  const handleGeo = new THREE.CylinderGeometry(0.015, 0.019, 0.12, 16);
  handleGeo.rotateX(-0.4);
  handleGeo.translate(0, -0.04, 0.02);
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x1d2722, roughness: 0.65, metalness: 0.2
  });
  group.add(new THREE.Mesh(handleGeo, handleMat));

  // Aro Zen luminoso
  const ringGeo = new THREE.TorusGeometry(0.042, 0.005, 12, 32);
  ringGeo.rotateX(0.5);
  ringGeo.translate(0, 0.015, -0.035);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x56e2b6, emissive: 0x247a61, emissiveIntensity: 0.75, roughness: 0.25
  });
  group.add(new THREE.Mesh(ringGeo, ringMat));

  // Joya de toque ámbar en la punta
  const gemGeo = new THREE.SphereGeometry(0.013, 16, 12);
  gemGeo.translate(0, 0.025, -0.065);
  const gemMat = new THREE.MeshStandardMaterial({
    color: 0xffd166, emissive: 0xb58014, emissiveIntensity: 0.85, roughness: 0.2
  });
  group.add(new THREE.Mesh(gemGeo, gemMat));

  const gemAura = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.32, depthWrite: false })
  );
  gemAura.position.set(0, 0.025, -0.065);
  group.add(gemAura);

  g.add(group);
  g.userData.visual = group;
}

function buildHandVisuals(hd) {
  if (hd.userData.built) return;
  hd.userData.built = true;
  hd.joints = hd.joints || {};

  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xdbf5ea, roughness: 0.35, metalness: 0.08, emissive: 0x1d4d3e, emissiveIntensity: 0.45,
    transparent: true, opacity: 0.92
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0xa8f5df, roughness: 0.25, metalness: 0.1, emissive: 0x56e2b6, emissiveIntensity: 0.85,
    transparent: true, opacity: 0.95
  });
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0x76eed3, transparent: true, opacity: 0.38, depthWrite: false
  });

  for (const name of JOINT_NAMES) {
    let jGroup = hd.joints[name];
    if (!jGroup) {
      jGroup = new THREE.Group();
      jGroup.matrixAutoUpdate = false;
      jGroup.visible = true;
      hd.joints[name] = jGroup;
      hd.add(jGroup);
    }

    let radius = 0.009;
    let mat = jointMat;
    if (name === 'wrist') {
      radius = 0.015;
    } else if (name.endsWith('-tip')) {
      radius = 0.0095;
      mat = tipMat;
    } else if (name.includes('metacarpal')) {
      radius = 0.011;
    } else if (name.includes('proximal')) {
      radius = 0.0095;
    } else if (name.includes('intermediate')) {
      radius = 0.0085;
    } else if (name.includes('distal')) {
      radius = 0.0075;
    }

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), mat);
    jGroup.add(sphere);

    // Halo luminoso en la punta del dedo índice para toque intuitivo
    if (name === 'index-finger-tip') {
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), auraMat);
      jGroup.add(aura);
    }
  }

  // Huesos conectores (falanges)
  const boneMat = new THREE.MeshStandardMaterial({
    color: 0xc4ede0, roughness: 0.4, emissive: 0x163d30, emissiveIntensity: 0.35,
    transparent: true, opacity: 0.85
  });
  const bones = [];
  const bonesGroup = new THREE.Group();
  hd.add(bonesGroup);

  const baseCylGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 1, 8);
  baseCylGeo.translate(0, 0.5, 0);
  baseCylGeo.rotateX(Math.PI / 2);

  for (const pair of BONE_PAIRS) {
    const mesh = new THREE.Mesh(baseCylGeo, boneMat);
    mesh.visible = false;
    bonesGroup.add(mesh);
    bones.push({ mesh, a: pair[0], b: pair[1] });
  }

  // Cojín de palma
  const palmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.018, 0.008, 16),
    jointMat
  );
  palmMesh.visible = false;
  hd.add(palmMesh);

  hd.userData.bones = bones;
  hd.userData.palmMesh = palmMesh;
}

function updateHandBones(hd) {
  if (!hd || !hd.visible || !hd.userData.bones) return;
  const bones = hd.userData.bones;
  const joints = hd.joints;
  if (!joints) return;

  for (let i = 0; i < bones.length; i++) {
    const b = bones[i];
    const jA = joints[b.a];
    const jB = joints[b.b];
    if (jA && jB && jA.visible && jB.visible) {
      const dist = jA.position.distanceTo(jB.position);
      if (dist > 0.002 && dist < 0.15) {
        b.mesh.position.copy(jA.position);
        b.mesh.lookAt(jB.position);
        b.mesh.scale.set(1, 1, dist);
        b.mesh.visible = true;
      } else {
        b.mesh.visible = false;
      }
    } else {
      b.mesh.visible = false;
    }
  }

  const palm = hd.userData.palmMesh;
  const wrist = joints['wrist'];
  const midMeta = joints['middle-finger-metacarpal'];
  if (palm && wrist && midMeta && wrist.visible && midMeta.visible) {
    palm.position.lerpVectors(wrist.position, midMeta.position, 0.55);
    palm.lookAt(midMeta.position);
    palm.visible = true;
  } else if (palm) {
    palm.visible = false;
  }
}

function initThree() {
  if (initialized) return;
  initialized = true;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.xr.enabled = true;
  Object.assign(renderer.domElement.style, {
    display: 'none', position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '9999',
  });
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd2ebed); // Cielo zen suave permanente
  scene.fog = new THREE.Fog(0xd2ebed, 14, 60);
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 120);

  // Iluminación natural suave
  scene.add(new THREE.HemisphereLight(0xfffaee, 0x7fa274, 1.15));
  const sun = new THREE.DirectionalLight(0xfff5dd, 0.9);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  buildSky();

  anchor = new THREE.Group();
  scene.add(anchor);
  buildEnvironment();
  buildFireflies();
  buildSparks();

  menuPanel = new VRPanel(THREE, { width: 1.25, height: 0.78 });
  menuPanel.mesh.position.set(0, 1.15, -1.0);
  hudPanel = new VRPanel(THREE, { width: 0.6, height: 0.3 });
  hudPanel.mesh.position.set(0, 0.72, -1.1);
  hudPanel.mesh.rotation.x = -0.35;
  menuPanel.mesh.visible = false;
  hudPanel.mesh.visible = false;
  anchor.add(menuPanel.mesh, hudPanel.mesh);

  buildOrb();
  buildAppleTree();
  buildBasket();
  buildTargetApple();
  fairScene = new FairScene(THREE, anchor, fairHost());
  for (let i = 0; i < 2; i++) {
    const h = new THREE.Group();
    h.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), new THREE.MeshLambertMaterial({ color: 0xfff4d6, emissive: 0x7a6538 })),
      new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }))
    );
    h.visible = false;
    anchor.add(h);
    hands.push(h);
  }

  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x8ff0cb, transparent: true, opacity: 0.65 })
    );
    line.visible = false;
    c.add(line);
    c.userData.line = line;
    c.userData.hoverId = null;

    // Cursor luminoso de impacto en paneles
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x56e2b6, transparent: true, opacity: 0.95 })
    );
    dot.visible = false;
    anchor.add(dot);
    c.userData.dot = dot;

    const g = renderer.xr.getControllerGrip(i);
    const hd = renderer.xr.getHand(i);

    buildControllerVisual(g);
    buildHandVisuals(hd);

    const defaultSide = i === 0 ? 'right' : 'left';
    c.userData.handedness = defaultSide;
    hd.userData.handedness = defaultSide;

    const ctrl = { obj: c, grip: g, hand: hd, handedness: defaultSide };
    controllers.push(ctrl);

    c.addEventListener('connected', (e) => {
      const h = e.data.handedness || defaultSide;
      c.userData.handedness = h;
      ctrl.handedness = h;
    });
    c.addEventListener('disconnected', () => { c.userData.handedness = null; ctrl.handedness = null; });
    c.addEventListener('selectstart', () => {
      c.userData.triggerPressed = true;
      onSelect(c, 'selectstart');
    });
    c.addEventListener('selectend', () => {
      c.userData.triggerPressed = false;
    });
    c.addEventListener('squeezestart', () => {
      c.userData.gripPressed = true;
      // No pausar por squeezestart: el agarre se usa para las manzanas
    });
    c.addEventListener('squeezeend', () => {
      c.userData.gripPressed = false;
    });

    hd.addEventListener('connected', (e) => {
      const h = e.data.handedness || defaultSide;
      hd.userData.handedness = h;
      ctrl.handedness = h;
      buildHandVisuals(hd);
    });
    hd.addEventListener('disconnected', () => { hd.userData.handedness = null; ctrl.handedness = null; });
    hd.addEventListener('pinchstart', () => onSelect(c, 'pinchstart'));

    scene.add(c);
    scene.add(g);
    scene.add(hd);
  }

  renderer.xr.addEventListener('sessionend', onSessionEnd);
  renderer.setAnimationLoop(loop);
}

// Domo de cielo con gradiente suave zen
function buildSky() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, '#98cbdf'); // Cenit celeste
  grad.addColorStop(0.45, '#bfe1ea'); // Cielo medio
  grad.addColorStop(0.85, '#e4f3f2'); // Horizonte suave
  grad.addColorStop(1.0, '#fff4de'); // Luz dorada en el horizonte
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);

  const tex = new THREE.CanvasTexture(canvas);
  const skyGeo = new THREE.SphereGeometry(95, 32, 16);
  const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
}

function buildEnvironment() {
  // Pradera zen amplia
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x80b878 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(65, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  anchor.add(ground);

  // Sendero de piedras de río suaves y redondeadas
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc4cec6 });
  const stonePositions = [
    [0, -0.75, 0.28, 0.35], [0.38, -1.05, 0.24, 0.30], [-0.36, -1.15, 0.25, 0.32],
    [0.12, -1.45, 0.26, 0.33], [-0.28, -1.65, 0.22, 0.28], [0.42, -1.85, 0.26, 0.32], [-0.38, -2.05, 0.24, 0.30]
  ];
  stonePositions.forEach(([sx, sz, rx, rz], idx) => {
    const stone = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), stoneMat);
    stone.scale.set(rx, 0.05, rz);
    stone.position.set(sx, 0.02, sz);
    stone.rotation.y = idx * 0.8;
    anchor.add(stone);
  });

  // Farolillos zen japoneses de piedra (Tōrō) con luz cálida interior
  const lanternMat = new THREE.MeshLambertMaterial({ color: 0x9ba6a0 });
  const lanternLightMat = new THREE.MeshBasicMaterial({ color: 0xffe294 });
  [[-1.4, -1.7], [1.4, -1.9]].forEach(([lx, lz]) => {
    const lantern = new THREE.Group();
    // Base y poste
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8), lanternMat);
    post.position.y = 0.25;
    // Caja de luz con ranura
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, 0.22), lanternMat);
    box.position.y = 0.58;
    // Núcleo de luz ámbar interior
    const innerLight = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), lanternLightMat);
    innerLight.position.y = 0.58;
    // Tejado cónico japonés
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.12, 4), lanternMat);
    roof.position.y = 0.74;
    roof.rotation.y = Math.PI / 4;
    lantern.add(post, box, innerLight, roof);
    lantern.position.set(lx, 0, lz);
    anchor.add(lantern);
  });

  // Estanque / Arroyo sereno curvado en el plano medio
  const creekMat = new THREE.MeshLambertMaterial({ color: 0x62a49b, transparent: true, opacity: 0.75 });
  const creek = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5), creekMat);
  creek.rotation.x = -Math.PI / 2;
  creek.position.set(0, 0.01, -6.8);
  anchor.add(creek);

  // Rocas zen lisas de río
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x808d87 });
  [[-2.0, -2.6, 0.45], [2.3, -2.8, 0.52], [-2.8, -4.4, 0.75], [3.3, -4.8, 0.85]].forEach(([rx, rz, s]) => {
    const rock = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), rockMat);
    rock.scale.set(1.3, 0.62, 1.1);
    rock.position.set(rx, s * 0.32, rz);
    anchor.add(rock);
  });

  // Colinas suaves en el horizonte
  const hillMat1 = new THREE.MeshLambertMaterial({ color: 0x709f7a });
  const hillMat2 = new THREE.MeshLambertMaterial({ color: 0x628f6e });
  [
    [-22, -32, 13, hillMat1], [8, -36, 16, hillMat2], [28, -29, 11, hillMat1],
    [-12, -45, 18, hillMat2], [20, -44, 15, hillMat1], [-32, -24, 10, hillMat2]
  ].forEach(([x, z, r, mat]) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14), mat);
    h.position.set(x, -r * 0.58, z);
    anchor.add(h);
  });

  // Árboles estilizados (mezcla de bosque verde y cerezo sakura)
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7d5e41 });
  const leafMatGreen1 = new THREE.MeshLambertMaterial({ color: 0x5a9a62 });
  const leafMatGreen2 = new THREE.MeshLambertMaterial({ color: 0x6bb075 });
  const leafMatSakura = new THREE.MeshLambertMaterial({ color: 0xebb1c6 });

  const treeData = [
    [-3.8, -5.5, leafMatGreen1, 1.0],
    [-6.2, -8.0, leafMatGreen2, 1.2],
    [4.2, -6.0, leafMatSakura, 1.05],
    [6.8, -9.2, leafMatGreen1, 1.25],
    [-8.5, -4.5, leafMatSakura, 1.1],
    [8.2, -5.2, leafMatGreen2, 1.0],
    [0.0, -12.5, leafMatGreen1, 1.4],
    [-2.2, -15.0, leafMatSakura, 1.3],
    [3.5, -14.2, leafMatGreen2, 1.35],
  ];

  treeData.forEach(([tx, tz, lMat, scale]) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 1.6 * scale, 10), trunkMat);
    trunk.position.y = 0.8 * scale;
    tree.add(trunk);

    const crown1 = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale, 16, 12), lMat);
    crown1.position.y = 1.9 * scale;
    const crown2 = new THREE.Mesh(new THREE.SphereGeometry(0.7 * scale, 14, 10), lMat);
    crown2.position.set(0.35 * scale, 2.2 * scale, 0.15 * scale);
    const crown3 = new THREE.Mesh(new THREE.SphereGeometry(0.65 * scale, 14, 10), lMat);
    crown3.position.set(-0.35 * scale, 2.05 * scale, -0.2 * scale);
    tree.add(crown1, crown2, crown3);

    tree.position.set(tx, 0, tz);
    anchor.add(tree);
  });

  // Flores silvestres sutiles
  const flowerStemMat = new THREE.MeshLambertMaterial({ color: 0x48754c });
  const flowerPetalMat1 = new THREE.MeshLambertMaterial({ color: 0xb5a0d6 });
  const flowerPetalMat2 = new THREE.MeshLambertMaterial({ color: 0xfff6cf });
  const flowerPetalMat3 = new THREE.MeshLambertMaterial({ color: 0xf5bfb0 });

  [
    [-1.2, -1.8, flowerPetalMat1], [1.3, -2.0, flowerPetalMat2],
    [-1.6, -3.2, flowerPetalMat3], [1.8, -3.5, flowerPetalMat1],
    [-0.8, -4.2, flowerPetalMat2], [0.9, -4.8, flowerPetalMat3],
  ].forEach(([fx, fz, pMat]) => {
    const patch = new THREE.Group();
    for (let f = 0; f < 3; f++) {
      const ox = (f - 1) * 0.12;
      const oz = ((f % 2) - 0.5) * 0.1;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 6), flowerStemMat);
      stem.position.set(ox, 0.11, oz);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pMat);
      head.position.set(ox, 0.23, oz);
      patch.add(stem, head);
    }
    patch.position.set(fx, 0, fz);
    anchor.add(patch);
  });
}

function buildFireflies() {
  const count = 45;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const basePos = [];
  const speeds = [];

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 5.5;
    const y = 0.5 + Math.random() * 2.2;
    const z = -0.6 - Math.random() * 4.2;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    basePos.push({ x, y, z, phase: Math.random() * Math.PI * 2 });
    speeds.push(0.35 + Math.random() * 0.55);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255, 252, 210, 1.0)');
  grad.addColorStop(0.35, 'rgba(245, 225, 130, 0.7)');
  grad.addColorStop(1, 'rgba(210, 190, 80, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);

  const mat = new THREE.PointsMaterial({
    size: 0.08,
    map: tex,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  fireflies = new THREE.Points(geom, mat);
  fireflies.userData = { basePos, speeds };
  anchor.add(fireflies);
}

function buildSparks() {
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(SPARK_COUNT * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.4, 'rgba(255, 235, 140, 0.9)');
  g.addColorStop(1, 'rgba(255, 205, 70, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(canvas);

  const mat = new THREE.PointsMaterial({
    size: 0.07,
    map: tex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  sparkPoints = new THREE.Points(geom, mat);
  sparkPoints.visible = false;
  anchor.add(sparkPoints);
}

function triggerSparks(pos) {
  if (!sparkPoints) return;
  sparkPoints.position.copy(pos);
  const positions = sparkPoints.geometry.attributes.position.array;
  sparkVel.length = 0;
  for (let i = 0; i < SPARK_COUNT; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = 0;
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.28 + Math.random() * 0.38;
    sparkVel.push({
      vx: Math.cos(angle) * speed * 0.7,
      vy: 0.22 + Math.random() * 0.45,
      vz: Math.sin(angle) * speed * 0.7,
    });
  }
  sparkPoints.geometry.attributes.position.needsUpdate = true;
  sparkPoints.material.opacity = 0.95;
  sparkPoints.visible = true;
  S.sparkT = 0;
}

// Objetivo de luz ("Espíritu de Luz con pétalos orbitales bioluminiscentes")
function buildOrb() {
  orb = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: ORB_COLORS[0], transparent: true }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: ORB_COLORS[0], transparent: true, opacity: 0.24, depthWrite: false }));
  orb.add(body, halo);

  // Corona de pétalos orbitales
  const petalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38, depthWrite: false });
  const petalGroup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), petalMat);
    petal.scale.set(0.6, 1.2, 0.2);
    petal.position.set(Math.cos(angle) * 1.35, Math.sin(angle) * 1.35, 0);
    petalGroup.add(petal);
  }
  orb.add(petalGroup);

  const ringGeom = new THREE.RingGeometry(0.8, 1.2, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  popRing = new THREE.Mesh(ringGeom, ringMat);
  popRing.visible = false;
  orb.add(popRing);

  orb.userData = { body, halo, petalGroup, popRing, radius: 0.075 };
  orb.visible = false;
  anchor.add(orb);
}

function setOrbOpacity(k) {
  S.orbOpacity = k;
  orb.userData.body.material.opacity = k;
  orb.userData.halo.material.opacity = 0.24 * k;
  if (orb.userData.petalGroup) {
    orb.userData.petalGroup.children.forEach((p) => { p.material.opacity = 0.38 * k; });
  }
}

/* ================= Sesión WebXR ================= */

async function enterVR() {
  try {
    if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr'))) {
      setStatus('Este navegador o dispositivo no permite realidad virtual (WebXR). Abre esta página en el navegador del Meta Quest.');
      return;
    }
    const cfg = normalizeConfig(readForm());
    writeForm(cfg);
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ ...cfg, code: '' })); } catch (e) { /* ok */ }
    S.cfg = cfg;
    S.runRecords = [];
    S.reach = null;
    initThree();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'hand-tracking'] });
    S.hasFloor = session.enabledFeatures ? session.enabledFeatures.includes('local-floor') : true;
    renderer.xr.setReferenceSpaceType(S.hasFloor ? 'local-floor' : 'local');
    session.addEventListener('visibilitychange', () => {
      if (session && session.visibilityState !== 'visible' && S.phase === 'play') pausePlay();
    });
    resetCounters();
    S.ended = false;
    S.endReason = '';
    await renderer.xr.setSession(session);
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.style.display = 'none';
    renderer.domElement.style.display = 'block';
    renderer.setSize(window.innerWidth, window.innerHeight);
    if ($('resultsSection')) $('resultsSection').hidden = true;
    startAmbient();
    placeAnchor();
    S.phase = 'settle';
    S.settleUntil = performance.now() + SETTLE_MS;
    setStatus('Sesión en curso. Si algo no se ve bien, quita el visor.');
  } catch (err) {
    console.error('Error al iniciar WebXR:', err);
    let msg = err && err.message ? err.message : String(err);
    if (!window.isSecureContext && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      msg = 'WebXR requiere conexión HTTPS segura para el visor. Abre el enlace HTTPS o túnel.';
    }
    setStatus('No se pudo iniciar VR: ' + msg);
  }
}

function resetCounters() {
  if (fairScene) fairScene.clear();
  Object.assign(S, {
    rec: newRecord(S.cfg), committed: false, activeMs: 0, spawned: 0, resolved: 0, hits: 0, pauses: 0,
    reachSum: 0, maxReach: 0, target: null, prevPos: null, age: 0, popT: -1, nextSpawnAt: 0, msgIdx: 0, endedEarly: false, endReason: '',
    targetPoints: [], sparkT: -1,
    heldApple: null, droppingApple: null, harvestedCount: 0, repsDoneAt: 0,
  });
  if (orb) orb.visible = false;
  if (targetAppleGroup) targetAppleGroup.visible = false;
  baskets.forEach((b) => { b.count = 0; });
  if (harvestedApplesGroup) {
    while (harvestedApplesGroup.children.length > 0) {
      harvestedApplesGroup.remove(harvestedApplesGroup.children[0]);
    }
  }
  if (sparkPoints) sparkPoints.visible = false;
}

function commitRecord() {
  if (S.committed || !S.rec) return;
  const r = S.rec;
  if (S.spawned === 0 && r.painBefore === null) return;
  r.spawned = S.spawned;
  r.hits = S.hits;
  r.activeSec = S.activeMs / 1000;
  r.avgReach = S.hits ? S.reachSum / S.hits : 0;
  r.maxReach = S.maxReach;
  r.comfortReach = S.reach;
  r.pauses = S.pauses;
  r.endedEarly = S.endedEarly;
  r.endReason = S.endReason;
  r.targetPoints = S.targetPoints ? [...S.targetPoints] : [];
  S.committed = true;
  S.runRecords.push(r);
  const all = loadRecords();
  all.push(r);
  saveRecords(all);
}

function onSessionEnd() {
  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.style.display = 'block';
  if (renderer) renderer.domElement.style.display = 'none';
  if (!S.committed && ['settle', 'calib', 'painBefore', 'ready', 'play', 'pause'].includes(S.phase)) {
    S.endedEarly = true;
    if (!S.endReason) S.endReason = 'removed';
  }
  commitRecord();
  stopAmbient();
  S.phase = 'idle';
  session = null;
  S.ended = true;
  setStatus('Sesión terminada.');
  showResults2D();
  // Avisar a la tablet que la sesión terminó (si no, seguiría mostrando la última pantalla del visor).
  lastBroadcastedPhase = 'idle';
  broadcastMetrics();
  broadcastState();
}

function placeAnchor() {
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(tmpA);
  const d = camera.getWorldDirection(tmpB);
  const fallback = S.cfg.position === 'standing' ? 1.6 : 1.15;
  anchor.position.set(tmpA.x, S.hasFloor ? 0 : tmpA.y - fallback, tmpA.z);
  anchor.rotation.set(0, Math.atan2(-d.x, -d.z), 0);
  anchor.updateMatrixWorld(true);
  S.eyeH = tmpA.y - anchor.position.y;
  S.cfg.eyeH = S.eyeH; // Pasar altura real del paciente a la cinemática de spawn

  menuPanel.mesh.position.set(0, S.eyeH - 0.05, -1.0);
  // HUD elevado al ángulo superior: visible levantando la mirada, pero fuera de la zona de alcance de los brazos
  hudPanel.mesh.position.set(0, S.eyeH + 0.44, -1.25);
  hudPanel.mesh.rotation.x = 0.28;

  // Canastos a izquierda y derecha del paciente
  for (const b of baskets) {
    b.group.position.set(b.x, 0, -0.45);
    b.pos.set(b.x, 0.7, -0.45);
  }

  // Si hay objetivo activo en juego, reubicarlo frente al nuevo centro
  if (S.target && S.phase === 'play' && S.dist) {
    const newT = pickTarget(S.cfg, S.dist, null);
    if (newT) {
      S.target = newT;
      if (S.cfg.gameMode === 'apples' && targetAppleGroup) {
        targetAppleGroup.position.set(newT.pos.x, newT.pos.y, newT.pos.z);
        updateAppleTwig(newT.pos.y);
      } else if (orb) {
        orb.position.set(newT.pos.x, newT.pos.y, newT.pos.z);
      }
    }
  }
}

function toLocal(worldVec) {
  return anchor.worldToLocal(worldVec.clone());
}

function headLocal() {
  camera.updateMatrixWorld(true);
  camera.getWorldPosition(tmpA);
  return toLocal(tmpA);
}

// Lado ('left' | 'right') que informó el visor para este control, o null si no se conoce.
function ctrlSide(c) {
  const side = c.handedness || c.obj.userData.handedness || (c.hand && c.hand.userData.handedness) || null;
  return side === 'left' || side === 'right' ? side : null;
}

// ¿Está este control (mano o mando) siendo detectado ahora?
function ctrlActive(c) {
  return !!((c.hand && c.hand.visible) || (c.grip && c.grip.visible));
}

// Controles que trabajan según el lado configurado. Con "Bilateral" se usan las dos manos.
// Nunca se usa la mano del lado contrario: si el lado pedido no se detecta, solo se aceptan controles
// activos cuyo lado el visor no pudo identificar.
function handCtrls() {
  const want = S.cfg ? S.cfg.side : 'both';
  if (want === 'both') return controllers;
  const matched = controllers.filter((c) => ctrlSide(c) === want);
  if (matched.length > 0) return matched;
  return controllers.filter((c) => ctrlSide(c) === null && ctrlActive(c));
}

const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
function trackedHand(c) {
  const h = c.hand;
  if (!h || !h.visible || !h.joints) return null;
  const a = h.joints['wrist'];
  const b = h.joints['middle-finger-phalanx-proximal'];
  return a && b && a.visible && b.visible ? { a, b } : null;
}

function usingHands() {
  return controllers.some((c) => c.hand && c.hand.visible);
}

function handLocal(c) {
  // En modo manos, el punto de alcance natural es la punta del dedo índice
  if (c.hand && c.hand.visible && c.hand.joints) {
    const tip = c.hand.joints['index-finger-tip'];
    if (tip && tip.visible) {
      tip.getWorldPosition(tmpC);
      return toLocal(tmpC);
    }
    const th = trackedHand(c);
    if (th) {
      th.a.getWorldPosition(tmpC);
      th.b.getWorldPosition(tmpD);
      tmpC.add(tmpD).multiplyScalar(0.5);
      return toLocal(tmpC);
    }
  }
  if (c.grip && c.grip.visible) {
    c.grip.getWorldPosition(tmpA);
    return toLocal(tmpA);
  }
  c.obj.getWorldPosition(tmpA);
  return toLocal(tmpA);
}

function getActiveTouchPoints() {
  const points = [];
  const list = handCtrls();

  for (const c of list) {
    // 1) Si la mano está en seguimiento activo (Hand Tracking)
    if (c.hand && c.hand.visible && c.hand.joints) {
      const joints = c.hand.joints;
      // Dedo índice (prioritario y más intuitivo para tocar la luz)
      const idxTip = joints['index-finger-tip'];
      if (idxTip && idxTip.visible) {
        idxTip.getWorldPosition(tmpC);
        points.push(toLocal(tmpC));
      }
      // Dedo pulgar
      const thTip = joints['thumb-tip'];
      if (thTip && thTip.visible) {
        thTip.getWorldPosition(tmpC);
        points.push(toLocal(tmpC));
      }
      // Dedo medio
      const midTip = joints['middle-finger-tip'];
      if (midTip && midTip.visible) {
        midTip.getWorldPosition(tmpC);
        points.push(toLocal(tmpC));
      }
      // Palma (centro entre muñeca y base de dedo medio)
      const wrist = joints['wrist'];
      const midProx = joints['middle-finger-phalanx-proximal'];
      if (wrist && midProx && wrist.visible && midProx.visible) {
        wrist.getWorldPosition(tmpC);
        midProx.getWorldPosition(tmpD);
        tmpC.add(tmpD).multiplyScalar(0.5);
        points.push(toLocal(tmpC));
      }
    }
    // 2) Si el mando está activo (Controllers)
    else if (c.grip && c.grip.visible) {
      // Centro del mando
      c.grip.getWorldPosition(tmpA);
      points.push(toLocal(tmpA));

      // Punta frontal del mando (hacia adelante en la dirección del mando)
      c.obj.getWorldPosition(tmpA);
      c.obj.getWorldDirection(tmpB);
      tmpA.addScaledVector(tmpB, 0.08);
      points.push(toLocal(tmpA));
    }
  }

  return points;
}

function getModeBadge() {
  const isHands = usingHands();
  return {
    text: (S.cfg && S.cfg.gameMode === 'apples' ? '🍎 MANZANO • ' : S.cfg && S.cfg.gameMode === 'fair' ? '🎪 FERIA • ' : '🌸 LUCES • ') + (isHands ? '🖐️ MANOS' : '🎮 MANDOS'),
    bg: isHands ? 'rgba(86, 226, 182, 0.22)' : 'rgba(255, 209, 102, 0.18)',
    border: isHands ? 'rgba(86, 226, 182, 0.6)' : 'rgba(255, 209, 102, 0.55)',
    color: isHands ? '#a8f5df' : '#ffe188'
  };
}

/* ================= Paneles y Botones In-VR ================= */

function painButtons(prefix, from, to) {
  const out = [];
  for (let i = from; i <= to; i++) out.push({ id: prefix + ':' + i, label: String(i) });
  return out;
}

function eyeLine() {
  return 'Altura de ojos detectada: ' + S.eyeH.toFixed(2).replace('.', ',') + ' m (luces entre ' +
    S.cfg.minH.toFixed(2).replace('.', ',') + ' y ' + S.cfg.maxH.toFixed(2).replace('.', ',') + ' m)';
}

// Las preguntas finales nunca bloquean: se puede omitir una pregunta o terminar sin responder (queda vacío, no 0).
const SURVEY_SKIP = [
  { id: 'skipQ', label: 'Omitir pregunta', secondary: true },
  { id: 'skip_survey', label: 'Omitir y finalizar', secondary: true },
];

function phaseModel() {
  const cfg = S.cfg;
  switch (S.phase) {
    case 'settle':
      return { panel: 'menu', model: { title: 'Un momento', lines: ['Siéntate cómodo/a y mira al frente.'] } };
    case 'calib':
      return {
        panel: 'menu',
        model: cfg.limitReach
          ? {
            badge: getModeBadge(),
            title: 'Calibración de Alcance Confortable',
            lines: [
              'Mira al frente y mantén una postura relajada.',
              usingHands()
                ? 'Extiende tu brazo hasta donde sea agradable y sin dolor, y pulsa "Registrar alcance" tocando el botón o con pellizco.'
                : 'Extiende tu brazo hasta donde sea agradable y sin dolor, y pulsa "Registrar alcance" con el gatillo.',
              eyeLine(),
              S.calibHint,
            ].filter(Boolean),
            lineSize: 30,
            buttons: [{ id: 'reach', label: 'Registrar alcance' }, { id: 'cont', label: 'Omitir', secondary: true }],
            cols: 2,
          }
          : {
            badge: getModeBadge(),
            title: 'Calibración',
            lines: ['Mira al frente y mantén una postura cómoda.', eyeLine()],
            buttons: [{ id: 'cont', label: 'Continuar' }],
            cols: 1,
          },
      };
    case 'painBefore':
      return { panel: 'menu', model: { title: '¿Cuánto dolor o molestia tienes en este momento?', lines: ['0 = Sin ningún dolor        10 = Máximo dolor imaginable'], buttons: painButtons('painB', 0, 10), cols: 6 } };
    case 'ready': {
      const next = MODE_ORDER[(MODE_ORDER.indexOf(cfg.gameMode) + 1) % MODE_ORDER.length];
      const toggle = { id: 'toggleMode', label: 'Modo: ' + MODE_NAME[cfg.gameMode] + ' (Cambiar a ' + MODE_NAME[next] + ')', secondary: true };
      const how = cfg.gameMode === 'apples'
        ? 'Toma la manzana (pellizco o gatillo) y déjala en el canasto izquierdo o derecho.'
        : cfg.gameMode === 'fair'
          ? 'Toma una pelota de la bandeja (pellizco o gatillo) y lánzala para botar los tarros. Suéltala para lanzar.'
          : 'Toca las luces mágicas con tus dedos o con el mando, a tu propio ritmo.';
      if (cfg.gameMode === 'fair' && S.fairOk === false) {
        return {
          panel: 'menu',
          model: {
            badge: getModeBadge(),
            title: 'La feria no cabe con este alcance',
            lines: ['Para que tarros y bandeja queden dentro de tu alcance cómodo se necesita un poco más de espacio.', 'Elige otra actividad.'],
            buttons: [toggle, { id: 'recalib', label: 'Medir el alcance otra vez', secondary: true }],
            cols: 1,
          },
        };
      }
      return {
        panel: 'menu',
        model: {
          badge: getModeBadge(),
          title: 'Gracias, todo listo para comenzar',
          lines: [how, 'No hay prisa. Puedes pausar o descansar cuando quieras.'],
          buttons: [{ id: 'start', label: 'Comenzar experiencia' }, toggle],
          cols: 1,
        },
      };
    }
    case 'play':
      // En el visor NO se muestra progreso ni tiempo: eso lo ve solo el evaluador en la tablet.
      // Queda un único botón de Pausa (la pausa ofrece "Continuar" y "Finalizar sesión").
      return {
        panel: 'hud',
        model: {
          title: '',
          titleSize: 22,
          lineSize: 26,
          lines: [S.msgIdx === 0 && cfg.gameMode === 'fair' ? 'Toma una pelota y lánzala hacia los tarros.' : S.msgIdx === 0 && cfg.gameMode === 'apples' ? 'Toma la manzana y déjala en el canasto.' : MESSAGES[S.msgIdx]],
          buttons: [{ id: 'pause', label: 'Pausa', secondary: true }],
          cols: 1,
        },
      };
    case 'pause':
      return {
        panel: 'menu',
        model: {
          badge: getModeBadge(),
          title: 'Sesión en pausa',
          lines: ['Tómate el tiempo que necesites para respirar y descansar.', 'Si sientes fatiga o molestia, puedes finalizar la sesión de forma segura.'],
          buttons: [{ id: 'resume', label: 'Continuar' }, { id: 'finish', label: 'Finalizar sesión', secondary: true }],
          cols: 2,
        },
      };
    case 'painAfter':
      return { panel: 'menu', model: { title: 'Gracias por participar. ¿Cuánto dolor tienes ahora?', lines: ['0 = Sin ningún dolor        10 = Máximo dolor imaginable'], buttons: painButtons('painA', 0, 10).concat(SURVEY_SKIP), cols: 6 } };
    case 'satisfaction':
      return { panel: 'menu', model: { title: '¿Qué tan agradable y cómoda fue la experiencia?', lines: ['1 = Nada        5 = Muy agradable'], buttons: painButtons('sat', 1, 5).concat(SURVEY_SKIP), cols: 5 } };
    case 'adverse':
      return {
        panel: 'menu',
        model: {
          title: '¿Tuviste algún malestar?',
          lines: ['Por ejemplo mareo, náuseas, dolor de cabeza o aumento de molestia.'],
          buttons: [{ id: 'adv:no', label: 'No tuve malestar' }, { id: 'adv:yes', label: 'Tuve malestar', secondary: true }, { id: 'skip_survey', label: 'Omitir y finalizar', secondary: true }],
          cols: 2,
        },
      };
    case 'results': {
      const r = S.rec;
      const avg = S.hits ? S.reachSum / S.hits : 0;
      const m = (v) => v.toFixed(2).replace('.', ',') + ' m';
      return {
        panel: 'menu',
        model: {
          title: 'Resumen de tu sesión',
          lineSize: 28,
          lines: [
            'Objetivos alcanzados: ' + S.hits + ' de ' + S.spawned + '   ·   Tiempo activo: ' + formatTime(S.activeMs / 1000),
            'Alcance promedio: ' + m(avg) + '   ·   máximo: ' + m(S.maxReach),
            'Dolor antes: ' + (r.painBefore === null ? '-' : r.painBefore) + '   ·   después: ' + (r.painAfter === null ? '-' : r.painAfter),
            r.adverse ? 'Gracias por informarlo. Tu kinesiólogo revisará cómo te sientes.' : 'Gracias por participar. Cada movimiento cuenta.',
          ],
          buttons: [{ id: 'done', label: 'Finalizar' }, { id: 'again', label: 'Repetir sesión', secondary: true }],
          cols: 2,
        },
      };
    }
    case 'rest':
      // Sala de descanso: la sesión ya terminó y quedó guardada, pero el paciente sigue dentro del jardín.
      // El evaluador puede iniciar otra sesión desde la tablet sin que nadie tenga que volver a entrar a VR.
      return {
        panel: 'menu',
        model: {
          title: 'Sesión finalizada',
          lineSize: 28,
          lines: ['Gracias por participar. Puedes descansar con calma.', 'Tu kinesiólogo continuará contigo.'],
          buttons: [{ id: 'leave', label: 'Salir de realidad virtual', secondary: true }],
          cols: 1,
        },
      };
    case 'bye':
      return { panel: 'menu', model: { title: 'Sesión finalizada', lines: ['Puedes quitarte el visor con calma. Gracias por participar.'] } };
    default:
      return { panel: null, model: null };
  }
}

function rayHit(c, panel) {
  c.updateMatrixWorld(true);
  tmpA.setFromMatrixPosition(c.matrixWorld);
  tmpB.set(0, 0, -1).transformDirection(c.matrixWorld);
  raycaster.set(tmpA, tmpB);
  raycaster.far = 4;
  const hits = raycaster.intersectObject(panel.mesh, false);
  return hits.length ? { dist: hits[0].distance, uv: hits[0].uv, point: hits[0].point } : null;
}

// Paneles visibles en este momento (menú central y, durante el juego, el botón de pausa).
function visiblePanels() {
  return [menuPanel, hudPanel].filter((p) => p && p.mesh.visible);
}

// Panel apuntado por un rayo (el más cercano) y el botón bajo el punto de impacto.
function pickPanelHit(obj, panels) {
  let best = null;
  for (const panel of panels) {
    const hit = rayHit(obj, panel);
    if (hit && (!best || hit.dist < best.hit.dist)) best = { panel, hit };
  }
  if (!best) return null;
  return { panel: best.panel, hit: best.hit, id: best.panel.hit(best.hit.uv) };
}

// Seguro contra pulsaciones accidentales del botón de pausa: el rayo debe llevar un momento sobre el botón.
// (Al agarrar una manzana con pellizco, el rayo de la mano puede cruzar por casualidad el botón de pausa.)
const HUD_HOVER_MS = 350;
const hudHover = { id: null, since: 0 };

function updatePointers() {
  const panels = visiblePanels();
  const hoverMap = new Map(panels.map((p) => [p, null]));
  for (const c of controllers) {
    const best = panels.length ? pickPanelHit(c.obj, panels) : null;
    const hit = best ? best.hit : null;
    const id = best ? best.id : null;
    c.obj.userData.hoverId = id;
    const line = c.obj.userData.line;
    const dot = c.obj.userData.dot;

    // Solo mostrar rayo y punto láser si hay impacto o si estamos usando mandos
    const isHand = c.hand && c.hand.visible;
    line.visible = !!hit && (!isHand || hit.dist > 0.4);
    if (dot) dot.visible = !!hit;

    if (hit) {
      line.scale.z = hit.dist;
      if (dot) {
        dot.position.copy(hit.point);
      }
    }
    if (id) hoverMap.set(best.panel, id);

    // Toque directo con la punta del dedo índice en el menú flotante (Hand Tracking)
    if (isHand && c.hand.joints && menuPanel && menuPanel.mesh.visible) {
      const panel = menuPanel;
      const idxTip = c.hand.joints['index-finger-tip'];
      if (idxTip && idxTip.visible) {
        idxTip.getWorldPosition(tmpC);
        panel.mesh.updateMatrixWorld(true);
        panel.mesh.worldToLocal(tmpC);
        const halfW = (panel.mesh.geometry.parameters.width || 0.8) / 2;
        const halfH = (panel.mesh.geometry.parameters.height || 0.5) / 2;
        if (Math.abs(tmpC.x) <= halfW && Math.abs(tmpC.y) <= halfH && Math.abs(tmpC.z) < 0.07) {
          const uvX = tmpC.x / (halfW * 2) + 0.5;
          const uvY = tmpC.y / (halfH * 2) + 0.5;
          const directId = panel.hit({ x: uvX, y: uvY });
          if (directId) {
            hoverMap.set(panel, directId);
            if (Math.abs(tmpC.z) < 0.02) {
              const now = performance.now();
              if (now - (c.obj.userData.lastDirectTouch || -1e9) > 450) {
                c.obj.userData.lastDirectTouch = now;
                onButton(directId, c.obj);
                chime();
              }
            }
          }
        }
      }
    }
  }
  for (const [panel, h] of hoverMap) panel.setHover(h);
  const hh = hudPanel && hudPanel.mesh.visible ? hoverMap.get(hudPanel) : null;
  if (hh !== hudHover.id) { hudHover.id = hh; hudHover.since = performance.now(); }
}

function onSelect(c, src = 'select') {
  const panels = visiblePanels();
  if (!panels.length) return;
  const best = pickPanelHit(c, panels);
  const id = best ? best.id : null;
  if (!id) return;
  const now = performance.now();
  if (best.panel === hudPanel && !(hudHover.id === id && now - hudHover.since >= HUD_HOVER_MS)) return;
  if (now - (c.userData.lastSel || -1e9) < 450) return;
  c.userData.lastSel = now;
  triggerHaptic(25, 0.25);
  onButton(id, c);
}

// Otra sesión sin salir de VR. Solo desde el resumen o la sala de descanso: nunca borra una sesión en juego.
function startAnotherSession(recalibrate) {
  if (!['results', 'rest'].includes(S.phase)) return;
  commitRecord();
  resetCounters();
  baskets.forEach((b) => { b.count = 0; if (b.glow) b.glow.material.opacity = 0.2; });
  if (harvestedApplesGroup) {
    while (harvestedApplesGroup.children.length > 0) {
      harvestedApplesGroup.remove(harvestedApplesGroup.children[0]);
    }
  }
  S.ended = false;
  if (recalibrate) {
    // Paciente nuevo: se vuelve a medir el alcance cómodo.
    S.reach = null;
    S.phase = 'calib';
  } else {
    S.phase = 'painBefore';
  }
}

let lastButtonActionTime = 0;
function onButton(id, c, isRemote = false) {
  const now = performance.now();
  // Debounce exclusivo para Hand Tracking y mandos físicos. Comandos remotos ejecutan de inmediato.
  if (!isRemote) {
    if (now - lastButtonActionTime < 400) return;
    lastButtonActionTime = now;
  } else {
    lastButtonActionTime = now;
  }

  const [k, v] = id.split(':');
  switch (k) {
    case 'reach': measureReach(c); break;
    case 'cont': S.phase = 'painBefore'; break;
    case 'painB': if (S.rec) S.rec.painBefore = Number(v); S.phase = 'ready'; break;
    case 'start': startPlay(); break;
    case 'pause': pausePlay(); break;
    case 'resume': resumePlay(); break;
    case 'toggleMode':
      S.cfg.gameMode = MODE_ORDER[(MODE_ORDER.indexOf(S.cfg.gameMode) + 1) % MODE_ORDER.length];
      if (S.rec && !S.committed) S.rec.gameMode = S.cfg.gameMode;
      if (isFair()) layoutFair();
      resetCounters();
      S.nextSpawnAt = performance.now() + 600;
      break;
    case 'exit':
    case 'finish': finishRequested(isRemote); break;
    case 'painA': if (S.rec) S.rec.painAfter = Number(v); S.phase = 'satisfaction'; break;
    case 'sat': if (S.rec) S.rec.satisfaction = Number(v); S.phase = 'adverse'; break;
    case 'adv': if (S.rec) S.rec.adverse = v === 'yes'; S.phase = 'results'; break;
    case 'again':
    case 'new_session':
      startAnotherSession(false);
      break;
    case 'recalib':
      // Desde "listo para comenzar": volver a medir el alcance (no borra datos, la sesión aún no empieza).
      if (S.phase === 'ready') { S.reach = null; S.phase = 'calib'; }
      break;
    case 'new_session_calib':
      startAnotherSession(true);
      break;
    case 'skipQ':
      // Omitir una pregunta de la encuesta final: queda vacía (no 0).
      if (S.phase === 'painAfter') S.phase = 'satisfaction';
      else if (S.phase === 'satisfaction') S.phase = 'adverse';
      else if (S.phase === 'adverse') { commitRecord(); S.phase = 'results'; }
      break;
    case 'skip_survey':
      if (['painAfter', 'satisfaction', 'adverse'].includes(S.phase)) {
        commitRecord();
        S.phase = 'results';
      }
      break;
    case 'recenter':
      // Recentrar el jardín según la posición actual de la cabeza (no mientras hay una manzana en la mano).
      if (['calib', 'painBefore', 'ready', 'pause', 'play'].includes(S.phase) && !S.heldApple && !S.droppingApple) placeAnchor();
      break;
    case 'done': commitRecord(); S.phase = 'rest'; break;
    case 'leave':
      // Salir de realidad virtual: solo desde el resumen o la sala de descanso.
      if (['results', 'rest'].includes(S.phase)) {
        commitRecord();
        S.phase = 'bye';
        S.byeAt = performance.now() + 3000;
      }
      break;
    default: break;
  }
  broadcastState();
  broadcastMetrics();
}

/* ================= Feria de juegos ================= */

const MODE_ORDER = ['apples', 'lights', 'fair'];
const MODE_NAME = { apples: '🍎 Manzano', lights: '🌸 Luces', fair: '🎪 Feria' };
const isFair = () => !!(S.cfg && S.cfg.gameMode === 'fair');

function fairHost() {
  return {
    controllers: () => handCtrls().filter(ctrlActive),
    handLocal: (c) => handLocal(c),
    grasping: (c) => isControllerGrasping(c),
    haptic: (ms, k) => triggerHaptic(ms, k),
    sound: (kind) => { if (kind === 'can') chime(); },
    // Cada pelota lanzada es un intento.
    onThrow: (info) => {
      S.spawned++;
      const pt = { x: info.pos.x, y: info.pos.y, z: info.pos.z, hit: false };
      S.targetPoints.push(pt);
      broadcastMetrics();
      return pt;
    },
    // Cada tarro derribado es un acierto. El alcance es el de la mano al soltar la pelota que lo botó.
    onCan: (info) => {
      S.hits++;
      S.reachSum += info.reach;
      S.maxReach = Math.max(S.maxReach, info.reach);
      S.msgIdx = 1 + (S.hits % (MESSAGES.length - 1));
      broadcastMetrics();
    },
    onResolved: () => { S.resolved++; },
  };
}

// Arma la feria dentro del alcance cómodo. Devuelve false si con ese alcance no cabe de forma segura.
function layoutFair() {
  if (!fairScene || !S.cfg || !S.reach) return false;
  S.dist = effectiveDistances(S.cfg, S.reach);
  S.fairOk = fairScene.configure(S.cfg, S.dist, S.eyeH || 1.15);
  return S.fairOk;
}

function measureReach(c) {
  // Se mide la mano del lado de trabajo (con "Bilateral", la que llegue más lejos), no la que pulsó el botón:
  // así también funciona cuando el evaluador pulsa "Registrar alcance" desde la tablet.
  const head = headLocal();
  let r = 0;
  const working = handCtrls().filter(ctrlActive);
  for (const ctrl of working) r = Math.max(r, horizontalDistance(handLocal(ctrl), head));
  if (!working.length) {
    const ctrl = c && controllers.find((x) => x.obj === c);
    if (ctrl && ctrlActive(ctrl)) {
      r = horizontalDistance(handLocal(ctrl), head);
    } else {
      S.calibHint = 'No se detecta la mano de trabajo. Acércala para que el visor la vea e inténtalo de nuevo.';
      return;
    }
  }
  if (r < 0.25) {
    S.calibHint = 'Extiende un poco más, solo si es cómodo.';
    return;
  }
  S.reach = Math.min(1.3, r);
  S.calibHint = '';
  if (isFair()) layoutFair();
  S.phase = 'painBefore';
}

/* ================= Lógica de Juego ================= */

function startPlay() {
  S.dist = effectiveDistances(S.cfg, S.reach);
  if (isFair()) {
    // La feria necesita espacio para mostrador y bandeja dentro del alcance cómodo.
    if (!layoutFair()) { S.phase = 'ready'; return; }
    fairScene.start();
  }
  S.phase = 'play';
  S.nextSpawnAt = performance.now() + 1000;
}

function pausePlay() {
  if (S.phase !== 'play') return;
  S.phase = 'pause';
  S.pauses++;
  if (orb) orb.visible = false;
  if (sparkPoints) sparkPoints.visible = false;
  S.target = null;
  S.popT = -1;
}

function resumePlay() {
  S.phase = 'play';
  S.nextSpawnAt = performance.now() + 800;
}

function endPlay(early, reason) {
  // Feria: se limpia la zona (pelotas del suelo, tarros de vuelta, bandejas llenas).
  if (fairScene) fairScene.clear();
  if (orb) orb.visible = false;
  if (sparkPoints) sparkPoints.visible = false;
  if (targetAppleGroup) targetAppleGroup.visible = false;
  S.target = null;
  S.popT = -1;
  S.heldApple = null;
  S.droppingApple = null;
  S.endedEarly = early;
  S.endReason = reason || (early ? 'user' : '');
  S.phase = 'painAfter';
}

// "Finalizar": según la fase puede ser terminar el juego, saltar la encuesta o cerrar el resumen.
function finishRequested(isRemote) {
  const reason = isRemote ? 'evaluator' : 'user';
  if (['painAfter', 'satisfaction', 'adverse'].includes(S.phase)) {
    commitRecord();
    S.phase = 'results';
  } else if (S.phase === 'results') {
    commitRecord();
    S.phase = 'rest';
  } else if (['settle', 'calib', 'painBefore', 'ready', 'play', 'pause'].includes(S.phase)) {
    endPlay(true, reason);
  }
}

function spawnTarget() {
  const t = pickTarget(S.cfg, S.dist, S.prevPos);
  S.target = t;
  S.prevPos = t.pos;
  S.spawned++;
  S.age = 0;
  S.popT = -1;
  if (popRing) popRing.visible = false;

  if (S.cfg.gameMode === 'apples') {
    orb.visible = false;
    targetAppleGroup.position.set(t.pos.x, t.pos.y, t.pos.z);
    targetAppleGroup.scale.setScalar(1);
    targetAppleGroup.visible = true;
    targetAppleGroup.userData.aura.material.opacity = 0.3;
    updateAppleTwig(t.pos.y);
    return;
  }

  if (targetAppleGroup) targetAppleGroup.visible = false;
  const radius = SIZES[S.cfg.size];
  orb.userData.radius = radius;
  const col = ORB_COLORS[(S.spawned - 1) % ORB_COLORS.length];
  orb.userData.body.material.color.setHex(col);
  orb.userData.halo.material.color.setHex(col);
  setOrbOpacity(0.95);
  orb.position.set(t.pos.x, t.pos.y, t.pos.z);
  orb.scale.setScalar(0.001);
  orb.visible = true;
}

function chime() {
  if (!audioCtx || S.cfg.feedback === 'visual') return;
  const t = audioCtx.currentTime;
  const baseFreqs = [523.25, 587.33, 659.25, 783.99];
  const f1 = baseFreqs[Math.floor(Math.random() * baseFreqs.length)];
  const f2 = f1 * 1.5;

  [f1, f2].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const vol = idx === 0 ? 0.05 : 0.025;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);

    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.8);
  });
}

// Armónicos binaurales de calma tipo cuenco tibetano
function startAmbient() {
  if (!audioCtx || !S.cfg.ambient) return;
  stopAmbient();
  const g = audioCtx.createGain();
  g.gain.value = 0.0001;
  g.connect(audioCtx.destination);
  const oscs = [[130.81, 0.45], [196.0, 0.3], [261.63, 0.15], [329.63, 0.08]].map(([f, a]) => {
    const o = audioCtx.createOscillator();
    const og = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    og.gain.value = a;
    o.connect(og).connect(g);
    o.start();
    return o;
  });
  const lfo = audioCtx.createOscillator();
  const lg = audioCtx.createGain();
  lfo.frequency.value = 0.05; // ritmo de respiración lento (ondas theta de calma)
  lg.gain.value = 0.012;
  lfo.connect(lg).connect(g.gain);
  lfo.start();
  g.gain.exponentialRampToValueAtTime(0.038, audioCtx.currentTime + 3.5);
  ambient = { g, oscs, lfo };
}

function stopAmbient() {
  if (!ambient || !audioCtx) { ambient = null; return; }
  try {
    const t = audioCtx.currentTime;
    ambient.g.gain.cancelScheduledValues(t);
    ambient.g.gain.setTargetAtTime(0.0001, t, 0.2);
    ambient.oscs.concat([ambient.lfo]).forEach((o) => o.stop(t + 1));
  } catch (e) { /* ya detenido */ }
  ambient = null;
}

function update(dt, now) {
  try {
    if (S.phase === 'idle') return;

    // Detección y broadcast inmediato de cambios automáticos de fase
    if (lastBroadcastedPhase !== S.phase) {
      lastBroadcastedPhase = S.phase;
      broadcastState();
      broadcastMetrics();
    }

  if (S.phase === 'settle' && now >= S.settleUntil) {
    placeAnchor();
    S.phase = 'calib';
  }
  if (S.phase === 'bye' && now >= S.byeAt && session) {
    const s = session;
    session = null;
    s.end();
  }

  // Luciérnagas flotantes
  if (fireflies) {
    const pos = fireflies.geometry.attributes.position.array;
    const { basePos, speeds } = fireflies.userData;
    const t = now * 0.001;
    for (let i = 0; i < basePos.length; i++) {
      const bp = basePos[i];
      const s = speeds[i];
      pos[i * 3] = bp.x + Math.sin(t * s + bp.phase) * 0.22;
      pos[i * 3 + 1] = bp.y + Math.cos(t * s * 0.8 + bp.phase) * 0.15;
      pos[i * 3 + 2] = bp.z + Math.sin(t * s * 0.6 + bp.phase) * 0.18;
    }
    fireflies.geometry.attributes.position.needsUpdate = true;
  }

  // Rotación suave de pétalos del orbe
  if (orb && orb.userData && orb.userData.petalGroup) {
    orb.userData.petalGroup.rotation.z += dt * 0.6;
    orb.userData.petalGroup.rotation.x = Math.sin(now * 0.002) * 0.25;
  }

  // Chispas de acierto
  if (sparkPoints && sparkPoints.visible) {
    S.sparkT = (S.sparkT || 0) + dt;
    const k = Math.min(1, S.sparkT / 0.65);
    const posArr = sparkPoints.geometry.attributes.position.array;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const v = sparkVel[i];
      if (v) {
        posArr[i * 3] += v.vx * dt;
        posArr[i * 3 + 1] += v.vy * dt;
        posArr[i * 3 + 2] += v.vz * dt;
        v.vy -= 0.15 * dt;
      }
    }
    sparkPoints.geometry.attributes.position.needsUpdate = true;
    sparkPoints.material.opacity = 0.95 * (1 - k);
    if (k >= 1) sparkPoints.visible = false;
  }

  // Actualizar animación de huesos para manos articuladas
  for (const c of controllers) {
    if (c.hand && c.hand.visible) {
      updateHandBones(c.hand);
    }
  }

  // Recolectar puntos de contacto para colisión intuitiva (puntas de dedos o punta del mando)
  const showHands = S.phase === 'calib' || S.phase === 'play' || S.phase === 'ready' || S.phase === 'pause';
  const touchPoints = showHands ? getActiveTouchPoints() : [];

  // Ocultar esferas de respaldo cuando los modelos 3D detallados están activos
  hands.forEach((h) => { h.visible = false; });

  const pm = phaseModel();
  menuPanel.mesh.visible = pm.panel === 'menu';
  // Panel de juego: solo el botón de Pausa, sin progreso ni tiempo (eso se ve en la tablet del evaluador).
  hudPanel.mesh.visible = pm.panel === 'hud';
  if (pm.panel === 'menu') menuPanel.set(pm.model);
  if (pm.panel === 'hud') hudPanel.set(pm.model);
  updatePointers();

  const isApplesMode = !!(S.cfg && S.cfg.gameMode === 'apples');
  const isFairMode = isFair();
  if (treeGroup) treeGroup.visible = isApplesMode;
  if (basketGroup) basketGroup.visible = isApplesMode;
  if (fairScene) fairScene.setVisible(isFairMode && fairScene.ready() && !['settle', 'calib', 'bye'].includes(S.phase));

  if (S.phase !== 'play') return;

  // Telemetria en vivo a la tablet del evaluador
  if (now - lastMetricsBroadcast > 500) {
    lastMetricsBroadcast = now;
    broadcastMetrics();
  }

  // --- Juego activo ---
  S.activeMs += dt * 1000;
  if (S.activeMs >= S.cfg.minutes * 60000 && !S.heldApple && !S.droppingApple && !(isFairMode && fairScene.holding())) {
    endPlay(false, 'time');
    return;
  }

  // ===================== MODO 3: FERIA DE JUEGOS =====================
  if (isFairMode) {
    if (orb) orb.visible = false;
    if (targetAppleGroup) targetAppleGroup.visible = false;
    if (fairScene.ready()) fairScene.step(dt, now);
    // Meta por ACIERTOS (tarros derribados). Se espera un momento para que el último tarro termine de caer.
    if (S.hits >= S.cfg.reps) {
      if (!S.repsDoneAt) S.repsDoneAt = now + 1200;
      else if (now >= S.repsDoneAt && !fairScene.holding()) { S.repsDoneAt = 0; endPlay(false, 'reps'); }
    }
    return;
  }

  if (!S.target && S.popT < 0 && now >= S.nextSpawnAt && !S.droppingApple) {
    // La meta de repeticiones es por ACIERTOS (hits >= reps)
    if (S.hits >= S.cfg.reps) {
      endPlay(false, 'reps');
      return;
    }
    spawnTarget();
  }
  if (!S.target) return;

  S.age += dt;

  // ===================== MODO 1: COSECHA DEL MANZANO =====================
  if (isApplesMode) {
    if (orb) orb.visible = false;
    const activeCtrls = handCtrls();

    // 1. Manzana colgada esperando agarre
    if (!S.heldApple && !S.droppingApple && S.popT < 0) {
      targetAppleGroup.position.y = S.target.pos.y + Math.sin(now * 0.003) * 0.005;

      let nearAnyHand = false;
      for (const ctrl of activeCtrls) {
        const handP = handLocal(ctrl);
        const d = distance(handP, targetAppleGroup.position);

        if (d < 0.15) {
          nearAnyHand = true;
          targetAppleGroup.userData.aura.material.opacity = 0.55;
        }

        // Condición de Agarre (Reach + Grasp)
        if (d < 0.095 && isControllerGrasping(ctrl)) {
          S.heldApple = {
            mesh: targetAppleGroup,
            ctrl: ctrl,
            originalPos: { ...S.target.pos },
            grabT: now
          };
          snapStem();
          targetAppleGroup.userData.twig.visible = false;
          triggerHaptic(35, 0.35);
          triggerSparks(targetAppleGroup.position);
          break;
        }
      }
      if (!nearAnyHand) {
        targetAppleGroup.userData.aura.material.opacity = 0.25;
      }

      // Tiempo límite de permanencia suave
      if (S.age >= S.cfg.dwell) {
        S.target.hit = false;
        S.targetPoints.push({ x: S.target.pos.x, y: S.target.pos.y, z: S.target.pos.z, hit: false });
        S.popT = 0;
        S.popDur = 0.4;
      }
    }

    // 2. Transporte y Suelta en el canasto
    else if (S.heldApple && !S.droppingApple) {
      const handP = handLocal(S.heldApple.ctrl);
      targetAppleGroup.position.copy(handP);

      let overBasket = null;
      for (const b of baskets) {
        const over = horizontalDistance(targetAppleGroup.position, b.pos) < 0.24 && targetAppleGroup.position.y >= b.pos.y - 0.12;
        b.glow.material.opacity = over ? 0.75 + Math.sin(now * 0.008) * 0.2 : 0.2;
        if (over) overBasket = b;
      }
      const isOverBasket = !!overBasket;

      // Suelta de la manzana
      const stillGrasping = isControllerGrasping(S.heldApple.ctrl);
      if (!stillGrasping) {
        if (isOverBasket) {
          // ¡Cosecha completada con éxito dentro del canasto!
          S.droppingApple = {
            mesh: targetAppleGroup,
            basket: overBasket,
            vy: -0.6,
            targetY: 0.68 + Math.min(0.1, overBasket.count * 0.01)
          };
          baskets.forEach((b) => { b.glow.material.opacity = 0.2; });
          S.heldApple = null;
        } else {
          // Soltó fuera del canasto -> Regresa suavemente a la rama
          targetAppleGroup.position.set(S.heldApple.originalPos.x, S.heldApple.originalPos.y, S.heldApple.originalPos.z);
          targetAppleGroup.userData.twig.visible = true;
          S.heldApple = null;
        }
      }
    }

    // 3. Caída física al interior del canasto
    if (S.droppingApple) {
      const da = S.droppingApple;
      da.mesh.position.y += da.vy * dt;
      if (da.basket) {
        da.mesh.position.x += (da.basket.pos.x - da.mesh.position.x) * Math.min(1, dt * 8);
        da.mesh.position.z += (da.basket.pos.z - da.mesh.position.z) * Math.min(1, dt * 8);
      }
      da.vy -= 4.2 * dt;

      if (da.mesh.position.y <= da.targetY) {
        da.mesh.position.y = da.targetY;
        thudBasket();
        chime();
        triggerHaptic(50, 0.45);
        triggerSparks(da.mesh.position);

        // Guardar manzana dentro del canasto elegido
        const bk = da.basket || baskets[0];
        const stored = makeAppleMesh(0.85);
        const ang = bk.count * 2.39996;
        const rr = Math.min(0.08, Math.sqrt(bk.count) * 0.035);
        stored.position.set(bk.pos.x + Math.cos(ang) * rr, da.targetY, bk.pos.z + Math.sin(ang) * rr);
        harvestedApplesGroup.add(stored);
        bk.count++;
        S.harvestedCount++;
        S.droppingApple = null;
        da.mesh.visible = false;

        // Registro clínico del acierto
        const reach = horizontalDistance(S.target.pos, { x: 0, z: 0 });
        S.hits++;
        S.reachSum += reach;
        S.maxReach = Math.max(S.maxReach, reach);
        S.msgIdx = 1 + (S.hits % (MESSAGES.length - 1));
        S.target.hit = true;
        S.targetPoints.push({ x: S.target.pos.x, y: S.target.pos.y, z: S.target.pos.z, hit: true });
        S.popT = -1;
        S.resolved++;
        S.target = null;
        S.nextSpawnAt = now + 900;
        broadcastMetrics();
      }
    }

    if (S.popT >= 0) {
      S.popT += dt;
      if (S.popT >= S.popDur) {
        targetAppleGroup.visible = false;
        S.target = null;
        S.popT = -1;
        S.resolved++;
        S.nextSpawnAt = now + 900;
      }
    }
    return;
  }

  // ===================== MODO 2: JARDÍN DE LUCES =====================
  const radius = orb.userData.radius;

  if (S.popT < 0) {
    const s = Math.min(1, S.age / 0.8);
    const breath = 1.0 + Math.sin(now * 0.0035) * 0.06;
    orb.scale.setScalar(Math.max(0.001, radius * s * s * (3 - 2 * s) * breath));
    orb.position.y = S.target.pos.y + Math.sin(S.age * 1.2) * 0.008;

    const haloPulse = 1.6 * (1.0 + Math.sin(now * 0.0035 + 0.4) * 0.09);
    orb.userData.halo.scale.setScalar(haloPulse);

    const hitRadius = radius + 0.075;
    for (const p of touchPoints) {
      if (distance(p, S.target.pos) < hitRadius) { harvest(); return; }
    }
    if (S.age >= S.cfg.dwell) {
      S.target.hit = false;
      S.targetPoints.push({ x: S.target.pos.x, y: S.target.pos.y, z: S.target.pos.z, hit: false });
      S.popT = 0;
      S.popDur = 0.4;
    }
  } else {
    S.popT += dt;
    const k = Math.min(1, S.popT / S.popDur);
    if (S.target.hit && S.cfg.feedback !== 'sound') {
      orb.scale.setScalar(radius * (1 + 1.5 * k));
      setOrbOpacity(0.95 * (1 - k * k));
      if (popRing) {
        popRing.visible = true;
        popRing.scale.setScalar(radius * (1 + 3.2 * k));
        popRing.material.opacity = 0.6 * (1 - k);
        popRing.lookAt(camera.position);
      }
    } else {
      setOrbOpacity(0.95 * (1 - k));
      if (popRing) popRing.visible = false;
    }
    if (k >= 1) {
      orb.visible = false;
      if (popRing) popRing.visible = false;
      S.target = null;
      S.popT = -1;
      S.resolved++;
      S.nextSpawnAt = now + 900;
    }
  }
  } catch (err) {
    console.error('[update Error]', err);
  }
}

function harvest() {
  const reach = horizontalDistance(S.target.pos, { x: 0, z: 0 });
  S.hits++;
  S.reachSum += reach;
  S.maxReach = Math.max(S.maxReach, reach);
  S.msgIdx = 1 + (S.hits % (MESSAGES.length - 1));
  S.target.hit = true;
  S.targetPoints.push({ x: S.target.pos.x, y: S.target.pos.y, z: S.target.pos.z, hit: true });
  S.popT = 0;
  S.popDur = S.cfg.feedback === 'sound' ? 0.05 : 0.7;
  if (S.cfg.feedback !== 'sound') {
    orb.userData.body.material.color.setHex(0xffffff);
    orb.userData.halo.material.color.setHex(0xffffff);
    if (popRing) {
      popRing.visible = true;
      popRing.scale.setScalar(orb.userData.radius);
      popRing.material.opacity = 0.7;
    }
  }
  triggerSparks(orb.position);
  triggerHaptic(50, 0.45);
  chime();
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (renderer.xr.isPresenting) update(dt, now);
  renderer.render(scene, camera);
}

initForm();

export const __test = { S, update, onButton, phaseModel, enterVR, DEFAULTS, baskets, controllers, get apple() { return targetAppleGroup; }, get fair() { return fairScene; }, get anchor() { return anchor; } };
