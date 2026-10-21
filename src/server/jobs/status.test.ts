import { describe, expect, it } from "vitest";
import { decideStart, finalStatus, MAX_ATTEMPTS, STALE_RUN_MS } from "./status";

describe("finalStatus", () => {
  it("fails when the handler threw", () => {
    expect(finalStatus(["ok"], true)).toBe("failed");
  });
  it("fails when every checked source failed, even with zero results", () => {
    expect(finalStatus(["failed"], false)).toBe("failed");
    expect(finalStatus(["failed", "skipped"], false)).toBe("failed");
  });
  it("is partial when some sources failed", () => {
    expect(finalStatus(["ok", "failed"], false)).toBe("partial");
  });
  it("succeeds when all checked sources are ok or nothing needed checking", () => {
    expect(finalStatus(["ok", "skipped"], false)).toBe("succeeded");
    expect(finalStatus([], false)).toBe("succeeded");
  });
});

describe("decideStart", () => {
  const now = new Date("2026-10-21T06:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("starts a first run", () => {
    expect(decideStart(null, now)).toEqual({ action: "start", attempt: 1 });
  });
  it("never repeats a succeeded run", () => {
    expect(
      decideStart(
        { status: "succeeded", attempt: 1, startedAt: ago(1000) },
        now,
      ).action,
    ).toBe("skip");
  });
  it("doesn't overlap a fresh running run", () => {
    expect(
      decideStart(
        { status: "running", attempt: 1, startedAt: ago(60_000) },
        now,
      ).action,
    ).toBe("skip");
  });
  it("retries a stale running run", () => {
    expect(
      decideStart(
        { status: "running", attempt: 1, startedAt: ago(STALE_RUN_MS + 1) },
        now,
      ),
    ).toEqual({ action: "start", attempt: 2 });
  });
  it("retries failed runs up to the limit", () => {
    expect(
      decideStart({ status: "failed", attempt: 1, startedAt: ago(1000) }, now),
    ).toEqual({
      action: "start",
      attempt: 2,
    });
    expect(
      decideStart(
        { status: "failed", attempt: MAX_ATTEMPTS, startedAt: ago(1000) },
        now,
      ).action,
    ).toBe("skip");
  });
});
