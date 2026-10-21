"use client";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

/**
 * MapLibre GL JS, pinned to the version in package.json (kept in sync by a unit test).
 * MapLibre 6 starts its web worker from a file next to its own module, which bundlers don't
 * copy, so the browser loads the published ES module build from jsDelivr instead.
 */
export const MAPLIBRE_VERSION = "6.12.0";
const CDN = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist`;
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const MAP_ATTRIBUTION = "© OpenStreetMap contributors, OpenFreeMap";

type MapLibre = typeof import("maplibre-gl");
let loader: Promise<MapLibre> | null = null;

function loadMapLibre(): Promise<MapLibre> {
  if (!document.querySelector("link[data-maplibre]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${CDN}/maplibre-gl.css`;
    link.dataset.maplibre = "";
    document.head.appendChild(link);
  }
  loader ??= (
    import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ `${CDN}/maplibre-gl.mjs`
    ) as Promise<MapLibre>
  ).catch((error: unknown) => {
    loader = null;
    throw error;
  });
  return loader;
}

export type MapPin = {
  id: string;
  latitude: number;
  longitude: number;
  glyph: string;
  /** CSS colour, e.g. "var(--green)". */
  color: string;
  label: string;
};

type LatLon = { latitude: number; longitude: number };

function pinElement(glyph: string, color: string, label: string, size: number) {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.title = label;
  el.textContent = glyph;
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:50%",
    `background:${color}`,
    "color:var(--on-accent)",
    "display:grid",
    "place-items:center",
    "font:600 11px/1 var(--font-mono, ui-monospace, monospace)",
    "border:2px solid var(--surface)",
    "box-shadow:0 1px 3px rgba(0,0,0,.35)",
    "cursor:pointer",
  ].join(";");
  return el;
}

function prefersReducedMotion() {
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

export function NearbyMap({
  home,
  pins,
  picking,
  picked,
  onPick,
}: {
  home: LatLon & { label: string };
  pins: MapPin[];
  /** When true, tapping the map reports the location through onPick. */
  picking: boolean;
  picked: LatLon | null;
  onPick: (point: LatLon) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const lib = useRef<MapLibre | null>(null);
  const markers = useRef<Marker[]>([]);
  const pickedMarker = useRef<Marker | null>(null);
  const pickRef = useRef({ picking, onPick });
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );

  useEffect(() => {
    pickRef.current = { picking, onPick };
  }, [picking, onPick]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        lib.current = maplibre;
        const m = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE,
          center: [home.longitude, home.latitude],
          zoom: 14,
          attributionControl: {
            compact: false,
            customAttribution: MAP_ATTRIBUTION,
          },
          cooperativeGestures: false,
        });
        m.addControl(
          new maplibre.NavigationControl({ showCompass: false }),
          "top-right",
        );
        const homeEl = pinElement(
          "⌂",
          "var(--purple)",
          `Home: ${home.label}`,
          30,
        );
        homeEl.style.fontSize = "16px";
        new maplibre.Marker({ element: homeEl })
          .setLngLat([home.longitude, home.latitude])
          .addTo(m);
        m.on("load", () => {
          loaded = true;
          if (!cancelled) setStatus("ready");
        });
        // Errors before the style loads mean no map; later ones are usually single tiles.
        m.on("error", () => {
          if (!loaded && !cancelled) setStatus("failed");
        });
        m.on("click", (event) => {
          const { picking: isPicking, onPick: pick } = pickRef.current;
          if (isPicking) {
            pick({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
          }
        });
        map.current = m;
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current = [];
      pickedMarker.current = null;
    };
  }, [home.latitude, home.longitude, home.label]);

  // Category pins; refit the view to what's shown.
  useEffect(() => {
    const m = map.current;
    const maplibre = lib.current;
    if (!m || !maplibre || status !== "ready") return;
    for (const marker of markers.current) marker.remove();
    markers.current = pins.map((pin) => {
      const popup = new maplibre.Popup({
        offset: 14,
        closeButton: false,
      }).setText(pin.label);
      return new maplibre.Marker({
        element: pinElement(pin.glyph, pin.color, pin.label, 22),
      })
        .setLngLat([pin.longitude, pin.latitude])
        .setPopup(popup)
        .addTo(m);
    });
    const bounds = new maplibre.LngLatBounds(
      [home.longitude, home.latitude],
      [home.longitude, home.latitude],
    );
    for (const pin of pins) bounds.extend([pin.longitude, pin.latitude]);
    m.fitBounds(bounds, {
      padding: 36,
      maxZoom: 15,
      duration: prefersReducedMotion() ? 0 : 300,
    });
  }, [pins, status, home.latitude, home.longitude]);

  // The spot picked for a new place.
  useEffect(() => {
    const m = map.current;
    const maplibre = lib.current;
    if (!m || !maplibre || status !== "ready") return;
    pickedMarker.current?.remove();
    pickedMarker.current = picked
      ? new maplibre.Marker({
          element: pinElement("+", "var(--pink)", "New place", 24),
        })
          .setLngLat([picked.longitude, picked.latitude])
          .addTo(m)
      : null;
  }, [picked, status]);

  if (status === "failed") {
    return (
      <div className="grid min-h-24 place-items-center rounded-[10px] border border-line bg-sunk p-4 text-center text-sm text-muted">
        The map couldn&apos;t load on this device. The lists still work.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={container}
        aria-label={`Map of places near ${home.label}`}
        role="region"
        className={[
          "h-[280px] w-full overflow-hidden rounded-[10px] border border-line bg-sunk sm:h-[340px] lg:h-[380px]",
          picking ? "cursor-crosshair [&_canvas]:!cursor-crosshair" : "",
          "[&_.maplibregl-ctrl-attrib]:!bg-surface/90 [&_.maplibregl-ctrl-attrib]:!text-fg [&_.maplibregl-ctrl-attrib_a]:!text-info",
          "[&_.maplibregl-popup-content]:!rounded-lg [&_.maplibregl-popup-content]:!border [&_.maplibregl-popup-content]:!border-line [&_.maplibregl-popup-content]:!bg-surface [&_.maplibregl-popup-content]:!px-2.5 [&_.maplibregl-popup-content]:!py-1.5 [&_.maplibregl-popup-content]:!text-sm [&_.maplibregl-popup-content]:!text-fg [&_.maplibregl-popup-tip]:hidden",
        ].join(" ")}
      />
      {status === "loading" ? (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted"
        >
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
