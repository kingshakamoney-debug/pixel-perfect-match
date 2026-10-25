import { describe, expect, it } from "vitest";
import { gameSchema } from "./game-schema";

const game = { provider_id: "00000000-0000-4000-8000-000000000001", name: "National", slug: "national", timezone: "Africa/Accra", min_number: 1, max_number: 90, numbers_drawn: 5, numbers_per_combination: 5, min_match_threshold: 2 };

describe("game rules", () => {
  it("supports the existing 5/90 game with 2+ matches", () => {
    expect(gameSchema.parse(game).min_match_threshold).toBe(2);
  });
  it("rejects impossible number counts", () => {
    expect(gameSchema.safeParse({ ...game, numbers_drawn: 91 }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, numbers_per_combination: 91 }).success).toBe(false);
  });
  it("rejects a success threshold above the number counts", () => {
    expect(gameSchema.safeParse({ ...game, min_match_threshold: 6 }).success).toBe(false);
  });
  it("rejects reversed ranges and invalid timezones", () => {
    expect(gameSchema.safeParse({ ...game, min_number: 90, max_number: 1 }).success).toBe(false);
    expect(gameSchema.safeParse({ ...game, timezone: "Unknown/Place" }).success).toBe(false);
  });
});