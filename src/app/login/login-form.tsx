"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { step: "email", email: "" };

const inputClass =
  "min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-base text-fg placeholder:text-muted";
const primaryClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-[9px] bg-accent px-4 font-semibold text-on-accent disabled:opacity-60";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  if (state.step === "code") {
    return (
      <form action={formAction} className="grid gap-4">
        {state.notice ? <p className="text-muted">{state.notice}</p> : null}
        <div className="grid gap-1.5">
          <label htmlFor="code" className="text-sm font-semibold">
            Sign-in code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            required
            autoFocus
            className={`${inputClass} num tracking-[0.3em]`}
            aria-describedby={state.error ? "code-error" : undefined}
          />
        </div>
        {state.error ? (
          <p id="code-error" role="alert" className="text-sm text-bad">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          name="intent"
          value="verify"
          disabled={pending}
          className={primaryClass}
        >
          {pending ? "Checking…" : "Sign in"}
        </button>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <button
            type="submit"
            name="intent"
            value="send"
            disabled={pending}
            formNoValidate
            className="text-info"
          >
            Send a new code
          </button>
          <button
            type="submit"
            name="intent"
            value="change-email"
            disabled={pending}
            formNoValidate
            className="text-info"
          >
            Use a different email
          </button>
          <input type="hidden" name="email" value={state.email} />
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email}
          required
          autoFocus
          className={inputClass}
          aria-describedby={state.error ? "email-error" : undefined}
        />
      </div>
      {state.error ? (
        <p id="email-error" role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        name="intent"
        value="send"
        disabled={pending}
        className={primaryClass}
      >
        {pending ? "Sending…" : "Email me a code"}
      </button>
    </form>
  );
}
