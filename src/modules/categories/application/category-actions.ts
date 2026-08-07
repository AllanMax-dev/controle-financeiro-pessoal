"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  colorSchema,
  firstValidationMessage,
  identifierSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(100),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: colorSchema,
});

const updateCategorySchema = categorySchema.extend({
  id: identifierSchema,
  version: versionSchema,
});

const toggleCategorySchema = z.object({
  id: identifierSchema,
  version: versionSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

function categoryInput(formData: FormData) {
  return {
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color"),
  };
}

export async function createCategoryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = categorySchema.safeParse(categoryInput(formData));

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  try {
    await database.$transaction(async (transaction) => {
      const category = await transaction.category.create({
        data: {
          workspaceId: access.workspaceId,
          ...parsed.data,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "category.created",
          entityType: "Category",
          entityId: category.id,
          metadata: { kind: category.kind, name: category.name },
        },
      });
    });
  } catch {
    return { error: "Não foi possível criar a categoria. Verifique se o nome já está em uso." };
  }

  revalidatePath("/categorias");
  redirect("/categorias");
}

export async function updateCategoryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateCategorySchema.safeParse({
    ...categoryInput(formData),
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const { id, version, ...data } = parsed.data;
  const database = getDatabase();
  const current = await database.category.findFirst({
    where: { id, workspaceId: access.workspaceId, version },
    select: {
      kind: true,
      _count: {
        select: {
          budgets: true,
          debts: true,
          fixedExpenses: true,
          salaries: true,
          transactions: true,
        },
      },
    },
  });

  if (!current) {
    return { error: "Esta categoria foi alterada em outro dispositivo. Recarregue a página." };
  }

  const usageCount = Object.values(current._count).reduce((total, count) => total + count, 0);

  if (current.kind !== data.kind && usageCount > 0) {
    return {
      error:
        "Uma categoria já utilizada não pode mudar entre receita e despesa. Crie outra categoria para a nova finalidade.",
    };
  }

  try {
    const updated = await database.$transaction(async (transaction) => {
      const result = await transaction.category.updateMany({
        where: { id, workspaceId: access.workspaceId, version },
        data: { ...data, version: { increment: 1 } },
      });

      if (result.count !== 1) {
        return false;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "category.updated",
          entityType: "Category",
          entityId: id,
          metadata: { kind: data.kind, name: data.name },
        },
      });

      return true;
    });

    if (!updated) {
      return { error: "Esta categoria foi alterada em outro dispositivo. Recarregue a página." };
    }
  } catch {
    return { error: "Não foi possível salvar a categoria. Verifique os dados informados." };
  }

  revalidatePath("/categorias");
  revalidatePath("/lancamentos");
  revalidatePath("/planejamento");
  revalidatePath("/painel");
  redirect("/categorias");
}

export async function toggleCategoryActiveAction(formData: FormData): Promise<void> {
  const parsed = toggleCategorySchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
    active: formData.get("active"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const { id, version, active } = parsed.data;
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const result = await transaction.category.updateMany({
      where: { id, workspaceId: access.workspaceId, version },
      data: { active, version: { increment: 1 } },
    });

    if (result.count === 1) {
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: active ? "category.activated" : "category.archived",
          entityType: "Category",
          entityId: id,
        },
      });
    }
  });

  revalidatePath("/categorias");
  revalidatePath("/lancamentos");
}
