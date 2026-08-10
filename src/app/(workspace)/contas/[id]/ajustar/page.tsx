import type Decimal from "decimal.js";
import { notFound } from "next/navigation";

import { AccountBalanceAdjustmentForm } from "@/components/account-balance-adjustment-form";
import { getDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { adjustAccountBalanceAction } from "@/modules/accounts/application/account-actions";
import { calculateCurrentAccountBalance } from "@/modules/accounts/application/calculate-account-balance";

function centsFromDecimal(value: Decimal) {
  return value.times(100).toFixed(0);
}

export default async function AdjustAccountBalancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireCurrentAccess();
  const { id } = await params;
  const database = getDatabase();
  const account = await database.financialAccount.findFirst({
    where: { active: true, id, workspaceId: access.workspaceId },
    select: { id: true, name: true, version: true },
  });

  if (!account) {
    notFound();
  }

  const currentBalance = await calculateCurrentAccountBalance(database, access.workspaceId, account.id);

  if (!currentBalance) {
    notFound();
  }

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Contas</p>
          <h1>Ajustar saldo atual</h1>
          <p>Concilie a conta com o saldo real sem alterar movimentações anteriores.</p>
        </div>
      </section>

      <AccountBalanceAdjustmentForm
        accountId={account.id}
        accountName={account.name}
        action={adjustAccountBalanceAction}
        currentBalanceCents={centsFromDecimal(currentBalance)}
        currentBalanceLabel={formatCurrency(currentBalance)}
        version={account.version}
      />
    </>
  );
}