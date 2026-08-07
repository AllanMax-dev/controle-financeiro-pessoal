import Decimal from "decimal.js";

import { money, sumMoney, type MoneyInput } from "@/modules/shared/domain/money";

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC",
});

export type DashboardTransactionInput = {
  account?: { type: string } | null;
  amount: MoneyInput;
  category: { color: string | null; id: string; name: string } | null;
  competenceDate: Date;
  status: "PENDING" | "SETTLED" | "CANCELED";
  type: "INCOME" | "EXPENSE";
};

function isOperationalTransaction(transaction: DashboardTransactionInput): boolean {
  return transaction.account?.type !== "INVESTMENT";
}

export type DashboardBudgetInput = {
  amount: MoneyInput;
  category: { color: string | null; id: string; name: string };
};

export type MonthBucket = {
  end: Date;
  key: string;
  label: string;
  start: Date;
};

export function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: Date): string {
  const label = MONTH_FORMATTER.format(value).replace(".", "");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function createTrailingMonthBuckets(monthCount: number, referenceDate = new Date()): MonthBucket[] {
  if (!Number.isInteger(monthCount) || monthCount <= 0) {
    throw new RangeError("A quantidade de meses deve ser um inteiro positivo.");
  }

  const currentStart = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );

  return Array.from({ length: monthCount }, (_, index) => {
    const start = new Date(
      Date.UTC(
        currentStart.getUTCFullYear(),
        currentStart.getUTCMonth() - monthCount + index + 1,
        1,
      ),
    );
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

    return { end, key: monthKey(start), label: monthLabel(start), start };
  });
}

export function buildMonthlyEvolution(
  transactions: DashboardTransactionInput[],
  buckets: MonthBucket[],
) {
  const totals = new Map(
    buckets.map((bucket) => [
      bucket.key,
      { expense: money(0), income: money(0), result: money(0) },
    ]),
  );

  for (const transaction of transactions) {
    if (transaction.status !== "SETTLED" || !isOperationalTransaction(transaction)) {
      continue;
    }

    const current = totals.get(monthKey(transaction.competenceDate));

    if (!current) {
      continue;
    }

    if (transaction.type === "INCOME") {
      current.income = money(current.income.plus(transaction.amount));
    } else {
      current.expense = money(current.expense.plus(transaction.amount));
    }

    current.result = money(current.income.minus(current.expense));
  }

  return buckets.map((bucket) => {
    const current = totals.get(bucket.key) ?? {
      expense: money(0),
      income: money(0),
      result: money(0),
    };

    return {
      expense: current.expense.toNumber(),
      income: current.income.toNumber(),
      key: bucket.key,
      label: bucket.label,
      result: current.result.toNumber(),
    };
  });
}

export function buildExpenseDistribution(transactions: DashboardTransactionInput[]) {
  const expenseByCategory = new Map<
    string,
    { color: string; name: string; value: Decimal }
  >();

  for (const transaction of transactions) {
    if (
      transaction.status !== "SETTLED" ||
      transaction.type !== "EXPENSE" ||
      !isOperationalTransaction(transaction)
    ) {
      continue;
    }

    const key = transaction.category?.id ?? "uncategorized";
    const current = expenseByCategory.get(key) ?? {
      color: transaction.category?.color ?? "#9aa59d",
      name: transaction.category?.name ?? "Sem categoria",
      value: money(0),
    };
    current.value = money(current.value.plus(transaction.amount));
    expenseByCategory.set(key, current);
  }

  return [...expenseByCategory.entries()]
    .map(([id, category]) => ({
      color: category.color,
      id,
      name: category.name,
      value: category.value.toNumber(),
    }))
    .sort((first, second) => second.value - first.value);
}

export function buildBudgetComparison(
  budgets: DashboardBudgetInput[],
  transactions: DashboardTransactionInput[],
) {
  const rows = new Map<
    string,
    { color: string; name: string; planned: Decimal; realized: Decimal }
  >();

  for (const budget of budgets) {
    rows.set(budget.category.id, {
      color: budget.category.color ?? "#256b4b",
      name: budget.category.name,
      planned: money(budget.amount),
      realized: money(0),
    });
  }

  for (const transaction of transactions) {
    if (
      transaction.status !== "SETTLED" ||
      transaction.type !== "EXPENSE" ||
      !isOperationalTransaction(transaction)
    ) {
      continue;
    }

    const key = transaction.category?.id ?? "uncategorized";
    const current = rows.get(key) ?? {
      color: transaction.category?.color ?? "#9aa59d",
      name: transaction.category?.name ?? "Sem categoria",
      planned: money(0),
      realized: money(0),
    };
    current.realized = money(current.realized.plus(transaction.amount));
    rows.set(key, current);
  }

  const categories = [...rows.entries()]
    .map(([id, row]) => ({
      color: row.color,
      id,
      name: row.name,
      planned: row.planned.toNumber(),
      realized: row.realized.toNumber(),
      remaining: money(row.planned.minus(row.realized)).toNumber(),
    }))
    .sort((first, second) => second.planned + second.realized - (first.planned + first.realized));
  const totalPlanned = sumMoney(budgets.map(({ amount }) => amount));
  const totalRealized = sumMoney(
    transactions
      .filter(
        (transaction) =>
          transaction.status === "SETTLED" &&
          transaction.type === "EXPENSE" &&
          isOperationalTransaction(transaction),
      )
      .map(({ amount }) => amount),
  );

  return {
    categories,
    remaining: money(totalPlanned.minus(totalRealized)),
    totalPlanned,
    totalRealized,
  };
}

export function calculateProjectedBalance(
  totalBalance: MoneyInput,
  pendingIncome: MoneyInput,
  pendingExpense: MoneyInput,
): Decimal {
  return money(money(totalBalance).plus(pendingIncome).minus(pendingExpense));
}
