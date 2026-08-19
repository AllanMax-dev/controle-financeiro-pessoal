"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  buildInstallmentPlan,
  clampDayInMonth,
  dateFromInput,
  installmentDueDate,
  monthStartFromInput,
} from "@/modules/finance/domain/finance-calculations";
import { getAccountCurrentBalance } from "@/modules/finance/application/finance-queries";
import { money, parseMoneyInput, sumMoney } from "@/modules/shared/domain/money";

function text(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : fallback;
}

function optionalText(formData: FormData, name: string) {
  return text(formData, name) || null;
}

function integer(formData: FormData, name: string, min: number, max: number) {
  const value = Number(text(formData, name));

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error("Valor numérico inválido.");
  }

  return value;
}

function returnTo(formData: FormData, fallback: string) {
  const target = text(formData, "returnTo", fallback);

  return target.startsWith("/") && !target.startsWith("//") ? target : fallback;
}

async function assertPerson(workspaceId: string, personEditorId: string) {
  const person = await getDatabase().editor.findFirst({
    where: { active: true, id: personEditorId, workspaceId },
    select: { id: true },
  });

  if (!person) {
    throw new Error("Pessoa inválida.");
  }
}

async function audit(workspaceId: string, editorId: string, entityType: string, entityId: string | null, action: string) {
  await getDatabase().auditLog.create({
    data: {
      action,
      editorId,
      entityId,
      entityType,
      workspaceId,
    },
  });
}

function refreshAndRedirect(target: string): never {
  revalidatePath("/");
  redirect(target as Route);
}

export async function createCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const target = returnTo(formData, "/categorias");
  const name = text(formData, "name");
  const kind = text(formData, "kind") === "INCOME" ? "INCOME" : "EXPENSE";

  if (name.length < 2) {
    throw new Error("Informe a categoria.");
  }

  const category = await getDatabase().category.create({
    data: {
      color: optionalText(formData, "color") ?? "#d73a12",
      createdByEditorId: access.editorId,
      kind,
      name,
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "Category", category.id, "create");
  refreshAndRedirect(target);
}

export async function createAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const target = returnTo(formData, "/bancos");
  const account = await getDatabase().financialAccount.create({
    data: {
      color: optionalText(formData, "color") ?? "#d73a12",
      createdByEditorId: access.editorId,
      initialBalance: parseMoneyInput(text(formData, "initialBalance", "0")),
      institution: optionalText(formData, "institution"),
      name: text(formData, "name"),
      personEditorId,
      type: text(formData, "type") as "CHECKING" | "SAVINGS" | "CASH" | "DIGITAL" | "INVESTMENT" | "OTHER",
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "FinancialAccount", account.id, "create");
  refreshAndRedirect(target);
}

export async function createTransactionAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const type = text(formData, "type") === "INCOME" ? "INCOME" : "EXPENSE";
  const status = text(formData, "status") === "SETTLED" ? "SETTLED" : "PENDING";
  const target = returnTo(formData, type === "INCOME" ? "/recebimentos" : "/gastos-variaveis");
  const transaction = await getDatabase().transaction.create({
    data: {
      accountId: optionalText(formData, "accountId"),
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId: optionalText(formData, "categoryId"),
      competenceDate: dateFromInput(text(formData, "date")),
      createdByEditorId: access.editorId,
      description: text(formData, "description"),
      dueDate: optionalText(formData, "dueDate") ? dateFromInput(text(formData, "dueDate")) : null,
      notes: optionalText(formData, "notes"),
      personEditorId,
      settledAt: status === "SETTLED" ? dateFromInput(text(formData, "date")) : null,
      status,
      type,
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "Transaction", transaction.id, "create");
  refreshAndRedirect(target);
}

export async function createFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const fixedExpense = await getDatabase().fixedExpense.create({
    data: {
      accountId: optionalText(formData, "accountId"),
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId: optionalText(formData, "categoryId"),
      createdByEditorId: access.editorId,
      description: text(formData, "description"),
      dueDay: integer(formData, "dueDay", 1, 31),
      notes: optionalText(formData, "notes"),
      personEditorId,
      startMonth: monthStartFromInput(text(formData, "startMonth")),
      status: text(formData, "status") === "SETTLED" ? "SETTLED" : "PENDING",
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "FixedExpense", fixedExpense.id, "create");
  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function createSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const salary = await getDatabase().salary.create({
    data: {
      accountId: optionalText(formData, "accountId"),
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId: optionalText(formData, "categoryId"),
      createdByEditorId: access.editorId,
      description: text(formData, "description"),
      frequency: text(formData, "frequency") === "FORTNIGHTLY" ? "FORTNIGHTLY" : "MONTHLY",
      notes: optionalText(formData, "notes"),
      paymentDay: integer(formData, "paymentDay", 1, 31),
      personEditorId,
      startMonth: monthStartFromInput(text(formData, "startMonth")),
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "Salary", salary.id, "create");
  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function createDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 240);
  const firstDueDate = dateFromInput(text(formData, "firstDueDate"));
  const frequency = text(formData, "frequency") === "FORTNIGHTLY" ? "FORTNIGHTLY" : "MONTHLY";
  const debtId = randomUUID();

  await getDatabase().$transaction(async (transaction) => {
    await transaction.debt.create({
      data: {
        categoryId: optionalText(formData, "categoryId"),
        createdByEditorId: access.editorId,
        description: text(formData, "description"),
        firstDueDate,
        frequency,
        id: debtId,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId,
        startDate: dateFromInput(text(formData, "startDate")),
        totalAmount,
        workspaceId: access.workspaceId,
      },
    });
    await transaction.debtInstallment.createMany({
      data: buildInstallmentPlan(totalAmount, installmentCount).map((installment, index) => ({
        amount: installment.amount,
        debtId,
        dueDate: installmentDueDate(firstDueDate, index, frequency),
        number: installment.number,
        personEditorId,
        workspaceId: access.workspaceId,
      })),
    });
  });

  await audit(access.workspaceId, access.editorId, "Debt", debtId, "create");
  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function createCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const card = await getDatabase().creditCard.create({
    data: {
      closingDay: integer(formData, "closingDay", 1, 31),
      color: optionalText(formData, "color") ?? "#d73a12",
      createdByEditorId: access.editorId,
      dueDay: integer(formData, "dueDay", 1, 31),
      institution: optionalText(formData, "institution"),
      limit: parseMoneyInput(text(formData, "limit")),
      name: text(formData, "name"),
      paymentAccountId: optionalText(formData, "paymentAccountId"),
      personEditorId,
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "CreditCard", card.id, "create");
  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function createCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const card = await getDatabase().creditCard.findFirstOrThrow({
    where: { id: text(formData, "cardId"), workspaceId: access.workspaceId },
    select: { dueDay: true, id: true, personEditorId: true },
  });
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 120);
  const purchaseDate = dateFromInput(text(formData, "purchaseDate"));
  const purchaseId = randomUUID();

  await getDatabase().$transaction(async (transaction) => {
    await transaction.creditCardPurchase.create({
      data: {
        cardId: card.id,
        categoryId: optionalText(formData, "categoryId"),
        createdByEditorId: access.editorId,
        description: text(formData, "description"),
        id: purchaseId,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId: card.personEditorId,
        purchaseDate,
        totalAmount,
        workspaceId: access.workspaceId,
      },
    });

    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const dueMonth = new Date(Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth() + installment.number - 1, 1));
      const dueDate = clampDayInMonth(dueMonth, card.dueDay);
      const invoice = await transaction.creditCardInvoice.upsert({
        where: { cardId_month: { cardId: card.id, month: dueMonth } },
        update: { amount: { increment: installment.amount } },
        create: {
          amount: installment.amount,
          cardId: card.id,
          dueDate,
          month: dueMonth,
          personEditorId: card.personEditorId,
          workspaceId: access.workspaceId,
        },
      });

      await transaction.creditCardInstallment.create({
        data: {
          amount: installment.amount,
          cardId: card.id,
          categoryId: optionalText(formData, "categoryId"),
          dueMonth,
          invoiceId: invoice.id,
          number: installment.number,
          personEditorId: card.personEditorId,
          purchaseId,
          workspaceId: access.workspaceId,
        },
      });
    }
  });

  await audit(access.workspaceId, access.editorId, "CreditCardPurchase", purchaseId, "create");
  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function payCreditCardInvoiceAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const amount = parseMoneyInput(text(formData, "amount"));
  const invoiceId = text(formData, "invoiceId");
  const paidAt = dateFromInput(text(formData, "paidAt"));

  await getDatabase().$transaction(async (transaction) => {
    const invoice = await transaction.creditCardInvoice.findFirstOrThrow({
      where: { id: invoiceId, workspaceId: access.workspaceId },
      include: { card: true },
    });
    const accountId = text(formData, "accountId") || invoice.card.paymentAccountId;

    if (!accountId) {
      throw new Error("Informe a conta de pagamento da fatura.");
    }

    await transaction.financialAccount.findFirstOrThrow({
      where: { active: true, id: accountId, workspaceId: access.workspaceId },
      select: { id: true },
    });

    const nextPaidAmount = money(invoice.paidAmount.plus(amount));

    if (nextPaidAmount.greaterThan(invoice.amount)) {
      throw new Error("Pagamento maior que o valor pendente da fatura.");
    }

    await transaction.creditCardInvoicePayment.create({
      data: {
        accountId,
        amount,
        createdByEditorId: access.editorId,
        invoiceId: invoice.id,
        notes: optionalText(formData, "notes"),
        paidAt,
        personEditorId: invoice.personEditorId,
        workspaceId: access.workspaceId,
      },
    });
    await transaction.creditCardInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: nextPaidAmount,
        status: nextPaidAmount.greaterThanOrEqualTo(invoice.amount) ? "PAID" : invoice.status,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: "pay",
        editorId: access.editorId,
        entityId: invoice.id,
        entityType: "CreditCardInvoice",
        workspaceId: access.workspaceId,
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function createSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const goal = await getDatabase().savingsGoal.create({
    data: {
      accountId: optionalText(formData, "accountId"),
      createdByEditorId: access.editorId,
      deadline: optionalText(formData, "deadline") ? dateFromInput(text(formData, "deadline")) : null,
      description: optionalText(formData, "description"),
      name: text(formData, "name"),
      personEditorId,
      targetAmount: parseMoneyInput(text(formData, "targetAmount")),
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "SavingsGoal", goal.id, "create");
  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function createSavingsGoalMovementAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const amount = parseMoneyInput(text(formData, "amount"));
  const goalId = text(formData, "goalId");
  const movementDate = dateFromInput(text(formData, "movementDate"));
  const type = text(formData, "type") === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT";

  await getDatabase().$transaction(async (transaction) => {
    const goal = await transaction.savingsGoal.findFirstOrThrow({
      where: { id: goalId, status: "ACTIVE", workspaceId: access.workspaceId },
      include: { movements: { select: { amount: true, type: true } } },
    });
    const currentAmount = sumMoney(
      goal.movements.map((movement) =>
        movement.type === "DEPOSIT" ? movement.amount : money(movement.amount).negated(),
      ),
    );

    if (type === "WITHDRAWAL" && money(currentAmount.minus(amount)).isNegative()) {
      throw new Error("Retirada maior que o valor reservado no cofrinho.");
    }

    await transaction.savingsGoalMovement.create({
      data: {
        accountId: goal.accountId,
        amount,
        createdByEditorId: access.editorId,
        goalId: goal.id,
        movementDate,
        notes: optionalText(formData, "notes"),
        personEditorId: goal.personEditorId,
        type,
        workspaceId: access.workspaceId,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: type === "DEPOSIT" ? "deposit" : "withdraw",
        editorId: access.editorId,
        entityId: goal.id,
        entityType: "SavingsGoal",
        workspaceId: access.workspaceId,
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function createInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const investment = await getDatabase().investment.create({
    data: {
      accountId: optionalText(formData, "accountId"),
      amount: parseMoneyInput(text(formData, "amount")),
      createdByEditorId: access.editorId,
      institution: optionalText(formData, "institution"),
      name: text(formData, "name"),
      notes: optionalText(formData, "notes"),
      personEditorId,
      referenceDate: dateFromInput(text(formData, "referenceDate")),
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "Investment", investment.id, "create");
  refreshAndRedirect(returnTo(formData, "/investimentos"));
}

export async function createTransferAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const sourceAccountId = text(formData, "sourceAccountId");
  const destinationAccountId = text(formData, "destinationAccountId");

  if (sourceAccountId === destinationAccountId) {
    throw new Error("A conta de destino deve ser diferente da conta de origem.");
  }

  const [source, destination] = await Promise.all([
    getDatabase().financialAccount.findFirstOrThrow({
      where: { id: sourceAccountId, workspaceId: access.workspaceId },
      select: { personEditorId: true },
    }),
    getDatabase().financialAccount.findFirstOrThrow({
      where: { id: destinationAccountId, workspaceId: access.workspaceId },
      select: { personEditorId: true },
    }),
  ]);
  const transfer = await getDatabase().transfer.create({
    data: {
      amount: parseMoneyInput(text(formData, "amount")),
      createdByEditorId: access.editorId,
      destinationAccountId,
      destinationPersonEditorId: destination.personEditorId,
      notes: optionalText(formData, "notes"),
      sourceAccountId,
      sourcePersonEditorId: source.personEditorId,
      transferDate: dateFromInput(text(formData, "transferDate")),
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "Transfer", transfer.id, "create");
  refreshAndRedirect(returnTo(formData, "/transferencias"));
}

export async function createBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const account = await getDatabase().financialAccount.findFirstOrThrow({
    where: { id: text(formData, "accountId"), workspaceId: access.workspaceId },
    select: { id: true, personEditorId: true },
  });
  const previousBalance = await getAccountCurrentBalance(access.workspaceId, account.id);
  const targetBalance = parseMoneyInput(text(formData, "targetBalance"));
  const adjustment = await getDatabase().balanceAdjustment.create({
    data: {
      accountId: account.id,
      createdByEditorId: access.editorId,
      difference: money(targetBalance.minus(previousBalance)),
      effectiveAt: dateFromInput(text(formData, "effectiveAt")),
      notes: optionalText(formData, "notes"),
      personEditorId: account.personEditorId,
      previousBalance,
      targetBalance,
      workspaceId: access.workspaceId,
    },
  });

  await audit(access.workspaceId, access.editorId, "BalanceAdjustment", adjustment.id, "create");
  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function archiveFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");
  const endedAt = monthStartFromInput(text(formData, "month"));
  const { count } = await getDatabase().fixedExpense.updateMany({
    where: { active: true, id, workspaceId: access.workspaceId },
    data: {
      active: false,
      endedAt,
      updatedByEditorId: access.editorId,
    },
  });

  if (count !== 1) {
    throw new Error("Recorrência não encontrada ou já encerrada.");
  }

  await audit(access.workspaceId, access.editorId, "FixedExpense", id, "archive");
  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function archiveSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");
  const archivedAt = monthStartFromInput(text(formData, "month"));
  const { count } = await getDatabase().salary.updateMany({
    where: { active: true, id, workspaceId: access.workspaceId },
    data: {
      active: false,
      archivedAt,
      updatedByEditorId: access.editorId,
    },
  });

  if (count !== 1) {
    throw new Error("Salário não encontrado ou já encerrado.");
  }

  await audit(access.workspaceId, access.editorId, "Salary", id, "archive");
  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}
