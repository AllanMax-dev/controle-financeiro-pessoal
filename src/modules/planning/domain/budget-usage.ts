import Decimal from "decimal.js";

import { money, type MoneyInput } from "@/modules/shared/domain/money";

export type BudgetUsageStatus = "empty" | "on-track" | "over" | "unplanned" | "warning";

export function calculateBudgetUsage(plannedInput: MoneyInput, realizedInput: MoneyInput) {
  const planned = money(plannedInput);
  const realized = money(realizedInput);
  const remaining = money(planned.minus(realized));
  const hasLimit = planned.greaterThan(0);
  const percentage = hasLimit ? realized.dividedBy(planned).times(100) : null;
  const progress = percentage
    ? Decimal.min(Decimal.max(percentage, 0), 100).toNumber()
    : realized.greaterThan(0)
      ? 100
      : 0;
  const status: BudgetUsageStatus = !hasLimit
    ? realized.greaterThan(0)
      ? "unplanned"
      : "empty"
    : remaining.isNegative()
      ? "over"
      : percentage!.greaterThanOrEqualTo(80)
        ? "warning"
        : "on-track";

  return {
    hasLimit,
    percentage,
    planned,
    progress,
    realized,
    remaining,
    status,
  };
}

export function budgetUsageLabel(status: BudgetUsageStatus): string {
  switch (status) {
    case "empty":
      return "Não configurado";
    case "on-track":
      return "Dentro do limite";
    case "over":
      return "Limite excedido";
    case "unplanned":
      return "Gasto sem limite";
    case "warning":
      return "Próximo do limite";
  }
}
