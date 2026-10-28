import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMorningDew, parseRecord, pad2 } from "./import-morning-dew";

const file = readFileSync("docs/import-examples/goldenchance_morning_dew_2026.txt", "utf8");
const rows = parseMorningDew(file);
const byNum = (n: string) => rows.find((r) => r.drawNumber === n)!;

describe("Morning-dew parser", () => {
  it("parses draw 0671", () => {
    expect(parseRecord("0671: 01/01/2026: 3202891188 | 1013692163", 1)).toMatchObject({
      drawNumber: "0671", date: "2026-01-01", group1: ["32", "02", "89", "11", "88"], group2: ["10", "13", "69", "21", "63"], error: null,
    });
  });
  it("keeps leading zeros in 0674, 0688, 0695", () => {
    expect(byNum("0674").group2[0]).toBe("09");
    expect(byNum("0688").group1[0]).toBe("01");
    expect(byNum("0695").group1[0]).toBe("03");
  });
  it("parses 0712 as the latest date", () => {
    expect(byNum("0712")).toMatchObject({ date: "2026-10-15", group1: ["33", "37", "85", "60", "44"], error: null });
    expect(rows.map((r) => r.date).sort().at(-1)).toBe("2026-10-15");
  });
  it("reads the whole supplied file, ignoring title lines", () => {
    expect(rows.length).toBe(42);
  });
  it("accepts the CSV version", () => {
    expect(parseRecord("0671,01/01/2026,3202891188,1013692163", 1).group2).toEqual(["10", "13", "69", "21", "63"]);
  });
  it("rejects malformed dates and digit lengths", () => {
    expect(parseRecord("0671: 31/02/2026: 3202891188 | 1013692163", 1).error).toMatch(/date/i);
    expect(parseRecord("0671: 2026-01-01: 3202891188 | 1013692163", 1).error).toMatch(/date/i);
    expect(parseRecord("0671: 01/01/2026: 320289118 | 1013692163", 1).error).toMatch(/10 digits/);
    expect(parseRecord("0671: 01/01/2026: 3202891188 | 10136921630", 1).error).toMatch(/10 digits/);
  });
  it("rejects missing separators and groups", () => {
    expect(parseRecord("0671: 01/01/2026: 3202891188 1013692163", 1).error).toMatch(/separator/);
    expect(parseRecord("0671: 01/01/2026: 3202891188 |", 1).error).toMatch(/required/);
    expect(parseRecord("0671: 01/01/2026: 32|02891188 | 1013692163", 1).error).toMatch(/More than one/);
  });
  it("rejects out-of-range numbers instead of correcting them", () => {
    expect(parseRecord("0671: 01/01/2026: 0002891188 | 1013692163", 1).error).toMatch(/outside/);
  });
  it("flags duplicate draws within a paste", () => {
    const r = parseMorningDew("0671: 01/01/2026: 3202891188 | 1013692163\n0671: 08/01/2026: 1602532931 | 2036072632");
    expect(r[1]!.error).toMatch(/Duplicate draw/);
  });
  it("pads stored numbers back to two characters", () => {
    expect(pad2(9)).toBe("09");
  });
});
