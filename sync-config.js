/**
 * Configuracion del Cliente WebSocket de Sincronizacion
 * Soporta deteccion automatica local, variables por query param, localStorage y fallback a produccion.
 */

export const DEFAULT_ROOM_CODE = 'HOSPITAL-1';

// URL del servidor WebSocket en Render (Actualizar cuando Render te asigne tu subdominio onrender.com)
export const PRODUCTION_WS_URL = 'wss://calma-sync-server.onrender.com';

export function getSyncServerUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:3000';

  const params = new URLSearchParams(window.location.search);

  // 1. Parametro explicito en URL (?ws=wss://... o ?ws=local)
  const paramWs = params.get('ws');
  if (paramWs === 'local') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + window.location.hostname + ':3000';
  }
  if (paramWs) {
    return paramWs.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  }

  // 2. Guardado en almacenamiento local de la tablet
  try {
    const saved = localStorage.getItem('calma_ws_url');
    if (saved) return saved.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  } catch (e) {}

  // 3. Entorno local o de red interna (localhost, 127.0.0.1, 192.168.x.x)
  const host = window.location.hostname;
  const isLocal = ['localhost', '127.0.0.1'].includes(host) || host.startsWith('192.168.') || host.endsWith('.local');
  if (isLocal) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = window.location.port ? ':' + window.location.port : ':3000';
    return proto + '//' + host + port;
  }

  // 4. Produccion por defecto (Netlify -> Servidor en Render)
  return PRODUCTION_WS_URL.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
}

export function getSessionCode() {
  if (typeof window === 'undefined') return DEFAULT_ROOM_CODE;
  const params = new URLSearchParams(window.location.search);
  const codeFromUrl = params.get('sala') || params.get('code') || params.get('room');
  if (codeFromUrl) {
    const clean = codeFromUrl.toUpperCase().trim();
    try { localStorage.setItem('calma_room_code', clean); } catch (e) {}
    return clean;
  }

  // Si el usuario seleccionó un casco (HOSPITAL-1, HOSPITAL-2, HOSPITAL-3)
  try {
    const saved = localStorage.getItem('calma_room_code');
    if (saved) return saved.toUpperCase().trim();
  } catch (e) {}

  // Valor por defecto para pruebas y producción
  return DEFAULT_ROOM_CODE;
}
