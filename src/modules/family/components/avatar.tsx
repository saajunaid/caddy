import { initials } from "../server/people.ts";

/** Initials in a small circle, e.g. "J" for Junaid. */
export function Avatar({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-grid size-[26px] shrink-0 place-items-center rounded-full border border-line bg-sunk text-[0.68rem] font-bold"
    >
      <span aria-hidden="true">{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}
