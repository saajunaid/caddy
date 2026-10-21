"use client";

import { X } from "lucide-react";
import { useActionState } from "react";
import {
  addExclusionAction,
  removeExclusionAction,
  type FormState,
} from "../actions";
import { buttonClass, FormMessage, TextInput } from "./form-bits";

/** Suppliers the household never wants ranked or recommended. */
export function Exclusions({ suppliers }: { suppliers: string[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addExclusionAction,
    {},
  );
  return (
    <div className="grid gap-3">
      {suppliers.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Excluded suppliers">
          {suppliers.map((name) => (
            <li
              key={name}
              className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pr-1 pl-3 text-sm"
            >
              {name}
              <form action={removeExclusionAction.bind(null, name)}>
                <button
                  type="submit"
                  aria-label={`Stop excluding ${name}`}
                  className="grid size-8 place-items-center rounded-full text-muted hover:text-fg"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No exclusions. Every supplier can be ranked.
        </p>
      )}
      <form action={formAction} className="flex gap-2">
        <label htmlFor="exclude-supplier" className="sr-only">
          Supplier to exclude
        </label>
        <TextInput
          id="exclude-supplier"
          name="supplier"
          required
          maxLength={80}
          placeholder="Supplier name"
          autoComplete="off"
        />
        <button type="submit" disabled={pending} className={buttonClass}>
          Exclude
        </button>
      </form>
      <FormMessage error={state.error} notice={state.notice} />
    </div>
  );
}
