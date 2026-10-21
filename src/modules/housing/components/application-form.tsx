"use client";

import { useActionState } from "react";
import { saveApplicationAction, type FormState } from "../actions";
import { APPLICATION_STATUSES, applicationBadge } from "../display";
import type { Application } from "../queries";
import { btnPrimary, fieldLabel, input } from "./styles";

/** The household's own tracking for one listing. Saved by a server action, audited. */
export function ApplicationForm({
  listingId,
  application,
}: {
  listingId: string;
  application: Application | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveApplicationAction.bind(null, listingId),
    {},
  );
  return (
    <form action={formAction} className="grid gap-3">
      <div className="grid gap-1.5">
        <label htmlFor="app-status" className={fieldLabel}>
          Status
        </label>
        <select
          id="app-status"
          name="status"
          defaultValue={application?.status ?? "not_applied"}
          className={input}
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {applicationBadge(status).label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor="app-date" className={fieldLabel}>
            Applied on
          </label>
          <input
            id="app-date"
            name="applied_on"
            type="date"
            defaultValue={application?.applied_on ?? ""}
            className={input}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="app-ref" className={fieldLabel}>
            Provider reference
          </label>
          <input
            id="app-ref"
            name="provider_reference"
            maxLength={120}
            defaultValue={application?.provider_reference ?? ""}
            className={`${input} font-mono`}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="app-outcome" className={fieldLabel}>
          Outcome, exactly as the provider wrote it
        </label>
        <textarea
          id="app-outcome"
          name="outcome_text"
          maxLength={4000}
          rows={3}
          defaultValue={application?.outcome_text ?? ""}
          placeholder="Paste the wording from the email or letter"
          className={`${input} min-h-[72px] resize-y`}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <label htmlFor="app-next" className={fieldLabel}>
            Next action
          </label>
          <input
            id="app-next"
            name="next_action"
            maxLength={300}
            defaultValue={application?.next_action ?? ""}
            className={input}
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="app-due" className={fieldLabel}>
            Due
          </label>
          <input
            id="app-due"
            name="next_action_due"
            type="date"
            defaultValue={application?.next_action_due ?? ""}
            className={input}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="app-notes" className={fieldLabel}>
          Notes
        </label>
        <textarea
          id="app-notes"
          name="notes"
          maxLength={4000}
          rows={3}
          defaultValue={application?.notes ?? ""}
          className={`${input} min-h-[72px] resize-y`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
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
