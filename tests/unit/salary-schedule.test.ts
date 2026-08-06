import { describe, expect, it } from "vitest";

import {
  calculateSalaryTotals,
  createSalarySchedule,
} from "../../src/modules/salaries/domain/salary-schedule";

describe("salary schedule", () => {
  it("schedules a monthly salary on the selected day", () => {
    const schedule = createSalarySchedule({
      amount: "3200.00",
      frequency: "MONTHLY",
      month: new Date("2026-08-01T00:00:00.000Z"),
      paymentDay: 5,
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.amount.toFixed(2)).toBe("3200.00");
    expect(schedule[0]!.dueDate.toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("splits a fortnightly salary between days 15 and 30 without losing cents", () => {
    const schedule = createSalarySchedule({
      amount: "1500.01",
      frequency: "FORTNIGHTLY",
      month: new Date("2028-02-01T00:00:00.000Z"),
      paymentDay: null,
    });

    expect(schedule.map(({ amount }) => amount.toFixed(2))).toEqual(["750.01", "750.00"]);
    expect(schedule.map(({ dueDate }) => dueDate.toISOString())).toEqual([
      "2028-02-15T00:00:00.000Z",
      "2028-02-29T00:00:00.000Z",
    ]);
  });

  it("separates received and pending salary values", () => {
    const totals = calculateSalaryTotals([
      { amount: "1000.00", payment: { amount: "980.00", status: "SETTLED" } },
      { amount: "1000.00", payment: null },
    ]);

    expect(totals.expected.toFixed(2)).toBe("2000.00");
    expect(totals.received.toFixed(2)).toBe("980.00");
    expect(totals.pending.toFixed(2)).toBe("1000.00");
  });
});
