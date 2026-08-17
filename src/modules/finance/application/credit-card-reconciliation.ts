import type { Prisma } from "@/generated/prisma/client";
import { money, sumMoney } from "@/modules/shared/domain/money";

type PaymentEvidence = {
  accountId: string;
  paidAt: Date;
};

export function assertCreditCardConfigurationChange(
  current: { closingDay: number; dueDay: number; personEditorId: string },
  next: { closingDay: number; dueDay: number; personEditorId: string },
  hasHistory: boolean,
) {
  if (hasHistory && current.personEditorId !== next.personEditorId) {
    throw new Error("O titular do cartao nao pode ser alterado depois que existem compras, faturas ou pagamentos.");
  }
  if (hasHistory && (current.closingDay !== next.closingDay || current.dueDay !== next.dueDay)) {
    throw new Error("Os dias de fechamento e vencimento nao podem ser alterados depois que existem faturas.");
  }
}

export async function assertCreditCardPurchaseHasNoPayments(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  installmentIds: string[],
  invoiceIds: string[],
) {
  const paymentCount = await transaction.creditCardInvoicePayment.count({
    where: {
      OR: [{ creditCardInstallmentId: { in: installmentIds } }, { invoiceId: { in: invoiceIds } }],
      workspaceId,
    },
  });

  if (paymentCount > 0) {
    throw new Error("Nao e possivel alterar, excluir ou cancelar uma compra com pagamentos. Exclua ou ajuste os pagamentos antes.");
  }
}

export async function reconcileCreditCardInvoice(transaction: Prisma.TransactionClient, invoiceId: string) {
  const invoice = await transaction.creditCardInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      installments: {
        include: { invoicePayment: true, shares: true, transaction: true },
        orderBy: [{ dueMonth: "asc" }, { number: "asc" }, { id: "asc" }],
      },
      payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] },
    },
  });
  const activeInstallments = invoice.installments.filter(({ status }) => status !== "CANCELED");
  const invoiceAmount = sumMoney(activeInstallments.map(({ amount }) => amount));
  const paidAmount = sumMoney(invoice.payments.map(({ amount }) => amount));

  for (const installment of invoice.installments) {
    if (installment.workspaceId !== invoice.workspaceId || installment.cardId !== invoice.cardId || installment.invoiceId !== invoice.id) {
      throw new Error("Parcela vinculada a uma fatura de outro cartão ou workspace.");
    }
    if (!installment.transaction) {
      throw new Error("Parcela de cartão sem lançamento de competência.");
    }
    if (installment.shares.length > 0 && !sumMoney(installment.shares.map(({ amount }) => amount)).equals(installment.amount)) {
      throw new Error("A soma das responsabilidades deve ser igual ao valor da parcela.");
    }
  }

  for (const payment of invoice.payments) {
    if (payment.workspaceId !== invoice.workspaceId || payment.invoiceId !== invoice.id) {
      throw new Error("Pagamento vinculado a uma fatura de outro workspace.");
    }
    if (!money(payment.amount).greaterThan(0)) {
      throw new Error("Pagamento de fatura deve ser maior que zero.");
    }
    if (payment.creditCardInstallmentId) {
      const installment = invoice.installments.find(({ id }) => id === payment.creditCardInstallmentId);

      if (!installment || installment.status === "CANCELED" || !money(payment.amount).equals(installment.amount)) {
        throw new Error("Pagamento de parcela não corresponde exatamente a uma parcela ativa desta fatura.");
      }
    }
  }

  if (paidAmount.greaterThan(invoiceAmount)) {
    throw new Error("Pagamentos excedem o valor ativo da fatura.");
  }

  const directPayments = new Map<string, (typeof invoice.payments)[number]>();
  for (const payment of invoice.payments) {
    if (payment.creditCardInstallmentId) {
      directPayments.set(payment.creditCardInstallmentId, payment);
    }
  }
  const generalPayments = invoice.payments.filter(({ creditCardInstallmentId }) => !creditCardInstallmentId);
  let generalThreshold = money(0);

  const evidenceForGeneralThreshold = (threshold: ReturnType<typeof money>): PaymentEvidence | null => {
    let accumulated = money(0);

    for (const payment of generalPayments) {
      accumulated = money(accumulated.plus(payment.amount));
      if (accumulated.greaterThanOrEqualTo(threshold)) {
        return { accountId: payment.accountId, paidAt: payment.paidAt };
      }
    }

    return null;
  };

  for (const installment of invoice.installments) {
    let evidence: PaymentEvidence | null = null;
    let status: "CANCELED" | "OPEN" | "PAID" = "OPEN";

    if (installment.status === "CANCELED") {
      status = "CANCELED";
    } else {
      const directPayment = directPayments.get(installment.id);

      if (directPayment) {
        evidence = { accountId: directPayment.accountId, paidAt: directPayment.paidAt };
      } else {
        generalThreshold = money(generalThreshold.plus(installment.amount));
        evidence = evidenceForGeneralThreshold(generalThreshold);
      }
      status = evidence ? "PAID" : "OPEN";
    }

    await transaction.creditCardInstallment.update({ where: { id: installment.id }, data: { status } });
    await transaction.creditCardInstallmentShare.updateMany({
      where: { installmentId: installment.id },
      data: { status },
    });
    await transaction.transaction.update({
      where: { id: installment.transaction!.id },
      data: status === "PAID"
        ? { accountId: evidence!.accountId, settledAt: evidence!.paidAt, status: "SETTLED" }
        : { accountId: null, settledAt: null, status: status === "CANCELED" ? "CANCELED" : "PENDING" },
    });
  }

  const status = invoiceAmount.greaterThan(0) && paidAmount.equals(invoiceAmount) ? "PAID" : "OPEN";
  await transaction.creditCardInvoice.update({
    where: { id: invoice.id },
    data: { amount: invoiceAmount, paidAmount, status },
  });

  return { amount: invoiceAmount, paidAmount, status };
}

export async function reconcileCreditCardInvoices(transaction: Prisma.TransactionClient, invoiceIds: string[]) {
  for (const invoiceId of [...new Set(invoiceIds)]) {
    await reconcileCreditCardInvoice(transaction, invoiceId);
  }
}
