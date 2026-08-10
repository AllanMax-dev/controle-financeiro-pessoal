"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { calculateCurrentAccountBalance } from "@/modules/accounts/application/calculate-account-balance";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  assertFinancialContextAccess,
  getAccessibleFinancialContexts,
} from "@/modules/financial-contexts/application/financial-contexts";
import type { ActionState } from "@/modules/shared/application/action-state";
import {
  colorSchema,
  firstValidationMessage,
  identifierSchema,
  moneyInputSchema,
  versionSchema,
} from "@/modules/shared/application/form-schemas";
import { money } from "@/modules/shared/domain/money";

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  identifierSchema.nullable(),
);

const accountSchema = z.object({
  contextId: identifierSchema,
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

const optionalNotesSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const adjustAccountBalanceSchema = z.object({
  id: identifierSchema,
  informedBalance: moneyInputSchema,
  notes: optionalNotesSchema,
  version: versionSchema,
});

function accountInput(formData: FormData) {
  return {
    contextId: formData.get("contextId"),
    name: formData.get("name"),
    ownerEditorId: formData.get("ownerEditorId"),
    type: formData.get("type"),
    initialBalance: formData.get("initialBalance"),
    color: formData.get("color"),
  };
}

function revalidateAccountPaths() {
  revalidatePath("/painel");
  revalidatePath("/bancos");
  revalidatePath("/investimentos");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/transferencias");
  revalidatePath("/despesas-fixas");
  revalidatePath("/salarios");
  revalidatePath("/dividas");
  revalidatePath("/relatorios");
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
  const financialContext = await assertFinancialContextAccess(access, parsed.data.contextId);
  const database = getDatabase();
  const { contextId, ...accountData } = parsed.data;
  const ownerEditorId =
    financialContext.type === "PERSONAL" ? financialContext.ownerEditorId : accountData.ownerEditorId;

  if (
    financialContext.type === "PERSONAL" &&
    accountData.ownerEditorId &&
    accountData.ownerEditorId !== ownerEditorId
  ) {
    return { error: "O contexto pessoal só pode usar a própria pessoa como responsável." };
  }

  try {
    await database.$transaction(async (transaction) => {
      if (ownerEditorId) {
        const ownerEditor = await transaction.editor.findFirst({
          where: {
            active: true,
            id: ownerEditorId,
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
          contextId,
          workspaceId: access.workspaceId,
          ...accountData,
          ownerEditorId,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
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

  revalidateAccountPaths();
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
  const financialContext = await assertFinancialContextAccess(access, parsed.data.contextId);
  const { contextId, id, version, ...data } = parsed.data;
  const database = getDatabase();
  const ownerEditorId =
    financialContext.type === "PERSONAL" ? financialContext.ownerEditorId : data.ownerEditorId;

  if (
    financialContext.type === "PERSONAL" &&
    data.ownerEditorId &&
    data.ownerEditorId !== ownerEditorId
  ) {
    return { error: "O contexto pessoal só pode usar a própria pessoa como responsável." };
  }

  try {
    const updated = await database.$transaction(async (transaction) => {
      const current = await transaction.financialAccount.findFirst({
        where: { id, workspaceId: access.workspaceId },
        select: {
          _count: {
            select: {
              balanceAdjustments: true,
              fixedExpenses: true,
              incoming: true,
              outgoing: true,
              salaries: true,
              transactions: true,
            },
          },
          contextId: true,
          initialBalance: true,
          type: true,
        },
      });

      if (!current) {
        return false;
      }

      if (current.contextId !== contextId) {
        throw new Error("account_context_locked");
      }

      if (ownerEditorId) {
        const ownerEditor = await transaction.editor.findFirst({
          where: {
            active: true,
            id: ownerEditorId,
            workspaceId: access.workspaceId,
          },
          select: { id: true },
        });

        if (!ownerEditor) {
          throw new Error("owner_editor_unavailable");
        }
      }

      const historyCount =
        current._count.balanceAdjustments +
        current._count.fixedExpenses +
        current._count.incoming +
        current._count.outgoing +
        current._count.salaries +
        current._count.transactions;

      if (historyCount > 0 && data.type !== current.type) {
        throw new Error("account_type_locked");
      }

      if (historyCount > 0 && !money(data.initialBalance).equals(current.initialBalance)) {
        throw new Error("initial_balance_locked");
      }

      const result = await transaction.financialAccount.updateMany({
        where: { contextId, id, workspaceId: access.workspaceId, version },
        data: { ...data, ownerEditorId, version: { increment: 1 } },
      });

      if (result.count !== 1) {
        return false;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
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

    if (error instanceof Error && error.message === "account_context_locked") {
      return { error: "Crie uma nova conta para mudar o contexto financeiro sem mover histórico." };
    }

    if (error instanceof Error && error.message === "account_type_locked") {
      return {
        error:
          "O tipo da conta não pode ser alterado depois que ela possui movimentações, recorrências ou ajustes.",
      };
    }

    if (error instanceof Error && error.message === "initial_balance_locked") {
      return { error: "Use Ajustar saldo atual para conciliar uma conta que já possui histórico financeiro." };
    }

    return { error: "Não foi possível salvar a conta. Verifique os dados informados." };
  }

  revalidateAccountPaths();
  redirect("/contas");
}

export async function deleteArchivedAccountFormAction(formData: FormData): Promise<ActionState> {
  return deleteArchivedAccountAction({ error: null, success: null }, formData);
}

export async function deleteArchivedAccountAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = deleteAccountSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const database = getDatabase();

  try {
    const deleted = await database.$transaction(async (transaction) => {
      const account = await transaction.financialAccount.findFirst({
        where: {
          active: false,
          contextId: { in: accessibleContextIds },
          id: parsed.data.id,
          version: parsed.data.version,
          workspaceId: access.workspaceId,
        },
        select: {
          _count: {
            select: {
              balanceAdjustments: true,
              fixedExpenses: true,
              incoming: true,
              outgoing: true,
              salaries: true,
              transactions: true,
            },
          },
          contextId: true,
          name: true,
        },
      });

      if (!account) {
        return "not_found" as const;
      }

      const balance = await calculateCurrentAccountBalance(
        transaction,
        access.workspaceId,
        parsed.data.id,
      );

      if (balance && !balance.isZero()) {
        return "has_balance" as const;
      }

      const dependencyCount =
        account._count.balanceAdjustments +
        account._count.fixedExpenses +
        account._count.incoming +
        account._count.outgoing +
        account._count.salaries +
        account._count.transactions;

      if (dependencyCount > 0) {
        return "has_dependencies" as const;
      }

      await transaction.financialAccount.delete({ where: { id: parsed.data.id } });
      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: account.contextId,
          actorEditorId: access.editorId,
          action: "account.deleted",
          entityType: "FinancialAccount",
          entityId: parsed.data.id,
          metadata: { name: account.name },
        },
      });

      return "deleted" as const;
    });

    if (deleted === "not_found") {
      return { error: "Esta conta foi alterada em outro dispositivo. Recarregue a página." };
    }

    if (deleted === "has_balance") {
      return { error: "Esta conta ainda possui saldo. Ajuste ou transfira o valor antes de excluir." };
    }

    if (deleted === "has_dependencies") {
      return { error: "Esta conta possui vínculos financeiros e não pode ser excluída." };
    }
  } catch {
    return { error: "Não foi possível excluir a conta. Tente novamente." };
  }

  revalidateAccountPaths();
  return { error: null, success: "Conta excluída." };
}

export async function toggleAccountActiveFormAction(formData: FormData): Promise<ActionState> {
  return toggleAccountActiveAction({ error: null, success: null }, formData);
}

export async function toggleAccountActiveAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = toggleAccountSchema.safeParse({
    id: formData.get("id"),
    version: formData.get("version"),
    active: formData.get("active"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const { id, version, active } = parsed.data;
  const database = getDatabase();

  try {
    const result = await database.$transaction(async (transaction) => {
      if (!active) {
        const account = await transaction.financialAccount.findFirst({
          where: {
            active: true,
            contextId: { in: accessibleContextIds },
            id,
            version,
            workspaceId: access.workspaceId,
          },
          select: { contextId: true, id: true },
        });

        if (!account) {
          return "conflict" as const;
        }

        const balance = await calculateCurrentAccountBalance(transaction, access.workspaceId, id);

        if (balance && !balance.isZero()) {
          return "has_balance" as const;
        }

        const [activeFixedExpenses, activeSalaries, pendingTransactions, pendingTransfers] =
          await Promise.all([
            transaction.fixedExpense.count({
              where: {
                accountId: id,
                active: true,
                contextId: account.contextId,
                workspaceId: access.workspaceId,
              },
            }),
            transaction.salary.count({
              where: {
                accountId: id,
                active: true,
                contextId: account.contextId,
                workspaceId: access.workspaceId,
              },
            }),
            transaction.transaction.count({
              where: {
                accountId: id,
                contextId: account.contextId,
                status: "PENDING",
                workspaceId: access.workspaceId,
              },
            }),
            transaction.transfer.count({
              where: {
                status: "PENDING",
                workspaceId: access.workspaceId,
                OR: [{ sourceAccountId: id }, { destinationAccountId: id }],
              },
            }),
          ]);

        if (activeFixedExpenses > 0) {
          return "active_fixed_expense" as const;
        }

        if (activeSalaries > 0) {
          return "active_salary" as const;
        }

        if (pendingTransactions > 0 || pendingTransfers > 0) {
          return "pending_operations" as const;
        }
      }

      const auditAccount = await transaction.financialAccount.findFirst({
        where: { contextId: { in: accessibleContextIds }, id, workspaceId: access.workspaceId, version },
        select: { contextId: true },
      });

      if (!auditAccount) {
        return "conflict" as const;
      }

      const updateResult = await transaction.financialAccount.updateMany({
        where: { contextId: { in: accessibleContextIds }, id, workspaceId: access.workspaceId, version },
        data: { active, version: { increment: 1 } },
      });

      if (updateResult.count !== 1) {
        return "conflict" as const;
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: auditAccount.contextId,
          actorEditorId: access.editorId,
          action: active ? "account.activated" : "account.archived",
          entityType: "FinancialAccount",
          entityId: id,
        },
      });

      return "updated" as const;
    });

    if (result === "conflict") {
      return { error: "Esta conta foi alterada em outro dispositivo. Recarregue a página." };
    }

    if (result === "has_balance") {
      return { error: "Esta conta ainda possui saldo. Transfira ou ajuste o valor para zero antes de arquivar." };
    }

    if (result === "active_fixed_expense") {
      return { error: "Encerre as despesas fixas ativas desta conta antes de arquivá-la." };
    }

    if (result === "active_salary") {
      return { error: "Encerre os salários ativos desta conta antes de arquivá-la." };
    }

    if (result === "pending_operations") {
      return { error: "Conclua ou cancele os lançamentos e transferências pendentes desta conta antes de arquivá-la." };
    }
  } catch {
    return { error: "Não foi possível alterar o status da conta. Tente novamente." };
  }

  revalidateAccountPaths();
  return { error: null, success: active ? "Conta reativada." : "Conta arquivada." };
}

export async function adjustAccountBalanceAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = adjustAccountBalanceSchema.safeParse({
    id: formData.get("id"),
    informedBalance: formData.get("informedBalance"),
    notes: formData.get("notes"),
    version: formData.get("version"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const database = getDatabase();

  try {
    const adjusted = await database.$transaction(
      async (transaction) => {
        const account = await transaction.financialAccount.findFirst({
          where: {
            active: true,
            contextId: { in: accessibleContextIds },
            id: parsed.data.id,
            version: parsed.data.version,
            workspaceId: access.workspaceId,
          },
          select: { contextId: true, id: true, name: true },
        });

        if (!account) {
          return "conflict" as const;
        }

        const previousBalance = await calculateCurrentAccountBalance(
          transaction,
          access.workspaceId,
          account.id,
        );

        if (!previousBalance) {
          return "conflict" as const;
        }

        const informedBalance = money(parsed.data.informedBalance);
        const difference = money(informedBalance.minus(previousBalance));

        if (difference.isZero()) {
          return "unchanged" as const;
        }

        const updateResult = await transaction.financialAccount.updateMany({
          where: {
            active: true,
            id: account.id,
            version: parsed.data.version,
            workspaceId: access.workspaceId,
          },
          data: { version: { increment: 1 } },
        });

        if (updateResult.count !== 1) {
          return "conflict" as const;
        }

        const adjustment = await transaction.accountBalanceAdjustment.create({
          data: {
            accountId: account.id,
            contextId: account.contextId,
            difference: difference.toFixed(2),
            editorId: access.editorId,
            informedBalance: informedBalance.toFixed(2),
            notes: parsed.data.notes,
            previousBalance: previousBalance.toFixed(2),
            workspaceId: access.workspaceId,
          },
        });

        await transaction.auditLog.create({
          data: {
            workspaceId: access.workspaceId,
            contextId: account.contextId,
            actorEditorId: access.editorId,
            action: "account.balance_adjusted",
            entityType: "AccountBalanceAdjustment",
            entityId: adjustment.id,
            metadata: {
              accountId: account.id,
              accountName: account.name,
              difference: difference.toFixed(2),
              informedBalance: informedBalance.toFixed(2),
              previousBalance: previousBalance.toFixed(2),
            },
          },
        });

        return "adjusted" as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (adjusted === "conflict") {
      return { error: "Esta conta foi alterada em outro dispositivo. Recalcule e tente novamente." };
    }

    if (adjusted === "unchanged") {
      return { error: "O saldo informado já é igual ao saldo calculado." };
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Outra operação financeira ocorreu ao mesmo tempo. Recalcule o saldo e tente novamente." };
    }

    return { error: "Não foi possível ajustar o saldo. Tente novamente." };
  }

  revalidateAccountPaths();
  redirect("/contas");
}
