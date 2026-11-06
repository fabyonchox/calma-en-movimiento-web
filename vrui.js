// Panel flotante espacial para VR: Glassmorphism translúcido, gradientes y botones táctiles optimizados para Meta Quest 3.
import { layoutButtons, hitTestButtons } from './logic.js';

export class VRPanel {
  constructor(THREE, { width, height, px = 1024 }) {
    this.px = px;
    this.py = Math.round((px * height) / width);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.px;
    this.canvas.height = this.py;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      // Los diálogos se dibujan siempre por encima de la escena (tarros, pelotas, árbol): nada los tapa.
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false })
    );
    this.mesh.renderOrder = 100;
    this.rects = [];
    this.hover = null;
    this.model = null;
    this.key = '';
  }

  set(model) {
    if (!model) return;
    const key = JSON.stringify(model);
    if (key === this.key && this.hover === this.drawnHover) return;
    this.key = key;
    this.model = model;
    this.draw();
  }

  setHover(id) {
    if (id === this.hover) return;
    this.hover = id;
    if (this.model) this.draw();
  }

  hit(uv) {
    return hitTestButtons(this.rects, uv.x * this.px, (1 - uv.y) * this.py);
  }

  draw() {
    try {
      const c = this.ctx;
      const m = this.model;
      if (!m) return;
      const W = this.px;
      const H = this.py;
      this.drawnHover = this.hover;
      c.clearRect(0, 0, W, H);

      // Compatibilidad de roundRect
      if (!c.roundRect) {
        c.roundRect = function(x, y, w, h, r) {
          const rad = typeof r === 'number' ? r : 10;
          this.beginPath();
          this.moveTo(x + rad, y);
          this.lineTo(x + w - rad, y);
          this.quadraticCurveTo(x + w, y, x + w, y + rad);
          this.lineTo(x + w, y + h - rad);
          this.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
          this.lineTo(x + rad, y + h);
          this.quadraticCurveTo(x, y + h, x, y + h - rad);
          this.lineTo(x, y + rad);
          this.quadraticCurveTo(x, y, x + rad, y);
          this.closePath();
          return this;
        };
      }

      // 1. Fondo de cristal translúcido (Glassmorphism con gradiente)
      const bgGrad = c.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0.0, 'rgba(13, 30, 36, 0.99)');
      bgGrad.addColorStop(1.0, 'rgba(18, 48, 56, 0.99)');
      c.fillStyle = bgGrad;
      c.beginPath();
      c.roundRect(8, 8, W - 16, H - 16, 36);
      c.fill();

      // 2. Borde luminoso sutil
      c.strokeStyle = 'rgba(76, 212, 167, 0.35)';
      c.lineWidth = 3;
      c.beginPath();
      c.roundRect(10, 10, W - 20, H - 20, 34);
      c.stroke();

      // 2.5 Badge de modo o estado
      let startY = 32;
      if (m.badge && m.badge.text) {
        c.font = 'bold 18px sans-serif';
        const bText = m.badge.text;
        const bW = c.measureText(bText).width + 36;
        const bH = 34;
        const bX = (W - bW) / 2;
        const bY = 22;
        c.fillStyle = m.badge.bg || 'rgba(86, 226, 182, 0.2)';
        c.beginPath();
        c.roundRect(bX, bY, bW, bH, 17);
        c.fill();
        c.strokeStyle = m.badge.border || 'rgba(86, 226, 182, 0.55)';
        c.lineWidth = 1.5;
        c.stroke();
        c.fillStyle = m.badge.color || '#a8f5df';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(bText, W / 2, bY + bH / 2);
        startY = 70;
      }

      // 3-5. Título, barra de progreso y texto. Se mide primero (sin dibujar) y se reduce la letra
      // hasta que quede espacio para los botones: el texto nunca se encima ni empuja los botones fuera del panel.
      const buttons = m.buttons || [];
      const nB = buttons.length;
      const rowsB = nB ? Math.ceil(nB / Math.min(m.cols || nB, nB)) : 0;
      const minBtnH = nB ? rowsB * 72 + (rowsB - 1) * 14 : 0;
      const textLimit = H - 46 - 12 - minBtnH; // borde inferior permitido para el texto
      const ts0 = m.titleSize || 50;
      const ls0 = m.lineSize || 30;

      const textPass = (k, draw) => {
        const ts = Math.round(ts0 * k);
        const ls = Math.round(ls0 * k);
        let y = startY + ts * 0.85;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = draw ? 'rgba(0, 0, 0, 0.55)' : 'transparent';
        c.shadowBlur = draw ? 8 : 0;
        c.font = 'bold ' + ts + 'px sans-serif';
        c.fillStyle = '#ffffff';
        const titleOut = wrap(c, m.title || '', W / 2, y, W - 110, ts * 1.15, draw);
        y = titleOut.length ? titleOut[titleOut.length - 1].y + ts * 0.5 : y + ts * 0.5;
        c.shadowColor = 'transparent';

        if (m.progress !== undefined && m.progress !== null) {
          const barW = W - 160;
          const barH = 14;
          const barX = 80;
          const barY = y + 4;
          if (draw) {
            c.fillStyle = 'rgba(255, 255, 255, 0.14)';
            c.beginPath();
            c.roundRect(barX, barY, barW, barH, 7);
            c.fill();
            const fillW = Math.max(0, Math.min(barW, barW * m.progress));
            if (fillW > 0) {
              const pGrad = c.createLinearGradient(barX, 0, barX + fillW, 0);
              pGrad.addColorStop(0, '#2ea880');
              pGrad.addColorStop(1, '#56e2b6');
              c.fillStyle = pGrad;
              c.beginPath();
              c.roundRect(barX, barY, fillW, barH, 7);
              c.fill();
            }
          }
          y = barY + barH + 20;
        } else {
          y += ts * 0.25;
        }

        c.font = ls + 'px sans-serif';
        c.fillStyle = '#d5ebe4';
        for (const line of m.lines || []) {
          if (!line || !String(line).trim()) continue;
          const out = wrap(c, line, W / 2, y, W - 130, ls * 1.25, draw);
          if (out.length) y = out[out.length - 1].y + ls * 1.35;
        }
        return y;
      };

      let fit = 1;
      while (fit > 0.55 && textPass(fit, false) > textLimit) fit = Math.round((fit - 0.05) * 100) / 100;
      const y = textPass(fit, true);

      // 6. Botones de interacción
      if (buttons.length) {
        const top = Math.max(y + 12, H * 0.48);
        this.rects = layoutButtons(buttons, { x: 50, y: top, w: W - 100, h: H - top - 46 }, m.cols);
      } else {
        this.rects = [];
      }

      for (const r of this.rects) {
        const hot = r.id === this.hover;
        const isPain = r.id.startsWith('painB:') || r.id.startsWith('painA:');
        const painVal = isPain ? parseInt(r.id.split(':')[1], 10) : null;

        if (hot) {
          const hGrad = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
          hGrad.addColorStop(0, '#66f0c4');
          hGrad.addColorStop(1, '#3ec79c');
          c.fillStyle = hGrad;
        } else if (isPain && painVal !== null) {
          if (painVal <= 2) {
            c.fillStyle = 'rgba(46, 139, 107, 0.85)';
          } else if (painVal <= 5) {
            c.fillStyle = 'rgba(186, 138, 45, 0.85)';
          } else if (painVal <= 7) {
            c.fillStyle = 'rgba(200, 97, 61, 0.85)';
          } else {
            c.fillStyle = 'rgba(184, 61, 61, 0.85)';
          }
        } else if (r.secondary) {
          c.fillStyle = 'rgba(255, 255, 255, 0.10)';
        } else {
          const bGrad = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
          bGrad.addColorStop(0, '#248666');
          bGrad.addColorStop(1, '#1b674e');
          c.fillStyle = bGrad;
        }

        c.beginPath();
        c.roundRect(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h), Math.min(18, Math.max(2, r.h * 0.35)));
        c.fill();

        if (hot) {
          c.strokeStyle = '#ffffff';
          c.lineWidth = 3;
          c.stroke();
        } else if (r.secondary) {
          c.strokeStyle = 'rgba(76, 212, 167, 0.65)';
          c.lineWidth = 2.5;
          c.stroke();
        } else {
          c.strokeStyle = 'rgba(255, 255, 255, 0.18)';
          c.lineWidth = 1.5;
          c.stroke();
        }

        c.fillStyle = hot ? '#082025' : '#ffffff';
        drawLabel(c, r.label, r);
      }

      this.texture.needsUpdate = true;
    } catch (err) {
      console.error('[VRPanel draw error]', err);
    }
  }
}

function wrapLines(c, text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of String(text || '').split(' ')) {
    if (!w) continue;
    const test = cur ? cur + ' ' + w : w;
    if (c.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function wrap(c, text, cx, y, maxW, lineH, draw = true) {
  if (!text) return [];
  const lines = wrapLines(c, text, maxW);
  const out = [];
  let cy = y;
  for (let i = 0; i < lines.length; i++) {
    if (draw) c.fillText(lines[i], cx, cy);
    out.push({ text: lines[i], y: cy });
    cy += lineH;
  }
  return out;
}

// Etiqueta de botón: se parte en líneas y se reduce la letra hasta que quepa dentro de la tarjeta.
function drawLabel(c, label, r) {
  const maxW = Math.max(20, r.w - 28);
  const maxH = Math.max(16, r.h - 14);
  let size = Math.min(40, r.h * 0.44);
  let lines = [];
  for (; size >= 16; size -= 2) {
    c.font = 'bold ' + size + 'px sans-serif';
    lines = wrapLines(c, label, maxW);
    if (lines.length * size * 1.15 <= maxH && lines.every((l) => c.measureText(l).width <= maxW)) break;
  }
  c.font = 'bold ' + Math.max(16, size) + 'px sans-serif';
  const lh = Math.max(16, size) * 1.15;
  const y0 = r.y + r.h / 2 - ((lines.length - 1) * lh) / 2 + 2;
  lines.forEach((l, i) => c.fillText(l, r.x + r.w / 2, y0 + i * lh));
}
