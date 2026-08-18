import type { Prisma } from "@/generated/prisma/client";
import { appendAudit, type AuditContext } from "@/modules/finance/application/finance-lifecycle";
import { money, sumMoney } from "@/modules/shared/domain/money";

export async function assertDebtIntegrity(transaction: Prisma.TransactionClient, workspaceId: string, debtId: string) {
  const debt = await transaction.debt.findFirstOrThrow({
    where: { id: debtId, workspaceId },
    include: { installments: { include: { shares: true } } },
  });

  if (!sumMoney(debt.installments.map(({ amount }) => amount)).equals(debt.totalAmount)) {
    throw new Error("A soma das parcelas deve ser igual ao valor total da divida.");
  }
  for (const installment of debt.installments) {
    if (installment.shares.length > 0 && !sumMoney(installment.shares.map(({ amount }) => amount)).equals(installment.amount)) {
      throw new Error("A soma das responsabilidades deve ser igual ao valor da parcela.");
    }
  }
}

export async function assertDebtStructureMutable(transaction: Prisma.TransactionClient, workspaceId: string, debtId: string) {
  const paymentCount = await transaction.transaction.count({
    where: { debtInstallment: { debtId }, workspaceId },
  });

  if (paymentCount > 0) {
    throw new Error("A estrutura de uma divida com pagamentos nao pode ser alterada. Edite apenas os metadados, cancele parcelas futuras ou refinancie.");
  }
}

export async function payDebtInstallment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { accountId: string; amount: ReturnType<typeof money>; installmentId: string; notes: string | null; paidAt: Date },
) {
  const installment = await transaction.debtInstallment.findFirstOrThrow({
    where: { id: input.installmentId, workspaceId: context.workspaceId },
    include: { debt: true },
  });

  if (installment.status === "CANCELED") {
    throw new Error("Parcela cancelada nao pode ser paga.");
  }
  if (!input.amount.equals(installment.amount)) {
    throw new Error("Pagamento parcial de parcela ainda nao suportado.");
  }
  await assertDebtIntegrity(transaction, context.workspaceId, installment.debtId);
  const account = await transaction.financialAccount.findFirst({
    where: { active: true, id: input.accountId, personEditorId: installment.personEditorId, workspaceId: context.workspaceId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Conta invalida para a pessoa selecionada.");
  }
  if (installment.debt.categoryId) {
    const category = await transaction.category.findFirst({
      where: { active: true, id: installment.debt.categoryId, kind: "EXPENSE", workspaceId: context.workspaceId },
      select: { id: true },
    });
    if (!category) {
      throw new Error("Categoria invalida para o tipo selecionado.");
    }
  }
  const transactionRecord = await transaction.transaction.upsert({
    where: { debtInstallmentId: installment.id },
    update: {
      accountId: input.accountId,
      affectsBalance: true,
      amount: installment.amount,
      categoryId: installment.debt.categoryId,
      competenceDate: installment.dueDate,
      description: installment.debt.description,
      dueDate: installment.dueDate,
      notes: input.notes,
      personEditorId: installment.personEditorId,
      settledAt: input.paidAt,
      status: "SETTLED",
      updatedByEditorId: context.editorId,
      version: { increment: 1 },
    },
    create: {
      accountId: input.accountId,
      affectsBalance: true,
      amount: installment.amount,
      categoryId: installment.debt.categoryId,
      competenceDate: installment.dueDate,
      createdByEditorId: context.editorId,
      debtInstallmentId: installment.id,
      description: installment.debt.description,
      dueDate: installment.dueDate,
      notes: input.notes,
      personEditorId: installment.personEditorId,
      settledAt: input.paidAt,
      status: "SETTLED",
      type: "EXPENSE",
      workspaceId: context.workspaceId,
    },
  });
  await transaction.debtInstallment.update({ where: { id: installment.id }, data: { paidAt: input.paidAt, status: "PAID" } });
  await transaction.debtInstallmentShare.updateMany({
    where: { installmentId: installment.id, workspaceId: context.workspaceId },
    data: { paidAt: input.paidAt, status: "PAID" },
  });
  await appendAudit(transaction, context, "Transaction", transactionRecord.id, "pay", { debtInstallmentId: installment.id });

  return transactionRecord.id;
}

export async function undoDebtInstallmentPayment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  installmentId: string,
) {
  const installment = await transaction.debtInstallment.findFirstOrThrow({
    where: { id: installmentId, workspaceId: context.workspaceId },
    include: { transaction: true },
  });

  if (installment.transaction) {
    await appendAudit(transaction, context, "Transaction", installment.transaction.id, "delete", {
      before: installment.transaction,
      reason: "debt_payment_reversed",
    });
    await transaction.transaction.delete({ where: { id: installment.transaction.id } });
  }
  await transaction.debtInstallment.update({ where: { id: installment.id }, data: { paidAt: null, status: "PENDING" } });
  await transaction.debtInstallmentShare.updateMany({
    where: { installmentId: installment.id, workspaceId: context.workspaceId },
    data: { paidAt: null, status: "PENDING" },
  });
  await appendAudit(transaction, context, "DebtInstallment", installment.id, "reopen", { reason: "payment_reversed" });
}

export async function cancelDebtFutureInstallments(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  debtId: string,
  cancelFrom: Date,
) {
  await transaction.debt.findFirstOrThrow({ where: { active: true, id: debtId, workspaceId: context.workspaceId } });
  const installments = await transaction.debtInstallment.findMany({
    where: { debtId, dueDate: { gte: cancelFrom }, status: "PENDING", transaction: { is: null }, workspaceId: context.workspaceId },
    select: { id: true },
  });

  if (installments.length === 0) {
    throw new Error("Nenhuma parcela futura pendente pode ser cancelada.");
  }
  const installmentIds = installments.map(({ id }) => id);
  await transaction.debtInstallment.updateMany({
    where: { id: { in: installmentIds }, workspaceId: context.workspaceId },
    data: { paidAt: null, status: "CANCELED" },
  });
  await transaction.debtInstallmentShare.updateMany({
    where: { installmentId: { in: installmentIds }, workspaceId: context.workspaceId },
    data: { paidAt: null, status: "CANCELED" },
  });
  await appendAudit(transaction, context, "Debt", debtId, "cancel_future_installments", { cancelFrom, installmentIds });

  return installmentIds;
}
