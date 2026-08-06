"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  firstValidationMessage,
  identifierSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const dateInputSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), "Informe uma data válida.");

const optionalDateInputSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  dateInputSchema.optional(),
);

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  identifierSchema.nullable(),
);

const optionalNotesSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const transactionSchema = z
  .object({
    accountId: identifierSchema,
    amount: positiveMoneyInputSchema,
    categoryId: optionalIdentifierSchema,
    competenceDate: dateInputSchema,
    description: z
      .string()
      .trim()
      .min(2, "Informe uma descrição com pelo menos 2 caracteres.")
      .max(160),
    dueDate: optionalDateInputSchema,
    notes: optionalNotesSchema,
    settledDate: optionalDateInputSchema,
    status: z.enum(["PENDING", "SETTLED"]),
    type: z.enum(["INCOME", "EXPENSE"]),
  })
  .superRefine((value, context) => {
    if (value.status === "SETTLED" && !value.settledDate) {
      context.addIssue({
        code: "custom",
        message: "Informe a data de pagamento ou recebimento.",
        path: ["settledDate"],
      });
    }
  });

const updateTransactionSchema = transactionSchema.extend({
  id: identifierSchema,
  version: versionSchema,
});

const cancelTransactionSchema = z.object({
  id: identifierSchema,
  version: versionSchema,
});

function transactionInput(formData: FormData) {
  return {
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    competenceDate: formData.get("competenceDate"),
    description: formData.get("description"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes"),
    settledDate: formData.get("settledDate"),
    status: formData.get("status"),
    type: formData.get("type"),
  };
}

async function relationsAreValid(
  workspaceId: string,
  accountId: string,
  categoryId: string | null,
  type: "INCOME" | "EXPENSE",
  requireActive: boolean,
) {
  const database = getDatabase();
  const [account, category] = await Promise.all([
    database.financialAccount.findFirst({
      where: { id: accountId, workspaceId, ...(requireActive ? { active: true } : {}) },
      select: { id: true },
    }),
    categoryId
      ? database.category.findFirst({
          where: {
            id: categoryId,
            workspaceId,
            kind: type,
            ...(requireActive ? { active: true } : {}),
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return Boolean(account && (!categoryId || category));
}

export async function createTransactionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transactionSchema.safeParse(transactionInput(formData));

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const validRelations = await relationsAreValid(
    access.workspaceId,
    parsed.data.accountId,
    parsed.data.categoryId,
    parsed.data.type,
    true,
  );

  if (!validRelations) {
    return { error: "Selecione uma conta e uma categoria compatíveis e ativas." };
  }

  const { settledDate, ...data } = parsed.data;
  const database = getDatabase();

  try {
    await database.$transaction(async (transaction) => {
      const created = await transaction.transaction.create({
        data: {
          workspaceId: access.workspaceId,
          ...data,
          settledAt: data.status === "SETTLED" ? settledDate : null,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "transaction.created",
          entityType: "Transaction",
          entityId: created.id,
          metadata: { amount: data.amount, type: data.type },
        },
      });
    });
  } catch {
    return { error: "Não foi possível criar o lançamento. Tente novamente." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  redirect("/lancamentos");
}

export async function updateTransactionAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateTransactionSchema.safeParse({
    ...transactionInput(formData),
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const validRelations = await relationsAreValid(
    access.workspaceId,
    parsed.data.accountId,
    parsed.data.categoryId,
    parsed.data.type,
    false,
  );

  if (!validRelations) {
    return { error: "A conta ou categoria selecionada não está disponível." };
  }

  const { id, settledDate, version, ...data } = parsed.data;
  const database = getDatabase();

  try {
    const updated = await database.$transaction(async (transaction) => {
      const result = await transaction.transaction.updateMany({
        where: {
          id,
          workspaceId: access.workspaceId,
          version,
          status: { not: "CANCELED" },
          debtInstallment: { is: null },
          fixedExpense: { is: null },
        },
        data: {
          ...data,
          settledAt: data.status === "SETTLED" ? settledDate : null,
          version: { increment: 1 },
        },
      });

      if (result.count !== 1) {
        return false;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "transaction.updated",
          entityType: "Transaction",
          entityId: id,
          metadata: { amount: data.amount, type: data.type },
        },
      });

      return true;
    });

    if (!updated) {
      return { error: "Este lançamento foi alterado em outro dispositivo. Recarregue a página." };
    }
  } catch {
    return { error: "Não foi possível salvar o lançamento. Tente novamente." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  redirect("/lancamentos");
}

export async function cancelTransactionAction(formData: FormData): Promise<void> {
  const parsed = cancelTransactionSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const result = await transaction.transaction.updateMany({
      where: {
        id: parsed.data.id,
        workspaceId: access.workspaceId,
        version: parsed.data.version,
        status: { not: "CANCELED" },
        debtInstallment: { is: null },
        fixedExpense: { is: null },
      },
      data: { status: "CANCELED", settledAt: null, version: { increment: 1 } },
    });

    if (result.count === 1) {
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "transaction.canceled",
          entityType: "Transaction",
          entityId: parsed.data.id,
        },
      });
    }
  });

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
}
