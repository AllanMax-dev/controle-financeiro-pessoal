"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  assertFinancialContextAccess,
  getAccessibleFinancialContexts,
} from "@/modules/financial-contexts/application/financial-contexts";
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
    contextId: identifierSchema,
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
    contextId: formData.get("contextId"),
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
  contextId: string,
  accountId: string,
  categoryId: string | null,
  type: "INCOME" | "EXPENSE",
  requireActive: boolean,
) {
  const database = getDatabase();
  const [account, category] = await Promise.all([
    database.financialAccount.findFirst({
      where: {
        id: accountId,
        contextId,
        workspaceId,
        ...(requireActive ? { active: true, type: { not: "INVESTMENT" as const } } : {}),
      },
      select: { id: true },
    }),
    categoryId
      ? database.category.findFirst({
          where: {
            id: categoryId,
            contextId,
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

type CurrentTransactionRelations = {
  accountId: string;
  categoryId: string | null;
};

async function updatedRelationsAreValid(
  workspaceId: string,
  contextId: string,
  accountId: string,
  categoryId: string | null,
  type: "INCOME" | "EXPENSE",
  currentRelations: CurrentTransactionRelations,
) {
  const database = getDatabase();
  const [account, category] = await Promise.all([
    database.financialAccount.findFirst({
      where: {
        id: accountId,
        contextId,
        workspaceId,
        OR: [{ active: true, type: { not: "INVESTMENT" } }, { id: currentRelations.accountId }],
      },
      select: { id: true },
    }),
    categoryId
      ? database.category.findFirst({
          where: {
            id: categoryId,
            contextId,
            workspaceId,
            kind: type,
            OR: [
              { active: true },
              ...(currentRelations.categoryId ? [{ id: currentRelations.categoryId }] : []),
            ],
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
  await assertFinancialContextAccess(access, parsed.data.contextId);
  const validRelations = await relationsAreValid(
    access.workspaceId,
    parsed.data.contextId,
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
          contextId: data.contextId,
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
  revalidatePath("/gastos-variaveis");
  revalidatePath("/recebimentos");
  revalidatePath("/contas");
  revalidatePath("/despesas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/planejamento");
  revalidatePath("/relatorios");
  revalidatePath("/salarios");
  redirect(`${data.type === "INCOME" ? "/recebimentos" : "/gastos-variaveis"}?contextId=${data.contextId}`);
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
  await assertFinancialContextAccess(access, parsed.data.contextId);
  const database = getDatabase();
  const existing = await database.transaction.findFirst({
    where: {
      id: parsed.data.id,
      contextId: parsed.data.contextId,
      workspaceId: access.workspaceId,
      status: { not: "CANCELED" },
      debtInstallment: { is: null },
    },
    select: {
      accountId: true,
      categoryId: true,
      contextId: true,
      fixedExpenseId: true,
      salaryId: true,
    },
  });

  if (!existing) {
    return { error: "Este lançamento não está mais disponível para edição." };
  }

  if (existing.fixedExpenseId && parsed.data.type !== "EXPENSE") {
    return { error: "O pagamento de uma despesa fixa deve permanecer como despesa." };
  }

  if (existing.salaryId && parsed.data.type !== "INCOME") {
    return { error: "O recebimento de salário deve permanecer como receita." };
  }

  const validRelations = await updatedRelationsAreValid(
    access.workspaceId,
    parsed.data.contextId,
    parsed.data.accountId,
    parsed.data.categoryId,
    parsed.data.type,
    existing,
  );

  if (!validRelations) {
    return { error: "A conta ou categoria selecionada não está disponível." };
  }

  const { id, settledDate, version, ...data } = parsed.data;

  try {
    const updated = await database.$transaction(async (transaction) => {
      const result = await transaction.transaction.updateMany({
        where: {
          contextId: data.contextId,
          id,
          workspaceId: access.workspaceId,
          version,
          status: { not: "CANCELED" },
          debtInstallment: { is: null },
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
          contextId: data.contextId,
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
  revalidatePath("/gastos-variaveis");
  revalidatePath("/recebimentos");
  revalidatePath("/contas");
  revalidatePath("/despesas-fixas");
  revalidatePath("/lancamentos");
  revalidatePath("/planejamento");
  revalidatePath("/relatorios");
  revalidatePath("/salarios");
  redirect(`${data.type === "INCOME" ? "/recebimentos" : "/gastos-variaveis"}?contextId=${data.contextId}`);
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
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    const result = await transaction.transaction.updateMany({
      where: {
        id: parsed.data.id,
        contextId: { in: accessibleContextIds },
        workspaceId: access.workspaceId,
        version: parsed.data.version,
        status: { not: "CANCELED" },
        debtInstallment: { is: null },
        fixedExpense: { is: null },
        salary: { is: null },
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
  revalidatePath("/planejamento");
  revalidatePath("/relatorios");
  redirect("/lancamentos");
}
