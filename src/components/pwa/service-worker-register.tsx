"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only, so development always serves fresh files. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Install still works without the worker; it only adds the offline page.
      });
  }, []);
  return null;
}
