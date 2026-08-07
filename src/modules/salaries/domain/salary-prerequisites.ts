export type SalaryPrerequisiteState =
  | "ready"
  | "missing-account"
  | "missing-income-category"
  | "missing-account-and-income-category";

export function getSalaryPrerequisiteState({
  activeAccountCount,
  activeIncomeCategoryCount,
}: {
  activeAccountCount: number;
  activeIncomeCategoryCount: number;
}): SalaryPrerequisiteState {
  const hasActiveAccount = activeAccountCount > 0;
  const hasActiveIncomeCategory = activeIncomeCategoryCount > 0;

  if (hasActiveAccount && hasActiveIncomeCategory) {
    return "ready";
  }

  if (!hasActiveAccount && !hasActiveIncomeCategory) {
    return "missing-account-and-income-category";
  }

  return hasActiveAccount ? "missing-income-category" : "missing-account";
}