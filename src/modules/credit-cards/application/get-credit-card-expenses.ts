import { getDatabase } from "@/lib/db";
import {
  financialContextWhere,
  type FinancialContextFilter,
} from "@/modules/financial-contexts/application/financial-contexts";

export async function getCreditCardInstallmentExpenses(
  workspaceId: string,
  scope: FinancialContextFilter,
  start: Date,
  end: Date,
) {
  const installments = await getDatabase().creditCardPurchaseInstallment.findMany({
    where: {
      workspaceId,
      ...financialContextWhere(scope),
      dueMonth: { gte: start, lt: end },
      status: "OPEN",
      purchase: { canceledAt: null },
    },
    select: {
      amount: true,
      contextId: true,
      dueMonth: true,
      id: true,
      purchase: {
        select: {
          category: { select: { color: true, id: true, name: true } },
          description: true,
        },
      },
    },
  });

  return installments.map((installment) => ({
    account: null,
    accountId: `credit-card:${installment.id}`,
    amount: installment.amount,
    categoryId: installment.purchase.category?.id ?? null,
    category: installment.purchase.category,
    fixedExpenseId: null,
    competenceDate: installment.dueMonth,
    status: "SETTLED" as const,
    salaryId: null,
    type: "EXPENSE" as const,
  }));
}
