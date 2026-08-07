import { getDatabase } from "@/lib/db";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculateAccountBalances } from "@/modules/transactions/domain/financial-summary";

export async function getAccountBalances(workspaceId: string, synchronize = true) {
  const database = getDatabase();
  if (synchronize) {
    await synchronizeDueFixedExpenses(workspaceId);
  }
  const [accounts, transactions, transfers] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: {
            fixedExpenses: true,
            incoming: true,
            outgoing: true,
            salaries: true,
            transactions: true,
          },
        },
        ownerEditor: { select: { displayName: true, id: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    database.transaction.findMany({
      where: { workspaceId, status: "SETTLED", affectsBalance: true },
      select: { accountId: true, affectsBalance: true, amount: true, status: true, type: true },
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
  const accountsWithBalances = accounts.map((account) => ({
    ...account,
    balance: balances.get(account.id) ?? money(account.initialBalance),
  }));
  const activeAccounts = accountsWithBalances.filter(({ active }) => active);
  const archivedAccounts = accountsWithBalances.filter(({ active }) => !active);
  const availableAccounts = activeAccounts.filter(({ type }) => type !== "INVESTMENT");
  const investmentAccounts = activeAccounts.filter(({ type }) => type === "INVESTMENT");
  const availableBalance = sumMoney(availableAccounts.map(({ balance }) => balance));
  const investmentBalance = sumMoney(investmentAccounts.map(({ balance }) => balance));
  const totalBalance = money(availableBalance.plus(investmentBalance));
  const ownerGroups = new Map<
    string,
    {
      accounts: typeof activeAccounts;
      availableBalance: ReturnType<typeof money>;
      investmentBalance: ReturnType<typeof money>;
      key: string;
      label: string;
      totalBalance: ReturnType<typeof money>;
    }
  >();

  for (const account of activeAccounts) {
    const key = account.ownerEditorId ?? "shared";
    const current = ownerGroups.get(key) ?? {
      accounts: [],
      availableBalance: money(0),
      investmentBalance: money(0),
      key,
      label: account.ownerEditor?.displayName ?? "Casal / compartilhadas",
      totalBalance: money(0),
    };

    current.accounts.push(account);

    if (account.type === "INVESTMENT") {
      current.investmentBalance = money(current.investmentBalance.plus(account.balance));
    } else {
      current.availableBalance = money(current.availableBalance.plus(account.balance));
    }

    current.totalBalance = money(current.availableBalance.plus(current.investmentBalance));
    ownerGroups.set(key, current);
  }

  return {
    accounts: accountsWithBalances,
    activeAccounts,
    archivedAccounts,
    availableBalance,
    investmentBalance,
    investmentAccounts,
    ownerGroups: [...ownerGroups.values()],
    totalBalance,
  };
}
