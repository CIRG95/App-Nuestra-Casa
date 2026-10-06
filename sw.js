const V = 'casa-v4';
const SHELL = ['./', 'index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/main.js', 'src/core/utils.js', 'src/core/config.js', 'src/core/dominio.js',
  'src/services/dbInterface.js', 'src/services/googleAuth.js', 'src/services/googleDriveService.js', 'src/services/remindersService.js', 'src/services/actividadService.js',
  'src/ui/state.js', 'src/ui/tema.js', 'src/ui/sheet.js', 'src/ui/components.js', 'src/ui/views.js', 'src/ui/forms.js', 'src/ui/actions.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const ok = u.origin === location.origin || u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com';
  if (!ok) return; // Google (login, Drive, Calendar) va siempre directo a la red
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
