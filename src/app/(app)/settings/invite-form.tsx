"use client";

import { useActionState } from "react";
import { inviteAdultAction, type InviteState } from "./actions";

const inputClass =
  "min-h-10 w-full rounded-lg border border-line bg-bg px-3 text-fg placeholder:text-muted";

export function InviteForm() {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    inviteAdultAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="invite-name" className="text-sm font-semibold">
            Name
          </label>
          <input
            id="invite-name"
            name="name"
            required
            maxLength={60}
            className={inputClass}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="invite-email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className={inputClass}
          />
        </div>
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
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 w-fit items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add adult"}
      </button>
      <p className="text-sm text-muted">
        They sign in on the Caddy login page with this email and a code. No
        email is sent now.
      </p>
    </form>
  );
}
