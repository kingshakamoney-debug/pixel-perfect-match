import { describe, expect, it } from "vitest";
import { isValidHandle, normalizeHandle } from "./handles";

describe("user handles", () => {
  it("normalizes handles so case cannot create duplicate identities", () => {
    expect(normalizeHandle("  KingshakaMoney  ")).toBe("kingshakamoney");
  });
  it("accepts 3–40 letters, numbers or underscores only", () => {
    expect(isValidHandle("king_123")).toBe(true);
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("a".repeat(40))).toBe(true);
    expect(isValidHandle("a".repeat(41))).toBe(false);
    expect(isValidHandle("King Shaka")).toBe(false);
    expect(isValidHandle("king@example.com")).toBe(false);
  });
});