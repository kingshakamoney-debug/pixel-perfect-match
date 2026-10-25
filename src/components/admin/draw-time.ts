import { Temporal } from "@js-temporal/polyfill";

export function drawSchedule(date: string, time: string, timezone: string, cutoffMinutes: number) {
  if (!Number.isInteger(cutoffMinutes) || cutoffMinutes < 0) throw new Error("Enter a whole number of cutoff minutes, zero or greater");
  if (!date || !time) throw new Error("Select a draw date and time");
  let at: Temporal.ZonedDateTime;
  try {
    at = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timezone, { disambiguation: "reject" });
  } catch { throw new Error("That time is invalid or ambiguous in this timezone. Choose another time."); }
  return { scheduled_at: at.toInstant().toString(), publication_cutoff_at: at.subtract({ minutes: cutoffMinutes }).toInstant().toString() };
}

export function drawLocal(iso: string, timezone: string) {
  const value = Temporal.Instant.from(iso).toZonedDateTimeISO(timezone);
  return { date: value.toPlainDate().toString(), time: value.toPlainTime().toString().slice(0, 5) };
}