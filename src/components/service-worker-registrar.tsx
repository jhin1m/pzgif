"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker.
 *
 * Goal 2 of the plan promises the site keeps working offline after first load,
 * and the compressor FAQ actively invites the user to test it by turning off
 * their connection. That claim has to be true, so the registration happens on
 * every page rather than only on tool pages.
 *
 * Registration is NOT deferred to the load event. A worker never controls the
 * navigation that registered it, so the only thing deferring buys is a longer
 * window in which this page's own subresources bypass the cache entirely.
 * Registering here — after hydration, so it is already off the critical path —
 * lets `clients.claim()` take over sooner and catch more of them.
 */
/**
 * Outside production, evicting an already-installed worker is the whole job.
 *
 * Not registering is not the same as not being controlled. `pnpm build && pnpm
 * start`, or any production run on localhost, installs a worker that keeps
 * controlling that origin afterwards — `pnpm dev` on the same port inherits it,
 * and the guard above does nothing about that because there is no new
 * registration to skip.
 *
 * What it then does is serve `/_next/static/` cache-first, on the contract that
 * those URLs are immutable. That contract holds for a production build, whose
 * chunk names carry a content hash. It is false in development: a Turbopack dev
 * chunk is named from the source path and its grouping, so `src_1o4g9eh._.js`
 * keeps its name across edits while its bytes change. Cache-first then pins the
 * tab to whatever JavaScript existed when the cache was written — an export
 * added afterwards is missing at runtime, and the symptom is a `TypeError` on a
 * function the editor, the type-checker and the served bundle all agree exists.
 *
 * The caches go with the registration. An unregistered worker stops
 * intercepting, but its Cache Storage survives, and re-running the production
 * build re-registers a worker that reads the same stale entries straight back.
 */
export async function unregisterAndPurge() {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if (registrations.length === 0) return;

  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void unregisterAndPurge().catch(() => undefined);
      return;
    }

    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return null;
}
