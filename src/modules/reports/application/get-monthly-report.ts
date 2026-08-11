import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import { getCreditCardInstallmentExpenses } from "@/modules/credit-cards/application/get-credit-card-expenses";
import {
  financialContextWhere,
  transferContextWhere,
  type FinancialContextFilter,
} from "@/modules/financial-contexts/application/financial-contexts";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

export function normalizeReportMonth(value?: string, referenceDate = new Date()): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : referenceDate.toISOString().slice(0, 7);
}

export function reportMonthInterval(monthValue?: string, referenceDate = new Date()) {
  const month = normalizeReportMonth(monthValue, referenceDate);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { end, month, start };
}

export async function getMonthlyReport(
  workspaceId: string,
  monthValue?: string,
  referenceDate = new Date(),
  scope?: FinancialContextFilter,
) {
  const { end, month, start } = reportMonthInterval(monthValue, referenceDate);
  const database = getDatabase();
  await synchronizeDueFixedExpenses(workspaceId, referenceDate, scope);
  const [{ accounts, totalBalance }, transactions, creditCardExpenses, transfers] = await Promise.all([
    getAccountBalances(workspaceId, false, scope),
    database.transaction.findMany({
      where: {
        workspaceId,
        ...financialContextWhere(scope),
        competenceDate: { gte: start, lt: end },
        creditCardInvoiceId: null,
      },
      include: { account: true, category: true },
      orderBy: [{ competenceDate: "asc" }, { createdAt: "asc" }],
    }),
    getCreditCardInstallmentExpenses(workspaceId, scope, start, end),
    database.transfer.findMany({
      where: {
        workspaceId,
        transferDate: { gte: start, lt: end },
        ...transferContextWhere(scope),
      },
      include: { destinationAccount: true, sourceAccount: true },
      orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  const analyticTransactions = [...transactions, ...creditCardExpenses];
  const operationalTransactions = analyticTransactions.filter(
    ({ account }) => account?.type !== "INVESTMENT",
  );
  const periodResult = calculatePeriodResult(operationalTransactions);
  const pendingIncome = sumMoney(
    operationalTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "INCOME")
      .map(({ amount }) => amount),
  );
  const pendingExpense = sumMoney(
    operationalTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "EXPENSE")
      .map(({ amount }) => amount),
  );
  const categoryTotals = new Map<
    string,
    { color: string; expense: ReturnType<typeof money>; income: ReturnType<typeof money>; name: string }
  >();

  for (const transaction of operationalTransactions) {
    if (transaction.status !== "SETTLED") {
      continue;
    }

    const key = transaction.categoryId ?? `${transaction.type}-uncategorized`;
    const current = categoryTotals.get(key) ?? {
      color: transaction.category?.color ?? "#9aa59d",
      expense: money(0),
      income: money(0),
      name: transaction.category?.name ?? "Sem categoria",
    };

    if (transaction.type === "INCOME") {
      current.income = money(current.income.plus(transaction.amount));
    } else {
      current.expense = money(current.expense.plus(transaction.amount));
    }

    categoryTotals.set(key, current);
  }

  return {
    accounts,
    categoryTotals: [...categoryTotals.entries()]
      .map(([id, values]) => ({ id, ...values }))
      .sort((first, second) =>
        second.income.plus(second.expense).minus(first.income.plus(first.expense)).toNumber(),
      ),
    month,
    pendingExpense,
    pendingIncome,
    periodResult,
    totalBalance,
    transactions,
    transfers,
  };
}
