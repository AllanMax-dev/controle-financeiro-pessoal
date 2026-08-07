"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  firstValidationMessage,
  identifierSchema,
  monthInputSchema,
  moneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const nonnegativeMoneySchema = moneyInputSchema.refine(
  (value) => Number(value) >= 0,
  "O orçamento não pode ser negativo.",
);

const budgetSchema = z
  .object({
    amount: nonnegativeMoneySchema,
    categoryId: identifierSchema,
    id: z.preprocess(
      (value) => (value === "" || value === null ? null : value),
      identifierSchema.nullable(),
    ),
    month: monthInputSchema,
    version: z.preprocess(
      (value) => (value === "" || value === null ? null : value),
      versionSchema.nullable(),
    ),
  })
  .superRefine((value, context) => {
    if (Boolean(value.id) !== Boolean(value.version)) {
      context.addIssue({
        code: "custom",
        message: "Recarregue a página antes de salvar este orçamento.",
        path: ["version"],
      });
    }
  });

export async function saveBudgetAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = budgetSchema.safeParse({
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    id: formData.get("id"),
    month: formData.get("month"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();
  const category = await database.category.findFirst({
    where: {
      id: parsed.data.categoryId,
      workspaceId: access.workspaceId,
      kind: "EXPENSE",
      active: true,
    },
    select: { id: true, name: true },
  });

  if (!category) {
    return { error: "Esta categoria de despesa não está disponível." };
  }

  try {
    const saved = await database.$transaction(async (transaction) => {
      let budgetId: string;

      if (parsed.data.id && parsed.data.version) {
        const result = await transaction.budget.updateMany({
          where: {
            categoryId: parsed.data.categoryId,
            id: parsed.data.id,
            month: parsed.data.month,
            workspaceId: access.workspaceId,
            version: parsed.data.version,
          },
          data: { amount: parsed.data.amount, version: { increment: 1 } },
        });

        if (result.count !== 1) {
          return false;
        }

        budgetId = parsed.data.id;
      } else {
        const budget = await transaction.budget.create({
          data: {
            workspaceId: access.workspaceId,
            categoryId: parsed.data.categoryId,
            month: parsed.data.month,
            amount: parsed.data.amount,
          },
        });
        budgetId = budget.id;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "budget.saved",
          entityType: "Budget",
          entityId: budgetId,
          metadata: { amount: parsed.data.amount, category: category.name },
        },
      });

      return true;
    });

    if (!saved) {
      return { error: "Este orçamento foi alterado em outro dispositivo. Recarregue a página." };
    }
  } catch {
    return { error: "Não foi possível salvar o orçamento. Recarregue a página e tente novamente." };
  }

  revalidatePath("/planejamento");
  revalidatePath("/painel");
  return { error: null, success: "Orçamento salvo." };
}
