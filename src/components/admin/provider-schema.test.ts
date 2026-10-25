import { describe, expect, it } from "vitest";
import { countrySchema, providerSchema } from "./provider-schema";

describe("country and provider setup", () => {
  it("requires a country before creating a provider", () => {
    const provider = { country_id: "", name: "NLA", slug: "nla", timezone: "Africa/Accra" };
    expect(providerSchema.safeParse(provider).success).toBe(false);
    expect(providerSchema.safeParse({ ...provider, country_id: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
  it("normalizes country codes and rejects incomplete countries", () => {
    expect(countrySchema.parse({ name: "Ghana", code: "gh" }).code).toBe("GH");
    expect(countrySchema.safeParse({ name: "", code: "GH" }).success).toBe(false);
  });
});