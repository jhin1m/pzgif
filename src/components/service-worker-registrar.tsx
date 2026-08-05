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
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);

  return null;
}
