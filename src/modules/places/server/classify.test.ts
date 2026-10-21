import { describe, expect, it } from "vitest";
import {
  classifyOsm,
  foldText,
  halalEvidence,
  osmAddress,
  osmDetails,
  osmName,
  schoolLevel,
} from "./classify";

describe("classifyOsm", () => {
  it.each([
    [{ amenity: "kindergarten" }, "childcare"],
    [{ amenity: "childcare" }, "childcare"],
    [{ amenity: "university" }, "higher"],
    [{ amenity: "college" }, "higher"],
    [{ highway: "bus_stop" }, "bus"],
    [{ public_transport: "platform", bus: "yes" }, "bus"],
    [{ amenity: "place_of_worship", religion: "muslim" }, "mosque"],
    [{ amenity: "restaurant", "diet:halal": "yes" }, "halal"],
    [{ amenity: "fast_food", "diet:halal": "only" }, "halal"],
    [{ amenity: "restaurant", cuisine: "kebab;halal" }, "halal"],
    [{ shop: "butcher", name: "Halal Meats Limerick" }, "halal"],
  ])("%o → %s", (tags, category) => {
    expect(classifyOsm(tags)).toBe(category);
  });

  it.each([
    [{ amenity: "place_of_worship", religion: "christian" }],
    [{ amenity: "restaurant", "diet:halal": "no" }],
    [{ public_transport: "platform", train: "yes" }],
    [{ amenity: "restaurant", name: "Pizza Place" }],
    // "Halal" in a name only counts for food places and shops.
    [{ office: "company", name: "Halal Certification Ltd" }],
    [{}],
  ])("ignores %o", (tags) => {
    expect(classifyOsm(tags)).toBeNull();
  });

  it("puts a mosque with halal tags under mosques", () => {
    expect(
      classifyOsm({
        amenity: "place_of_worship",
        religion: "muslim",
        "diet:halal": "yes",
      }),
    ).toBe("mosque");
  });
});

describe("schoolLevel", () => {
  it("uses ISCED levels first", () => {
    expect(schoolLevel({ "isced:level": "1", name: "X College" })).toBe(
      "primary",
    );
    expect(schoolLevel({ "isced:level": "2;3" })).toBe("secondary");
    expect(schoolLevel({ "isced:level": "2-3" })).toBe("secondary");
    expect(schoolLevel({ "isced:level": "1-3" })).toBe("school");
    expect(schoolLevel({ "school:level": "primary" })).toBe("primary");
    expect(schoolLevel({ "school:level": "post-primary" })).toBe("secondary");
  });

  it.each([
    ["Scoil Mhuire", "primary"],
    ["Lisnagry National School", "primary"],
    ["St. Patrick's N.S.", "primary"],
    ["Milford NS", "primary"],
    ["Castle Educate Together", "primary"],
    ["Gaelscoil an Raithín", "primary"],
    ["Castletroy College", "secondary"],
    ["Castletroy Community College", "secondary"],
    ["Ardscoil Rís Community School", "secondary"],
    ["Coláiste Iósaef", "secondary"],
    ["Limerick Educate Together Secondary School", "secondary"],
    ["Scoil Mhuire Secondary", "secondary"],
    ["Saint Vincent's School", "school"],
    ["Saint Vincent's Centre", "school"],
  ])("%s → %s", (name, level) => {
    expect(schoolLevel({ amenity: "school", name })).toBe(level);
  });

  it("never guesses when there's no name or level", () => {
    expect(schoolLevel({ amenity: "school" })).toBe("school");
  });
});

describe("helpers", () => {
  it("folds accents and dots", () => {
    expect(foldText("Coláiste N.S.")).toBe("colaiste ns");
  });

  it("reports the halal evidence", () => {
    expect(halalEvidence({ "diet:halal": "Yes" })).toBe("yes");
    expect(halalEvidence({ cuisine: "halal" })).toBe("cuisine");
    expect(halalEvidence({ amenity: "cafe", name: "The Halal Cafe" })).toBe(
      "name",
    );
    expect(halalEvidence({ amenity: "cafe", name: "Shalala" })).toBeNull();
  });

  it("names unnamed objects honestly", () => {
    expect(osmName({ highway: "bus_stop" }, "bus")).toBe(
      "Bus stop (name not stated)",
    );
    expect(osmName({ name: "  Plassey Park Road " }, "bus")).toBe(
      "Plassey Park Road",
    );
  });

  it("builds addresses from addr tags only", () => {
    expect(
      osmAddress({
        "addr:housenumber": "12",
        "addr:street": "Main Street",
        "addr:city": "Limerick",
        "addr:postcode": "V94 X2Y3",
      }),
    ).toBe("12 Main Street, Limerick, V94 X2Y3");
    expect(osmAddress({ name: "x" })).toBeNull();
  });

  it("keeps a small subset of tags per category", () => {
    expect(
      osmDetails(
        {
          highway: "bus_stop",
          ref: "607651",
          route_ref: "304;304A",
          lit: "yes",
        },
        "bus",
      ),
    ).toEqual({ ref: "607651", routes: "304;304A" });
    expect(
      osmDetails(
        { amenity: "restaurant", "diet:halal": "yes", cuisine: "kebab" },
        "halal",
      ),
    ).toEqual({ cuisine: "kebab", halal: "yes" });
    expect(osmDetails({ amenity: "kindergarten" }, "childcare")).toEqual({
      kind: "Preschool / ECCE",
    });
  });
});
