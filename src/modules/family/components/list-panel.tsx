import { Share2, X } from "lucide-react";
import {
  addListItemAction,
  clearCheckedAction,
  deleteListItemAction,
  setListItemCheckedAction,
} from "../actions";
import type { FamilyList } from "../queries";
import { listShareText, whatsappLink } from "../server/whatsapp.ts";
import { ActionForm } from "./action-form";
import { CheckToggle, ConfirmButton } from "./controls";
import { buttonClass, inputClass } from "./ui";

export function WhatsAppButton({
  text,
  label = "Share to WhatsApp",
}: {
  text: string;
  label?: string;
}) {
  return (
    <a
      href={whatsappLink(text)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClass}
    >
      <Share2 aria-hidden="true" className="size-4" />
      {label}
    </a>
  );
}

/** A list's items with tick boxes, an add box, clear ticked and Share to WhatsApp. */
export function ListPanel({
  list,
  editable = false,
  heading,
}: {
  list: FamilyList;
  /** Show per-item delete buttons (the full list page). */
  editable?: boolean;
  heading?: React.ReactNode;
}) {
  const checked = list.items.filter((i) => i.checked).length;
  const open = list.items.length - checked;
  return (
    <div className="grid">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-1.5">
        {heading ?? (
          <h2 className="text-[1.05rem] font-semibold">{list.name}</h2>
        )}
        <WhatsAppButton text={listShareText(list.name, list.items)} />
      </div>
      {list.items.length === 0 ? (
        <p className="px-4 py-2 text-sm text-muted">
          Nothing on this list yet. Add the first item below.
        </p>
      ) : (
        <ul aria-label={`${list.name} items`} className="divide-y divide-line">
          {list.items.map((item) => (
            <li key={item.id} className="flex items-center">
              <CheckToggle
                checked={item.checked}
                action={setListItemCheckedAction.bind(null, item.id)}
                className="flex-1"
              >
                {item.text}
              </CheckToggle>
              {editable ? (
                <ConfirmButton
                  action={deleteListItemAction.bind(null, item.id)}
                  ariaLabel={`Remove ${item.text}`}
                  className="mr-2 grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-fg/5 hover:text-bad"
                >
                  <X aria-hidden="true" className="size-4" />
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 border-t border-line px-4 py-3">
        <ActionForm
          action={addListItemAction.bind(null, list.id)}
          submitLabel="Add"
          pendingLabel="Adding…"
          submitClassName={buttonClass}
          resetOnSuccess
          inline
          className="gap-2"
          ariaLabel={`Add to ${list.name}`}
        >
          <input
            name="text"
            required
            maxLength={200}
            autoComplete="off"
            placeholder="Add an item"
            aria-label={`Add an item to ${list.name}`}
            className={inputClass}
          />
        </ActionForm>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span>
            <span className="num">{open}</span> to get
            {checked ? (
              <>
                {" · "}
                <span className="num">{checked}</span> ticked
              </>
            ) : null}
          </span>
          {checked > 0 ? (
            <ConfirmButton
              action={clearCheckedAction.bind(null, list.id)}
              confirm={`Remove ${checked} ticked item${checked === 1 ? "" : "s"}?`}
              className="text-sm text-info hover:underline"
            >
              Clear ticked
            </ConfirmButton>
          ) : null}
        </div>
      </div>
    </div>
  );
}
