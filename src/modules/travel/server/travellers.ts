// Travellers and ages at travel. Pure, no I/O.
import type { IsoDate } from "../../../server/domain/dates.ts";

export type Traveller = {
  name: string;
  isChild: boolean;
  ageAtTravel: number | null;
  confirmed: boolean;
};

/** Whole years of age on `date` for someone born on `dob` (birthdays on 29 Feb count from 1 Mar). */
export function ageOn(dob: IsoDate, date: IsoDate): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = date.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return Math.max(0, age);
}

export type Party = {
  adults: number;
  children: number;
  /** Ages of children whose age is known, in traveller order. */
  childAges: number[];
  /** Children whose age at travel isn't known or isn't confirmed yet. */
  unconfirmedChildren: number;
};

export function partyOf(travellers: readonly Traveller[]): Party {
  const children = travellers.filter((t) => t.isChild);
  return {
    adults: travellers.length - children.length,
    children: children.length,
    childAges: children
      .map((c) => c.ageAtTravel)
      .filter((a): a is number => a !== null),
    unconfirmedChildren: children.filter(
      (c) => !c.confirmed || c.ageAtTravel === null,
    ).length,
  };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "2 adults + 2 children (8 and 4 at travel)", "2 adults", "No travellers yet". */
export function describeParty(party: Party): string {
  if (party.adults + party.children === 0) return "No travellers yet";
  const adults = plural(party.adults, "adult", "adults");
  if (party.children === 0) return adults;
  const kids = plural(party.children, "child", "children");
  const ages =
    party.childAges.length > 0
      ? ` (${joinAnd(party.childAges.map(String))} at travel)`
      : "";
  return `${adults} + ${kids}${ages}`;
}
