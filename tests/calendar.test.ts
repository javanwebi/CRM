import { it, expect } from "vitest";
import { calendarMonth } from "../apps/web/src/components/calendar-grid";
it("handles Gregorian leap February and Persian leap Esfand at the year boundary", () => {
  const february = calendarMonth(new Date(2024, 1, 15), false);
  expect(february.days).toHaveLength(29);
  expect(february.next.getMonth()).toBe(2);
  const esfand = calendarMonth(new Date(2025, 2, 20), true);
  expect(esfand.days).toHaveLength(30);
  expect(esfand.start.getMonth()).toBe(1);
  expect(esfand.next.getDate()).toBe(21);
  expect(esfand.next.getMonth()).toBe(2);
  const farvardin = calendarMonth(esfand.next, true);
  expect(farvardin.days).toHaveLength(31);
  expect(farvardin.start.getTime()).toBe(esfand.next.getTime());
});
