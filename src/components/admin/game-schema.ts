import { z } from "zod";

export const gameSchema = z.object({
  provider_id: z.string().uuid("Select a provider"),
  name: z.string().trim().min(1, "Enter a game name"),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens for the game code"),
  timezone: z.string().trim().refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
    catch { return false; }
  }, "Enter a valid timezone, such as Africa/Accra"),
  min_number: z.coerce.number().int(),
  max_number: z.coerce.number().int(),
  numbers_drawn: z.coerce.number().int().positive(),
  numbers_per_combination: z.coerce.number().int().positive(),
  min_match_threshold: z.coerce.number().int().positive(),
}).superRefine((game, ctx) => {
  const range = game.max_number - game.min_number + 1;
  if (game.min_number >= game.max_number) ctx.addIssue({ code: "custom", message: "Maximum number must exceed minimum number", path: ["max_number"] });
  for (const field of ["numbers_drawn", "numbers_per_combination"] as const) {
    if (game[field] > range) ctx.addIssue({ code: "custom", message: "Number count cannot exceed the available number range", path: [field] });
  }
  if (game.min_match_threshold > Math.min(game.numbers_drawn, game.numbers_per_combination)) ctx.addIssue({ code: "custom", message: "Success threshold cannot exceed either number count", path: ["min_match_threshold"] });
});

export const gameCode = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");