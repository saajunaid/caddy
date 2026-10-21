/** Where to look up offers. Links only: Caddy never scrapes comparison sites (their terms forbid it). */
import { isEnergy, type UtilityType } from "./types.ts";

export type ComparisonLink = { label: string; href: string };

export function comparisonLinks(type: UtilityType): ComparisonLink[] {
  if (isEnergy(type)) {
    return [
      {
        label: "bonkers.ie",
        href: "https://www.bonkers.ie/compare-gas-electricity-prices/",
      },
      { label: "switcher.ie", href: "https://switcher.ie/gas-electricity/" },
    ];
  }
  if (type === "broadband") {
    return [
      { label: "bonkers.ie", href: "https://www.bonkers.ie/" },
      { label: "switcher.ie", href: "https://switcher.ie/broadband/" },
    ];
  }
  return [
    { label: "bonkers.ie", href: "https://www.bonkers.ie/" },
    { label: "switcher.ie", href: "https://switcher.ie/" },
  ];
}
