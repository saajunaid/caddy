"use client";

import { useRef } from "react";

/** County filter. A plain GET form, submitted as soon as the choice changes. */
export function CountySelect({
  counties,
  value,
  hidden,
}: {
  counties: string[];
  value: string;
  /** Other search params to keep (filter, sort). */
  hidden: Record<string, string>;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      action="/housing"
      method="get"
      className="flex items-center gap-2"
    >
      {Object.entries(hidden).map(([name, v]) => (
        <input key={name} type="hidden" name={name} value={v} />
      ))}
      <label htmlFor="county" className="text-sm text-muted">
        County
      </label>
      <select
        id="county"
        name="county"
        defaultValue={value}
        onChange={() => form.current?.requestSubmit()}
        className="min-h-9 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
      >
        <option value="">All of Ireland</option>
        {counties.map((county) => (
          <option key={county} value={county}>
            {county}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm text-info">
          Apply
        </button>
      </noscript>
    </form>
  );
}
