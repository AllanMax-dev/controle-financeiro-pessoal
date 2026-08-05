import { getDatabase } from "@/lib/db";
import {
  calculateAccountBalances,
  calculateConsolidatedBalance,
} from "@/modules/transactions/domain/financial-summary";

export async function getAccountBalances(workspaceId: string) {
  const database = getDatabase();
  const [accounts, transactions, transfers] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    database.transaction.findMany({
      where: { workspaceId, status: "SETTLED" },
      select: { accountId: true, amount: true, status: true, type: true },
    }),
    database.transfer.findMany({
      where: { workspaceId, status: "SETTLED" },
      select: {
        amount: true,
        destinationAccountId: true,
        sourceAccountId: true,
        status: true,
      },
    }),
  ]);

  const balances = calculateAccountBalances(accounts, transactions, transfers);

  return {
    accounts: accounts.map((account) => ({
      ...account,
      balance: balances.get(account.id) ?? account.initialBalance,
    })),
    totalBalance: calculateConsolidatedBalance(balances),
  };
}
