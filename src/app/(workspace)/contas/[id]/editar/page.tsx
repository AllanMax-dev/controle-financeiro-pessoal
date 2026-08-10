import { notFound } from "next/navigation";

import { AccountForm } from "@/components/account-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { updateAccountAction } from "@/modules/accounts/application/account-actions";
import { getAccessibleFinancialContexts } from "@/modules/financial-contexts/application/financial-contexts";

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireCurrentAccess();
  const accessibleContextIds = (await getAccessibleFinancialContexts(access)).map(({ id }) => id);
  const { id } = await params;
  const database = getDatabase();
  const account = await database.financialAccount.findFirst({
    where: { contextId: { in: accessibleContextIds }, id, workspaceId: access.workspaceId },
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
    },
  });

  if (!account) {
    notFound();
  }

  const hasFinancialHistory =
    account._count.balanceAdjustments +
      account._count.fixedExpenses +
      account._count.incoming +
      account._count.outgoing +
      account._count.salaries +
      account._count.transactions >
    0;

  const editors = await database.editor.findMany({
    where: {
      workspaceId: access.workspaceId,
      OR: account.ownerEditorId
        ? [{ active: true }, { id: account.ownerEditorId }]
        : [{ active: true }],
    },
    select: { displayName: true, id: true },
    orderBy: { displayName: "asc" },
  });

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Contas</p>
          <h1>Editar conta</h1>
          <p>Alterações de saldo inicial afetam o saldo consolidado.</p>
        </div>
      </section>
      <AccountForm
        action={updateAccountAction}
        defaults={{
          color: account.color ?? "#256b4b",
          contextId: account.contextId,
          id: account.id,
          initialBalance: account.initialBalance.toFixed(2).replace(".", ","),
          name: account.name,
          ownerEditorId: account.ownerEditorId,
          type: account.type,
          version: account.version,
        }}
        initialBalanceLocked={hasFinancialHistory}
        typeLocked={hasFinancialHistory}
        editors={editors}
        submitLabel="Salvar alterações"
      />
    </>
  );
}
