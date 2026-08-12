"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { getDatabase } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  addMonths,
  buildEqualSharePlan,
  buildInstallmentPlan,
  buildSalaryOccurrencePlan,
  clampDayInMonth,
  dateFromInput,
  fixedExpenseDueDate,
  installmentDueDate,
  isDueOnOrBefore,
  monthStartFromInput,
  resolveInvoiceMonth,
} from "@/modules/finance/domain/finance-calculations";
import { getAccountCurrentBalance } from "@/modules/finance/application/finance-queries";
import { calendarDateInTimeZone } from "@/modules/shared/domain/calendar";
import { money, parseMoneyInput, sumMoney } from "@/modules/shared/domain/money";

type FinanceValidationClient = ReturnType<typeof getDatabase> | Prisma.TransactionClient;

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

async function automaticSplitFromForm(formData: FormData, workspaceId: string, fallbackPersonEditorId: string, totalAmount: ReturnType<typeof money>) {
  if (text(formData, "splitMode") !== "EQUAL") {
    return { explicit: false, shares: [{ amount: totalAmount, personEditorId: fallbackPersonEditorId }] };
  }

  const people = await getDatabase().editor.findMany({
    where: { active: true, workspaceId },
    orderBy: { displayName: "asc" },
    select: { id: true },
  });

  if (people.length < 2) {
    return { explicit: false, shares: [{ amount: totalAmount, personEditorId: fallbackPersonEditorId }] };
  }

  return {
    explicit: true,
    shares: buildEqualSharePlan(totalAmount, people.map((person) => person.id)),
  };
}

async function recalculateCreditCardInvoices(transaction: Prisma.TransactionClient, workspaceId: string, invoiceIds: string[]) {
  for (const invoiceId of [...new Set(invoiceIds)]) {
    const amount = money((await transaction.creditCardInstallment.aggregate({
      where: { invoiceId, status: { not: "CANCELED" }, workspaceId },
      _sum: { amount: true },
    }))._sum.amount ?? 0);
    const paidByInstallments = money((await transaction.creditCardInstallment.aggregate({
      where: { invoiceId, status: "PAID", workspaceId },
      _sum: { amount: true },
    }))._sum.amount ?? 0);
    const paidByPayments = money((await transaction.creditCardInvoicePayment.aggregate({
      where: { invoiceId, workspaceId },
      _sum: { amount: true },
    }))._sum.amount ?? 0);
    const paidAmount = paidByInstallments.greaterThan(paidByPayments) ? paidByInstallments : paidByPayments;
    const cappedPaidAmount = paidAmount.greaterThan(amount) ? amount : paidAmount;

    if (amount.isZero() && cappedPaidAmount.isZero()) {
      await transaction.creditCardInvoice.deleteMany({ where: { id: invoiceId, workspaceId } });
    } else {
      await transaction.creditCardInvoice.updateMany({
        where: { id: invoiceId, workspaceId },
        data: {
          amount,
          paidAmount: cappedPaidAmount,
          status: cappedPaidAmount.greaterThanOrEqualTo(amount) ? "PAID" : "OPEN",
        },
      });
    }
  }
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

async function assertAccountForPerson(
  database: FinanceValidationClient,
  workspaceId: string,
  personEditorId: string,
  accountId: string | null | undefined,
  required = false,
) {
  if (!accountId) {
    if (required) {
      throw new Error("Informe a conta.");
    }

    return;
  }

  const account = await database.financialAccount.findFirst({
    where: { active: true, id: accountId, workspaceId },
    select: { personEditorId: true },
  });

  if (!account || account.personEditorId !== personEditorId) {
    throw new Error("Conta invalida para a pessoa selecionada.");
  }
}

async function assertCategoryKind(
  database: FinanceValidationClient,
  workspaceId: string,
  categoryId: string | null | undefined,
  kind: "EXPENSE" | "INCOME",
) {
  if (!categoryId) {
    return;
  }

  const category = await database.category.findFirst({
    where: { active: true, id: categoryId, kind, workspaceId },
    select: { id: true },
  });

  if (!category) {
    throw new Error("Categoria invalida para esse tipo de lancamento.");
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
      color: optionalText(formData, "color") ?? "#357a68",
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
      color: optionalText(formData, "color") ?? "#357a68",
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
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId, status === "SETTLED");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, type);
  const target = returnTo(formData, type === "INCOME" ? "/recebimentos" : "/gastos-variaveis");
  const transaction = await getDatabase().transaction.create({
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
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
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const fixedExpense = await getDatabase().fixedExpense.create({
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
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
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId, true);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "INCOME");
  const salary = await getDatabase().salary.create({
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
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
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);
  const debtId = randomUUID();

  await getDatabase().$transaction(async (transaction) => {
    await transaction.debt.create({
      data: {
        categoryId,
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
    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const installmentId = randomUUID();
      const dueDate = installmentDueDate(firstDueDate, installment.number - 1, frequency);
      const isPaid = isDueOnOrBefore(dueDate, today);

      await transaction.debtInstallment.create({
        data: {
          amount: installment.amount,
          debtId,
          dueDate,
          id: installmentId,
          number: installment.number,
          paidAt: isPaid ? dueDate : null,
          personEditorId,
          status: isPaid ? "PAID" : "PENDING",
          workspaceId: access.workspaceId,
        },
      });

      if (split.explicit) {
        for (const share of split.shares) {
          const shareAmount = buildInstallmentPlan(share.amount, installmentCount)[installment.number - 1]!.amount;

          await transaction.debtInstallmentShare.create({
            data: {
              amount: shareAmount,
              installmentId,
              paidAt: isPaid ? dueDate : null,
              personEditorId: share.personEditorId,
              status: isPaid ? "PAID" : "PENDING",
              workspaceId: access.workspaceId,
            },
          });
        }
      }
    }
  });

  await audit(access.workspaceId, access.editorId, "Debt", debtId, "create");
  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function createCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const paymentAccountId = optionalText(formData, "paymentAccountId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, paymentAccountId);
  const card = await getDatabase().creditCard.create({
    data: {
      closingDay: integer(formData, "closingDay", 1, 31),
      color: optionalText(formData, "color") ?? "#357a68",
      createdByEditorId: access.editorId,
      dueDay: integer(formData, "dueDay", 1, 31),
      institution: optionalText(formData, "institution"),
      limit: parseMoneyInput(text(formData, "limit")),
      name: text(formData, "name"),
      paymentAccountId,
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
    select: { closingDay: true, dueDay: true, id: true, personEditorId: true },
  });
  const personEditorId = text(formData, "personEditorId") || card.personEditorId;
  await assertPerson(access.workspaceId, personEditorId);
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 120);
  const purchaseDate = dateFromInput(text(formData, "purchaseDate"));
  const firstInvoiceMonth = resolveInvoiceMonth(purchaseDate, card.closingDay);
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);
  const purchaseId = randomUUID();
  const newInvoiceIds: string[] = [];

  await getDatabase().$transaction(async (transaction) => {
    await transaction.creditCardPurchase.create({
      data: {
        cardId: card.id,
        categoryId,
        createdByEditorId: access.editorId,
        description: text(formData, "description"),
        id: purchaseId,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId,
        purchaseDate,
        totalAmount,
        workspaceId: access.workspaceId,
      },
    });

    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const dueMonth = addMonths(firstInvoiceMonth, installment.number - 1);
      const dueDate = clampDayInMonth(dueMonth, card.dueDay);
      const isPaid = isDueOnOrBefore(dueDate, today);
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
      newInvoiceIds.push(invoice.id);

      const cardInstallment = await transaction.creditCardInstallment.create({
        data: {
          amount: installment.amount,
          cardId: card.id,
          categoryId,
          dueMonth,
          invoiceId: invoice.id,
          number: installment.number,
          personEditorId,
          purchaseId,
          status: isPaid ? "PAID" : "OPEN",
          workspaceId: access.workspaceId,
        },
        select: { id: true },
      });

      if (split.explicit) {
        for (const share of split.shares) {
          const shareAmount = buildInstallmentPlan(share.amount, installmentCount)[installment.number - 1]!.amount;

          await transaction.creditCardInstallmentShare.create({
            data: {
              amount: shareAmount,
              installmentId: cardInstallment.id,
              personEditorId: share.personEditorId,
              status: isPaid ? "PAID" : "OPEN",
              workspaceId: access.workspaceId,
            },
          });
        }
      }

      await transaction.transaction.create({
        data: {
          affectsBalance: false,
          amount: installment.amount,
          categoryId,
          competenceDate: dueMonth,
          createdByEditorId: access.editorId,
          creditCardInstallmentId: cardInstallment.id,
          description: `${text(formData, "description")} ${installment.number}/${installmentCount}`,
          dueDate,
          personEditorId,
          settledAt: isPaid ? dueDate : null,
          status: isPaid ? "SETTLED" : "PENDING",
          type: "EXPENSE",
          workspaceId: access.workspaceId,
        },
      });
    }

    await recalculateCreditCardInvoices(transaction, access.workspaceId, newInvoiceIds);
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

    await assertAccountForPerson(transaction, access.workspaceId, invoice.personEditorId, accountId, true);

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

    if (nextPaidAmount.greaterThanOrEqualTo(invoice.amount)) {
      await transaction.creditCardInstallment.updateMany({
        where: { invoiceId: invoice.id, status: "OPEN", workspaceId: access.workspaceId },
        data: { status: "PAID" },
      });
      await transaction.creditCardInstallmentShare.updateMany({
        where: { installment: { invoiceId: invoice.id }, status: "OPEN", workspaceId: access.workspaceId },
        data: { status: "PAID" },
      });
    }

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

async function recalculateInvoicesAfterPaymentDeletion(invoiceIds: string[]) {
  const database = getDatabase();

  for (const invoiceId of [...new Set(invoiceIds)]) {
    const invoice = await database.creditCardInvoice.findUnique({
      where: { id: invoiceId },
      select: { amount: true, id: true },
    });

    if (!invoice) {
      continue;
    }

    const aggregate = await database.creditCardInvoicePayment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const paidAmount = money(aggregate._sum.amount ?? 0);

    await database.creditCardInvoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount,
        status: paidAmount.greaterThanOrEqualTo(invoice.amount) ? "PAID" : "OPEN",
      },
    });
  }
}

export async function updateBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "adjustmentId");
  const current = await getDatabase().balanceAdjustment.findFirstOrThrow({
    where: { id, workspaceId: access.workspaceId },
    select: { previousBalance: true },
  });
  const targetBalance = parseMoneyInput(text(formData, "targetBalance"));
  const { count } = await getDatabase().balanceAdjustment.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      difference: money(targetBalance.minus(current.previousBalance)),
      effectiveAt: dateFromInput(text(formData, "effectiveAt")),
      notes: optionalText(formData, "notes"),
      targetBalance,
    },
  });

  if (count !== 1) {
    throw new Error("Ajuste nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "BalanceAdjustment", id, "update");
  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function deleteBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "adjustmentId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "BalanceAdjustment", workspaceId: access.workspaceId } });
    await transaction.balanceAdjustment.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function updateCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "categoryId");
  const kind = text(formData, "kind") === "INCOME" ? "INCOME" : "EXPENSE";
  const { count } = await getDatabase().category.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      color: optionalText(formData, "color"),
      kind,
      name: text(formData, "name"),
    },
  });

  if (count !== 1) {
    throw new Error("Categoria nao encontrada.");
  }

  await audit(access.workspaceId, access.editorId, "Category", id, "update");
  refreshAndRedirect(returnTo(formData, "/categorias"));
}

export async function deleteCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "categoryId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Category", workspaceId: access.workspaceId } });
    await transaction.category.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/categorias"));
}

export async function updateAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "accountId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const { count } = await getDatabase().financialAccount.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      color: optionalText(formData, "color"),
      initialBalance: parseMoneyInput(text(formData, "initialBalance", "0")),
      institution: optionalText(formData, "institution"),
      name: text(formData, "name"),
      personEditorId,
      type: text(formData, "type") as "CHECKING" | "SAVINGS" | "CASH" | "DIGITAL" | "INVESTMENT" | "OTHER",
      updatedByEditorId: access.editorId,
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Conta nao encontrada.");
  }

  await audit(access.workspaceId, access.editorId, "FinancialAccount", id, "update");
  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function deleteAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "accountId");
  const affectedInvoiceIds: string[] = [];

  await getDatabase().$transaction(async (transaction) => {
    const payments = await transaction.creditCardInvoicePayment.findMany({
      where: { accountId: id, workspaceId: access.workspaceId },
      select: { invoiceId: true },
    });
    affectedInvoiceIds.push(...payments.map(({ invoiceId }) => invoiceId));
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "FinancialAccount", workspaceId: access.workspaceId } });
    await transaction.transfer.deleteMany({
      where: {
        workspaceId: access.workspaceId,
        OR: [{ sourceAccountId: id }, { destinationAccountId: id }],
      },
    });
    await transaction.creditCardInvoicePayment.deleteMany({ where: { accountId: id, workspaceId: access.workspaceId } });
    await transaction.financialAccount.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });
  await recalculateInvoicesAfterPaymentDeletion(affectedInvoiceIds);

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function updateTransactionAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transactionId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const type = text(formData, "type") === "INCOME" ? "INCOME" : "EXPENSE";
  const status = text(formData, "status") === "SETTLED" ? "SETTLED" : "PENDING";
  const date = dateFromInput(text(formData, "date"));
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId, status === "SETTLED");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, type);
  const { count } = await getDatabase().transaction.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
      competenceDate: date,
      description: text(formData, "description"),
      notes: optionalText(formData, "notes"),
      personEditorId,
      settledAt: status === "SETTLED" ? date : null,
      status,
      type,
      updatedByEditorId: access.editorId,
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Lancamento nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "Transaction", id, "update");
  refreshAndRedirect(returnTo(formData, type === "INCOME" ? "/recebimentos" : "/gastos-variaveis"));
}

export async function deleteTransactionAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transactionId");

  await getDatabase().$transaction(async (transaction) => {
    const transactionRecord = await transaction.transaction.findFirst({
      where: { id, workspaceId: access.workspaceId },
      select: { debtInstallmentId: true },
    });

    if (transactionRecord?.debtInstallmentId) {
      await transaction.debtInstallment.updateMany({
        where: { id: transactionRecord.debtInstallmentId, workspaceId: access.workspaceId },
        data: { paidAt: null, status: "PENDING" },
      });
    }

    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Transaction", workspaceId: access.workspaceId } });
    await transaction.transaction.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/gastos-variaveis"));
}

export async function updateFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const { count } = await getDatabase().fixedExpense.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
      description: text(formData, "description"),
      dueDay: integer(formData, "dueDay", 1, 31),
      notes: optionalText(formData, "notes"),
      personEditorId,
      startMonth: monthStartFromInput(text(formData, "startMonth")),
      status: text(formData, "status") === "SETTLED" ? "SETTLED" : "PENDING",
      updatedByEditorId: access.editorId,
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Gasto fixo nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "FixedExpense", id, "update");
  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function deleteFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");

  await getDatabase().$transaction(async (transaction) => {
    const transactions = await transaction.transaction.findMany({
      where: { fixedExpenseId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    const transactionIds = transactions.map((transactionRecord) => transactionRecord.id);

    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "FixedExpense", workspaceId: access.workspaceId } });
    if (transactionIds.length > 0) {
      await transaction.auditLog.deleteMany({ where: { entityId: { in: transactionIds }, entityType: "Transaction", workspaceId: access.workspaceId } });
    }
    await transaction.transaction.deleteMany({ where: { fixedExpenseId: id, workspaceId: access.workspaceId } });
    await transaction.fixedExpense.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function updateSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId, true);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "INCOME");
  const { count } = await getDatabase().salary.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId,
      amount: parseMoneyInput(text(formData, "amount")),
      categoryId,
      description: text(formData, "description"),
      frequency: text(formData, "frequency") === "FORTNIGHTLY" ? "FORTNIGHTLY" : "MONTHLY",
      notes: optionalText(formData, "notes"),
      paymentDay: integer(formData, "paymentDay", 1, 31),
      personEditorId,
      startMonth: monthStartFromInput(text(formData, "startMonth")),
      updatedByEditorId: access.editorId,
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Salario nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "Salary", id, "update");
  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function deleteSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");

  await getDatabase().$transaction(async (transaction) => {
    const transactions = await transaction.transaction.findMany({
      where: { salaryId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    const transactionIds = transactions.map((transactionRecord) => transactionRecord.id);

    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Salary", workspaceId: access.workspaceId } });
    if (transactionIds.length > 0) {
      await transaction.auditLog.deleteMany({ where: { entityId: { in: transactionIds }, entityType: "Transaction", workspaceId: access.workspaceId } });
    }
    await transaction.transaction.deleteMany({ where: { salaryId: id, workspaceId: access.workspaceId } });
    await transaction.salary.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function confirmSalaryReceiptAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const salaryId = text(formData, "salaryId");
  const dueDate = dateFromInput(text(formData, "dueDate"));
  const salary = await getDatabase().salary.findFirstOrThrow({
    where: { active: true, id: salaryId, workspaceId: access.workspaceId },
    select: {
      accountId: true,
      amount: true,
      categoryId: true,
      description: true,
      frequency: true,
      id: true,
      notes: true,
      paymentDay: true,
      personEditorId: true,
      startMonth: true,
    },
  });
  const salaryMonth = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1));
  const occurrence = buildSalaryOccurrencePlan(salary.amount, salary.frequency, salaryMonth, salary.paymentDay).find(
    (item) => item.dueDate.getTime() === dueDate.getTime(),
  );

  if (dueDate < salary.startMonth || !occurrence) {
    throw new Error("Vencimento invalido para esse salario.");
  }

  await getDatabase().$transaction(async (transaction) => {
    await assertAccountForPerson(transaction, access.workspaceId, salary.personEditorId, salary.accountId, true);
    await assertCategoryKind(transaction, access.workspaceId, salary.categoryId, "INCOME");
    const transactionRecord = await transaction.transaction.upsert({
      where: { salaryId_competenceDate: { competenceDate: dueDate, salaryId: salary.id } },
      update: {
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
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
      create: {
        accountId: salary.accountId,
        affectsBalance: true,
        amount: occurrence.amount,
        categoryId: salary.categoryId,
        competenceDate: dueDate,
        createdByEditorId: access.editorId,
        description: salary.description,
        dueDate,
        notes: salary.notes,
        personEditorId: salary.personEditorId,
        salaryId: salary.id,
        settledAt: dueDate,
        status: "SETTLED",
        type: "INCOME",
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    await transaction.auditLog.create({
      data: {
        action: "confirm",
        editorId: access.editorId,
        entityId: transactionRecord.id,
        entityType: "Transaction",
        workspaceId: access.workspaceId,
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function payFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const fixedExpenseId = text(formData, "fixedExpenseId");
  const dueDate = dateFromInput(text(formData, "dueDate"));
  const paidAt = dateFromInput(text(formData, "paidAt"));
  const amount = parseMoneyInput(text(formData, "amount"));

  await getDatabase().$transaction(async (transaction) => {
    const fixedExpense = await transaction.fixedExpense.findFirstOrThrow({
      where: { active: true, id: fixedExpenseId, workspaceId: access.workspaceId },
      select: {
        accountId: true,
        amount: true,
        categoryId: true,
        description: true,
        dueDay: true,
        endedAt: true,
        id: true,
        notes: true,
        personEditorId: true,
        startMonth: true,
      },
    });
    const expectedDueDate = fixedExpenseDueDate(new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), 1)), fixedExpense.dueDay);

    if (
      dueDate.getTime() !== expectedDueDate.getTime() ||
      dueDate < fixedExpense.startMonth ||
      (fixedExpense.endedAt && dueDate > fixedExpense.endedAt)
    ) {
      throw new Error("Vencimento invalido para esse gasto fixo.");
    }

    if (!money(amount).equals(fixedExpense.amount)) {
      throw new Error("Pagamento parcial de gasto fixo ainda nao suportado.");
    }

    const accountId = text(formData, "accountId") || fixedExpense.accountId;
    await assertAccountForPerson(transaction, access.workspaceId, fixedExpense.personEditorId, accountId, true);
    await assertCategoryKind(transaction, access.workspaceId, fixedExpense.categoryId, "EXPENSE");
    const transactionRecord = await transaction.transaction.upsert({
      where: { fixedExpenseId_competenceDate: { competenceDate: dueDate, fixedExpenseId: fixedExpense.id } },
      update: {
        accountId,
        affectsBalance: true,
        amount: fixedExpense.amount,
        categoryId: fixedExpense.categoryId,
        description: fixedExpense.description,
        dueDate,
        notes: fixedExpense.notes,
        personEditorId: fixedExpense.personEditorId,
        settledAt: paidAt,
        status: "SETTLED",
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
      create: {
        accountId,
        affectsBalance: true,
        amount: fixedExpense.amount,
        categoryId: fixedExpense.categoryId,
        competenceDate: dueDate,
        createdByEditorId: access.editorId,
        description: fixedExpense.description,
        dueDate,
        fixedExpenseId: fixedExpense.id,
        notes: fixedExpense.notes,
        personEditorId: fixedExpense.personEditorId,
        settledAt: paidAt,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    await transaction.auditLog.create({
      data: {
        action: "pay",
        editorId: access.editorId,
        entityId: transactionRecord.id,
        entityType: "Transaction",
        workspaceId: access.workspaceId,
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function payDebtInstallmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const installmentId = text(formData, "installmentId");
  const paidAt = dateFromInput(text(formData, "paidAt"));
  const amount = parseMoneyInput(text(formData, "amount"));
  const accountId = text(formData, "accountId");

  await getDatabase().$transaction(async (transaction) => {
    const installment = await transaction.debtInstallment.findFirstOrThrow({
      where: { id: installmentId, workspaceId: access.workspaceId },
      include: { debt: true },
    });

    if (installment.status === "CANCELED") {
      throw new Error("Parcela cancelada nao pode ser paga.");
    }

    if (!money(amount).equals(installment.amount)) {
      throw new Error("Pagamento parcial de parcela ainda nao suportado.");
    }

    await assertAccountForPerson(transaction, access.workspaceId, installment.personEditorId, accountId, true);
    await assertCategoryKind(transaction, access.workspaceId, installment.debt.categoryId, "EXPENSE");
    const transactionRecord = await transaction.transaction.upsert({
      where: { debtInstallmentId: installment.id },
      update: {
        accountId,
        affectsBalance: true,
        amount: installment.amount,
        categoryId: installment.debt.categoryId,
        description: installment.debt.description,
        dueDate: installment.dueDate,
        notes: optionalText(formData, "notes"),
        personEditorId: installment.personEditorId,
        settledAt: paidAt,
        status: "SETTLED",
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
      create: {
        accountId,
        affectsBalance: true,
        amount: installment.amount,
        categoryId: installment.debt.categoryId,
        competenceDate: installment.dueDate,
        createdByEditorId: access.editorId,
        debtInstallmentId: installment.id,
        description: installment.debt.description,
        dueDate: installment.dueDate,
        notes: optionalText(formData, "notes"),
        personEditorId: installment.personEditorId,
        settledAt: paidAt,
        status: "SETTLED",
        type: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    await transaction.debtInstallment.update({
      where: { id: installment.id },
      data: { paidAt, status: "PAID" },
    });
    await transaction.debtInstallmentShare.updateMany({
      where: { installmentId: installment.id, workspaceId: access.workspaceId },
      data: { paidAt, status: "PAID" },
    });
    await transaction.auditLog.create({
      data: {
        action: "pay",
        editorId: access.editorId,
        entityId: transactionRecord.id,
        entityType: "Transaction",
        workspaceId: access.workspaceId,
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function deleteDebtInstallmentPaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const installmentId = text(formData, "installmentId");

  await getDatabase().$transaction(async (transaction) => {
    const installment = await transaction.debtInstallment.findFirstOrThrow({
      where: { id: installmentId, workspaceId: access.workspaceId },
      include: { transaction: { select: { id: true } } },
    });

    if (installment.transaction) {
      await transaction.auditLog.deleteMany({ where: { entityId: installment.transaction.id, entityType: "Transaction", workspaceId: access.workspaceId } });
      await transaction.transaction.deleteMany({ where: { id: installment.transaction.id, workspaceId: access.workspaceId } });
    }

    await transaction.debtInstallment.update({
      where: { id: installment.id },
      data: { paidAt: null, status: "PENDING" },
    });
    await transaction.debtInstallmentShare.updateMany({
      where: { installmentId: installment.id, workspaceId: access.workspaceId },
      data: { paidAt: null, status: "PENDING" },
    });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function updateDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "debtId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 240);
  const firstDueDate = dateFromInput(text(formData, "firstDueDate"));
  const frequency = text(formData, "frequency") === "FORTNIGHTLY" ? "FORTNIGHTLY" : "MONTHLY";
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);

  await getDatabase().$transaction(async (transaction) => {
    const { count } = await transaction.debt.updateMany({
      where: { id, workspaceId: access.workspaceId },
      data: {
        categoryId,
        description: text(formData, "description"),
        firstDueDate,
        frequency,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId,
        startDate: dateFromInput(text(formData, "startDate")),
        totalAmount,
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });

    if (count !== 1) {
      throw new Error("Divida nao encontrada.");
    }

    const currentInstallments = await transaction.debtInstallment.findMany({
      where: { debtId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    const installmentIds = currentInstallments.map((installment) => installment.id);

    if (installmentIds.length > 0) {
      const transactions = await transaction.transaction.findMany({
        where: { debtInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId },
        select: { id: true },
      });
      const transactionIds = transactions.map((transactionRecord) => transactionRecord.id);

      if (transactionIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { entityId: { in: transactionIds }, entityType: "Transaction", workspaceId: access.workspaceId } });
      }
      await transaction.transaction.deleteMany({ where: { debtInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId } });
    }
    await transaction.debtInstallment.deleteMany({ where: { debtId: id, workspaceId: access.workspaceId } });
    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const installmentId = randomUUID();
      const dueDate = installmentDueDate(firstDueDate, installment.number - 1, frequency);
      const isPaid = isDueOnOrBefore(dueDate, today);

      await transaction.debtInstallment.create({
        data: {
          amount: installment.amount,
          debtId: id,
          dueDate,
          id: installmentId,
          number: installment.number,
          paidAt: isPaid ? dueDate : null,
          personEditorId,
          status: isPaid ? "PAID" : "PENDING",
          workspaceId: access.workspaceId,
        },
      });

      if (split.explicit) {
        for (const share of split.shares) {
          const shareAmount = buildInstallmentPlan(share.amount, installmentCount)[installment.number - 1]!.amount;

          await transaction.debtInstallmentShare.create({
            data: {
              amount: shareAmount,
              installmentId,
              paidAt: isPaid ? dueDate : null,
              personEditorId: share.personEditorId,
              status: isPaid ? "PAID" : "PENDING",
              workspaceId: access.workspaceId,
            },
          });
        }
      }
    }
  });

  await audit(access.workspaceId, access.editorId, "Debt", id, "update");
  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function deleteDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "debtId");

  await getDatabase().$transaction(async (transaction) => {
    const installments = await transaction.debtInstallment.findMany({
      where: { debtId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    const installmentIds = installments.map((installment) => installment.id);

    if (installmentIds.length > 0) {
      const transactions = await transaction.transaction.findMany({
        where: { debtInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId },
        select: { id: true },
      });
      const transactionIds = transactions.map((transactionRecord) => transactionRecord.id);

      if (transactionIds.length > 0) {
        await transaction.auditLog.deleteMany({ where: { entityId: { in: transactionIds }, entityType: "Transaction", workspaceId: access.workspaceId } });
      }
      await transaction.transaction.deleteMany({ where: { debtInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId } });
    }
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Debt", workspaceId: access.workspaceId } });
    await transaction.debt.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function updateCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "cardId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const paymentAccountId = optionalText(formData, "paymentAccountId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, paymentAccountId);
  const { count } = await getDatabase().creditCard.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      closingDay: integer(formData, "closingDay", 1, 31),
      color: optionalText(formData, "color"),
      dueDay: integer(formData, "dueDay", 1, 31),
      institution: optionalText(formData, "institution"),
      limit: parseMoneyInput(text(formData, "limit")),
      name: text(formData, "name"),
      paymentAccountId,
      personEditorId,
      updatedByEditorId: access.editorId,
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Cartao nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "CreditCard", id, "update");
  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "cardId");

  await getDatabase().$transaction(async (transaction) => {
    const installmentIds = await transaction.creditCardInstallment.findMany({
      where: { cardId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "CreditCard", workspaceId: access.workspaceId } });
    await transaction.transaction.deleteMany({
      where: { creditCardInstallmentId: { in: installmentIds.map(({ id }) => id) }, workspaceId: access.workspaceId },
    });
    await transaction.creditCardInvoicePayment.deleteMany({ where: { invoice: { cardId: id }, workspaceId: access.workspaceId } });
    await transaction.creditCardInstallment.deleteMany({ where: { cardId: id, workspaceId: access.workspaceId } });
    await transaction.creditCardInvoice.deleteMany({ where: { cardId: id, workspaceId: access.workspaceId } });
    await transaction.creditCardPurchase.deleteMany({ where: { cardId: id, workspaceId: access.workspaceId } });
    await transaction.creditCard.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const purchaseId = text(formData, "purchaseId");
  const card = await getDatabase().creditCard.findFirstOrThrow({
    where: { id: text(formData, "cardId"), workspaceId: access.workspaceId },
    select: { closingDay: true, dueDay: true, id: true, personEditorId: true },
  });
  const personEditorId = text(formData, "personEditorId") || card.personEditorId;
  await assertPerson(access.workspaceId, personEditorId);
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 120);
  const purchaseDate = dateFromInput(text(formData, "purchaseDate"));
  const firstInvoiceMonth = resolveInvoiceMonth(purchaseDate, card.closingDay);
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);
  const oldInvoiceIds: string[] = [];
  const newInvoiceIds: string[] = [];

  await getDatabase().$transaction(async (transaction) => {
    const currentInstallments = await transaction.creditCardInstallment.findMany({
      where: { purchaseId, workspaceId: access.workspaceId },
      select: { id: true, invoiceId: true },
    });
    oldInvoiceIds.push(...currentInstallments.map(({ invoiceId }) => invoiceId).filter((invoiceId): invoiceId is string => Boolean(invoiceId)));

    await transaction.transaction.deleteMany({
      where: { creditCardInstallmentId: { in: currentInstallments.map(({ id }) => id) }, workspaceId: access.workspaceId },
    });
    await transaction.creditCardInstallment.deleteMany({ where: { purchaseId, workspaceId: access.workspaceId } });

    const { count } = await transaction.creditCardPurchase.updateMany({
      where: { id: purchaseId, workspaceId: access.workspaceId },
      data: {
        cardId: card.id,
        categoryId,
        description: text(formData, "description"),
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId,
        purchaseDate,
        totalAmount,
      },
    });

    if (count !== 1) {
      throw new Error("Compra nao encontrada.");
    }

    await recalculateCreditCardInvoices(transaction, access.workspaceId, oldInvoiceIds);

    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const dueMonth = addMonths(firstInvoiceMonth, installment.number - 1);
      const dueDate = clampDayInMonth(dueMonth, card.dueDay);
      const isPaid = isDueOnOrBefore(dueDate, today);
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
      newInvoiceIds.push(invoice.id);

      const cardInstallment = await transaction.creditCardInstallment.create({
        data: {
          amount: installment.amount,
          cardId: card.id,
          categoryId,
          dueMonth,
          invoiceId: invoice.id,
          number: installment.number,
          personEditorId,
          purchaseId,
          status: isPaid ? "PAID" : "OPEN",
          workspaceId: access.workspaceId,
        },
        select: { id: true },
      });

      if (split.explicit) {
        for (const share of split.shares) {
          const shareAmount = buildInstallmentPlan(share.amount, installmentCount)[installment.number - 1]!.amount;

          await transaction.creditCardInstallmentShare.create({
            data: {
              amount: shareAmount,
              installmentId: cardInstallment.id,
              personEditorId: share.personEditorId,
              status: isPaid ? "PAID" : "OPEN",
              workspaceId: access.workspaceId,
            },
          });
        }
      }

      await transaction.transaction.create({
        data: {
          affectsBalance: false,
          amount: installment.amount,
          categoryId,
          competenceDate: dueMonth,
          createdByEditorId: access.editorId,
          creditCardInstallmentId: cardInstallment.id,
          description: `${text(formData, "description")} ${installment.number}/${installmentCount}`,
          dueDate,
          personEditorId,
          settledAt: isPaid ? dueDate : null,
          status: isPaid ? "SETTLED" : "PENDING",
          type: "EXPENSE",
          workspaceId: access.workspaceId,
        },
      });
    }

    await recalculateCreditCardInvoices(transaction, access.workspaceId, newInvoiceIds);
  });

  await audit(access.workspaceId, access.editorId, "CreditCardPurchase", purchaseId, "update");
  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const purchaseId = text(formData, "purchaseId");

  await getDatabase().$transaction(async (transaction) => {
    const installments = await transaction.creditCardInstallment.findMany({
      where: { purchaseId, workspaceId: access.workspaceId },
      select: { id: true, invoiceId: true },
    });
    const invoiceIds = [...new Set(installments.map(({ invoiceId }) => invoiceId).filter((invoiceId): invoiceId is string => Boolean(invoiceId)))];

    await transaction.auditLog.deleteMany({ where: { entityId: purchaseId, entityType: "CreditCardPurchase", workspaceId: access.workspaceId } });
    await transaction.transaction.deleteMany({
      where: { creditCardInstallmentId: { in: installments.map(({ id }) => id) }, workspaceId: access.workspaceId },
    });
    await transaction.creditCardInstallment.deleteMany({ where: { purchaseId, workspaceId: access.workspaceId } });
    await transaction.creditCardPurchase.deleteMany({ where: { id: purchaseId, workspaceId: access.workspaceId } });

    for (const invoiceId of invoiceIds) {
      const amount = money((await transaction.creditCardInstallment.aggregate({ where: { invoiceId }, _sum: { amount: true } }))._sum.amount ?? 0);
      const paidAmount = money((await transaction.creditCardInvoicePayment.aggregate({ where: { invoiceId }, _sum: { amount: true } }))._sum.amount ?? 0);

      if (amount.isZero() && paidAmount.isZero()) {
        await transaction.creditCardInvoice.deleteMany({ where: { id: invoiceId, workspaceId: access.workspaceId } });
      } else {
        const cappedPaidAmount = paidAmount.greaterThan(amount) ? amount : paidAmount;
        await transaction.creditCardInvoice.updateMany({
          where: { id: invoiceId, workspaceId: access.workspaceId },
          data: {
            amount,
            paidAmount: cappedPaidAmount,
            status: cappedPaidAmount.greaterThanOrEqualTo(amount) ? "PAID" : "OPEN",
          },
        });
      }
    }
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateCreditCardInvoicePaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const paymentId = text(formData, "paymentId");
  const amount = parseMoneyInput(text(formData, "amount"));
  const accountId = text(formData, "accountId");

  await getDatabase().$transaction(async (transaction) => {
    const payment = await transaction.creditCardInvoicePayment.findFirstOrThrow({
      where: { id: paymentId, workspaceId: access.workspaceId },
      include: { invoice: true },
    });
    await assertAccountForPerson(transaction, access.workspaceId, payment.personEditorId, accountId, true);
    const paidWithoutCurrent = money(
      (await transaction.creditCardInvoicePayment.aggregate({
        where: { invoiceId: payment.invoiceId, id: { not: payment.id } },
        _sum: { amount: true },
      }))._sum.amount ?? 0,
    );
    const nextPaidAmount = money(paidWithoutCurrent.plus(amount));

    if (nextPaidAmount.greaterThan(payment.invoice.amount)) {
      throw new Error("Pagamento maior que o valor da fatura.");
    }

    await transaction.creditCardInvoicePayment.updateMany({
      where: { id: payment.id, workspaceId: access.workspaceId },
      data: {
        accountId,
        amount,
        notes: optionalText(formData, "notes"),
        paidAt: dateFromInput(text(formData, "paidAt")),
      },
    });
    await transaction.creditCardInvoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidAmount: nextPaidAmount,
        status: nextPaidAmount.greaterThanOrEqualTo(payment.invoice.amount) ? "PAID" : "OPEN",
      },
    });
  });

  await audit(access.workspaceId, access.editorId, "CreditCardInvoicePayment", paymentId, "update");
  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardInvoicePaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const paymentId = text(formData, "paymentId");

  await getDatabase().$transaction(async (transaction) => {
    const payment = await transaction.creditCardInvoicePayment.findFirstOrThrow({
      where: { id: paymentId, workspaceId: access.workspaceId },
      include: { invoice: true },
    });
    await transaction.creditCardInvoicePayment.deleteMany({ where: { id: payment.id, workspaceId: access.workspaceId } });
    const nextPaidAmount = money(
      (await transaction.creditCardInvoicePayment.aggregate({ where: { invoiceId: payment.invoiceId }, _sum: { amount: true } }))._sum.amount ?? 0,
    );
    await transaction.creditCardInvoice.update({
      where: { id: payment.invoiceId },
      data: {
        paidAmount: nextPaidAmount,
        status: nextPaidAmount.greaterThanOrEqualTo(payment.invoice.amount) ? "PAID" : "OPEN",
      },
    });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "goalId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const { count } = await getDatabase().savingsGoal.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId: optionalText(formData, "accountId"),
      deadline: optionalText(formData, "deadline") ? dateFromInput(text(formData, "deadline")) : null,
      description: optionalText(formData, "description"),
      name: text(formData, "name"),
      personEditorId,
      targetAmount: parseMoneyInput(text(formData, "targetAmount")),
    },
  });

  if (count !== 1) {
    throw new Error("Cofrinho nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "SavingsGoal", id, "update");
  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function deleteSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "goalId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "SavingsGoal", workspaceId: access.workspaceId } });
    await transaction.savingsGoal.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function updateSavingsGoalMovementAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const movementId = text(formData, "movementId");
  const amount = parseMoneyInput(text(formData, "amount"));
  const type = text(formData, "type") === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT";

  await getDatabase().$transaction(async (transaction) => {
    const movement = await transaction.savingsGoalMovement.findFirstOrThrow({
      where: { id: movementId, workspaceId: access.workspaceId },
      include: { goal: true },
    });
    const siblingMovements = await transaction.savingsGoalMovement.findMany({
      where: { goalId: movement.goalId, id: { not: movement.id }, workspaceId: access.workspaceId },
      select: { amount: true, type: true },
    });
    const currentWithoutMovement = sumMoney(
      siblingMovements.map((sibling) =>
        sibling.type === "DEPOSIT" ? sibling.amount : money(sibling.amount).negated(),
      ),
    );

    if (type === "WITHDRAWAL" && money(currentWithoutMovement.minus(amount)).isNegative()) {
      throw new Error("Retirada maior que o valor reservado no cofrinho.");
    }

    await transaction.savingsGoalMovement.updateMany({
      where: { id: movement.id, workspaceId: access.workspaceId },
      data: {
        amount,
        movementDate: dateFromInput(text(formData, "movementDate")),
        notes: optionalText(formData, "notes"),
        type,
      },
    });
  });

  await audit(access.workspaceId, access.editorId, "SavingsGoalMovement", movementId, "update");
  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function deleteSavingsGoalMovementAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const movementId = text(formData, "movementId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: movementId, entityType: "SavingsGoalMovement", workspaceId: access.workspaceId } });
    await transaction.savingsGoalMovement.deleteMany({ where: { id: movementId, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function updateInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "investmentId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const { count } = await getDatabase().investment.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId: optionalText(formData, "accountId"),
      amount: parseMoneyInput(text(formData, "amount")),
      institution: optionalText(formData, "institution"),
      name: text(formData, "name"),
      notes: optionalText(formData, "notes"),
      personEditorId,
      referenceDate: dateFromInput(text(formData, "referenceDate")),
    },
  });

  if (count !== 1) {
    throw new Error("Investimento nao encontrado.");
  }

  await audit(access.workspaceId, access.editorId, "Investment", id, "update");
  refreshAndRedirect(returnTo(formData, "/investimentos"));
}

export async function deleteInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "investmentId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Investment", workspaceId: access.workspaceId } });
    await transaction.investment.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/investimentos"));
}

export async function updateTransferAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transferId");
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
  const { count } = await getDatabase().transfer.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      amount: parseMoneyInput(text(formData, "amount")),
      destinationAccountId,
      destinationPersonEditorId: destination.personEditorId,
      notes: optionalText(formData, "notes"),
      sourceAccountId,
      sourcePersonEditorId: source.personEditorId,
      transferDate: dateFromInput(text(formData, "transferDate")),
      version: { increment: 1 },
    },
  });

  if (count !== 1) {
    throw new Error("Transferencia nao encontrada.");
  }

  await audit(access.workspaceId, access.editorId, "Transfer", id, "update");
  refreshAndRedirect(returnTo(formData, "/transferencias"));
}

export async function deleteTransferAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transferId");

  await getDatabase().$transaction(async (transaction) => {
    await transaction.auditLog.deleteMany({ where: { entityId: id, entityType: "Transfer", workspaceId: access.workspaceId } });
    await transaction.transfer.deleteMany({ where: { id, workspaceId: access.workspaceId } });
  });

  refreshAndRedirect(returnTo(formData, "/transferencias"));
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
