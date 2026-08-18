import type { Prisma } from "@/generated/prisma/client";
import { appendAudit, type AuditContext } from "@/modules/finance/application/finance-lifecycle";
import { money, sumMoney } from "@/modules/shared/domain/money";

export const OPTIMISTIC_LOCK_ERROR = "Este registro foi alterado em outro dispositivo. Atualize a página antes de salvar novamente.";

export function assertOptimisticUpdate(count: number) {
  if (count !== 1) {
    throw new Error(OPTIMISTIC_LOCK_ERROR);
  }
}

export function assertPositiveAmount(amount: ReturnType<typeof money>) {
  if (!amount.greaterThan(0)) {
    throw new Error("O valor deve ser maior que zero.");
  }
}

export async function assertAccountForPerson(
  database: Prisma.TransactionClient,
  workspaceId: string,
  personEditorId: string,
  accountId: string | null | undefined,
  required = false,
) {
  if (!accountId) {
    if (required) {
      throw new Error("Informe a conta.");
    }

    return null;
  }

  const account = await database.financialAccount.findFirst({
    where: { active: true, id: accountId, personEditorId, workspaceId },
    select: { id: true, personEditorId: true, type: true },
  });

  if (!account) {
    throw new Error("Conta invalida para a pessoa selecionada.");
  }

  return account;
}

export async function assertInvestmentAccountForPerson(
  database: Prisma.TransactionClient,
  workspaceId: string,
  personEditorId: string,
  accountId: string | null | undefined,
) {
  const account = await assertAccountForPerson(database, workspaceId, personEditorId, accountId);

  if (account && account.type !== "INVESTMENT") {
    throw new Error("Um investimento só pode ser vinculado a uma conta do tipo investimento.");
  }

  return account;
}

export async function lockFinancialAccounts(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountIds: string[],
) {
  for (const accountId of [...new Set(accountIds)].sort()) {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "FinancialAccount"
      WHERE "workspaceId" = ${workspaceId}::uuid
        AND "id" = ${accountId}::uuid
      FOR UPDATE
    `;
  }
}

export async function lockSavingsGoal(transaction: Prisma.TransactionClient, workspaceId: string, goalId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "SavingsGoal"
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "id" = ${goalId}::uuid
    FOR UPDATE
  `;
}

export async function getTransactionalAccountBalance(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountId: string,
  exclusions: { adjustmentId?: string; transferId?: string } = {},
) {
  const [account, transactions, transfers, adjustments, invoicePayments] = await Promise.all([
    transaction.financialAccount.findFirstOrThrow({
      where: { id: accountId, workspaceId },
      select: { initialBalance: true },
    }),
    transaction.transaction.findMany({
      where: { accountId, affectsBalance: true, status: "SETTLED", workspaceId },
      select: { amount: true, type: true },
    }),
    transaction.transfer.findMany({
      where: {
        id: exclusions.transferId ? { not: exclusions.transferId } : undefined,
        OR: [{ destinationAccountId: accountId }, { sourceAccountId: accountId }],
        status: "SETTLED",
        workspaceId,
      },
      select: { amount: true, destinationAccountId: true, sourceAccountId: true },
    }),
    transaction.balanceAdjustment.findMany({
      where: { accountId, id: exclusions.adjustmentId ? { not: exclusions.adjustmentId } : undefined, workspaceId },
      select: { difference: true },
    }),
    transaction.creditCardInvoicePayment.findMany({
      where: { accountId, workspaceId },
      select: { amount: true },
    }),
  ]);
  let balance = money(account.initialBalance);

  for (const transactionRecord of transactions) {
    balance = transactionRecord.type === "INCOME"
      ? money(balance.plus(transactionRecord.amount))
      : money(balance.minus(transactionRecord.amount));
  }
  for (const transfer of transfers) {
    if (transfer.sourceAccountId === accountId) {
      balance = money(balance.minus(transfer.amount));
    }
    if (transfer.destinationAccountId === accountId) {
      balance = money(balance.plus(transfer.amount));
    }
  }
  balance = money(balance.plus(sumMoney(adjustments.map(({ difference }) => difference))));
  balance = money(balance.minus(sumMoney(invoicePayments.map(({ amount }) => amount))));

  return balance;
}

async function getReservedAccountBalance(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountId: string,
  excludeMovementId?: string,
) {
  const movements = await transaction.savingsGoalMovement.findMany({
    where: { accountId, id: excludeMovementId ? { not: excludeMovementId } : undefined, workspaceId },
    select: { amount: true, type: true },
  });

  return sumMoney(movements.map(({ amount, type }) => type === "DEPOSIT" ? amount : money(amount).negated()));
}

async function assertAccountState(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountId: string,
  projectedBalance: ReturnType<typeof money>,
  projectedReserved?: ReturnType<typeof money>,
) {
  if (projectedBalance.isNegative()) {
    throw new Error("Saldo negativo não é permitido para esta operação.");
  }
  const reserved = projectedReserved ?? await getReservedAccountBalance(transaction, workspaceId, accountId);

  if (reserved.isNegative()) {
    throw new Error("O saldo reservado da conta está inconsistente.");
  }
  if (reserved.greaterThan(projectedBalance)) {
    throw new Error("O saldo livre da conta não é suficiente para manter os valores reservados em cofrinhos.");
  }
}

async function getGoalBalance(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  goalId: string,
  excludeMovementId?: string,
) {
  const movements = await transaction.savingsGoalMovement.findMany({
    where: { goalId, id: excludeMovementId ? { not: excludeMovementId } : undefined, workspaceId },
    select: { amount: true, type: true },
  });

  return sumMoney(movements.map(({ amount, type }) => type === "DEPOSIT" ? amount : money(amount).negated()));
}

function movementEffect(type: "DEPOSIT" | "WITHDRAWAL", amount: ReturnType<typeof money>) {
  return type === "DEPOSIT" ? amount : money(amount).negated();
}

export async function createSavingsGoalMovement(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: {
    amount: ReturnType<typeof money>;
    goalId: string;
    movementDate: Date;
    notes: string | null;
    type: "DEPOSIT" | "WITHDRAWAL";
  },
) {
  assertPositiveAmount(input.amount);
  await lockSavingsGoal(transaction, context.workspaceId, input.goalId);
  const goal = await transaction.savingsGoal.findFirstOrThrow({
    where: { id: input.goalId, status: "ACTIVE", workspaceId: context.workspaceId },
  });

  await assertAccountForPerson(transaction, context.workspaceId, goal.personEditorId, goal.accountId);
  if (goal.accountId) {
    await lockFinancialAccounts(transaction, context.workspaceId, [goal.accountId]);
  }
  const projectedGoalBalance = money((await getGoalBalance(transaction, context.workspaceId, goal.id)).plus(movementEffect(input.type, input.amount)));

  if (projectedGoalBalance.isNegative()) {
    throw new Error("Retirada maior que o valor reservado no cofrinho.");
  }
  if (goal.accountId) {
    const accountBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, goal.accountId);
    const projectedReserved = money((await getReservedAccountBalance(transaction, context.workspaceId, goal.accountId)).plus(movementEffect(input.type, input.amount)));
    await assertAccountState(transaction, context.workspaceId, goal.accountId, accountBalance, projectedReserved);
  }
  const movement = await transaction.savingsGoalMovement.create({
    data: {
      accountId: goal.accountId,
      amount: input.amount,
      createdByEditorId: context.editorId,
      goalId: goal.id,
      movementDate: input.movementDate,
      notes: input.notes,
      personEditorId: goal.personEditorId,
      type: input.type,
      workspaceId: context.workspaceId,
    },
  });
  await appendAudit(transaction, context, "SavingsGoalMovement", movement.id, "create", { goalId: goal.id, type: input.type });

  return movement;
}

export async function updateSavingsGoalMovement(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: {
    amount: ReturnType<typeof money>;
    movementDate: Date;
    movementId: string;
    notes: string | null;
    type: "DEPOSIT" | "WITHDRAWAL";
  },
) {
  assertPositiveAmount(input.amount);
  const existing = await transaction.savingsGoalMovement.findFirstOrThrow({
    where: { id: input.movementId, workspaceId: context.workspaceId },
    select: { goalId: true },
  });
  await lockSavingsGoal(transaction, context.workspaceId, existing.goalId);
  const movement = await transaction.savingsGoalMovement.findFirstOrThrow({
    where: { id: input.movementId, workspaceId: context.workspaceId },
    include: { goal: true },
  });
  await assertAccountForPerson(transaction, context.workspaceId, movement.goal.personEditorId, movement.goal.accountId);

  if (movement.goal.accountId) {
    await lockFinancialAccounts(transaction, context.workspaceId, [movement.goal.accountId]);
  }
  const projectedGoalBalance = money((await getGoalBalance(transaction, context.workspaceId, movement.goalId, movement.id)).plus(movementEffect(input.type, input.amount)));

  if (projectedGoalBalance.isNegative()) {
    throw new Error("A alteração deixaria o cofrinho com saldo negativo.");
  }
  if (movement.goal.accountId) {
    const accountBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, movement.goal.accountId);
    const projectedReserved = money((await getReservedAccountBalance(transaction, context.workspaceId, movement.goal.accountId, movement.id)).plus(movementEffect(input.type, input.amount)));
    await assertAccountState(transaction, context.workspaceId, movement.goal.accountId, accountBalance, projectedReserved);
  }
  const updated = await transaction.savingsGoalMovement.update({
    where: { id: movement.id },
    data: { amount: input.amount, movementDate: input.movementDate, notes: input.notes, type: input.type },
  });
  await appendAudit(transaction, context, "SavingsGoalMovement", movement.id, "update", { before: movement });

  return updated;
}

export async function deleteSavingsGoalMovement(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  movementId: string,
) {
  const existing = await transaction.savingsGoalMovement.findFirstOrThrow({
    where: { id: movementId, workspaceId: context.workspaceId },
    select: { goalId: true },
  });
  await lockSavingsGoal(transaction, context.workspaceId, existing.goalId);
  const movement = await transaction.savingsGoalMovement.findFirstOrThrow({
    where: { id: movementId, workspaceId: context.workspaceId },
    include: { goal: true },
  });

  if (movement.goal.accountId) {
    await lockFinancialAccounts(transaction, context.workspaceId, [movement.goal.accountId]);
  }
  const projectedGoalBalance = await getGoalBalance(transaction, context.workspaceId, movement.goalId, movement.id);

  if (projectedGoalBalance.isNegative()) {
    throw new Error("Excluir este movimento deixaria o cofrinho com saldo negativo.");
  }
  if (movement.goal.accountId) {
    const accountBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, movement.goal.accountId);
    const projectedReserved = await getReservedAccountBalance(transaction, context.workspaceId, movement.goal.accountId, movement.id);
    await assertAccountState(transaction, context.workspaceId, movement.goal.accountId, accountBalance, projectedReserved);
  }
  await appendAudit(transaction, context, "SavingsGoalMovement", movement.id, "delete", { before: movement });
  await transaction.savingsGoalMovement.delete({ where: { id: movement.id } });
}

async function getActiveTransferAccounts(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  sourceAccountId: string,
  destinationAccountId: string,
) {
  if (sourceAccountId === destinationAccountId) {
    throw new Error("A conta de destino deve ser diferente da conta de origem.");
  }
  await lockFinancialAccounts(transaction, workspaceId, [sourceAccountId, destinationAccountId]);
  const accounts = await transaction.financialAccount.findMany({
    where: { active: true, id: { in: [sourceAccountId, destinationAccountId] }, workspaceId },
    select: { id: true, personEditorId: true },
  });
  const source = accounts.find(({ id }) => id === sourceAccountId);
  const destination = accounts.find(({ id }) => id === destinationAccountId);

  if (!source || !destination) {
    throw new Error("As contas de origem e destino precisam estar ativas e pertencer ao mesmo espaço.");
  }

  return { destination, source };
}

async function assertTransferProjection(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  accountIds: string[],
  deltas: Map<string, ReturnType<typeof money>>,
  transferId?: string,
) {
  for (const accountId of [...new Set(accountIds)]) {
    const currentBalance = await getTransactionalAccountBalance(transaction, workspaceId, accountId, { transferId });
    const projectedBalance = money(currentBalance.plus(deltas.get(accountId) ?? 0));
    await assertAccountState(transaction, workspaceId, accountId, projectedBalance);
  }
}

export async function createTransfer(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { amount: ReturnType<typeof money>; destinationAccountId: string; notes: string | null; sourceAccountId: string; transferDate: Date },
) {
  assertPositiveAmount(input.amount);
  const { destination, source } = await getActiveTransferAccounts(transaction, context.workspaceId, input.sourceAccountId, input.destinationAccountId);
  await assertTransferProjection(
    transaction,
    context.workspaceId,
    [source.id, destination.id],
    new Map([[source.id, money(input.amount).negated()], [destination.id, input.amount]]),
  );
  const transfer = await transaction.transfer.create({
    data: {
      amount: input.amount,
      createdByEditorId: context.editorId,
      destinationAccountId: destination.id,
      destinationPersonEditorId: destination.personEditorId,
      notes: input.notes,
      sourceAccountId: source.id,
      sourcePersonEditorId: source.personEditorId,
      transferDate: input.transferDate,
      workspaceId: context.workspaceId,
    },
  });
  await appendAudit(transaction, context, "Transfer", transfer.id, "create");

  return transfer;
}

export async function updateTransfer(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { amount: ReturnType<typeof money>; destinationAccountId: string; expectedVersion: number; notes: string | null; sourceAccountId: string; transferDate: Date; transferId: string },
) {
  assertPositiveAmount(input.amount);
  const current = await transaction.transfer.findFirstOrThrow({ where: { id: input.transferId, workspaceId: context.workspaceId } });
  await lockFinancialAccounts(transaction, context.workspaceId, [current.sourceAccountId, current.destinationAccountId, input.sourceAccountId, input.destinationAccountId]);
  const { destination, source } = await getActiveTransferAccounts(transaction, context.workspaceId, input.sourceAccountId, input.destinationAccountId);
  await assertTransferProjection(
    transaction,
    context.workspaceId,
    [current.sourceAccountId, current.destinationAccountId, source.id, destination.id],
    new Map([[source.id, money(input.amount).negated()], [destination.id, input.amount]]),
    current.id,
  );
  const { count } = await transaction.transfer.updateMany({
    where: { id: current.id, version: input.expectedVersion, workspaceId: context.workspaceId },
    data: {
      amount: input.amount,
      destinationAccountId: destination.id,
      destinationPersonEditorId: destination.personEditorId,
      notes: input.notes,
      sourceAccountId: source.id,
      sourcePersonEditorId: source.personEditorId,
      transferDate: input.transferDate,
      version: { increment: 1 },
    },
  });
  assertOptimisticUpdate(count);
  await appendAudit(transaction, context, "Transfer", current.id, "update", { before: current });
}

export async function deleteTransfer(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  transferId: string,
) {
  const current = await transaction.transfer.findFirstOrThrow({ where: { id: transferId, workspaceId: context.workspaceId } });
  await lockFinancialAccounts(transaction, context.workspaceId, [current.sourceAccountId, current.destinationAccountId]);
  await assertTransferProjection(transaction, context.workspaceId, [current.sourceAccountId, current.destinationAccountId], new Map(), current.id);
  await appendAudit(transaction, context, "Transfer", current.id, "delete", { before: current });
  await transaction.transfer.delete({ where: { id: current.id } });
}

async function getActiveAdjustmentAccount(transaction: Prisma.TransactionClient, workspaceId: string, accountId: string) {
  await lockFinancialAccounts(transaction, workspaceId, [accountId]);
  return transaction.financialAccount.findFirstOrThrow({
    where: { active: true, id: accountId, workspaceId },
    select: { id: true, personEditorId: true },
  });
}

export async function createBalanceAdjustment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { accountId: string; effectiveAt: Date; notes: string | null; targetBalance: ReturnType<typeof money> },
) {
  const account = await getActiveAdjustmentAccount(transaction, context.workspaceId, input.accountId);
  const previousBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, account.id);
  await assertAccountState(transaction, context.workspaceId, account.id, input.targetBalance);
  const adjustment = await transaction.balanceAdjustment.create({
    data: {
      accountId: account.id,
      createdByEditorId: context.editorId,
      difference: money(input.targetBalance.minus(previousBalance)),
      effectiveAt: input.effectiveAt,
      notes: input.notes,
      personEditorId: account.personEditorId,
      previousBalance,
      targetBalance: input.targetBalance,
      workspaceId: context.workspaceId,
    },
  });
  await appendAudit(transaction, context, "BalanceAdjustment", adjustment.id, "create");

  return adjustment;
}

export async function updateBalanceAdjustment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  input: { adjustmentId: string; effectiveAt: Date; notes: string | null; targetBalance: ReturnType<typeof money> },
) {
  const current = await transaction.balanceAdjustment.findFirstOrThrow({
    where: { id: input.adjustmentId, workspaceId: context.workspaceId },
  });
  await getActiveAdjustmentAccount(transaction, context.workspaceId, current.accountId);
  const previousBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, current.accountId, { adjustmentId: current.id });
  await assertAccountState(transaction, context.workspaceId, current.accountId, input.targetBalance);
  const updated = await transaction.balanceAdjustment.update({
    where: { id: current.id },
    data: {
      difference: money(input.targetBalance.minus(previousBalance)),
      effectiveAt: input.effectiveAt,
      notes: input.notes,
      previousBalance,
      targetBalance: input.targetBalance,
    },
  });
  await appendAudit(transaction, context, "BalanceAdjustment", current.id, "update", { before: current });

  return updated;
}

export async function deleteBalanceAdjustment(
  transaction: Prisma.TransactionClient,
  context: AuditContext,
  adjustmentId: string,
) {
  const current = await transaction.balanceAdjustment.findFirstOrThrow({ where: { id: adjustmentId, workspaceId: context.workspaceId } });
  await lockFinancialAccounts(transaction, context.workspaceId, [current.accountId]);
  const projectedBalance = await getTransactionalAccountBalance(transaction, context.workspaceId, current.accountId, { adjustmentId: current.id });
  await assertAccountState(transaction, context.workspaceId, current.accountId, projectedBalance);
  await appendAudit(transaction, context, "BalanceAdjustment", current.id, "delete", { before: current });
  await transaction.balanceAdjustment.delete({ where: { id: current.id } });
}
