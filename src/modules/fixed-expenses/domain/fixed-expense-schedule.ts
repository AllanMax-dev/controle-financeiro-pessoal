import { sumMoney, type MoneyInput } from "@/modules/shared/domain/money";
export { calendarDateInTimeZone } from "@/modules/shared/domain/calendar";

export type FixedExpenseMonthInput = {
  amount: MoneyInput;
  payment?: { amount: MoneyInput; status: "PENDING" | "SETTLED" | "CANCELED" } | null;
};

export function monthStart(referenceDate = new Date()): Date {
  return new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );
}

export function monthEnd(start: Date): Date {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

export function fixedExpenseDueDate(month: Date, dueDay: number): Date {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError("O dia de vencimento deve estar entre 1 e 31.");
  }

  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(dueDay, lastDay)),
  );
}

export type FixedExpenseOccurrence = {
  dueDate: Date;
  month: Date;
};

export function fixedExpenseOccurrencesThrough(
  startMonth: Date,
  dueDay: number,
  referenceDate = new Date(),
): FixedExpenseOccurrence[] {
  const firstMonth = monthStart(startMonth);
  const lastMonth = monthStart(referenceDate);

  if (firstMonth > lastMonth) {
    return [];
  }

  const occurrences: FixedExpenseOccurrence[] = [];
  let cursor = firstMonth;

  while (cursor <= lastMonth) {
    const dueDate = fixedExpenseDueDate(cursor, dueDay);

    if (dueDate <= referenceDate) {
      occurrences.push({ dueDate, month: cursor });
    }

    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return occurrences;
}

export function calculateFixedExpenseTotals(expenses: FixedExpenseMonthInput[]) {
  const paid = expenses.filter(({ payment }) => payment?.status === "SETTLED");
  const pending = expenses.filter(({ payment }) => payment?.status !== "SETTLED");

  return {
    expected: sumMoney(expenses.map(({ amount }) => amount)),
    paid: sumMoney(paid.map(({ payment }) => payment!.amount)),
    paidCount: paid.length,
    pending: sumMoney(pending.map(({ amount }) => amount)),
    pendingCount: pending.length,
  };
}
