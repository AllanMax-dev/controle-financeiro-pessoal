"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  dateInputSchema,
  firstValidationMessage,
  identifierSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const optionalDateInputSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  dateInputSchema.optional(),
);

const optionalNotesSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const transferSchema = z
  .object({
    amount: positiveMoneyInputSchema,
    description: z.string().trim().min(2, "Informe uma descrição.").max(160),
    destinationAccountId: identifierSchema,
    notes: optionalNotesSchema,
    settledDate: optionalDateInputSchema,
    sourceAccountId: identifierSchema,
    status: z.enum(["PENDING", "SETTLED"]),
    transferDate: dateInputSchema,
  })
  .superRefine((value, context) => {
    if (value.sourceAccountId === value.destinationAccountId) {
      context.addIssue({
        code: "custom",
        message: "Escolha contas de origem e destino diferentes.",
        path: ["destinationAccountId"],
      });
    }

    if (value.status === "SETTLED" && !value.settledDate) {
      context.addIssue({
        code: "custom",
        message: "Informe a data de realização da transferência.",
        path: ["settledDate"],
      });
    }
  });

const updateTransferSchema = transferSchema.safeExtend({
  id: identifierSchema,
  version: versionSchema,
});

const cancelTransferSchema = z.object({ id: identifierSchema, version: versionSchema });

function transferInput(formData: FormData) {
  return {
    amount: formData.get("amount"),
    description: formData.get("description"),
    destinationAccountId: formData.get("destinationAccountId"),
    notes: formData.get("notes"),
    settledDate: formData.get("settledDate"),
    sourceAccountId: formData.get("sourceAccountId"),
    status: formData.get("status"),
    transferDate: formData.get("transferDate"),
  };
}

async function accountsAreValid(
  workspaceId: string,
  accountIds: [string, string],
  requireActive: boolean,
) {
  const count = await getDatabase().financialAccount.count({
    where: {
      workspaceId,
      id: { in: accountIds },
      ...(requireActive ? { active: true } : {}),
    },
  });

  return count === 2;
}

export async function createTransferAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transferSchema.safeParse(transferInput(formData));

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const validAccounts = await accountsAreValid(
    access.workspaceId,
    [parsed.data.sourceAccountId, parsed.data.destinationAccountId],
    true,
  );

  if (!validAccounts) {
    return { error: "Selecione duas contas ativas deste espaço financeiro." };
  }

  const { settledDate, ...data } = parsed.data;
  const database = getDatabase();

  try {
    await database.$transaction(async (transaction) => {
      const transfer = await transaction.transfer.create({
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
          action: "transfer.created",
          entityType: "Transfer",
          entityId: transfer.id,
          metadata: { amount: data.amount },
        },
      });
    });
  } catch {
    return { error: "Não foi possível criar a transferência. Tente novamente." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/transferencias");
  redirect("/transferencias");
}

export async function updateTransferAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateTransferSchema.safeParse({
    ...transferInput(formData),
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const validAccounts = await accountsAreValid(
    access.workspaceId,
    [parsed.data.sourceAccountId, parsed.data.destinationAccountId],
    false,
  );

  if (!validAccounts) {
    return { error: "Uma das contas selecionadas não está disponível." };
  }

  const { id, settledDate, version, ...data } = parsed.data;
  const database = getDatabase();

  try {
    const updated = await database.$transaction(async (transaction) => {
      const result = await transaction.transfer.updateMany({
        where: { id, workspaceId: access.workspaceId, version, status: { not: "CANCELED" } },
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
          action: "transfer.updated",
          entityType: "Transfer",
          entityId: id,
          metadata: { amount: data.amount },
        },
      });

      return true;
    });

    if (!updated) {
      return { error: "Esta transferência foi alterada em outro dispositivo. Recarregue a página." };
    }
  } catch {
    return { error: "Não foi possível salvar a transferência. Tente novamente." };
  }

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/transferencias");
  redirect("/transferencias");
}

export async function cancelTransferAction(formData: FormData): Promise<void> {
  const parsed = cancelTransferSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const result = await transaction.transfer.updateMany({
      where: {
        id: parsed.data.id,
        workspaceId: access.workspaceId,
        version: parsed.data.version,
        status: { not: "CANCELED" },
      },
      data: { status: "CANCELED", settledAt: null, version: { increment: 1 } },
    });

    if (result.count === 1) {
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "transfer.canceled",
          entityType: "Transfer",
          entityId: parsed.data.id,
        },
      });
    }
  });

  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/transferencias");
}
