"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-line bg-sunk px-4 py-2 text-sm text-due"
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      You&apos;re offline. You can look around, but changes won&apos;t save
      until you&apos;re back online.
    </div>
  );
}
