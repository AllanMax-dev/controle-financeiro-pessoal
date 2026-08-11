import { getDatabase } from "@/lib/db";
import {
  financialContextWhere,
  type FinancialContextFilter,
} from "@/modules/financial-contexts/application/financial-contexts";
import {
  calendarDateInTimeZone,
  fixedExpenseOccurrencesThrough,
  monthStart,
} from "@/modules/fixed-expenses/domain/fixed-expense-schedule";

/**
 * Materializa os compromissos pendentes já vencidos das despesas fixas.
 *
 * A restrição única (fixedExpenseId, recurrenceMonth) torna a operação
 * idempotente e segura quando duas páginas tentam sincronizar ao mesmo tempo.
 * Ocorrências já registradas manualmente não são sobrescritas.
 */
export async function synchronizeDueFixedExpenses(
  workspaceId: string,
  referenceDate = new Date(),
  scope?: FinancialContextFilter,
): Promise<Date> {
  const database = getDatabase();
  const workspace = await database.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { timezone: true },
  });
  const calendarDate = calendarDateInTimeZone(referenceDate, workspace.timezone);
  const currentMonth = monthStart(calendarDate);
  const fixedExpenses = await database.fixedExpense.findMany({
    where: {
      active: true,
      ...financialContextWhere(scope),
      startMonth: { lte: currentMonth },
      workspaceId,
    },
    select: {
      accountId: true,
      amount: true,
      categoryId: true,
      contextId: true,
      description: true,
      dueDay: true,
      id: true,
      notes: true,
      startMonth: true,
    },
  });

  if (fixedExpenses.length === 0) {
    return calendarDate;
  }

  const existingOccurrences = await database.transaction.findMany({
    where: {
      fixedExpenseId: { in: fixedExpenses.map(({ id }) => id) },
      recurrenceMonth: { lte: currentMonth },
      workspaceId,
    },
    select: { fixedExpenseId: true, recurrenceMonth: true },
  });
  const existingKeys = new Set(
    existingOccurrences.map(({ fixedExpenseId, recurrenceMonth }) =>
      `${fixedExpenseId}:${recurrenceMonth?.toISOString()}`,
    ),
  );

  const occurrences = fixedExpenses.flatMap((fixedExpense) =>
    fixedExpenseOccurrencesThrough(
      fixedExpense.startMonth,
      fixedExpense.dueDay,
      calendarDate,
    )
      .filter(
        ({ month }) => !existingKeys.has(`${fixedExpense.id}:${month.toISOString()}`),
      )
      .map(({ dueDate, month }) => ({
      accountId: fixedExpense.accountId,
      affectsBalance: false,
      amount: fixedExpense.amount,
      categoryId: fixedExpense.categoryId,
      competenceDate: dueDate,
      contextId: fixedExpense.contextId,
      description: fixedExpense.description,
        dueDate,
        fixedExpenseId: fixedExpense.id,
        notes: fixedExpense.notes,
        recurrenceMonth: month,
        settledAt: null,
        status: "PENDING" as const,
        type: "EXPENSE" as const,
        workspaceId,
      })),
  );

  if (occurrences.length === 0) {
    return calendarDate;
  }

  await database.transaction.createMany({
    data: occurrences,
    skipDuplicates: true,
  });

  return calendarDate;
}
