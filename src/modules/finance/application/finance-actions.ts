"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  buildEqualSharePlan,
  buildInstallmentPlan,
  buildInstallmentSharePlan,
  addMonths,
  creditCardFirstDueDate,
  installmentDueDate,
  clampDayInMonth,
  monthlyDueDate,
} from "@/modules/finance/domain/finance-calculations";
import { assertCreditCardConfigurationChange, assertCreditCardPurchaseHasNoPayments, reconcileCreditCardInvoice, reconcileCreditCardInvoices } from "@/modules/finance/application/credit-card-reconciliation";
import { assertDebtIntegrity, assertDebtStructureMutable, cancelDebtFutureInstallments, payDebtInstallment, undoDebtInstallmentPayment } from "@/modules/finance/application/debt-finance";
import {
  assertAccountForPerson,
  assertInvestmentAccountForPerson,
  assertOptimisticUpdate,
  createBalanceAdjustment,
  createSavingsGoalMovement,
  createTransfer,
  deleteBalanceAdjustment,
  deleteSavingsGoalMovement,
  deleteTransfer,
  lockSavingsGoal,
  updateBalanceAdjustment,
  updateSavingsGoalMovement,
  updateTransfer,
} from "@/modules/finance/application/financial-consistency";
import { confirmSalaryOccurrence, payFixedExpenseOccurrence, undoFixedExpensePayment, updateFixedExpenseRule, updateSalaryRule } from "@/modules/finance/application/recurring-finance";
import {
  appendAudit,
  archiveInvestment,
  archiveOrDeleteAccount,
  archiveOrDeleteCategory,
  archiveOrDeleteCreditCard,
  archiveOrDeleteDebt,
  archiveOrDeleteFixedExpense,
  archiveOrDeleteSalary,
  archiveOrDeleteSavingsGoal,
  assertExactlyOne,
  canHardDeleteAccount,
  canHardDeleteCategory,
  restoreAccount,
  restoreCategory,
  restoreCreditCard,
  restoreDebt,
  restoreFixedExpense,
  restoreInvestment,
  restoreSalary,
  restoreSavingsGoal,
} from "@/modules/finance/application/finance-lifecycle";
import {
  colorSchema,
  dateInputSchema,
  identifierSchema,
  moneyInputSchema,
  monthInputSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";
import { money, sumMoney } from "@/modules/shared/domain/money";

type FinanceValidationClient = ReturnType<typeof getDatabase> | Prisma.TransactionClient;

function text(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  const parsed = z.string().trim().parse(typeof value === "string" ? value : fallback);

  if (parsed && name.endsWith("Id")) {
    identifierSchema.parse(parsed);
  }

  return parsed;
}

function optionalText(formData: FormData, name: string) {
  return text(formData, name) || null;
}

function optionalColor(formData: FormData) {
  const value = optionalText(formData, "color");

  return value ? colorSchema.parse(value) : null;
}

function integer(formData: FormData, name: string, min: number, max: number) {
  return z.coerce.number().int().min(min).max(max).parse(text(formData, name));
}

function expectedVersion(formData: FormData) {
  return versionSchema.max(2_147_483_647).parse(text(formData, "version"));
}

function dateFromInput(value: string) {
  return dateInputSchema.parse(value);
}

function monthStartFromInput(value: string) {
  return monthInputSchema.parse(value);
}

function parseMoneyInput(value: string) {
  return money(positiveMoneyInputSchema.parse(value));
}

function parseNonNegativeMoneyInput(value: string) {
  return money(moneyInputSchema.refine((parsed) => Number(parsed) >= 0, "O valor não pode ser negativo.").parse(value));
}

function enumValue<const Values extends readonly [string, ...string[]]>(formData: FormData, name: string, values: Values) {
  return z.enum(values).parse(text(formData, name));
}

function accountType(formData: FormData) {
  return enumValue(formData, "type", ["CHECKING", "SAVINGS", "CASH", "DIGITAL", "INVESTMENT", "OTHER"]);
}

function monthStartFromDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function dayBefore(date: Date) {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000);
}

function assertFirstDueDateAfterPurchase(purchaseDate: Date, firstDueDate: Date) {
  if (firstDueDate.getTime() < purchaseDate.getTime()) {
    throw new Error("A primeira parcela nao pode vencer antes da data da compra.");
  }
}

function creditCardFirstDueDateFromForm(formData: FormData, purchaseDate: Date, card: { closingDay: number; dueDay: number }) {
  const explicitFirstDueDate = optionalText(formData, "firstDueDate");
  const calculatedFirstDueDate = creditCardFirstDueDate(purchaseDate, card.closingDay, card.dueDay);

  if (explicitFirstDueDate && dateFromInput(explicitFirstDueDate).getTime() !== calculatedFirstDueDate.getTime()) {
    throw new Error("A primeira parcela deve seguir os dias de fechamento e vencimento do cartao.");
  }

  return calculatedFirstDueDate;
}

async function automaticSplitFromForm(formData: FormData, workspaceId: string, fallbackPersonEditorId: string, totalAmount: ReturnType<typeof money>) {
  const rawSplitMode = text(formData, "splitMode");
  const splitMode = rawSplitMode ? z.enum(["OWNER", "EQUAL"]).parse(rawSplitMode) : "OWNER";

  if (splitMode !== "EQUAL") {
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

async function cardPurchaseResponsibilityFromForm(formData: FormData, workspaceId: string, fallbackPersonEditorId: string, totalAmount: ReturnType<typeof money>) {
  const responsibilityTarget = text(formData, "responsibilityTarget") || text(formData, "personEditorId") || fallbackPersonEditorId;
  if (responsibilityTarget !== "COUPLE") {
    identifierSchema.parse(responsibilityTarget);
  }
  const rawSplitMode = text(formData, "splitMode");
  const splitMode = rawSplitMode ? z.enum(["OWNER", "EQUAL"]).parse(rawSplitMode) : "OWNER";
  const wantsCoupleSplit = responsibilityTarget === "COUPLE" || splitMode === "EQUAL";

  if (!wantsCoupleSplit) {
    return {
      personEditorId: responsibilityTarget,
      split: { explicit: false, shares: [{ amount: totalAmount, personEditorId: responsibilityTarget }] },
    };
  }

  const people = await getDatabase().editor.findMany({
    where: { active: true, workspaceId },
    orderBy: { displayName: "asc" },
    select: { id: true },
  });
  const shares = people.map((person) => {
    const rawAmount = text(formData, `cardShareAmount:${person.id}`);

    return {
      amount: rawAmount ? parseMoneyInput(rawAmount) : money(0),
      personEditorId: person.id,
    };
  }).filter((share) => share.amount.greaterThan(0));
  const splitTotal = sumMoney(shares.map((share) => share.amount));

  if (shares.length < 2 || !splitTotal.equals(totalAmount)) {
    throw new Error("A divisao do cartao precisa informar os valores de cada pessoa e somar exatamente o valor total.");
  }

  return {
    personEditorId: shares[0]!.personEditorId,
    split: { explicit: true, shares },
  };
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
  const kind = enumValue(formData, "kind", ["INCOME", "EXPENSE"]);

  if (name.length < 2) {
    throw new Error("Informe a categoria.");
  }

  const category = await getDatabase().category.create({
    data: {
      color: optionalColor(formData) ?? "#357a68",
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
      color: optionalColor(formData) ?? "#357a68",
      createdByEditorId: access.editorId,
      initialBalance: parseNonNegativeMoneyInput(text(formData, "initialBalance", "0")),
      institution: optionalText(formData, "institution"),
      name: text(formData, "name"),
      personEditorId,
      type: accountType(formData),
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
  const type = enumValue(formData, "type", ["INCOME", "EXPENSE"]);
  const status = enumValue(formData, "status", ["SETTLED", "PENDING"]);
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
      frequency: enumValue(formData, "frequency", ["FORTNIGHTLY", "MONTHLY"]),
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
  const frequency = enumValue(formData, "frequency", ["FORTNIGHTLY", "MONTHLY"]);
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const sharePlan = split.explicit ? buildInstallmentSharePlan(totalAmount, installmentCount, split.shares) : [];
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

      await transaction.debtInstallment.create({
        data: {
          amount: installment.amount,
          debtId,
          dueDate,
          id: installmentId,
          number: installment.number,
          paidAt: null,
          personEditorId,
          status: "PENDING",
          workspaceId: access.workspaceId,
        },
      });

      if (split.explicit) {
        for (const share of sharePlan[installment.number - 1]!.shares) {
          await transaction.debtInstallmentShare.create({
            data: {
              amount: share.amount,
              installmentId,
              paidAt: null,
              personEditorId: share.personEditorId,
              status: "PENDING",
              workspaceId: access.workspaceId,
            },
          });
        }
      }
    }
    await assertDebtIntegrity(transaction, access.workspaceId, debtId);
    await appendAudit(transaction, access, "Debt", debtId, "create", {
      installmentCount,
      totalAmount,
    });
  });

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
      color: optionalColor(formData) ?? "#357a68",
      createdByEditorId: access.editorId,
      dueDay: integer(formData, "dueDay", 1, 31),
      institution: optionalText(formData, "institution"),
      limit: parseNonNegativeMoneyInput(text(formData, "limit")),
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
    where: { active: true, id: text(formData, "cardId"), workspaceId: access.workspaceId },
    select: { closingDay: true, dueDay: true, id: true, personEditorId: true },
  });
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const { personEditorId, split } = await cardPurchaseResponsibilityFromForm(formData, access.workspaceId, card.personEditorId, totalAmount);
  await assertPerson(access.workspaceId, personEditorId);
  const installmentCount = integer(formData, "installmentCount", 1, 120);
  const purchaseDate = dateFromInput(text(formData, "purchaseDate"));
  const firstDueDate = creditCardFirstDueDateFromForm(formData, purchaseDate, card);
  assertFirstDueDateAfterPurchase(purchaseDate, firstDueDate);
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
        firstDueDate,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId,
        purchaseDate,
        totalAmount,
        workspaceId: access.workspaceId,
      },
    });

    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const dueDate = monthlyDueDate(firstDueDate, installment.number - 1);
      const dueMonth = monthStartFromDate(dueDate);
      const invoiceDueDate = clampDayInMonth(dueMonth, card.dueDay);
      const invoice = await transaction.creditCardInvoice.upsert({
        where: { cardId_month: { cardId: card.id, month: dueMonth } },
        update: { amount: { increment: installment.amount }, dueDate: invoiceDueDate },
        create: {
          amount: installment.amount,
          cardId: card.id,
          dueDate: invoiceDueDate,
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
          status: "OPEN",
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
              status: "OPEN",
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
          settledAt: null,
          status: "PENDING",
          type: "EXPENSE",
          workspaceId: access.workspaceId,
        },
      });
    }

    await reconcileCreditCardInvoices(transaction, newInvoiceIds);
    await appendAudit(transaction, access, "CreditCardPurchase", purchaseId, "create", {
      installmentCount,
      totalAmount,
    });
  });

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
    await reconcileCreditCardInvoices(transaction, [invoice.id]);

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

export async function payCreditCardInstallmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const installmentId = text(formData, "installmentId");
  const paidAt = dateFromInput(text(formData, "paidAt"));

  await getDatabase().$transaction(async (transaction) => {
    const installment = await transaction.creditCardInstallment.findFirstOrThrow({
      where: { id: installmentId, workspaceId: access.workspaceId },
      include: { invoice: { include: { card: true } } },
    });

    if (!installment.invoiceId || !installment.invoice) {
      throw new Error("Parcela sem fatura vinculada.");
    }

    if (installment.status !== "OPEN") {
      throw new Error("Apenas parcelas abertas podem receber um pagamento.");
    }

    const existingPayment = await transaction.creditCardInvoicePayment.findFirst({
      where: { creditCardInstallmentId: installment.id, workspaceId: access.workspaceId },
      select: { id: true },
    });

    if (existingPayment) {
      throw new Error("Esta parcela ja possui pagamento registrado.");
    }

    const accountId = text(formData, "accountId") || installment.invoice.card.paymentAccountId;

    if (!accountId) {
      throw new Error("Informe a conta de pagamento da parcela.");
    }

    await assertAccountForPerson(transaction, access.workspaceId, installment.invoice.personEditorId, accountId, true);

    const amount = money(installment.amount);

    await transaction.creditCardInvoicePayment.create({
      data: {
        accountId,
        amount,
        createdByEditorId: access.editorId,
        creditCardInstallmentId: installment.id,
        invoiceId: installment.invoiceId,
        notes: optionalText(formData, "notes"),
        paidAt,
        personEditorId: installment.invoice.personEditorId,
        workspaceId: access.workspaceId,
      },
    });
    await reconcileCreditCardInvoices(transaction, [installment.invoiceId]);
    await transaction.auditLog.create({
      data: {
        action: "pay",
        editorId: access.editorId,
        entityId: installment.id,
        entityType: "CreditCardInstallment",
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
  const accountId = optionalText(formData, "accountId");
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  const goal = await getDatabase().savingsGoal.create({
    data: {
      accountId,
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
  const type = enumValue(formData, "type", ["WITHDRAWAL", "DEPOSIT"]);

  await getDatabase().$transaction(async (transaction) => {
    await createSavingsGoalMovement(transaction, access, {
      amount,
      goalId,
      movementDate,
      notes: optionalText(formData, "notes"),
      type,
    });
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function createInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const accountId = optionalText(formData, "accountId");
  await assertInvestmentAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  const investment = await getDatabase().investment.create({
    data: {
      accountId,
      amount: parseNonNegativeMoneyInput(text(formData, "amount")),
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

  await getDatabase().$transaction(async (transaction) => {
    await createTransfer(transaction, access, {
      amount: parseMoneyInput(text(formData, "amount")),
      destinationAccountId,
      notes: optionalText(formData, "notes"),
      sourceAccountId,
      transferDate: dateFromInput(text(formData, "transferDate")),
    });
  });

  refreshAndRedirect(returnTo(formData, "/transferencias"));
}

export async function createBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  await getDatabase().$transaction(async (transaction) => {
    await createBalanceAdjustment(transaction, access, {
      accountId: text(formData, "accountId"),
      effectiveAt: dateFromInput(text(formData, "effectiveAt")),
      notes: optionalText(formData, "notes"),
      targetBalance: parseNonNegativeMoneyInput(text(formData, "targetBalance")),
    });
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function updateBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "adjustmentId");
  await getDatabase().$transaction(async (transaction) => {
    await updateBalanceAdjustment(transaction, access, {
      adjustmentId: id,
      effectiveAt: dateFromInput(text(formData, "effectiveAt")),
      notes: optionalText(formData, "notes"),
      targetBalance: parseNonNegativeMoneyInput(text(formData, "targetBalance")),
    });
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function deleteBalanceAdjustmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "adjustmentId");

  await getDatabase().$transaction(async (transaction) => {
    await deleteBalanceAdjustment(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function updateCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "categoryId");
  const kind = enumValue(formData, "kind", ["INCOME", "EXPENSE"]);
  await getDatabase().$transaction(async (transaction) => {
    const current = await transaction.category.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });

    if (!(await canHardDeleteCategory(transaction, access.workspaceId, id)) && current.kind !== kind) {
      throw new Error("O tipo de uma categoria já utilizada não pode ser alterado.");
    }

    const { count } = await transaction.category.updateMany({
      where: { active: true, id, workspaceId: access.workspaceId },
      data: {
        color: optionalColor(formData),
        kind,
        name: text(formData, "name"),
      },
    });
    assertExactlyOne(count, "Categoria não encontrada ou arquivada.");
    await appendAudit(transaction, access, "Category", id, "update", { before: current });
  });
  refreshAndRedirect(returnTo(formData, "/categorias"));
}

export async function deleteCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "categoryId");

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteCategory(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/categorias"));
}

export async function restoreCategoryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "categoryId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreCategory(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/categorias"));
}

export async function updateAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "accountId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const initialBalance = parseNonNegativeMoneyInput(text(formData, "initialBalance", "0"));
  const type = accountType(formData);
  const version = expectedVersion(formData);

  await getDatabase().$transaction(async (transaction) => {
    const current = await transaction.financialAccount.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });
    const hasHistory = !(await canHardDeleteAccount(transaction, access.workspaceId, id));

    if (hasHistory && current.personEditorId !== personEditorId) {
      throw new Error("O titular de uma conta com histórico não pode ser alterado.");
    }
    if (hasHistory && !money(current.initialBalance).equals(initialBalance)) {
      throw new Error("O saldo inicial de uma conta com histórico não pode ser alterado. Use um ajuste de saldo.");
    }
    if (hasHistory && current.type !== type) {
      throw new Error("O tipo de uma conta com histórico não pode ser alterado.");
    }

    const { count } = await transaction.financialAccount.updateMany({
      where: { active: true, id, version, workspaceId: access.workspaceId },
      data: {
        color: optionalColor(formData),
        initialBalance,
        institution: optionalText(formData, "institution"),
        name: text(formData, "name"),
        personEditorId,
        type,
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "FinancialAccount", id, "update", { before: current });
  });
  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function deleteAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "accountId");

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteAccount(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function restoreAccountAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "accountId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreAccount(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/bancos"));
}

export async function updateTransactionAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transactionId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const type = enumValue(formData, "type", ["INCOME", "EXPENSE"]);
  const status = enumValue(formData, "status", ["SETTLED", "PENDING"]);
  const date = dateFromInput(text(formData, "date"));
  const accountId = optionalText(formData, "accountId");
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, type);
  const version = expectedVersion(formData);

  await getDatabase().$transaction(async (transaction) => {
    await assertAccountForPerson(transaction, access.workspaceId, personEditorId, accountId, status === "SETTLED");
    const current = await transaction.transaction.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });
    const { count } = await transaction.transaction.updateMany({
      where: { id, version, workspaceId: access.workspaceId },
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
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "Transaction", id, "update", { before: current });
  });
  refreshAndRedirect(returnTo(formData, type === "INCOME" ? "/recebimentos" : "/gastos-variaveis"));
}

export async function deleteTransactionAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transactionId");

  await getDatabase().$transaction(async (transaction) => {
    const transactionRecord = await transaction.transaction.findFirstOrThrow({
      where: { id, workspaceId: access.workspaceId },
    });

    if (transactionRecord.debtInstallmentId) {
      await transaction.debtInstallment.updateMany({
        where: { id: transactionRecord.debtInstallmentId, workspaceId: access.workspaceId },
        data: { paidAt: null, status: "PENDING" },
      });
      await transaction.debtInstallmentShare.updateMany({
        where: { installmentId: transactionRecord.debtInstallmentId, workspaceId: access.workspaceId },
        data: { paidAt: null, status: "PENDING" },
      });
    }

    await appendAudit(transaction, access, "Transaction", id, "delete", { before: transactionRecord });
    const { count } = await transaction.transaction.deleteMany({ where: { id, workspaceId: access.workspaceId } });
    assertExactlyOne(count, "Lançamento não encontrado.");
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
  const amount = parseMoneyInput(text(formData, "amount"));
  const dueDay = integer(formData, "dueDay", 1, 31);
  const startMonth = monthStartFromInput(text(formData, "startMonth"));
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");

  await getDatabase().$transaction(async (transaction) => {
    await updateFixedExpenseRule(transaction, access, {
      accountId,
      amount,
      categoryId,
      description: text(formData, "description"),
      dueDay,
      expectedVersion: expectedVersion(formData),
      fixedExpenseId: id,
      notes: optionalText(formData, "notes"),
      personEditorId,
      selectedMonth: monthStartFromInput(text(formData, "month")),
      startMonth,
    });
  });

  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function deleteFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");
  const effectiveAt = monthStartFromInput(text(formData, "month"));

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteFixedExpense(transaction, access, id, effectiveAt, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function restoreFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreFixedExpense(transaction, access, id, expectedVersion(formData));
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
  const amount = parseMoneyInput(text(formData, "amount"));
  const frequency = enumValue(formData, "frequency", ["FORTNIGHTLY", "MONTHLY"]);
  const paymentDay = integer(formData, "paymentDay", 1, 31);
  const startMonth = monthStartFromInput(text(formData, "startMonth"));
  await assertAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId, true);
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "INCOME");

  await getDatabase().$transaction(async (transaction) => {
    if (!accountId) {
      throw new Error("Informe a conta de recebimento.");
    }
    await updateSalaryRule(transaction, access, {
      accountId,
      amount,
      categoryId,
      description: text(formData, "description"),
      expectedVersion: expectedVersion(formData),
      frequency,
      notes: optionalText(formData, "notes"),
      paymentDay,
      personEditorId,
      salaryId: id,
      selectedMonth: monthStartFromInput(text(formData, "month")),
      startMonth,
    });
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function deleteSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");
  const effectiveAt = monthStartFromInput(text(formData, "month"));

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteSalary(transaction, access, id, effectiveAt, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function restoreSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreSalary(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function confirmSalaryReceiptAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const salaryId = text(formData, "salaryId");
  const dueDate = dateFromInput(text(formData, "dueDate"));

  await getDatabase().$transaction(async (transaction) => {
    await confirmSalaryOccurrence(transaction, access, salaryId, dueDate);
  });

  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}

export async function payFixedExpenseOccurrenceAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const fixedExpenseId = text(formData, "fixedExpenseId");
  const dueDate = dateFromInput(text(formData, "dueDate"));
  const paidAt = dateFromInput(text(formData, "paidAt"));
  const amount = parseMoneyInput(text(formData, "amount"));

  await getDatabase().$transaction(async (transaction) => {
    const fixedExpense = await transaction.fixedExpense.findFirstOrThrow({
      where: { id: fixedExpenseId, workspaceId: access.workspaceId },
      select: { accountId: true },
    });
    const accountId = text(formData, "accountId") || fixedExpense.accountId;

    if (!accountId) {
      throw new Error("Informe a conta de pagamento.");
    }
    await payFixedExpenseOccurrence(transaction, access, { accountId, amount, dueDate, fixedExpenseId, paidAt });
  });

  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function undoFixedExpensePaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();

  await getDatabase().$transaction(async (transaction) => {
    await undoFixedExpensePayment(transaction, access, text(formData, "transactionId"));
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
    await payDebtInstallment(transaction, access, {
      accountId,
      amount,
      installmentId,
      notes: optionalText(formData, "notes"),
      paidAt,
    });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function deleteDebtInstallmentPaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const installmentId = text(formData, "installmentId");

  await getDatabase().$transaction(async (transaction) => {
    await undoDebtInstallmentPayment(transaction, access, installmentId);
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function updateDebtMetadataAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "debtId");

  await getDatabase().$transaction(async (transaction) => {
    const current = await transaction.debt.findFirstOrThrow({ where: { active: true, id, workspaceId: access.workspaceId } });
    const { count } = await transaction.debt.updateMany({
      where: { active: true, id, version: expectedVersion(formData), workspaceId: access.workspaceId },
      data: {
        description: text(formData, "description"),
        notes: optionalText(formData, "notes"),
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "Debt", id, "update_metadata", { before: current });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function cancelDebtFutureInstallmentsAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const debtId = text(formData, "debtId");
  const cancelFrom = dateFromInput(text(formData, "cancelFrom"));

  await getDatabase().$transaction(async (transaction) => {
    await cancelDebtFutureInstallments(transaction, access, debtId, cancelFrom, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function refinanceDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const sourceDebtId = text(formData, "debtId");
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const installmentCount = integer(formData, "installmentCount", 1, 240);
  const firstDueDate = dateFromInput(text(formData, "firstDueDate"));
  const startDate = dateFromInput(text(formData, "startDate"));
  const frequency = enumValue(formData, "frequency", ["FORTNIGHTLY", "MONTHLY"]);
  const debtId = randomUUID();

  await getDatabase().$transaction(async (transaction) => {
    const sourceDebt = await transaction.debt.findFirstOrThrow({
      where: { active: true, id: sourceDebtId, workspaceId: access.workspaceId },
    });
    const split = await automaticSplitFromForm(formData, access.workspaceId, sourceDebt.personEditorId, totalAmount);
    const sharePlan = split.explicit ? buildInstallmentSharePlan(totalAmount, installmentCount, split.shares) : [];
    const futureInstallments = await transaction.debtInstallment.findMany({
      where: { debtId: sourceDebt.id, status: "PENDING", transaction: { is: null }, workspaceId: access.workspaceId },
      select: { id: true },
    });
    const futureInstallmentIds = futureInstallments.map(({ id }) => id);

    await transaction.debtInstallment.updateMany({
      where: { id: { in: futureInstallmentIds }, workspaceId: access.workspaceId },
      data: { paidAt: null, status: "CANCELED" },
    });
    await transaction.debtInstallmentShare.updateMany({
      where: { installmentId: { in: futureInstallmentIds }, workspaceId: access.workspaceId },
      data: { paidAt: null, status: "CANCELED" },
    });
    const archivedSource = await transaction.debt.updateMany({
      where: { id: sourceDebt.id, version: expectedVersion(formData), workspaceId: access.workspaceId },
      data: { active: false, canceledAt: startDate, updatedByEditorId: access.editorId, version: { increment: 1 } },
    });
    assertOptimisticUpdate(archivedSource.count);
    await transaction.debt.create({
      data: {
        categoryId: sourceDebt.categoryId,
        createdByEditorId: access.editorId,
        description: text(formData, "description"),
        firstDueDate,
        frequency,
        id: debtId,
        installmentCount,
        notes: optionalText(formData, "notes"),
        personEditorId: sourceDebt.personEditorId,
        startDate,
        totalAmount,
        workspaceId: access.workspaceId,
      },
    });
    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const installmentId = randomUUID();
      await transaction.debtInstallment.create({
        data: {
          amount: installment.amount,
          debtId,
          dueDate: installmentDueDate(firstDueDate, installment.number - 1, frequency),
          id: installmentId,
          number: installment.number,
          personEditorId: sourceDebt.personEditorId,
          workspaceId: access.workspaceId,
        },
      });
      if (split.explicit) {
        for (const share of sharePlan[installment.number - 1]!.shares) {
          await transaction.debtInstallmentShare.create({
            data: {
              amount: share.amount,
              installmentId,
              personEditorId: share.personEditorId,
              workspaceId: access.workspaceId,
            },
          });
        }
      }
    }
    await assertDebtIntegrity(transaction, access.workspaceId, debtId);
    await appendAudit(transaction, access, "Debt", sourceDebt.id, "refinance", { replacementDebtId: debtId });
    await appendAudit(transaction, access, "Debt", debtId, "create_from_refinance", { sourceDebtId: sourceDebt.id });
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
  const frequency = enumValue(formData, "frequency", ["FORTNIGHTLY", "MONTHLY"]);
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const split = await automaticSplitFromForm(formData, access.workspaceId, personEditorId, totalAmount);
  const sharePlan = split.explicit ? buildInstallmentSharePlan(totalAmount, installmentCount, split.shares) : [];
  const version = expectedVersion(formData);

  await getDatabase().$transaction(async (transaction) => {
    const currentDebt = await transaction.debt.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });
    const currentInstallments = await transaction.debtInstallment.findMany({
      where: { debtId: id, workspaceId: access.workspaceId },
      select: { id: true },
    });
    await assertDebtStructureMutable(transaction, access.workspaceId, id);

    const { count } = await transaction.debt.updateMany({
      where: { id, version, workspaceId: access.workspaceId },
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

    assertOptimisticUpdate(count);

    const deletedInstallments = await transaction.debtInstallment.deleteMany({ where: { debtId: id, workspaceId: access.workspaceId } });
    if (deletedInstallments.count !== currentInstallments.length) {
      throw new Error("A dívida foi alterada durante a edição. Tente novamente.");
    }
    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const installmentId = randomUUID();
      const dueDate = installmentDueDate(firstDueDate, installment.number - 1, frequency);

      await transaction.debtInstallment.create({
        data: {
          amount: installment.amount,
          debtId: id,
          dueDate,
          id: installmentId,
          number: installment.number,
          paidAt: null,
          personEditorId,
          status: "PENDING",
          workspaceId: access.workspaceId,
        },
      });

      if (split.explicit) {
        for (const share of sharePlan[installment.number - 1]!.shares) {
          await transaction.debtInstallmentShare.create({
            data: {
              amount: share.amount,
              installmentId,
              paidAt: null,
              personEditorId: share.personEditorId,
              status: "PENDING",
              workspaceId: access.workspaceId,
            },
          });
        }
      }
    }
    await assertDebtIntegrity(transaction, access.workspaceId, id);
    await appendAudit(transaction, access, "Debt", id, "update", { before: currentDebt });
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function deleteDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "debtId");

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteDebt(transaction, access, id, new Date(), expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function restoreDebtAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "debtId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreDebt(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/dividas"));
}

export async function updateCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "cardId");
  const personEditorId = text(formData, "personEditorId");
  const closingDay = integer(formData, "closingDay", 1, 31);
  const dueDay = integer(formData, "dueDay", 1, 31);
  await assertPerson(access.workspaceId, personEditorId);
  const paymentAccountId = optionalText(formData, "paymentAccountId");
  const version = expectedVersion(formData);

  await getDatabase().$transaction(async (transaction) => {
    await assertAccountForPerson(transaction, access.workspaceId, personEditorId, paymentAccountId);
    const current = await transaction.creditCard.findFirstOrThrow({
      where: { id, workspaceId: access.workspaceId },
      include: { _count: { select: { invoices: true, purchases: true } } },
    });
    const hasHistory = current._count.invoices > 0 || current._count.purchases > 0;
    assertCreditCardConfigurationChange(current, { closingDay, dueDay, personEditorId }, hasHistory);

    const { count } = await transaction.creditCard.updateMany({
      where: { id, version, workspaceId: access.workspaceId },
      data: {
        closingDay,
        color: optionalColor(formData),
        dueDay,
        institution: optionalText(formData, "institution"),
        limit: parseNonNegativeMoneyInput(text(formData, "limit")),
        name: text(formData, "name"),
        paymentAccountId,
        personEditorId,
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "CreditCard", id, "update", { before: current });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "cardId");

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteCreditCard(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function restoreCreditCardAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "cardId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreCreditCard(transaction, access, id, expectedVersion(formData));
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const purchaseId = text(formData, "purchaseId");
  const card = await getDatabase().creditCard.findFirstOrThrow({
    where: { active: true, id: text(formData, "cardId"), workspaceId: access.workspaceId },
    select: { closingDay: true, dueDay: true, id: true, personEditorId: true },
  });
  const categoryId = optionalText(formData, "categoryId");
  await assertCategoryKind(getDatabase(), access.workspaceId, categoryId, "EXPENSE");
  const totalAmount = parseMoneyInput(text(formData, "totalAmount"));
  const { personEditorId, split } = await cardPurchaseResponsibilityFromForm(formData, access.workspaceId, card.personEditorId, totalAmount);
  await assertPerson(access.workspaceId, personEditorId);
  const installmentCount = integer(formData, "installmentCount", 1, 120);
  const purchaseDate = dateFromInput(text(formData, "purchaseDate"));
  const firstDueDate = creditCardFirstDueDateFromForm(formData, purchaseDate, card);
  assertFirstDueDateAfterPurchase(purchaseDate, firstDueDate);
  const oldInvoiceIds: string[] = [];
  const newInvoiceIds: string[] = [];

  await getDatabase().$transaction(async (transaction) => {
    const currentPurchase = await transaction.creditCardPurchase.findFirstOrThrow({
      where: { id: purchaseId, workspaceId: access.workspaceId },
    });
    const currentInstallments = await transaction.creditCardInstallment.findMany({
      where: { purchaseId, workspaceId: access.workspaceId },
      select: { id: true, invoiceId: true },
    });
    oldInvoiceIds.push(...currentInstallments.map(({ invoiceId }) => invoiceId).filter((invoiceId): invoiceId is string => Boolean(invoiceId)));
    const installmentIds = currentInstallments.map((installment) => installment.id);
    await assertCreditCardPurchaseHasNoPayments(transaction, access.workspaceId, installmentIds, oldInvoiceIds);

    const deletedTransactions = await transaction.transaction.deleteMany({
      where: { creditCardInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId },
    });
    if (deletedTransactions.count !== currentInstallments.length) {
      throw new Error("A compra possui lançamentos inconsistentes e não pode ser editada.");
    }
    const deletedInstallments = await transaction.creditCardInstallment.deleteMany({ where: { purchaseId, workspaceId: access.workspaceId } });
    if (deletedInstallments.count !== currentInstallments.length) {
      throw new Error("A compra foi alterada durante a edição. Tente novamente.");
    }

    const { count } = await transaction.creditCardPurchase.updateMany({
      where: { id: purchaseId, workspaceId: access.workspaceId },
      data: {
        cardId: card.id,
        categoryId,
        description: text(formData, "description"),
        firstDueDate,
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

    await reconcileCreditCardInvoices(transaction, oldInvoiceIds);
    await transaction.creditCardInvoice.deleteMany({
      where: { amount: 0, id: { in: oldInvoiceIds }, paidAmount: 0, workspaceId: access.workspaceId },
    });

    for (const installment of buildInstallmentPlan(totalAmount, installmentCount)) {
      const dueDate = monthlyDueDate(firstDueDate, installment.number - 1);
      const dueMonth = monthStartFromDate(dueDate);
      const invoiceDueDate = clampDayInMonth(dueMonth, card.dueDay);
      const invoice = await transaction.creditCardInvoice.upsert({
        where: { cardId_month: { cardId: card.id, month: dueMonth } },
        update: { amount: { increment: installment.amount }, dueDate: invoiceDueDate },
        create: {
          amount: installment.amount,
          cardId: card.id,
          dueDate: invoiceDueDate,
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
          status: "OPEN",
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
              status: "OPEN",
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
          settledAt: null,
          status: "PENDING",
          type: "EXPENSE",
          workspaceId: access.workspaceId,
        },
      });
    }

    await reconcileCreditCardInvoices(transaction, newInvoiceIds);
    await appendAudit(transaction, access, "CreditCardPurchase", purchaseId, "update", { before: currentPurchase });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const purchaseId = text(formData, "purchaseId");

  await getDatabase().$transaction(async (transaction) => {
    const purchase = await transaction.creditCardPurchase.findFirstOrThrow({
      where: { id: purchaseId, workspaceId: access.workspaceId },
    });
    const installments = await transaction.creditCardInstallment.findMany({
      where: { purchaseId, workspaceId: access.workspaceId },
      select: { id: true, invoiceId: true },
    });
    const invoiceIds = [...new Set(installments.map(({ invoiceId }) => invoiceId).filter((invoiceId): invoiceId is string => Boolean(invoiceId)))];
    const installmentIds = installments.map((installment) => installment.id);
    await assertCreditCardPurchaseHasNoPayments(transaction, access.workspaceId, installmentIds, invoiceIds);

    await appendAudit(transaction, access, "CreditCardPurchase", purchaseId, "delete", { before: purchase, reason: "unpaid" });
    const deletedTransactions = await transaction.transaction.deleteMany({
      where: { creditCardInstallmentId: { in: installmentIds }, workspaceId: access.workspaceId },
    });
    if (deletedTransactions.count !== installments.length) {
      throw new Error("A compra possui lançamentos inconsistentes e não pode ser excluída.");
    }
    const deletedInstallments = await transaction.creditCardInstallment.deleteMany({ where: { purchaseId, workspaceId: access.workspaceId } });
    if (deletedInstallments.count !== installments.length) {
      throw new Error("A compra foi alterada durante a exclusão. Tente novamente.");
    }
    const deletedPurchase = await transaction.creditCardPurchase.deleteMany({ where: { id: purchaseId, workspaceId: access.workspaceId } });
    assertExactlyOne(deletedPurchase.count, "Compra não encontrada.");

    for (const invoiceId of invoiceIds) {
      const reconciled = await reconcileCreditCardInvoice(transaction, invoiceId);

      if (reconciled.amount.isZero() && reconciled.paidAmount.isZero()) {
        const { count } = await transaction.creditCardInvoice.deleteMany({ where: { id: invoiceId, workspaceId: access.workspaceId } });
        assertExactlyOne(count, "Fatura não encontrada ou já removida.");
      }
    }
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function cancelCreditCardPurchaseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const purchaseId = text(formData, "purchaseId");

  await getDatabase().$transaction(async (transaction) => {
    const purchase = await transaction.creditCardPurchase.findFirstOrThrow({
      where: { id: purchaseId, workspaceId: access.workspaceId },
      include: { installments: { select: { id: true, invoiceId: true } } },
    });
    const installmentIds = purchase.installments.map(({ id }) => id);
    const invoiceIds = [...new Set(purchase.installments.map(({ invoiceId }) => invoiceId).filter((invoiceId): invoiceId is string => Boolean(invoiceId)))];
    await assertCreditCardPurchaseHasNoPayments(transaction, access.workspaceId, installmentIds, invoiceIds);

    await transaction.creditCardPurchase.update({ where: { id: purchase.id }, data: { canceledAt: new Date() } });
    await transaction.creditCardInstallment.updateMany({
      where: { id: { in: installmentIds }, workspaceId: access.workspaceId },
      data: { status: "CANCELED" },
    });
    await reconcileCreditCardInvoices(transaction, invoiceIds);
    await appendAudit(transaction, access, "CreditCardPurchase", purchase.id, "cancel", { before: purchase });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateCreditCardInvoicePaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const paymentId = text(formData, "paymentId");
  const amount = parseMoneyInput(text(formData, "amount"));
  const accountId = text(formData, "accountId");
  const paidAt = dateFromInput(text(formData, "paidAt"));

  await getDatabase().$transaction(async (transaction) => {
    const payment = await transaction.creditCardInvoicePayment.findFirstOrThrow({
      where: { id: paymentId, workspaceId: access.workspaceId },
      include: { installment: { select: { amount: true } }, invoice: true },
    });
    await assertAccountForPerson(transaction, access.workspaceId, payment.personEditorId, accountId, true);

    if (payment.creditCardInstallmentId && (!payment.installment || !money(amount).equals(payment.installment.amount))) {
      throw new Error("Pagamento de parcela deve manter o valor exato da parcela.");
    }

    await transaction.creditCardInvoicePayment.updateMany({
      where: { id: payment.id, workspaceId: access.workspaceId },
      data: {
        accountId,
        amount,
        notes: optionalText(formData, "notes"),
        paidAt,
      },
    });
    await reconcileCreditCardInvoices(transaction, [payment.invoiceId]);
    await appendAudit(transaction, access, "CreditCardInvoicePayment", paymentId, "update", { before: payment });
  });

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
    await appendAudit(transaction, access, "CreditCardInvoicePayment", payment.id, "delete", {
      before: payment,
      reason: "payment_reversed",
    });
    const deletedPayment = await transaction.creditCardInvoicePayment.deleteMany({ where: { id: payment.id, workspaceId: access.workspaceId } });
    assertExactlyOne(deletedPayment.count, "Pagamento da fatura não encontrado.");

    await reconcileCreditCardInvoices(transaction, [payment.invoiceId]);

    if (payment.creditCardInstallmentId) {
      await appendAudit(transaction, access, "CreditCardInstallment", payment.creditCardInstallmentId, "reopen", {
        reason: "payment_reversed",
      });
    }
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function deleteCreditCardInstallmentPaymentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const installmentId = text(formData, "installmentId");

  await getDatabase().$transaction(async (transaction) => {
    const installment = await transaction.creditCardInstallment.findFirstOrThrow({
      where: { id: installmentId, workspaceId: access.workspaceId },
      include: { invoicePayment: true },
    });
    const invoiceIds = installment.invoiceId ? [installment.invoiceId] : [];

    if (installment.invoicePayment) {
      await appendAudit(transaction, access, "CreditCardInvoicePayment", installment.invoicePayment.id, "delete", {
        before: installment.invoicePayment,
        reason: "installment_payment_reversed",
      });
      const deletedPayment = await transaction.creditCardInvoicePayment.deleteMany({
        where: { id: installment.invoicePayment.id, workspaceId: access.workspaceId },
      });
      assertExactlyOne(deletedPayment.count, "Pagamento da parcela não encontrado.");
    }

    await reconcileCreditCardInvoices(transaction, invoiceIds);
    await appendAudit(transaction, access, "CreditCardInstallment", installment.id, "reopen", {
      before: installment,
      reason: "payment_reversed",
    });
  });

  refreshAndRedirect(returnTo(formData, "/cartoes"));
}

export async function updateSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "goalId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const accountId = optionalText(formData, "accountId");

  await getDatabase().$transaction(async (transaction) => {
    await lockSavingsGoal(transaction, access.workspaceId, id);
    const current = await transaction.savingsGoal.findFirstOrThrow({
      where: { id, workspaceId: access.workspaceId },
      include: { _count: { select: { movements: true } } },
    });
    await assertAccountForPerson(transaction, access.workspaceId, personEditorId, accountId);
    if (current._count.movements > 0 && (current.personEditorId !== personEditorId || current.accountId !== accountId)) {
      throw new Error("A pessoa e a conta de um cofrinho movimentado não podem ser alteradas.");
    }
    await transaction.savingsGoal.update({
      where: { id },
      data: {
        accountId,
        deadline: optionalText(formData, "deadline") ? dateFromInput(text(formData, "deadline")) : null,
        description: optionalText(formData, "description"),
        name: text(formData, "name"),
        personEditorId,
        targetAmount: parseMoneyInput(text(formData, "targetAmount")),
      },
    });
    await appendAudit(transaction, access, "SavingsGoal", id, "update", { before: current });
  });
  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function deleteSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "goalId");

  await getDatabase().$transaction(async (transaction) => {
    await archiveOrDeleteSavingsGoal(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function restoreSavingsGoalAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "goalId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreSavingsGoal(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function updateSavingsGoalMovementAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const movementId = text(formData, "movementId");
  const amount = parseMoneyInput(text(formData, "amount"));
  const type = enumValue(formData, "type", ["WITHDRAWAL", "DEPOSIT"]);

  await getDatabase().$transaction(async (transaction) => {
    await updateSavingsGoalMovement(transaction, access, {
      amount,
      movementDate: dateFromInput(text(formData, "movementDate")),
      movementId,
      notes: optionalText(formData, "notes"),
      type,
    });
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function deleteSavingsGoalMovementAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const movementId = text(formData, "movementId");

  await getDatabase().$transaction(async (transaction) => {
    await deleteSavingsGoalMovement(transaction, access, movementId);
  });

  refreshAndRedirect(returnTo(formData, "/cofrinhos"));
}

export async function updateInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "investmentId");
  const personEditorId = text(formData, "personEditorId");
  await assertPerson(access.workspaceId, personEditorId);
  const accountId = optionalText(formData, "accountId");
  await assertInvestmentAccountForPerson(getDatabase(), access.workspaceId, personEditorId, accountId);
  const { count } = await getDatabase().investment.updateMany({
    where: { id, workspaceId: access.workspaceId },
    data: {
      accountId,
      amount: parseNonNegativeMoneyInput(text(formData, "amount")),
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
    await archiveInvestment(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/investimentos"));
}

export async function restoreInvestmentAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "investmentId");

  await getDatabase().$transaction(async (transaction) => {
    await restoreInvestment(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/investimentos"));
}

export async function updateTransferAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transferId");
  const sourceAccountId = text(formData, "sourceAccountId");
  const destinationAccountId = text(formData, "destinationAccountId");

  await getDatabase().$transaction(async (transaction) => {
    await updateTransfer(transaction, access, {
      amount: parseMoneyInput(text(formData, "amount")),
      destinationAccountId,
      expectedVersion: expectedVersion(formData),
      notes: optionalText(formData, "notes"),
      sourceAccountId,
      transferDate: dateFromInput(text(formData, "transferDate")),
      transferId: id,
    });
  });

  refreshAndRedirect(returnTo(formData, "/transferencias"));
}

export async function deleteTransferAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "transferId");

  await getDatabase().$transaction(async (transaction) => {
    await deleteTransfer(transaction, access, id);
  });

  refreshAndRedirect(returnTo(formData, "/transferencias"));
}

export async function archiveFixedExpenseAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "fixedExpenseId");
  const endedAt = dayBefore(addMonths(monthStartFromInput(text(formData, "month")), 1));
  await getDatabase().$transaction(async (transaction) => {
    const current = await transaction.fixedExpense.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });
    const { count } = await transaction.fixedExpense.updateMany({
      where: { active: true, id, version: expectedVersion(formData), workspaceId: access.workspaceId },
      data: {
        active: false,
        endedAt,
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "FixedExpense", id, "archive", { before: current, endedAt });
  });
  refreshAndRedirect(returnTo(formData, "/despesas-fixas"));
}

export async function archiveSalaryAction(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = text(formData, "salaryId");
  const archivedAt = dayBefore(addMonths(monthStartFromInput(text(formData, "month")), 1));
  await getDatabase().$transaction(async (transaction) => {
    const current = await transaction.salary.findFirstOrThrow({ where: { id, workspaceId: access.workspaceId } });
    const { count } = await transaction.salary.updateMany({
      where: { active: true, id, version: expectedVersion(formData), workspaceId: access.workspaceId },
      data: {
        active: false,
        archivedAt,
        updatedByEditorId: access.editorId,
        version: { increment: 1 },
      },
    });
    assertOptimisticUpdate(count);
    await appendAudit(transaction, access, "Salary", id, "archive", { archivedAt, before: current });
  });
  refreshAndRedirect(returnTo(formData, "/recebimentos"));
}
