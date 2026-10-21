import { describe, expect, it } from "vitest";
import {
  boundingBox,
  formatKm,
  haversineM,
  isInIreland,
  locationKey,
  roundCoord,
  walkMinutes,
} from "./geo";

const castletroy = { latitude: 52.6738, longitude: -8.553 };
const limerickCity = { latitude: 52.6638, longitude: -8.6267 };

describe("haversineM", () => {
  it("is zero for the same point", () => {
    expect(haversineM(castletroy, castletroy)).toBe(0);
  });

  it("matches known distances", () => {
    // One degree of latitude is ~111.2 km.
    expect(
      haversineM(
        { latitude: 52, longitude: -8 },
        { latitude: 53, longitude: -8 },
      ),
    ).toBeCloseTo(111_195, -1);
    // Castletroy to Limerick city centre: ~5.1 km.
    expect(haversineM(castletroy, limerickCity) / 1000).toBeCloseTo(5.1, 1);
  });

  it("is symmetric", () => {
    expect(haversineM(castletroy, limerickCity)).toBeCloseTo(
      haversineM(limerickCity, castletroy),
      6,
    );
  });
});

describe("walkMinutes", () => {
  it("adds a 30% detour at 5 km/h and rounds up", () => {
    // 1 km × 1.3 = 1.3 km at 5 km/h = 15.6 min → 16.
    expect(walkMinutes(1000)).toBe(16);
    // 500 m → 7.8 → 8.
    expect(walkMinutes(500)).toBe(8);
  });

  it("is at least one minute", () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(10)).toBe(1);
  });

  it("rounds whole minutes exactly", () => {
    // 3846.15… m × 1.3 = 5 km → exactly 60 min.
    expect(walkMinutes(5000 / 1.3)).toBe(60);
  });

  it("rejects nonsense", () => {
    expect(() => walkMinutes(-1)).toThrow();
    expect(() => walkMinutes(Number.NaN)).toThrow();
  });
});

describe("formatting and rounding", () => {
  it("shows kilometres with one decimal", () => {
    expect(formatKm(150)).toBe("0.2 km");
    expect(formatKm(1049)).toBe("1.0 km");
    expect(formatKm(5200)).toBe("5.2 km");
  });

  it("rounds coordinates to ~100 m cells", () => {
    expect(roundCoord(52.67384)).toBe(52.674);
    expect(roundCoord(-8.55349)).toBe(-8.553);
    expect(locationKey(castletroy)).toBe("geo:52.674,-8.553");
  });
});

describe("isInIreland", () => {
  it("accepts the island of Ireland and refuses elsewhere", () => {
    expect(isInIreland(castletroy)).toBe(true);
    expect(isInIreland({ latitude: 54.597, longitude: -5.93 })).toBe(true); // Belfast
    expect(isInIreland({ latitude: 51.5, longitude: -0.12 })).toBe(false); // London
    expect(isInIreland({ latitude: Number.NaN, longitude: -8 })).toBe(false);
  });
});

describe("boundingBox", () => {
  it("contains every point within the radius", () => {
    const box = boundingBox(castletroy, 2000);
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = (bearing * Math.PI) / 180;
      const point = {
        latitude: castletroy.latitude + (1999 / 111_195) * Math.cos(rad),
        longitude:
          castletroy.longitude +
          ((1999 / 111_195) * Math.sin(rad)) /
            Math.cos((castletroy.latitude * Math.PI) / 180),
      };
      expect(haversineM(castletroy, point)).toBeLessThanOrEqual(2000);
      expect(point.latitude).toBeGreaterThanOrEqual(box.minLat);
      expect(point.latitude).toBeLessThanOrEqual(box.maxLat);
      expect(point.longitude).toBeGreaterThanOrEqual(box.minLon);
      expect(point.longitude).toBeLessThanOrEqual(box.maxLon);
    }
  });
});
