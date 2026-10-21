"use client";

import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { btn } from "../../ui";
import { deleteDocumentAction } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${btn} text-bad`} disabled={pending}>
      <Trash2 aria-hidden="true" />
      {pending ? "Deleting…" : "Delete document"}
    </button>
  );
}

/** Deletes the stored original and everything linked to it, after asking. */
export function DeleteDocument({ documentId }: { documentId: string }) {
  return (
    <form
      action={deleteDocumentAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Delete this document? The stored file, its spending entry and tax evidence links are removed.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="documentId" value={documentId} />
      <Submit />
    </form>
  );
}
