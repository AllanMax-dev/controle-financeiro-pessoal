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
  moneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  identifierSchema.nullable(),
);

const accountSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome com pelo menos 2 caracteres.").max(100),
  ownerEditorId: optionalIdentifierSchema,
  type: z.enum(["CHECKING", "SAVINGS", "CASH", "DIGITAL", "INVESTMENT", "OTHER"]),
  initialBalance: moneyInputSchema,
  color: colorSchema,
});

const updateAccountSchema = accountSchema.extend({
  id: identifierSchema,
  version: versionSchema,
});

const toggleAccountSchema = z.object({
  id: identifierSchema,
  version: versionSchema,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

const deleteAccountSchema = z.object({
  id: identifierSchema,
  version: versionSchema,
});

function accountInput(formData: FormData) {
  return {
    name: formData.get("name"),
    ownerEditorId: formData.get("ownerEditorId"),
    type: formData.get("type"),
    initialBalance: formData.get("initialBalance"),
    color: formData.get("color"),
  };
}

export async function createAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = accountSchema.safeParse(accountInput(formData));

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  try {
    await database.$transaction(async (transaction) => {
      if (parsed.data.ownerEditorId) {
        const ownerEditor = await transaction.editor.findFirst({
          where: {
            active: true,
            id: parsed.data.ownerEditorId,
            workspaceId: access.workspaceId,
          },
          select: { id: true },
        });

        if (!ownerEditor) {
          throw new Error("owner_editor_unavailable");
        }
      }

      const account = await transaction.financialAccount.create({
        data: {
          workspaceId: access.workspaceId,
          ...parsed.data,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "account.created",
          entityType: "FinancialAccount",
          entityId: account.id,
          metadata: { name: account.name },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "owner_editor_unavailable") {
      return { error: "A pessoa responsável não está disponível." };
    }

    return { error: "Não foi possível criar a conta. Verifique se o nome já está em uso." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  redirect("/contas");
}

export async function updateAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateAccountSchema.safeParse({
    ...accountInput(formData),
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const { id, version, ...data } = parsed.data;
  const database = getDatabase();

  try {
    const updated = await database.$transaction(async (transaction) => {
      if (data.ownerEditorId) {
        const ownerEditor = await transaction.editor.findFirst({
          where: {
            active: true,
            id: data.ownerEditorId,
            workspaceId: access.workspaceId,
          },
          select: { id: true },
        });

        if (!ownerEditor) {
          throw new Error("owner_editor_unavailable");
        }
      }

      const result = await transaction.financialAccount.updateMany({
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
          action: "account.updated",
          entityType: "FinancialAccount",
          entityId: id,
          metadata: { name: data.name },
        },
      });

      return true;
    });

    if (!updated) {
      return { error: "Esta conta foi alterada em outro dispositivo. Recarregue a página." };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "owner_editor_unavailable") {
      return { error: "A pessoa responsável não está disponível." };
    }

    return { error: "Não foi possível salvar a conta. Verifique os dados informados." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  redirect("/contas");
}

export async function deleteArchivedAccountAction(formData: FormData): Promise<void> {
  const parsed = deleteAccountSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const account = await transaction.financialAccount.findFirst({
      where: {
        active: false,
        id: parsed.data.id,
        version: parsed.data.version,
        workspaceId: access.workspaceId,
      },
      select: {
        _count: {
          select: {
            fixedExpenses: true,
            incoming: true,
            outgoing: true,
            salaries: true,
            transactions: true,
          },
        },
        name: true,
      },
    });

    if (!account) {
      return;
    }

    const dependencyCount =
      account._count.fixedExpenses +
      account._count.incoming +
      account._count.outgoing +
      account._count.salaries +
      account._count.transactions;

    if (dependencyCount > 0) {
      return;
    }

    await transaction.financialAccount.delete({ where: { id: parsed.data.id } });
    await transaction.auditLog.create({
      data: {
        workspaceId: access.workspaceId,
        actorEditorId: access.editorId,
        action: "account.deleted",
        entityType: "FinancialAccount",
        entityId: parsed.data.id,
        metadata: { name: account.name },
      },
    });
  });

  revalidatePath("/painel");
  revalidatePath("/contas");
}

export async function toggleAccountActiveAction(formData: FormData): Promise<void> {
  const parsed = toggleAccountSchema.safeParse({
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
    const result = await transaction.financialAccount.updateMany({
      where: { id, workspaceId: access.workspaceId, version },
      data: { active, version: { increment: 1 } },
    });

    if (result.count === 1) {
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: active ? "account.activated" : "account.archived",
          entityType: "FinancialAccount",
          entityId: id,
        },
      });
    }
  });

  revalidatePath("/painel");
  revalidatePath("/contas");
}
