// Service Worker für offline Funktionalität und Performance
const CACHE_NAME = 'fifa-tracker-v1.0.0';
const STATIC_CACHE_NAME = 'fifa-tracker-static-v1.0.0';
const DYNAMIC_CACHE_NAME = 'fifa-tracker-dynamic-v1.0.0';

// Ressourcen für offline Verfügbarkeit
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/test-mobile.html',
  '/main.js',
  '/auth.js',
  '/kader.js',
  '/matches.js',
  '/bans.js',
  '/finanzen.js',
  '/stats.js',
  '/spieler.js',
  '/data.js',
  '/modal.js',
  '/connectionMonitor.js',
  '/supabaseClient.js',
  '/css/tailwind-play-output.css',
  '/vendor/flowbite/flowbite.min.css',
  '/vendor/flowbite/flowbite.min.js',
  '/vendor/font-awesome/all.min.css',
  '/assets/logo.png',
  '/manifest.json'
];

// URLs, die nie gecacht werden sollen
const NEVER_CACHE = [
  '/test-db-connectivity.js'
];

// Install Event - Cache statische Ressourcen
self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('Service Worker: Static assets cached');
        return self.skipWaiting(); // Sofort aktivieren
      })
      .catch(error => {
        console.error('Service Worker: Error caching static assets:', error);
      })
  );
});

// Activate Event - Alte Caches löschen
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker: Activated');
        return self.clients.claim(); // Sofort alle Clients übernehmen
      })
  );
});

// Fetch Event - Network First mit Fallback auf Cache
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests und nie-zu-cachende URLs
  if (request.method !== 'GET' || NEVER_CACHE.some(path => url.pathname.includes(path))) {
    return;
  }
  
  // Verschiedene Strategien je nach Ressourcentyp
  if (STATIC_ASSETS.includes(url.pathname) || url.pathname.includes('/assets/') || url.pathname.includes('/vendor/')) {
    // Cache First für statische Ressourcen
    event.respondWith(cacheFirst(request));
  } else if (url.pathname.includes('/api/') || url.hostname !== location.hostname) {
    // Network First für API Calls und externe Ressourcen
    event.respondWith(networkFirst(request));
  } else {
    // Stale While Revalidate für alles andere
    event.respondWith(staleWhileRevalidate(request));
  }
});

// Cache First Strategy
async function cacheFirst(request) {
  try {
    const cachedResponse = await caches.match(request);
    return cachedResponse || fetch(request);
  } catch (error) {
    console.error('Service Worker: Cache first error:', error);
    return new Response('Offline - Ressource nicht verfügbar', { status: 503 });
  }
}

// Network First Strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Erfolgreiche Antworten cachen (außer POST/PUT/DELETE)
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Service Worker: Network failed, trying cache');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Offline-Fallback für HTML-Seiten
    if (request.headers.get('accept').includes('text/html')) {
      return caches.match('/index.html');
    }
    
    return new Response('Offline - Keine Verbindung', { 
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Fetch und Cache im Hintergrund aktualisieren
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => null);
  
  // Sofort cached Response zurückgeben oder auf Network warten
  return cachedResponse || fetchPromise || new Response('Offline - Ressource nicht verfügbar', { status: 503 });
}

// Background Sync für offline Aktionen
self.addEventListener('sync', event => {
  console.log('Service Worker: Background sync triggered:', event.tag);
  
  if (event.tag === 'fifa-tracker-sync') {
    event.waitUntil(
      // Hier könnten offline Aktionen synchronisiert werden
      syncOfflineData()
    );
  }
});

async function syncOfflineData() {
  try {
    // Implementierung für Daten-Synchronisation
    console.log('Service Worker: Syncing offline data...');
    
    // Beispiel: Offline gespeicherte Spielerdaten synchronisieren
    const offlineData = await getOfflineData();
    if (offlineData.length > 0) {
      // Daten an Server senden
      await sendToServer(offlineData);
      // Lokale offline Daten löschen
      await clearOfflineData();
    }
  } catch (error) {
    console.error('Service Worker: Sync failed:', error);
  }
}

// Hilfsfunktionen für offline Daten
async function getOfflineData() {
  // Implementierung zum Abrufen offline gespeicherter Daten
  return [];
}

async function sendToServer(data) {
  // Implementierung zum Senden an Server
  console.log('Sending offline data to server:', data);
}

async function clearOfflineData() {
  // Implementierung zum Löschen lokaler offline Daten
  console.log('Clearing offline data');
}

// Push Notifications (falls gewünscht)
self.addEventListener('push', event => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'FIFA Tracker Update verfügbar',
    icon: '/assets/icon-192.png',
    badge: '/assets/badge-icon.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'App öffnen',
        icon: '/assets/icon-192.png'
      },
      {
        action: 'close',
        title: 'Schließen'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('FIFA Tracker', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
  console.log('Service Worker: Notification clicked');
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});