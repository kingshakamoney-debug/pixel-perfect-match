import { describe, expect, it } from "vitest";
import { computePerformance, countHits, isSuccess } from "./stats";

describe("forecast scoring rules", () => {
  it("counts distinct matches only", () => {
    expect(countHits([1, 2, 3, 4, 5], [5, 4, 80, 81, 82])).toBe(2);
  });
  it("two matches is a success by default, one is not", () => {
    expect(isSuccess(2)).toBe(true);
    expect(isSuccess(1)).toBe(false);
  });
  it("zero hits is never a success, more hits always are", () => {
    expect(isSuccess(0)).toBe(false);
    expect(isSuccess(3)).toBe(true);
    expect(isSuccess(5)).toBe(true);
  });
  it("no overlap yields zero hits", () => {
    expect(countHits([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBe(0);
  });
  it("respects a configured threshold", () => {
    expect(isSuccess(2, 3)).toBe(false);
  });
  it("draw rate counts a draw once if any combination succeeded", () => {
    const p = computePerformance([
      { draw_id: "a", hit_count: 2, is_success: true },
      { draw_id: "a", hit_count: 0, is_success: false },
      { draw_id: "b", hit_count: 1, is_success: false },
    ]);
    expect(p.comboRate).toBeCloseTo(1 / 3);
    expect(p.drawRate).toBe(0.5);
    expect(p.totalDraws).toBe(2);
  });
});
