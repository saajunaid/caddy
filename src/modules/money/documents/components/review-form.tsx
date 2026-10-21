"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/card";
import { Chip, ProvenanceTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { btn, btnPrimary, btnSmall, input, sectionTitle } from "../../ui";
import { saveReviewAction } from "../actions";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type ExpenseCategory,
  type PaymentStatus,
} from "../categories";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  FIELD_DEF,
  FIELD_KEYS,
  type Confidence,
  type FieldKey,
  type FieldValue,
} from "../fields";
import { formatFieldValue, inputValue, parseFieldInput } from "../review";
import type { ReviewPayload, ReviewState } from "../review-payload";
import { BILL_TAX_CATEGORIES, TAX_CATEGORY_LABELS } from "../../tax/categories";

export type ReviewField = {
  key: FieldKey;
  value: FieldValue | null;
  confirmed: boolean;
  confidence?: Confidence;
  snippet?: string;
  candidates?: FieldValue[];
};

export type ReviewFormProps = {
  documentId: string;
  currency: string;
  fields: ReviewField[];
  alreadyConfirmed: boolean;
  expense: {
    enabled: boolean;
    category: ExpenseCategory;
    paymentStatus: PaymentStatus;
    isRecurring: boolean;
  };
  tax: {
    enabled: boolean;
    year: number;
    years: number[];
    category: (typeof BILL_TAX_CATEGORIES)[number];
    amount: string;
    members: { id: string; name: string; checked: boolean; share: string }[];
  };
};

type FieldState = ReviewField & {
  editing: boolean;
  draft: string;
  error?: string;
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function ConfidenceBars({ level }: { level: Confidence }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  const colour =
    level === "high" ? "bg-ok" : level === "medium" ? "bg-review" : "bg-bad";
  return (
    <span
      className="inline-flex gap-0.5 align-middle"
      role="img"
      aria-label={CONFIDENCE_LABEL[level]}
    >
      {[0, 1, 2].map((i) => (
        <b
          key={i}
          className={cn(
            "h-3 w-[5px] rounded-[2px]",
            i < filled ? colour : "bg-line",
          )}
        />
      ))}
    </span>
  );
}

function FieldEditor({
  field,
  onChange,
}: {
  field: FieldState;
  onChange: (draft: string) => void;
}) {
  const def = FIELD_DEF[field.key];
  const id = `field-${field.key}`;
  const common = {
    id,
    value: field.draft,
    "aria-invalid": field.error ? true : undefined,
    "aria-describedby": field.error ? `${id}-error` : undefined,
    className: input,
  };
  if (def.kind === "documentType") {
    return (
      <select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">Unknown</option>
        {DOCUMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOCUMENT_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      {...common}
      type={def.kind === "date" ? "date" : "text"}
      inputMode={
        def.kind === "money" || def.kind === "decimal" ? "decimal" : undefined
      }
      placeholder={
        def.kind === "money"
          ? "212.48"
          : def.kind === "masked"
            ? "Last 4 characters"
            : def.unit
              ? def.unit
              : undefined
      }
      autoComplete="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Proposed fields with confidence, Confirm / Edit per field, and what to use the document for. */
export function ReviewForm(props: ReviewFormProps) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(
    saveReviewAction,
    {},
  );
  const [fields, setFields] = useState<FieldState[]>(() =>
    props.fields.map((f) => ({
      ...f,
      editing: false,
      draft: inputValue(f.key, f.value),
    })),
  );
  const [expense, setExpense] = useState(props.expense);
  const [tax, setTax] = useState(props.tax);

  const update = (key: FieldKey, change: Partial<FieldState>) =>
    setFields((all) =>
      all.map((f) => (f.key === key ? { ...f, ...change } : f)),
    );

  const extraKeys = FIELD_KEYS.filter((k) => !fields.some((f) => f.key === k));
  const addMoreFields = () =>
    setFields((all) => [
      ...all,
      ...extraKeys.map((key): FieldState => ({
        key,
        value: null,
        confirmed: false,
        editing: false,
        draft: "",
      })),
    ]);

  const toConfirm = fields.filter(
    (f) => f.value !== null && !f.confirmed,
  ).length;
  const editing = fields.some((f) => f.editing);
  const serverErrors = state.fieldErrors ?? {};

  function finishEdit(field: FieldState) {
    const parsed = parseFieldInput(field.key, field.draft);
    if (!parsed.ok) {
      update(field.key, { error: parsed.error });
      return;
    }
    // A value the user typed is theirs: confirmed.
    update(field.key, {
      value: parsed.value,
      confirmed: parsed.value !== null,
      editing: false,
      error: undefined,
      draft: inputValue(field.key, parsed.value),
    });
  }

  function choose(field: FieldState, value: FieldValue) {
    update(field.key, {
      value,
      confirmed: true,
      draft: inputValue(field.key, value),
      error: undefined,
    });
  }

  const payload: ReviewPayload = {
    documentId: props.documentId,
    fields: Object.fromEntries(
      fields.map((f) => [f.key, inputValue(f.key, f.value)]),
    ),
    expense,
    tax: {
      enabled: tax.enabled,
      year: tax.year,
      category: tax.category,
      amount: tax.amount,
      members: tax.members
        .filter((m) => m.checked)
        .map((m) => ({ memberId: m.id, sharePercent: m.share })),
    },
  };
  const taxNeedsPerson = tax.enabled && !tax.members.some((m) => m.checked);
  const canSave = toConfirm === 0 && !editing && !taxNeedsPerson && !pending;

  return (
    <form action={formAction} className="grid content-start gap-[22px]">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-1.5">
          <h2 className={sectionTitle}>
            {props.alreadyConfirmed ? "Details" : "Proposed fields"}
          </h2>
          <div className="flex items-center gap-2">
            {toConfirm > 0 ? (
              <Chip tone="review">{toConfirm} to confirm</Chip>
            ) : (
              <Chip tone="ok">All checked</Chip>
            )}
            <button
              type="button"
              className="text-sm font-semibold text-info hover:underline disabled:opacity-60"
              disabled={toConfirm === 0}
              onClick={() =>
                setFields((all) =>
                  all.map((f) =>
                    f.value !== null ? { ...f, confirmed: true } : f,
                  ),
                )
              }
            >
              Confirm all
            </button>
          </div>
        </div>
        <ul className="divide-y divide-line">
          {fields.map((field) => {
            const def = FIELD_DEF[field.key];
            const error = field.error ?? serverErrors[field.key];
            return (
              <li key={field.key} className="grid gap-2 px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                      <label htmlFor={`field-${field.key}`}>{def.label}</label>
                      {field.confidence && !field.confirmed ? (
                        <ConfidenceBars level={field.confidence} />
                      ) : null}
                      {field.value !== null ? (
                        <ProvenanceTag
                          source={field.confirmed ? "user" : "ocr-proposed"}
                        />
                      ) : null}
                    </span>
                    {!field.editing ? (
                      <span
                        className={cn(
                          "num min-w-0 break-words",
                          field.value === null && "text-muted",
                        )}
                      >
                        {field.value === null
                          ? field.candidates?.length
                            ? "Several found: choose one"
                            : "Not found"
                          : formatFieldValue(
                              field.key,
                              field.value,
                              props.currency,
                            )}
                        {field.confirmed && field.value !== null ? (
                          <span className="text-ok" aria-label="confirmed">
                            {" "}
                            ✓
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  {!field.editing ? (
                    <div className="flex shrink-0 gap-1.5">
                      {field.value !== null ? (
                        <button
                          type="button"
                          className={btnSmall}
                          onClick={() =>
                            update(field.key, { confirmed: !field.confirmed })
                          }
                        >
                          {field.confirmed ? "Undo" : "Confirm"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={btnSmall}
                        onClick={() =>
                          update(field.key, {
                            editing: true,
                            draft: inputValue(field.key, field.value),
                          })
                        }
                        aria-label={`Edit ${def.label}`}
                      >
                        {field.value === null ? "Add" : "Edit"}
                      </button>
                    </div>
                  ) : null}
                </div>

                {field.editing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <FieldEditor
                        field={field}
                        onChange={(draft) =>
                          update(field.key, { draft, error: undefined })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className={btnSmall}
                      onClick={() => finishEdit(field)}
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      className={btnSmall}
                      onClick={() =>
                        update(field.key, {
                          editing: false,
                          error: undefined,
                          draft: inputValue(field.key, field.value),
                        })
                      }
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}

                {field.value === null &&
                field.candidates?.length &&
                !field.editing ? (
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label={`Choose ${def.label}`}
                  >
                    {field.candidates.map((candidate) => (
                      <button
                        key={String(candidate)}
                        type="button"
                        className="num rounded-full border border-line px-2.5 py-1 text-sm hover:border-muted"
                        onClick={() => choose(field, candidate)}
                      >
                        {formatFieldValue(field.key, candidate, props.currency)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {field.snippet && !field.confirmed ? (
                  <span
                    className="num truncate text-xs text-muted"
                    title={field.snippet}
                  >
                    “{field.snippet}”
                  </span>
                ) : null}
                {error ? (
                  <span
                    id={`field-${field.key}-error`}
                    role="alert"
                    className="text-sm text-bad"
                  >
                    {error}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {extraKeys.length > 0 ? (
          <div className="px-4 pb-3">
            <button
              type="button"
              className="text-sm font-semibold text-info hover:underline"
              onClick={addMoreFields}
            >
              Add another field
            </button>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="px-4 pt-4 pb-1">
          <h2 className={sectionTitle}>Use this bill for</h2>
        </div>

        <div className="grid gap-2 px-4 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-[18px] accent-[var(--purple)]"
              checked={expense.enabled}
              onChange={(e) =>
                setExpense({ ...expense, enabled: e.target.checked })
              }
            />
            <span>
              <strong>Household spending</strong>
              <span className="block text-sm text-muted">
                Adds it to your monthly spending totals
              </span>
            </span>
          </label>
          {expense.enabled ? (
            <div className="grid gap-2 pl-7 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Category
                <select
                  className={input}
                  value={expense.category}
                  onChange={(e) =>
                    setExpense({
                      ...expense,
                      category: e.target.value as ExpenseCategory,
                    })
                  }
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Paid?
                <select
                  className={input}
                  value={expense.paymentStatus}
                  onChange={(e) =>
                    setExpense({
                      ...expense,
                      paymentStatus: e.target.value as PaymentStatus,
                    })
                  }
                >
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {PAYMENT_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--purple)]"
                  checked={expense.isRecurring}
                  onChange={(e) =>
                    setExpense({ ...expense, isRecurring: e.target.checked })
                  }
                />
                A regular bill
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 border-t border-line px-4 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 size-[18px] accent-[var(--purple)]"
              checked={tax.enabled}
              onChange={(e) => setTax({ ...tax, enabled: e.target.checked })}
            />
            <span>
              <strong>Tax evidence · remote working relief</strong>
              <span className="block text-sm text-muted">
                Counts towards the WFH estimate for the people you choose
              </span>
            </span>
          </label>
          {tax.enabled ? (
            <div className="grid gap-3 pl-7">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-semibold">
                  Tax year
                  <select
                    className={input}
                    value={tax.year}
                    onChange={(e) =>
                      setTax({ ...tax, year: Number(e.target.value) })
                    }
                  >
                    {tax.years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold">
                  Counts as
                  <select
                    className={input}
                    value={tax.category}
                    onChange={(e) =>
                      setTax({
                        ...tax,
                        category: e.target
                          .value as ReviewFormProps["tax"]["category"],
                      })
                    }
                  >
                    {BILL_TAX_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {TAX_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold sm:col-span-2">
                  Amount to count for this year
                  <input
                    className={input}
                    inputMode="decimal"
                    placeholder="The bill total"
                    value={tax.amount}
                    onChange={(e) => setTax({ ...tax, amount: e.target.value })}
                  />
                  <span className="text-xs font-normal text-muted">
                    Leave blank to use the total. Change it if the bill spans
                    two tax years or includes arrears.
                  </span>
                </label>
              </div>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold">Evidence for</legend>
                {tax.members.length === 0 ? (
                  <p className="text-sm text-muted">
                    No adults found in your household.
                  </p>
                ) : null}
                {tax.members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <label className="flex min-w-32 flex-1 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--purple)]"
                        checked={member.checked}
                        onChange={(e) =>
                          setTax({
                            ...tax,
                            members: tax.members.map((m) =>
                              m.id === member.id
                                ? { ...m, checked: e.target.checked }
                                : m,
                            ),
                          })
                        }
                      />
                      {member.name}
                    </label>
                    {member.checked ? (
                      <label className="flex items-center gap-1.5 text-sm">
                        Share
                        <input
                          className={cn(input, "w-20")}
                          inputMode="decimal"
                          value={member.share}
                          aria-label={`${member.name}'s share of this bill, percent`}
                          onChange={(e) =>
                            setTax({
                              ...tax,
                              members: tax.members.map((m) =>
                                m.id === member.id
                                  ? { ...m, share: e.target.value }
                                  : m,
                              ),
                            })
                          }
                        />
                        %
                      </label>
                    ) : null}
                  </div>
                ))}
                <p className="text-xs text-muted">
                  If you share the bill, give each person their share (for
                  example 50% each).
                </p>
                {taxNeedsPerson ? (
                  <p className="text-sm text-due">
                    Choose at least one person.
                  </p>
                ) : null}
              </fieldset>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 border-t border-line p-4">
          {state.error ? (
            <p role="alert" className="text-sm text-bad">
              {state.error}
            </p>
          ) : null}
          {toConfirm > 0 ? (
            <p className="text-sm text-muted">
              Confirm or edit the {toConfirm} remaining field
              {toConfirm === 1 ? "" : "s"} to save.
            </p>
          ) : null}
          <button
            type="submit"
            className={cn(btnPrimary, "w-full")}
            disabled={!canSave}
          >
            {pending ? "Saving…" : "Save and link"}
          </button>
          {props.alreadyConfirmed ? (
            <p className="text-xs text-muted">
              Already confirmed. Saving again updates the details and links.
            </p>
          ) : null}
        </div>
      </Card>
      <noscript>
        <p className={btn}>Reviewing needs JavaScript.</p>
      </noscript>
    </form>
  );
}
