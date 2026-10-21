"use client";

import { useActionState } from "react";
import { renameHouseholdAction, type FormState } from "./actions";

export function HouseholdNameForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    renameHouseholdAction,
    {},
  );
  return (
    <form action={formAction} className="grid gap-2">
      <label htmlFor="household-name" className="text-sm font-semibold">
        Household name
      </label>
      <div className="flex gap-2">
        <input
          id="household-name"
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg px-3 text-fg"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 shrink-0 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted disabled:opacity-60"
        >
          {pending ? "Saving…" : "Rename"}
        </button>
      </div>
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
    </form>
  );
}
