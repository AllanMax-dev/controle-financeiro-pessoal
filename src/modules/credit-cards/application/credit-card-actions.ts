"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  createCreditCardInstallmentPlan,
  invoiceDates,
  invoiceMonthForPurchase,
} from "@/modules/credit-cards/domain/credit-card-schedule";
import {
  contextHref,
  getAccessibleFinancialContexts,
  resolveWritableFinancialContext,
} from "@/modules/financial-contexts/application/financial-contexts";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  colorSchema,
  dateInputSchema,
  firstValidationMessage,
  identifierSchema,
  positiveMoneyInputSchema,
} from "@/modules/shared/application/form-schemas";

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  identifierSchema.nullable(),
);

const optionalTextSchema = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).nullable(),
  );

const creditCardSchema = z.object({
  closingDay: z.coerce.number().int().min(1).max(31),
  color: colorSchema,
  contextId: identifierSchema,
  dueDay: z.coerce.number().int().min(1).max(31),
  institution: optionalTextSchema(100),
  limit: positiveMoneyInputSchema,
  name: z.string().trim().min(2, "Informe o nome do cartão.").max(100),
  paymentAccountId: optionalIdentifierSchema,
});

const creditCardPurchaseSchema = z.object({
  categoryId: optionalIdentifierSchema,
  creditCardId: identifierSchema,
  description: z.string().trim().min(2, "Informe uma descrição.").max(160),
  installmentCount: z.coerce.number().int().min(1).max(48),
  notes: optionalTextSchema(1000),
  purchaseDate: dateInputSchema,
  totalAmount: positiveMoneyInputSchema,
});

function revalidateCreditCardPaths() {
  revalidatePath("/cartoes");
  revalidatePath("/painel");
  revalidatePath("/relatorios");
}

export async function createCreditCardAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = creditCardSchema.safeParse({
    closingDay: formData.get("closingDay"),
    color: formData.get("color"),
    contextId: formData.get("contextId"),
    dueDay: formData.get("dueDay"),
    institution: formData.get("institution"),
    limit: formData.get("limit"),
    name: formData.get("name"),
    paymentAccountId: formData.get("paymentAccountId"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const financialContext = await resolveWritableFinancialContext(access, parsed.data.contextId);
  const contextId = financialContext.id;
  const database = getDatabase();

  if (parsed.data.paymentAccountId) {
    const account = await database.financialAccount.findFirst({
      where: {
        active: true,
        contextId,
        id: parsed.data.paymentAccountId,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    if (!account) {
      return { error: "A conta de pagamento não está disponível neste contexto." };
    }
  }

  try {
    await database.$transaction(async (transaction) => {
      const card = await transaction.creditCard.create({
        data: {
          ...parsed.data,
          workspaceId: access.workspaceId,
          contextId,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
          actorEditorId: access.editorId,
          action: "credit_card.created",
          entityType: "CreditCard",
          entityId: card.id,
          metadata: { limit: parsed.data.limit, name: parsed.data.name },
        },
      });
    });
  } catch {
    return { error: "Não foi possível criar o cartão. Verifique se o nome já está em uso." };
  }

  revalidateCreditCardPaths();
  return { error: null, success: "Cartão criado." };
}

export async function createCreditCardPurchaseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = creditCardPurchaseSchema.safeParse({
    categoryId: formData.get("categoryId"),
    creditCardId: formData.get("creditCardId"),
    description: formData.get("description"),
    installmentCount: formData.get("installmentCount"),
    notes: formData.get("notes"),
    purchaseDate: formData.get("purchaseDate"),
    totalAmount: formData.get("totalAmount"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const database = getDatabase();
  const [card, category] = await Promise.all([
    database.creditCard.findFirst({
      where: {
        active: true,
        contextId: { in: accessibleContextIds },
        id: parsed.data.creditCardId,
        workspaceId: access.workspaceId,
      },
      select: { closingDay: true, contextId: true, dueDay: true, id: true, name: true },
    }),
    parsed.data.categoryId
      ? database.category.findFirst({
          where: {
            active: true,
            id: parsed.data.categoryId,
            kind: "EXPENSE",
            workspaceId: access.workspaceId,
          },
          select: { contextId: true, id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!card) {
    return { error: "O cartão selecionado não está disponível." };
  }

  if (parsed.data.categoryId && (!category || category.contextId !== card.contextId)) {
    return { error: "A categoria selecionada não pertence ao contexto do cartão." };
  }

  const firstInvoiceMonth = invoiceMonthForPurchase(parsed.data.purchaseDate, card.closingDay);
  const plan = createCreditCardInstallmentPlan(
    parsed.data.totalAmount,
    parsed.data.installmentCount,
    firstInvoiceMonth,
  );

  try {
    await database.$transaction(async (transaction) => {
      const purchase = await transaction.creditCardPurchase.create({
        data: {
          categoryId: parsed.data.categoryId,
          contextId: card.contextId,
          creditCardId: card.id,
          description: parsed.data.description,
          firstInvoiceMonth,
          installmentCount: parsed.data.installmentCount,
          notes: parsed.data.notes,
          purchaseDate: parsed.data.purchaseDate,
          totalAmount: parsed.data.totalAmount,
          workspaceId: access.workspaceId,
        },
      });

      for (const installment of plan) {
        const dates = invoiceDates(installment.dueMonth, card.closingDay, card.dueDay);
        const invoice = await transaction.creditCardInvoice.upsert({
          where: {
            creditCardId_month: {
              creditCardId: card.id,
              month: installment.dueMonth,
            },
          },
          update: {
            amount: { increment: installment.amount.toFixed(2) },
          },
          create: {
            amount: installment.amount.toFixed(2),
            closesAt: dates.closesAt,
            contextId: card.contextId,
            creditCardId: card.id,
            dueDate: dates.dueDate,
            month: installment.dueMonth,
            workspaceId: access.workspaceId,
          },
          select: { id: true },
        });

        await transaction.creditCardPurchaseInstallment.create({
          data: {
            amount: installment.amount.toFixed(2),
            contextId: card.contextId,
            dueMonth: installment.dueMonth,
            invoiceId: invoice.id,
            number: installment.number,
            purchaseId: purchase.id,
            workspaceId: access.workspaceId,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: card.contextId,
          actorEditorId: access.editorId,
          action: "credit_card_purchase.created",
          entityType: "CreditCardPurchase",
          entityId: purchase.id,
          metadata: {
            cardName: card.name,
            installments: parsed.data.installmentCount,
            totalAmount: parsed.data.totalAmount,
          },
        },
      });
    });
  } catch {
    return { error: "Não foi possível registrar a compra no cartão." };
  }

  revalidateCreditCardPaths();
  redirect(contextHref("/cartoes", card.contextId));
}
