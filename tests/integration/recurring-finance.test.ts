import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, test } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  assertDebtIntegrity,
  assertDebtStructureMutable,
  cancelDebtFutureInstallments,
  payDebtInstallment,
  undoDebtInstallmentPayment,
} from "@/modules/finance/application/debt-finance";
import { archiveOrDeleteDebt, archiveOrDeleteFixedExpense, archiveOrDeleteSalary } from "@/modules/finance/application/finance-lifecycle";
import { getFinanceOverview } from "@/modules/finance/application/finance-queries";
import {
  confirmSalaryOccurrence,
  payFixedExpenseOccurrence,
  undoFixedExpensePayment,
  updateFixedExpenseRule,
  updateSalaryRule,
} from "@/modules/finance/application/recurring-finance";
import { buildInstallmentPlan, buildSalaryOccurrencePlan, installmentDueDate } from "@/modules/finance/domain/finance-calculations";
import { money, sumMoney } from "@/modules/shared/domain/money";

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = databaseUrl ? describe.sequential : describe.skip;
const database = databaseUrl ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) : null;
const august = new Date("2026-08-01T00:00:00.000Z");
const september = new Date("2026-09-01T00:00:00.000Z");

async function createFixture(label: string) {
  const workspace = await database!.workspace.create({ data: { name: label, slug: `${label}-${randomUUID()}` } });
  const allan = await database!.editor.create({ data: { displayName: "Allan", workspaceId: workspace.id } });
  const mayara = await database!.editor.create({ data: { displayName: "Mayara", workspaceId: workspace.id } });
  const account = await database!.financialAccount.create({
    data: { initialBalance: 0, name: "Conta Allan", personEditorId: allan.id, type: "CHECKING", workspaceId: workspace.id },
  });
  const incomeCategory = await database!.category.create({ data: { kind: "INCOME", name: "Salário", workspaceId: workspace.id } });
  const expenseCategory = await database!.category.create({ data: { kind: "EXPENSE", name: "Casa", workspaceId: workspace.id } });

  return { account, allan, context: { editorId: allan.id, workspaceId: workspace.id }, expenseCategory, incomeCategory, mayara, workspace };
}

async function createDebt(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  frequency: "FORTNIGHTLY" | "MONTHLY",
  totalAmount = "100.00",
  installmentCount = 3,
  shared = false,
) {
  const firstDueDate = new Date("2026-08-10T00:00:00.000Z");
  const debt = await database!.debt.create({
    data: {
      categoryId: fixture.expenseCategory.id,
      description: `Dívida ${frequency}`,
      firstDueDate,
      frequency,
      installmentCount,
      personEditorId: fixture.allan.id,
      startDate: august,
      totalAmount,
      workspaceId: fixture.workspace.id,
    },
  });
  const installments = [];
  const plan = buildInstallmentPlan(totalAmount, installmentCount);
  const allanPlan = buildInstallmentPlan("60.00", installmentCount);
  const mayaraPlan = buildInstallmentPlan("40.00", installmentCount);

  for (const installment of plan) {
    const created = await database!.debtInstallment.create({
      data: {
        amount: installment.amount,
        debtId: debt.id,
        dueDate: installmentDueDate(firstDueDate, installment.number - 1, frequency),
        number: installment.number,
        personEditorId: fixture.allan.id,
        workspaceId: fixture.workspace.id,
      },
    });
    if (shared) {
      await database!.debtInstallmentShare.createMany({
        data: [
          { amount: allanPlan[installment.number - 1]!.amount, installmentId: created.id, personEditorId: fixture.allan.id, workspaceId: fixture.workspace.id },
          { amount: mayaraPlan[installment.number - 1]!.amount, installmentId: created.id, personEditorId: fixture.mayara.id, workspaceId: fixture.workspace.id },
        ],
      });
    }
    installments.push(created);
  }

  return { debt, installments };
}

integrationTest("regras recorrentes e dívidas com PostgreSQL real", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  test("salário mensal e quinzenal representam um único total mensal", async () => {
    const fixture = await createFixture("salary-plans");
    const monthly = await database!.salary.create({
      data: {
        accountId: fixture.account.id,
        amount: 4000,
        categoryId: fixture.incomeCategory.id,
        description: "Mensal",
        paymentDay: 15,
        personEditorId: fixture.allan.id,
        startMonth: august,
        workspaceId: fixture.workspace.id,
      },
    });
    const fortnightly = buildSalaryOccurrencePlan("4000.00", "FORTNIGHTLY", august, 15);
    const fortnightlySalary = await database!.salary.create({
      data: {
        accountId: fixture.account.id,
        amount: 4000,
        categoryId: fixture.incomeCategory.id,
        description: "Quinzenal",
        frequency: "FORTNIGHTLY",
        paymentDay: 15,
        personEditorId: fixture.allan.id,
        startMonth: august,
        workspaceId: fixture.workspace.id,
      },
    });

    expect(fortnightly.map(({ amount }) => amount.toFixed(2))).toEqual(["2000.00", "2000.00"]);
    expect(sumMoney(fortnightly.map(({ amount }) => amount)).toFixed(2)).toBe("4000.00");

    const first = await database!.$transaction((transaction) => confirmSalaryOccurrence(transaction, fixture.context, monthly.id, new Date("2026-08-15T00:00:00.000Z")));
    const duplicate = await database!.$transaction((transaction) => confirmSalaryOccurrence(transaction, fixture.context, monthly.id, new Date("2026-08-15T00:00:00.000Z")));
    const overview = await getFinanceOverview(fixture.workspace.id, "2026-08");

    expect(first.created).toBe(true);
    expect(duplicate).toEqual({ created: false, id: first.id });
    expect(await database!.transaction.count({ where: { salaryId: monthly.id } })).toBe(1);
    expect(sumMoney(overview.salaryOccurrences.filter(({ salaryId }) => salaryId === fortnightlySalary.id).map(({ amount }) => amount)).toString()).toBe("4000");
    expect(overview.coupleTotal.income.toString()).toBe("4000");
    expect(overview.coupleTotal.available.toString()).toBe("4000");
  });

  test("edição de salário recebido cria versão futura e preserva meses antigos", async () => {
    const fixture = await createFixture("salary-version");
    const salary = await database!.salary.create({
      data: {
        accountId: fixture.account.id,
        amount: 4000,
        categoryId: fixture.incomeCategory.id,
        description: "Salário",
        paymentDay: 15,
        personEditorId: fixture.allan.id,
        startMonth: august,
        workspaceId: fixture.workspace.id,
      },
    });
    await database!.$transaction((transaction) => confirmSalaryOccurrence(transaction, fixture.context, salary.id, new Date("2026-08-15T00:00:00.000Z")));
    const version = await database!.$transaction((transaction) => updateSalaryRule(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money(5000),
      categoryId: fixture.incomeCategory.id,
      description: "Salário reajustado",
      frequency: "MONTHLY",
      notes: null,
      paymentDay: 20,
      personEditorId: fixture.allan.id,
      salaryId: salary.id,
      selectedMonth: august,
      startMonth: august,
    }));
    const oldRule = await database!.salary.findUniqueOrThrow({ where: { id: salary.id } });
    const newRule = await database!.salary.findUniqueOrThrow({ where: { id: version.id } });
    const augustOverview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    const septemberOverview = await getFinanceOverview(fixture.workspace.id, "2026-09");

    expect(version.result).toBe("VERSIONED");
    expect(oldRule).toMatchObject({ active: false, amount: expect.objectContaining({}) });
    expect(oldRule.archivedAt?.toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(newRule).toMatchObject({ active: true, paymentDay: 20 });
    expect(newRule.startMonth.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(augustOverview.salaryOccurrences.map(({ amount }) => amount.toString())).toEqual(["4000"]);
    expect(septemberOverview.salaryOccurrences.map(({ amount }) => amount.toString())).toEqual(["5000"]);

    await database!.$transaction((transaction) => confirmSalaryOccurrence(transaction, fixture.context, newRule.id, new Date("2026-09-20T00:00:00.000Z")));
    await database!.$transaction((transaction) => archiveOrDeleteSalary(transaction, fixture.context, newRule.id, september));
    expect((await getFinanceOverview(fixture.workspace.id, "2026-09")).salaryOccurrences).toHaveLength(1);
    expect((await getFinanceOverview(fixture.workspace.id, "2026-10")).salaryOccurrences).toHaveLength(0);
  });

  test("gasto fixo possui status por ocorrência, versão futura, encerramento e estorno explícito", async () => {
    const fixture = await createFixture("fixed-expense");
    const fixedExpense = await database!.fixedExpense.create({
      data: {
        accountId: fixture.account.id,
        amount: 1000,
        categoryId: fixture.expenseCategory.id,
        description: "Aluguel",
        dueDay: 10,
        personEditorId: fixture.allan.id,
        startMonth: august,
        workspaceId: fixture.workspace.id,
      },
    });
    const augustDueDate = new Date("2026-08-10T00:00:00.000Z");
    const payment = await database!.$transaction((transaction) => payFixedExpenseOccurrence(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money(1000),
      dueDate: augustDueDate,
      fixedExpenseId: fixedExpense.id,
      paidAt: augustDueDate,
    }));

    expect((await getFinanceOverview(fixture.workspace.id, "2026-08")).fixedExpenseOccurrences[0]?.status).toBe("SETTLED");
    expect((await getFinanceOverview(fixture.workspace.id, "2026-09")).fixedExpenseOccurrences[0]?.status).toBe("PENDING");

    const version = await database!.$transaction((transaction) => updateFixedExpenseRule(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money(1200),
      categoryId: fixture.expenseCategory.id,
      description: "Aluguel reajustado",
      dueDay: 15,
      fixedExpenseId: fixedExpense.id,
      notes: null,
      personEditorId: fixture.allan.id,
      selectedMonth: august,
      startMonth: august,
    }));
    expect(version.result).toBe("VERSIONED");
    expect((await getFinanceOverview(fixture.workspace.id, "2026-08")).fixedExpenseOccurrences[0]?.amount.toString()).toBe("1000");
    expect((await getFinanceOverview(fixture.workspace.id, "2026-09")).fixedExpenseOccurrences[0]).toMatchObject({ status: "PENDING" });
    expect((await getFinanceOverview(fixture.workspace.id, "2026-09")).fixedExpenseOccurrences[0]?.amount.toString()).toBe("1200");

    await database!.$transaction((transaction) => undoFixedExpensePayment(transaction, fixture.context, payment.id));
    const augustAfterUndo = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect(augustAfterUndo.fixedExpenseOccurrences[0]?.status).toBe("PENDING");
    expect(augustAfterUndo.coupleTotal.available.toString()).toBe("0");

    const septemberDueDate = new Date("2026-09-15T00:00:00.000Z");
    await database!.$transaction((transaction) => payFixedExpenseOccurrence(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money(1200),
      dueDate: septemberDueDate,
      fixedExpenseId: version.id,
      paidAt: septemberDueDate,
    }));
    await database!.$transaction((transaction) => archiveOrDeleteFixedExpense(transaction, fixture.context, version.id, september));
    expect((await getFinanceOverview(fixture.workspace.id, "2026-09")).fixedExpenseOccurrences[0]?.status).toBe("SETTLED");
    expect((await getFinanceOverview(fixture.workspace.id, "2026-10")).fixedExpenseOccurrences).toHaveLength(0);
  });

  test("dívidas mensais e quinzenais fecham centavos, compartilhamento, pagamento e estorno", async () => {
    const fixture = await createFixture("debts");
    const monthly = await createDebt(fixture, "MONTHLY", "100.00", 3, true);
    const fortnightly = await createDebt(fixture, "FORTNIGHTLY", "90.00", 3, false);

    await database!.$transaction((transaction) => assertDebtIntegrity(transaction, fixture.workspace.id, monthly.debt.id));
    expect(monthly.installments.map(({ amount }) => amount.toString())).toEqual(["33.34", "33.33", "33.33"]);
    expect(fortnightly.installments.map(({ dueDate }) => dueDate.toISOString().slice(0, 10))).toEqual(["2026-08-15", "2026-08-30", "2026-09-15"]);
    const shares = await database!.debtInstallmentShare.findMany({ where: { installmentId: monthly.installments[0]!.id } });
    expect(sumMoney(shares.map(({ amount }) => amount)).toString()).toBe("33.34");

    await database!.$transaction((transaction) => payDebtInstallment(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money("33.34"),
      installmentId: monthly.installments[0]!.id,
      notes: null,
      paidAt: new Date("2026-08-10T00:00:00.000Z"),
    }));
    await expect(database!.$transaction((transaction) => assertDebtStructureMutable(transaction, fixture.workspace.id, monthly.debt.id)))
      .rejects.toThrow("estrutura");
    let overview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect(overview.debtInstallments.filter(({ debt }) => debt.id === monthly.debt.id).some(({ status }) => status === "PAID")).toBe(true);
    expect(overview.coupleTotal.available.toString()).toBe("-33.34");

    await database!.$transaction((transaction) => undoDebtInstallmentPayment(transaction, fixture.context, monthly.installments[0]!.id));
    overview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect((await database!.debtInstallment.findUniqueOrThrow({ where: { id: monthly.installments[0]!.id } })).status).toBe("PENDING");
    expect(overview.coupleTotal.available.toString()).toBe("0");

    const canceled = await database!.$transaction((transaction) => cancelDebtFutureInstallments(
      transaction,
      fixture.context,
      monthly.debt.id,
      new Date("2026-09-01T00:00:00.000Z"),
    ));
    expect(canceled).toHaveLength(2);
    await database!.$transaction((transaction) => assertDebtIntegrity(transaction, fixture.workspace.id, monthly.debt.id));
  });

  test("encerrar dívida paga preserva parcela, transação e dashboard histórico", async () => {
    const fixture = await createFixture("debt-archive");
    const { debt, installments } = await createDebt(fixture, "MONTHLY", "300.00", 1);
    await database!.$transaction((transaction) => payDebtInstallment(transaction, fixture.context, {
      accountId: fixture.account.id,
      amount: money(300),
      installmentId: installments[0]!.id,
      notes: null,
      paidAt: new Date("2026-08-10T00:00:00.000Z"),
    }));
    expect(await database!.$transaction((transaction) => archiveOrDeleteDebt(transaction, fixture.context, debt.id, new Date("2026-08-18T00:00:00.000Z")))).toBe("ARCHIVED");

    const overview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect(overview.debtInstallments[0]?.status).toBe("PAID");
    expect(await database!.transaction.count({ where: { debtInstallmentId: installments[0]!.id } })).toBe(1);
    expect(overview.coupleTotal.expenses.toString()).toBe("300");
    expect(overview.coupleTotal.available.toString()).toBe("-300");
  });
});
