"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireHousehold } from "@/server/auth";
import { runJob } from "@/server/jobs/runner";
import { EIRCODE, GeocodeError, geocode } from "./nominatim";
import { CATEGORY_KEYS } from "./server/categories";
import { isInIreland } from "./server/geo";
import { googleApiKeyFromEnv } from "./server/google";
import { activeSources } from "./server/sources";
import { lookupAnchor, type SourceOutcome } from "./server/lookup";
import { searchCell } from "./server/refresh";

const anchorSchema = z.object({
  key: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  latitude: z.number(),
  longitude: z.number(),
});

export type LookupState = {
  status: "idle" | "done" | "failed";
  message?: string;
};

function lookupMessage(outcomes: SourceOutcome[]): LookupState {
  const osm = outcomes.find((o) => o.source === "overpass");
  if (!osm || osm.status === "ok") {
    const googleFailed = outcomes.some(
      (o) => o.source.startsWith("google:") && o.status === "failed",
    );
    return {
      status: "done",
      message: googleFailed
        ? "Found places on OpenStreetMap. Google didn't answer; it'll be retried."
        : undefined,
    };
  }
  return {
    status: "failed",
    message: osm.busy
      ? "OpenStreetMap is busy, try again in a minute."
      : "Couldn't reach OpenStreetMap. Try again later.",
  };
}

/** Look up nearby places for one location now (the "Look up nearby places" button). */
export async function lookupNearbyAction(
  anchorInput: unknown,
): Promise<LookupState> {
  const { profile } = await requireHousehold();
  if (!profile)
    return {
      status: "failed",
      message: "Your account isn't part of a household yet.",
    };
  const parsed = anchorSchema.safeParse(anchorInput);
  if (!parsed.success || !isInIreland(parsed.data)) {
    return { status: "failed", message: "That location isn't in Ireland." };
  }
  const anchor = parsed.data;
  // Writes to the shared cache need the secret key; the caller's household was checked above.
  const admin = createAdminClient();
  let outcomes: SourceOutcome[] = [];
  const now = new Date();
  // Etiquette and cost: one lookup per location per minute, however often the button is pressed.
  const cell = searchCell(anchor);
  const recent = await admin
    .from("place_searches")
    .select("searched_at")
    .in("source", ["osm", "google"])
    .eq("latitude", cell.latitude)
    .eq("longitude", cell.longitude)
    .gte("searched_at", new Date(now.getTime() - 60_000).toISOString())
    .limit(1);
  if (recent.data && recent.data.length > 0) {
    refresh();
    return {
      status: "failed",
      message: "This area was just looked up. Try again in a minute.",
    };
  }
  try {
    const result = await runJob(
      admin,
      {
        jobType: "places-lookup",
        idempotencyKey: `places-lookup:${cell.key}:${now.toISOString()}`,
        householdId: profile.householdId,
        trigger: "manual",
        now,
      },
      async (ctx) => {
        const googleApiKey = googleApiKeyFromEnv();
        outcomes = await lookupAnchor(
          admin,
          anchor,
          activeSources(googleApiKey),
          // Keep the whole request well inside the platform's time limit.
          { googleApiKey, overpassTimeoutMs: 20_000, now },
        );
        for (const o of outcomes) {
          await ctx.recordSource({
            source: o.source,
            url: o.url,
            status: o.status,
            httpStatus: o.httpStatus,
            itemsSeen: o.itemsSeen,
            error: o.error,
          });
        }
        ctx.setSummary(`Nearby lookup for ${anchor.label}`);
      },
    );
    if (result.error) {
      return {
        status: "failed",
        message: "Something went wrong saving the results. Try again.",
      };
    }
  } catch {
    return {
      status: "failed",
      message: "Something went wrong. Try again in a minute.",
    };
  }
  refresh();
  return lookupMessage(outcomes);
}

const idsSchema = z.array(z.uuid()).min(1).max(20);

/** Pin, hide or clear a place for the household. Applies to every merged copy of the place. */
export async function setPlaceMarkAction(
  placeIds: string[],
  mark: "pinned" | "hidden" | null,
): Promise<{ error?: string }> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  const ids = idsSchema.safeParse(placeIds);
  if (
    !ids.success ||
    (mark !== null && mark !== "pinned" && mark !== "hidden")
  ) {
    return { error: "Couldn't update that place." };
  }
  const supabase = await createClient();
  const marks = supabase.from("household_place_marks");
  const failed = { error: "Couldn't update that place. Try again." };
  if (mark === null) {
    const { error } = await marks
      .delete()
      .eq("household_id", profile.householdId)
      .in("place_id", ids.data);
    if (error) return failed;
  } else {
    // Members may only change mark/note on existing rows, so update those and insert the rest.
    const existing = await supabase
      .from("household_place_marks")
      .select("place_id")
      .in("place_id", ids.data);
    if (existing.error) return failed;
    const have = new Set(existing.data.map((r) => r.place_id));
    if (have.size > 0) {
      const { error } = await supabase
        .from("household_place_marks")
        .update({ mark })
        .in("place_id", [...have]);
      if (error) return failed;
    }
    const missing = ids.data.filter((id) => !have.has(id));
    if (missing.length > 0) {
      const { error } = await supabase.from("household_place_marks").insert(
        missing.map((placeId) => ({
          household_id: profile.householdId,
          place_id: placeId,
          mark,
          created_by: user.id,
        })),
      );
      if (error) return failed;
    }
  }
  refresh();
  return {};
}

export type AddPlaceState = { error?: string; notice?: string };

const addSchema = z.object({
  name: z.string().trim().min(1, "Give the place a name.").max(200),
  category: z.enum(CATEGORY_KEYS as [string, ...string[]], {
    message: "Pick a category.",
  }),
  note: z.string().trim().max(500).optional(),
  address: z.string().trim().max(200).optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

/** Add a place the household knows (e.g. a certified halal butcher). Private to the household. */
export async function addPlaceAction(
  _prev: AddPlaceState,
  formData: FormData,
): Promise<AddPlaceState> {
  const { user, profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const parsed = addSchema.safeParse({
    name: text("name") ?? "",
    category: text("category") ?? "",
    note: text("note"),
    address: text("address"),
    latitude: text("latitude"),
    longitude: text("longitude"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const input = parsed.data;

  let point =
    input.latitude !== undefined && input.longitude !== undefined
      ? { latitude: input.latitude, longitude: input.longitude }
      : null;
  let address = input.address ?? null;
  if (!point) {
    if (!input.address) {
      return { error: "Tap the map to place it, or type its address." };
    }
    try {
      const found = await geocode(input.address);
      if (!found) {
        return {
          error: EIRCODE.test(input.address.trim())
            ? "OpenStreetMap doesn't know most Eircodes. Try the street and town, or tap the map."
            : "We couldn't find that address. Try the street and town, or tap the map.",
        };
      }
      point = { latitude: found.latitude, longitude: found.longitude };
      address = input.address;
    } catch (error) {
      return {
        error:
          error instanceof GeocodeError
            ? error.message
            : "The address search failed. Tap the map instead.",
      };
    }
  }
  if (!isInIreland(point)) return { error: "That location isn't in Ireland." };

  const supabase = await createClient();
  const { error } = await supabase.from("places").insert({
    household_id: profile.householdId,
    source: "user",
    category: input.category,
    name: input.name,
    latitude: point.latitude,
    longitude: point.longitude,
    address,
    details: input.note ? { note: input.note } : {},
    created_by: user.id,
  });
  if (error) return { error: "Couldn't save the place. Try again." };
  refresh();
  return { notice: `Added ${input.name}.` };
}

/** Remove a place the household added. Cached public places can't be deleted, only hidden. */
export async function deleteOwnPlaceAction(
  placeId: string,
): Promise<{ error?: string }> {
  const { profile } = await requireHousehold();
  if (!profile) return { error: "Your account isn't part of a household yet." };
  if (!z.uuid().safeParse(placeId).success)
    return { error: "Couldn't remove that place." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("places")
    .delete()
    .eq("id", placeId)
    .eq("source", "user")
    .eq("household_id", profile.householdId);
  if (error) return { error: "Couldn't remove that place. Try again." };
  refresh();
  return {};
}
