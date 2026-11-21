/* Krykhta PWA Service Worker — v18.2.14
   Network-first for app code and documents, cache fallback for offline use.
   The new worker only activates after every required app file is available. */
const CACHE = 'krykhta-v18.2.14';
const REQUIRED_SHELL = [
  './index.html',
  './tailwind.css',
  './css/base.css',
  './css/components.css',
  './css/assistant.css',
  './css/ios-overrides.css',
  './manifest.webmanifest',
  './js/core.js',
  './js/diary.js',
  './js/food-input.js',
  './js/assistant.js',
  './js/barcode.js',
  './js/dish-editor.js',
  './js/dashboard.js',
  './js/gdrive.js',
  './js/settings.js',
  './js/pwa-update.js',
  './js/bootstrap.js'
];
const OPTIONAL_SHELL = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];
const APP_CACHE_PREFIX = 'krykhta-';

const toScopedURL = path => new URL(path, self.registration.scope).href;

async function fetchAndCache(path, cache, attempts = 2) {
  const url = toScopedURL(path);
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      // 'reload' bypasses the browser HTTP cache during a new app-shell install.
      const request = new Request(url, { cache: 'reload' });
      const response = await fetch(request);
      if (!response.ok) throw new Error(`Precache failed (${response.status}): ${path}`);
      await cache.put(url, response.clone());
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
  throw lastError || new Error(`Precache failed: ${path}`);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Required code is all-or-nothing: do not activate a half-updated app.
    await Promise.all(REQUIRED_SHELL.map(path => fetchAndCache(path, cache, 2)));
    // Icons are non-critical; a temporary image failure must not block an update.
    await Promise.all(OPTIONAL_SHELL.map(path => fetchAndCache(path, cache, 1).catch(error => {
      console.warn('[Krykhta SW] Optional asset was not cached:', path, error);
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isDocumentRequest(request, url) {
  return request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/';
}

function isAppCodeRequest(url) {
  return /\.(?:js|css)$/i.test(url.pathname);
}

async function networkFirst(request, isDocument) {
  const cache = await caches.open(CACHE);
  try {
    // Bypass the HTTP cache so a Pages deployment can be seen immediately.
    const networkRequest = new Request(request, { cache: 'no-store' });
    const response = await fetch(networkRequest);
    if (response && response.ok) {
      try { await cache.put(request, response.clone()); }
      catch (cacheError) { console.warn('[Krykhta SW] Could not refresh cache:', cacheError); }
      return response;
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isDocument) {
      const indexURL = toScopedURL('./index.html');
      const index = await cache.match(indexURL);
      if (index) return index;
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isDocument) {
      const indexURL = toScopedURL('./index.html');
      const index = await cache.match(indexURL);
      if (index) return index;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    try { await cache.put(request, response.clone()); } catch (_) { /* non-fatal */ }
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never intercept Gemini, Google Drive, Open Food Facts or other external APIs.
  if (url.origin !== self.location.origin) return;

  const isDocument = isDocumentRequest(request, url);
  if (isDocument || isAppCodeRequest(url)) {
    event.respondWith(networkFirst(request, isDocument));
    return;
  }

  event.respondWith(cacheFirst(request));
});
