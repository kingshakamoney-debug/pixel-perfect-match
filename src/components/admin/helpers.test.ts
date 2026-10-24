import { describe, expect, it } from "vitest";
import { parseNumbers, validateCombo } from "./helpers";

const game = { min_number: 1, max_number: 90 };

describe("combination validation", () => {
  it("accepts five distinct numbers within 1–90", () => {
    expect(validateCombo(parseNumbers("1, 22 45 67,90"), game, 5)).toBeNull();
  });
  it("rejects duplicates", () => {
    expect(validateCombo([1, 1, 2, 3, 4], game, 5)).toMatch(/Duplicate/);
  });
  it("rejects out-of-range numbers", () => {
    expect(validateCombo([0, 1, 2, 3, 4], game, 5)).toMatch(/outside/);
    expect(validateCombo([91, 1, 2, 3, 4], game, 5)).toMatch(/outside/);
  });
  it("rejects the wrong count", () => {
    expect(validateCombo([1, 2, 3, 4], game, 5)).toMatch(/exactly 5/);
  });
});
