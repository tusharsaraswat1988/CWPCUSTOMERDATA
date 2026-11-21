/**
 * CWP Staff Portal - Progressive Web App (PWA) Service Worker
 * Version: cwp-staff-pwa-v1.0.0
 * Features:
 *  - App Shell precaching for offline launch
 *  - Network-first navigation with offline fallback
 *  - Cache-first for static icons, fonts, and assets
 *  - Dynamic network-first fallback for staff portal data
 *  - Immediate update activation with skipWaiting & clientsClaim
 */

const CACHE_NAME = 'cwp-staff-pwa-v1.0.19';

const PRECACHE_ASSETS = [
  '/',
  '/staff',
  '/manifest.json',
  '/offline.html',
  '/cwp_logo.jpg',
  '/css/style.css',
  '/css/m3-tokens.css',
  '/css/staff-m3.css',
  '/fonts/material-symbols-outlined.woff2',
  '/js/app.js',
  '/js/cropper.min.js',
  '/favicon.ico',
  '/icons/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-192x192.png',
  '/icons/maskable-icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png'
];

// Install event: Pre-cache core app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual puts so if one non-critical asset fails, the SW still installs
      return Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[PWA SW] Precache failed for:', url, err.message);
          })
        )
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event: Clean up old cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[PWA SW] Removing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests from caching
  if (req.method !== 'GET') {
    return;
  }

  // 1. Navigation requests (Opening the PWA or navigating pages)
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => {
              // Cache /staff or current navigation URL for offline launch
              cache.put(req, resClone);
            });
          }
          return networkRes;
        })
        .catch(async () => {
          // If offline, try cached page
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;

          // Try cached /staff
          const cachedStaff = await caches.match('/staff');
          if (cachedStaff) return cachedStaff;

          // Try cached root /
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;

          // Fallback to offline page
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 2. Application Scripts and Styles: Network-First so updates take effect immediately
  if (
    url.pathname === '/js/app.js' ||
    url.pathname === '/css/style.css' ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/style.css') ||
    url.pathname.startsWith('/js/app.js') ||
    url.pathname.startsWith('/css/style.css')
  ) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3. Static Assets (Icons, Images, Fonts, Vendor Scripts)
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/cwp_logo.jpg' ||
    url.pathname === '/manifest.json' ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Optional background refresh for CDN assets
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
            }
          }).catch(() => {});
          return cachedRes;
        }

        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 3. API Requests: Network-First with safe fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          // For safe read-only staff queries, update cache
          if (networkRes && networkRes.status === 200 && url.pathname.startsWith('/api/staff-portal/')) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(async () => {
          // Check if we have a cached response for read-only staff queries
          if (url.pathname.startsWith('/api/staff-portal/')) {
            const cachedRes = await caches.match(req);
            if (cachedRes) return cachedRes;
          }
          // Return JSON offline indicator
          return new Response(
            JSON.stringify({
              success: false,
              offline: true,
              error: 'नेटवर्क अनुपलब्ध है। ऑफ़लाइन मोड सक्रिय है।'
            }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }

  // 4. Default: Network with Cache Fallback
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        return networkRes;
      })
      .catch(() => {
        return caches.match(req);
      })
  );
});

// Message listener (e.g. for skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Notification click listener (opens / focuses staff portal)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/staff') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/staff');
      }
    })
  );
});
