import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, test } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import {
  assertAccountForPerson,
  assertOptimisticUpdate,
  createBalanceAdjustment,
  createSavingsGoalMovement,
  createTransfer,
  deleteSavingsGoalMovement,
  getTransactionalAccountBalance,
  updateSavingsGoalMovement,
} from "@/modules/finance/application/financial-consistency";
import { getFinanceOverview } from "@/modules/finance/application/finance-queries";
import { money, sumMoney } from "@/modules/shared/domain/money";

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = databaseUrl ? describe.sequential : describe.skip;
const database = databaseUrl ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) : null;
const movementDate = new Date("2026-08-18T00:00:00.000Z");

async function createFixture(label: string) {
  const workspace = await database!.workspace.create({ data: { name: label, slug: `${label}-${randomUUID()}` } });
  const allan = await database!.editor.create({ data: { displayName: "Allan", workspaceId: workspace.id } });
  const mayara = await database!.editor.create({ data: { displayName: "Mayara", workspaceId: workspace.id } });
  const context = { editorId: allan.id, workspaceId: workspace.id };

  return { allan, context, mayara, workspace };
}

async function createAccount(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  name: string,
  personEditorId: string,
  initialBalance: number,
  type: "CHECKING" | "INVESTMENT" = "CHECKING",
) {
  return database!.financialAccount.create({
    data: { initialBalance, name, personEditorId, type, workspaceId: fixture.workspace.id },
  });
}

integrationTest("consistência transacional financeira com PostgreSQL real", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  test("somente um de dois updates com a mesma versão é aceito", async () => {
    const fixture = await createFixture("optimistic-lock");
    const account = await createAccount(fixture, "Conta", fixture.allan.id, 100);
    const update = (name: string) => database!.$transaction(async (transaction) => {
      const result = await transaction.financialAccount.updateMany({
        where: { id: account.id, version: account.version, workspaceId: fixture.workspace.id },
        data: { name, version: { increment: 1 } },
      });
      assertOptimisticUpdate(result.count);
    });
    const results = await Promise.allSettled([update("Dispositivo A"), update("Dispositivo B")]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect((await database!.financialAccount.findUniqueOrThrow({ where: { id: account.id } })).version).toBe(2);
  });

  test("dois ajustes concorrentes usam snapshots serializados e não acumulam diferenças", async () => {
    const fixture = await createFixture("balance-adjustment-race");
    const account = await createAccount(fixture, "Conta ajustável", fixture.allan.id, 100);
    const adjust = () => database!.$transaction((transaction) => createBalanceAdjustment(transaction, fixture.context, {
      accountId: account.id,
      effectiveAt: movementDate,
      notes: null,
      targetBalance: money(150),
    }));

    await Promise.all([adjust(), adjust()]);
    const adjustments = await database!.balanceAdjustment.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "asc" } });
    const balance = await database!.$transaction((transaction) => getTransactionalAccountBalance(transaction, fixture.workspace.id, account.id));

    expect(adjustments.map(({ difference }) => difference.toFixed(2)).sort()).toEqual(["0.00", "50.00"]);
    expect(balance.toFixed(2)).toBe("150.00");
  });

  test("duas transferências concorrentes não deixam a origem negativa e preservam o total do casal", async () => {
    const fixture = await createFixture("transfer-race");
    const source = await createAccount(fixture, "Allan", fixture.allan.id, 100);
    const destinationA = await createAccount(fixture, "Mayara A", fixture.mayara.id, 0);
    const destinationB = await createAccount(fixture, "Mayara B", fixture.mayara.id, 0);
    const transfer = (destinationAccountId: string) => database!.$transaction((transaction) => createTransfer(transaction, fixture.context, {
      amount: money(80),
      destinationAccountId,
      notes: null,
      sourceAccountId: source.id,
      transferDate: movementDate,
    }));
    const results = await Promise.allSettled([transfer(destinationA.id), transfer(destinationB.id)]);
    const balances = await database!.$transaction(async (transaction) => Promise.all(
      [source.id, destinationA.id, destinationB.id].map((id) => getTransactionalAccountBalance(transaction, fixture.workspace.id, id)),
    ));

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(balances[0]!.toFixed(2)).toBe("20.00");
    expect(sumMoney(balances).toFixed(2)).toBe("100.00");
  });

  test("duas retiradas concorrentes do mesmo cofrinho preservam saldo não negativo", async () => {
    const fixture = await createFixture("goal-race");
    const account = await createAccount(fixture, "Reserva", fixture.allan.id, 100);
    const goal = await database!.savingsGoal.create({
      data: { accountId: account.id, name: "Emergência", personEditorId: fixture.allan.id, targetAmount: 100, workspaceId: fixture.workspace.id },
    });
    await database!.$transaction((transaction) => createSavingsGoalMovement(transaction, fixture.context, {
      amount: money(100), goalId: goal.id, movementDate, notes: null, type: "DEPOSIT",
    }));
    const withdraw = () => database!.$transaction((transaction) => createSavingsGoalMovement(transaction, fixture.context, {
      amount: money(80), goalId: goal.id, movementDate, notes: null, type: "WITHDRAWAL",
    }));
    const results = await Promise.allSettled([withdraw(), withdraw()]);
    const movements = await database!.savingsGoalMovement.findMany({ where: { goalId: goal.id } });
    const balance = sumMoney(movements.map(({ amount, type }) => type === "DEPOSIT" ? amount : money(amount).negated()));

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(balance.toFixed(2)).toBe("20.00");
  });

  test("editar ou excluir depósito não pode tornar o cofrinho negativo", async () => {
    const fixture = await createFixture("goal-final-state");
    const goal = await database!.savingsGoal.create({
      data: { name: "Sem conta", personEditorId: fixture.allan.id, targetAmount: 100, workspaceId: fixture.workspace.id },
    });
    const deposit = await database!.$transaction((transaction) => createSavingsGoalMovement(transaction, fixture.context, {
      amount: money(100), goalId: goal.id, movementDate, notes: null, type: "DEPOSIT",
    }));
    await database!.$transaction((transaction) => createSavingsGoalMovement(transaction, fixture.context, {
      amount: money(40), goalId: goal.id, movementDate, notes: null, type: "WITHDRAWAL",
    }));

    await expect(database!.$transaction((transaction) => updateSavingsGoalMovement(transaction, fixture.context, {
      amount: money(30), movementDate, movementId: deposit.id, notes: null, type: "DEPOSIT",
    }))).rejects.toThrow("saldo negativo");
    await expect(database!.$transaction((transaction) => deleteSavingsGoalMovement(transaction, fixture.context, deposit.id))).rejects.toThrow("saldo negativo");
  });

  test("reserva não pode exceder o saldo da conta e pessoa-conta é validada no backend e no banco", async () => {
    const fixture = await createFixture("account-reservation");
    const account = await createAccount(fixture, "Allan", fixture.allan.id, 100);
    const mayaraAccount = await createAccount(fixture, "Mayara", fixture.mayara.id, 100);
    const goal = await database!.savingsGoal.create({
      data: { accountId: account.id, name: "Meta", personEditorId: fixture.allan.id, targetAmount: 200, workspaceId: fixture.workspace.id },
    });

    await expect(database!.$transaction((transaction) => assertAccountForPerson(
      transaction, fixture.workspace.id, fixture.allan.id, mayaraAccount.id, true,
    ))).rejects.toThrow("Conta invalida");
    await expect(database!.$transaction((transaction) => createSavingsGoalMovement(transaction, fixture.context, {
      amount: money(101), goalId: goal.id, movementDate, notes: null, type: "DEPOSIT",
    }))).rejects.toThrow("saldo livre");
    await expect(database!.savingsGoal.create({
      data: { accountId: mayaraAccount.id, name: "Inválido", personEditorId: fixture.allan.id, targetAmount: 10, workspaceId: fixture.workspace.id },
    })).rejects.toThrow();

    const foreignFixture = await createFixture("foreign-workspace");
    const foreignCategory = await database!.category.create({
      data: { kind: "EXPENSE", name: "Categoria externa", workspaceId: foreignFixture.workspace.id },
    });
    await expect(database!.transaction.create({
      data: {
        accountId: account.id,
        amount: 10,
        categoryId: foreignCategory.id,
        competenceDate: movementDate,
        description: "Referência entre workspaces",
        personEditorId: fixture.allan.id,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: fixture.workspace.id,
      },
    })).rejects.toThrow();
  });

  test("conta e registro vinculados não duplicam o valor investido no patrimônio", async () => {
    const fixture = await createFixture("investment-source");
    const account = await createAccount(fixture, "Corretora", fixture.allan.id, 10_000, "INVESTMENT");
    await database!.investment.create({
      data: {
        accountId: account.id,
        amount: 10_000,
        name: "Carteira",
        personEditorId: fixture.allan.id,
        referenceDate: movementDate,
        workspaceId: fixture.workspace.id,
      },
    });
    const overview = await getFinanceOverview(fixture.workspace.id, "2026-08");

    expect(overview.coupleTotal.available.toFixed(2)).toBe("0.00");
    expect(overview.coupleTotal.investments.toFixed(2)).toBe("10000.00");
    expect(overview.coupleTotal.wealth.toFixed(2)).toBe("10000.00");
  });
});
