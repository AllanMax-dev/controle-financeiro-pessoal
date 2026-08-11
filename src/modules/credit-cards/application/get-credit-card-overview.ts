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
        where: { month: currentInvoiceMonth },
        include: { installments: { include: { purchase: { include: { category: true } } } } },
        take: 1,
      },
      financialContext: { select: { name: true } },
      paymentAccount: { select: { id: true, name: true } },
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return {
    cards: cards.map((card) => {
      const invoice = card.invoices[0] ?? null;
      const invoiceAmount = invoice?.amount ?? money(0);
      const limit = money(card.limit);
      const usagePercent = limit.isPositive()
        ? Math.min(invoiceAmount.div(limit).mul(100).toNumber(), 100)
        : 0;
      const installments = invoice?.installments ?? [];

      return {
        ...card,
        currentInvoice: invoice,
        invoiceAmount,
        invoiceInstallments: installments,
        availableLimit: money(limit.minus(invoiceAmount)),
        usagePercent,
      };
    }),
    currentInvoiceMonth,
    totalCurrentInvoice: sumMoney(cards.map((card) => card.invoices[0]?.amount ?? 0)),
    totalLimit: sumMoney(cards.map((card) => card.limit)),
  };
}
