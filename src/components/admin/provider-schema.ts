import { z } from "zod";

export const countrySchema = z.object({
  name: z.string().trim().min(1, "Enter a country name"),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Enter a two-letter country code"),
});

export const providerSchema = z.object({
  country_id: z.string().uuid("Select a country"),
  name: z.string().trim().min(1, "Enter a provider name"),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens for the provider code"),
  timezone: z.string().trim().refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Enter a valid timezone"),
});