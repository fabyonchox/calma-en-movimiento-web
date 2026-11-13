// Perfiles de pacientes en la pantalla del terapeuta.
// - Ingreso con Google; los datos viven en la planilla de Google del servicio (Apps Script), nunca en el visor ni en el
//   servidor de sincronización. El visor solo conoce un código seudónimo (PACIENTE_001).
// - Nada de esto se guarda en el navegador (ni localStorage ni caché): la lista de pacientes vive solo en memoria.
// - Todo el texto que viene de la planilla se pinta con textContent (nunca innerHTML).
import { PACIENTES_API_URL, GOOGLE_CLIENT_ID, CONSENT_VERSION, CONSENT_TEXT } from './pacientes-config.js';

/* ---------------- Utilidades ---------------- */

export function normalizarRut(rut) {
  const limpio = String(rut || '').replace(/[.\s-]/g, '').toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0; let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += Number(cuerpo[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const r = 11 - (suma % 11);
  const esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  if (dv !== esperado) return null;
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids) if (kid) e.append(kid);
  return e;
}

function decodeJwt(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(b).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (e) { return null; }
}

const fmtFecha = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};
const num = (v, dec = 2) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? '–' : Number(v).toFixed(dec).replace('.', ','));

/* ---------------- Panel ---------------- */

export class PatientsPanel {
  // root: contenedor del panel. hooks: { buildSession() -> objeto de sesión o null, onSelect(patient|null) }
  constructor(root, hooks = {}) {
    this.root = root;
    this.hooks = hooks;
    this.enabled = !!(PACIENTES_API_URL && GOOGLE_CLIENT_ID);
    this.token = null;
    this.exp = 0;
    this.email = '';
    this.patients = [];
    this.selectedId = null;
    this.sessions = null;
    this.status = '';
    this.statusKind = '';
    this.savedUids = new Set();
    this.pending = new Map(); // uid -> sesión que no se pudo guardar (solo en memoria)
    this.gisReady = false;
    this.render();
    if (this.enabled) this.loadGis();
  }

  get selected() { return this.patients.find((p) => p.id === this.selectedId) || null; }
  get signedIn() { return !!this.token && Date.now() / 1000 < this.exp - 30; }

  setStatus(text, kind = '') { this.status = text; this.statusKind = kind; const s = this.root.querySelector('[data-status]'); if (s) { s.textContent = text; s.dataset.kind = kind; } }

  /* ----- Ingreso con Google ----- */

  loadGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) { this.initGis(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => this.initGis();
    s.onerror = () => this.setStatus('No se pudo cargar el ingreso con Google (¿sin internet?). Los perfiles no están disponibles.', 'warn');
    document.head.appendChild(s);
  }

  initGis() {
    this.gisReady = true;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp) => this.onCredential(resp.credential),
      auto_select: true,
      cancel_on_tap_outside: false,
    });
    this.render();
    if (!this.signedIn) { try { window.google.accounts.id.prompt(); } catch (e) { /* nada */ } }
  }

  async onCredential(idToken) {
    const p = decodeJwt(idToken);
    if (!p) { this.setStatus('No se pudo leer el ingreso de Google.', 'warn'); return; }
    this.token = idToken; this.exp = Number(p.exp) || 0; this.email = String(p.email || '');
    this.setStatus('');
    this.render();
    await this.refresh();
  }

  signOut(msg) {
    this.token = null; this.exp = 0; this.patients = []; this.selectedId = null; this.sessions = null;
    try { if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect(); } catch (e) { /* nada */ }
    this.status = msg || ''; this.statusKind = msg ? 'warn' : '';
    this.render();
    if (this.hooks.onSelect) this.hooks.onSelect(null);
  }

  /* ----- API ----- */

  async api(action, data = {}) {
    if (!this.signedIn) { this.signOut('Tu ingreso de Google venció. Vuelve a ingresar.'); throw new Error('auth'); }
    let json;
    try {
      const res = await fetch(PACIENTES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // sin preflight CORS
        body: JSON.stringify({ action, idToken: this.token, ...data }),
        redirect: 'follow',
      });
      json = await res.json();
    } catch (e) {
      throw new Error('Sin conexión con la planilla. Revisa tu internet e inténtalo de nuevo.');
    }
    if (json && json.code === 'AUTH') {
      this.signOut('Esta cuenta no está autorizada o el ingreso venció. Pide que agreguen tu correo a la lista autorizada.');
      throw new Error('auth');
    }
    if (!json || !json.ok) throw new Error((json && json.error) || 'Error al hablar con la planilla.');
    return json;
  }

  async refresh() {
    try {
      this.setStatus('Cargando pacientes…');
      const r = await this.api('listPatients');
      this.patients = (r.patients || []).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      if (!this.selected) this.selectedId = null;
      this.setStatus('');
    } catch (e) { if (e.message !== 'auth') this.setStatus(e.message, 'warn'); }
    this.render();
  }

  /* ----- Selección ----- */

  async select(id) {
    this.selectedId = id || null;
    this.sessions = null;
    this.render();
    if (this.hooks.onSelect) this.hooks.onSelect(this.selected);
    if (this.selected) await this.loadSessions();
  }

  async loadSessions() {
    const p = this.selected;
    if (!p) return;
    try {
      const r = await this.api('listSessions', { patientId: p.id });
      if (this.selectedId === p.id) { this.sessions = r.sessions || []; this.render(); }
    } catch (e) { if (e.message !== 'auth') this.setStatus(e.message, 'warn'); }
  }

  /* ----- Guardar sesión ----- */

  async saveSession(session, manual = false) {
    const p = this.selected;
    if (!p || !this.signedIn || !session || !session.id) return false;
    try {
      this.setStatus('Guardando la sesión en el perfil…');
      await this.api('saveSession', { session: { ...session, pacienteId: p.id } });
      this.savedUids.add(session.id);
      this.pending.delete(session.id);
      this.setStatus('✔ Sesión guardada en el perfil de ' + p.codigo + (manual ? ' (actualizada)' : ''), 'ok');
      await this.loadSessions();
      return true;
    } catch (e) {
      if (e.message !== 'auth') {
        this.pending.set(session.id, session);
        this.setStatus('No se pudo guardar: ' + e.message + ' Pulsa «Guardar sesión en el perfil» para reintentar.', 'warn');
      }
      return false;
    }
  }

  /* ----- Vista ----- */

  render() {
    const r = this.root;
    r.textContent = '';
    r.append(el('h2', { text: '🧑‍⚕️ Paciente' }));

    if (!this.enabled) {
      r.append(el('p', { class: 'pc-muted', text: 'Los perfiles de paciente aún no están configurados. Mientras tanto, la pantalla funciona como siempre (sin perfiles).' }));
      return;
    }
    if (!this.signedIn) {
      r.append(el('p', { class: 'pc-muted', text: 'Ingresa con tu cuenta de Google para ver y guardar tus pacientes. Cada profesional ve solo a sus pacientes.' }));
      const slot = el('div', { id: 'gsiButton', class: 'pc-gsi' });
      r.append(slot);
      if (this.gisReady) {
        try { window.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'es', shape: 'pill' }); } catch (e) { /* nada */ }
      }
      r.append(el('div', { class: 'pc-status', 'data-status': '', 'data-kind': this.statusKind, text: this.status }));
      return;
    }

    // Cabecera de sesión
    r.append(el('div', { class: 'pc-who' },
      el('span', { text: 'Ingresaste como ' + this.email }),
      el('button', { type: 'button', class: 'pc-link', text: 'Salir', onclick: () => this.signOut('') })));

    // Selector
    const sel = el('select', { id: 'pcSelect', 'aria-label': 'Paciente' });
    sel.append(el('option', { value: '', text: this.patients.length ? '— Elige un paciente —' : '— Aún no hay pacientes —' }));
    for (const p of this.patients) sel.append(el('option', { value: p.id, text: p.codigo + ' · ' + p.nombre }));
    sel.value = this.selectedId || '';
    sel.onchange = () => this.select(sel.value);
    r.append(sel);

    r.append(el('div', { class: 'pc-actions' },
      el('button', { type: 'button', class: 'action-btn', text: '＋ Nuevo paciente', onclick: () => this.openForm(null) }),
      this.selected ? el('button', { type: 'button', class: 'action-btn secondary-btn', text: '✎ Editar', onclick: () => this.openForm(this.selected) }) : null));

    const p = this.selected;
    if (p) {
      r.append(el('div', { class: 'pc-summary' },
        el('div', { class: 'pc-name', text: p.nombre }),
        el('div', { class: 'pc-meta', text: 'RUT ' + p.rut + (p.edad !== null && p.edad !== '' ? ' · ' + p.edad + ' años' : '') + ' · ' + p.codigo }),
        p.diagnostico ? el('div', { class: 'pc-dx' }, el('b', { text: 'Diagnóstico de base: ' }), document.createTextNode(p.diagnostico)) : null,
        p.notas ? el('div', { class: 'pc-dx' }, el('b', { text: 'Notas: ' }), document.createTextNode(p.notas)) : null,
        el('div', { class: 'pc-meta', text: 'Consentimiento informado: ' + (p.consentimiento_ts ? fmtFecha(p.consentimiento_ts) : 'sin registro') })));

      r.append(el('button', { type: 'button', class: 'action-btn secondary-btn', id: 'pcSaveSession', text: '💾 Guardar sesión en el perfil',
        onclick: () => { const s = this.hooks.buildSession && this.hooks.buildSession(); if (!s) { this.setStatus('Aún no hay una sesión terminada para guardar.', 'warn'); return; } this.saveSession(s, this.savedUids.has(s.id)); } }));

      r.append(this.historyView());
    } else {
      r.append(el('p', { class: 'pc-muted', text: 'Elige un paciente para que cada sesión quede guardada en su perfil (dolor inicial y final, alcance, aciertos).' }));
    }
    r.append(el('div', { class: 'pc-status', 'data-status': '', 'data-kind': this.statusKind, text: this.status }));
  }

  historyView() {
    const d = el('details', { class: 'pc-history', open: true });
    d.append(el('summary', { text: 'Historial de sesiones' + (this.sessions ? ' (' + this.sessions.length + ')' : '') }));
    if (!this.sessions) { d.append(el('p', { class: 'pc-muted', text: 'Cargando…' })); return d; }
    if (!this.sessions.length) { d.append(el('p', { class: 'pc-muted', text: 'Todavía no hay sesiones guardadas para este paciente.' })); return d; }
    const t = el('table', { class: 'pc-table' });
    t.append(el('thead', null, el('tr', null, ...['Fecha', 'Zona', 'Aciertos', 'Alcance máx.', 'Dolor ini→fin', 'Satisf.'].map((h) => el('th', { text: h })))));
    const tb = el('tbody');
    for (const s of [...this.sessions].reverse()) {
      tb.append(el('tr', null,
        el('td', { text: fmtFecha(s.fecha_ts) }),
        el('td', { text: String(s.zona || '–') }),
        el('td', { text: (s.aciertos === '' ? '–' : s.aciertos) + (s.meta !== '' ? ' / ' + s.meta : '') }),
        el('td', { text: num(s.alcance_max_m) + (s.alcance_max_m === '' ? '' : ' m') }),
        el('td', { text: (s.dolor_pre === '' ? '–' : s.dolor_pre) + ' → ' + (s.dolor_post === '' ? '–' : s.dolor_post) }),
        el('td', { text: s.satisfaccion === '' ? '–' : s.satisfaccion })));
    }
    t.append(tb);
    d.append(el('div', { class: 'pc-tablewrap' }, t));
    return d;
  }

  /* ----- Formulario (crear / editar) ----- */

  openForm(p) {
    const editing = !!p;
    const dlg = el('dialog', { class: 'pc-dialog' });
    const f = {
      nombre: el('input', { type: 'text', id: 'pcNombre', maxlength: '120', autocomplete: 'off', value: p ? p.nombre : '' }),
      rut: el('input', { type: 'text', id: 'pcRut', maxlength: '12', autocomplete: 'off', placeholder: '12.345.678-5', value: p ? p.rut : '' }),
      edad: el('input', { type: 'text', id: 'pcEdad', inputmode: 'numeric', maxlength: '3', autocomplete: 'off', value: p && p.edad !== null ? String(p.edad) : '' }),
      dx: el('textarea', { id: 'pcDx', rows: '3', maxlength: '2000', placeholder: 'Ej: SDRC tipo I post fractura de radio distal derecho, 6 semanas de evolución' }),
      notas: el('textarea', { id: 'pcNotas', rows: '2', maxlength: '2000' }),
    };
    f.dx.value = p ? p.diagnostico || '' : '';
    f.notas.value = p ? p.notas || '' : '';
    const consent = el('input', { type: 'checkbox', id: 'pcConsent' });
    const err = el('div', { class: 'pc-status', 'data-kind': 'warn', role: 'alert' });
    const field = (label, input, id) => el('div', { class: 'pc-field' }, el('label', { for: id, text: label }), input);

    const save = el('button', { type: 'button', class: 'action-btn', text: editing ? 'Guardar cambios' : 'Crear paciente' });
    const cancel = el('button', { type: 'button', class: 'action-btn secondary-btn', text: 'Cancelar', onclick: () => { dlg.close(); dlg.remove(); } });
    const del = editing ? el('button', { type: 'button', class: 'action-btn danger-btn', text: '🗑 Eliminar paciente' }) : null;

    save.onclick = async () => {
      err.textContent = '';
      const nombre = f.nombre.value.trim();
      const rut = normalizarRut(f.rut.value);
      const edadTxt = f.edad.value.trim();
      const edad = edadTxt === '' ? '' : Number(edadTxt);
      if (nombre.length < 2) { err.textContent = 'Escribe el nombre.'; return; }
      if (!rut) { err.textContent = 'El RUT no es válido (revisa el dígito verificador).'; return; }
      if (edad !== '' && !(Number.isInteger(edad) && edad >= 0 && edad <= 120)) { err.textContent = 'La edad debe ser un número entre 0 y 120.'; return; }
      if (!editing && !consent.checked) { err.textContent = 'Debes confirmar el consentimiento informado.'; return; }
      save.disabled = true; save.textContent = 'Guardando…';
      try {
        const patient = { id: p ? p.id : undefined, nombre, rut, edad, diagnostico: f.dx.value, notas: f.notas.value };
        if (!editing) { patient.consentimiento = true; patient.consentimiento_version = CONSENT_VERSION; }
        const r = await this.api('savePatient', { patient });
        await this.refresh();
        dlg.close(); dlg.remove();
        await this.select(r.patient.id);
      } catch (e) {
        if (e.message !== 'auth') { err.textContent = e.message; save.disabled = false; save.textContent = editing ? 'Guardar cambios' : 'Crear paciente'; } else { dlg.close(); dlg.remove(); }
      }
    };

    if (del) {
      del.onclick = async () => {
        const ok = confirm('¿Eliminar a ' + p.codigo + ' (' + p.nombre + ') y TODAS sus sesiones?\n\nEsta acción no se puede deshacer. Quedará un registro anónimo de la eliminación.');
        if (!ok) return;
        del.disabled = true;
        try {
          const r = await this.api('deletePatient', { id: p.id });
          this.savedUids.clear();
          dlg.close(); dlg.remove();
          this.selectedId = null; this.sessions = null;
          if (this.hooks.onSelect) this.hooks.onSelect(null);
          await this.refresh();
          this.setStatus('Paciente eliminado (' + (r.sesionesEliminadas || 0) + ' sesiones).', 'ok');
        } catch (e) { if (e.message !== 'auth') { err.textContent = e.message; del.disabled = false; } }
      };
    }

    dlg.append(
      el('h3', { text: editing ? 'Editar paciente' : 'Nuevo paciente' }),
      field('Nombre completo', f.nombre, 'pcNombre'),
      el('div', { class: 'pc-row' }, field('RUT', f.rut, 'pcRut'), field('Edad (años)', f.edad, 'pcEdad')),
      field('Diagnóstico de base (incluye si tiene SDRC u otro)', f.dx, 'pcDx'),
      field('Notas', f.notas, 'pcNotas'),
      editing
        ? el('p', { class: 'pc-muted', text: 'Consentimiento informado registrado: ' + (p.consentimiento_ts ? fmtFecha(p.consentimiento_ts) : 'sin registro') })
        : el('label', { class: 'pc-consent', for: 'pcConsent' }, consent, el('span', { text: CONSENT_TEXT })),
      err,
      el('div', { class: 'pc-actions' }, save, cancel, del));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();
    f.nombre.focus();
  }
}
