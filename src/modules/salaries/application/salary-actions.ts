"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  getAccessibleFinancialContexts,
  getWritableFinancialContextIds,
  resolveWritableFinancialContext,
} from "@/modules/financial-contexts/application/financial-contexts";
import { createSalarySchedule } from "@/modules/salaries/domain/salary-schedule";
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

const optionalPaymentDaySchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().min(1).max(31).nullable(),
);

const salarySchema = z
  .object({
    accountId: identifierSchema,
    amount: positiveMoneyInputSchema,
    categoryId: identifierSchema,
    contextId: identifierSchema,
    description: z.string().trim().min(2, "Informe uma descrição.").max(160),
    editorId: identifierSchema,
    frequency: z.enum(["MONTHLY", "FORTNIGHTLY"]),
    notes: optionalNotesSchema,
    paymentDay: optionalPaymentDaySchema,
    startMonth: monthInputSchema,
  })
  .superRefine((value, context) => {
    if (value.frequency === "MONTHLY" && !value.paymentDay) {
      context.addIssue({
        code: "custom",
        message: "Informe o dia do recebimento mensal.",
        path: ["paymentDay"],
      });
    }
  });

const receiveSalarySchema = z.object({
  amount: positiveMoneyInputSchema,
  id: identifierSchema,
  installment: z.coerce.number().int().min(1).max(2),
  month: monthInputSchema,
  receiptDate: dateInputSchema,
});

const archiveSalarySchema = z.object({ id: identifierSchema, version: versionSchema });

function revalidateSalaryPaths() {
  revalidatePath("/salarios");
  revalidatePath("/recebimentos");
  revalidatePath("/painel");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios");
}

export async function createSalaryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = salarySchema.safeParse({
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    categoryId: formData.get("categoryId"),
    contextId: formData.get("contextId"),
    description: formData.get("description"),
    editorId: formData.get("editorId"),
    frequency: formData.get("frequency"),
    notes: formData.get("notes"),
    paymentDay: formData.get("paymentDay"),
    startMonth: formData.get("startMonth"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const financialContext = await resolveWritableFinancialContext(access, parsed.data.contextId);
  const contextId = financialContext.id;

  if (financialContext.type === "PERSONAL" && parsed.data.editorId !== financialContext.ownerEditorId) {
    return { error: "O contexto pessoal só pode usar a própria pessoa como responsável." };
  }

  const database = getDatabase();
  const [account, category, editor] = await Promise.all([
    database.financialAccount.findFirst({
      where: {
        id: parsed.data.accountId,
        contextId,
        workspaceId: access.workspaceId,
        active: true,
        type: { not: "INVESTMENT" },
      },
      select: { id: true },
    }),
    database.category.findFirst({
      where: {
        id: parsed.data.categoryId,
        contextId,
        workspaceId: access.workspaceId,
        kind: "INCOME",
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
      const salary = await transaction.salary.create({
        data: {
          ...parsed.data,
          paymentDay: parsed.data.frequency === "MONTHLY" ? parsed.data.paymentDay : null,
          contextId,
          workspaceId: access.workspaceId,
        },
      });
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
          actorEditorId: access.editorId,
          action: "salary.created",
          entityType: "Salary",
          entityId: salary.id,
          metadata: { amount: parsed.data.amount, frequency: parsed.data.frequency },
        },
      });
    });
  } catch {
    return { error: "Não foi possível cadastrar o salário. Tente novamente." };
  }

  revalidateSalaryPaths();
  redirect("/salarios");
}

export async function receiveSalaryAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = receiveSalarySchema.safeParse({
    amount: formData.get("amount"),
    id: formData.get("id"),
    installment: formData.get("installment"),
    month: formData.get("month"),
    receiptDate: formData.get("receiptDate"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = await getWritableFinancialContextIds(access);
  const database = getDatabase();

  try {
    const received = await database.$transaction(async (transaction) => {
      const salary = await transaction.salary.findFirst({
        where: {
          id: parsed.data.id,
          contextId: { in: accessibleContextIds },
          workspaceId: access.workspaceId,
          active: true,
          account: { active: true, type: { not: "INVESTMENT" } },
          startMonth: { lte: parsed.data.month },
        },
      });

      if (!salary) {
        return false;
      }

      const scheduled = createSalarySchedule({
        amount: salary.amount,
        frequency: salary.frequency,
        month: parsed.data.month,
        paymentDay: salary.paymentDay,
      }).find(({ installment }) => installment === parsed.data.installment);

      if (!scheduled) {
        return false;
      }

      const existing = await transaction.transaction.findFirst({
        where: {
          salaryId: salary.id,
          salaryInstallment: scheduled.installment,
          salaryMonth: parsed.data.month,
        },
      });

      if (existing?.status === "SETTLED") {
        return false;
      }

      const transactionData = {
        accountId: salary.accountId,
        affectsBalance: true,
        amount: parsed.data.amount,
        categoryId: salary.categoryId,
        competenceDate: scheduled.dueDate,
        contextId: salary.contextId,
        description: salary.frequency === "FORTNIGHTLY"
          ? `${salary.description} (${scheduled.installment}/2)`
          : salary.description,
        dueDate: scheduled.dueDate,
        notes: salary.notes,
        salaryId: salary.id,
        salaryInstallment: scheduled.installment,
        salaryMonth: parsed.data.month,
        settledAt: parsed.data.receiptDate,
        status: "SETTLED" as const,
        type: "INCOME" as const,
        workspaceId: access.workspaceId,
      };
      const financialTransactionId = existing
        ? existing.id
        : (await transaction.transaction.create({ data: transactionData })).id;

      if (existing) {
        const updateResult = await transaction.transaction.updateMany({
          where: { id: existing.id, status: { not: "SETTLED" } },
          data: { ...transactionData, version: { increment: 1 } },
        });

        if (updateResult.count !== 1) {
          return false;
        }
      }
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: salary.contextId,
          actorEditorId: access.editorId,
          action: "salary.received",
          entityType: "Salary",
          entityId: salary.id,
          metadata: {
            amount: parsed.data.amount,
            installment: scheduled.installment,
            transactionId: financialTransactionId,
          },
        },
      });

      return true;
    });

    if (!received) {
      return { error: "Este salário já foi recebido ou não está mais ativo." };
    }
  } catch {
    return { error: "Não foi possível registrar o recebimento. Tente novamente." };
  }

  revalidateSalaryPaths();
  return { error: null, success: "Recebimento registrado." };
}

export async function archiveSalaryAction(formData: FormData): Promise<void> {
  const parsed = archiveSalarySchema.safeParse({
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
    const result = await transaction.salary.updateMany({
      where: {
        id: parsed.data.id,
        contextId: { in: accessibleContextIds },
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
          action: "salary.archived",
          entityType: "Salary",
          entityId: parsed.data.id,
        },
      });
    }
  });

  revalidateSalaryPaths();
}
