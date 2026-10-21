"use client";

import { useActionState } from "react";
import { btn, input } from "../../ui";
import { saveAllowanceAction, type TaxFormState } from "../actions";

/** D: remote working allowance the employer paid this person in the year. */
export function AllowanceForm({
  memberId,
  memberName,
  year,
  amount,
}: {
  memberId: string;
  memberName: string;
  year: number;
  /** Current value as "320.00", or "" if none. */
  amount: string;
}) {
  const [state, formAction, pending] = useActionState<TaxFormState, FormData>(
    saveAllowanceAction,
    {},
  );
  const id = `allowance-${memberId}`;
  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="year" value={year} />
      <label htmlFor={id} className="text-sm font-semibold">
        Employer remote working allowance paid to {memberName} in {year}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={amount}
          className={`${input} num max-w-40`}
        />
        <button type="submit" className={btn} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <span className="text-xs text-muted">
        The tax-free daily allowance some employers pay. Leave blank if none.
      </span>
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
