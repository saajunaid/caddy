"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { smallButtonClass } from "./ui";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${smallButtonClass} text-bad`}
    >
      <Trash2 aria-hidden="true" className="size-3.5" />
      {pending ? "Deleting…" : label}
    </button>
  );
}

/** A delete button that asks first. `action` is a server action already bound to its ids. */
export function ConfirmDelete({
  action,
  label,
  question,
}: {
  action: () => Promise<void>;
  label: string;
  question: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      <Submit label={label} />
    </form>
  );
}
