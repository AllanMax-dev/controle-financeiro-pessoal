"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
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
} from "@/modules/shared/application/form-schemas";
import { money, sumMoney } from "@/modules/shared/domain/money";

const optionalIdentifierSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  identifierSchema.nullable(),
);

const optionalDateInputSchema = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  dateInputSchema.nullable(),
);

const optionalTextSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable(),
);

const savingsGoalSchema = z.object({
  accountId: optionalIdentifierSchema,
  contextId: identifierSchema,
  deadline: optionalDateInputSchema,
  description: optionalTextSchema,
  name: z.string().trim().min(2, "Informe o nome do cofrinho.").max(100),
  targetAmount: positiveMoneyInputSchema,
});

const savingsGoalMovementSchema = z.object({
  accountId: optionalIdentifierSchema,
  amount: positiveMoneyInputSchema,
  movementDate: dateInputSchema,
  notes: optionalTextSchema,
  savingsGoalId: identifierSchema,
  type: z.enum(["DEPOSIT", "WITHDRAWAL"]),
});

function revalidateSavingsGoalPaths() {
  revalidatePath("/cofrinhos");
  revalidatePath("/painel");
  revalidatePath("/contas");
}

export async function createSavingsGoalAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = savingsGoalSchema.safeParse({
    accountId: formData.get("accountId"),
    contextId: formData.get("contextId"),
    deadline: formData.get("deadline"),
    description: formData.get("description"),
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const financialContext = await resolveWritableFinancialContext(access, parsed.data.contextId);
  const contextId = financialContext.id;
  const database = getDatabase();

  if (parsed.data.accountId) {
    const account = await database.financialAccount.findFirst({
      where: {
        active: true,
        contextId,
        id: parsed.data.accountId,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    if (!account) {
      return { error: "A conta vinculada não está disponível neste contexto." };
    }
  }

  try {
    await database.$transaction(async (transaction) => {
      const goal = await transaction.savingsGoal.create({
        data: {
          ...parsed.data,
          workspaceId: access.workspaceId,
          contextId,
        },
      });

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId,
          actorEditorId: access.editorId,
          action: "savings_goal.created",
          entityType: "SavingsGoal",
          entityId: goal.id,
          metadata: { name: parsed.data.name, targetAmount: parsed.data.targetAmount },
        },
      });
    });
  } catch {
    return { error: "Não foi possível criar o cofrinho. Verifique se o nome já está em uso." };
  }

  revalidateSavingsGoalPaths();
  return { error: null, success: "Cofrinho criado." };
}

export async function createSavingsGoalMovementAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = savingsGoalMovementSchema.safeParse({
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    movementDate: formData.get("movementDate"),
    notes: formData.get("notes"),
    savingsGoalId: formData.get("savingsGoalId"),
    type: formData.get("type"),
  });

  if (!parsed.success) {
    return { error: firstValidationMessage(parsed.error) };
  }

  const access = await requireCurrentAccess();
  const accessibleContextIds = await getWritableFinancialContextIds(access);
  const database = getDatabase();
  const goal = await database.savingsGoal.findFirst({
    where: {
      contextId: { in: accessibleContextIds },
      id: parsed.data.savingsGoalId,
      status: { not: "ARCHIVED" },
      workspaceId: access.workspaceId,
    },
    include: { movements: true },
  });

  if (!goal) {
    return { error: "O cofrinho selecionado não está disponível." };
  }

  const movementAmount = money(parsed.data.amount);

  if (parsed.data.accountId) {
    const account = await database.financialAccount.findFirst({
      where: {
        active: true,
        contextId: goal.contextId,
        id: parsed.data.accountId,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true },
    });

    if (!account) {
      return { error: "A conta vinculada não está disponível neste contexto." };
    }
  }

  if (parsed.data.type === "DEPOSIT" && parsed.data.accountId) {
    const [accountBalances, reservedGoals] = await Promise.all([
      getAccountBalances(access.workspaceId, false, goal.contextId),
      database.savingsGoal.findMany({
        where: {
          accountId: parsed.data.accountId,
          contextId: goal.contextId,
          status: { not: "ARCHIVED" },
          workspaceId: access.workspaceId,
        },
        include: { movements: true },
      }),
    ]);
    const accountBalance = accountBalances.accounts.find(({ id }) => id === parsed.data.accountId)?.balance ?? money(0);
    const reservedAmount = sumMoney(
      reservedGoals.map((reservedGoal) => {
        const deposits = sumMoney(
          reservedGoal.movements.filter(({ type }) => type === "DEPOSIT").map(({ amount }) => amount),
        );
        const withdrawals = sumMoney(
          reservedGoal.movements.filter(({ type }) => type === "WITHDRAWAL").map(({ amount }) => amount),
        );

        return deposits.minus(withdrawals);
      }),
    );
    const freeBalance = money(accountBalance.minus(reservedAmount));

    if (movementAmount.greaterThan(freeBalance)) {
      return { error: "A reserva nao pode ser maior que o saldo livre da conta." };
    }
  }

  const currentAmount = money(
    sumMoney(goal.movements.filter(({ type }) => type === "DEPOSIT").map(({ amount }) => amount))
      .minus(sumMoney(goal.movements.filter(({ type }) => type === "WITHDRAWAL").map(({ amount }) => amount))),
  );

  if (parsed.data.type === "WITHDRAWAL" && movementAmount.greaterThan(currentAmount)) {
    return { error: "A retirada não pode ser maior que o valor atual do cofrinho." };
  }

  try {
    await database.$transaction(async (transaction) => {
      const movement = await transaction.savingsGoalMovement.create({
        data: {
          accountId: parsed.data.accountId,
          amount: parsed.data.amount,
          contextId: goal.contextId,
          editorId: access.editorId,
          movementDate: parsed.data.movementDate,
          notes: parsed.data.notes,
          savingsGoalId: goal.id,
          type: parsed.data.type,
          workspaceId: access.workspaceId,
        },
      });
      const nextAmount = parsed.data.type === "DEPOSIT"
        ? money(currentAmount.plus(movementAmount))
        : money(currentAmount.minus(movementAmount));

      if (nextAmount.greaterThanOrEqualTo(goal.targetAmount) && goal.status === "ACTIVE") {
        await transaction.savingsGoal.update({
          where: { id: goal.id },
          data: { status: "COMPLETED", version: { increment: 1 } },
        });
      }

      await transaction.auditLog.create({
        data: {
          workspaceId: access.workspaceId,
          contextId: goal.contextId,
          actorEditorId: access.editorId,
          action: "savings_goal.movement_created",
          entityType: "SavingsGoalMovement",
          entityId: movement.id,
          metadata: { amount: parsed.data.amount, goalName: goal.name, type: parsed.data.type },
        },
      });
    });
  } catch {
    return { error: "Não foi possível movimentar o cofrinho." };
  }

  revalidateSavingsGoalPaths();
  redirect(contextHref("/cofrinhos", goal.contextId));
}
