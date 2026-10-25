import { describe, expect, it } from "vitest";
import { drawLocal, drawSchedule } from "./draw-time";

describe("draw calendar timezone conversion", () => {
  it("uses British Summer Time for London summer draws", () => {
    expect(drawSchedule("2026-07-01", "19:30", "Europe/London", 30)).toEqual({ scheduled_at: "2026-07-01T18:30:00Z", publication_cutoff_at: "2026-07-01T18:00:00Z" });
  });
  it("uses GMT for London winter draws", () => {
    expect(drawSchedule("2026-12-01", "19:30", "Europe/London", 0).scheduled_at).toBe("2026-12-01T19:30:00Z");
  });
  it("rejects missing and repeated London clock-change times", () => {
    expect(() => drawSchedule("2026-03-29", "01:30", "Europe/London", 30)).toThrow();
    expect(() => drawSchedule("2026-10-25", "01:30", "Europe/London", 30)).toThrow();
  });
  it("restores a saved draw to the game timezone", () => {
    expect(drawLocal("2026-07-01T18:30:00Z", "Europe/London")).toEqual({ date: "2026-07-01", time: "19:30" });
  });
  it("rejects negative and fractional cutoff minutes", () => {
    expect(() => drawSchedule("2026-07-01", "19:30", "Europe/London", -1)).toThrow();
    expect(() => drawSchedule("2026-07-01", "19:30", "Europe/London", 0.5)).toThrow();
  });
});