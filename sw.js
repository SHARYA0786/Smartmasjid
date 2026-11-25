// Service Worker for Masjid Connect (Offline Screen + Fast Cache)
const CACHE_NAME = 'masjid-connect-v4';
const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<title>Masjid Connect</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body{min-height:100vh;background:#eef4f0;color:#0f172a;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:340px;background:#ffffff;border:1px solid #d1fae5;border-radius:28px;padding:28px 22px;text-align:center;box-shadow:0 14px 36px rgba(7,56,44,.12)}
.icon{width:76px;height:76px;margin:0 auto 16px;border-radius:9999px;background:#07382c;border:3px solid #eab308;display:flex;align-items:center;justify-content:center;font-size:36px}
h1{font-size:18px;font-weight:900;color:#07382c;margin-bottom:6px}
.sub{font-size:13px;font-weight:700;color:#047857;margin-bottom:10px}
p{font-size:13px;line-height:1.55;color:#475569;margin-bottom:20px}
button{width:100%;padding:13px 16px;border:0;border-radius:16px;background:#07382c;color:#ffffff;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(7,56,44,.22)}
button:active{transform:scale(.97)}
</style>
</head>
<body>
<div class="card">
  <div class="icon">📡</div>
  <h1>इंटरनेट कनेक्शन नहीं है</h1>
  <div class="sub">No Internet Connection</div>
  <p>कृपया अपना मोबाइल डेटा या Wi-Fi चालू करें और नीचे Retry बटन दबाएँ।</p>
  <button type="button" onclick="window.location.reload()">🔄 दोबारा कोशिश करें (Retry)</button>
</div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './core.js',
        './home-nearby.js',
        './imam-profile.js',
        './features/tasbih.js',
        './features/qibla.js',
        './features/ramzan.js',
        './features/namazTracker.js',
        './features/registry.js'
      ]).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/admin') ||
    url.pathname === '/app' ||
    url.pathname.startsWith('/app/') ||
    !url.protocol.startsWith('http')
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            if (req.mode === 'navigate') {
              return caches.match('./index.html').then((idx) => {
                if (idx) return idx;
                return new Response(OFFLINE_HTML, {
                  status: 200,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
              });
            }
            return new Response('', { status: 503 });
          });
        })
    );
  }
});
