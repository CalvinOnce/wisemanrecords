// Service worker for The Brass Tax PWA.
// Two caches: SHELL (versioned, blown away on deploy) and AUDIO (durable across deploys).

const SHELL_VERSION = "v1";
const SHELL_CACHE = `brass-tax-shell-${SHELL_VERSION}`;
const AUDIO_CACHE = "brass-tax-audio";

const SHELL_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./cover.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-192.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./fonts/bowlby-one.woff2",
  "./fonts/special-elite.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("brass-tax-shell-") && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isAudioRequest(url) {
  return url.pathname.endsWith(".mp3");
}

function isShellRequest(req, url) {
  if (req.mode === "navigate") return true;
  return SHELL_URLS.some((u) => url.pathname.endsWith(u.replace(/^\.\//, "/")) || url.pathname.endsWith(u.replace(/^\.\//, "")));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Audio: cache-first, opportunistically fill cache on first stream.
  if (isAudioRequest(url)) {
    event.respondWith(audioStrategy(req));
    return;
  }

  // Navigations: network-first so updates ship, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else in scope: cache-first.
  event.respondWith(cacheFirst(req));
});

async function audioStrategy(req) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(req);
    // Only cache full 200 responses (not 206 partial range requests — those can't be replayed offline cleanly).
    if (res.ok && res.status === 200) {
      cache.put(req, res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    // Last-ditch: maybe a different range of the same track is cached.
    const fallback = await cache.match(req.url, { ignoreSearch: true });
    if (fallback) return fallback;
    throw err;
  }
}

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    const root = await cache.match("./index.html");
    if (root) return root;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

// Message API for the "Take the whole record" gesture.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cache-tracks" && Array.isArray(data.urls)) {
    event.waitUntil(cacheTracks(data.urls, event.source));
  } else if (data.type === "check-cached" && Array.isArray(data.urls)) {
    event.waitUntil(checkCached(data.urls, event.source));
  } else if (data.type === "evict") {
    event.waitUntil(
      (async () => {
        await caches.delete(AUDIO_CACHE);
        if (event.source) event.source.postMessage({ type: "evicted" });
      })()
    );
  } else if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});

async function cacheTracks(urls, client) {
  const cache = await caches.open(AUDIO_CACHE);
  let done = 0;
  const total = urls.length;
  const send = (msg) => { if (client) client.postMessage(msg); };
  send({ type: "cache-progress", done: 0, total });
  for (const url of urls) {
    try {
      const existing = await cache.match(url);
      if (existing) {
        done += 1;
        send({ type: "cache-progress", done, total, url, skipped: true });
        continue;
      }
      const res = await fetch(url, { cache: "reload" });
      if (res.ok && res.status === 200) {
        await cache.put(url, res.clone());
        done += 1;
        send({ type: "cache-progress", done, total, url });
      } else {
        send({ type: "cache-error", url, status: res.status });
      }
    } catch (err) {
      send({ type: "cache-error", url, message: String(err && err.message || err) });
    }
  }
  send({ type: "cache-complete", done, total });
}

async function checkCached(urls, client) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = [];
  for (const url of urls) {
    const hit = await cache.match(url);
    if (hit) cached.push(url);
  }
  if (client) client.postMessage({ type: "cached-status", cached, total: urls.length });
}
