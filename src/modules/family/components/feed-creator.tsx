"use client";

import { useState, useTransition } from "react";
import { createFeedAction, type FeedState } from "../actions";
import { CopyButton } from "./controls";
import { buttonClass, inputClass, labelClass, primaryButtonClass } from "./ui";

/** Creates a calendar feed and shows its secret URLs once. */
export function FeedCreator() {
  const [state, setState] = useState<FeedState>({});
  const [pending, startTransition] = useTransition();

  if (state.urls) {
    const { https, webcal } = state.urls;
    return (
      <div className="grid gap-3 rounded-[10px] border border-ok/50 bg-sunk p-3">
        <p className="text-sm font-semibold">
          Your feed is ready. Copy the link now: it won&apos;t be shown again.
        </p>
        <div className="grid gap-1.5">
          <span className="text-sm text-muted">
            Apple Calendar (iPhone, iPad, Mac)
          </span>
          <code className="num block overflow-x-auto rounded-md bg-bg px-2 py-1.5 text-xs break-all">
            {webcal}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={webcal} label="Copy webcal link" />
            <a href={webcal} className={buttonClass}>
              Open in Calendar
            </a>
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-sm text-muted">Google Calendar and others</span>
          <code className="num block overflow-x-auto rounded-md bg-bg px-2 py-1.5 text-xs break-all">
            {https}
          </code>
          <div>
            <CopyButton text={https} label="Copy https link" />
          </div>
        </div>
        <p className="text-sm text-muted">
          Anyone with this link can see your family events and task due dates.
          Only share it with people in your household; revoke it below if it
          leaks.
        </p>
        <button
          type="button"
          className={buttonClass}
          onClick={() => setState({})}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(async () => {
          try {
            setState(await createFeedAction(data));
          } catch {
            setState({ error: "Couldn't create the feed. Try again." });
          }
        });
      }}
    >
      <label htmlFor="feed-label" className={labelClass}>
        Name this feed
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="feed-label"
          name="label"
          maxLength={60}
          placeholder="e.g. My iPhone"
          className={`${inputClass} flex-1 basis-48`}
        />
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Creating…" : "Create feed link"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-bad">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
