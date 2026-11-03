"use client";

import { useActionState } from "react";
import {
  sendTestEmailAction,
  setEmailAlertsAction,
  type FormState,
} from "./actions";

const buttonClass =
  "inline-flex min-h-10 items-center rounded-[9px] border border-line bg-surface px-3.5 text-sm font-semibold hover:border-muted disabled:opacity-60";

function Feedback({ state }: { state: FormState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-bad">
        {state.error}
      </p>
    );
  if (state.notice)
    return (
      <p role="status" className="text-sm text-ok">
        {state.notice}
      </p>
    );
  return null;
}

/** Email copies of urgent alerts (new housing matches, deadlines, failed checks). */
export function EmailSettings({
  enabled,
  configured,
  email,
}: {
  enabled: boolean;
  configured: boolean;
  email: string | null;
}) {
  const [saveState, save, saving] = useActionState<FormState, FormData>(
    setEmailAlertsAction,
    {},
  );
  const [testState, test, testing] = useActionState<FormState, FormData>(
    sendTestEmailAction,
    {},
  );

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold">Email alerts</h3>
      <p className="text-sm text-muted">
        New housing matches, closing dates, contract comparisons, school
        deadlines, checks that didn&apos;t run, and the morning summary on days
        something needs you{email ? `, sent to ${email}` : ""}.
      </p>
      {!configured ? (
        <p className="text-sm text-review">
          Not set up yet: emails start once the Gmail sender is added in Vercel.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={save}>
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <button type="submit" disabled={saving} className={buttonClass}>
            {saving
              ? "Saving…"
              : enabled
                ? "Turn email alerts off"
                : "Turn email alerts on"}
          </button>
        </form>
        {configured && enabled ? (
          <form action={test}>
            <button type="submit" disabled={testing} className={buttonClass}>
              {testing ? "Sending…" : "Send a test email"}
            </button>
          </form>
        ) : null}
      </div>
      <Feedback state={saveState} />
      {enabled ? <Feedback state={testState} /> : null}
    </div>
  );
}
