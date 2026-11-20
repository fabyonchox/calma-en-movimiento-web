// Audio espacial 3D: cada sonido sale desde el lugar donde ocurre y cambia al girar la cabeza (HRTF de Web Audio).
// Suave a propósito: el sonido se atenúa poco con la distancia y nunca se amplifica (nada de sustos).
// Si el navegador no lo permite, o el terapeuta lo apaga desde la tablet, los sonidos vuelven al paneo izquierda/derecha.

export class Spatial {
  // getCtx: () => AudioContext | null ; getAnchor: () => Object3D (origen del juego) ; V3: THREE.Vector3
  constructor(getCtx, getAnchor, V3) {
    this.getCtx = getCtx;
    this.getAnchor = getAnchor;
    this.V3 = V3;
    this.enabled = true;
    this.tmp = new V3();
    this.fwd = new V3();
    this.up = new V3();
  }

  on() {
    const c = this.getCtx && this.getCtx();
    return !!(this.enabled && c && typeof c.createPanner === 'function' && c.listener);
  }

  // Posición en el mundo de algo que está en el juego: un objeto 3D, o un punto {x, y, z} medido desde el origen del juego.
  world(p) {
    const a = this.getAnchor && this.getAnchor();
    if (p && p.isObject3D) { p.getWorldPosition(this.tmp); return this.tmp; }
    this.tmp.set(p.x || 0, p.y === undefined ? 1.2 : p.y, p.z || 0);
    if (a) a.localToWorld(this.tmp);
    return this.tmp;
  }

  // Panner HRTF ubicado en p. Conectar la fuente al resultado y el resultado al destino.
  panner(c, p, { ref = 1, rolloff = 0.7 } = {}) {
    const n = c.createPanner();
    n.panningModel = 'HRTF';
    n.distanceModel = 'inverse';
    n.refDistance = ref;
    n.rolloffFactor = rolloff;
    n.maxDistance = 60;
    const w = this.world(p);
    this.set(n, 'position', w.x, w.y, w.z, c);
    return n;
  }

  set(node, name, x, y, z, c) {
    const X = node[name + 'X'];
    if (X && X.setValueAtTime) {
      const t = c.currentTime;
      X.setValueAtTime(x, t); node[name + 'Y'].setValueAtTime(y, t); node[name + 'Z'].setValueAtTime(z, t);
    } else if (name === 'position' && node.setPosition) node.setPosition(x, y, z);
  }

  // Cada cuadro: el "oído" sigue a la cabeza (posición y hacia dónde mira)
  update(cam) {
    const c = this.getCtx && this.getCtx();
    if (!c || !c.listener || !cam || !this.enabled) return;
    try {
      const L = c.listener;
      cam.updateMatrixWorld();
      this.tmp.setFromMatrixPosition(cam.matrixWorld);
      this.fwd.set(0, 0, -1).transformDirection(cam.matrixWorld);
      this.up.set(0, 1, 0).transformDirection(cam.matrixWorld);
      if (L.positionX) {
        const t = c.currentTime;
        L.positionX.setValueAtTime(this.tmp.x, t); L.positionY.setValueAtTime(this.tmp.y, t); L.positionZ.setValueAtTime(this.tmp.z, t);
        L.forwardX.setValueAtTime(this.fwd.x, t); L.forwardY.setValueAtTime(this.fwd.y, t); L.forwardZ.setValueAtTime(this.fwd.z, t);
        L.upX.setValueAtTime(this.up.x, t); L.upY.setValueAtTime(this.up.y, t); L.upZ.setValueAtTime(this.up.z, t);
      } else if (L.setPosition) {
        L.setPosition(this.tmp.x, this.tmp.y, this.tmp.z);
        L.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
      }
    } catch (e) { /* el audio nunca debe detener el juego */ }
  }
}
