import { describe, expect, it } from "vitest";
import { pageRange, parseArchiveSearch, totalPages, yearBounds } from "./archive";

describe("archive pagination", () => {
  it("page 5 of 50 reaches rows 200-249, beyond the old 200 cap", () => {
    expect(pageRange(5)).toEqual([200, 249]);
  });
  it("counts pages from the exact total", () => {
    expect(totalPages(0)).toBe(1);
    expect(totalPages(201)).toBe(5);
  });
});

describe("archive filters", () => {
  it("invalid or missing filters fall back safely", () => {
    expect(parseArchiveSearch({ year: "abc", page: "-3" })).toEqual({ year: undefined, page: 1 });
    expect(parseArchiveSearch({ year: "1500", page: "2.5" })).toEqual({ year: undefined, page: 1 });
    expect(parseArchiveSearch({ year: "2024", page: "3" })).toEqual({ year: 2024, page: 3 });
  });
  it("year bounds follow the game's timezone", () => {
    expect(yearBounds(2024, "Africa/Lagos")).toEqual({ from: "2023-12-31T23:00:00Z", to: "2024-12-31T23:00:00Z" });
    expect(yearBounds(2024, "Africa/Accra")).toEqual({ from: "2024-01-01T00:00:00Z", to: "2025-01-01T00:00:00Z" });
  });
});
