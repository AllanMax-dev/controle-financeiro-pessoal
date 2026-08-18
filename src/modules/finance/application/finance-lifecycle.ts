import type { Prisma } from "@/generated/prisma/client";

export type LifecycleClient = Prisma.TransactionClient;

export type AuditContext = {
  editorId: string;
  workspaceId: string;
};

type LifecycleResult = "ARCHIVED" | "DELETED" | "RESTORED";

function auditMetadata(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function appendAudit(
  database: LifecycleClient,
  context: AuditContext,
  entityType: string,
  entityId: string | null,
  action: string,
  metadata?: unknown,
) {
  await database.auditLog.create({
    data: {
      action,
      editorId: context.editorId,
      entityId,
      entityType,
      metadata: metadata === undefined ? undefined : auditMetadata(metadata),
      workspaceId: context.workspaceId,
    },
  });
}

export function assertExactlyOne(count: number, message: string) {
  if (count === 0) {
    throw new Error("Registro não encontrado ou já removido.");
  }

  if (count !== 1) {
    throw new Error(message);
  }
}

function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

export async function canHardDeleteAccount(database: LifecycleClient, workspaceId: string, accountId: string) {
  const counts = await Promise.all([
    database.transaction.count({ where: { accountId, workspaceId } }),
    database.transfer.count({ where: { workspaceId, OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }] } }),
    database.balanceAdjustment.count({ where: { accountId, workspaceId } }),
    database.fixedExpense.count({ where: { accountId, workspaceId } }),
    database.salary.count({ where: { accountId, workspaceId } }),
    database.creditCard.count({ where: { paymentAccountId: accountId, workspaceId } }),
    database.creditCardInvoicePayment.count({ where: { accountId, workspaceId } }),
    database.savingsGoal.count({ where: { accountId, workspaceId } }),
    database.savingsGoalMovement.count({ where: { accountId, workspaceId } }),
    database.investment.count({ where: { accountId, workspaceId } }),
  ]);

  return counts.every((count) => count === 0);
}

export async function canHardDeleteCategory(database: LifecycleClient, workspaceId: string, categoryId: string) {
  const counts = await Promise.all([
    database.transaction.count({ where: { categoryId, workspaceId } }),
    database.fixedExpense.count({ where: { categoryId, workspaceId } }),
    database.salary.count({ where: { categoryId, workspaceId } }),
    database.debt.count({ where: { categoryId, workspaceId } }),
    database.creditCardPurchase.count({ where: { categoryId, workspaceId } }),
    database.creditCardInstallment.count({ where: { categoryId, workspaceId } }),
  ]);

  return counts.every((count) => count === 0);
}

export async function archiveOrDeleteAccount(
  database: LifecycleClient,
  context: AuditContext,
  accountId: string,
): Promise<LifecycleResult> {
  const account = await database.financialAccount.findFirstOrThrow({
    where: { id: accountId, workspaceId: context.workspaceId },
  });

  if (await canHardDeleteAccount(database, context.workspaceId, accountId)) {
    await appendAudit(database, context, "FinancialAccount", accountId, "delete", { before: account, reason: "unused" });
    const { count } = await database.financialAccount.deleteMany({ where: { id: accountId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Conta não encontrada.");
    return "DELETED";
  }

  const { count } = await database.financialAccount.updateMany({
    where: { active: true, id: accountId, workspaceId: context.workspaceId },
    data: { active: false, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Conta não encontrada ou já arquivada.");
  await appendAudit(database, context, "FinancialAccount", accountId, "archive", { before: account, reason: "has_history" });
  return "ARCHIVED";
}

export async function restoreAccount(database: LifecycleClient, context: AuditContext, accountId: string): Promise<LifecycleResult> {
  const account = await database.financialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: context.workspaceId } });
  const { count } = await database.financialAccount.updateMany({
    where: { active: false, id: accountId, workspaceId: context.workspaceId },
    data: { active: true, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Conta não encontrada ou já ativa.");
  await appendAudit(database, context, "FinancialAccount", accountId, "restore", { before: account });
  return "RESTORED";
}

export async function archiveOrDeleteCategory(
  database: LifecycleClient,
  context: AuditContext,
  categoryId: string,
): Promise<LifecycleResult> {
  const category = await database.category.findFirstOrThrow({ where: { id: categoryId, workspaceId: context.workspaceId } });

  if (await canHardDeleteCategory(database, context.workspaceId, categoryId)) {
    await appendAudit(database, context, "Category", categoryId, "delete", { before: category, reason: "unused" });
    const { count } = await database.category.deleteMany({ where: { id: categoryId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Categoria não encontrada.");
    return "DELETED";
  }

  const { count } = await database.category.updateMany({
    where: { active: true, id: categoryId, workspaceId: context.workspaceId },
    data: { active: false },
  });
  assertExactlyOne(count, "Categoria não encontrada ou já arquivada.");
  await appendAudit(database, context, "Category", categoryId, "archive", { before: category, reason: "has_history" });
  return "ARCHIVED";
}

export async function restoreCategory(database: LifecycleClient, context: AuditContext, categoryId: string): Promise<LifecycleResult> {
  const category = await database.category.findFirstOrThrow({ where: { id: categoryId, workspaceId: context.workspaceId } });
  const { count } = await database.category.updateMany({
    where: { active: false, id: categoryId, workspaceId: context.workspaceId },
    data: { active: true },
  });
  assertExactlyOne(count, "Categoria não encontrada ou já ativa.");
  await appendAudit(database, context, "Category", categoryId, "restore", { before: category });
  return "RESTORED";
}

export async function archiveOrDeleteFixedExpense(
  database: LifecycleClient,
  context: AuditContext,
  fixedExpenseId: string,
  effectiveAt = new Date(),
): Promise<LifecycleResult> {
  const fixedExpense = await database.fixedExpense.findFirstOrThrow({ where: { id: fixedExpenseId, workspaceId: context.workspaceId } });
  const transactionCount = await database.transaction.count({ where: { fixedExpenseId, workspaceId: context.workspaceId } });

  if (transactionCount === 0) {
    await appendAudit(database, context, "FixedExpense", fixedExpenseId, "delete", { before: fixedExpense, reason: "unused" });
    const { count } = await database.fixedExpense.deleteMany({ where: { id: fixedExpenseId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Gasto fixo não encontrado.");
    return "DELETED";
  }

  const { count } = await database.fixedExpense.updateMany({
    where: { active: true, id: fixedExpenseId, workspaceId: context.workspaceId },
    data: { active: false, endedAt: monthEnd(effectiveAt), updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Gasto fixo não encontrado ou já encerrado.");
  await appendAudit(database, context, "FixedExpense", fixedExpenseId, "archive", { before: fixedExpense, reason: "has_history" });
  return "ARCHIVED";
}

export async function restoreFixedExpense(database: LifecycleClient, context: AuditContext, fixedExpenseId: string): Promise<LifecycleResult> {
  const fixedExpense = await database.fixedExpense.findFirstOrThrow({ where: { id: fixedExpenseId, workspaceId: context.workspaceId } });
  const { count } = await database.fixedExpense.updateMany({
    where: { active: false, id: fixedExpenseId, workspaceId: context.workspaceId },
    data: { active: true, endedAt: null, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Gasto fixo não encontrado ou já ativo.");
  await appendAudit(database, context, "FixedExpense", fixedExpenseId, "restore", { before: fixedExpense });
  return "RESTORED";
}

export async function archiveOrDeleteSalary(
  database: LifecycleClient,
  context: AuditContext,
  salaryId: string,
  effectiveAt = new Date(),
): Promise<LifecycleResult> {
  const salary = await database.salary.findFirstOrThrow({ where: { id: salaryId, workspaceId: context.workspaceId } });
  const transactionCount = await database.transaction.count({ where: { salaryId, workspaceId: context.workspaceId } });

  if (transactionCount === 0) {
    await appendAudit(database, context, "Salary", salaryId, "delete", { before: salary, reason: "unused" });
    const { count } = await database.salary.deleteMany({ where: { id: salaryId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Salário não encontrado.");
    return "DELETED";
  }

  const { count } = await database.salary.updateMany({
    where: { active: true, id: salaryId, workspaceId: context.workspaceId },
    data: { active: false, archivedAt: monthEnd(effectiveAt), updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Salário não encontrado ou já encerrado.");
  await appendAudit(database, context, "Salary", salaryId, "archive", { before: salary, reason: "has_history" });
  return "ARCHIVED";
}

export async function restoreSalary(database: LifecycleClient, context: AuditContext, salaryId: string): Promise<LifecycleResult> {
  const salary = await database.salary.findFirstOrThrow({ where: { id: salaryId, workspaceId: context.workspaceId } });
  const { count } = await database.salary.updateMany({
    where: { active: false, id: salaryId, workspaceId: context.workspaceId },
    data: { active: true, archivedAt: null, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Salário não encontrado ou já ativo.");
  await appendAudit(database, context, "Salary", salaryId, "restore", { before: salary });
  return "RESTORED";
}

export async function archiveOrDeleteCreditCard(database: LifecycleClient, context: AuditContext, cardId: string): Promise<LifecycleResult> {
  const card = await database.creditCard.findFirstOrThrow({ where: { id: cardId, workspaceId: context.workspaceId } });
  const [purchaseCount, installmentCount, invoiceCount] = await Promise.all([
    database.creditCardPurchase.count({ where: { cardId, workspaceId: context.workspaceId } }),
    database.creditCardInstallment.count({ where: { cardId, workspaceId: context.workspaceId } }),
    database.creditCardInvoice.count({ where: { cardId, workspaceId: context.workspaceId } }),
  ]);

  if (purchaseCount + installmentCount + invoiceCount === 0) {
    await appendAudit(database, context, "CreditCard", cardId, "delete", { before: card, reason: "unused" });
    const { count } = await database.creditCard.deleteMany({ where: { id: cardId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Cartão não encontrado.");
    return "DELETED";
  }

  const { count } = await database.creditCard.updateMany({
    where: { active: true, id: cardId, workspaceId: context.workspaceId },
    data: { active: false, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Cartão não encontrado ou já arquivado.");
  await appendAudit(database, context, "CreditCard", cardId, "archive", { before: card, reason: "has_history" });
  return "ARCHIVED";
}

export async function restoreCreditCard(database: LifecycleClient, context: AuditContext, cardId: string): Promise<LifecycleResult> {
  const card = await database.creditCard.findFirstOrThrow({ where: { id: cardId, workspaceId: context.workspaceId } });
  const { count } = await database.creditCard.updateMany({
    where: { active: false, id: cardId, workspaceId: context.workspaceId },
    data: { active: true, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Cartão não encontrado ou já ativo.");
  await appendAudit(database, context, "CreditCard", cardId, "restore", { before: card });
  return "RESTORED";
}

export async function archiveOrDeleteDebt(
  database: LifecycleClient,
  context: AuditContext,
  debtId: string,
  effectiveAt = new Date(),
): Promise<LifecycleResult> {
  const debt = await database.debt.findFirstOrThrow({ where: { id: debtId, workspaceId: context.workspaceId } });
  const paymentCount = await database.transaction.count({
    where: { debtInstallment: { debtId }, workspaceId: context.workspaceId },
  });

  if (paymentCount === 0) {
    await appendAudit(database, context, "Debt", debtId, "delete", { before: debt, reason: "unpaid" });
    const { count } = await database.debt.deleteMany({ where: { id: debtId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Dívida não encontrada.");
    return "DELETED";
  }

  const { count } = await database.debt.updateMany({
    where: { active: true, id: debtId, workspaceId: context.workspaceId },
    data: { active: false, canceledAt: effectiveAt, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Dívida não encontrada ou já encerrada.");
  await appendAudit(database, context, "Debt", debtId, "archive", { before: debt, reason: "has_payments" });
  return "ARCHIVED";
}

export async function restoreDebt(database: LifecycleClient, context: AuditContext, debtId: string): Promise<LifecycleResult> {
  const debt = await database.debt.findFirstOrThrow({ where: { id: debtId, workspaceId: context.workspaceId } });
  const { count } = await database.debt.updateMany({
    where: { active: false, id: debtId, workspaceId: context.workspaceId },
    data: { active: true, canceledAt: null, updatedByEditorId: context.editorId, version: { increment: 1 } },
  });
  assertExactlyOne(count, "Dívida não encontrada ou já ativa.");
  await appendAudit(database, context, "Debt", debtId, "restore", { before: debt });
  return "RESTORED";
}

export async function archiveOrDeleteSavingsGoal(database: LifecycleClient, context: AuditContext, goalId: string): Promise<LifecycleResult> {
  const goal = await database.savingsGoal.findFirstOrThrow({ where: { id: goalId, workspaceId: context.workspaceId } });
  const movementCount = await database.savingsGoalMovement.count({ where: { goalId, workspaceId: context.workspaceId } });

  if (movementCount === 0) {
    await appendAudit(database, context, "SavingsGoal", goalId, "delete", { before: goal, reason: "empty" });
    const { count } = await database.savingsGoal.deleteMany({ where: { id: goalId, workspaceId: context.workspaceId } });
    assertExactlyOne(count, "Cofrinho não encontrado.");
    return "DELETED";
  }

  const { count } = await database.savingsGoal.updateMany({
    where: { id: goalId, status: { not: "ARCHIVED" }, workspaceId: context.workspaceId },
    data: { status: "ARCHIVED" },
  });
  assertExactlyOne(count, "Cofrinho não encontrado ou já arquivado.");
  await appendAudit(database, context, "SavingsGoal", goalId, "archive", { before: goal, reason: "has_movements" });
  return "ARCHIVED";
}

export async function restoreSavingsGoal(database: LifecycleClient, context: AuditContext, goalId: string): Promise<LifecycleResult> {
  const goal = await database.savingsGoal.findFirstOrThrow({ where: { id: goalId, workspaceId: context.workspaceId } });
  const { count } = await database.savingsGoal.updateMany({
    where: { id: goalId, status: "ARCHIVED", workspaceId: context.workspaceId },
    data: { status: "ACTIVE" },
  });
  assertExactlyOne(count, "Cofrinho não encontrado ou já ativo.");
  await appendAudit(database, context, "SavingsGoal", goalId, "restore", { before: goal });
  return "RESTORED";
}

export async function archiveInvestment(database: LifecycleClient, context: AuditContext, investmentId: string): Promise<LifecycleResult> {
  const investment = await database.investment.findFirstOrThrow({ where: { id: investmentId, workspaceId: context.workspaceId } });
  const { count } = await database.investment.updateMany({
    where: { active: true, id: investmentId, workspaceId: context.workspaceId },
    data: { active: false },
  });
  assertExactlyOne(count, "Investimento não encontrado ou já arquivado.");
  await appendAudit(database, context, "Investment", investmentId, "archive", {
    before: investment,
    reason: "financial_snapshot",
    semantics: "amount_at_reference_date",
  });
  return "ARCHIVED";
}

export async function restoreInvestment(database: LifecycleClient, context: AuditContext, investmentId: string): Promise<LifecycleResult> {
  const investment = await database.investment.findFirstOrThrow({ where: { id: investmentId, workspaceId: context.workspaceId } });
  const { count } = await database.investment.updateMany({
    where: { active: false, id: investmentId, workspaceId: context.workspaceId },
    data: { active: true },
  });
  assertExactlyOne(count, "Investimento não encontrado ou já ativo.");
  await appendAudit(database, context, "Investment", investmentId, "restore", { before: investment });
  return "RESTORED";
}
