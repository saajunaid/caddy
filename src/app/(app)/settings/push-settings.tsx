"use client";

import { useEffect, useState } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestNotificationAction,
} from "./actions";

type Status =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function currentStatus(): Promise<Status> {
  if (!VAPID_PUBLIC_KEY) return "not-configured";
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window))
    return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

const buttonClass =
  "inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted disabled:opacity-60";

export function PushSettings() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    currentStatus().then(
      (s) => {
        if (!cancelled) setStatus(s);
      },
      () => {
        if (!cancelled) setStatus("unsupported");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = subscription.toJSON();
      const result = await savePushSubscriptionAction(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: json.keys?.p256dh ?? "",
            auth: json.keys?.auth ?? "",
          },
        },
        navigator.userAgent,
      );
      if (!result.ok) {
        await subscription.unsubscribe();
        setMessage(result.error ?? "Couldn't turn on notifications.");
        return;
      }
      setStatus("on");
      setMessage("Notifications are on for this device.");
    } catch {
      setMessage("Couldn't turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
      setMessage("Notifications are off for this device.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestNotificationAction();
      setMessage(
        result.error ??
          (result.delivered > 0
            ? `Sent to ${result.delivered} device${result.delivered === 1 ? "" : "s"}.`
            : "Saved to your inbox. No devices have notifications on yet."),
      );
    } finally {
      setBusy(false);
    }
  }

  const explanation: Record<Status, string> = {
    loading: "Checking this device…",
    unsupported:
      "This browser can't receive notifications. Alerts still appear in your inbox.",
    "needs-install":
      "On iPhone, add Caddy to your Home Screen first (Share → Add to Home Screen), then open it from there to turn notifications on.",
    "not-configured":
      "Notifications aren't set up on the server yet. Alerts still appear in your inbox.",
    denied:
      "Notifications are blocked for Caddy. Allow them in your browser or phone settings, then come back here.",
    off: "Get new homes, deadlines and failed checks on this device.",
    on: "This device gets Caddy notifications.",
  };

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">{explanation[status]}</p>
      <div className="flex flex-wrap gap-2">
        {status === "off" ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className={buttonClass}
          >
            Turn on for this device
          </button>
        ) : null}
        {status === "on" ? (
          <button
            type="button"
            onClick={disable}
            disabled={busy}
            className={buttonClass}
          >
            Turn off for this device
          </button>
        ) : null}
        <button
          type="button"
          onClick={test}
          disabled={busy}
          className={buttonClass}
        >
          Send a test notification
        </button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}
