import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, test } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { assertCreditCardPurchaseHasNoPayments, reconcileCreditCardInvoice } from "@/modules/finance/application/credit-card-reconciliation";
import { getFinanceOverview } from "@/modules/finance/application/finance-queries";

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = databaseUrl ? describe.sequential : describe.skip;
const database = databaseUrl ? new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) : null;
const month = new Date("2026-08-01T00:00:00.000Z");
const dueDate = new Date("2026-08-10T00:00:00.000Z");

async function createFixture(amounts: number[], withShares = false) {
  const workspace = await database!.workspace.create({
    data: { name: "Cartões", slug: `cards-${randomUUID()}` },
  });
  const allan = await database!.editor.create({
    data: { displayName: "Allan", workspaceId: workspace.id },
  });
  const mayara = await database!.editor.create({
    data: { displayName: "Mayara", workspaceId: workspace.id },
  });
  const account = await database!.financialAccount.create({
    data: { initialBalance: 1000, name: "Conta Allan", personEditorId: allan.id, type: "CHECKING", workspaceId: workspace.id },
  });
  const card = await database!.creditCard.create({
    data: { closingDay: 5, dueDay: 10, limit: 1000, name: "Cartão Allan", paymentAccountId: account.id, personEditorId: allan.id, workspaceId: workspace.id },
  });
  const invoice = await database!.creditCardInvoice.create({
    data: { amount: 0, cardId: card.id, dueDate, month, personEditorId: allan.id, workspaceId: workspace.id },
  });
  const installments = [];

  for (const [index, amount] of amounts.entries()) {
    const purchase = await database!.creditCardPurchase.create({
      data: {
        cardId: card.id,
        description: `Compra ${index + 1}`,
        firstDueDate: dueDate,
        installmentCount: 1,
        personEditorId: allan.id,
        purchaseDate: month,
        totalAmount: amount,
        workspaceId: workspace.id,
      },
    });
    const installment = await database!.creditCardInstallment.create({
      data: { amount, cardId: card.id, dueMonth: month, invoiceId: invoice.id, number: 1, personEditorId: allan.id, purchaseId: purchase.id, workspaceId: workspace.id },
    });
    await database!.transaction.create({
      data: {
        affectsBalance: false,
        amount,
        competenceDate: month,
        creditCardInstallmentId: installment.id,
        description: `Compra ${index + 1} 1/1`,
        dueDate,
        personEditorId: allan.id,
        status: "PENDING",
        type: "EXPENSE",
        workspaceId: workspace.id,
      },
    });
    if (withShares) {
      const allanAmount = Math.ceil(amount * 100 * 0.6) / 100;
      await database!.creditCardInstallmentShare.createMany({
        data: [
          { amount: allanAmount, installmentId: installment.id, personEditorId: allan.id, workspaceId: workspace.id },
          { amount: amount - allanAmount, installmentId: installment.id, personEditorId: mayara.id, workspaceId: workspace.id },
        ],
      });
    }
    installments.push(installment);
  }

  await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, invoice.id));
  return { account, allan, card, installments, invoice, mayara, workspace };
}

async function createPayment(fixture: Awaited<ReturnType<typeof createFixture>>, amount: number, installmentId?: string) {
  return database!.creditCardInvoicePayment.create({
    data: {
      accountId: fixture.account.id,
      amount,
      creditCardInstallmentId: installmentId,
      invoiceId: fixture.invoice.id,
      paidAt: new Date("2026-08-12T00:00:00.000Z"),
      personEditorId: fixture.allan.id,
      workspaceId: fixture.workspace.id,
    },
  });
}

async function readState(invoiceId: string) {
  return database!.creditCardInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { installments: { include: { shares: true, transaction: true }, orderBy: { createdAt: "asc" } } },
  });
}

integrationTest("reconciliação de cartão com PostgreSQL real", () => {
  afterAll(async () => {
    await database?.$disconnect();
  });

  test("OPEN -> pagamento integral -> PAID -> edição parcial -> OPEN -> exclusão -> OPEN", async () => {
    const fixture = await createFixture([50, 50], true);
    const payment = await createPayment(fixture, 100);

    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    let state = await readState(fixture.invoice.id);
    expect(state).toMatchObject({ amount: expect.objectContaining({}), paidAmount: expect.objectContaining({}), status: "PAID" });
    expect(state.amount.toString()).toBe("100");
    expect(state.paidAmount.toString()).toBe("100");
    expect(state.installments.map(({ status }) => status)).toEqual(["PAID", "PAID"]);
    expect(state.installments.flatMap(({ shares }) => shares).every(({ status }) => status === "PAID")).toBe(true);
    expect(state.installments.every(({ transaction }) => transaction?.status === "SETTLED")).toBe(true);

    await database!.creditCardInvoicePayment.update({ where: { id: payment.id }, data: { amount: 40 } });
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    state = await readState(fixture.invoice.id);
    expect(state.status).toBe("OPEN");
    expect(state.paidAmount.toString()).toBe("40");
    expect(state.installments.map(({ status }) => status)).toEqual(["OPEN", "OPEN"]);
    expect(state.installments.every(({ transaction }) => transaction?.status === "PENDING" && transaction.settledAt === null)).toBe(true);

    await database!.creditCardInvoicePayment.update({ where: { id: payment.id }, data: { amount: 100 } });
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    expect((await readState(fixture.invoice.id)).status).toBe("PAID");

    await database!.creditCardInvoicePayment.delete({ where: { id: payment.id } });
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    state = await readState(fixture.invoice.id);
    expect(state.status).toBe("OPEN");
    expect(state.paidAmount.toString()).toBe("0");
    expect(state.installments.map(({ status }) => status)).toEqual(["OPEN", "OPEN"]);
  });

  test("pagamento e estorno de parcela afetam somente a parcela vinculada", async () => {
    const fixture = await createFixture([60, 40]);
    const payment = await createPayment(fixture, 40, fixture.installments[1]!.id);

    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    expect((await readState(fixture.invoice.id)).installments.map(({ status }) => status)).toEqual(["OPEN", "PAID"]);

    await database!.creditCardInvoicePayment.delete({ where: { id: payment.id } });
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    expect((await readState(fixture.invoice.id)).installments.map(({ status }) => status)).toEqual(["OPEN", "OPEN"]);
  });

  test("parcela vencida sem pagamento continua aberta e o pagamento não duplica a despesa", async () => {
    const fixture = await createFixture([100]);
    let overview = await getFinanceOverview(fixture.workspace.id, "2026-08");

    expect(overview.cardPurchases[0]?.installments[0]).toMatchObject({ isOverdue: true, status: "OPEN" });
    expect(overview.coupleTotal.expenses.toString()).toBe("100");
    expect(overview.coupleTotal.available.toString()).toBe("1000");
    expect(overview.cards[0]?.limitAvailable.toString()).toBe("900");

    await createPayment(fixture, 40);
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));
    overview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect(overview.coupleTotal.expenses.toString()).toBe("100");
    expect(overview.coupleTotal.available.toString()).toBe("960");
    expect(overview.cards[0]?.limitAvailable.toString()).toBe("940");
  });

  test("responsabilidades de Allan e Mayara fecham exatamente no total do casal", async () => {
    const fixture = await createFixture([33.34, 33.33, 33.33], true);
    const overview = await getFinanceOverview(fixture.workspace.id, "2026-08");

    expect(overview.cardCoupleTotal.total.toString()).toBe("100");
    expect(overview.cardTotalsByPerson.find(({ id }) => id === fixture.allan.id)?.total.toString()).toBe("60.01");
    expect(overview.cardTotalsByPerson.find(({ id }) => id === fixture.mayara.id)?.total.toString()).toBe("39.99");
    expect((await readState(fixture.invoice.id)).amount.toString()).toBe("100");
  });

  test("cancelamento sem pagamento preserva o histórico e libera o limite", async () => {
    const fixture = await createFixture([100]);
    await database!.creditCardPurchase.update({
      where: { id: fixture.installments[0]!.purchaseId },
      data: { canceledAt: new Date("2026-08-17T00:00:00.000Z") },
    });
    await database!.creditCardInstallment.update({
      where: { id: fixture.installments[0]!.id },
      data: { status: "CANCELED" },
    });
    await database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id));

    const state = await readState(fixture.invoice.id);
    const overview = await getFinanceOverview(fixture.workspace.id, "2026-08");
    expect(state.amount.toString()).toBe("0");
    expect(state.installments[0]).toMatchObject({ status: "CANCELED", transaction: { status: "CANCELED" } });
    expect(overview.cards[0]?.limitAvailable.toString()).toBe("1000");
    expect(await database!.creditCardPurchase.findUnique({ where: { id: fixture.installments[0]!.purchaseId } })).not.toBeNull();
  });

  test("rejeita pagamento acima da fatura sem mascarar a divergência", async () => {
    const fixture = await createFixture([100]);
    await createPayment(fixture, 100.01);

    await expect(database!.$transaction((transaction) => reconcileCreditCardInvoice(transaction, fixture.invoice.id)))
      .rejects.toThrow("Pagamentos excedem o valor ativo da fatura.");
  });

  test("bloqueia alteração ou exclusão estrutural sem apagar pagamentos", async () => {
    const fixture = await createFixture([100]);
    const payment = await createPayment(fixture, 10);

    await expect(database!.$transaction((transaction) => assertCreditCardPurchaseHasNoPayments(
      transaction,
      fixture.workspace.id,
      [fixture.installments[0]!.id],
      [fixture.invoice.id],
    ))).rejects.toThrow("compra com pagamentos");
    expect(await database!.creditCardInvoicePayment.findUnique({ where: { id: payment.id } })).not.toBeNull();
  });
});
