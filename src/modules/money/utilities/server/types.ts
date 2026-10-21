/** Shared vocabulary for the Utilities module. Pure, no I/O. */

export const UTILITY_TYPES = [
  "electricity",
  "gas",
  "dual_fuel",
  "broadband",
  "mobile",
  "home_insurance",
] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

export const UTILITY_TYPE_LABELS: Record<UtilityType, string> = {
  electricity: "Electricity",
  gas: "Gas",
  dual_fuel: "Dual fuel",
  broadband: "Broadband",
  mobile: "Mobile",
  home_insurance: "Home insurance",
};

export const METER_TYPES = [
  "smart_tou",
  "smart_24h",
  "day_night",
  "standard",
  "unknown",
] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const METER_TYPE_LABELS: Record<MeterType, string> = {
  smart_tou: "Smart meter · time-of-use",
  smart_24h: "Smart meter · 24-hour",
  day_night: "Day/night meter",
  standard: "Standard 24-hour meter",
  unknown: "Meter type unknown",
};

export const CONTRACT_STATUSES = ["active", "switching", "ended"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const DECISIONS = ["selected", "rejected", "negotiating"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Usage bands. Electricity: day/night/peak (time-of-use) or standard (24-hour). Gas: gas. */
export const BANDS = ["day", "night", "peak", "standard", "gas"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABELS: Record<Band, string> = {
  day: "Day",
  night: "Night",
  peak: "Peak",
  standard: "24-hour",
  gas: "Gas",
};

export const ENERGY_TYPES: readonly UtilityType[] = [
  "electricity",
  "gas",
  "dual_fuel",
];

export function isEnergy(type: UtilityType): boolean {
  return ENERGY_TYPES.includes(type);
}

/** Electricity bands a meter type records. Unknown meters expect nothing in particular. */
export function electricityBands(meter: MeterType): Band[] {
  switch (meter) {
    case "smart_tou":
      return ["day", "night", "peak"];
    case "day_night":
      return ["day", "night"];
    case "smart_24h":
    case "standard":
      return ["standard"];
    case "unknown":
      return [];
  }
}

/** Bands a contract's bills should show, used to flag missing usage. */
export function expectedBands(type: UtilityType, meter: MeterType): Band[] {
  if (type === "electricity") return electricityBands(meter);
  if (type === "gas") return ["gas"];
  if (type === "dual_fuel") return [...electricityBands(meter), "gas"];
  return [];
}

/** Bands an offer for this utility type can carry rates for. */
export function offerBands(type: UtilityType): Band[] {
  if (type === "electricity") return ["day", "night", "peak", "standard"];
  if (type === "gas") return ["gas"];
  if (type === "dual_fuel") return ["day", "night", "peak", "standard", "gas"];
  return [];
}

/** Ireland's reduced VAT rate on energy is the default; other services usually 23%, insurance none. */
export function defaultVatPercent(type: UtilityType): string {
  if (isEnergy(type)) return "9";
  if (type === "home_insurance") return "0";
  return "23";
}

export const DEFAULT_EXCLUDED_SUPPLIERS: readonly string[] = [
  "Bord Gáis Energy",
];
