// Short, factual detail line for a place. Pure; only restates what the source said.
import type { PlaceCategory } from "./categories.ts";
import type { PlaceDetails, PlaceSource } from "./types.ts";

const HALAL: Record<string, string> = {
  yes: "Tagged halal (diet:halal=yes)",
  only: "Tagged halal only (diet:halal=only)",
  cuisine: "Tagged halal cuisine",
  name: "Halal in the name",
};

function routes(value: string): string {
  const list = value
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean);
  return `${list.length === 1 ? "Route" : "Routes"} ${list.join(", ")}`;
}

export function describePlace(place: {
  category: PlaceCategory;
  source: PlaceSource;
  details: PlaceDetails;
  address: string | null;
}): string {
  const d = place.details;
  const parts: string[] = [];
  switch (place.category) {
    case "bus":
      if (d.ref) parts.push(`Stop ${d.ref}`);
      if (d.routes) parts.push(routes(d.routes));
      break;
    case "school":
      parts.push("School (level not stated)");
      break;
    case "halal":
      if (d.halal && HALAL[d.halal]) parts.push(HALAL[d.halal]);
      if (d.cuisine) parts.push(d.cuisine.replace(/;/g, ", "));
      break;
    case "mosque":
      if (d.denomination) parts.push(d.denomination);
      break;
    default:
      if (d.kind) parts.push(d.kind);
  }
  if (place.source === "google" && d.kind) parts.push(d.kind);
  if (place.source === "user" && d.note) parts.push(d.note);
  if (parts.length === 0 && place.address) parts.push(place.address);
  return parts.join(" · ");
}
