/**
 * Cliente de Sincronizacion WebXR para el Visor ("Calma en Movimiento")
 *
 * - Invisible para el paciente: no muestra codigos ni errores de conexion.
 * - Modo autonomo resiliente: si no hay conexion, no interrumpe la experiencia VR.
 * - Reconexion automatica exponencial silenciosa.
 * - Emite cambios de fase (state_update) y metricas (metrics_update).
 * - Ejecuta comandos remotos (button_click) enviados desde la tablet del kinesiologo.
 */

import { getSyncServerUrl, getSessionCode } from './sync-config.js';

export class HeadsetSyncClient {
  constructor({ onCommand, onConfigUpdate, onRequestSync, onSessionReset } = {}) {
    this.onRequestSync = onRequestSync || null;
    this.onSessionReset = onSessionReset || (() => {});
    this.onCommand = onCommand || (() => {});
    this.onConfigUpdate = onConfigUpdate || (() => {});
    this.ws = null;
    this.roomCode = getSessionCode();
    this.isConnected = false;
    this.peerConnected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 1500;
    this.lastState = null;
    this.lastMetrics = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      const url = getSyncServerUrl();
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectDelay = 1500;
        this.send({
          type: 'join_room',
          room: this.roomCode,
          role: 'headset',
        });

        if (this.lastState) this.send(this.lastState);
        if (this.lastMetrics) this.send(this.lastMetrics);
      };

      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        this.handleMessage(msg);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.peerConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        // Silencioso para el paciente
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(15000, this.reconnectDelay * 1.5);
      this.connect();
    }, this.reconnectDelay);
  }

  send(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {}
    }
  }

  sendState(phase, model, gameMode) {
    const payload = {
      type: 'state_update',
      phase,
      gameMode,
      model: model ? {
        title: model.title || '',
        lines: model.lines || [],
        buttons: (model.buttons || []).map((b) => ({ id: b.id, label: b.label, secondary: !!b.secondary })),
        progress: model.progress ?? null,
        badge: model.badge || null,
      } : null,
    };
    this.lastState = payload;
    this.send(payload);
  }

  // Confirma a la tablet qué configuración quedó realmente activa en el visor.
  sendConfigApplied(config) {
    this.send({ type: 'config_applied', config });
  }

  sendMetrics(metrics) {
    const payload = {
      type: 'metrics_update',
      ...metrics,
      timestamp: Date.now(),
    };
    this.lastMetrics = payload;
    this.send(payload);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room_joined':
        this.peerConnected = !!msg.peerConnected;
        break;

      case 'peer_status':
        if (msg.role === 'therapist') {
          this.peerConnected = !!msg.connected;
          if (this.peerConnected) {
            if (this.onRequestSync) {
              this.onRequestSync();
            } else {
              if (this.lastState) this.send(this.lastState);
              if (this.lastMetrics) this.send(this.lastMetrics);
            }
          }
        }
        break;

      case 'request_sync':
        if (this.onRequestSync) {
          this.onRequestSync();
        } else {
          if (this.lastState) this.send(this.lastState);
          if (this.lastMetrics) this.send(this.lastMetrics);
        }
        break;

      case 'session_reset':
        this.onSessionReset();
        break;

      case 'command':
        if (msg.action === 'button_click' && msg.buttonId) {
          this.onCommand(msg.buttonId, true);
        }
        break;

      case 'config_update':
        if (msg.config) {
          this.onConfigUpdate(msg.config, !!msg.cached);
        }
        break;

      default:
        break;
    }
  }
}
