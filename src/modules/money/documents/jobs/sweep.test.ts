import { describe, expect, it } from "vitest";
import { decideStuck, STUCK_AFTER_MS } from "./sweep";
import { readyToReviewNotification } from "../notifications";

describe("decideStuck", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  const old = new Date(now.getTime() - STUCK_AFTER_MS - 1);
  const recent = new Date(now.getTime() - 60_000);

  it("leaves uploads in progress alone", () => {
    expect(decideStuck(recent, now, false)).toBe("wait");
    expect(decideStuck(recent, now, true)).toBe("wait");
  });

  it("sends stalled uploads with a file to review", () => {
    expect(decideStuck(old, now, true)).toBe("release");
  });

  it("removes records whose file never arrived", () => {
    expect(decideStuck(old, now, false)).toBe("remove");
  });
});

describe("readyToReviewNotification", () => {
  const base = {
    id: "doc-1",
    householdId: "h-1",
    supplier: "Electric Ireland",
    documentType: "electricity_bill",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    documentDate: "2026-10-03",
    originalFilename: "bill.pdf",
  };

  it("names the supplier and period, links to the review, dedupes by document", () => {
    expect(readyToReviewNotification(base)).toMatchObject({
      title: "Bill ready to review: Electric Ireland Sep 2026",
      actionUrl: "/money/bills/doc-1",
      dedupeKey: "document-ready:doc-1",
    });
  });

  it("receipts and unread files", () => {
    expect(
      readyToReviewNotification({
        ...base,
        supplier: "Tesco",
        documentType: "receipt",
        periodStart: null,
        periodEnd: null,
        documentDate: "2026-10-14",
      }).title,
    ).toBe("Receipt ready to review: Tesco 14 Oct 2026");
    expect(
      readyToReviewNotification({
        ...base,
        supplier: null,
        documentType: null,
        periodStart: null,
        periodEnd: null,
        documentDate: null,
      }).title,
    ).toBe("Bill ready to review: bill.pdf");
  });
});
