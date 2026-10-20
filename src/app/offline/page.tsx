import { Brand } from "@/components/layout/brand";

export const metadata = { title: "Offline" };

/** Served by the service worker when a page can't load without a connection. */
export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 py-10">
      <Brand />
      <h1 className="text-[1.6rem] leading-tight font-bold">
        You&apos;re offline
      </h1>
      <p className="text-muted">
        Caddy needs a connection to show your household&apos;s data, so nothing
        private is stored on this device. Anything you saved before losing the
        connection is safe.
      </p>
      {/* A full page load on purpose: the service worker serves this page when navigation fails. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="inline-flex min-h-10 w-fit items-center rounded-[9px] bg-accent px-4 font-semibold text-on-accent"
      >
        Try again
      </a>
    </main>
  );
}
