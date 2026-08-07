"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { fixedExpenseDueDate } from "@/modules/fixed-expenses/domain/fixed-expense-schedule";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  dateInputSchema,
  firstValidationMessage,
  identifierSchema,
  monthInputSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";

const optionalNotesSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const fixedExpenseSchema = z.object({
  accountId: identifierSchema,
  amount: positiveMoneyInputSchema,
  categoryId: identifierSchema,
  description: z.string().trim().min(2, "Informe uma descrição.").max(160),
  dueDay: z.coerce.number().int().min(1, "Informe um dia entre 1 e 31.").max(31),
  editorId: identifierSchema,
  notes: optionalNotesSchema,
  startMonth: monthInputSchema,
});

const updateFixedExpenseSchema = fixedExpenseSchema.extend({
  id: identifierSchema,
  version: versionSchema,
});

const payFixedExpenseSchema = z.object({
  amount: positiveMoneyInputSchema,
  id: identifierSchema,
  month: monthInputSchema,
  paymentDate: dateInputSchema,
});

const archiveFixedExpenseSchema = z.object({ id: identifierSchema, version: versionSchema });

function fixedExpenseInput(formData: FormData) {
  return {
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description"),
    dueDay: formData.get("dueDay"),
    editorId: formData.get("editorId"),
    notes: formData.get("notes"),
    startMonth: formData.get("startMonth"),
  };
}

function revalidateFixedExpensePaths() {
  revalidatePath("/despesas-fixas");
  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios");
}

export async function createFixedExpenseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = fixedExpenseSchema.safeParse(fixedExpenseInput(formData));

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();
  const [account, category, editor] = await Promise.all([
    database.financialAccount.findFirst({
      where: { id: parsed.data.accountId, workspaceId: access.workspaceId, active: true },
      select: { id: true },
    }),
    database.category.findFirst({
      where: {
        id: parsed.data.categoryId,
        workspaceId: access.workspaceId,
        kind: "EXPENSE",
        active: true,
      },
      select: { id: true },
    }),
    database.editor.findFirst({
      where: { id: parsed.data.editorId, workspaceId: access.workspaceId, active: true },
      select: { id: true },
    }),
  ]);

  if (!account || !category || !editor) {
    return { error: "A conta, categoria ou pessoa responsável não está disponível." };
  }

  try {
    await database.$transaction(async (transaction) => {
      const fixedExpense = await transaction.fixedExpense.create({
        data: { workspaceId: access.workspaceId, ...parsed.data },
      });
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "fixed_expense.created",
          entityType: "FixedExpense",
          entityId: fixedExpense.id,
          metadata: { amount: parsed.data.amount, dueDay: parsed.data.dueDay },
        },
      });
    });
  } catch {
    return { error: "Não foi possível cadastrar a despesa fixa. Tente novamente." };
  }

  revalidateFixedExpensePaths();
  redirect("/despesas-fixas");
}

export async function updateFixedExpenseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateFixedExpenseSchema.safeParse({
    ...fixedExpenseInput(formData),
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();
  const current = await database.fixedExpense.findFirst({
    where: {
      active: true,
      id: parsed.data.id,
      version: parsed.data.version,
      workspaceId: access.workspaceId,
    },
    select: { accountId: true, categoryId: true, editorId: true },
  });

  if (!current) {
    return { error: "Esta despesa fixa foi alterada em outro dispositivo. Recarregue a página." };
  }

  const [account, category, editor] = await Promise.all([
    database.financialAccount.findFirst({
      where: {
        id: parsed.data.accountId,
        workspaceId: access.workspaceId,
        OR: [{ active: true }, { id: current.accountId }],
      },
      select: { id: true },
    }),
    database.category.findFirst({
      where: {
        id: parsed.data.categoryId,
        workspaceId: access.workspaceId,
        kind: "EXPENSE",
        OR: [{ active: true }, { id: current.categoryId }],
      },
      select: { id: true },
    }),
    database.editor.findFirst({
      where: {
        id: parsed.data.editorId,
        workspaceId: access.workspaceId,
        OR: [{ active: true }, { id: current.editorId }],
      },
      select: { id: true },
    }),
  ]);

  if (!account || !category || !editor) {
    return { error: "A conta, categoria ou pessoa responsável não está disponível." };
  }

  const { id, version, ...data } = parsed.data;

  try {
    // Preserva os meses já vencidos com os dados históricos anteriores à edição.
    await synchronizeDueFixedExpenses(access.workspaceId);
    const updated = await database.$transaction(async (transaction) => {
      const result = await transaction.fixedExpense.updateMany({
        where: {
          active: true,
          id,
          version,
          workspaceId: access.workspaceId,
        },
        data: { ...data, version: { increment: 1 } },
      });

      if (result.count !== 1) {
        return false;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "fixed_expense.updated",
          entityType: "FixedExpense",
          entityId: id,
          metadata: { amount: data.amount, dueDay: data.dueDay },
        },
      });

      return true;
    });

    if (!updated) {
      return { error: "Esta despesa fixa foi alterada em outro dispositivo. Recarregue a página." };
    }

    // Se o novo vencimento já passou, a ocorrência atual é registrada imediatamente.
    await synchronizeDueFixedExpenses(access.workspaceId);
  } catch {
    return { error: "Não foi possível salvar a despesa fixa. Tente novamente." };
  }

  revalidateFixedExpensePaths();
  redirect("/despesas-fixas");
}

export async function payFixedExpenseAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = payFixedExpenseSchema.safeParse({
    amount: formData.get("amount"),
    id: formData.get("id"),
    month: formData.get("month"),
    paymentDate: formData.get("paymentDate"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  try {
    const paid = await database.$transaction(async (transaction) => {
      const fixedExpense = await transaction.fixedExpense.findFirst({
        where: {
          id: parsed.data.id,
          workspaceId: access.workspaceId,
          active: true,
          startMonth: { lte: parsed.data.month },
        },
      });

      if (!fixedExpense) {
        return false;
      }

      const existing = await transaction.transaction.findFirst({
        where: { fixedExpenseId: fixedExpense.id, recurrenceMonth: parsed.data.month },
      });

      if (existing?.status === "SETTLED") {
        return false;
      }

      const dueDate = fixedExpenseDueDate(parsed.data.month, fixedExpense.dueDay);
      const transactionData = {
        accountId: fixedExpense.accountId,
        affectsBalance: true,
        amount: parsed.data.amount,
        categoryId: fixedExpense.categoryId,
        competenceDate: dueDate,
        description: fixedExpense.description,
        dueDate,
        fixedExpenseId: fixedExpense.id,
        notes: fixedExpense.notes,
        recurrenceMonth: parsed.data.month,
        settledAt: parsed.data.paymentDate,
        status: "SETTLED" as const,
        type: "EXPENSE" as const,
        workspaceId: access.workspaceId,
      };
      const financialTransaction = existing
        ? await transaction.transaction.update({
            where: { id: existing.id },
            data: { ...transactionData, version: { increment: 1 } },
          })
        : await transaction.transaction.create({ data: transactionData });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "fixed_expense.paid",
          entityType: "FixedExpense",
          entityId: fixedExpense.id,
          metadata: { amount: parsed.data.amount, transactionId: financialTransaction.id },
        },
      });

      return true;
    });

    if (!paid) {
      return { error: "Esta despesa já foi paga ou não está mais ativa." };
    }
  } catch {
    return { error: "Não foi possível registrar o pagamento. Tente novamente." };
  }

  revalidateFixedExpensePaths();
  return { error: null, success: "Pagamento registrado." };
}

export async function archiveFixedExpenseAction(formData: FormData): Promise<void> {
  const parsed = archiveFixedExpenseSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return;
  }

  const access = await requireCurrentAccess();
  const database = getDatabase();

  await synchronizeDueFixedExpenses(access.workspaceId);
  await database.$transaction(async (transaction) => {
    const result = await transaction.fixedExpense.updateMany({
      where: {
        id: parsed.data.id,
        workspaceId: access.workspaceId,
        active: true,
        version: parsed.data.version,
      },
      data: { active: false, version: { increment: 1 } },
    });

    if (result.count === 1) {
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          actorEditorId: access.editorId,
          action: "fixed_expense.archived",
          entityType: "FixedExpense",
          entityId: parsed.data.id,
        },
      });
    }
  });

  revalidateFixedExpensePaths();
}
