import { describe, expect, it } from "vitest";
import { addCalendarMonths, isReminderDue, reminderKey, subscriptionPeriod } from "./subscription";

const now = new Date("2026-10-24T09:00:00Z");

describe("subscriptionPeriod", () => {
  it("starts a new subscription at approval time", () => {
    const { start, end } = subscriptionPeriod(now, null, 1);
    expect(start.toISOString()).toBe(now.toISOString());
    expect(end.toISOString()).toBe("2026-11-24T09:00:00.000Z");
  });

  it("starts an expired subscription at approval time", () => {
    const expired = new Date("2026-09-01T00:00:00Z");
    const { start } = subscriptionPeriod(now, expired, 3);
    expect(start.toISOString()).toBe(now.toISOString());
  });

  it("extends an early renewal from the current expiry, never shortening it", () => {
    const expiry = new Date("2026-11-10T00:00:00Z");
    const { start, end } = subscriptionPeriod(now, expiry, 1);
    expect(start.toISOString()).toBe(expiry.toISOString());
    expect(end.toISOString()).toBe("2026-12-10T00:00:00.000Z");
  });
});

describe("addCalendarMonths", () => {
  it("uses calendar months, not 30-day months", () => {
    expect(addCalendarMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addCalendarMonths(new Date("2026-01-15T00:00:00Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });
});

describe("isReminderDue", () => {
  const expiry = new Date("2026-10-31T09:00:00Z");
  it("is due inside the window and not before it", () => {
    expect(isReminderDue(expiry, 7, new Date("2026-10-23T09:00:00Z"))).toBe(false);
    expect(isReminderDue(expiry, 7, new Date("2026-10-24T09:01:00Z"))).toBe(true);
    expect(isReminderDue(expiry, 3, new Date("2026-10-24T09:01:00Z"))).toBe(false);
  });
  it("is not due after expiry", () => {
    expect(isReminderDue(expiry, 0, new Date("2026-11-01T00:00:00Z"))).toBe(false);
  });
});

describe("reminderKey", () => {
  it("is unique per subscription, expiry and interval", () => {
    const a = reminderKey("sub1", "2026-10-31T09:00:00.000Z", 7);
    expect(a).not.toBe(reminderKey("sub1", "2026-10-31T09:00:00.000Z", 3));
    expect(a).not.toBe(reminderKey("sub1", "2026-11-30T09:00:00.000Z", 7));
    expect(a).toBe(reminderKey("sub1", "2026-10-31T09:00:00.000Z", 7));
  });
});
