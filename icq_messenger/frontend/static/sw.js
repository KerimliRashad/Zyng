// Jeff Messenger service worker — минимальный, только для установки PWA.
// Всегда идём в сеть (мессенджеру нужны свежие данные), офлайн — только заглушка.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  // Не трогаем WebSocket/API — только навигацию и статику
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() =>
      new Response('<h2 style="font-family:sans-serif;text-align:center;margin-top:40vh">Нет соединения 📡<br><small>Проверь интернет и обнови страницу</small></h2>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    )
  );
});
