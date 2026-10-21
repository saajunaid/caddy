"use client";

import { Eye, EyeOff, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { ProvenanceTag } from "@/components/ui/status";
import { formatChecked } from "@/server/domain/relative-time";
import { deleteOwnPlaceAction, setPlaceMarkAction } from "../actions";
import type {
  NearbyData,
  NearbyGroupData,
  NearbyRow,
  SourceState,
} from "../queries";
import {
  CATEGORIES,
  categoryDef,
  type CategoryKey,
} from "../server/categories";
import { formatKm, type Anchor } from "../server/geo";
import { AddPlaceForm } from "./add-place-form";
import { LookupButton } from "./lookup-button";
import type { MapPin } from "./nearby-map";

const NearbyMap = dynamic(
  () => import("./nearby-map").then((m) => m.NearbyMap),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-[280px] place-items-center rounded-[10px] border border-line bg-sunk text-sm text-muted sm:h-[340px] lg:h-[380px]">
        Loading map…
      </div>
    ),
  },
);

type LatLon = { latitude: number; longitude: number };

function Glyph({ k }: { k: CategoryKey }) {
  const def = categoryDef(k);
  return (
    <i
      aria-hidden="true"
      style={{ "--c": def.color } as CSSProperties}
      className="grid size-[18px] place-items-center rounded-full bg-[var(--c)] font-mono text-[0.65rem] font-semibold text-on-accent not-italic"
    >
      {def.glyph}
    </i>
  );
}

function Freshness({
  name,
  state,
  now,
}: {
  name: string;
  state: SourceState | null;
  now: Date;
}) {
  if (!state) return null;
  const failed = state.status === "failed";
  return (
    <li>
      <span className={failed ? "text-bad" : "text-muted"}>
        {name}: {failed ? "failed" : "checked"}{" "}
        {formatChecked(new Date(state.searchedAt), now)}
        {failed && state.lastSuccessAt
          ? ` · last OK ${formatChecked(new Date(state.lastSuccessAt), now)}`
          : ""}
        {failed ? "" : " · OK"}
      </span>
    </li>
  );
}

function Row({
  row,
  onMark,
  onDelete,
  busy,
}: {
  row: NearbyRow;
  onMark: (row: NearbyRow, mark: "pinned" | "hidden" | null) => void;
  onDelete: (row: NearbyRow) => void;
  busy: boolean;
}) {
  const action =
    "inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-semibold text-muted hover:text-fg disabled:opacity-60";
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold [overflow-wrap:anywhere]">
          {row.mark === "pinned" ? (
            <Pin
              aria-label="Pinned"
              className="mr-1 inline size-3.5 align-[-2px] text-mine"
            />
          ) : null}
          {row.name}
        </div>
        {row.detail ? (
          <div className="text-sm [overflow-wrap:anywhere] text-muted">
            {row.detail}
          </div>
        ) : null}
        {row.note && !row.own ? (
          <div className="text-sm [overflow-wrap:anywhere] text-mine">
            {row.note}
          </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {row.mark === "hidden" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onMark(row, null)}
              className={action}
            >
              <Eye aria-hidden="true" className="size-3.5" /> Unhide
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                aria-pressed={row.mark === "pinned"}
                onClick={() =>
                  onMark(row, row.mark === "pinned" ? null : "pinned")
                }
                className={action}
              >
                {row.mark === "pinned" ? (
                  <PinOff aria-hidden="true" className="size-3.5" />
                ) : (
                  <Pin aria-hidden="true" className="size-3.5" />
                )}
                {row.mark === "pinned" ? "Unpin" : "Pin"}
              </button>
              {row.own ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(row)}
                  className={action}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" /> Remove
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMark(row, "hidden")}
                  className={action}
                >
                  <EyeOff aria-hidden="true" className="size-3.5" /> Hide
                </button>
              )}
            </>
          )}
          {row.website ? (
            <a
              href={row.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center px-1.5 text-xs font-semibold text-info underline-offset-2 hover:underline"
            >
              {row.source === "google" ? "Google Maps" : "Website"}
            </a>
          ) : null}
        </div>
      </div>
      <div className="grid shrink-0 justify-items-end gap-[3px] text-right">
        <span className="num">{formatKm(row.distanceM)}</span>
        <span
          className="text-sm whitespace-nowrap text-muted"
          title="Estimate: straight-line distance × 1.3 at 5 km/h"
        >
          ~{row.walkMin} min walk
        </span>
        <ProvenanceTag source={row.source} />
      </div>
    </li>
  );
}

function Group({
  group,
  searched,
  onMark,
  onDelete,
  busy,
}: {
  group: NearbyGroupData;
  searched: boolean;
  onMark: (row: NearbyRow, mark: "pinned" | "hidden" | null) => void;
  onDelete: (row: NearbyRow) => void;
  busy: boolean;
}) {
  const def = categoryDef(group.key);
  const radius = formatKm(group.radiusM).replace(".0 km", " km");
  return (
    <section
      aria-labelledby={`nearby-${group.key}`}
      className="rounded-[10px] border border-line bg-surface shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <h3
          id={`nearby-${group.key}`}
          className="flex items-center gap-2 font-semibold"
        >
          <Glyph k={group.key} />
          {def.label}
        </h3>
        <span className="text-sm whitespace-nowrap text-muted">
          {group.withinRadius} within {radius}
        </span>
      </div>
      {group.items.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line">
          {group.items.map((row) => (
            <Row
              key={row.id}
              row={row}
              onMark={onMark}
              onDelete={onDelete}
              busy={busy}
            />
          ))}
        </ul>
      ) : (
        <p className="border-t border-line px-4 py-3 text-sm text-muted">
          {searched
            ? `None found within ${radius} on the map.`
            : "Not looked up yet."}
          {searched && (group.key === "halal" || group.key === "mosque")
            ? " Maps often miss these; add places you know."
            : ""}
        </p>
      )}
      {group.hidden.length > 0 ? (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted">
            Hidden ({group.hidden.length})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {group.hidden.map((row) => (
              <Row
                key={row.id}
                row={row}
                onMark={onMark}
                onDelete={onDelete}
                busy={busy}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/** Map, category filters and grouped lists for one location. */
export function NearbyView({
  anchor,
  data,
  now,
}: {
  anchor: Anchor;
  data: NearbyData;
  /** ISO time the server rendered at, so labels match between server and browser. */
  now: string;
}) {
  const [active, setActive] = useState<Set<CategoryKey>>(
    () => new Set(CATEGORIES.map((c) => c.key)),
  );
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<LatLon | null>(null);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const renderedAt = useMemo(() => new Date(now), [now]);

  const toggle = (key: CategoryKey) =>
    setActive((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const visibleGroups = data.groups.filter((g) => active.has(g.key));
  const pins = useMemo<MapPin[]>(() => {
    const seen = new Set<string>();
    const out: MapPin[] = [];
    for (const group of data.groups) {
      if (!active.has(group.key)) continue;
      const def = categoryDef(group.key);
      for (const row of group.items) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push({
          id: row.id,
          latitude: row.latitude,
          longitude: row.longitude,
          glyph: def.glyph,
          color: def.color,
          label: `${row.name} · ${formatKm(row.distanceM)}`,
        });
      }
    }
    return out;
  }, [data.groups, active]);

  const run = (task: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await task();
        if (result.error) setError(result.error);
      } catch {
        setError(
          navigator.onLine
            ? "Couldn't update that place. Try again."
            : "You're offline. Try again when you're connected.",
        );
      }
    });
  const onMark = (row: NearbyRow, mark: "pinned" | "hidden" | null) =>
    run(() => setPlaceMarkAction(row.ids, mark));
  const onDelete = (row: NearbyRow) => {
    if (window.confirm(`Remove “${row.name}” from your places?`)) {
      run(() => deleteOwnPlaceAction(row.id));
    }
  };
  const onPick = useCallback((point: LatLon) => setPicked(point), []);
  const onAdded = useCallback(() => setPicked(null), []);

  return (
    <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
      {!data.searched ? (
        <div className="grid gap-3 rounded-[10px] border border-line bg-surface p-4 lg:col-span-2">
          <h3 className="font-semibold">
            Nearby places haven&apos;t been looked up yet
          </h3>
          <p className="text-sm text-muted">
            {(data.google ?? data.osm)?.status === "failed"
              ? "The last lookup failed. "
              : ""}
            Caddy looks up childcare, schools, colleges, bus stops, mosques and
            halal food around this location. It also happens automatically each
            morning for homes that match.
          </p>
          <LookupButton anchor={anchor} />
        </div>
      ) : null}
      {/* On desktop the map stays in view while the lists scroll (not while the form is open). */}
      <div
        className={`grid content-start gap-3 ${adding ? "" : "lg:sticky lg:top-4 lg:self-start"}`}
      >
        {adding ? (
          <p role="status" className="text-sm font-semibold text-mine">
            Tap the map to set where the new place is.
          </p>
        ) : null}
        <NearbyMap
          home={anchor}
          pins={pins}
          picking={adding}
          picked={adding ? picked : null}
          onPick={onPick}
        />
        <div
          role="group"
          aria-label="Show categories"
          className="flex flex-wrap gap-1.5"
        >
          {CATEGORIES.map((c) => {
            const on = active.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(c.key)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-[0.8rem] font-medium ${on ? "" : "opacity-55 [&_i]:!bg-muted"}`}
              >
                <Glyph k={c.key} />
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="rounded-r-lg border-l-[3px] border-line bg-sunk px-3 py-2.5 text-[0.82rem] text-muted">
          Distances are straight-line estimates. Being near a school
          doesn&apos;t guarantee a place. Walking times are estimates. Sources:{" "}
          {[
            data.google ? "Google Maps" : null,
            data.osm ? "OpenStreetMap" : null,
          ]
            .filter(Boolean)
            .join(", ") || "map searches"}{" "}
          and places you add.
        </p>
        <ul className="grid gap-0.5 text-sm">
          <Freshness name="Google" state={data.google} now={renderedAt} />
          {data.osm ? (
            <Freshness name="OpenStreetMap" state={data.osm} now={renderedAt} />
          ) : null}
        </ul>
        {data.searched && data.canRefresh ? (
          <LookupButton anchor={anchor} label="Look up again" primary={false} />
        ) : null}
        {adding ? (
          <AddPlaceForm
            picked={picked}
            onClearPick={() => setPicked(null)}
            onClose={() => {
              setAdding(false);
              setPicked(null);
            }}
            onAdded={onAdded}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-10 items-center justify-center gap-2 justify-self-start rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted"
          >
            <Plus aria-hidden="true" className="size-4" /> Add a place you know
          </button>
        )}
      </div>

      <div className="grid content-start gap-3">
        {error ? (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        ) : null}
        {visibleGroups.map((group) => (
          <Group
            key={group.key}
            group={group}
            searched={data.searched}
            onMark={onMark}
            onDelete={onDelete}
            busy={busy}
          />
        ))}
      </div>
    </div>
  );
}
