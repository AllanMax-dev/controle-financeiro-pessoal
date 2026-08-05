import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  buildBudgetComparison,
  buildExpenseDistribution,
  buildMonthlyEvolution,
  calculateProjectedBalance,
  createTrailingMonthBuckets,
} from "@/modules/dashboard/domain/dashboard-analytics";
import { sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

export async function getDashboardSummary(workspaceId: string) {
  const database = getDatabase();
  const monthBuckets = createTrailingMonthBuckets(6);
  const firstMonth = monthBuckets[0]!;
  const currentMonth = monthBuckets[monthBuckets.length - 1]!;
  const [{ accounts, totalBalance }, transactions, recentTransactions, budgets] = await Promise.all([
    getAccountBalances(workspaceId),
    database.transaction.findMany({
      where: { workspaceId, competenceDate: { gte: firstMonth.start, lt: currentMonth.end } },
      select: {
        accountId: true,
        amount: true,
        category: { select: { color: true, id: true, name: true } },
        competenceDate: true,
        status: true,
        type: true,
      },
    }),
    database.transaction.findMany({
      where: { workspaceId },
      include: { account: true, category: true },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    database.budget.findMany({
      where: { workspaceId, month: currentMonth.start },
      select: {
        amount: true,
        category: { select: { color: true, id: true, name: true } },
      },
    }),
  ]);
  const periodTransactions = transactions.filter(
    ({ competenceDate }) =>
      competenceDate >= currentMonth.start && competenceDate < currentMonth.end,
  );

  const periodResult = calculatePeriodResult(periodTransactions);
  const pendingIncome = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "INCOME")
      .map(({ amount }) => amount),
  );
  const pendingExpense = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "EXPENSE")
      .map(({ amount }) => amount),
  );

  return {
    accounts,
    budgetComparison: buildBudgetComparison(budgets, periodTransactions),
    expenseByCategory: buildExpenseDistribution(periodTransactions),
    monthlyEvolution: buildMonthlyEvolution(transactions, monthBuckets),
    pendingExpense,
    pendingIncome,
    periodResult,
    projectedBalance: calculateProjectedBalance(totalBalance, pendingIncome, pendingExpense),
    recentTransactions,
    totalBalance,
  };
}
