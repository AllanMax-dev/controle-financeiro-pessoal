import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, test } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  archiveOrDeleteAccount,
  archiveOrDeleteCategory,
  archiveOrDeleteCreditCard,
  archiveOrDeleteDebt,
  archiveOrDeleteFixedExpense,
  archiveOrDeleteSalary,
  archiveOrDeleteSavingsGoal,
} from "@/modules/finance/application/finance-lifecycle";
import { getFinanceOverview, getFinanceOptions } from "@/modules/finance/application/finance-queries";

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = databaseUrl ? describe.sequential : describe.skip;
const database = databaseUrl ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) : null;
const competenceDate = new Date("2026-08-01T00:00:00.000Z");
const effectiveAt = new Date("2026-08-17T00:00:00.000Z");

async function createFixture(label: string) {
  const workspace = await database!.workspace.create({
    data: {
      name: `Lifecycle ${label}`,
      slug: `lifecycle-${label}-${randomUUID()}`,
    },
  });
  const editor = await database!.editor.create({
    data: {
      displayName: "Pessoa de teste",
      workspaceId: workspace.id,
    },
  });

  return {
    context: { editorId: editor.id, workspaceId: workspace.id },
    editor,
    workspace,
  };
}

async function createAccount(workspaceId: string, personEditorId: string, name: string) {
  return database!.financialAccount.create({
    data: {
      initialBalance: 0,
      name,
      personEditorId,
      type: "CHECKING",
      workspaceId,
    },
  });
}

async function expectIntegrity(
  workspaceId: string,
  entityType: string,
  entityId: string,
  action: "archive" | "delete",
  expectedTransactionIds: string[] = [],
) {
  const [audit, overview, orphanRows] = await Promise.all([
    database!.auditLog.findFirst({ where: { action, entityId, entityType, workspaceId } }),
    getFinanceOverview(workspaceId, "2026-08"),
    database!.$queryRaw<Array<{ count: string }>>`
      SELECT COUNT(*)::text AS count
      FROM "Transaction" transaction_record
      LEFT JOIN "Workspace" workspace_record ON workspace_record.id = transaction_record."workspaceId"
      LEFT JOIN "Editor" person_record ON person_record.id = transaction_record."personEditorId"
      LEFT JOIN "FinancialAccount" account_record ON account_record.id = transaction_record."accountId"
      WHERE transaction_record."workspaceId" = ${workspaceId}::uuid
        AND (
          workspace_record.id IS NULL
          OR person_record.id IS NULL
          OR (transaction_record."accountId" IS NOT NULL AND account_record.id IS NULL)
        )
    `,
  ]);

  expect(audit).not.toBeNull();
  expect(audit?.metadata).not.toBeNull();
  expect(orphanRows[0]?.count).toBe("0");
  expect(overview.coupleTotal.available.isFinite()).toBe(true);
  expect(overview.coupleTotal.expenses.isFinite()).toBe(true);

  if (expectedTransactionIds.length > 0) {
    const transactions = await database!.transaction.findMany({
      where: { id: { in: expectedTransactionIds }, workspaceId },
    });
    expect(transactions.map(({ id }) => id).sort()).toEqual([...expectedTransactionIds].sort());
    expect(overview.transactions.some(({ id }) => expectedTransactionIds.includes(id))).toBe(true);
  }
}

integrationTest("ciclo de vida financeiro com PostgreSQL real", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  test("conta sem histórico é excluída", async () => {
    const fixture = await createFixture("unused-account");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta vazia");
    const result = await database!.$transaction((transaction) => archiveOrDeleteAccount(transaction, fixture.context, account.id, account.version));

    expect(result).toBe("DELETED");
    expect(await database!.financialAccount.findUnique({ where: { id: account.id } })).toBeNull();
    await expectIntegrity(fixture.workspace.id, "FinancialAccount", account.id, "delete");
    const audit = await database!.auditLog.findFirstOrThrow({
      where: { action: "delete", entityId: account.id, entityType: "FinancialAccount", workspaceId: fixture.workspace.id },
    });
    await expect(database!.auditLog.delete({ where: { id: audit.id } })).rejects.toThrow("AuditLog is append-only");
  });

  test("conta com histórico é arquivada sem alterar saldo, Transaction ou FK", async () => {
    const fixture = await createFixture("used-account");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta usada");
    const financialTransaction = await database!.transaction.create({
      data: {
        accountId: account.id,
        amount: 100,
        competenceDate,
        description: "Receita histórica",
        personEditorId: fixture.editor.id,
        settledAt: competenceDate,
        status: "SETTLED",
        type: "INCOME",
        workspaceId: fixture.workspace.id,
      },
    });
    const before = await getFinanceOverview(fixture.workspace.id, "2026-08");
    const result = await database!.$transaction((transaction) => archiveOrDeleteAccount(transaction, fixture.context, account.id, account.version));
    const archivedAccount = await database!.financialAccount.findUniqueOrThrow({ where: { id: account.id } });
    const after = await getFinanceOverview(fixture.workspace.id, "2026-08");

    expect(result).toBe("ARCHIVED");
    expect(archivedAccount.active).toBe(false);
    expect(await database!.transaction.findUniqueOrThrow({ where: { id: financialTransaction.id } })).toMatchObject({ accountId: account.id });
    expect(before.transactions.find(({ id }) => id === financialTransaction.id)?.amount.toString()).toBe("100");
    expect(after.accounts.find(({ id }) => id === account.id)?.balance.toString()).toBe("100");
    await expectIntegrity(fixture.workspace.id, "FinancialAccount", account.id, "archive", [financialTransaction.id]);
  });

  test("categoria usada é arquivada e categoria sem uso é excluída", async () => {
    const fixture = await createFixture("categories");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta categorias");
    const usedCategory = await database!.category.create({
      data: { kind: "EXPENSE", name: "Categoria usada", workspaceId: fixture.workspace.id },
    });
    const unusedCategory = await database!.category.create({
      data: { kind: "EXPENSE", name: "Categoria vazia", workspaceId: fixture.workspace.id },
    });
    const financialTransaction = await database!.transaction.create({
      data: {
        accountId: account.id,
        amount: 20,
        categoryId: usedCategory.id,
        competenceDate,
        description: "Despesa categorizada",
        personEditorId: fixture.editor.id,
        settledAt: competenceDate,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: fixture.workspace.id,
      },
    });

    const usedResult = await database!.$transaction((transaction) => archiveOrDeleteCategory(transaction, fixture.context, usedCategory.id));
    const unusedResult = await database!.$transaction((transaction) => archiveOrDeleteCategory(transaction, fixture.context, unusedCategory.id));

    expect(usedResult).toBe("ARCHIVED");
    expect((await database!.category.findUniqueOrThrow({ where: { id: usedCategory.id } })).active).toBe(false);
    expect(unusedResult).toBe("DELETED");
    expect(await database!.category.findUnique({ where: { id: unusedCategory.id } })).toBeNull();
    expect((await getFinanceOptions(fixture.workspace.id)).archivedCategories.map(({ id }) => id)).toContain(usedCategory.id);
    await expectIntegrity(fixture.workspace.id, "Category", usedCategory.id, "archive", [financialTransaction.id]);
    await expectIntegrity(fixture.workspace.id, "Category", unusedCategory.id, "delete", [financialTransaction.id]);
  });

  test("salário recebido é encerrado preservando Transaction", async () => {
    const fixture = await createFixture("salary");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta salário");
    const salary = await database!.salary.create({
      data: {
        accountId: account.id,
        amount: 2500,
        description: "Salário",
        paymentDay: 15,
        personEditorId: fixture.editor.id,
        startMonth: competenceDate,
        workspaceId: fixture.workspace.id,
      },
    });
    const financialTransaction = await database!.transaction.create({
      data: {
        accountId: account.id,
        amount: salary.amount,
        competenceDate: new Date("2026-08-15T00:00:00.000Z"),
        description: "Salário confirmado",
        dueDate: new Date("2026-08-15T00:00:00.000Z"),
        personEditorId: fixture.editor.id,
        salaryId: salary.id,
        settledAt: new Date("2026-08-15T00:00:00.000Z"),
        status: "SETTLED",
        type: "INCOME",
        workspaceId: fixture.workspace.id,
      },
    });
    const result = await database!.$transaction((transaction) => archiveOrDeleteSalary(transaction, fixture.context, salary.id, effectiveAt, salary.version));

    expect(result).toBe("ARCHIVED");
    expect(await database!.salary.findUniqueOrThrow({ where: { id: salary.id } })).toMatchObject({ active: false, archivedAt: new Date("2026-08-31T00:00:00.000Z") });
    await expectIntegrity(fixture.workspace.id, "Salary", salary.id, "archive", [financialTransaction.id]);
  });

  test("gasto fixo pago é encerrado preservando Transaction", async () => {
    const fixture = await createFixture("fixed-expense");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta gasto fixo");
    const fixedExpense = await database!.fixedExpense.create({
      data: {
        accountId: account.id,
        amount: 500,
        description: "Aluguel",
        dueDay: 10,
        personEditorId: fixture.editor.id,
        startMonth: competenceDate,
        workspaceId: fixture.workspace.id,
      },
    });
    const financialTransaction = await database!.transaction.create({
      data: {
        accountId: account.id,
        amount: fixedExpense.amount,
        competenceDate: new Date("2026-08-10T00:00:00.000Z"),
        description: "Aluguel pago",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
        fixedExpenseId: fixedExpense.id,
        personEditorId: fixture.editor.id,
        settledAt: new Date("2026-08-10T00:00:00.000Z"),
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: fixture.workspace.id,
      },
    });
    const result = await database!.$transaction((transaction) => archiveOrDeleteFixedExpense(transaction, fixture.context, fixedExpense.id, effectiveAt, fixedExpense.version));

    expect(result).toBe("ARCHIVED");
    expect(await database!.fixedExpense.findUniqueOrThrow({ where: { id: fixedExpense.id } })).toMatchObject({ active: false, endedAt: new Date("2026-08-31T00:00:00.000Z") });
    await expectIntegrity(fixture.workspace.id, "FixedExpense", fixedExpense.id, "archive", [financialTransaction.id]);
  });

  test("cartão usado é arquivado sem apagar compra, parcela ou lançamento", async () => {
    const fixture = await createFixture("card");
    const card = await database!.creditCard.create({
      data: {
        closingDay: 5,
        dueDay: 12,
        limit: 2000,
        name: "Cartão usado",
        personEditorId: fixture.editor.id,
        workspaceId: fixture.workspace.id,
      },
    });
    const purchase = await database!.creditCardPurchase.create({
      data: {
        cardId: card.id,
        description: "Compra histórica",
        firstDueDate: new Date("2026-08-12T00:00:00.000Z"),
        installmentCount: 1,
        personEditorId: fixture.editor.id,
        purchaseDate: competenceDate,
        totalAmount: 80,
        workspaceId: fixture.workspace.id,
      },
    });
    const invoice = await database!.creditCardInvoice.create({
      data: {
        amount: 80,
        cardId: card.id,
        dueDate: new Date("2026-08-12T00:00:00.000Z"),
        month: competenceDate,
        personEditorId: fixture.editor.id,
        workspaceId: fixture.workspace.id,
      },
    });
    const installment = await database!.creditCardInstallment.create({
      data: {
        amount: 80,
        cardId: card.id,
        dueMonth: competenceDate,
        invoiceId: invoice.id,
        number: 1,
        personEditorId: fixture.editor.id,
        purchaseId: purchase.id,
        workspaceId: fixture.workspace.id,
      },
    });
    const financialTransaction = await database!.transaction.create({
      data: {
        affectsBalance: false,
        amount: 80,
        competenceDate,
        creditCardInstallmentId: installment.id,
        description: "Compra histórica 1/1",
        personEditorId: fixture.editor.id,
        status: "PENDING",
        type: "EXPENSE",
        workspaceId: fixture.workspace.id,
      },
    });
    const result = await database!.$transaction((transaction) => archiveOrDeleteCreditCard(transaction, fixture.context, card.id, card.version));

    expect(result).toBe("ARCHIVED");
    expect((await database!.creditCard.findUniqueOrThrow({ where: { id: card.id } })).active).toBe(false);
    expect(await database!.creditCardPurchase.findUnique({ where: { id: purchase.id } })).not.toBeNull();
    expect(await database!.creditCardInstallment.findUnique({ where: { id: installment.id } })).not.toBeNull();
    await expectIntegrity(fixture.workspace.id, "CreditCard", card.id, "archive", [financialTransaction.id]);
  });

  test("dívida paga é encerrada preservando parcela e Transaction", async () => {
    const fixture = await createFixture("debt");
    const account = await createAccount(fixture.workspace.id, fixture.editor.id, "Conta dívida");
    const debt = await database!.debt.create({
      data: {
        description: "Dívida paga",
        firstDueDate: competenceDate,
        installmentCount: 1,
        personEditorId: fixture.editor.id,
        startDate: competenceDate,
        totalAmount: 300,
        workspaceId: fixture.workspace.id,
      },
    });
    const installment = await database!.debtInstallment.create({
      data: {
        amount: 300,
        debtId: debt.id,
        dueDate: competenceDate,
        number: 1,
        paidAt: competenceDate,
        personEditorId: fixture.editor.id,
        status: "PAID",
        workspaceId: fixture.workspace.id,
      },
    });
    const financialTransaction = await database!.transaction.create({
      data: {
        accountId: account.id,
        amount: 300,
        competenceDate,
        debtInstallmentId: installment.id,
        description: "Dívida paga 1/1",
        personEditorId: fixture.editor.id,
        settledAt: competenceDate,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: fixture.workspace.id,
      },
    });
    const result = await database!.$transaction((transaction) => archiveOrDeleteDebt(transaction, fixture.context, debt.id, effectiveAt, debt.version));

    expect(result).toBe("ARCHIVED");
    expect((await database!.debt.findUniqueOrThrow({ where: { id: debt.id } })).active).toBe(false);
    expect(await database!.debtInstallment.findUnique({ where: { id: installment.id } })).not.toBeNull();
    await expectIntegrity(fixture.workspace.id, "Debt", debt.id, "archive", [financialTransaction.id]);
  });

  test("cofrinho movimentado é arquivado preservando movimentos", async () => {
    const fixture = await createFixture("goal");
    const goal = await database!.savingsGoal.create({
      data: {
        name: "Reserva",
        personEditorId: fixture.editor.id,
        targetAmount: 1000,
        workspaceId: fixture.workspace.id,
      },
    });
    const movement = await database!.savingsGoalMovement.create({
      data: {
        amount: 100,
        goalId: goal.id,
        movementDate: competenceDate,
        personEditorId: fixture.editor.id,
        type: "DEPOSIT",
        workspaceId: fixture.workspace.id,
      },
    });
    const result = await database!.$transaction((transaction) => archiveOrDeleteSavingsGoal(transaction, fixture.context, goal.id));

    expect(result).toBe("ARCHIVED");
    expect((await database!.savingsGoal.findUniqueOrThrow({ where: { id: goal.id } })).status).toBe("ARCHIVED");
    expect(await database!.savingsGoalMovement.findUnique({ where: { id: movement.id } })).not.toBeNull();
    await expectIntegrity(fixture.workspace.id, "SavingsGoal", goal.id, "archive");
  });
});
