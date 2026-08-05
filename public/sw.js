/* PZGIF app-shell service worker.
 *
 * Goal 2 of the plan promises the site still works on reload with the network
 * off, and the compressor FAQ invites the user to prove it. Four rules:
 *
 *   1. Only same-origin GET requests are ever touched.
 *   2. Ad, consent and analytics endpoints are NEVER cached — the privacy claim
 *      in the copy is the strongest differentiator against ezgif, and a cached
 *      tracker would quietly falsify it.
 *   3. `/wasm/<version>/` and `/_next/static/` are immutable by contract, so
 *      they are cache-first. Pages are network-first so a deploy is picked up on
 *      the next online visit.
 *   4. The shell is precached at INSTALL time. A service worker never controls
 *      the navigation that registered it, so without a precache the very first
 *      offline reload — the one every user actually performs — hits an empty
 *      cache and shows the browser's error page.
 *
 * Scope note: this makes the *shell* survive offline. Whether a full compression
 * runs offline cannot be asserted until an engine and a tool page exist; that is
 * a Phase 5 / Phase 11 gate, not something this file can promise alone.
 */

const CACHE = "pzgif-shell-v1";

/** Fetched during install, so the first offline reload has something to serve. */
const PRECACHE = ["/"];

/** Served for any navigation that cannot be fetched and was never cached. */
const NAVIGATION_FALLBACK = "/";

/**
 * Substrings that disqualify a request from the cache entirely.
 *
 * Cross-origin requests already fall through untouched, so these matter for the
 * first-party paths a tag manager or a host's analytics proxy would use.
 */
const NEVER_CACHE = [
  "/api/",
  "/_vercel/",
  "/cdn-cgi/",
  "googlesyndication",
  "doubleclick",
  "googletagmanager",
  "google-analytics",
  "adservice",
  "cookieyes",
  "cookiebot",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One bad response must not abort the whole install, so precache
      // entries are added individually rather than with addAll().
      .then((cache) =>
        Promise.all(
          PRECACHE.map((path) =>
            fetch(path, { cache: "reload" })
              .then((response) =>
                response.ok ? cache.put(path, response) : undefined,
              )
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Only a fully-readable, successful, same-origin response is worth storing. */
function isCacheable(response) {
  return response && response.ok && response.type !== "opaque";
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response))
    (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request, { fallbackToShell = false } = {}) {
  try {
    const response = await fetch(request);
    if (isCacheable(response))
      (await caches.open(CACHE)).put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (fallbackToShell) {
      const shell = await caches.match(NAVIGATION_FALLBACK);
      if (shell) return shell;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((fragment) => request.url.includes(fragment))) return;

  const immutable =
    url.pathname.startsWith("/wasm/") ||
    url.pathname.startsWith("/_next/static/");

  if (immutable) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(
    networkFirst(request, { fallbackToShell: request.mode === "navigate" }),
  );
});
