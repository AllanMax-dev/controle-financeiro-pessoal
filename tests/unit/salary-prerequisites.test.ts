import { describe, expect, it } from "vitest";

import { getSalaryPrerequisiteState } from "../../src/modules/salaries/domain/salary-prerequisites";

describe("salary prerequisites", () => {
  it("allows the salary form when an active account and income category exist", () => {
    expect(
      getSalaryPrerequisiteState({
        activeAccountCount: 1,
        activeIncomeCategoryCount: 1,
      }),
    ).toBe("ready");
  });

  it("identifies when only an active account is missing", () => {
    expect(
      getSalaryPrerequisiteState({
        activeAccountCount: 0,
        activeIncomeCategoryCount: 1,
      }),
    ).toBe("missing-account");
  });

  it("identifies when only an active income category is missing", () => {
    expect(
      getSalaryPrerequisiteState({
        activeAccountCount: 1,
        activeIncomeCategoryCount: 0,
      }),
    ).toBe("missing-income-category");
  });

  it("identifies when both prerequisites are missing", () => {
    expect(
      getSalaryPrerequisiteState({
        activeAccountCount: 0,
        activeIncomeCategoryCount: 0,
      }),
    ).toBe("missing-account-and-income-category");
  });
});