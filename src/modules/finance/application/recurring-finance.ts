import type { Prisma } from "@/generated/prisma/client";
import { assertAccountForPerson, assertOptimisticUpdate } from "@/modules/finance/application/financial-consistency";
import { appendAudit, type AuditContext } from "@/modules/finance/application/finance-lifecycle";
import { addMonths, buildSalaryOccurrencePlan, fixedExpenseDueDate } from "@/modules/finance/domain/finance-calculations";
import { money } from "@/modules/shared/domain/money";

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextRuleStart(selectedMonth: Date, requestedStartMonth: Date, latestOccurrence: Date) {
  const latestOccurrenceMonth = monthStart(latestOccurrence);
  const minimumStartMonth = addMonths(selectedMonth > latestOccurrenceMonth ? selectedMonth : latestOccurrenceMonth, 1);

  return requestedStartMonth > minimumStartMonth ? requestedStartMonth : minimumStartMonth;
}

function dayBefore(date: Date) {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

export async function updateSalaryRule(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: {
    accountId: string;
    amount: ReturnType<typeof money>;
    categoryId: string | null;
    description: string;
    expectedVersion: number;
    frequency: "FORTNIGHTLY" | "MONTHLY";
    notes: string | null;
    paymentDay: number;
    personEditorId: string;
    salaryId: string;
    selectedMonth: Date;
    startMonth: Date;
  },
) {
  const current = await transaction.salary.findFirstOrThrow({
    where: { active: true, id: input.salaryId, workspaceId: context.workspaceId },
    include: { transactions: { orderBy: { competenceDate: "desc" }, take: 1 } },
  });
  await assertAccountForPerson(transaction, context.workspaceId, input.personEditorId, input.accountId, true);
  const hasHistory = current.transactions.length > 0;
  const structuralChanged = current.personEditorId !== input.personEditorId ||
    !money(current.amount).equals(input.amount) ||
    current.frequency !== input.frequency ||
    current.paymentDay !== input.paymentDay ||
    current.startMonth.getTime() !== input.startMonth.getTime() ||
    current.accountId !== input.accountId ||
    current.categoryId !== input.categoryId;

  if (hasHistory && structuralChanged) {
    const startMonth = nextRuleStart(input.selectedMonth, input.startMonth, current.transactions[0]!.competenceDate);
    const archived = await transaction.salary.updateMany({
      where: { id: current.id, version: input.expectedVersion, workspaceId: context.workspaceId },
      data: { active: false, archivedAt: dayBefore(startMonth), updatedByEditorId: context.editorId, version: { increment: 1 } },
    });
    assertOptimisticUpdate(archived.count);
    const nextRule = await transaction.salary.create({
      data: {
        accountId: input.accountId,
        amount: input.amount,
        categoryId: input.categoryId,
        createdByEditorId: context.editorId,
        description: input.description,
        frequency: input.frequency,
        notes: input.notes,
        paymentDay: input.paymentDay,
        personEditorId: input.personEditorId,
        startMonth,
        workspaceId: context.workspaceId,
      },
    });
    await appendAudit(transaction, context, "Salary", current.id, "archive", { before: current, replacedBy: nextRule.id });
    await appendAudit(transaction, context, "Salary", nextRule.id, "create_version", { replaces: current.id });
    return { id: nextRule.id, result: "VERSIONED" as const };
  }

  const updated = await transaction.salary.updateMany({
    where: { id: current.id, version: input.expectedVersion, workspaceId: context.workspaceId },
    data: {
      accountId: input.accountId,
      amount: input.amount,
      categoryId: input.categoryId,
      description: input.description,
      frequency: input.frequency,
      notes: input.notes,
      paymentDay: input.paymentDay,
      personEditorId: input.personEditorId,
      startMonth: input.startMonth,
      updatedByEditorId: context.editorId,
      version: { increment: 1 },
    },
  });
  assertOptimisticUpdate(updated.count);
  await appendAudit(transaction, context, "Salary", current.id, "update", { before: current });
  return { id: current.id, result: "UPDATED" as const };
}

export async function updateFixedExpenseRule(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: {
    accountId: string | null;
    amount: ReturnType<typeof money>;
    categoryId: string | null;
    description: string;
    dueDay: number;
    expectedVersion: number;
    fixedExpenseId: string;
    notes: string | null;
    personEditorId: string;
    selectedMonth: Date;
    startMonth: Date;
  },
) {
  const current = await transaction.fixedExpense.findFirstOrThrow({
    where: { active: true, id: input.fixedExpenseId, workspaceId: context.workspaceId },
    include: { transactions: { orderBy: { competenceDate: "desc" }, take: 1 } },
  });
  await assertAccountForPerson(transaction, context.workspaceId, input.personEditorId, input.accountId);
  const hasHistory = current.transactions.length > 0;
  const structuralChanged = current.personEditorId !== input.personEditorId ||
    !money(current.amount).equals(input.amount) ||
    current.dueDay !== input.dueDay ||
    current.startMonth.getTime() !== input.startMonth.getTime() ||
    current.accountId !== input.accountId ||
    current.categoryId !== input.categoryId;

  if (hasHistory && structuralChanged) {
    const startMonth = nextRuleStart(input.selectedMonth, input.startMonth, current.transactions[0]!.competenceDate);
    const archived = await transaction.fixedExpense.updateMany({
      where: { id: current.id, version: input.expectedVersion, workspaceId: context.workspaceId },
      data: { active: false, endedAt: dayBefore(startMonth), updatedByEditorId: context.editorId, version: { increment: 1 } },
    });
    assertOptimisticUpdate(archived.count);
    const nextRule = await transaction.fixedExpense.create({
      data: {
        accountId: input.accountId,
        amount: input.amount,
        categoryId: input.categoryId,
        createdByEditorId: context.editorId,
        description: input.description,
        dueDay: input.dueDay,
        notes: input.notes,
        personEditorId: input.personEditorId,
        startMonth,
        workspaceId: context.workspaceId,
      },
    });
    await appendAudit(transaction, context, "FixedExpense", current.id, "archive", { before: current, replacedBy: nextRule.id });
    await appendAudit(transaction, context, "FixedExpense", nextRule.id, "create_version", { replaces: current.id });
    return { id: nextRule.id, result: "VERSIONED" as const };
  }

  const updated = await transaction.fixedExpense.updateMany({
    where: { id: current.id, version: input.expectedVersion, workspaceId: context.workspaceId },
    data: {
      accountId: input.accountId,
      amount: input.amount,
      categoryId: input.categoryId,
      description: input.description,
      dueDay: input.dueDay,
      notes: input.notes,
      personEditorId: input.personEditorId,
      startMonth: input.startMonth,
      updatedByEditorId: context.editorId,
      version: { increment: 1 },
    },
  });
  assertOptimisticUpdate(updated.count);
  await appendAudit(transaction, context, "FixedExpense", current.id, "update", { before: current });
  return { id: current.id, result: "UPDATED" as const };
}

async function assertOccurrenceCategory(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  categoryId: string | null,
  kind: "EXPENSE" | "INCOME",
) {
  if (!categoryId) {
    return;
  }
  const category = await transaction.category.findFirst({
    where: { active: true, id: categoryId, kind, workspaceId },
    select: { id: true },
  });

  if (!category) {
    throw new Error("Categoria invalida para o tipo selecionado.");
  }
}

export async function confirmSalaryOccurrence(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  salaryId: string,
  dueDate: Date,
) {
  const salary = await transaction.salary.findFirstOrThrow({
    where: {
      id: salaryId,
      OR: [{ archivedAt: null }, { archivedAt: { gte: dueDate } }],
      startMonth: { lte: dueDate },
      workspaceId: context.workspaceId,
    },
  });
  const salaryMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1));
  const occurrence = buildSalaryOccurrencePlan(salary.amount, salary.frequency, salaryMonth, salary.paymentDay).find(
    (item) => item.dueDate.getTime() === dueDate.getTime(),
  );

  if (!occurrence || !salary.accountId) {
    throw new Error("Vencimento invalido para esse salario.");
  }
  await assertAccountForPerson(transaction, context.workspaceId, salary.personEditorId, salary.accountId, true);
  await assertOccurrenceCategory(transaction, context.workspaceId, salary.categoryId, "INCOME");
  const existing = await transaction.transaction.findUnique({
    where: { salaryId_competenceDate: { competenceDate: dueDate, salaryId: salary.id } },
  });

  if (existing?.status === "SETTLED") {
    return { created: false, id: existing.id };
  }

  const transactionRecord = existing
    ? await transaction.transaction.update({
      where: { id: existing.id },
      data: {
        accountId: salary.accountId,
        affectsBalance: true,
        amount: occurrence.amount,
        categoryId: salary.categoryId,
        description: salary.description,
        dueDate,
        notes: salary.notes,
        personEditorId: salary.personEditorId,
        settledAt: dueDate,
        status: "SETTLED",
        updatedByEditorId: context.editorId,
        version: { increment: 1 },
      },
    })
    : await transaction.transaction.create({
      data: {
        accountId: salary.accountId,
        affectsBalance: true,
        amount: occurrence.amount,
        categoryId: salary.categoryId,
        competenceDate: dueDate,
        createdByEditorId: context.editorId,
        description: salary.description,
        dueDate,
        notes: salary.notes,
        personEditorId: salary.personEditorId,
        salaryId: salary.id,
        settledAt: dueDate,
        status: "SETTLED",
        type: "INCOME",
        workspaceId: context.workspaceId,
      },
    });
  await appendAudit(transaction, context, "Transaction", transactionRecord.id, "confirm", { salaryId, dueDate });

  return { created: !existing, id: transactionRecord.id };
}

export async function payFixedExpenseOccurrence(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { accountId: string; amount: ReturnType<typeof money>; dueDate: Date; fixedExpenseId: string; paidAt: Date },
) {
  const fixedExpense = await transaction.fixedExpense.findFirstOrThrow({
    where: {
      id: input.fixedExpenseId,
      OR: [{ endedAt: null }, { endedAt: { gte: input.dueDate } }],
      startMonth: { lte: input.dueDate },
      workspaceId: context.workspaceId,
    },
  });
  const monthStart = new Date(Date.UTC(input.dueDate.getUTCFullYear(), input.dueDate.getUTCMonth(), 1));
  const expectedDueDate = fixedExpenseDueDate(monthStart, fixedExpense.dueDay);

  if (input.dueDate.getTime() !== expectedDueDate.getTime()) {
    throw new Error("Vencimento invalido para esse gasto fixo.");
  }
  if (!input.amount.equals(fixedExpense.amount)) {
    throw new Error("Pagamento parcial de gasto fixo ainda nao suportado.");
  }
  await assertAccountForPerson(transaction, context.workspaceId, fixedExpense.personEditorId, input.accountId, true);
  await assertOccurrenceCategory(transaction, context.workspaceId, fixedExpense.categoryId, "EXPENSE");
  const existing = await transaction.transaction.findUnique({
    where: { fixedExpenseId_competenceDate: { competenceDate: input.dueDate, fixedExpenseId: fixedExpense.id } },
  });

  if (existing?.status === "SETTLED") {
    return { created: false, id: existing.id };
  }

  const transactionRecord = existing
    ? await transaction.transaction.update({
      where: { id: existing.id },
      data: {
        accountId: input.accountId,
        affectsBalance: true,
        amount: fixedExpense.amount,
        categoryId: fixedExpense.categoryId,
        description: fixedExpense.description,
        dueDate: input.dueDate,
        notes: fixedExpense.notes,
        personEditorId: fixedExpense.personEditorId,
        settledAt: input.paidAt,
        status: "SETTLED",
        updatedByEditorId: context.editorId,
        version: { increment: 1 },
      },
    })
    : await transaction.transaction.create({
      data: {
        accountId: input.accountId,
        affectsBalance: true,
        amount: fixedExpense.amount,
        categoryId: fixedExpense.categoryId,
        competenceDate: input.dueDate,
        createdByEditorId: context.editorId,
        description: fixedExpense.description,
        dueDate: input.dueDate,
        fixedExpenseId: fixedExpense.id,
        notes: fixedExpense.notes,
        personEditorId: fixedExpense.personEditorId,
        settledAt: input.paidAt,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: context.workspaceId,
      },
    });
  await appendAudit(transaction, context, "Transaction", transactionRecord.id, "pay", { dueDate: input.dueDate, fixedExpenseId: fixedExpense.id });

  return { created: !existing, id: transactionRecord.id };
}

export async function undoFixedExpensePayment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  transactionId: string,
) {
  const transactionRecord = await transaction.transaction.findFirstOrThrow({
    where: { fixedExpenseId: { not: null }, id: transactionId, workspaceId: context.workspaceId },
  });
  await appendAudit(transaction, context, "Transaction", transactionRecord.id, "delete", {
    before: transactionRecord,
    reason: "fixed_expense_payment_reversed",
  });
  await transaction.transaction.delete({ where: { id: transactionRecord.id } });
}
