import { describe, expect, it } from "vitest";
import { resolveMimeType, safeFileName, storagePathFor } from "./storage";

describe("safeFileName", () => {
  it("keeps letters, digits and the extension", () => {
    expect(safeFileName("Bill – Sept 2026 (1).PDF")).toBe(
      "Bill-Sept-2026-1.pdf",
    );
    expect(safeFileName("Bord Gáis.pdf")).toBe("Bord-Gais.pdf");
    expect(safeFileName("IMG_0001.HEIC")).toBe("IMG_0001.heic");
  });

  it("strips folders and dangerous characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\me\\bill.pdf")).toBe("bill.pdf");
    expect(safeFileName("<script>.pdf")).toBe("script.pdf");
  });

  it("never returns an empty name", () => {
    expect(safeFileName("....pdf")).toBe("document.pdf");
    expect(safeFileName("")).toBe("document");
  });

  it("matches the storage path rule in the database", () => {
    const path = storagePathFor(
      "8e7f2a8e-1111-4c3b-9a1e-1234567890ab",
      "0f0e0d0c-2222-4b3a-8c1d-abcdefabcdef",
      "x".repeat(300) + ".pdf",
    );
    expect(path).toMatch(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/,
    );
  });
});

describe("resolveMimeType", () => {
  it("trusts allowed browser types", () => {
    expect(resolveMimeType("a.pdf", "application/pdf")).toBe("application/pdf");
    expect(resolveMimeType("a.jpg", "image/jpg")).toBe("image/jpeg");
  });

  it("falls back to the extension (iPhone HEIC often has no type)", () => {
    expect(resolveMimeType("IMG_1.HEIC", "")).toBe("image/heic");
  });

  it("rejects anything else", () => {
    expect(resolveMimeType("a.html", "text/html")).toBeNull();
    expect(resolveMimeType("a.exe", "")).toBeNull();
    expect(resolveMimeType("noext", "")).toBeNull();
  });
});
