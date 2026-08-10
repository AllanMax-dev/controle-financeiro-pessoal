import { Prisma } from "@/generated/prisma/client";
import { money } from "@/modules/shared/domain/money";
import { calculateAccountBalances } from "@/modules/transactions/domain/financial-summary";

type AccountBalanceClient = Pick<
  Prisma.TransactionClient,
  "accountBalanceAdjustment" | "financialAccount" | "transaction" | "transfer"
>;

export async function calculateCurrentAccountBalance(
  database: AccountBalanceClient,
  workspaceId: string,
  accountId: string,
) {
  const account = await database.financialAccount.findFirst({
    where: { id: accountId, workspaceId },
    select: { id: true, initialBalance: true },
  });

  if (!account) {
    return null;
  }

  const [transactions, transfers, adjustments] = await Promise.all([
    database.transaction.findMany({
      where: { accountId, workspaceId, status: "SETTLED", affectsBalance: true },
      select: { accountId: true, affectsBalance: true, amount: true, status: true, type: true },
    }),
    database.transfer.findMany({
      where: {
        status: "SETTLED",
        workspaceId,
        OR: [{ sourceAccountId: accountId }, { destinationAccountId: accountId }],
      },
      select: {
        amount: true,
        destinationAccountId: true,
        sourceAccountId: true,
        status: true,
      },
    }),
    database.accountBalanceAdjustment.findMany({
      where: { accountId, workspaceId },
      select: { accountId: true, difference: true },
      orderBy: { effectiveAt: "asc" },
    }),
  ]);
  const balances = calculateAccountBalances([account], transactions, transfers, adjustments);

  return balances.get(account.id) ?? money(account.initialBalance);
}