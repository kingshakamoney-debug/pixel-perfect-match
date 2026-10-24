// Pure subscription period and reminder helpers (mirrored by the
// approve_payment RPC and the renewal-reminders scheduled job).

/** Add calendar months, clamping to the last day of the target month
 *  (e.g. Jan 31 + 1 month = Feb 28/29, not Mar 3). */
export function addCalendarMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** New or expired subscription starts now; an early renewal extends from the
 *  current expiry so the remaining paid period is never shortened. */
export function subscriptionPeriod(now: Date, currentExpiry: Date | null, months: number): { start: Date; end: Date } {
  const start = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  return { start, end: addCalendarMonths(start, months) };
}

/** A reminder is due once now is within `daysBefore` of expiry, and not after expiry. */
export function isReminderDue(expiresAt: Date, daysBefore: number, now: Date): boolean {
  const t = expiresAt.getTime() - daysBefore * 86_400_000;
  return now.getTime() >= t && now.getTime() < expiresAt.getTime();
}

/** Unique per subscription + expiry timestamp + interval, so a reminder for a
 *  given expiry is recorded at most once and a renewed expiry gets fresh keys. */
export const reminderKey = (subscriptionId: string, expiresAt: string, daysBefore: number): string =>
  `${subscriptionId}:${expiresAt}:${daysBefore}`;
