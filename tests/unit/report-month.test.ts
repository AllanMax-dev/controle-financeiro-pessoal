import { describe, expect, it } from "vitest";

import {
  normalizeReportMonth,
  reportMonthInterval,
} from "../../src/modules/reports/application/get-monthly-report";

describe("report month", () => {
  it("accepts only real calendar months", () => {
    expect(normalizeReportMonth("2026-08")).toBe("2026-08");
    expect(normalizeReportMonth("2026-13")).toBe(new Date().toISOString().slice(0, 7));
  });

  it("creates an exclusive monthly interval", () => {
    const interval = reportMonthInterval("2026-12");

    expect(interval.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(interval.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
