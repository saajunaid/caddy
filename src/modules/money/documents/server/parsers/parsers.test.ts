import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FieldKey, FieldValue, ProposedFields } from "../../fields";
import { countFoundFields, parseDocumentText } from "./index";

const FIXTURES = path.resolve(process.cwd(), "tests/fixtures/bills");
const fixture = (name: string) =>
  readFileSync(path.join(FIXTURES, name), "utf8");

/** Field values only, for compact assertions. */
function values(
  fields: ProposedFields,
): Partial<Record<FieldKey, FieldValue | null>> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field?.value ?? null]),
  );
}

describe("supplier parsers on synthetic fixtures", () => {
  it("Electric Ireland smart electricity bill", () => {
    const result = parseDocumentText(
      fixture("electric-ireland-electricity.txt"),
    );
    expect(result.extractor).toBe("rules:electric-ireland");
    expect(result.supplierId).toBe("electric-ireland");
    expect(values(result.fields)).toEqual({
      supplier: "Electric Ireland",
      document_type: "electricity_bill",
      document_date: "2026-10-03",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      due_date: "2026-10-20",
      total_cents: 21248,
      vat_cents: 1754,
      vat_rate_percent: "9",
      standing_charge_cents: 2482,
      invoice_number: "EI2026100347",
      account_number_masked: "•••• 4821",
      mprn_masked: "•••• 5678",
      day_kwh: "412",
      day_rate_cents: "37.12",
      night_kwh: "288",
      night_rate_cents: "19.85",
      peak_kwh: "51",
      peak_rate_cents: "42.1",
    });
    expect(result.fields.total_cents?.confidence).toBe("high");
    expect(result.fields.supplier?.confidence).toBe("high");
    expect(result.warnings).toEqual([]);
  });

  it("SSE Airtricity 24-hour bill with meter readings", () => {
    const result = parseDocumentText(fixture("sse-airtricity-electricity.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "SSE Airtricity",
      document_type: "electricity_bill",
      document_date: "2026-09-05",
      period_start: "2026-07-01",
      period_end: "2026-08-30",
      due_date: "2026-09-22",
      total_cents: 38053,
      vat_cents: 3142,
      vat_rate_percent: "9",
      standing_charge_cents: 4178,
      invoice_number: "004471298",
      account_number_masked: "•••• 4302",
      mprn_masked: "•••• 5432",
      standard_kwh: "842",
      standard_rate_cents: "36.5",
    });
  });

  it("Energia smart bill with euro unit rates", () => {
    const result = parseDocumentText(fixture("energia-electricity.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Energia",
      document_type: "electricity_bill",
      document_date: "2026-10-05",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      due_date: "2026-10-19",
      total_cents: 23478,
      vat_cents: 1939,
      standing_charge_cents: 2301,
      invoice_number: "INV-7781-2026",
      account_number_masked: "•••• 0071",
      day_kwh: "380",
      day_rate_cents: "34.2",
      night_kwh: "260",
      night_rate_cents: "17.1",
      peak_kwh: "45",
      peak_rate_cents: "39.9",
    });
  });

  it("Bord Gáis Energy gas bill", () => {
    const result = parseDocumentText(fixture("bord-gais-gas.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Bord Gáis Energy",
      document_type: "gas_bill",
      document_date: "2026-09-08",
      period_start: "2026-07-01",
      period_end: "2026-08-30",
      due_date: "2026-09-24",
      total_cents: 20665,
      vat_cents: 1706,
      vat_rate_percent: "9",
      standing_charge_cents: 2403,
      invoice_number: "BG50918273",
      account_number_masked: "•••• 6655",
      gprn_masked: "•••• 4567",
      gas_kwh: "1104",
      gas_rate_cents: "13.86",
    });
  });

  it("Flogas dual fuel bill: two standing charges become choices, not a guess", () => {
    const result = parseDocumentText(fixture("flogas-dual-fuel.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Flogas",
      document_type: "dual_fuel_bill",
      document_date: "2026-08-12",
      period_start: "2026-06-01",
      period_end: "2026-07-31",
      due_date: "2026-08-26",
      total_cents: 40920,
      vat_cents: 3379,
      mprn_masked: "•••• 6777",
      gprn_masked: "•••• 4321",
      standard_kwh: "650",
      standard_rate_cents: "33.8",
      gas_kwh: "900",
      gas_rate_cents: "12.95",
    });
    expect(result.fields.standing_charge_cents).toMatchObject({
      value: null,
      confidence: "low",
      candidates: [1781, 2135],
    });
    expect(result.warnings).toContain("standing_charge_cents-ambiguous");
  });

  it("Eir broadband bill", () => {
    const result = parseDocumentText(fixture("eir-broadband.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Eir",
      document_type: "broadband_bill",
      document_date: "2026-10-02",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      due_date: "2026-10-16",
      total_cents: 4500,
      vat_cents: 841,
      vat_rate_percent: "23",
      invoice_number: "0099182736",
      account_number_masked: "•••• 6789",
    });
    expect(result.fields.document_type?.confidence).toBe("high");
  });

  it("Virgin Media broadband bill", () => {
    const result = parseDocumentText(fixture("virgin-media-broadband.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Virgin Media",
      document_type: "broadband_bill",
      document_date: "2026-09-12",
      period_start: "2026-09-12",
      period_end: "2026-10-11",
      due_date: "2026-09-26",
      total_cents: 6500,
      vat_cents: 1215,
      vat_rate_percent: "23",
      invoice_number: "VM88123400",
      account_number_masked: "•••• 4567",
    });
  });
});

describe("receipts", () => {
  it("Tesco: total to pay, not the subtotal or savings", () => {
    const result = parseDocumentText(fixture("tesco-receipt.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Tesco",
      document_type: "receipt",
      total_cents: 6415,
      document_date: "2026-10-14",
    });
    expect(result.fields.total_cents?.confidence).toBe("high");
    // Only date on the receipt and no label: offered with low confidence.
    expect(result.fields.document_date?.confidence).toBe("low");
    expect(result.fields.vat_cents).toBeUndefined();
  });

  it("Lidl", () => {
    const result = parseDocumentText(fixture("lidl-receipt.txt"));
    expect(values(result.fields)).toMatchObject({
      supplier: "Lidl",
      document_type: "receipt",
      total_cents: 2347,
      document_date: "2026-10-12",
    });
  });
});

describe("generic fallback", () => {
  it("unknown supplier: reads labelled values with low confidence only", () => {
    const result = parseDocumentText(fixture("unknown-invoice.txt"));
    expect(result.extractor).toBe("rules:generic");
    expect(result.supplierId).toBeNull();
    expect(result.fields.supplier).toBeUndefined();
    expect(values(result.fields)).toMatchObject({
      document_type: "other",
      document_date: "2026-10-15",
      due_date: "2026-10-29",
      total_cents: 8000,
      vat_cents: 1496,
      invoice_number: "INV-2026-0142",
    });
    for (const field of Object.values(result.fields)) {
      expect(field?.confidence).toBe("low");
    }
  });

  it("several different totals: no value, every candidate offered", () => {
    const result = parseDocumentText(
      "Some Company\nAmount due €50.00\nAmount due €75.00\n",
    );
    expect(result.fields.total_cents).toEqual({
      value: null,
      confidence: "low",
      snippet: "Amount due €50.00",
      candidates: [5000, 7500],
    });
    expect(result.warnings).toContain("total_cents-ambiguous");
  });

  it("the same total printed twice is one value", () => {
    const result = parseDocumentText("Amount due €50.00\nAmount due €50.00");
    expect(result.fields.total_cents?.value).toBe(5000);
  });

  it("value on the line after its label", () => {
    const result = parseDocumentText(
      "Invoice Date\n15/10/2026\nTotal due\n€80.00",
    );
    expect(values(result.fields)).toMatchObject({
      document_date: "2026-10-15",
      total_cents: 8000,
    });
  });

  it("two suppliers named equally: supplier left for the user", () => {
    const result = parseDocumentText(
      "Switching from Energia to Flogas?\nAmount due €10.00",
    );
    expect(result.fields.supplier).toEqual({
      value: null,
      confidence: "low",
      candidates: ["Energia", "Flogas"],
    });
  });

  it("empty or unreadable text proposes nothing", () => {
    const result = parseDocumentText("   \n  ");
    expect(result.fields).toEqual({});
    expect(result.warnings).toEqual(["no-text"]);
    expect(countFoundFields(result.fields)).toBe(0);
  });

  it("never invents a total from unlabelled amounts", () => {
    const result = parseDocumentText("Random note\n€12.00\n€30.00");
    expect(result.fields.total_cents).toBeUndefined();
    expect(result.warnings).toContain("total-not-found");
  });

  it("OCR-style noise: extra spaces, odd dashes and non-breaking spaces", () => {
    const result = parseDocumentText(
      "ELECTRIC  IRELAND\nBill Date   03 Oct 2026\nBilling Period 01/09/2026 – 30/09/2026\nTotal  Amount  Due   € 212.48\nMPRN 10012345678",
    );
    expect(values(result.fields)).toMatchObject({
      supplier: "Electric Ireland",
      document_date: "2026-10-03",
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      total_cents: 21248,
    });
  });
});

describe("privacy", () => {
  it("no snippet or value ever holds a full account or meter number", () => {
    const secrets = [
      "912344821",
      "9 1234 4821",
      "10012345678",
      "10 012 345 678",
      "87654302",
      "8 765 4302",
      "10098765432",
      "55520071",
      "10304958112",
      "10 304 958 112",
      "300177665",
      "3001 7766 55",
      "1234567",
      "70044120",
      "10555666777",
      "10 555 666 777",
      "7654321",
      "23456789",
      "2345 6789",
      "01234567",
    ];
    for (const file of readdirSync(FIXTURES).filter((f) =>
      f.endsWith(".txt"),
    )) {
      const result = parseDocumentText(fixture(file));
      const serialised = JSON.stringify(result);
      for (const secret of secrets) {
        expect(serialised, `${file} leaks ${secret}`).not.toContain(secret);
      }
    }
  });

  it("every fixture yields a total", () => {
    for (const file of readdirSync(FIXTURES).filter((f) =>
      f.endsWith(".txt"),
    )) {
      const result = parseDocumentText(fixture(file));
      expect(result.fields.total_cents?.value, file).toEqual(
        expect.any(Number),
      );
    }
  });
});
