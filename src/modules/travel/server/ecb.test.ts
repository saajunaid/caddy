import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEcbXml } from "./ecb";

const fixture = readFileSync(
  path.resolve(process.cwd(), "tests/fixtures/ecb/eurofxref-daily.xml"),
  "utf8",
);

describe("ECB reference rates parser", () => {
  it("reads the date and every rate as exact strings", () => {
    const rates = parseEcbXml(fixture);
    expect(rates).toHaveLength(29);
    expect(new Set(rates.map((r) => r.date))).toEqual(new Set(["2026-10-20"]));
    expect(rates.find((r) => r.currency === "TRY")).toEqual({
      date: "2026-10-20",
      currency: "TRY",
      rate: "55.6009",
    });
    expect(rates.find((r) => r.currency === "SEK")?.rate).toBe("11.1230");
    expect(rates.find((r) => r.currency === "JPY")?.rate).toBe("177.34");
  });

  it("reads several days (90-day history format)", () => {
    const xml = `<gesmes:Envelope><Cube>
      <Cube time="2026-10-20"><Cube currency="USD" rate="1.1215"/></Cube>
      <Cube time="2026-10-19"><Cube rate="1.1201" currency="USD"/><Cube currency="GBP" rate="0.84"/></Cube>
    </Cube></gesmes:Envelope>`;
    expect(parseEcbXml(xml)).toEqual([
      { date: "2026-10-20", currency: "USD", rate: "1.1215" },
      { date: "2026-10-19", currency: "USD", rate: "1.1201" },
      { date: "2026-10-19", currency: "GBP", rate: "0.84" },
    ]);
  });

  it("skips malformed entries instead of guessing", () => {
    const xml = `<Cube><Cube time='2026-10-20'>
      <Cube currency='usd' rate='1.1'/>
      <Cube currency='GBP' rate='-1'/>
      <Cube currency='JPY' rate='1e2'/>
      <Cube currency='CHF' rate='0'/>
      <Cube currency='EUR' rate='1'/>
      <Cube currency='SEK' rate='11.1230'/>
    </Cube></Cube>`;
    expect(parseEcbXml(xml)).toEqual([
      { date: "2026-10-20", currency: "SEK", rate: "11.1230" },
    ]);
  });

  it("finds nothing in a page that isn't the rates file", () => {
    expect(parseEcbXml("<html><body>Maintenance</body></html>")).toEqual([]);
    expect(parseEcbXml("")).toEqual([]);
  });
});
