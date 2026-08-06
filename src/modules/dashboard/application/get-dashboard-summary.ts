import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  buildBudgetComparison,
  buildExpenseDistribution,
  buildMonthlyEvolution,
  calculateProjectedBalance,
  createTrailingMonthBuckets,
} from "@/modules/dashboard/domain/dashboard-analytics";
import { getFixedExpenseOverview } from "@/modules/fixed-expenses/application/get-fixed-expense-overview";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

export async function getDashboardSummary(workspaceId: string) {
  const database = getDatabase();
  const monthBuckets = createTrailingMonthBuckets(6);
  const firstMonth = monthBuckets[0]!;
  const currentMonth = monthBuckets[monthBuckets.length - 1]!;
  const [{ accounts, totalBalance }, transactions, recentTransactions, budgets, fixedExpenses, salaries] = await Promise.all([
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
    getFixedExpenseOverview(workspaceId),
    getSalaryOverview(workspaceId),
  ]);
  const periodTransactions = transactions.filter(
    ({ competenceDate }) =>
      competenceDate >= currentMonth.start && competenceDate < currentMonth.end,
  );

  const periodResult = calculatePeriodResult(periodTransactions);
  const pendingTransactionIncome = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "INCOME")
      .map(({ amount }) => amount),
  );
  const pendingIncome = money(pendingTransactionIncome.plus(salaries.pending));
  const pendingTransactionExpense = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "EXPENSE")
      .map(({ amount }) => amount),
  );
  const pendingExpense = money(pendingTransactionExpense.plus(fixedExpenses.pending));

  return {
    accounts,
    budgetComparison: buildBudgetComparison(budgets, periodTransactions),
    expenseByCategory: buildExpenseDistribution(periodTransactions),
    fixedExpenses,
    monthlyEvolution: buildMonthlyEvolution(transactions, monthBuckets),
    pendingExpense,
    pendingIncome,
    periodResult,
    projectedBalance: calculateProjectedBalance(totalBalance, pendingIncome, pendingExpense),
    recentTransactions,
    salaries,
    totalBalance,
  };
}
