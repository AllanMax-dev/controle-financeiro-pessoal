"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  createDebtInstallmentPlan,
  isFortnightlyDueDate,
} from "@/modules/debts/domain/installment-plan";
import {
  contextHref,
  getWritableFinancialContextIds,
  resolveWritableFinancialContext,
} from "@/modules/financial-contexts/application/financial-contexts";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  dateInputSchema,
  firstValidationMessage,
  identifierSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  identifierSchema.nullable(),
);

const optionalNotesSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const optionalCardNameSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(100).nullable(),
);

const debtSchema = z
  .object({
    cardName: optionalCardNameSchema,
    categoryId: identifierSchema,
    contextId: identifierSchema,
    description: z.string().trim().min(2, "Informe uma descrição.").max(160),
    firstDueDate: dateInputSchema,
    historicalAccountId: optionalIdentifierSchema,
    installmentCount: z.coerce.number().int().min(1).max(120),
    installmentFrequency: z.enum(["MONTHLY", "FORTNIGHTLY"]),
    notes: optionalNotesSchema,
    paidInstallments: z.coerce.number().int().min(0).max(120),
    paymentMethod: z.enum(["CREDIT_CARD", "OTHER"]),
    purchaseDate: dateInputSchema,
    totalAmount: positiveMoneyInputSchema,
  })
  .superRefine((value, context) => {
    if (value.firstDueDate < value.purchaseDate) {
      context.addIssue({
        code: "custom",
        message: "O primeiro vencimento não pode ser anterior à compra.",
        path: ["firstDueDate"],
      });
    }

    if (value.paidInstallments > value.installmentCount) {
      context.addIssue({
        code: "custom",
        message: "As parcelas pagas não podem superar o total de parcelas.",
        path: ["paidInstallments"],
      });
    }

    if (
      value.installmentFrequency === "FORTNIGHTLY" &&
      !isFortnightlyDueDate(value.firstDueDate)
    ) {
      context.addIssue({
        code: "custom",
        message: "O primeiro vencimento quinzenal deve ocorrer no dia 15 ou 30.",
        path: ["firstDueDate"],
      });
    }

    if (value.paidInstallments > 0 && !value.historicalAccountId) {
      context.addIssue({
        code: "custom",
        message: "Selecione a conta usada como referência para o histórico.",
        path: ["historicalAccountId"],
      });
    }

    if (value.paymentMethod === "CREDIT_CARD" && !value.cardName) {
      context.addIssue({
        code: "custom",
        message: "Informe o nome do cartão.",
        path: ["cardName"],
      });
    }
  });

const shareSchema = z.object({
  amount: positiveMoneyInputSchema,
  editorId: identifierSchema,
});

const payInstallmentSchema = z.object({
  accountId: identifierSchema,
  id: identifierSchema,
  paymentDate: dateInputSchema,
  version: versionSchema,
});

const cancelDebtSchema = z.object({ id: identifierSchema, version: versionSchema });

function readShares(formData: FormData) {
  const candidates = [
    { amount: formData.get("firstShareAmount"), editorId: formData.get("firstEditorId") },
    { amount: formData.get("secondShareAmount"), editorId: formData.get("secondEditorId") },
  ];

  return candidates
    .filter(({ amount, editorId }) => amount !== "" && editorId !== "")
    .map((candidate) => shareSchema.safeParse(candidate));
}

export async function createDebtAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = debtSchema.safeParse({
    cardName: formData.get("cardName"),
    categoryId: formData.get("categoryId"),
    contextId: formData.get("contextId"),
    description: formData.get("description"),
    firstDueDate: formData.get("firstDueDate"),
    historicalAccountId: formData.get("historicalAccountId"),
    installmentCount: formData.get("installmentCount"),
    installmentFrequency: formData.get("installmentFrequency"),
    notes: formData.get("notes"),
    paidInstallments: formData.get("paidInstallments"),
    paymentMethod: formData.get("paymentMethod"),
    purchaseDate: formData.get("purchaseDate"),
    totalAmount: formData.get("totalAmount"),
  });
  const parsedShares = readShares(formData);

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const invalidShare = parsedShares.find((share) => !share.success);

  if (invalidShare && !invalidShare.success) {
    return { error: firstValidationMessage(invalidShare.error) };
  }

  const shares = parsedShares.flatMap((share) => (share.success ? [share.data] : []));

  if (shares.length === 0) {
    return { error: "Informe pelo menos uma pessoa responsável pela dívida." };
  }

  let plan;

  try {
    plan = createDebtInstallmentPlan({
      firstDueDate: parsed.data.firstDueDate,
      installmentCount: parsed.data.installmentCount,
      installmentFrequency: parsed.data.installmentFrequency,
      paidInstallments: parsed.data.paidInstallments,
      shares,
      totalAmount: parsed.data.totalAmount,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Revise a divisão da dívida." };
  }

  const access = await requireCurrentAccess();
  const financialContext = await resolveWritableFinancialContext(access, parsed.data.contextId);
  const contextId = financialContext.id;
  const database = getDatabase();
  const editorIds = shares.map(({ editorId }) => editorId);
  const [category, editorCount, historicalAccount] = await Promise.all([
    database.category.findFirst({
      where: {
        contextId,
        id: parsed.data.categoryId,
        workspaceId: access.workspaceId,
        kind: "EXPENSE",
        active: true,
      },
      select: { id: true },
    }),
    database.editor.count({
      where: { id: { in: editorIds }, workspaceId: access.workspaceId, active: true },
    }),
    parsed.data.historicalAccountId
      ? database.financialAccount.findFirst({
          where: {
            contextId,
            id: parsed.data.historicalAccountId,
            workspaceId: access.workspaceId,
            active: true,
            type: { not: "INVESTMENT" },
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (!category || editorCount !== editorIds.length) {
    return { error: "A categoria ou uma das pessoas responsáveis não está disponível." };
  }

  if (parsed.data.paidInstallments > 0 && !historicalAccount) {
    return { error: "A conta escolhida para o histórico não está disponível." };
  }

  if (
    financialContext.type === "PERSONAL" &&
    (shares.length !== 1 || shares[0]?.editorId !== financialContext.ownerEditorId)
  ) {
    return { error: "No contexto pessoal, cadastre a dívida apenas para a própria pessoa." };
  }

  try {
    await database.$transaction(async (transaction) => {
      const debt = await transaction.debt.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
          cardName: parsed.data.paymentMethod === "CREDIT_CARD" ? parsed.data.cardName : null,
          categoryId: parsed.data.categoryId,
          description: parsed.data.description,
          firstDueDate: parsed.data.firstDueDate,
          installmentCount: parsed.data.installmentCount,
          installmentFrequency: parsed.data.installmentFrequency,
          notes: parsed.data.notes,
          paymentMethod: parsed.data.paymentMethod,
          purchaseDate: parsed.data.purchaseDate,
          totalAmount: parsed.data.totalAmount,
        },
      });

      for (const installment of plan) {
        const historicalTransaction = installment.historical
          ? await transaction.transaction.create({
              data: {
                workspaceId: access.workspaceId,
                contextId,
                accountId: historicalAccount!.id,
                affectsBalance: false,
                amount: installment.amount.toFixed(2),
                categoryId: parsed.data.categoryId,
                competenceDate: installment.dueDate,
                description: `${parsed.data.description} (${installment.number}/${parsed.data.installmentCount})`,
                dueDate: installment.dueDate,
                notes: "Parcela histórica importada; não altera o saldo atual.",
                settledAt: installment.dueDate,
                status: "SETTLED",
                type: "EXPENSE",
              },
              select: { id: true },
            })
          : null;

        await transaction.debtInstallment.create({
          data: {
            amount: installment.amount.toFixed(2),
            debtId: debt.id,
            dueDate: installment.dueDate,
            historical: installment.historical,
            number: installment.number,
            paidAt: installment.historical ? installment.dueDate : null,
            status: installment.status,
            transactionId: historicalTransaction?.id,
            shares: {
              create: installment.shares.map((share) => ({
                amount: share.amount.toFixed(2),
                editorId: share.editorId,
              })),
            },
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
          actorEditorId: access.editorId,
          action: "debt.created",
          entityType: "Debt",
          entityId: debt.id,
          metadata: {
            installments: parsed.data.installmentCount,
            installmentFrequency: parsed.data.installmentFrequency,
            paidInstallments: parsed.data.paidInstallments,
            totalAmount: parsed.data.totalAmount,
          },
        },
      });
    }, { timeout: 20_000 });
  } catch {
    return { error: "Não foi possível cadastrar a dívida. Revise os dados e tente novamente." };
  }

  revalidatePath("/dividas");
  revalidatePath("/painel");
  revalidatePath("/lancamentos");
  redirect(contextHref("/dividas", contextId));
}

export async function payDebtInstallmentAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = payInstallmentSchema.safeParse({
    accountId: formData.get("accountId"),
    id: formData.get("id"),
    paymentDate: formData.get("paymentDate"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = await getWritableFinancialContextIds(access);
  const database = getDatabase();
  const account = await database.financialAccount.findFirst({
    where: {
      contextId: { in: accessibleContextIds },
      id: parsed.data.accountId,
      workspaceId: access.workspaceId,
      active: true,
      type: { not: "INVESTMENT" },
    },
    select: { contextId: true, id: true },
  });

  if (!account) {
    return { error: "A conta selecionada não está disponível." };
  }

  try {
    const paid = await database.$transaction(async (transaction) => {
      const installment = await transaction.debtInstallment.findFirst({
        where: {
          id: parsed.data.id,
          debt: {
            contextId: { in: accessibleContextIds },
            workspaceId: access.workspaceId,
            canceledAt: null,
          },
          status: "PENDING",
        },
        include: { debt: true },
      });

      if (!installment) {
        return false;
      }

      if (account.contextId !== installment.debt.contextId) {
        return false;
      }

      const financialTransaction = await transaction.transaction.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: installment.debt.contextId,
          accountId: parsed.data.accountId,
          affectsBalance: true,
          amount: installment.amount,
          categoryId: installment.debt.categoryId,
          competenceDate: parsed.data.paymentDate,
          description: `${installment.debt.description} (${installment.number}/${installment.debt.installmentCount})`,
          dueDate: installment.dueDate,
          notes: "Pagamento de parcela de dívida.",
          settledAt: parsed.data.paymentDate,
          status: "SETTLED",
          type: "EXPENSE",
        },
      });
      const result = await transaction.debtInstallment.updateMany({
        where: {
          id: installment.id,
          status: "PENDING",
          version: parsed.data.version,
        },
        data: {
          paidAt: parsed.data.paymentDate,
          status: "PAID",
          transactionId: financialTransaction.id,
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        throw new Error("installment_conflict");
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: installment.debt.contextId,
          actorEditorId: access.editorId,
          action: "debt.installment_paid",
          entityType: "DebtInstallment",
          entityId: installment.id,
          metadata: { amount: installment.amount.toFixed(2), number: installment.number },
        },
      });

      return true;
    });

    if (!paid) {
      return { error: "Esta parcela não está mais disponível para pagamento." };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "installment_conflict") {
      return { error: "Esta parcela foi alterada em outro dispositivo. Recarregue a página." };
    }

    return { error: "Não foi possível registrar o pagamento. Tente novamente." };
  }

  revalidatePath("/dividas");
  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios");
  return { error: null, success: "Parcela marcada como paga." };
}

export async function cancelDebtAction(formData: FormData): Promise<void> {
  const parsed = cancelDebtSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = await getWritableFinancialContextIds(access);
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const debt = await transaction.debt.findFirst({
      where: {
        contextId: { in: accessibleContextIds },
        id: parsed.data.id,
        workspaceId: access.workspaceId,
        canceledAt: null,
        version: parsed.data.version,
      },
      select: {
        contextId: true,
        description: true,
        installments: { select: { status: true, transactionId: true } },
      },
    });

    if (!debt) {
      return;
    }

    const hasFinancialHistory = debt.installments.some(
      ({ status, transactionId }) => status !== "PENDING" || Boolean(transactionId),
    );

    if (hasFinancialHistory) {
      return;
    }

    await transaction.debt.delete({ where: { id: parsed.data.id } });
    await transaction.auditLog.create({
      data: {
        workspaceId: access.workspaceId,
        contextId: debt.contextId,
        actorEditorId: access.editorId,
        action: "debt.deleted",
        entityType: "Debt",
        entityId: parsed.data.id,
        metadata: { description: debt.description, removedInstallments: debt.installments.length },
      },
    });
  });

  revalidatePath("/dividas");
  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios");
}
