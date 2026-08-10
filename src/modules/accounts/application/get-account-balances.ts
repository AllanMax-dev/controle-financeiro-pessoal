import { getDatabase } from "@/lib/db";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculateAccountBalances } from "@/modules/transactions/domain/financial-summary";

export async function getAccountBalances(
  workspaceId: string,
  synchronize = true,
  contextId?: string,
) {
  const database = getDatabase();
  if (synchronize) {
    await synchronizeDueFixedExpenses(workspaceId, new Date(), contextId);
  }
  const [accounts, transactions, transfers, adjustments] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId, ...(contextId ? { contextId } : {}) },
      include: {
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
        financialContext: { select: { id: true, name: true, type: true } },
        ownerEditor: { select: { displayName: true, id: true } },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    database.transaction.findMany({
      where: {
        workspaceId,
        ...(contextId ? { contextId } : {}),
        status: "SETTLED",
        affectsBalance: true,
      },
      select: { accountId: true, affectsBalance: true, amount: true, status: true, type: true },
    }),
    database.transfer.findMany({
      where: {
        workspaceId,
        status: "SETTLED",
        ...(contextId
          ? { OR: [{ sourceContextId: contextId }, { destinationContextId: contextId }] }
          : {}),
      },
      select: {
        amount: true,
        destinationAccountId: true,
        sourceAccountId: true,
        status: true,
      },
    }),
    database.accountBalanceAdjustment.findMany({
      where: { workspaceId, ...(contextId ? { contextId } : {}) },
      select: { accountId: true, difference: true },
      orderBy: { effectiveAt: "asc" },
    }),
  ]);

  const balances = calculateAccountBalances(accounts, transactions, transfers, adjustments);
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
    const key = account.contextId;
    const current = ownerGroups.get(key) ?? {
      accounts: [],
      availableBalance: money(0),
      investmentBalance: money(0),
      key,
      label: account.financialContext.name,
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
