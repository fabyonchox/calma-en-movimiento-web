// Service worker de Calma en Movimiento: permite abrir el juego (y la pantalla del terapeuta) sin internet.
// Con internet SIEMPRE se usa la versión más nueva (red primero, sin copias del navegador); sin internet o con red muy lenta (8 s), la última copia guardada.
// Para publicar una versión nueva no hace falta tocar nada aquí: la red tiene prioridad.
const CACHE = 'calma-v13';
const ASSETS = [
  './', './index.html', './terapeuta.html', './game.js', './logic.js', './vrui.js', './sync-client.js', './sync-config.js',
  './terapeuta.js', './pacientes.js', './pacientes-config.js', './feria_escena.js', './feria_fisica.js', './critters.js', './guia.js', './sfx.js', './audio3d.js', './respira.js', './respira_logica.js', './ambiente.js', './musica.js', './espacio.js', './fonts/fredoka-latin-600-normal.woff2', './fonts/fredoka-latin-700-normal.woff2', './audio/guia/manifest.json', './libs/three.module.min.js',
];
const NET_TIMEOUT_MS = 8000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Si un archivo falla no se cancela todo: se guarda lo que se pueda.
    await Promise.all(ASSETS.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS);
    fetch(request, { cache: 'no-cache' }).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fuentes de Google, etc.: sin intervenir
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fromNetwork(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = url.pathname.replace(/\/$/, '').endsWith('terapeuta') ? './terapeuta.html' : './index.html';
        const fallback = await cache.match(page);
        if (fallback) return fallback;
      }
      return new Response('Sin conexión y esta página aún no se guardó. Ábrela una vez con internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
