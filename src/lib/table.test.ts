import { describe, expect, it } from "vitest";
import {
  filterOptions,
  filterRows,
  readTableState,
  sortRows,
  writeTableState,
  type TableRowData,
} from "./table";

const rows: TableRowData[] = [
  {
    key: "a",
    sort: { name: "Ard na Sailí", rent: 171400, closes: "2026-10-21" },
    filter: { county: "Co. Cork" },
    search: "Ard na Sailí Carrigtwohill Clúid",
  },
  {
    key: "b",
    sort: { name: "Barrack View", rent: null, closes: null },
    filter: { county: "Co. Limerick" },
    search: "Barrack View Limerick",
  },
  {
    key: "c",
    sort: { name: "apartments 10", rent: 150000, closes: "2026-11-01" },
    filter: { county: "Co. Limerick" },
    search: "Apartments 10 Castletroy",
  },
  {
    key: "d",
    sort: { name: "Apartments 9", rent: 150000, closes: "2026-10-30" },
    filter: { county: null },
    search: "Apartments 9",
  },
];

const keys = (r: TableRowData[]) => r.map((x) => x.key);

describe("sortRows", () => {
  it("sorts text naturally and case-insensitively", () => {
    expect(keys(sortRows(rows, "name", "asc"))).toEqual(["d", "c", "a", "b"]);
  });

  it("keeps unknown values last in both directions", () => {
    expect(keys(sortRows(rows, "rent", "asc"))).toEqual(["c", "d", "a", "b"]);
    expect(keys(sortRows(rows, "rent", "desc"))).toEqual(["a", "c", "d", "b"]);
  });

  it("is stable for ties and leaves order alone with no column", () => {
    expect(keys(sortRows(rows, "rent", "asc")).slice(0, 2)).toEqual(["c", "d"]);
    expect(keys(sortRows(rows, null, "asc"))).toEqual(["a", "b", "c", "d"]);
  });

  it("sorts ISO dates as text", () => {
    expect(keys(sortRows(rows, "closes", "asc"))).toEqual(["a", "d", "c", "b"]);
  });
});

describe("filterRows", () => {
  it("matches every search word, ignoring case", () => {
    expect(keys(filterRows(rows, "limerick", {}))).toEqual(["b"]);
    expect(keys(filterRows(rows, "apartments castletroy", {}))).toEqual(["c"]);
    expect(keys(filterRows(rows, "  ", {}))).toEqual(["a", "b", "c", "d"]);
  });

  it("applies dropdown filters, and ignores empty ones", () => {
    expect(keys(filterRows(rows, "", { county: "Co. Limerick" }))).toEqual([
      "b",
      "c",
    ]);
    expect(keys(filterRows(rows, "", { county: "" }))).toHaveLength(4);
    expect(
      keys(filterRows(rows, "apartments", { county: "Co. Limerick" })),
    ).toEqual(["c"]);
  });
});

describe("filterOptions", () => {
  it("lists distinct non-empty values in order", () => {
    expect(filterOptions(rows, "county")).toEqual(["Co. Cork", "Co. Limerick"]);
    expect(filterOptions([], "county")).toEqual([]);
  });
});

describe("table state in the URL", () => {
  it("round-trips with a prefix and drops defaults", () => {
    const written = writeTableState(new URLSearchParams("tab=history"), "h", {
      sort: "rent",
      dir: "desc",
      q: " cork ",
      filters: { county: "Co. Cork", status: "" },
    });
    expect(written.toString()).toBe(
      "tab=history&h.sort=rent&h.dir=desc&h.q=cork&h.f.county=Co.+Cork",
    );
    expect(readTableState(written, "h", ["rent"], ["county"])).toEqual({
      sort: "rent",
      dir: "desc",
      q: "cork",
      filters: { county: "Co. Cork" },
    });
    const cleared = writeTableState(written, "h", {
      sort: null,
      dir: "desc",
      q: "",
      filters: {},
    });
    expect(cleared.toString()).toBe("tab=history");
  });

  it("ignores unknown sort columns", () => {
    const state = readTableState(
      new URLSearchParams("sort=hack&dir=sideways"),
      "",
      ["rent"],
      [],
    );
    expect(state).toEqual({ sort: null, dir: "asc", q: "", filters: {} });
  });
});
