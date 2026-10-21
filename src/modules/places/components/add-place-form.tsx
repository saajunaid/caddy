"use client";

import { MapPin, X } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { addPlaceAction, type AddPlaceState } from "../actions";
import { CATEGORIES } from "../server/categories";

type LatLon = { latitude: number; longitude: number };

const field =
  "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg";

/** "Add a place you know": name, category, map pin or address, optional note. */
export function AddPlaceForm({
  picked,
  onClearPick,
  onClose,
  onAdded,
}: {
  picked: LatLon | null;
  onClearPick: () => void;
  onClose: () => void;
  onAdded: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<AddPlaceState, FormData>(
    async (prev, formData) => {
      try {
        return await addPlaceAction(prev, formData);
      } catch {
        return {
          error:
            typeof navigator !== "undefined" && !navigator.onLine
              ? "You're offline. Try again when you're connected."
              : "Couldn't save the place. Try again.",
        };
      }
    },
    {},
  );

  useEffect(() => {
    if (state.notice) {
      formRef.current?.reset();
      onAdded();
    }
  }, [state, onAdded]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 rounded-[10px] border border-line bg-surface p-4"
      aria-labelledby="add-place-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="add-place-title" className="font-semibold">
          Add a place you know
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-9 place-items-center rounded-lg text-muted hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="text-sm text-muted">
        Only your household sees places you add.
      </p>
      <div className="grid gap-1.5">
        <label htmlFor="place-name" className="text-sm font-semibold">
          Name
        </label>
        <input
          id="place-name"
          name="name"
          required
          maxLength={200}
          className={field}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="place-category" className="text-sm font-semibold">
          Category
        </label>
        <select
          id="place-category"
          name="category"
          required
          defaultValue=""
          className={field}
        >
          <option value="" disabled>
            Choose…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold">Where is it?</legend>
        {picked ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <MapPin aria-hidden="true" className="size-4 text-mine" />
            <span className="num">
              {picked.latitude.toFixed(5)}, {picked.longitude.toFixed(5)}
            </span>
            <button
              type="button"
              onClick={onClearPick}
              className="text-info underline underline-offset-2"
            >
              Clear pin
            </button>
            <input type="hidden" name="latitude" value={picked.latitude} />
            <input type="hidden" name="longitude" value={picked.longitude} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            Tap the map to drop a pin, or type the address.
          </p>
        )}
        <label htmlFor="place-address" className="sr-only">
          Address
        </label>
        <input
          id="place-address"
          name="address"
          maxLength={200}
          placeholder="Street and town"
          className={field}
        />
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor="place-note" className="text-sm font-semibold">
          Note <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="place-note"
          name="note"
          maxLength={500}
          placeholder="e.g. certified halal"
          className={field}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-[9px] border border-accent bg-accent px-3.5 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-70"
        >
          {pending ? "Saving…" : "Add place"}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-bad">
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="text-sm text-ok">
            {state.notice}
          </p>
        ) : null}
      </div>
    </form>
  );
}
