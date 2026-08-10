import { allocateMoney } from "@/modules/shared/domain/money";

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function clampedUtcDate(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, Math.min(day, daysInUtcMonth(year, monthIndex))));
}

export function startOfInvoiceMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function addInvoiceMonths(value: Date, offset: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1));
}

export function invoiceMonthForPurchase(purchaseDate: Date, closingDay: number) {
  const purchaseDay = purchaseDate.getUTCDate();
  const offset = purchaseDay > closingDay ? 1 : 0;

  return addInvoiceMonths(startOfInvoiceMonth(purchaseDate), offset);
}

export function invoiceDates(invoiceMonth: Date, closingDay: number, dueDay: number) {
  const closesAt = clampedUtcDate(
    invoiceMonth.getUTCFullYear(),
    invoiceMonth.getUTCMonth(),
    closingDay,
  );
  const dueMonthOffset = dueDay <= closingDay ? 1 : 0;
  const dueDate = clampedUtcDate(
    invoiceMonth.getUTCFullYear(),
    invoiceMonth.getUTCMonth() + dueMonthOffset,
    dueDay,
  );

  return { closesAt, dueDate };
}

export function createCreditCardInstallmentPlan(
  totalAmount: string,
  installmentCount: number,
  firstInvoiceMonth: Date,
) {
  return allocateMoney(totalAmount, installmentCount).map((amount, index) => ({
    amount,
    dueMonth: addInvoiceMonths(firstInvoiceMonth, index),
    number: index + 1,
  }));
}
