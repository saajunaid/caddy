// Where to look for nearby places. The default source is the Housing module's listings.
// Runs in plain Node and in the app: relative .ts imports, no Next.js APIs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isValidLatLon, type Anchor } from "./geo.ts";

export type AnchorSource = (admin: SupabaseClient) => Promise<Anchor[]>;

const listingSchema = z.object({
  id: z.union([z.string(), z.number()]),
  title: z.string().nullable().optional(),
  latitude: z.union([z.number(), z.string()]).nullable(),
  longitude: z.union([z.number(), z.string()]).nullable(),
});

/** Anchor key for a housing listing; the Housing page passes the same key to NearbyPanel. */
export function listingAnchorKey(listingId: string | number): string {
  return `housing:${listingId}`;
}

/** Convert raw listing rows into anchors, skipping rows that aren't on the map yet. */
export function anchorsFromRows(rows: readonly unknown[]): Anchor[] {
  const anchors: Anchor[] = [];
  for (const raw of rows) {
    const row = listingSchema.safeParse(raw);
    if (!row.success) continue;
    const { id, title } = row.data;
    if (row.data.latitude === null || row.data.longitude === null) continue;
    const latitude = Number(row.data.latitude);
    const longitude = Number(row.data.longitude);
    if (!isValidLatLon({ latitude, longitude })) continue;
    anchors.push({
      key: listingAnchorKey(id),
      label: title?.trim() || "Housing listing",
      latitude,
      longitude,
    });
  }
  return anchors;
}

/**
 * Housing listings with coordinates. housing_listings belongs to the Housing module, so it's read
 * through an untyped client and checked at runtime; this compiles before that table exists.
 */
export const anchorsFromHousing: AnchorSource = async (admin) => {
  const { data, error } = await admin
    .from("housing_listings")
    .select("id, title, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(1000);
  if (error)
    throw new Error(`Couldn't read housing listings: ${error.message}`);
  return anchorsFromRows((data ?? []) as unknown[]);
};
