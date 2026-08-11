import { getDatabase } from "@/lib/db";
import {
  financialContextWhere,
  type FinancialContextFilter,
} from "@/modules/financial-contexts/application/financial-contexts";
import { startOfInvoiceMonth } from "@/modules/credit-cards/domain/credit-card-schedule";
import { money, sumMoney } from "@/modules/shared/domain/money";

export async function getCreditCardOverview(
  workspaceId: string,
  scope: FinancialContextFilter,
  referenceDate = new Date(),
) {
  const database = getDatabase();
  const currentInvoiceMonth = startOfInvoiceMonth(referenceDate);
  const cards = await database.creditCard.findMany({
    where: { workspaceId, ...financialContextWhere(scope) },
    include: {
      invoices: {
        where: { status: { not: "CANCELED" } },
        include: { installments: { include: { purchase: { include: { category: true } } } } },
        orderBy: { month: "asc" },
      },
      financialContext: { select: { name: true } },
      paymentAccount: { select: { id: true, name: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const unpaidInvoices = cards.flatMap(({ invoices }) =>
    invoices.filter(({ status }) => status !== "PAID"),
  );
  const totalOutstanding = sumMoney(
    unpaidInvoices.map((invoice) => money(invoice.amount).minus(invoice.paidAmount)),
  );
  const totalLimit = sumMoney(cards.map((card) => card.limit));
  const totalAvailableLimit = money(totalLimit.minus(totalOutstanding));
  return {
    cards: cards.map((card) => {
      const invoice = card.invoices.find(({ month }) => month.getTime() === currentInvoiceMonth.getTime()) ?? null;
      const invoiceAmount = invoice?.amount ?? money(0);
      const limit = money(card.limit);
      const outstandingAmount = sumMoney(
        card.invoices
          .filter(({ status }) => status !== "PAID")
          .map((currentInvoice) => money(currentInvoice.amount).minus(currentInvoice.paidAmount)),
      );
      const availableLimit = money(limit.minus(outstandingAmount));
      const usagePercent = limit.isPositive()
        ? Math.min(outstandingAmount.div(limit).mul(100).toNumber(), 100)
        : 0;
      const installments = invoice?.installments ?? [];

      return {
        ...card,
        currentInvoice: invoice,
        invoiceAmount,
        invoiceInstallments: installments,
        availableLimit: availableLimit.isNegative() ? money(0) : availableLimit,
        outstandingAmount,
        usagePercent,
      };
    }),
    currentInvoiceMonth,
    totalAvailableLimit: totalAvailableLimit.isNegative() ? money(0) : totalAvailableLimit,
    totalCurrentInvoice: sumMoney(cards.map((card) => card.invoices.find(({ month }) => month.getTime() === currentInvoiceMonth.getTime())?.amount ?? 0)),
    totalLimit,
    totalOutstanding,
  };
}
