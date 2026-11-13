import { getSyncServerUrl, getSessionCode } from './sync-config.js';
import { formatTime, ZONES, DEFAULTS, END_REASONS, progressPercent, MEASURE_LABELS, describeMeasure } from './logic.js';
import { PatientsPanel } from './pacientes.js';

const APP_VERSION = '0.9.4';

let ws = null;
let currentRoom = getSessionCode() || 'HOSPITAL-1';
let currentPhase = 'idle';

function freshMetrics() {
  return {
    hits: 0,
    spawned: 0,
    resolved: 0,
    reps: DEFAULTS.reps,
    minutes: DEFAULTS.minutes,
    activeSec: 0,
    maxReach: 0,
    avgReach: 0,
    painBefore: null,
    painAfter: null,
    satisfaction: null,
    pauses: 0,
    adverse: null,
    endReason: '',
    sessionEnded: false,
    handsSeen: null,
    config: null,
    uid: '',
    comfortReach: null,
    measures: null,
  };
}
let currentMetrics = freshMetrics();
let isConnected = false;
let isHeadsetOnline = false;
let reconnectTimer = null;
let reconnectDelay = 2000;
let configDirty = false; // el evaluador cambió algo y todavía no lo envió
let formFilled = false; // el formulario ya se llenó con la configuración real del visor
let ackTimer = null;
let lastState = null;

// Elementos del DOM
const $ = (id) => document.getElementById(id);
const serverDot = $('serverDot');
const serverStatusText = $('serverStatusText');
const headsetStatusText = $('headsetStatusText');
const roomCodeInput = $('roomCodeInput');
const offlineBanner = $('offlineBanner');
const currentPhaseBadge = $('currentPhaseBadge');
const mirrorTitle = $('mirrorTitle');
const mirrorLines = $('mirrorLines');
const mirrorButtonsContainer = $('mirrorButtonsContainer');

const SIDE_ES = { right: 'Derecho', left: 'Izquierdo', both: 'Bilateral' };
const POS_ES = { sitting: 'Sentado', standing: 'De pie' };
const MODE_ES = { apples: 'Cosecha del Manzano', lights: 'Jardín de Luces', fair: 'Feria de Juegos' };
const CFG_FIELDS = {
  gameMode: 'cfgMode', zone: 'cfgZone', side: 'cfgSide', position: 'cfgPos',
  minutes: 'cfgMin', reps: 'cfgReps', dwell: 'cfgDwell', size: 'cfgSize', feedback: 'cfgFeedback',
  guide: 'cfgGuide', guideProgress: 'cfgGuideProgress', fairDist: 'cfgFairDist',
};

// Las zonas salen de la misma lista que usa el visor (así lo que se elige aquí es lo que se registra allá).
ZONES.forEach((z) => {
  const o = document.createElement('option');
  o.value = z;
  o.textContent = z;
  $('cfgZone').appendChild(o);
});

// Inicializar vista
roomCodeInput.value = currentRoom;

/* ---------- Configuración (tablet -> visor) ---------- */

function readConfigFromForm() {
  const cfg = {};
  for (const [key, id] of Object.entries(CFG_FIELDS)) {
    const el = $(id);
    if (!el) continue;
    cfg[key] = ['minutes', 'reps', 'dwell'].includes(key) ? Number(el.value) : el.value;
  }
  return cfg;
}

// Llena el formulario con la configuración real del visor. No pisa lo que el evaluador está editando.
function fillForm(cfg, force = false) {
  if (!cfg || (configDirty && !force)) return;
  for (const [key, id] of Object.entries(CFG_FIELDS)) {
    const el = $(id);
    if (!el || cfg[key] === undefined || cfg[key] === null) continue;
    const val = String(cfg[key]);
    // Si el valor no está entre las opciones (por ejemplo 12 min), se agrega para que se vea lo real.
    if (![...el.options].some((o) => o.value === val)) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = id === 'cfgMin' ? val + ' minutos' : val;
      el.appendChild(o);
    }
    el.value = val;
  }
  formFilled = true;
}

function describeConfig(c) {
  if (!c) return '';
  return [
    MODE_ES[c.gameMode] || c.gameMode,
    c.zone,
    'lado ' + (SIDE_ES[c.side] || c.side).toLowerCase(),
    (POS_ES[c.position] || c.position).toLowerCase(),
    c.minutes + ' min',
    c.reps + ' repeticiones',
    c.dwell + ' s por objetivo',
    c.guide === 'off' ? 'sin guía' : 'con guía' + (c.guideProgress === 'on' ? ' y progreso visible' : ''),
  ].join(' · ');
}

function setCfgStatus(text, tone) {
  const el = $('cfgStatus');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? 'var(--warn)' : 'var(--muted)';
}

function markDirty() {
  configDirty = true;
  setCfgStatus('Hay cambios sin enviar al visor.', 'warn');
}

function resetApplyButton() {
  const b = $('applyCfgBtn');
  if (b) b.textContent = '📤 Enviar Configuración al Visor';
}

/* ---------- Conexión WebSocket ---------- */

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

  setServerState('connecting');

  try {
    const url = getSyncServerUrl();
    ws = new WebSocket(url);

    ws.onopen = () => {
      setServerState('online');
      reconnectDelay = 2000;
      send({
        type: 'join_room',
        room: currentRoom,
        role: 'therapist',
      });
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      handleMessage(msg);
    };

    ws.onclose = () => {
      setServerState('offline');
      setHeadsetState(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      setServerState('offline');
    };
  } catch (err) {
    setServerState('offline');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(15000, reconnectDelay * 1.5);
    connect();
  }, reconnectDelay);
}

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {}
  }
}

function setServerState(state) {
  isConnected = state === 'online';
  updateRoomBanner();
  if (state === 'online') {
    serverDot.className = 'status-dot online';
    serverStatusText.textContent = 'En línea (Servidor)';
    offlineBanner.classList.remove('visible');
  } else if (state === 'connecting') {
    serverDot.className = 'status-dot connecting';
    serverStatusText.textContent = 'Conectando...';
  } else {
    serverDot.className = 'status-dot offline';
    serverStatusText.textContent = 'Desconectado';
    offlineBanner.classList.add('visible');
  }
}

function setHeadsetState(online) {
  isHeadsetOnline = online;
  updateRoomBanner();
  if (online) {
    headsetStatusText.textContent = 'Visor conectado 🟢';
    headsetStatusText.style.color = 'var(--acc)';
  } else {
    headsetStatusText.textContent = 'Esperando visor... ⏳';
    headsetStatusText.style.color = 'var(--muted)';
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'room_joined':
      currentRoom = msg.room;
      roomCodeInput.value = currentRoom;
      updateRoomBanner();
      setHeadsetState(!!msg.peerConnected);
      break;

    case 'peer_status':
      if (msg.role === 'headset') {
        setHeadsetState(!!msg.connected);
      }
      break;

    case 'state_update':
      renderMirrorState(msg);
      break;

    case 'metrics_update':
      renderMetrics(msg);
      break;

    case 'config_update':
      // Última configuración guardada para esta sala (llega al conectar la tablet).
      fillForm(msg.config);
      break;

    case 'config_forwarded':
      setCfgStatus('Enviada. Esperando confirmación del visor…');
      clearTimeout(ackTimer);
      ackTimer = setTimeout(() => {
        setCfgStatus('El visor no confirmó. Revisa que esté conectado y vuelve a enviar.', 'warn');
        resetApplyButton();
      }, 6000);
      break;

    case 'config_saved':
      clearTimeout(ackTimer);
      setCfgStatus(msg.message || 'Configuración guardada; se aplicará cuando el visor se conecte.', 'warn');
      configDirty = false;
      resetApplyButton();
      break;

    case 'config_applied':
      clearTimeout(ackTimer);
      configDirty = false;
      if (msg.config) fillForm(msg.config, true);
      setCfgStatus('✔ Aplicado en el visor.', 'ok');
      if ($('cfgActive')) $('cfgActive').textContent = 'Configuración activa en el visor: ' + describeConfig(msg.config);
      if ($('applyCfgBtn')) $('applyCfgBtn').textContent = '✔ Configuración aplicada en el visor';
      setTimeout(resetApplyButton, 2500);
      if (msg.config) {
        currentMetrics.config = msg.config;
        currentMetrics.reps = msg.config.reps;
        currentMetrics.minutes = msg.config.minutes;
        renderMetrics({});
      }
      break;

    case 'session_reset':
      applyLocalReset();
      break;

    case 'error':
      console.warn('[SERVER ERROR]', msg.message);
      break;

    default:
      break;
  }
}

/* ---------- Tarjeta espejo ---------- */

function renderMirrorState(state) {
  lastState = state;
  currentPhase = state.phase;
  currentPhaseBadge.textContent = 'Fase: ' + String(state.phase || '-').toUpperCase();
  updateSessionNote();
  updatePauseButton();

  // El visor salió de realidad virtual: se muestra un cierre claro y la opción de preparar otra sesión.
  if (currentPhase === 'idle') {
    mirrorTitle.textContent = currentMetrics.sessionEnded ? 'Sesión finalizada' : 'Visor fuera de realidad virtual';
    mirrorLines.textContent = currentMetrics.sessionEnded
      ? 'Los datos finales quedan en pantalla. Para otra sesión, pulsa «Nueva sesión» y pide que toquen «Entrar en Realidad Virtual» en el visor.'
      : 'Esperando que se toque «Entrar en Realidad Virtual» en el visor.';
    mirrorButtonsContainer.innerHTML = '';
    const nb = document.createElement('button');
    nb.type = 'button';
    nb.className = 'action-btn';
    nb.textContent = '🔄 Nueva sesión';
    nb.onclick = startNewSession;
    mirrorButtonsContainer.appendChild(nb);
    return;
  }

  const model = state.model || {};
  mirrorTitle.textContent = model.title || 'Sesión en curso';

  if (Array.isArray(model.lines)) {
    mirrorLines.innerHTML = '';
    model.lines.forEach((line, i) => {
      if (i > 0) mirrorLines.appendChild(document.createElement('br'));
      mirrorLines.appendChild(document.createTextNode(String(line)));
    });
  } else {
    mirrorLines.textContent = model.lines || '';
  }

  mirrorButtonsContainer.innerHTML = '';

  // La escala de dolor (EVN) ya no se usa. Si el visor la pide es porque tiene una versión anterior abierta.
  if (currentPhase === 'painBefore' || currentPhase === 'painAfter') {
    const note = document.createElement('div');
    note.className = 'pc-status';
    note.dataset.kind = 'warn';
    note.style.width = '100%';
    note.textContent = 'El visor está usando una versión anterior que todavía pregunta el dolor. Recarga la página en el visor (calmaenmovimiento.vercel.app) para actualizarlo.';
    mirrorButtonsContainer.appendChild(note);
    if (currentPhase === 'painAfter') appendSurveySkipButtons();
    return;
  }

  // 2. Escala de Satisfacción (1 a 5)
  if (currentPhase === 'satisfaction') {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
    grid.style.gap = '8px';
    grid.style.width = '100%';

    const labels = ['1 (Nada)', '2', '3 (Normal)', '4', '5 (Muy agradable)'];
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn ' + (i >= 4 ? '' : 'secondary-btn');
      btn.textContent = labels[i - 1];
      btn.onclick = () => triggerRemoteButton('sat:' + i);
      grid.appendChild(btn);
    }
    mirrorButtonsContainer.appendChild(grid);
    appendSurveySkipButtons();
    return;
  }

  // Sala de descanso: el paciente sigue dentro de VR y el evaluador decide qué sigue desde la tablet.
  if (currentPhase === 'rest') {
    appendRestControls();
    return;
  }

  // 3. Botones estándar de la tarjeta enviados por el visor
  if (model.buttons && model.buttons.length > 0) {
    for (const b of model.buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn ' + (b.secondary ? 'secondary-btn' : '');
      btn.textContent = b.label;
      btn.onclick = () => triggerRemoteButton(b.id);
      mirrorButtonsContainer.appendChild(btn);
    }
    return;
  }

  // Si no hay botones en el modelo
  const emptyNote = document.createElement('div');
  emptyNote.style.color = 'var(--muted)';
  emptyNote.style.fontSize = '0.9rem';
  emptyNote.textContent = '(Sin botones interactivos en esta pantalla)';
  mirrorButtonsContainer.appendChild(emptyNote);
}

// Sala de descanso: la sesión terminó y quedó guardada; el paciente sigue dentro del jardín.
function appendRestControls() {
  const mk = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'action-btn ' + cls;
    b.textContent = label;
    b.style.width = '100%';
    b.style.marginTop = '8px';
    b.onclick = fn;
    mirrorButtonsContainer.appendChild(b);
  };
  mk('▶ Nueva sesión (mismo paciente, mismo alcance)', '', () => startNewSessionInVR(false));
  mk('🎯 Nueva sesión con calibración (otro paciente)', 'secondary-btn', () => startNewSessionInVR(true));
  mk('⏏ Cerrar realidad virtual', 'secondary-btn', () => {
    if (confirm('¿Cerrar la realidad virtual del paciente? Después habrá que volver a tocar «Entrar en Realidad Virtual» en el visor.')) {
      triggerRemoteButton('leave');
    }
  });
}

// La encuesta final nunca bloquea: se puede omitir una pregunta o terminar sin responder (queda vacío).
function appendSurveySkipButtons() {
  const row = document.createElement('div');
  row.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%; margin-top:10px;';
  const a = document.createElement('button');
  a.type = 'button';
  a.className = 'action-btn secondary-btn';
  a.textContent = 'Omitir pregunta';
  a.onclick = () => triggerRemoteButton('skipQ');
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'action-btn secondary-btn';
  b.textContent = 'Omitir y finalizar';
  b.onclick = () => triggerRemoteButton('skip_survey');
  row.appendChild(a);
  row.appendChild(b);
  mirrorButtonsContainer.appendChild(row);
}

function updateSessionNote() {
  const el = $('sessionNote');
  if (!el) return;
  if (currentPhase === 'play') el.textContent = 'Juego en curso.';
  else if (currentPhase === 'pause') el.textContent = 'Juego en pausa.';
  else if (currentPhase === 'rest') el.textContent = 'Sesión finalizada. El paciente sigue dentro de la realidad virtual.';
  else if (currentPhase === 'idle') el.textContent = currentMetrics.sessionEnded ? 'La última sesión terminó.' : 'Sin sesión en curso.';
  else el.textContent = '';
}

function updatePauseButton() {
  const b = $('directPauseBtn');
  if (!b) return;
  b.textContent = currentPhase === 'pause' ? '▶ Reanudar' : '⏸ Pausar';
}

// Ejecutar comando remoto al visor
function triggerRemoteButton(buttonId) {
  if (!isConnected) {
    alert('No hay conexión con el servidor. Verifica el estado en la barra superior.');
    return;
  }
  send({
    type: 'command',
    action: 'button_click',
    buttonId,
  });
}

/* ---------- Métricas en vivo ---------- */

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function renderMetrics(m) {
  Object.assign(currentMetrics, m);
  const cm = currentMetrics;

  const reps = isNum(cm.reps) && cm.reps > 0 ? cm.reps : DEFAULTS.reps;
  const hits = isNum(cm.hits) ? cm.hits : 0;
  const pct = progressPercent(hits, reps);

  // Progreso de aciertos respecto de la meta de repeticiones
  if ($('progressPercent')) $('progressPercent').textContent = `${pct}% (${hits} / ${reps})`;
  if ($('progressBarFill')) $('progressBarFill').style.width = pct + '%';

  $('chipHits').textContent = `${hits} / ${reps}`;
  const limit = isNum(cm.minutes) && cm.minutes > 0 ? ' / ' + formatTime(cm.minutes * 60) : '';
  $('chipTime').textContent = formatTime(cm.activeSec || 0) + limit;
  $('chipMaxReach').textContent = `${(cm.maxReach || 0).toFixed(2)} m`;

  $('valSatisfaction').textContent = isNum(cm.satisfaction) ? cm.satisfaction + ' / 5' : '-';
  $('valPauses').textContent = cm.pauses || 0;
  if ($('valAttempts')) $('valAttempts').textContent = `${cm.spawned || 0} / ${cm.resolved || 0}`;

  if ($('valHands')) {
    const h = cm.handsSeen;
    $('valHands').textContent = h ? `izquierda ${h.left ? '✔' : '✘'} · derecha ${h.right ? '✔' : '✘'}` : '-';
  }
  if ($('valEndReason')) {
    $('valEndReason').textContent = cm.endReason ? (END_REASONS[cm.endReason] || cm.endReason) : '-';
  }

  $('chipSatisfaction').textContent = isNum(cm.satisfaction) ? cm.satisfaction + ' / 5' : '-';

  // Primera vez que llega la configuración real del visor: el formulario parte con lo que de verdad está activo.
  if (cm.config && !formFilled) fillForm(cm.config);
  if (cm.config && $('cfgActive')) $('cfgActive').textContent = 'Configuración activa en el visor: ' + describeConfig(cm.config);

  // Si el visor ya estaba fuera de VR, se redibuja el cierre con los datos recién llegados.
  if (currentPhase === 'idle' && lastState) renderMirrorState(lastState);
  updateSessionNote();
  updateSummaryText();
  updateRoomBanner();
  maybeAutoSaveSession();
}

function activeConfig() {
  return currentMetrics.config || readConfigFromForm();
}

// Mediciones de alcance por movimiento (calibración): una línea cada una.
function measureLines(m) {
  const mm = m && m.measures;
  if (!mm) return [];
  return Object.keys(MEASURE_LABELS).filter((k) => mm[k]).map((k) => `Alcance ${MEASURE_LABELS[k]}: ${describeMeasure(k, mm[k])}`);
}

function updateSummaryText() {
  const m = currentMetrics;
  const c = activeConfig();
  const notes = $('therapistNotes').value.trim();
  const reps = isNum(m.reps) && m.reps > 0 ? m.reps : DEFAULTS.reps;

  const summary = [
    '=== INFORME DE SESIÓN REHABILITACIÓN VR (Calma en Movimiento) ===',
    `Sala: ${currentRoom}`,
    `Actividad: ${MODE_ES[c.gameMode] || c.gameMode}`,
    `Zona: ${c.zone} | Lado: ${SIDE_ES[c.side] || c.side} | Postura: ${POS_ES[c.position] || c.position}`,
    `Objetivos: ${m.hits} alcanzados de ${m.spawned} presentados (meta: ${reps} repeticiones)`,
    `Tiempo activo: ${formatTime(m.activeSec || 0)} (programado: ${c.minutes} min)`,
    `Alcance máximo: ${(m.maxReach || 0).toFixed(2)} m (promedio: ${(m.avgReach || 0).toFixed(2)} m)`,
    ...measureLines(m),
    `Satisfacción (1-5): ${isNum(m.satisfaction) ? m.satisfaction : 'no registrada'}`,
    `Pausas durante la sesión: ${m.pauses || 0}`,
    m.endReason ? `Cómo terminó: ${END_REASONS[m.endReason] || m.endReason}` : '',
    notes ? `Observaciones del kinesiólogo: ${notes}` : '',
  ].filter(Boolean).join('\n');

  $('summaryText').value = summary;
}

/* ---------- Nueva sesión ---------- */

// Limpia lo que muestra la tablet (la sesión anterior ya está guardada en el visor).
function applyLocalReset() {
  localSessionId = '';
  const keepConfig = currentMetrics.config;
  const keepVersion = currentMetrics.version; // la versión del visor no cambia al limpiar la pantalla
  currentMetrics = freshMetrics();
  currentMetrics.version = keepVersion;
  if (keepConfig) {
    currentMetrics.config = keepConfig;
    currentMetrics.reps = keepConfig.reps;
    currentMetrics.minutes = keepConfig.minutes;
  }
  currentPhase = 'idle';
  lastState = null;
  currentPhaseBadge.textContent = 'Fase: -';
  mirrorTitle.textContent = 'Lista para una nueva sesión';
  mirrorLines.textContent = 'Revisa la configuración y pide que toquen «Entrar en Realidad Virtual» en el visor.';
  mirrorButtonsContainer.innerHTML = '';
  $('therapistNotes').value = '';
  updatePauseButton();
  renderMetrics({});
}

function startNewSessionInVR(recalibrate) {
  if (!isConnected) {
    setCfgStatus('Sin conexión con el servidor. No se pudo enviar.', 'warn');
    return;
  }
  applyLocalReset();
  triggerRemoteButton(recalibrate ? 'new_session_calib' : 'new_session');
}

function startNewSession() {
  // Paciente en la sala de descanso (sigue en VR): se parte otra sesión sin salir.
  if (currentPhase === 'rest' || currentPhase === 'results') {
    startNewSessionInVR(false);
    return;
  }
  // No se limpia la pantalla si el visor está en medio de una sesión.
  const busy = lastState && !['idle', 'results', 'bye'].includes(currentPhase);
  if (busy) {
    setCfgStatus('Hay una sesión en curso. Finalízala antes de empezar una nueva.', 'warn');
    return;
  }
  applyLocalReset();
  send({ type: 'session_reset' });
}

/* ---------- Botones ---------- */

// Botones directos de emergencia
$('directPauseBtn').onclick = () => triggerRemoteButton(currentPhase === 'pause' ? 'resume' : 'pause');
$('directRecenterBtn').onclick = () => triggerRemoteButton('recenter');
$('directFinishBtn').onclick = () => {
  if (confirm('¿Confirmas finalizar la sesión del paciente ahora? El paciente seguirá dentro de la realidad virtual.')) {
    triggerRemoteButton('finish');
  }
};
$('newSessionBtn').onclick = startNewSession;

// Aplicar configuración (se envía todo lo que muestra el formulario)
$('applyCfgBtn').onclick = () => {
  if (!isConnected) {
    setCfgStatus('Sin conexión con el servidor. No se pudo enviar.', 'warn');
    return;
  }
  send({ type: 'config_update', config: readConfigFromForm() });
  $('applyCfgBtn').textContent = '⏳ Enviando…';
  setCfgStatus('Enviando…');
};
Object.values(CFG_FIELDS).forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('change', markDirty);
});

// Cambiar código de sala
$('changeRoomBtn').onclick = () => {
  const newCode = roomCodeInput.value.toUpperCase().trim();
  if (newCode && newCode !== currentRoom) {
    currentRoom = newCode;
    updateRoomBanner();
    formFilled = false;
    try { localStorage.setItem('calma_room_code', currentRoom); } catch (e) {}
    send({
      type: 'join_room',
      room: currentRoom,
      role: 'therapist',
    });
  }
};

roomCodeInput.onkeydown = (e) => {
  if (e.key === 'Enter') $('changeRoomBtn').click();
};

// Botón de reintento
$('retryWsBtn').onclick = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  connect();
};

// Copiar resumen
$('copySummaryBtn').onclick = async () => {
  updateSummaryText();
  try {
    await navigator.clipboard.writeText($('summaryText').value);
    alert('Resumen copiado al portapapeles para la ficha clínica.');
  } catch (e) {
    $('summaryText').select();
    document.execCommand('copy');
    alert('Resumen copiado.');
  }
};

// Descargar CSV de esta sesión (separador ";" y coma decimal, para abrir directo en Excel en español).
// Lo que no se registró queda VACÍO, nunca 0 ni "null".
function csvCell(v, decimals) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? (decimals !== undefined ? v.toFixed(decimals) : String(v)).replace('.', ',') : '';
  return String(v).replace(/[;\r\n"]+/g, ' ');
}

$('downloadCsvBtn').onclick = () => {
  updateSummaryText();
  const m = currentMetrics;
  const c = activeConfig();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const header = ['Fecha', 'Sala', 'Zona', 'Lado', 'Aciertos', 'MetaRepeticiones', 'TiempoActivo', 'AlcanceMax', 'Satisfaccion', 'Pausas', 'MotivoFin'];
  const row = [
    dateStr, currentRoom, c.zone, SIDE_ES[c.side] || c.side, m.hits, m.reps, csvCell(m.activeSec || 0, 1), m.hits ? csvCell(m.maxReach, 2) : '',
    m.satisfaction, m.pauses, END_REASONS[m.endReason] || '',
  ].map((v) => csvCell(v));
  const csv = '﻿' + header.join(';') + '\r\n' + row.join(';') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sesion_vr_${currentRoom}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

$('therapistNotes').oninput = updateSummaryText;

/* ---------- Perfil del paciente: guardar la sesión ---------- */

// Identificador de la sesión: el que manda el visor; si el visor es una versión antigua y no lo manda, se genera uno
// aquí (uno por sesión; se renueva al limpiar la pantalla).
let localSessionId = '';
function sessionId() {
  if (currentMetrics.uid) return currentMetrics.uid;
  if (!localSessionId) localSessionId = 'T' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
  return localSessionId;
}

// ¿Hay algo que guardar? (aciertos, tiempo o dolor final registrado)
function sessionHasData() {
  const m = currentMetrics;
  return (m.hits || 0) > 0 || (m.activeSec || 0) > 5 || isNum(m.satisfaction) || !!(m.measures && Object.keys(m.measures).length);
}

// Sesión terminada y con datos finales (el visor ya pasó por las preguntas finales).
function sessionIsFinal() {
  return sessionHasData() && (['results', 'rest', 'bye'].includes(currentPhase) || currentMetrics.sessionEnded);
}

// Arma el registro de la sesión para la planilla. Solo lo que se midió; lo no registrado queda vacío (nunca 0).
// manual = true: el profesional pulsó «Guardar sesión»; se guarda lo que haya aunque el visor no haya cerrado las preguntas.
function buildSessionRecord(manual = false) {
  if (!(manual ? sessionHasData() : sessionIsFinal())) return null;
  const m = currentMetrics;
  const c = activeConfig() || {};
  return {
    id: sessionId(),
    fecha_ts: new Date().toISOString(),
    zona: c.zone || '',
    lado: SIDE_ES[c.side] || c.side || '',
    modo: MODE_ES[c.gameMode] || c.gameMode || '',
    posicion: POS_ES[c.position] || c.position || '',
    aciertos: m.hits,
    meta: m.reps,
    tiempo_activo_s: m.activeSec || 0,
    alcance_max_m: m.hits ? m.maxReach : '',
    alcance_comodo_m: isNum(m.comfortReach) ? m.comfortReach : '',
    alcances: m.measures && Object.keys(m.measures).length ? m.measures : null,
    satisfaccion: isNum(m.satisfaction) ? m.satisfaction : '',
    pausas: m.pauses || 0,
    motivo_fin: END_REASONS[m.endReason] || '',
    notas: $('therapistNotes') ? $('therapistNotes').value : '',
    version_app: APP_VERSION,
  };
}

let autoSaveTimer = null;
function maybeAutoSaveSession() {
  if (!patientsPanel || !patientsPanel.selected || !patientsPanel.signedIn) return;
  if (!sessionIsFinal() || patientsPanel.savedUids.has(sessionId())) return;
  if (autoSaveTimer) return;
  // Se espera un momento: los últimos datos (dolor final, satisfacción) pueden llegar justo después del cambio de fase.
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    const rec = buildSessionRecord();
    if (rec && patientsPanel.selected && !patientsPanel.savedUids.has(rec.id)) patientsPanel.saveSession(rec);
  }, 1800);
}

const patientsPanel = new PatientsPanel($('patientCard'), {
  buildSession: () => buildSessionRecord(true),
});

/* ---------- Banner de sala / casco ---------- */

function updateRoomBanner() {
  const code = $('rbCode');
  if (!code) return;
  const m = /^HOSPITAL-(\d+)$/.exec(currentRoom);
  // Casco conocido: título «Casco N» y el código de sala pequeño al lado. Sala personalizada: se muestra el código.
  code.textContent = m ? 'Casco ' + m[1] : currentRoom;
  $('rbCasco').textContent = m ? currentRoom : 'Sala personalizada';
  const st = $('rbState');
  if (!isConnected) { st.textContent = 'Sin conexión con el servidor'; st.dataset.on = '-1'; }
  else if (isHeadsetOnline) { st.textContent = 'Visor conectado 🟢'; st.dataset.on = '1'; }
  else { st.textContent = 'Esperando visor… ⏳'; st.dataset.on = '0'; }
  document.querySelectorAll('.rb-pill').forEach((b) => b.setAttribute('aria-pressed', b.dataset.room === currentRoom ? 'true' : 'false'));

  // Versión del visor: si es distinta de la de esta pantalla, el visor tiene la página vieja abierta y hay que recargarla.
  const ver = $('rbVer');
  if (ver) {
    const seen = isHeadsetOnline && currentMetrics.config; // ya llegó información del visor
    if (!seen) { ver.textContent = ''; ver.dataset.warn = '0'; }
    else if (currentMetrics.version === APP_VERSION) { ver.textContent = 'Visor v' + APP_VERSION; ver.dataset.warn = '0'; }
    else { ver.textContent = '⚠ Visor desactualizado' + (currentMetrics.version ? ' (v' + currentMetrics.version + ')' : '') + ': recarga la página en el Quest'; ver.dataset.warn = '1'; }
  }
}

document.querySelectorAll('.rb-pill').forEach((b) => {
  b.onclick = () => {
    // Cambiar de sala a mitad de una sesión desconecta esta tablet de su visor: se pide confirmar.
    if (b.dataset.room !== currentRoom && currentPhase !== 'idle' && !confirm('Hay una sesión en curso en ' + currentRoom + '. ¿Cambiar a ' + b.dataset.room + ' de todas formas?')) return;
    roomCodeInput.value = b.dataset.room;
    $('changeRoomBtn').onclick();
  };
});

// Conectar al cargar
renderMetrics({});
updateRoomBanner();
connect();
