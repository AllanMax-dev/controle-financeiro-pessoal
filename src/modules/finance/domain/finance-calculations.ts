import Decimal from "decimal.js";

import { allocateMoney, money, sumMoney } from "@/modules/shared/domain/money";

export type PersonTotalInput = {
  available: Decimal.Value;
  expenses: Decimal.Value;
  income: Decimal.Value;
  investments: Decimal.Value;
  paid: Decimal.Value;
  pending: Decimal.Value;
  receivable?: Decimal.Value;
};

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new TypeError("Mês inválido.");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const end = new Date(Date.UTC(year!, monthNumber!, 1));

  return { end, start };
}

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function dateFromInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError("Data inválida.");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function monthStartFromInput(value: string) {
  return monthBounds(value).start;
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

export function addDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

export function clampDayInMonth(month: Date, day: number) {
  const year = month.getUTCFullYear();
  const monthNumber = month.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, monthNumber + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, monthNumber, Math.min(Math.max(day, 1), lastDay)));
}

export function installmentDueDate(firstDueDate: Date, index: number, frequency: "MONTHLY" | "FORTNIGHTLY") {
  return frequency === "FORTNIGHTLY" ? addDays(firstDueDate, index * 14) : addMonths(firstDueDate, index);
}

export function fixedExpenseDueDate(monthStart: Date, dueDay: number) {
  return clampDayInMonth(monthStart, dueDay);
}

export function salaryOccurrenceDates(monthStart: Date, paymentDay: number, frequency: "MONTHLY" | "FORTNIGHTLY") {
  const firstPayment = clampDayInMonth(monthStart, paymentDay);

  if (frequency === "MONTHLY") {
    return [firstPayment];
  }

  const secondPayment = clampDayInMonth(monthStart, 31);

  return firstPayment.getTime() === secondPayment.getTime()
    ? [firstPayment]
    : [firstPayment, secondPayment].sort((left, right) => left.getTime() - right.getTime());
}

export function buildSalaryOccurrencePlan(total: Decimal.Value, frequency: "MONTHLY" | "FORTNIGHTLY", monthStart: Date, paymentDay: number) {
  const dueDates = salaryOccurrenceDates(monthStart, paymentDay, frequency);
  const amounts = allocateMoney(total, dueDates.length);

  return dueDates.map((dueDate, index) => ({
    amount: amounts[index]!,
    dueDate,
    installmentNumber: index + 1,
  }));
}

export function resolveInvoiceMonth(purchaseDate: Date, closingDay: number) {
  const purchaseMonth = new Date(Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), 1));
  const closingDate = clampDayInMonth(purchaseMonth, closingDay);

  return purchaseDate.getTime() <= closingDate.getTime() ? purchaseMonth : addMonths(purchaseMonth, 1);
}

export function buildInstallmentPlan(total: Decimal.Value, count: number) {
  return allocateMoney(total, count).map((amount, index) => ({
    amount,
    number: index + 1,
  }));
}

export function buildPersonTotal(input: PersonTotalInput) {
  const available = money(input.available);
  const expenses = money(input.expenses);
  const income = money(input.income);
  const investments = money(input.investments);
  const paid = money(input.paid);
  const pending = money(input.pending);
  const receivable = money(input.receivable ?? 0);

  return {
    available,
    expenses,
    income,
    investments,
    net: money(income.minus(expenses)),
    paid,
    pending,
    receivable,
    wealth: money(available.plus(investments)),
  };
}

export function sumPersonTotals(values: PersonTotalInput[]) {
  return buildPersonTotal({
    available: sumMoney(values.map(({ available }) => available)),
    expenses: sumMoney(values.map(({ expenses }) => expenses)),
    income: sumMoney(values.map(({ income }) => income)),
    investments: sumMoney(values.map(({ investments }) => investments)),
    paid: sumMoney(values.map(({ paid }) => paid)),
    pending: sumMoney(values.map(({ pending }) => pending)),
    receivable: sumMoney(values.map(({ receivable }) => receivable ?? 0)),
  });
}
